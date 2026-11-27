#include "hier/db/ConnectionIndex.h"
#include "Observe.h"
#include "RegisterPartition.h"
#include "ConnectionCoverage.h"
#include <algorithm>
#include <charconv>
#include <tuple>

namespace hier::db {
using namespace model;
namespace {
struct Interrupted {};
void check(Cancel cancel) {
    if (cancel.stop_requested())
        throw Interrupted{};
}
void unite(std::vector<BitRange> &ranges, Cancel cancel) {
    detail::normalizeConnectionCoverage(ranges, [&] { check(cancel); });
}
auto refOrder(std::string_view ref) {
    // A body's local refs have at most one child-slot component. Own objects sort
    // before child objects; port, signal, process, register in model reference order.
    uint64_t child = 0, index = 0;
    int kind = 0;
    if (ref.size() >= 2) {
        const auto pos = std::string_view("ipsxr").find(ref[0]);
        kind = pos == std::string_view::npos ? 5 : int(pos);
        auto colon = ref.find(':', 2);
        auto c = ref.substr(2, colon == std::string_view::npos ? ref.size() - 2 : colon - 2);
        if (!c.empty()) {
            (void)std::from_chars(c.data(), c.data() + c.size(), child);
            ++child;
        }
        if (colon != std::string_view::npos) {
            auto n = ref.substr(colon + 1);
            (void)std::from_chars(n.data(), n.data() + n.size(), index);
        }
    }
    return std::tuple{child, kind, index};
}
bool flows(Direction dir, bool input) {
    return dir == (input ? Direction::In : Direction::Out) || dir == Direction::InOut ||
           dir == Direction::Ref || dir == Direction::Unknown;
}
bool flows(const std::string &dir, bool input) {
    return dir == (input ? "in" : "out") || dir == "inout" || dir == "ref" || dir == "unknown";
}
void buildCoverage(ConnectionList &list, size_t node, size_t lo, size_t hi, Cancel cancel) {
    observation::emit({observation::Kind::ConnectionIndexNode, node});
    check(cancel);
    auto &ranges = list.coverage[node];
    if (hi - lo == 1)
        ranges = list.entries[lo].ranges;
    else {
        const size_t mid = lo + (hi - lo) / 2;
        buildCoverage(list, node * 2, lo, mid, cancel);
        buildCoverage(list, node * 2 + 1, mid, hi, cancel);
        detail::mergeConnectionCoverage(ranges, list.coverage[node * 2],
                                         list.coverage[node * 2 + 1], [&] { check(cancel); });
    }
}
bool overlaps(const std::vector<BitRange> &ranges, BitRange query) {
    auto i = std::lower_bound(ranges.begin(), ranges.end(), query.lsb,
                              [](auto r, uint64_t bit) {
        observation::emit({observation::Kind::ConnectionSeekCompare});
        return r.lsb + r.width <= bit;
    });
    return i != ranges.end() && i->lsb < query.lsb + query.width;
}
size_t findNext(const ConnectionList &list, size_t node, size_t lo, size_t hi, size_t start,
                BitRange query, Cancel cancel) {
    observation::emit({observation::Kind::ConnectionSeekNode, node});
    check(cancel);
    if (hi <= start || !overlaps(list.coverage[node], query))
        return noEntry;
    if (hi - lo == 1)
        return lo;
    const size_t mid = lo + (hi - lo) / 2;
    auto found = findNext(list, node * 2, lo, mid, start, query, cancel);
    return found != noEntry ? found
                           : findNext(list, node * 2 + 1, mid, hi, start, query, cancel);
}
struct Builder {
    Cancel cancel;
    ConnectionIndex index;
    std::map<std::pair<std::string, bool>, std::map<std::pair<std::string, std::string>,
                                                   std::vector<BitRange>>> reasons;
    void reason(const std::string &ref, bool up, const Reason &r, BitRange bits) {
        reasons[{ref, up}][{r.code, r.at}].push_back(bits);
    }
    void add(const std::string &ref, bool up, ConnectionEntry entry, BitRange bits,
             const Completeness *incomplete = nullptr) {
        if (ref.empty() || !bits.width)
            return;
        observation::emit({observation::Kind::ConnectionIndexEntry});
        check(cancel);
        if (incomplete)
            for (const auto &r : incomplete->reasons) {
                check(cancel);
                reason(ref, up, r, bits);
            }
        entry.ranges.push_back(bits);
        index.objects[{ref, up}].entries.push_back(std::move(entry));
    }
};
} // namespace

size_t internalSegmentCount(const PortInternal &p) {
    return p.kind == "direct" ? 1 : p.kind == "mapped" ? p.segments.size() : 0;
}
const BindSegment &internalSegment(const PortInternal &p, size_t i, BindSegment &direct) {
    if (p.kind == "mapped")
        return p.segments.at(i);
    BindTarget target;
    target.kind = "signal";
    target.signal = p.signal;
    target.bits = p.bits;
    direct = {{0, p.bits.width}, std::move(target)};
    return direct;
}
Result<size_t> ConnectionList::next(size_t start, BitRange bits, Cancel cancel) const {
    try {
        check(cancel);
        if (start >= entries.size())
            return noEntry;
        return findNext(*this, 1, 0, entries.size(), start, bits, cancel);
    } catch (const Interrupted &) {
        return Error{ErrorCode::Cancelled, "connection enumeration cancelled"};
    }
}
const ConnectionList *ConnectionIndex::find(const std::string &ref, bool up) const {
    auto it = objects.find({ref, up});
    return it == objects.end() ? nullptr : &it->second;
}

Result<std::shared_ptr<const ConnectionIndex>>
indexConnections(const BodyConnections &facts, const BodySkeleton &skeleton, Cancel cancel) {
    try {
        Builder b;
        b.cancel = cancel;
        // Register overlap lookup is grouped by the original process and target.
        struct RegisterGroup {
            std::vector<size_t> positions;
            std::unique_ptr<detail::RegisterPartition> partition;
        };
        std::map<std::pair<std::string, std::string>, RegisterGroup> registers;
        for (size_t r = 0; r < facts.registers.size(); ++r) {
            check(cancel);
            const auto &reg = facts.registers[r];
            registers[{reg.process, reg.signal}].positions.push_back(r);
        }
        for (size_t p = 0; p < facts.processes.size(); ++p) {
            check(cancel);
            const auto &proc = facts.processes[p];
            for (size_t w = 0; w < proc.result.writes.size(); ++w) {
                check(cancel);
                const auto &write = proc.result.writes[w];
                auto &group = registers[{proc.result.ref, write.target.ref}];
                detail::RegisterPartition small(facts.registers, group.positions);
                auto *partition = &small;
                if (group.positions.size() > detail::RegisterPartition::linearLimit) {
                    if (!group.partition)
                        group.partition = std::make_unique<detail::RegisterPartition>(
                            facts.registers, group.positions);
                    partition = group.partition.get();
                }
                partition->visit(write.target.bits, [&](BitRange target, size_t reg) {
                    ConnectionEntry entry;
                    entry.first = p;
                    entry.second = w;
                    entry.target = target;
                    entry.reg = reg;
                    entry.via = reg == noEntry ? proc.result.ref : facts.registers[reg].ref;
                    if (write.deps.empty())
                        b.add(write.target.ref, true, entry, entry.target, &proc.completeness);
                    for (size_t d = 0; d < write.deps.size(); ++d) {
                        check(cancel);
                        entry.third = d;
                        const auto &dep = write.deps[d];
                        BitRange source = dep.bits;
                        if (dep.align == "bitwise")
                            source = {dep.bits.lsb + entry.target.lsb - write.target.bits.lsb,
                                      entry.target.width};
                        b.add(write.target.ref, true, entry, entry.target, &proc.completeness);
                        b.add(dep.signal, false, entry, source, &proc.completeness);
                    }
                }, [&] { check(cancel); });
            }
        }
        for (size_t p = 0; p < facts.internals.size(); ++p) {
            check(cancel);
            const auto &port = facts.internals[p];
            const auto ref = "p::" + std::to_string(p);
            for (size_t s = 0; s < internalSegmentCount(port); ++s) {
                check(cancel);
                BindSegment direct;
                const auto &seg = internalSegment(port, s, direct);
                ConnectionEntry e;
                e.kind = ConnectionKind::Internal;
                e.first = p;
                e.second = s;
                e.via = ref;
                for (bool up : {false, true}) {
                    b.add(ref, up, e, seg.pinBits);
                    if (seg.target.kind == "signal" && flows(skeleton.ports.at(p).direction, up)) {
                        e.kind = ConnectionKind::OwnPort;
                        b.add(seg.target.signal, up, e, seg.target.bits);
                        e.kind = ConnectionKind::Internal;
                    }
                }
            }
        }
        for (size_t pin = 0; pin < facts.bindings.size(); ++pin) {
            check(cancel);
            const auto &binding = facts.bindings[pin];
            b.index.bindings.emplace(binding.pin, pin);
            b.index.cellPins[binding.inst].push_back(pin);
            for (const auto &target : binding.possibleWrites) {
                check(cancel);
                b.reason(target.ref, true, {"blackbox", binding.pin, ""}, target.bits);
            }
            for (size_t s = 0; s < binding.segments.size(); ++s) {
                check(cancel);
                const auto &seg = binding.segments[s];
                ConnectionEntry e;
                e.kind = ConnectionKind::Outside;
                e.first = pin;
                e.second = s;
                e.via = binding.pin;
                for (bool up : {false, true}) {
                    // Expressions already have Write/Dep entries for this pin.
                    if (seg.target.kind != "expr")
                        b.add(binding.pin, up, e, seg.pinBits);
                    if (seg.target.kind == "signal" && flows(binding.direction, !up)) {
                        if (binding.direction == "unknown")
                            b.reason(seg.target.signal, up, {"blackbox", binding.pin, ""}, seg.target.bits);
                        else {
                            e.kind = ConnectionKind::ChildPin;
                            b.add(seg.target.signal, up, e, seg.target.bits);
                            e.kind = ConnectionKind::Outside;
                        }
                    }
                }
            }
        }
        for (const auto &s : facts.signals) {
            check(cancel);
            const BitRange bits{0, s.width};
            if (s.externalRead)
                b.reason(s.ref, false, {"hier_ref", s.ref, ""}, bits);
            if (s.externalWrite)
                b.reason(s.ref, true, {"hier_ref", s.ref, ""}, bits);
        }
        // Whole-body publication failures affect even objects with no surviving facts.
        std::map<std::string, uint64_t> widths;
        for (const auto &s : facts.signals) {
            check(cancel);
            widths[s.ref] = s.width;
        }
        for (size_t p = 0; p < skeleton.ports.size(); ++p) {
            check(cancel);
            widths["p::" + std::to_string(p)] = skeleton.ports[p].width;
        }
        for (const auto &pin : facts.bindings) {
            check(cancel);
            widths[pin.pin] = pin.width.value_or(0);
        }
        for (const auto &[ref, width] : widths) {
            check(cancel);
            for (bool up : {false, true})
                for (const auto &r : facts.completeness.reasons) {
                    check(cancel);
                    b.reason(ref, up, r, {0, width});
                }
        }
        for (auto &[object, reasons] : b.reasons)
            for (auto &[identity, ranges] : reasons) {
                check(cancel);
                unite(ranges, cancel);
                if (ranges.empty())
                    continue;
                ConnectionEntry e;
                e.kind = ConnectionKind::Reason;
                e.via = identity.second;
                e.reason = {identity.first, identity.second, ""};
                e.ranges = std::move(ranges);
                b.index.objects[object].entries.push_back(std::move(e));
            }
        b.index.estimatedBytes = sizeof(ConnectionIndex);
        for (auto &[key, list] : b.index.objects) {
            std::sort(list.entries.begin(), list.entries.end(), [&](const auto &a, const auto &c) {
                check(cancel);
                return std::tuple{a.kind == ConnectionKind::Reason, a.reason.code, refOrder(a.via),
                                  a.first, a.second, a.third, a.target.lsb} <
                       std::tuple{c.kind == ConnectionKind::Reason, c.reason.code, refOrder(c.via),
                                  c.first, c.second, c.third, c.target.lsb};
            });
            list.coverage.resize(list.entries.size() * 4);
            if (!list.entries.empty())
                buildCoverage(list, 1, 0, list.entries.size(), cancel);
            // Include vector capacities, strings and map node/link overhead.
            b.index.estimatedBytes += sizeof(key) + key.first.capacity() + sizeof(ConnectionList) +
                                      4 * sizeof(void *) + list.entries.capacity() * sizeof(ConnectionEntry) +
                                      list.coverage.capacity() * sizeof(std::vector<BitRange>);
            for (const auto &e : list.entries) {
                check(cancel);
                b.index.estimatedBytes += e.via.capacity() + e.reason.code.capacity() +
                                          e.reason.at.capacity() + e.reason.detail.capacity() +
                                          e.ranges.capacity() * sizeof(BitRange);
            }
            for (const auto &ranges : list.coverage) {
                check(cancel);
                b.index.estimatedBytes += ranges.capacity() * sizeof(BitRange);
            }
        }
        for (const auto &[key, unused] : b.index.bindings) {
            check(cancel);
            (void)unused;
            b.index.estimatedBytes += sizeof(std::pair<const std::string, size_t>) +
                                      key.capacity() + 4 * sizeof(void *);
        }
        for (const auto &[key, pins] : b.index.cellPins) {
            check(cancel);
            b.index.estimatedBytes += sizeof(key) + key.capacity() + sizeof(pins) +
                                      pins.capacity() * sizeof(size_t) + 4 * sizeof(void *);
        }
        check(cancel);
        return std::shared_ptr<const ConnectionIndex>(
            std::make_shared<ConnectionIndex>(std::move(b.index)));
    } catch (const Interrupted &) {
        return Error{ErrorCode::Cancelled, "connection indexing cancelled"};
    }
}
} // namespace hier::db
