// A implementation regressions, complementary to B's unchanged frozen oracle.
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <map>
#include <set>

using namespace hier;
using namespace hier::model;
namespace {
std::unique_ptr<Design> open(const char *top, bool per = false, size_t cache = 64 * 1024 * 1024,
                             const char *fixture = HIER_FIXTURES "/m3/flow.sv") {
    OpenOptions options;
    options.files = {fixture};
    options.tops = {top};
    options.forcePerInstanceBodies = per;
    options.connectionCacheBytes = cache;
    auto value = Design::open(options);
    REQUIRE(value);
    REQUIRE(value.value()->diagnostics().errorCount == 0);
    return std::move(value.value());
}
TracePoint signal(Design &design, const std::string &name, const std::string &inst = "i:0") {
    auto signals = design.signals(inst);
    REQUIRE(signals);
    for (const auto &s : signals->items)
        if (s.name == name)
            return {{s.ref, {0, s.width}}, {}};
    FAIL("missing signal");
    return {};
}
TracePoint port(Design &design, const std::string &name, const std::string &side,
                 const std::string &inst = "i:0.0") {
    auto ports = design.ports(inst);
    REQUIRE(ports);
    for (const auto &p : *ports)
        if (p.name == name)
            return {{p.ref, {0, p.width}}, side};
    FAIL("missing port");
    return {};
}
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
const TraceResult &graph(const Result<QueryResult<TraceResult>> &reply) {
    REQUIRE(reply);
    const auto &g = reply->result;
    std::map<std::string, TraceNode> nodes;
    std::set<std::string> edges;
    for (const auto &n : g.nodes)
        REQUIRE(nodes.emplace(n.id, n).second);
    bool conservative = false;
    for (const auto &e : g.edges) {
        REQUIRE(edges.insert(e.id).second);
        REQUIRE(nodes.contains(e.from));
        REQUIRE(nodes.contains(e.to));
        conservative |= e.precision == "conservative";
        if (e.kind == "boundary") {
            CHECK(e.align == "none");
            CHECK_FALSE(e.fromBits);
            CHECK_FALSE(e.toBits);
            CHECK(e.map.empty());
            continue;
        }
        REQUIRE(nodes.at(e.from).point);
        REQUIRE(nodes.at(e.to).point);
        REQUIRE(e.fromBits);
        REQUIRE(e.toBits);
        for (const auto &[range, node] : {std::pair{*e.fromBits, nodes.at(e.from)},
                                        std::pair{*e.toBits, nodes.at(e.to)}}) {
            CHECK(range.width > 0);
            CHECK(range.lsb >= node.point->slice.bits.lsb);
            CHECK(range.lsb + range.width <= node.point->slice.bits.lsb + node.point->slice.bits.width);
        }
        if (e.precision == "conservative") {
            CHECK(e.align == "all");
            CHECK(e.map.empty());
        }
    }
    CHECK(g.hasConservative == conservative);
    return g;
}
} // namespace

TEST_CASE("trace result identities survive cache eviction sharing and query history", "[a-m3-trace]") {
    std::string coneValue, pathValue;
    for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{1024}, size_t{64 * 1024 * 1024}}) {
            auto design = open("flow", per, cache);
            const auto a = signal(*design, "a"), choice = signal(*design, "choice");
            for (int repeat = 0; repeat < 2; ++repeat) {
                auto cone = design->cone(choice, TraceDirection::Back, TracePolicy::Full);
                auto paths = design->paths(a, choice);
                graph(cone);
                graph(paths);
                CHECK(cone->completeness.status == "complete");
                CHECK(paths->completeness.status == "complete");
                if (coneValue.empty()) {
                    coneValue = json(*cone);
                    pathValue = json(*paths);
                }
                CHECK(json(*cone) == coneValue);
                CHECK(json(*paths) == pathValue);
                REQUIRE(design->bindings("i:0"));
                REQUIRE(design->signals("i:0.0"));
            }
        }
}

