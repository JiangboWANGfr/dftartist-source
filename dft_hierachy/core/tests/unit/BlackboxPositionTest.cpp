// Independent M2 API KAT: DESIGN 4.4 rules 1/2 and positional/library contract.
// No implementation includes; expectations follow fixture arguments and library order.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include "hier/model/Library.h"

using namespace hier;

namespace {
struct ReviewLibrary final : model::LibraryProvider {
    std::optional<model::CellInfo> cell(std::string_view name) const override {
        if (name != "absent_review") return {};
        model::CellInfo result;
        result.pins = {{"A", model::Direction::In, 1, {}},
                       {"X", model::Direction::In, 1, {}},
                       {"Y", model::Direction::Out, 1, {}}};
        return result;
    }
};

void check(bool perInstance, bool withLibrary, std::string_view top) {
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/m2/review_edges.sv"};
    options.tops = {std::string(top)};
    options.forcePerInstanceBodies = perInstance;
    if (withLibrary) options.library = std::make_shared<ReviewLibrary>();
    auto opened = Design::open(options);
    REQUIRE(opened.ok());
    auto design = std::move(opened.value());
    CHECK(design->diagnostics().errorCount == 0);
    const auto roots = design->roots();
    REQUIRE(roots.size() == 1);
    auto children = design->children(roots[0].ref);
    REQUIRE(children.ok());
    REQUIRE(children->items.size() == 1);
    const auto child = children->items[0].ref;
    auto ports = design->ports(child);
    auto netlist = design->bindings(roots[0].ref);
    auto signals = design->signals(roots[0].ref);
    REQUIRE(ports.ok());
    REQUIRE(netlist.ok());
    REQUIRE(signals.ok());
    REQUIRE(ports->size() == 3);
    REQUIRE(netlist->bindings.size() == 3);
    std::string a, y;
    for (const auto& s : signals->items) {
        if (s.name == "a") a = s.ref;
        if (s.name == "y") y = s.ref;
    }
    REQUIRE_FALSE(a.empty());
    REQUIRE_FALSE(y.empty());
    for (size_t i = 0; i < 3; ++i) {
        const auto& p = (*ports)[i];
        const auto& b = netlist->bindings[i];
        const std::string wanted = withLibrary || top == "named_blackbox" ?
                                  std::vector<std::string>{"A", "X", "Y"}[i] : "";
        CHECK(p.name == wanted);
        CHECK(b.port == wanted);
        CHECK(b.pin == p.ref);
        CHECK(b.inst == child);
        CHECK(b.direction == (withLibrary ? (i == 2 ? "out" : "in") : "unknown"));
        if (i == 1 && !withLibrary) {
            CHECK_FALSE(b.width.has_value());
            CHECK(b.segments.empty());
            CHECK(b.unresolved == "unknown_pin_width");
            continue;
        }
        REQUIRE(b.width.has_value());
        CHECK(*b.width == 1);
        REQUIRE(b.segments.size() == 1);
        const auto& s = b.segments[0];
        CHECK(s.pinBits == model::BitRange{0, 1});
        if (i == 1) {
            CHECK(s.target.kind == "unconnected");
        } else {
            CHECK(s.target.kind == "signal");
            CHECK(s.target.signal == (i == 0 ? a : y));
            CHECK(s.target.bits == model::BitRange{0, 1});
        }
    }
    // Stable identities even for unnamed and explicitly empty positional arguments.
    CHECK((*ports)[0].ref != (*ports)[1].ref);
    CHECK((*ports)[1].ref != (*ports)[2].ref);
}
}

TEST_CASE("B C38: positional gap survives without a library", "[b-review-api]") {
    for (bool perInstance : {false, true}) check(perInstance, false, "positional_gap");
}
TEST_CASE("B C38: named gap survives without a library", "[b-review-api]") {
    for (bool perInstance : {false, true}) check(perInstance, false, "named_blackbox");
}
TEST_CASE("B C38: positional arguments match library declaration order", "[b-review-api]") {
    for (bool perInstance : {false, true}) check(perInstance, true, "positional_gap");
}
TEST_CASE("B C38: named arguments match the same library mapping", "[b-review-api]") {
    for (bool perInstance : {false, true}) check(perInstance, true, "named_blackbox");
}
