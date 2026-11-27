#include "Step.h"
#include "Observe.h"
#include "ConnectionRefs.h"
#include "Cursor.h"
#include "PartialReasons.h"
#include <algorithm>
#include <array>

namespace hier::detail {
using namespace model;
namespace {
std::optional<BitRange> overlap(BitRange a, BitRange b) {
    const auto lo = std::max(a.lsb, b.lsb), hi = std::min(a.lsb + a.width, b.lsb + b.width);
    if (lo >= hi)
        return {};
    return BitRange{lo, hi - lo};
}
BitRange project(BitRange selected, BitRange source, BitRange target) {
    return {target.lsb + selected.lsb - source.lsb, selected.width};
}
std::string fact(std::string_view kind, std::string_view owner, std::initializer_list<size_t> parts) {
    std::string id = "f:";
    cursorField(id, kind);
    cursorField(id, owner);
    for (auto p : parts)
        cursorField(id, std::to_string(p));
    return id;
}
std::string localRef(const ObjectKey &key, bool outside) {
    return std::string(1, key.kind) + ":" +
           (outside ? std::to_string(key.inst.back()) : "") + ":" + std::to_string(key.index);
}
struct Context {
    const InstKey inst;
    BodyId body;
    const BodySkeleton *skeleton;
    db::IndexedConnections data;
    const ReferenceScope scope;
    Context(InstKey instance, BodyId bodyId, const BodySkeleton *bodySkeleton,
            db::IndexedConnections connections)
        : inst(std::move(instance)), body(bodyId), skeleton(bodySkeleton), data(std::move(connections)),
          scope(inst) {}
};

// Only the current occurrence context and one adjacent context can enter a page.
// Physical BodyId sharing and cache warmth do not change this logical budget.
class StepPage {
  public:
    StepPage(const db::DesignDb &database, ObjectKey object, bool back, Cancel token, bool outsideBinding,
              std::vector<std::optional<StepAnchor>> *anchors)
        : db_(database), key_(std::move(object)), upstream_(back), cancel_(token),
          outsideBinding_(outsideBinding), anchors_(anchors) {}

