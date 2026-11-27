    #include "TraceGraph.h"
#include "Observe.h"
#include "ConnectionRefs.h"
#include "Cursor.h"
#include <algorithm>
#include <deque>
#include <set>
#include <tuple>

namespace hier::detail::tracing {
using namespace model;
namespace {
void check(Cancel cancel) {
    if (cancel.stop_requested())
        throw Error{ErrorCode::Cancelled, "trace cancelled"};
}
void field(std::string &id, const std::optional<std::string> &value) {
    id += value ? '1' : '0';
    if (value)
        cursorField(id, *value);
}
void bits(std::string &id, BitRange range) {
    cursorField(id, std::to_string(range.lsb));
    cursorField(id, std::to_string(range.width));
}
auto refOrder(const std::string &ref) {
    auto key = parseObject(ref);
    if (key)
        return std::tuple{key->inst, std::string_view("ipsxr").find(key->kind), key->index};
    return std::tuple{parseInstRef(ref).value_or(InstKey{}), size_t{0}, size_t{0}};
}
auto pointOrder(const TracePoint &p) {
    return std::tuple{refOrder(p.slice.ref), p.slice.bits.lsb, p.slice.bits.width, p.side};
}
auto cursorOrder(const std::optional<std::string> &cursor) {
    std::vector<size_t> position;
    if (cursor) {
        std::string_view text = *cursor, field;
        text.remove_prefix(3);
        for (int i = 0; i < 3; ++i)
            takeCursorField(text, field);
        while (takeCursorField(text, field)) {
            size_t n = 0;
            std::from_chars(field.data(), field.data() + field.size(), n);
            position.push_back(n);
        }
    }
    return position;
}
size_t rank(const std::string &s, std::initializer_list<std::string_view> values) {
    size_t i = 0;
    for (auto v : values) {
        if (s == v)
            return i;
        ++i;
    }
    return i;
}
auto nodeOrder(const TraceNode &n) {
    using PointOrder = decltype(pointOrder(TracePoint{}));
    using RefOrder = decltype(refOrder(std::string{}));
    return std::tuple{rank(n.kind, {"slice", "process", "register", "blackbox_pin", "primitive_pin",
                                    "top_port", "const", "unconnected", "unresolved"}),
                      n.point ? std::optional<PointOrder>(pointOrder(*n.point)) : std::nullopt,
                      n.ref ? std::optional<RefOrder>(refOrder(*n.ref)) : std::nullopt,
                      n.value, n.reason, n.fact};
}
auto rangeOrder(const std::optional<BitRange> &r) {
    return r ? std::optional(std::pair{r->lsb, r->width}) : std::nullopt;
}
auto edgeOrder(const TraceEdge &e) {
    std::vector<std::tuple<uint64_t, uint64_t, uint64_t>> maps;
    for (const auto &m : e.map)
        maps.emplace_back(m.from, m.to, m.width);
    return std::tuple{e.fact, e.from, e.to,
                      rank(e.kind, {"binding", "dependency", "blackbox", "boundary"}),
                      rank(e.role, {"data", "control", "clock", "async"}),
                      rank(e.precision, {"exact", "conservative"}),
                      rank(e.align, {"bitwise", "all", "none"}),
                      rangeOrder(e.fromBits), rangeOrder(e.toBits), maps};
}
using Ranges = std::vector<BitRange>;
bool add(Ranges &ranges, BitRange range, Cancel cancel) {
    Ranges merged;
    bool inserted = false;
    for (auto r : ranges) {
        observation::emit({observation::Kind::TraceFilterRange});
        check(cancel);
        if (r.lsb + r.width < range.lsb)
            merged.push_back(r);
        else if (range.lsb + range.width < r.lsb) {
            if (!inserted) {
                merged.push_back(range);
                inserted = true;
            }
            merged.push_back(r);
        } else {
            const auto end = std::max(range.lsb + range.width, r.lsb + r.width);
            range.lsb = std::min(range.lsb, r.lsb);
            range.width = end - range.lsb;
        }
    }
    if (!inserted)
        merged.push_back(range);
    if (merged == ranges)
        return false;
    ranges = std::move(merged);
    return true;
}
} // namespace

std::optional<BitRange> overlap(BitRange a, BitRange b) {
    const auto lo = std::max(a.lsb, b.lsb), hi = std::min(a.lsb + a.width, b.lsb + b.width);
    return lo < hi ? std::optional(BitRange{lo, hi - lo}) : std::nullopt;
}
BitRange project(BitRange selected, BitRange from, BitRange to) {
    return {to.lsb + selected.lsb - from.lsb, selected.width};
}
std::vector<BitRange> subtract(BitRange from, BitRange cut) {
    auto common = overlap(from, cut);
    if (!common)
        return {from};
    std::vector<BitRange> out;
    if (common->lsb > from.lsb)
        out.push_back({from.lsb, common->lsb - from.lsb});
    if (common->lsb + common->width < from.lsb + from.width)
        out.push_back({common->lsb + common->width, from.lsb + from.width - common->lsb - common->width});
    return out;
}
bool sameObject(const TracePoint &a, const TracePoint &b) {
    return a.slice.ref == b.slice.ref && a.side == b.side;
}
std::string pointId(const TracePoint &p) {
    std::string id;
    cursorField(id, p.slice.ref);
    bits(id, p.slice.bits);
    field(id, p.side);
    return id;
}
std::string nodeId(const TraceNode &n) {
    std::string id = "n:";
    cursorField(id, n.kind);
    field(id, n.point ? std::optional(pointId(*n.point)) : std::nullopt);
    for (const auto &v : {n.ref, n.value, n.reason, n.fact})
        field(id, v);
    return id;
}
std::string edgeId(const TraceEdge &e) {
    std::string id = "e:";
    for (const auto &v : {e.fact, e.from, e.to, e.kind, e.role, e.precision, e.align})
        cursorField(id, v);
    for (auto r : {e.fromBits, e.toBits}) {
        id += r ? '1' : '0';
        if (r)
            bits(id, *r);
    }
    for (const auto &m : e.map) {
        bits(id, {m.from, m.width});
        cursorField(id, std::to_string(m.to));
    }
    return id;
}
TraceNode sliceNode(const TracePoint &p) {
    TraceNode n;
    n.kind = "slice";
    n.point = p;
    n.id = nodeId(n);
    return n;
}
std::string TraceGraph::root(const TracePoint &p) {
    auto n = sliceNode(p);
    nodes_.emplace(n.id, result.nodes.size());
    result.nodes.push_back(n);
    return n.id;
}
std::string TraceGraph::admit(std::vector<Link> &links) {
    std::set<std::string> newNodes, newEdges;
    for (auto &link : links) {
        check(cancel_);
        link.node.id = nodeId(link.node);
        link.edge.to = link.node.id;
        link.edge.id = edgeId(link.edge);
        if (!nodes_.contains(link.node.id))
            newNodes.insert(link.node.id);
        if (!edges_.contains(link.edge.id))
            newEdges.insert(link.edge.id);
    }
    if (newNodes.size() > size_t(budget_.maxNodes) - result.nodes.size())
        return "budget_nodes";
    if (newEdges.size() > size_t(budget_.maxEdges) - result.edges.size())
        return "budget_edges";
    for (const auto &link : links) {
        check(cancel_);
        if (nodes_.emplace(link.node.id, result.nodes.size()).second)
            result.nodes.push_back(link.node);
        if (edges_.emplace(link.edge.id, result.edges.size()).second)
            result.edges.push_back(link.edge);
    }
    return {};
}

std::string TraceGraph::routes(const TracePoint &target, const std::function<bool()> &expired) {
    // Reverse interval reachability on the bounded exploration graph. A node's
    // name alone never connects disjoint bus bits. No per-bit Cartesian product.
    if (expired())
        return "budget_time";
    std::vector<Ranges> needed(result.nodes.size());
    std::vector<std::vector<size_t>> incoming(result.nodes.size());
    std::deque<size_t> dirty;
    std::vector<bool> queued(result.nodes.size());
    size_t intervals = 0;
    for (size_t i = 0; i < result.nodes.size(); ++i) {
        check(cancel_);
        const auto &n = result.nodes[i];
        if (n.point && sameObject(*n.point, target))
            if (auto hit = overlap(n.point->slice.bits, target.slice.bits)) {
                needed[i].push_back(*hit);
                ++intervals;
                dirty.push_back(i);
                queued[i] = true;
            }
    }
    for (size_t i = 0; i < result.edges.size(); ++i) {
        check(cancel_);
        if (result.edges[i].kind != "boundary")
            incoming[nodes_.at(result.edges[i].to)].push_back(i);
    }
    while (!dirty.empty()) {
        check(cancel_);
        if (expired())
            return "budget_time";
        const auto dest = dirty.front();
        dirty.pop_front();
        queued[dest] = false;
        // Copy because a self-loop may update this node's interval union.
        const auto ranges = needed[dest];
        for (auto e : incoming[dest]) {
            check(cancel_);
            if (expired())
                return "budget_time";
            const auto &edge = result.edges[e];
            const auto source = nodes_.at(edge.from);
            const auto oldSize = needed[source].size();
            bool changed = false;
            for (auto r : ranges) {
                check(cancel_);
                if (expired())
                    return "budget_time";
                if (auto selected = overlap(r, *edge.toBits)) {
                    if (edge.align == "all")
                        changed |= add(needed[source], *edge.fromBits, cancel_);
                    else
                        for (const auto &m : edge.map) {
                            check(cancel_);
                            if (auto clipped = overlap(*selected, {m.to, m.width}))
                                changed |= add(needed[source], project(*clipped, {m.to, m.width},
                                                                       {m.from, m.width}), cancel_);
                        }
                }
            }
            intervals = intervals - oldSize + needed[source].size();
            if (intervals > size_t(budget_.maxNodes))
                return "budget_nodes";
            if (changed && !queued[source]) {
                dirty.push_back(source);
                queued[source] = true;
            }
        }
    }
    std::map<std::string, std::string> replacements;
    std::vector<TraceNode> nodes;
    for (size_t i = 0; i < needed.size(); ++i) {
        check(cancel_);
        if (needed[i].empty())
            continue;
        auto n = result.nodes[i];
        replacements[result.nodes[i].id] = n.id;
        nodes.push_back(std::move(n));
    }
    std::map<std::string, TraceEdge> retained;
    for (const auto &edge : result.edges) {
        check(cancel_);
        if (expired())
            return "budget_time";
        if (edge.kind == "boundary" || !replacements.contains(edge.from) ||
            !replacements.contains(edge.to))
            continue;
        for (auto r : needed[nodes_.at(edge.to)]) {
            check(cancel_);
            auto selected = overlap(r, *edge.toBits);
            if (!selected)
                continue;
            auto e = edge;
            e.from = replacements.at(edge.from);
            e.to = replacements.at(edge.to);
            e.toBits = *selected;
            if (e.align == "bitwise") {
                e.map.clear();
                for (const auto &m : edge.map) {
                    check(cancel_);
                    if (auto clipped = overlap(*selected, {m.to, m.width}))
                        e.map.push_back({m.from + clipped->lsb - m.to, clipped->lsb, clipped->width});
                }
                if (e.map.empty())
                    continue;
                e.fromBits = BitRange{e.map.front().from, selected->width};
            }
            e.id = edgeId(e);
            retained.emplace(e.id, std::move(e));
            if (retained.size() > size_t(budget_.maxEdges))
                return "budget_edges";
        }
    }
    result.nodes = std::move(nodes);
    result.edges.clear();
    for (auto &[id, edge] : retained) {
        check(cancel_);
        (void)id;
        result.edges.push_back(std::move(edge));
    }
    // Target clipping can make formerly distinct target nodes identical.
    std::set<std::string> seen;
    std::erase_if(result.nodes, [&](const auto &n) { check(cancel_); return !seen.insert(n.id).second; });
    return {};
}
void TraceGraph::sort() {
    std::sort(result.nodes.begin(), result.nodes.end(), [&](const auto &a, const auto &b) {
        check(cancel_);
        return nodeOrder(a) < nodeOrder(b);
    });
    std::sort(result.edges.begin(), result.edges.end(), [&](const auto &a, const auto &b) {
        check(cancel_);
        return edgeOrder(a) < edgeOrder(b);
    });
    std::sort(result.frontier.begin(), result.frontier.end(), [&](const auto &a, const auto &b) {
        check(cancel_);
        return std::tuple{a.depth, pointOrder(a.point), a.reason, cursorOrder(a.stepCursor)} <
               std::tuple{b.depth, pointOrder(b.point), b.reason, cursorOrder(b.stepCursor)};
    });
    result.hasConservative = false;
    for (const auto &e : result.edges) {
        check(cancel_);
        result.hasConservative |= e.precision == "conservative";
    }
}
} // namespace hier::detail::tracing