TEST_CASE("partial target hit preserves unvisited ranges and their semantic frontier", "[a-m3-trace]") {
    auto d = open("trace_partial", false, 0, A_TRACE_FIXTURE);
    auto a = signal(*d, "a"), y = signal(*d, "y");
    y.slice.bits = {1, 1};
    auto reply = d->paths(a, y);
    const auto &g = graph(reply);
    REQUIRE(g.edges.size() == 1);
    CHECK(g.edges[0].fromBits == BitRange{1, 1});
    CHECK(g.edges[0].toBits == BitRange{1, 1});
    CHECK(reply->completeness.status == "partial");
    CHECK(std::any_of(g.frontier.begin(), g.frontier.end(), [](const auto &f) {
        return f.reason == "unsupported";
    }));
    Budget zero;
    zero.maxDepth = 0;
    auto subset = a;
    subset.slice.bits = {1, 1};
    auto same = d->paths(a, subset, zero);
    const auto &sameGraph = graph(same);
    REQUIRE(sameGraph.nodes.size() == 1);
    CHECK(sameGraph.nodes[0].point->slice.bits == BitRange{1, 1});
    CHECK(sameGraph.edges.empty());
    CHECK(sameGraph.frontier.size() == 2);
    CHECK(same->completeness.status == "partial");
}

TEST_CASE("expression port goals retain dependency edges and stop their matched ranges", "[a-m3-trace]") {
    auto d = open("trace_ports", false, 0, A_TRACE_FIXTURE);
    auto a = signal(*d, "a");
    auto target = port(*d, "d", "outside");
    a.slice.bits = {2, 1};
    target.slice.bits = {2, 1};
    Budget budget;
    budget.maxDepth = 1;
    auto reply = d->paths(a, target, budget);
    const auto &g = graph(reply);
    REQUIRE(g.edges.size() == 1);
    CHECK(g.edges[0].kind == "dependency");
    CHECK(g.edges[0].fromBits == BitRange{2, 1});
    CHECK(g.edges[0].toBits == BitRange{2, 1});
    CHECK(reply->completeness.status == "complete");
    CHECK(g.frontier.empty());
    auto inside = target;
    inside.side = "inside";
    auto sideOnly = d->paths(inside, target, Budget{1000, 4000, 0, {}});
    CHECK(graph(sideOnly).nodes.empty());
    CHECK(sideOnly->completeness.status == "partial");
    auto forward = d->paths(port(*d, "d", "inside"), port(*d, "q", "outside"));
    CHECK_FALSE(graph(forward).edges.empty());
    CHECK(forward->completeness.status == "complete");
}

TEST_CASE("repeated actual bits restore each original pin segment without ambiguity", "[a-m3-trace]") {
    auto d = open("trace_repeated", false, 0, A_TRACE_FIXTURE);
    auto a = signal(*d, "a"), target = port(*d, "d", "outside");
    for (uint64_t bit : {uint64_t{0}, uint64_t{1}}) {
        target.slice.bits = {bit, 1};
        auto reply = d->paths(a, target);
        const auto &g = graph(reply);
        REQUIRE_FALSE(g.edges.empty());
        CHECK(std::any_of(g.edges.begin(), g.edges.end(), [&](const auto &e) {
            return e.kind == "binding" && e.toBits == BitRange{bit, 1} && e.fromBits == BitRange{0, 1};
        }));
    }
}

TEST_CASE("million bit paths and reverse cones retain interval maps", "[a-m3-trace]") {
    auto d = open("wide_bus");
    const auto a = signal(*d, "a"), y = signal(*d, "y");
    auto reply = d->paths(a, y, Budget{2, 1, 1, {}});
    const auto &g = graph(reply);
    CHECK(reply->completeness.status == "complete");
    REQUIRE(g.edges.size() == 1);
    REQUIRE(g.edges[0].map.size() == 1);
    CHECK(g.edges[0].map[0].width == 1048576);
    auto back = d->cone(y, TraceDirection::Back, TracePolicy::Full);
    const auto &reverse = graph(back);
    CHECK(back->completeness.status == "complete");
    CHECK(reverse.nodes.size() == 3);
    CHECK(reverse.edges.size() == 2);
}

