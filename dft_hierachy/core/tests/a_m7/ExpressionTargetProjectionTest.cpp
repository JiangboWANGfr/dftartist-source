#include "ExpressionTargetProjection.h"
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <random>
#include <tuple>

namespace {
using namespace hier;
using Target = frontend::detail::ExpressionTarget;
using Projection = frontend::detail::ExpressionTargetProjection;
using Segments = std::vector<model::BitMapSegment>;
Segments linear(const std::vector<Target> &targets, const model::Slice &write) {
    Segments result;
    for (const auto &target : targets) {
        if (target.target.ref != write.ref) continue;
        const auto lo = std::max(target.target.bits.lsb, write.bits.lsb);
        const auto hi = std::min(target.target.bits.lsb + target.target.bits.width,
                                 write.bits.lsb + write.bits.width);
        if (lo < hi)
            result.push_back({target.from + lo - target.target.bits.lsb, lo, hi - lo});
    }
    return result;
}
auto values(const Segments &segments) {
    std::vector<std::tuple<uint64_t, uint64_t, uint64_t>> result;
    for (const auto &s : segments) result.emplace_back(s.from, s.to, s.width);
    return result;
}
Segments project(const Projection &projection, const model::Slice &write) {
    Segments result;
    projection.project(write, [&](model::BitMapSegment segment) { result.push_back(segment); });
    return result;
}
} // namespace

TEST_CASE("target projection preserves original fragments and capacity in either lookup path", "[a-m7]") {
    std::mt19937 random(17202);
    for (const size_t count : {0u, 1u, 31u, 32u, 33u, 64u, 129u, 256u}) {
        std::vector<Target> targets;
        for (size_t i = 0; i < count; ++i)
            targets.push_back({{"s::" + std::to_string(random() % 5),
                                {random() % 128, random() % 80}}, random() % 512});
        if (count) targets.back() = targets.front(); // Duplicates are facts, not a set.
        for (const size_t queries : {0u, 1u, 2u, 64u, 4096u}) {
            Projection projection(targets, queries);
            for (size_t i = 0; i < 320; ++i) {
                const model::Slice write{"s::" + std::to_string(random() % 7),
                                         {random() % 192, random() % 96}};
                const auto expected = linear(targets, write), actual = project(projection, write);
                CHECK(values(actual) == values(expected));
                CHECK(actual.capacity() == expected.capacity());
            }
        }
    }
}

TEST_CASE("interval pruning retains long overlapping ranges ties and unsigned boundaries", "[a-m7]") {
    const auto maximum = std::numeric_limits<uint64_t>::max();
    std::vector<Target> targets{{{"s::0", {0, 10000}}, 700},
                                {{"s::0", {1, 4}}, 10}, {{"s::0", {1, 4}}, 10},
                                {{"s::0", {1, 3}}, 10}, {{"", {1, 2}}, 9},
                                {{"s::0", {maximum - 4, 4}}, maximum - 1},
                                {{"s::0", {maximum - 4, 8}}, 1}};
    for (size_t i = 0; i < 256; ++i)
        targets.push_back({{"s::0", {i * 4, i % 13}}, i * 9});
    {
        Projection projection(targets, 4096);
        for (auto from : {uint64_t{0}, uint64_t{1}, uint64_t{2}, uint64_t{1024},
                          uint64_t{9000}, maximum - 3, maximum})
            for (auto width : {uint64_t{0}, uint64_t{1}, uint64_t{4}, uint64_t{32}, maximum})
                for (const auto ref : {"s::0", "", "absent"}) {
                    const model::Slice write{ref, {from, width}};
                    CHECK(values(project(projection, write)) == values(linear(targets, write)));
                }
    }
    // The helper returns owning values; neither the index nor target strings
    // escape through the published segments.
    Segments result;
    {
        Projection scoped(targets, 4096);
        result = project(scoped, {"s::0", {1, 3}});
    }
    const auto expected = values(linear(targets, {"s::0", {1, 3}}));
    targets.clear();
    targets.shrink_to_fit();
    CHECK(values(result) == expected);
}

TEST_CASE("large reversed targets retain original ordinals and exact clipping", "[a-m7]") {
    std::vector<Target> targets;
    for (size_t i = 0; i < 32768; ++i)
        targets.push_back({{"s::" + std::to_string(i % 2), {32767 - i, 1}}, i});
    Projection projection(targets, 32768);
    for (size_t i = 0; i < 32768; ++i) {
        auto actual = project(projection, {"s::" + std::to_string(i % 2), {32767 - i, 1}});
        REQUIRE(actual.size() == 1);
        CHECK(actual[0].from == i);
        CHECK(actual[0].to == 32767 - i);
        CHECK(actual[0].width == 1);
    }
}
