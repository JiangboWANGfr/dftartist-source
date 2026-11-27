#include "InstanceQueries.h"
#include "ConnectionRefs.h"
#include "InstanceDescription.h"
#include "OccurrencePorts.h"
#include <algorithm>
#include <unordered_set>

namespace hier::detail {
using namespace model;
Result<db::Located> locateInstance(const db::DesignDb &db, std::string_view ref,
                                    model::InstKey &key, Cancel cancel) {
    auto parsed = parseInstRef(ref);
    if (!parsed)
        return Error{ErrorCode::BadRequest, "not an instance reference: " + std::string(ref)};
    key = *parsed;
    return db.locate(key, cancel);
}

Result<model::InstInfo> instance(const db::DesignDb &db, std::string_view ref, Cancel cancel) try {
    detail::checkpoint(cancel);
    InstKey key;
    auto at = locateInstance(db, ref, key, cancel);
    if (!at)
        return at.error();
    return describeInstance(db, key, *at, cancel);
} catch (const Error &error) {
    return error;
}

namespace {
// Declaration pointers borrow the immutable DB skeleton. The optional lease pins
// parent bindings through the projection, including with a zero-byte cache.
struct PortSource {
    const BodySkeleton *body = nullptr;
    const ChildSlot *slot = nullptr;
    std::shared_ptr<const BodyConnections> parent;

    size_t size() const { return body ? body->ports.size() : slot->blackboxPins.size(); }
    const std::string &name(size_t index) const {
        return body ? body->ports[index].name : slot->blackboxPins[index];
    }
    std::vector<PortInfo> materialize(const InstKey &key, Cancel cancel) const {
        return body ? occurrencePorts(*body, key, cancel)
                    : occurrencePorts(*slot, key, parent ? std::span<const PinBinding>(parent->bindings)
                                                        : std::span<const PinBinding>{}, cancel);
    }
};
Result<PortSource> portSource(const db::DesignDb &db, std::string_view ref,
                              InstKey &key, Cancel cancel) {
    checkpoint(cancel);
    auto at = locateInstance(db, ref, key, cancel);
    if (!at)
        return at.error();
    if (at->body != kNoBody)
        return PortSource{checked(db.skeleton(at->body, cancel)), nullptr, {}};
    // Preserve ports()'s original parent-extraction/unknown-declaration boundary,
    // even when object() only needs a name. Cancellation still wins after load.
    auto bound = [&]() -> Result<std::shared_ptr<const BodyConnections>> {
        try {
            return db.connections(at->steps.back().parentBody, cancel);
        } catch (const Error &error) {
            return error;
        }
    }();
    checkpoint(cancel);
    return PortSource{nullptr, at->steps.back().slot,
                      bound ? *bound : std::shared_ptr<const BodyConnections>{}};
}
} // namespace

Result<std::vector<model::PortInfo>> ports(const db::DesignDb &db, std::string_view ref, Cancel cancel) try {
    InstKey key;
    auto source = portSource(db, ref, key, cancel);
    if (!source)
        return source.error();
    return source->materialize(key, cancel);
} catch (const Error &error) {
    return error;
}

Result<std::vector<model::ParamInfo>> params(const db::DesignDb &db, std::string_view ref, Cancel cancel) try {
    detail::checkpoint(cancel);
    InstKey key;
    auto at = locateInstance(db, ref, key, cancel);
    if (!at)
        return at.error();
    if (at->body == kNoBody)
        return std::vector<ParamInfo>{};
    std::vector<ParamInfo> out = detail::checked(db.skeleton(at->body, cancel))->params;
    if (!at->steps.empty()) {
        auto &overridden = at->steps.back().slot->overriddenParams;
        // Only membership metadata borrows the original slot names; the result
        // remains the original owning vector, in declaration order. Small lists
        // avoid a table. Neither threshold limits the supported input size.
        if (out.size() <= 8 || overridden.size() <= 8) {
            for (auto &p : out) {
                checkpoint(cancel);
                p.isOverridden = std::any_of(overridden.begin(), overridden.end(), [&](const auto &name) {
                    checkpoint(cancel);
                    return name == p.name;
                });
            }
        } else {
            std::unordered_set<std::string_view> names;
            bool indexed = false;
            size_t work = 0;
            for (size_t i = 0; i < out.size(); ++i) {
                checkpoint(cancel);
                auto &p = out[i];
                if (indexed) {
                    p.isOverridden = names.contains(p.name);
                    continue;
                }
                size_t comparisons = 0;
                p.isOverridden = std::any_of(overridden.begin(), overridden.end(), [&](const auto &name) {
                    checkpoint(cancel);
                    ++comparisons;
                    return name == p.name;
                });
                // Do not index large override tables whose names keep matching
                // near the front. Saturate the observed work without overflow.
                work += std::min(comparisons, overridden.size() - work);
                if (work == overridden.size() && comparisons > 8 && out.size() - i - 1 > 8) {
                    names.reserve(overridden.size());
                    for (const auto &name : overridden) {
                        checkpoint(cancel);
                        names.insert(name);
                    }
                    indexed = true;
                }
            }
        }
    }
    return out;
} catch (const Error &error) {
    return error;
}

Result<model::ObjectInfo> object(const db::DesignDb &db, std::string_view ref, Cancel cancel) try {
    detail::checkpoint(cancel);
    if (ref.starts_with("i:")) {
        auto i = instance(db, ref, cancel);
        if (!i)
            return i.error();
        return ObjectInfo{i->ref, "instance", i->name, i->ref, i->pathText};
    }
    auto key = detail::parseObject(ref);
    if (!key)
        return Error{ErrorCode::BadRequest, "malformed object reference"};
    auto at = db.locate(key->inst, cancel);
    if (!at)
        return at.error();
    auto inst = describeInstance(db, key->inst, *at, cancel);
    ObjectInfo o{std::string(ref), "", "", inst.ref, inst.pathText};
    if (key->kind == 'p') {
        InstKey portKey;
        auto source = portSource(db, inst.ref, portKey, cancel);
        if (!source)
            return source.error();
        checkpoint(cancel);
        if (key->index >= source->size())
            return Error{ErrorCode::NotFound, "no such port"};
        o.kind = "port";
        o.name = source->name(key->index);
    } else {
        if (at->body == kNoBody)
            return Error{ErrorCode::NotFound, "object has no body"};
        auto facts = detail::checked(db.connections(at->body, cancel));
        if (key->kind == 's') {
            if (key->index >= facts->signals.size())
                return Error{ErrorCode::NotFound, "no such signal"};
            o.kind = "signal";
            o.name = facts->signals[key->index].name;
            o.pathText += "." + facts->signals[key->index].localPath;
        }
        if (key->kind == 'x') {
            if (key->index >= facts->processes.size())
                return Error{ErrorCode::NotFound, "no such process"};
            o.kind = "process";
        }
        if (key->kind == 'r') {
            if (key->index >= facts->registers.size())
                return Error{ErrorCode::NotFound, "no such register"};
            o.kind = "register";
        }
    }
    if (!o.name.empty() && o.kind != "signal")
        o.pathText += "." + escapeSegment(o.name, {});
    return o;
} catch (const Error &error) {
    return error;
}
} // namespace hier::detail