TEST_CASE("shortest goal hit survives a longer unfinished branch", "[a-m3-trace]") {
    auto d = open("trace_join", false, 0, A_TRACE_FIXTURE);
    const auto a = signal(*d, "a"), y = signal(*d, "y"), b = signal(*d, "b");
    auto reply = d->paths(a, y, Budget{1000, 4000, 1, {}});
    const auto &g = graph(reply);
    REQUIRE(g.edges.size() == 1);
    CHECK(g.edges[0].kind == "dependency");
    CHECK(reply->completeness.status == "partial");
    REQUIRE(g.frontier.size() == 1);
    CHECK(g.frontier[0].point.slice.ref == b.slice.ref);
    CHECK(g.frontier[0].depth == 1);
    CHECK(g.frontier[0].reason == "budget_depth");
}

TEST_CASE("budget frontier replays the first unconsumed step fact", "[a-m3-trace]") {
    auto d = open("flow");
    const auto gate = signal(*d, "gate");
    auto reply = d->cone(gate, TraceDirection::Back, TracePolicy::Full, Budget{1000, 1, 64, {}});
    const auto &g = graph(reply);
    REQUIRE(g.edges.size() == 1);
    auto current = std::find_if(g.frontier.begin(), g.frontier.end(), [&](const auto &f) {
        return f.point.slice.ref == gate.slice.ref;
    });
    REQUIRE(current != g.frontier.end());
    REQUIRE(current->stepCursor);
    auto page = d->step(gate.slice.ref, true, {gate.slice.bits, "local", ""}, {1, *current->stepCursor});
    REQUIRE(page);
    REQUIRE(page->result.hops.size() == 1);
    CHECK(page->result.hops[0].fact != g.edges[0].fact);
    CHECK(g.frontier.size() == 2);
}

TEST_CASE("trace cancellation validation and opaque ranges use public error contracts", "[a-m3-trace]") {
    auto d = open("flow");
    const auto a = signal(*d, "a"), y = signal(*d, "gate");
    std::stop_source stop;
    stop.request_stop();
    auto cone = d->cone(a, TraceDirection::Forward, TracePolicy::Full, {}, stop.get_token());
    auto paths = d->paths(a, y, {}, stop.get_token());
    REQUIRE_FALSE(cone);
    REQUIRE_FALSE(paths);
    CHECK(cone.error().code == ErrorCode::Cancelled);
    CHECK(paths.error().code == ErrorCode::Cancelled);
    auto invalid = d->paths(a, y, Budget{0, 0, 0, {}}, stop.get_token());
    REQUIRE_FALSE(invalid);
    CHECK(invalid.error().code == ErrorCode::BadRequest);
    auto recovered = d->paths(a, y);
    CHECK_FALSE(graph(recovered).edges.empty());
    auto hugeTime = d->paths(a, y, Budget{1000, 4000, 64, INT64_MAX});
    REQUIRE(hugeTime);
    CHECK(json(*hugeTime) == json(*recovered));
    auto opaque = open("opaque_boundary");
    auto label = signal(*opaque, "label");
    label.slice.bits = {0, 0};
    auto unavailable = opaque->cone(label, TraceDirection::Back, TracePolicy::Full);
    CHECK(graph(unavailable).edges.size() == 1);
    CHECK(unavailable->completeness.status == "partial");
    label.slice.bits = {0, 1};
    auto nonempty = opaque->cone(label, TraceDirection::Back, TracePolicy::Full);
    REQUIRE_FALSE(nonempty);
    CHECK(nonempty.error().code == ErrorCode::BadRequest);
    auto opaqueGoal = open("trace_opaque", false, 0, A_TRACE_FIXTURE);
    auto goal = signal(*opaqueGoal, "label");
    goal.slice.bits = {0, 0};
    auto unknownRoute = opaqueGoal->paths(signal(*opaqueGoal, "a"), goal);
    CHECK(graph(unknownRoute).nodes.empty());
    CHECK(unknownRoute->completeness.status == "partial");
    CHECK(std::any_of(unknownRoute->result.frontier.begin(), unknownRoute->result.frontier.end(),
                      [&](const auto &f) { return f.point.slice.ref == goal.slice.ref && f.reason == "unsupported"; }));
}

