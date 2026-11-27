// Agent B D-01 freeze: explicit DESIGN 5.5.4 contract, not an implementation oracle.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include <set>

using namespace hier;
namespace {
struct LoopLibrary final : model::LibraryProvider {
    model::Direction direction;
    std::optional<uint32_t> width;
    explicit LoopLibrary(model::Direction dir, std::optional<uint32_t> bits = 2) : direction(dir), width(bits) {}
    std::optional<model::CellInfo> cell(std::string_view name) const override {
        if (name != "absent_loop") return {};
        model::CellInfo result;
        result.pins = {{"p", direction, width, {{"role", "opaque"}}}};
        return result;
    }
};
std::unique_ptr<Design> openLoop(model::Direction direction, bool per) {
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/m3/expr_boundaries.sv"};
    options.tops = {"loop_blackbox"};
    options.forcePerInstanceBodies = per;
    options.library = std::make_shared<LoopLibrary>(direction);
    auto result = Design::open(options);
    REQUIRE(result.ok());
    auto d = std::move(result.value());
    REQUIRE(d->diagnostics().errorCount == 0);
    return d;
}
model::TracePoint point(Design& d, std::string_view name) {
    REQUIRE(d.roots().size() == 1);
    auto signals = d.signals(d.roots()[0].ref);
    REQUIRE(signals.ok());
    for (const auto& s : signals->items) if (s.name == name) {
        model::TracePoint p;
        p.slice = {s.ref, {0, 1}};
        return p;
    }
    FAIL("missing independent loop net");
    return {};
}
template<class T> void knownRoute(const T& reply, const model::TracePoint& a, const model::TracePoint& y) {
    REQUIRE(reply.ok());
    CHECK(reply->completeness.status == "complete");
    CHECK(reply->completeness.reasons.empty());
    CHECK(reply->result.frontier.empty());
    CHECK(reply->result.hasConservative);
    REQUIRE_FALSE(reply->result.edges.empty());
    std::set<std::string> refs;
    for (const auto& n : reply->result.nodes) if (n.point) refs.insert(n.point->slice.ref);
    CHECK(refs.contains(a.slice.ref));
    CHECK(refs.contains(y.slice.ref));
    size_t internal = 0;
    for (const auto& edge : reply->result.edges) if (edge.kind == "blackbox") {
        ++internal;
        CHECK(edge.precision == "conservative");
        CHECK(edge.align == "all");
        CHECK(edge.role == "data");
        CHECK(edge.map.empty());
    }
    CHECK(internal > 0);
}
}
TEST_CASE("B D01: one inout or ref pin preserves cross-bit routes in both directions", "[b-m3-blackbox-loop]") {
    for (auto direction : {model::Direction::InOut, model::Direction::Ref}) for (bool per : {false, true}) {
        auto d = openLoop(direction, per);
        const auto a = point(*d, "a"), y = point(*d, "y");
        knownRoute(d->paths(a, y), a, y);
        knownRoute(d->paths(y, a), y, a);
        knownRoute(d->cone(a, model::TraceDirection::Forward, model::TracePolicy::Full), a, y);
        knownRoute(d->cone(y, model::TraceDirection::Back, model::TracePolicy::Full), y, a);
    }
}
TEST_CASE("B D01: policy stops and complete same-net zero-edge routes do not invent internal precision", "[b-m3-blackbox-loop]") {
    for (bool per : {false, true}) {
        auto d = openLoop(model::Direction::InOut, per);
        const auto a = point(*d, "a");
        for (auto policy : {model::TracePolicy::Structural, model::TracePolicy::Combinational}) {
            auto reply = d->cone(a, model::TraceDirection::Forward, policy);
            REQUIRE(reply.ok());
            CHECK(reply->completeness.status == "complete");
            CHECK(reply->result.frontier.empty());
            CHECK_FALSE(reply->result.hasConservative);
            for (const auto& edge : reply->result.edges) CHECK(edge.kind != "blackbox");
        }
        model::Budget zero;
        zero.maxDepth = 0;
        auto same = d->paths(a, a, zero);
        REQUIRE(same.ok());
        CHECK(same->completeness.status == "complete");
        CHECK_FALSE(same->result.nodes.empty());
        CHECK(same->result.edges.empty());
        CHECK(same->result.frontier.empty());
        CHECK_FALSE(same->result.hasConservative);
    }
}
TEST_CASE("B D01: unknown direction must not give a complete negative cross-bit proof", "[b-m3-blackbox-loop]") {
    for (bool per : {false, true}) {
        auto d = openLoop(model::Direction::Unknown, per);
        const auto a = point(*d, "a"), y = point(*d, "y");
        auto reply = d->paths(a, y);
        REQUIRE(reply.ok());
        CHECK(reply->completeness.status == "partial");
        bool reason = false;
        for (const auto& r : reply->completeness.reasons) if (r.code == "blackbox") reason = true;
        CHECK(reason);
        CHECK_FALSE(reply->result.frontier.empty());
        for (const auto& edge : reply->result.edges) CHECK(edge.kind != "blackbox");
    }
}
