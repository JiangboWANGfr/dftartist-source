// Independent public-API regressions: DESIGN 4.3, 4.8, 5.1, A22/A23.
// Smoke checks do not claim that memory leaks have been measured.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include "hier/model/Schema.h"
#include "hier/protocol/Json.h"

using namespace hier;

namespace {
std::unique_ptr<Design> openFixture() {
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/nav/nav.sv"};
    auto opened = Design::open(options);
    REQUIRE(opened.ok());
    return std::move(opened.value());
}
}

TEST_CASE("independent: public schema version agrees with snapshot and build", "[independent]") {
    auto design = openFixture();
    CHECK(design->snapshot().schemaVersion == model::kSchemaVersion);
    CHECK(buildInfo().schemaVersion == model::kSchemaVersion);
    CHECK(protocol::kProtocolVersion == 2); // DESIGN 5.2
}

TEST_CASE("independent: failed queries do not poison the live design", "[independent]") {
    auto design = openFixture();
    const auto roots = design->roots();
    REQUIRE(roots.size() == 2);
    for (int attempt = 0; attempt < 3; ++attempt) {
        auto invalid = design->instance("i:1..0");
        REQUIRE_FALSE(invalid.ok());
        CHECK(invalid.error().code == ErrorCode::BadRequest);
        auto absent = design->ports("i:99");
        REQUIRE_FALSE(absent.ok());
        CHECK(absent.error().code == ErrorCode::NotFound);
        auto valid = design->instance(roots[0].ref);
        REQUIRE(valid.ok());
        CHECK(valid->pathText == "top_a");
        CHECK(design->roots().size() == 2);
    }
}

TEST_CASE("independent: returned values survive owner destruction", "[independent]") {
    // Public results are values, not dangling views into Slang or DesignDb.
    model::InstInfo retained;
    for (int attempt = 0; attempt < 12; ++attempt) {
        auto design = openFixture();
        auto found = design->instance("i:1.5");
        REQUIRE(found.ok());
        retained = found.value();
        design.reset();
        CHECK(retained.name == "inst.with.dots");
        CHECK(retained.path == std::vector<std::string>{"top_b", "inst.with.dots"});
    }
}

TEST_CASE("independent: caller edits to returned values do not edit facts", "[independent]") {
    auto design = openFixture();
    auto first = design->instance("i:0");
    REQUIRE(first.ok());
    first.value().name = "caller-only";
    first.value().path.clear();
    auto later = design->instance("i:0");
    REQUIRE(later.ok());
    CHECK(later->name == "top_a");
    CHECK(later->path == std::vector<std::string>{"top_a"});
}