TEST_CASE("outside source pins enter actual internal mappings with charged anchors", "[a-m3-trace]") {
    for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}})
            for (const auto *top : {"trace_ports", "trace_const_ports", "trace_wire_ports", "trace_mapped_ports"}) {
                CAPTURE(per, cache, top);
                auto d = open(top, per, cache, A_TRACE_FIXTURE);
                auto from = port(*d, "d", "outside");
                from.slice.bits = {1, 1};
                auto inside = from;
                inside.side = "inside";
                const auto expected = std::string_view(top) == "trace_mapped_ports" ? 3U : 1U;
                auto to = port(*d, "q", "outside");
                to.slice.bits = {expected, 1};
                auto path = d->paths(from, to);
                const auto &g = graph(path);
                REQUIRE_FALSE(g.edges.empty());
                CHECK(path->completeness.status == "complete");
                CHECK(g.frontier.empty());
                CHECK_FALSE(g.hasConservative);
                CHECK(std::any_of(g.edges.begin(), g.edges.end(), [](const auto &edge) {
                    return edge.kind == "dependency";
                }));
                auto one = d->paths(from, inside, Budget{2, 1, 1, {}});
                CHECK(graph(one).edges.size() == 1);
                CHECK(one->completeness.status == "complete");
                for (auto budget : {Budget{1, 10, 64, {}}, Budget{10, 0, 64, {}}, Budget{10, 10, 0, {}}}) {
                    auto denied = d->paths(from, inside, budget);
                    CHECK(graph(denied).nodes.empty());
                    CHECK(denied->completeness.status == "partial");
                    REQUIRE_FALSE(denied->result.frontier.empty());
                    CHECK(denied->result.frontier[0].point.slice.ref == from.slice.ref);
                    CHECK(denied->result.frontier[0].point.side == "outside");
                    CHECK(denied->result.frontier[0].depth == 0);
                }
                auto other = to;
                other.slice.bits = {(expected + 1) % 4, 1};
                auto absent = d->paths(from, other);
                CHECK(graph(absent).nodes.empty());
                CHECK(absent->completeness.status == "complete");
                // Reverse tracing starts at an outside output and follows the
                // same internal mapping. The const/expr parent remains outside.
                auto reverse = d->cone(to, TraceDirection::Back, TracePolicy::Full);
                CHECK_FALSE(graph(reverse).edges.empty());
                CHECK(reverse->completeness.status == "complete");
                auto plain = d->step(from.slice.ref, false, {from.slice.bits, "local", "outside"});
                REQUIRE(plain);
                for (const auto &hop : plain->result.hops)
                    for (const auto &next : hop.next)
                        CHECK(next.slice.ref != signal(*d, std::string_view(top) == "trace_mapped_ports" ? "hi" : "d", "i:0.0").slice.ref);
            }
}

TEST_CASE("semantic frontier depth counts binding but never boundary visualization", "[a-m3-trace]") {
    for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
            auto d = open("trace_primitive", per, cache, A_TRACE_FIXTURE);
            auto ports = d->ports("i:0.0");
            REQUIRE(ports);
            auto input = std::find_if(ports->begin(), ports->end(), [](const auto &p) {
                return p.direction == Direction::In;
            });
            REQUIRE(input != ports->end());
            TracePoint pin{{input->ref, {0, 1}}, "outside"};
            for (auto policy : {TracePolicy::Combinational, TracePolicy::Full})
                for (bool atPin : {false, true}) {
                    auto from = atPin ? pin : signal(*d, "a");
                    auto reply = d->cone(from, TraceDirection::Forward, policy);
                    const auto &g = graph(reply);
                    REQUIRE(g.frontier.size() == 1);
                    CHECK(g.frontier[0].point.slice.ref == pin.slice.ref);
                    CHECK(g.frontier[0].point.side == "outside");
                    CHECK(g.frontier[0].reason == "unsupported");
                    CHECK(g.frontier[0].depth == (atPin ? 0 : 1));
                }
            auto structural = d->cone(pin, TraceDirection::Forward, TracePolicy::Structural);
            CHECK(graph(structural).frontier.empty());
            CHECK(structural->completeness.status == "complete");
            auto cutoff = d->cone(pin, TraceDirection::Forward, TracePolicy::Full, Budget{10, 10, 0, {}});
            REQUIRE(graph(cutoff).frontier.size() == 1);
            CHECK(cutoff->result.frontier[0].reason == "budget_depth");
            CHECK(cutoff->result.frontier[0].depth == 0);
        }
}
