// Independent C-37 API KAT. Library directions are inputs, never guessed from names.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include "hier/model/Library.h"
#include <set>

using namespace hier;

namespace {
struct DirectionLibrary final : model::LibraryProvider {
    model::Direction direction;
    explicit DirectionLibrary(model::Direction value) : direction(value) {}
    std::optional<model::CellInfo> cell(std::string_view name) const override {
        if (name != "absent_follow") return {};
        model::CellInfo result;
        result.pins = {{"Y", direction, 1, {}}};
        return result;
    }
};

void check(std::string top, bool perInstance, model::Direction direction,
           std::string directionText, std::set<std::string> wanted) {
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/m2/review_followup.sv"};
    options.tops = {top};
    options.forcePerInstanceBodies = perInstance;
    options.library = std::make_shared<DirectionLibrary>(direction);
    auto opened = Design::open(options);
    REQUIRE(opened.ok());
    auto design = std::move(opened.value());
    CHECK(design->diagnostics().errorCount == 0);
    const auto roots = design->roots();
    REQUIRE(roots.size() == 1);
    const auto owner = roots[0].ref;
    auto children = design->children(owner);
    REQUIRE(children.ok());
    std::string target, box;
    for (const auto& c : children->items) {
        if (c.name == "u") target = c.ref;
        if (c.name == "v") box = c.ref;
    }
    REQUIRE_FALSE(target.empty());
    REQUIRE_FALSE(box.empty());
    auto signals = design->signals(target);
    REQUIRE(signals.ok());
    REQUIRE(signals->items.size() == 1);
    const auto ref = signals->items[0].ref;
    CHECK(signals->items[0].name == "s");
    auto netlist = design->bindings(owner);
    REQUIRE(netlist.ok());
    REQUIRE(netlist->bindings.size() == 1);
    const auto& binding = netlist->bindings[0];
    CHECK(binding.inst == box);
    CHECK(binding.port == "Y");
    CHECK(binding.direction == directionText);

    auto sources = design->procs(owner);
    REQUIRE(sources.ok());
    std::set<std::string> roles;
    for (const auto& summary : sources->items) {
        auto source = design->proc(summary.ref);
        REQUIRE(source.ok());
        bool external = false;
        for (const auto& entry : source->result.externalRefs) {
            if (entry.text != "u.s") continue;
            external = true;
            roles.insert(entry.access);
        }
        if (external) {
            CHECK(source->completeness.status == "partial");
            bool found = false;
            for (const auto& r : source->completeness.reasons)
                found |= r.code == "hier_ref" && r.at == summary.ref;
            CHECK(found);
        }
    }
    CHECK(roles == wanted);
    for (const auto& reach : {"local", "hier"}) {
        ConnectionRequest request;
        request.reach = reach;
        for (bool read : {false, true}) {
            auto reply = read ? design->loads(ref, request) : design->drivers(ref, request);
            REQUIRE(reply.ok());
            const bool expected = wanted.contains(read ? "read" : "write");
            CHECK(reply->completeness.status == (expected ? "partial" : "complete"));
            bool found = false;
            for (const auto& r : reply->completeness.reasons)
                found |= r.code == "hier_ref" && r.at == ref;
            CHECK(found == expected);
            if (!expected) CHECK(reply->result.empty());
        }
    }
    // Source facts must not silently pass comparison after losing an external role.
    auto facts = design->verifyFacts();
    CHECK(facts.mismatched == 0);
    CHECK(facts.skippedExternal > 0);
}

void modes(model::Direction direction, std::string text, std::set<std::string> roles) {
    for (bool perInstance : {false, true}) {
        for (const auto& top : {"library_named", "library_position"}) {
            DYNAMIC_SECTION("mode=" << perInstance << ", top=" << top) {
                check(top, perInstance, direction, text, roles);
            }
        }
    }
}
}

TEST_CASE("B C37: library input preserves external read direction", "[b-followup-api]") {
    modes(model::Direction::In, "in", {"read"});
}
TEST_CASE("B C37: library output preserves external write direction", "[b-followup-api]") {
    modes(model::Direction::Out, "out", {"write"});
}
TEST_CASE("B C37: library inout preserves both external directions", "[b-followup-api]") {
    modes(model::Direction::InOut, "inout", {"read", "write"});
}
TEST_CASE("B C37: library ref preserves both external directions", "[b-followup-api]") {
    modes(model::Direction::Ref, "ref", {"read", "write"});
}
