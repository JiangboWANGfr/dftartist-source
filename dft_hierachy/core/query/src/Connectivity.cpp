#include "ConnectionRefs.h"
#include "Connectivity.h"
#include "ConnectionSnapshot.h"
#include "EndpointAccumulator.h"
#include "PartialReasons.h"
#include "hier/Design.h"
#include "hier/db/ConnectionIndex.h"
#include <algorithm>
#include <functional>
#include <map>
#include <set>
#include <span>
#include <string_view>
#include <tuple>

namespace hier {
namespace {
using namespace model;
bool flows(Direction d, bool input) {
    return d == (input ? Direction::In : Direction::Out) || d == Direction::InOut ||
           d == Direction::Ref || d == Direction::Unknown;
}
bool flows(const std::string &d, bool input) {
    return d == (input ? "in" : "out") || d == "inout" || d == "ref" || d == "unknown";
}
// A traversal owns its query data. Neither pointers into evictable body caches nor
// frontend symbols escape through an endpoint.
struct Walk {
    bool upstream;
    Cancel cancel;
    std::string reach;
    QueryResult<std::vector<Endpoint>> answer;
    detail::EndpointAccumulator endpoints;
    detail::PartialReasons reasons;
    std::set<std::tuple<std::string, uint64_t, uint64_t, uint64_t, std::string>> visited;
    detail::ConnectionSnapshot snapshot;
    Walk(const db::DesignDb &db, bool up, std::string r, Cancel token)
        : upstream(up), cancel(token), reach(std::move(r)),
          endpoints(answer.result, token), reasons(answer.completeness, [token] { detail::checkpoint(token); }), snapshot(db, token) {}
    const detail::ConnectionSnapshot::Occurrence &data(const std::string &inst) {
        auto loaded = snapshot.load(inst);
        if (loaded.inserted)
            for (const auto &reason : loaded.occurrence.facts->completeness.reasons) {
                detail::checkpoint(cancel);
                reasons.append(reason.code, loaded.occurrence.ref(reason.at));
            }
        return loaded.occurrence;
    }
    static std::optional<BitRange> overlap(BitRange a, BitRange b) {
        auto lo = std::max(a.lsb, b.lsb), hi = std::min(a.lsb + a.width, b.lsb + b.width);
        if (lo >= hi)
            return {};
        return BitRange{lo, hi - lo};
    }
    static BitRange projected(BitRange selected, BitRange source, BitRange destination) {
        return {destination.lsb + selected.lsb - source.lsb, selected.width};
    }
    std::vector<Hop> trim(std::vector<Hop> via, uint64_t offset, uint64_t width) {
        for (auto &h : via) {
            detail::checkpoint(cancel);
            h.from.bits.lsb += offset;
            h.from.bits.width = width;
            for (auto &m : h.map) {
                detail::checkpoint(cancel);
                m.from += offset;
                m.to += offset;
                m.width = width;
            }
            for (auto &n : h.next) {
                detail::checkpoint(cancel);
                n.slice.bits.lsb += offset;
                n.slice.bits.width = width;
            }
        }
        return via;
    }
    void emit(std::string kind, std::string ref, std::string inst, BitRange bits, BitRange queried,
              const std::vector<Hop> &via, std::string at = {}, std::string reason = {}) {
        detail::checkpoint(cancel);
        Endpoint e;
        e.kind = std::move(kind);
        e.ref = std::move(ref);
        e.inst = std::move(inst);
        e.queried = queried;
        e.bits = bits;
        e.via = via;
        e.reason = std::move(reason);
        if (!at.empty())
            e.at = Slice{std::move(at), bits};
        endpoints.append(std::move(e), true);
    }
    std::vector<Hop> crossed(const std::vector<Hop> &via, const std::string &from,
                             BitRange fromBits, const std::string &to, BitRange toBits,
                             const std::string &pin) {
        auto result = via;
        Hop h;
        h.kind = "boundary";
        h.via = pin;
        h.from = {from, fromBits};
        h.map.push_back({fromBits.lsb, toBits.lsb, fromBits.width});
        h.next.push_back({{to, toBits}, "data", "exact"});
        result.push_back(h);
        return result;
    }
    void target(const BindTarget &t, uint64_t offset, const std::string &pin, BitRange pinBits,
                BitRange queried, const std::vector<Hop> &via, const detail::ReferenceScope *scope) {
        if (t.kind == "signal") {
            signal(scope ? scope->qualify(t.signal) : t.signal,
                   {t.bits.lsb + offset, pinBits.width}, queried, via);
            return;
        }
        if (t.kind == "expr") {
            const auto processRef = scope ? scope->qualify(t.process) : t.process;
            auto process = detail::parseObject(processRef);
            if (!process || process->kind != 'x') {
                reasons.append("unsupported", pin);
                return;
            }
            try {
                const auto inst = instRef(process->inst);
                const auto &context = data(inst);
                if (process->index >= context.facts->processes.size()) {
                    reasons.append("unsupported", pin);
                    return;
                }
                const auto &p = context.facts->processes[process->index];
                for (const auto &reason : p.completeness.reasons)
                    reasons.append(reason.code, context.ref(reason.at));
                for (const auto &w : p.result.writes) {
                    detail::checkpoint(cancel);
                    if (context.ref(w.target.ref) == pin) {
                        if (auto selected = overlap(w.target.bits, pinBits))
                            emit("process", processRef, inst, *selected,
                                 projected(*selected, pinBits, queried), via, pin);
                    } else {
                        // Output conversion still projects only the proven pin bits.
                        for (const auto &dep : w.deps) {
                            detail::checkpoint(cancel);
                            if (context.ref(dep.signal) == pin)
                                if (auto selected = overlap(dep.bits, pinBits)) {
                                    auto at = upstream ? w.target.bits : *selected;
                                    if (upstream && dep.align == "bitwise")
                                        at = projected(*selected, dep.bits, w.target.bits);
                                    emit("process", processRef, inst, at,
                                         projected(*selected, pinBits, queried), via,
                                         upstream ? context.ref(w.target.ref) : pin);
                                }
                        }
                    }
                }
            } catch (const Error &error) {
                detail::checkpoint(cancel);
                if (error.code == ErrorCode::Cancelled)
                    throw;
                reasons.append("unsupported", pin);
            }
            return;
        }
        Endpoint e;
        e.kind = t.kind;
        e.queried = queried;
        e.via = via;
        e.reason = t.reason;
        if (t.kind == "const") {
            const auto digits = std::string_view(t.value).substr(t.value.find('b') + 1);
            if (offset <= digits.size() && pinBits.width <= digits.size() - offset) {
                e.value = std::to_string(pinBits.width) + "'b";
                e.value.append(digits.substr(digits.size() - size_t(offset + pinBits.width),
                                             size_t(pinBits.width)));
            } else {
                e.kind = "unresolved";
                e.reason = "unsupported";
            }
        }
        if (e.kind == "unresolved")
            reasons.append(e.reason, pin);
        endpoints.append(std::move(e), false);
    }
    void port(const std::string &ref, BitRange bits, BitRange queried, const std::string &side,
              const std::vector<Hop> &via) {
        detail::checkpoint(cancel);
        if (!visited.emplace(ref, bits.lsb, bits.width, queried.lsb, side).second)
            return;
        auto key = detail::parseObject(ref);
        if (!key)
            return;
        auto inst = instRef(key->inst);
        // Both spans and scope borrow this Walk's immutable snapshot. Recursive
        // lookups keep its map elements and body leases alive and stationary.
        std::span<const BindSegment> segments;
        const detail::ReferenceScope *scope = nullptr;
        BindSegment direct;
        auto owner = snapshot.instanceKind(inst);
        detail::checkpoint(cancel);
        if (owner && *owner == InstKind::Interface) {
            reasons.append("interface_port", ref);
            return;
        }
        if (side == "inside") {
            auto &d = data(inst);
            if (key->index >= d.ports().size())
                return;
            const auto &p = d.ports()[key->index];
            if (p.internal.kind == "unresolved") {
                reasons.append(p.internal.reason, ref);
                return;
            }
            if (p.internal.kind == "mapped")
                segments = p.internal.segments;
            else if (p.internal.kind == "direct")
                segments = {&db::internalSegment(p.internal, 0, direct), 1};
            scope = &d.scope();
        } else {
            if (key->inst.size() == 1) {
                reasons.append("unsupported", ref);
                return;
            }
            key->inst.pop_back();
            const auto &parent = data(instRef(key->inst));
            const bool complete = snapshot.references(parent).visit(
                detail::FactReference::Pin, parent.scope(), ref, [&](const auto &row) {
                    const auto &b = parent.facts->bindings[row.outer];
                    if (!b.width) {
                        reasons.append(b.unresolved, ref);
                        return false;
                    }
                    if (b.direction == "unknown")
                        reasons.append("blackbox", ref);
                    // Complete the lookup before following a target: duplicate
                    // bindings retain the original last-match precedence.
                    segments = b.segments;
                    scope = &parent.scope();
                    return true;
                }, cancel);
            if (!complete)
                return;
        }
        for (const auto &s : segments) {
            detail::checkpoint(cancel);
            if (auto selected = overlap(s.pinBits, bits))
                target(s.target, selected->lsb - s.pinBits.lsb, ref, *selected,
                       projected(*selected, bits, queried),
                       trim(via, selected->lsb - bits.lsb, selected->width), scope);
        }
    }
    void signal(const std::string &ref, BitRange bits, BitRange queried,
                const std::vector<Hop> &via) {
        detail::checkpoint(cancel);
        if (!visited.emplace(ref, bits.lsb, bits.width, queried.lsb, "").second)
            return;
        auto key = detail::parseObject(ref);
        if (!key)
            return;
        auto inst = instRef(key->inst);
        auto owner = snapshot.instanceKind(inst);
        detail::checkpoint(cancel);
        if (owner && *owner == InstKind::Interface) {
            reasons.append("interface_port", ref);
            return;
        }
        auto &d = data(inst);
        auto &references = snapshot.references(d);
        references.visit(detail::FactReference::Signal, d.scope(), ref, [&](const auto &row) {
            const auto &s = d.facts->signals[row.outer];
            if (upstream ? s.externalWrite : s.externalRead)
                reasons.append("hier_ref", ref);
            return true;
        }, cancel);
        std::optional<size_t> process;
        std::vector<BitRange> ranges;
        auto flushProcess = [&] {
            if (!process)
                return;
            detail::checkpoint(cancel);
            const auto &p = d.facts->processes[*process];
            std::sort(ranges.begin(), ranges.end(), [&](auto a, auto b) {
                detail::checkpoint(cancel);
                return a.lsb < b.lsb;
            });
            std::vector<BitRange> united;
            for (auto r : ranges) {
                detail::checkpoint(cancel);
                if (!united.empty() && r.lsb <= united.back().lsb + united.back().width) {
                    auto &old = united.back();
                    old.width = std::max(old.lsb + old.width, r.lsb + r.width) - old.lsb;
                } else
                    united.push_back(r);
            }
            for (auto r : united)
                emit("process", d.ref(p.result.ref), inst, r, projected(r, bits, queried),
                     trim(via, r.lsb - bits.lsb, r.width), ref);
            if (!united.empty())
                for (auto &reason : p.completeness.reasons)
                    if (reason.code != "hier_ref")
                        reasons.append(reason.code, d.ref(reason.at));
            ranges.clear();
        };
        references.visit(upstream ? detail::FactReference::Write : detail::FactReference::Read,
            d.scope(), ref, [&](const auto &row) {
                if (process && *process != row.outer)
                    flushProcess();
                process = row.outer;
                const auto &write = d.facts->processes[row.outer].result.writes[row.inner];
                const auto selected = upstream ? write.target.bits : write.deps[row.dependency].bits;
                if (auto r = overlap(selected, bits))
                    ranges.push_back(*r);
                return true;
            }, cancel);
        flushProcess();
        snapshot.portReferences(d).visit(d.scope(), ref, [&](const auto &row) {
            const auto &p = d.ports()[row.outer];
            if (!flows(p.direction, upstream))
                return true;
            // Mapped segments remain borrowed. A direct segment is
            // materialized only after its signal reference matched.
            BindSegment direct;
            const BindSegment *segment;
            if (p.internal.kind == "direct") {
                direct.pinBits = {0, p.internal.bits.width};
                direct.target.kind = "signal";
                direct.target.signal = p.internal.signal;
                direct.target.bits = p.internal.bits;
                segment = &direct;
            } else
                segment = &p.internal.segments[row.inner];
            const auto &s = *segment;
            detail::checkpoint(cancel);
            if (s.target.kind != "signal")
                return true;
            auto selected = overlap(s.target.bits, bits);
            if (!selected)
                return true;
            auto portBits = projected(*selected, s.target.bits, s.pinBits),
                 q = projected(*selected, bits, queried);
            auto route = trim(via, selected->lsb - bits.lsb, selected->width);
            const auto portRef = d.portRef(row.outer);
            if (reach == "local")
                emit("own_port", portRef, inst, portBits, q, route);
            else if (key->inst.size() == 1)
                emit("top_port", portRef, inst, portBits, q, route);
            else
                port(portRef, portBits, q, "outside",
                     crossed(route, ref, *selected, portRef, portBits, portRef));
            return true;
        }, cancel);
        // Unknown nontrivial output candidates have no proven bit permutation.
        // Keep the known pin space and queried parent range without inventing
        // a direct binding map. The same L1 metadata feeds the step index.
        if (upstream)
            references.visit(detail::FactReference::PossibleWrite, d.scope(), ref, [&](const auto &row) {
                const auto &binding = d.facts->bindings[row.outer];
                const auto &target = binding.possibleWrites[row.inner];
                detail::checkpoint(cancel);
                if (auto selected = overlap(target.bits, bits)) {
                    reasons.append("blackbox", d.ref(binding.pin));
                    emit("blackbox_pin", d.ref(binding.pin), d.ref(binding.inst),
                         {0, binding.width.value_or(0)}, projected(*selected, bits, queried),
                         trim(via, selected->lsb - bits.lsb, selected->width), {}, "blackbox");
                }
                return true;
            }, cancel);
        references.visit(detail::FactReference::Segment, d.scope(), ref, [&](const auto &row) {
            const auto &b = d.facts->bindings[row.outer];
            const auto &s = b.segments[row.inner];
            if (!flows(b.direction, !upstream))
                return true;
            detail::checkpoint(cancel);
            if (s.target.kind != "signal")
                return true;
            auto selected = overlap(s.target.bits, bits);
            if (!selected)
                return true;
            auto pinBits = projected(*selected, s.target.bits, s.pinBits),
                 q = projected(*selected, bits, queried);
            auto route = trim(via, selected->lsb - bits.lsb, selected->width);
            const auto pin = d.ref(b.pin), childInst = d.ref(b.inst);
            auto child = snapshot.instanceKind(childInst);
            detail::checkpoint(cancel);
            std::string kind = "module_pin";
            if (child && *child == InstKind::Blackbox) {
                kind = "blackbox_pin";
                if (b.direction == "unknown")
                    reasons.append("blackbox", pin);
            }
            if (child && *child == InstKind::Primitive)
                kind = "primitive_pin";
            if (reach == "local" || kind != "module_pin")
                emit(kind, pin, childInst, pinBits, q, route, {},
                     kind == "blackbox_pin" && b.direction == "unknown" ? "blackbox" : "");
            else
                port(pin, pinBits, q, "inside",
                     crossed(route, ref, *selected, pin, pinBits, pin));
            return true;
        }, cancel);
    }
    void coalesce() { endpoints.coalesce(); }
};
} // namespace
Result<model::QueryResult<std::vector<model::Endpoint>>>
detail::connections(const Design &design, const db::DesignDb &database, std::string_view ref,
                                                       const ConnectionRequest &request,
                                                       bool upstream, Cancel cancel) {
    detail::checkpoint(cancel);
    if (request.reach != "local" && request.reach != "hier")
        return Error{ErrorCode::BadRequest, "reach must be local or hier"};
    auto key = detail::parseObject(ref);
    if (!key || (key->kind != 's' && key->kind != 'p'))
        return Error{ErrorCode::BadRequest, "expected signal or port reference"};
    auto object = design.object(ref, cancel);
    if (!object)
        return object.error();
    Walk w(database, upstream, request.reach, cancel);
    auto &d = w.data(object->inst);
    uint64_t width = 0;
    if (key->kind == 's') {
        if (!request.side.empty())
            return Error{ErrorCode::BadRequest, "signals have no side"};
        width = d.facts->signals.at(key->index).width;
        if (d.facts->signals.at(key->index).opaque) {
            w.reasons.append("unsupported", std::string(ref));
            return w.answer;
        }
    } else {
        if (request.side != "inside" && request.side != "outside")
            return Error{ErrorCode::BadRequest, "ports require inside or outside side"};
        if (request.side == "outside" && key->inst.size() == 1)
            return Error{ErrorCode::BadRequest, "top ports have only an inside"};
        width = d.ports().at(key->index).width;
        if (request.side == "inside" && d.ports().at(key->index).internal.kind == "unresolved") {
            w.reasons.append(d.ports().at(key->index).internal.reason,
                    std::string(ref));
            return w.answer;
        }
        if (request.side == "outside") {
            auto parent = key->inst;
            parent.pop_back();
            const auto &context = w.data(instRef(parent));
            const bool complete = w.snapshot.references(context).visit(
                detail::FactReference::Pin, context.scope(), ref, [&](const auto &row) {
                    const auto &b = context.facts->bindings[row.outer];
                    if (!b.width) {
                        w.reasons.append(b.unresolved, std::string(ref));
                        return false;
                    }
                    width = *b.width;
                    return true;
                }, cancel);
            if (!complete)
                return w.answer;
        }
    }
    auto bits = request.bits.value_or(BitRange{0, width});
    if (!bits.width || bits.lsb >= width || bits.width > width - bits.lsb)
        return Error{ErrorCode::BadRequest, "slice is outside the object bit space"};
    if (key->kind == 's')
        w.signal(std::string(ref), bits, bits, {});
    else
        w.port(std::string(ref), bits, bits, request.side, {});
    w.coalesce();
    detail::checkpoint(cancel);
    return w.answer;
}
} // namespace hier
