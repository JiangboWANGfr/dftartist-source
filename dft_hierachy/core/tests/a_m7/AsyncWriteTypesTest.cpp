#include "AsyncWriteTypes.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <limits>
#include <tuple>

using hier::frontend::detail::AsyncWriteTypes;

TEST_CASE("async classification intervals match the original per-bit conflict model", "[a-m7]") {
    AsyncWriteTypes actual;
    std::map<std::tuple<std::string, uint64_t, std::string>, std::string> expected;
    const std::array<std::string, 3> refs{"s::0", "s::1", "s::2"};
    const std::array<std::string, 3> events{"s::clk", "s::reset", "s::preset"};
    const std::array<std::string, 4> types{"reset", "set", "unknown", ""};
    uint64_t random = 112233;
    auto next = [&] {
        random = random * 6364136223846793005ULL + 1442695040888963407ULL;
        return random >> 32;
    };
    for (size_t step = 0; step < 4000; ++step) {
        const auto &ref = refs[next() % refs.size()], &event = events[next() % events.size()];
        const auto start = next() % 48, width = next() % (49 - start);
        const auto &type = types[next() % types.size()];
        actual.record(ref, {start, width}, event, type);
        for (uint64_t bit = start; bit < start + width; ++bit) {
            auto [at, inserted] = expected.try_emplace(std::tuple{ref, bit, event}, type);
            if (!inserted && at->second != type)
                at->second = "unknown";
        }
        for (const auto &object : refs)
            for (const auto &source : events)
                for (uint64_t bit = 0; bit < 48; ++bit) {
                    const auto found = expected.find({object, bit, source});
                    const auto wanted = found == expected.end() ? std::string_view{}
                                                               : std::string_view(found->second);
                    CHECK(actual.typeAt(object, bit, source) == wanted);
                }
        CHECK(actual.spanCount() <= expected.size());
    }
}

TEST_CASE("async classification storage follows boundaries not possible target width", "[a-m7]") {
    AsyncWriteTypes types;
    const uint64_t width = 1ULL << 50;
    for (size_t i = 0; i < 100; ++i)
        types.record("s::q", {8, width}, "s::rst", "reset");
    REQUIRE(types.spanCount() == 1);
    CHECK(types.typeAt("s::q", 7, "s::rst").empty());
    CHECK(types.typeAt("s::q", 8, "s::rst") == "reset");
    CHECK(types.typeAt("s::q", width + 7, "s::rst") == "reset");
    CHECK(types.typeAt("s::q", width + 8, "s::rst").empty());
    types.record("s::q", {16, 32}, "s::rst", "set");
    REQUIRE(types.spanCount() == 3);
    CHECK(types.typeAt("s::q", 15, "s::rst") == "reset");
    CHECK(types.typeAt("s::q", 16, "s::rst") == "unknown");
    CHECK(types.typeAt("s::q", 47, "s::rst") == "unknown");
    CHECK(types.typeAt("s::q", 48, "s::rst") == "reset");
    types.record("s::other", {8, width}, "s::rst", "set");
    types.record("s::q", {8, width}, "s::preset", "set");
    REQUIRE(types.spanCount() == 5);
    CHECK(types.typeAt("s::other", 16, "s::rst") == "set");
    CHECK(types.typeAt("s::q", 16, "s::preset") == "set");
    CHECK(types.typeAt("s::missing", 16, "s::rst").empty());
    CHECK(types.spanCount() == 5);
    types.clear();
    CHECK(types.spanCount() == 0);
    CHECK(types.typeAt("s::q", 16, "s::rst").empty());
}

TEST_CASE("async classification handles empty values, borrowed input and coordinate bounds", "[a-m7]") {
    AsyncWriteTypes types;
    types.record("q", {0, 4}, "rst", "");
    types.record("q", {1, 2}, "rst", "reset");
    CHECK(types.typeAt("q", 0, "rst").empty());
    CHECK(types.typeAt("q", 1, "rst") == "unknown");
    types.clear();
    types.record("q", {0, 4}, "rst", "reset");
    types.record("q", {8, 4}, "rst", "set");
    types.record("q", {0, 12}, "rst", types.typeAt("q", 0, "rst"));
    CHECK(types.typeAt("q", 6, "rst") == "reset");
    CHECK(types.typeAt("q", 9, "rst") == "unknown");
    types.clear();
    const auto maximum = std::numeric_limits<uint64_t>::max();
    types.record("q", {maximum - 4, 4}, "rst", "reset");
    types.record("q", {maximum - 3, 1}, "rst", "set");
    REQUIRE(types.spanCount() == 3);
    CHECK(types.typeAt("q", maximum - 4, "rst") == "reset");
    CHECK(types.typeAt("q", maximum - 3, "rst") == "unknown");
    CHECK(types.typeAt("q", maximum - 1, "rst") == "reset");
    CHECK(types.typeAt("q", maximum, "rst").empty());
    types.record("unused", {maximum, 0}, "rst", "reset");
    CHECK_THROWS_AS(types.record("unused", {maximum, 1}, "rst", "reset"), std::overflow_error);
    CHECK(types.spanCount() == 3);
}