    Result<QueryResult<StepResult>> run(const ConnectionRequest &request, const StepLimit &limit) {
        auto located = db_.locate(key_.inst, cancel_);
        if (!located)
            return located.error();
        const bool outside = key_.kind == 'p' && request.side == "outside";
        const bool bodiless = located->body == kNoBody;
        if (key_.kind == 's' && bodiless)
            return Error{ErrorCode::NotFound, "instance has no signals"};
        InstKey context = key_.inst;
        BodyId body = located->body;
        if (outside || bodiless) {
            body = located->steps.back().parentBody;
            context.pop_back();
        }
        auto loaded = load(context, body);
        if (!loaded)
            return loaded.error();
        auto &current = *contexts_[0];
        local_ = localRef(key_, outside || bodiless);
        source_ = current.scope.qualify(local_);
        uint64_t width = 0;
        std::string unavailable;
        if (key_.kind == 's') {
            if (key_.index >= current.data.facts->signals.size())
                return Error{ErrorCode::NotFound, "no such signal"};
            const auto &signal = current.data.facts->signals[key_.index];
            width = signal.width;
            if (signal.opaque) {
                width = 0;
                unavailable = "unsupported";
            }
        } else if (outside || bodiless) {
            auto pin = current.data.index->bindings.find(local_);
            if (pin == current.data.index->bindings.end())
                return Error{ErrorCode::NotFound, "no such port"};
            const auto &binding = current.data.facts->bindings[pin->second];
            width = binding.width.value_or(0);
            if (!binding.unresolved.empty())
                unavailable = binding.unresolved;
            if (!width && unavailable.empty())
                unavailable = "unknown_pin_width";
            if (width && binding.direction == "unknown")
                unavailable = "blackbox";
            if (bodiless && !outside && unavailable.empty())
                unavailable = located->steps.back().slot->kind == InstKind::Primitive
                                  ? "unsupported" : "blackbox";
            if (bodiless && outside && unavailable.empty()) {
                // When entering an opaque cell, stop at its known outside pin.
                // When leaving it, inspect only the requested outside binding.
                const bool enters = binding.direction == (upstream_ ? "out" : "in") ||
                                    binding.direction == "inout" || binding.direction == "ref";
                if (enters && !outsideBinding_) {
                    boundary_ = located->steps.back().slot->kind == InstKind::Primitive
                                    ? "primitive_pin" : "blackbox_pin";
                    boundaryCell_ = binding.cell;
                }
            }
        } else {
            if (key_.index >= current.skeleton->ports.size())
                return Error{ErrorCode::NotFound, "no such port"};
            width = current.skeleton->ports[key_.index].width;
            const auto &internal = current.data.facts->internals.at(key_.index);
            if (internal.kind == "unresolved")
                unavailable = internal.reason.empty() ? "unsupported" : internal.reason;
        }
        if (current.skeleton->kind == InstKind::Interface)
            unavailable = "interface_port";
        bits_ = request.bits.value_or(BitRange{0, width});
        if (request.bits && (!width || bits_.lsb >= width || bits_.width > width - bits_.lsb))
            return Error{ErrorCode::BadRequest, "slice is outside the object bit space"};
        if (!width && unavailable.empty())
            unavailable = key_.kind == 'p' ? "unknown_pin_width" : "unsupported";

        std::string query;
        for (const auto &field : {source_, request.side, upstream_ ? std::string("back") : std::string("forward"),
                                  std::to_string(bits_.lsb), std::to_string(bits_.width)})
            cursorField(query, field);
        auto saved = readCursor(limit.cursor, "step", db_.snapshotId(), query, 2);
        if (!saved)
            return saved.error();
        position_ = {(*saved)[0], (*saved)[1]};
        if (!unavailable.empty() || !boundary_.empty()) {
            if (position_[0] || position_[1])
                return Error{ErrorCode::BadRequest, "cursor past a terminal step"};
            auto h = hop(source_, bits_, fact("terminal", source_, {}));
            if (!unavailable.empty())
                unresolved(h, unavailable, source_);
            else {
                terminal(h, boundary_, source_, bits_, "outside");
                h.cell = boundaryCell_;
            }
            append(std::move(h));
            return finish();
        }
        const auto list = current.data.index->find(local_, upstream_);
        if (position_[0] > (list ? list->entries.size() : 0))
            return Error{ErrorCode::BadRequest, "cursor past the connection list"};
        if (position_[1] && (!list || position_[0] == list->entries.size() ||
            (list->entries[position_[0]].kind != db::ConnectionKind::OwnPort &&
             list->entries[position_[0]].kind != db::ConnectionKind::ChildPin)))
            return Error{ErrorCode::BadRequest, "cursor has no binding segment"};
        while (list) {
            if (cancel_.stop_requested())
                return Error{ErrorCode::Cancelled, "step cancelled"};
            auto next = list->next(position_[0], bits_, cancel_);
            if (!next)
                return next.error();
            if (*next == db::noEntry)
                break;
            if (*next != position_[0]) {
                position_[0] = *next;
                position_[1] = 0;
            }
            if (answer_.result.hops.size() == size_t(limit.maxHops)) {
                truncated_ = true;
                break;
            }
            auto produced = emit(list->entries[position_[0]]);
            if (!produced)
                return produced.error();
            if (truncated_)
                break;
        }
        if (truncated_) {
            answer_.result.next = makeCursor("step", db_.snapshotId(), query,
                                               {position_[0], position_[1]});
            reasons_.append("budget_nodes", source_);
        }
        return finish();
    }

  private:
    const db::DesignDb &db_;
    ObjectKey key_;
    bool upstream_;
    Cancel cancel_;
    bool outsideBinding_;
    std::vector<std::optional<StepAnchor>> *anchors_;
    std::array<std::optional<Context>, 2> contexts_{};
    size_t contextCount_ = 0;
    std::string source_, local_, boundary_;
    std::optional<CellInfo> boundaryCell_;
    BitRange bits_;
    std::array<size_t, 2> position_{};
    bool truncated_ = false;
    QueryResult<StepResult> answer_;
    PartialReasons reasons_{answer_.completeness, [this] {
        if (cancel_.stop_requested())
            throw Error{ErrorCode::Cancelled, "step cancelled"};
    }};

    Result<QueryResult<StepResult>> finish() {
        if (cancel_.stop_requested())
            return Error{ErrorCode::Cancelled, "step cancelled"};
        reasons_.release();
        return std::move(answer_);
    }
    Result<Context *> load(const InstKey &key, BodyId body) {
        if (cancel_.stop_requested())
            return Error{ErrorCode::Cancelled, "step cancelled"};
        for (size_t i = 0; i < contextCount_; ++i)
            if (contexts_[i]->inst == key)
                return &*contexts_[i];
        if (contextCount_ == contexts_.size()) {
            truncated_ = true;
            return static_cast<Context *>(nullptr);
        }
        observation::emit({observation::Kind::StepBodyAdmitted, body, 1, key});
        if (cancel_.stop_requested())
            return Error{ErrorCode::Cancelled, "step cancelled"};
        auto sk = db_.skeleton(body, cancel_);
        if (!sk)
            return sk.error();
        auto data = db_.indexedConnections(body, cancel_);
        if (!data)
            return data.error();
        auto &out = contexts_[contextCount_++];
        out.emplace(key, body, *sk, std::move(*data));
        return &*out;
    }
    Hop hop(const std::string &via, BitRange from, std::string identity) const {
        observation::emit({observation::Kind::HopMaterialize});
        Hop h;
        h.from = {source_, from};
        h.via = via;
        h.fact = std::move(identity);
        return h;
    }
    void unresolved(Hop &h, const std::string &reason, const std::string &at) {
        h.kind = "unresolved";
        h.reason = reason;
        h.via = at;
        h.fact = fact("reason:" + reason, at, {});
        reasons_.append(reason, at);
    }
    void terminal(Hop &h, const std::string &kind, const std::string &pin, BitRange to,
                   const std::string &side) const {
        h.kind = kind;
        h.at = TracePoint{{pin, to}, side};
        h.map.clear();
        h.map.push_back({h.from.bits.lsb, to.lsb, to.width});
    }
    void continuation(Hop &h, const std::string &ref, BitRange to, const std::string &role = "data",
                       const std::string &precision = "exact", const std::string &align = "bitwise",
                       std::optional<std::string> side = {}) const {
        Continuation next;
        next.from = h.from.bits;
        next.slice = {ref, to};
        next.side = std::move(side);
        next.role = role;
        next.precision = precision;
        next.align = align;
        if (align == "bitwise")
            next.map.push_back({h.from.bits.lsb, to.lsb, h.from.bits.width});
        h.map = next.map;
        h.next.push_back(std::move(next));
    }
    std::optional<std::string> continuationSide(const std::string &relative, const Context &ctx) const {
        if (!relative.starts_with("p:"))
            return {};
        // Parent-side port_expr dependencies lead to the child's inside. Opaque
        // cells have only an outside boundary, consumed as a terminal next step.
        auto parsed = parseObject(ctx.scope.qualify(relative));
        if (parsed && parsed->inst.size() > ctx.inst.size()) {
            const auto &slot = ctx.skeleton->slots.at(parsed->inst.back());
            if (slot.body == kNoBody)
                return "outside";
        }
        return "inside";
    }
    void append(Hop h, std::optional<StepAnchor> anchor = {}) {
        for (const auto &next : h.next)
            answer_.result.hasConservative |= next.precision == "conservative";
        answer_.result.hops.push_back(std::move(h));
        observation::emit({observation::Kind::HopEmit, 0, answer_.result.hops.back().next.size()});
        if (anchors_)
            anchors_->push_back(std::move(anchor));
    }
    void advance() {
        ++position_[0];
        position_[1] = 0;
    }
    void target(Hop &h, const BindTarget &t, BitRange targetBits, uint64_t offset,
                 const Context &ctx) {
        if (t.kind == "signal")
            continuation(h, ctx.scope.qualify(t.signal), targetBits);
        else if (t.kind == "expr") {
            // The expression itself is traversed on the port's explicit outside
            // side; an expression is never converted to a direct signal binding.
            continuation(h, h.via, targetBits, "data", "exact", "bitwise", "outside");
        } else if (t.kind == "const") {
            auto digits = std::string_view(t.value);
            auto start = digits.find('b');
            if (start == std::string_view::npos) {
                unresolved(h, "unsupported", h.via);
                return;
            }
            digits.remove_prefix(start + 1);
            if (offset > digits.size() || h.from.bits.width > digits.size() - offset) {
                unresolved(h, "unsupported", h.via);
                return;
            }
            h.kind = "const";
            h.value = std::to_string(h.from.bits.width) + "'b" +
                      std::string(digits.substr(digits.size() - size_t(offset + h.from.bits.width),
                                                size_t(h.from.bits.width)));
        } else if (t.kind == "unconnected")
            h.kind = "unconnected";
        else
            unresolved(h, t.reason.empty() ? "unsupported" : t.reason, h.via);
    }
    Result<bool> emit(const db::ConnectionEntry &e) {
        observation::emit({observation::Kind::StepCandidate});
        if (cancel_.stop_requested())
            return Error{ErrorCode::Cancelled, "step cancelled"};
        auto &ctx = *contexts_[0];
        if (e.kind == db::ConnectionKind::Reason) {
            auto h = hop(ctx.scope.qualify(e.via), bits_, {});
            unresolved(h, e.reason.code, h.via);
            append(std::move(h));
            advance();
            return true;
        }
        const auto selected = overlap(bits_, e.ranges.front());
        if (!selected) {
            advance();
            return true;
        }
        if (e.kind == db::ConnectionKind::Dependency) {
            const auto &proc = ctx.data.facts->processes[e.first].result;
            const auto &write = proc.writes[e.second];
            auto h = hop(ctx.scope.qualify(e.via), *selected,
                          fact("dep", ctx.scope.qualify(proc.ref), {e.second, e.third, e.reg}));
            h.kind = e.reg == db::noEntry ? "process" : "register";
            if (e.third != db::noEntry) {
                const auto &dep = write.deps[e.third];
                const auto &relative = upstream_ ? dep.signal : write.target.ref;
                BitRange from = e.target, to = dep.bits;
                if (dep.align == "bitwise")
                    to = {dep.bits.lsb + e.target.lsb - write.target.bits.lsb, e.target.width};
                if (!upstream_)
                    std::swap(from, to);
                if (dep.align == "bitwise")
                    to = project(*selected, from, to);
                continuation(h, ctx.scope.qualify(relative), to, dep.role, dep.precision,
                             dep.align, continuationSide(relative, ctx));
            }
            append(std::move(h));
            advance();
            return true;
        }
        if (e.kind == db::ConnectionKind::Internal || e.kind == db::ConnectionKind::Outside) {
            const bool internal = e.kind == db::ConnectionKind::Internal;
            BindSegment direct;
            const auto &seg = internal ? db::internalSegment(ctx.data.facts->internals[e.first], e.second, direct)
                                : ctx.data.facts->bindings[e.first].segments[e.second];
            const auto pin = ctx.scope.qualify(e.via);
            auto h = hop(pin, *selected, fact(internal ? "internal" : "external", pin, {e.second}));
            h.kind = internal ? "binding_down" : "binding_up";
            target(h, seg.target, project(*selected, seg.pinBits, seg.target.bits),
                   selected->lsb - seg.pinBits.lsb, ctx);
            append(std::move(h), StepAnchor{{pin, *selected}, internal, !internal});
            advance();
            return true;
        }
        if (e.kind == db::ConnectionKind::OwnPort)
            return upward(e, *selected);
        return downward(e, *selected);
    }
    Result<bool> upward(const db::ConnectionEntry &e, BitRange selected) {
        auto &ctx = *contexts_[0];
        BindSegment direct;
        const auto &inner = db::internalSegment(ctx.data.facts->internals[e.first], e.second, direct);
        const auto pin = ctx.scope.qualify(e.via);
        const auto pinBits = project(selected, inner.target.bits, inner.pinBits);
        if (ctx.inst.size() == 1) {
            auto h = hop(pin, selected, fact("internal", pin, {e.second}));
            terminal(h, "top_port", pin, pinBits, "inside");
            append(std::move(h), StepAnchor{{pin, pinBits}, true, false});
            advance();
            return true;
        }
        auto located = db_.locate(ctx.inst, cancel_);
        if (!located)
            return located.error();
        auto parentKey = ctx.inst;
        parentKey.pop_back();
        auto loaded = load(parentKey, located->steps.back().parentBody);
        if (!loaded)
            return loaded.error();
        if (!*loaded)
            return true;
        auto &parent = **loaded;
        const auto localPin = "p:" + std::to_string(ctx.inst.back()) + ":" + std::to_string(e.first);
        const auto found = parent.data.index->bindings.find(localPin);
        if (found == parent.data.index->bindings.end()) {
            auto h = hop(pin, selected, {});
            unresolved(h, "unsupported", pin);
            append(std::move(h), StepAnchor{{pin, pinBits}, true, false});
            advance();
            return true;
        }
        const auto &binding = parent.data.facts->bindings[found->second];
        if (position_[1] && position_[1] >= binding.segments.size())
            return Error{ErrorCode::BadRequest, "cursor past the binding segments"};
        auto start = std::lower_bound(binding.segments.begin(), binding.segments.end(), pinBits.lsb,
                                      [](const auto &s, uint64_t bit) {
                                          return s.pinBits.lsb + s.pinBits.width <= bit;
                                      });
        size_t segment = std::max(position_[1], size_t(start - binding.segments.begin()));
        if (segment >= binding.segments.size() ||
            binding.segments[segment].pinBits.lsb >= pinBits.lsb + pinBits.width) {
            advance();
            return true;
        }
        const auto &outer = binding.segments[segment];
        const auto selectedPin = *overlap(pinBits, outer.pinBits);
        auto h = hop(pin, project(selectedPin, pinBits, selected), fact("binding", pin, {segment, e.second}));
        h.kind = "binding_up";
        auto to = outer.target.kind == "expr" ? selectedPin
                                              : project(selectedPin, outer.pinBits, outer.target.bits);
        target(h, outer.target, to, selectedPin.lsb - outer.pinBits.lsb, parent);
        append(std::move(h), StepAnchor{{pin, selectedPin}, true, true});
        position_[1] = segment + 1;
        if (position_[1] == binding.segments.size() ||
            binding.segments[position_[1]].pinBits.lsb >= pinBits.lsb + pinBits.width)
            advance();
        return true;
    }
    Result<bool> downward(const db::ConnectionEntry &e, BitRange selected) {
        auto &ctx = *contexts_[0];
        const auto &binding = ctx.data.facts->bindings[e.first];
        const auto &outer = binding.segments[e.second];
        const auto pin = ctx.scope.qualify(binding.pin);
        const auto pinBits = project(selected, outer.target.bits, outer.pinBits);
        const auto parsed = parseObject(pin);
        if (!parsed)
            return Error{ErrorCode::Internal, "invalid indexed pin"};
        const auto &slot = ctx.skeleton->slots.at(parsed->inst.back());
        if (slot.body == kNoBody) {
            auto h = hop(pin, selected, fact("external", pin, {e.second}));
            terminal(h, slot.kind == InstKind::Primitive ? "primitive_pin" : "blackbox_pin",
                     pin, pinBits, "outside");
            h.cell = binding.cell;
            append(std::move(h));
            advance();
            return true;
        }
        auto loaded = load(parsed->inst, slot.body);
        if (!loaded)
            return loaded.error();
        if (!*loaded)
            return true;
        auto &child = **loaded;
        const auto &internal = child.data.facts->internals.at(parsed->index);
        if (internal.kind == "unresolved" || child.skeleton->kind == InstKind::Interface) {
            auto h = hop(pin, selected, {});
            unresolved(h, child.skeleton->kind == InstKind::Interface ? "interface_port"
                           : internal.reason.empty() ? "unsupported" : internal.reason, pin);
            append(std::move(h), StepAnchor{{pin, pinBits}, false, true});
            advance();
            return true;
        }
        size_t segment = position_[1];
        if (segment && segment >= db::internalSegmentCount(internal))
            return Error{ErrorCode::BadRequest, "cursor past the internal segments"};
        if (internal.kind == "mapped") {
            auto start = std::lower_bound(internal.segments.begin(), internal.segments.end(), pinBits.lsb,
                                          [](const auto &s, uint64_t bit) {
                                              return s.pinBits.lsb + s.pinBits.width <= bit;
                                          });
            segment = std::max(segment, size_t(start - internal.segments.begin()));
        }
        if (segment >= db::internalSegmentCount(internal)) {
            advance();
            return true;
        }
        BindSegment direct;
        const auto &inner = db::internalSegment(internal, segment, direct);
        auto clipped = overlap(pinBits, inner.pinBits);
        if (!clipped) {
            advance();
            return true;
        }
        auto h = hop(pin, project(*clipped, pinBits, selected), fact("binding", pin, {e.second, segment}));
        h.kind = "binding_down";
        target(h, inner.target, project(*clipped, inner.pinBits, inner.target.bits),
               clipped->lsb - inner.pinBits.lsb, child);
        append(std::move(h), StepAnchor{{pin, *clipped}, true, true});
        position_[1] = segment + 1;
        if (position_[1] == db::internalSegmentCount(internal) ||
            db::internalSegment(internal, position_[1], direct).pinBits.lsb >= pinBits.lsb + pinBits.width)
            advance();
        return true;
    }
};
} // namespace

Result<QueryResult<StepResult>> step(const db::DesignDb &db, std::string_view ref, bool upstream,
                                    const ConnectionRequest &request, const StepLimit &limit,
                                    Cancel cancel, bool outsideBinding,
                                    std::vector<std::optional<StepAnchor>> *anchors) try {
    if (anchors)
        anchors->clear();
    auto key = parseObject(ref);
    if (!key || (key->kind != 's' && key->kind != 'p'))
        return Error{ErrorCode::BadRequest, "expected signal or port reference"};
    if (limit.maxHops <= 0)
        return Error{ErrorCode::BadRequest, "maxHops must be positive"};
    if ((key->kind == 's' && !request.side.empty()) ||
        (key->kind == 'p' && request.side != "inside" && request.side != "outside") ||
        (request.side == "outside" && key->inst.size() == 1))
        return Error{ErrorCode::BadRequest, "invalid side for this object"};
    if (request.bits && (!request.bits->width ||
                         request.bits->lsb > UINT64_MAX - request.bits->width))
        return Error{ErrorCode::BadRequest, "invalid bit range"};
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "step cancelled"};
    auto result = StepPage(db, std::move(*key), upstream, cancel, outsideBinding, anchors).run(request, limit);
    if (!result && anchors)
        anchors->clear();
    return result;
} catch (const Error &error) {
    // Partial-reason cancellation unwinds through this shared boundary, also
    // when step is called by trace. Failed pages publish no companion anchors.
    if (anchors)
        anchors->clear();
    return error;
}
} // namespace hier::detail
