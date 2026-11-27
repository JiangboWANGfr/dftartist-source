#include "DependencyBits.h"
#include "WriteIntervals.h"
#include <catch2/catch_test_macros.hpp>
#include <limits>

using hier::frontend::detail::DependencyBits;
using hier::frontend::detail::Dependencies;
using hier::frontend::detail::WriteIntervals;
using Dense = std::vector<Dependencies>;

namespace {
void merge(Dependencies &dest, const Dependencies &incoming) {
    for (const auto &dep : incoming)
        if (std::find(dest.begin(), dest.end(), dep) == dest.end())
            dest.push_back(dep);
}
Dense resize(Dense in, size_t width, bool sign = false) {
    auto last = sign && !in.empty() ? in.back() : Dependencies{};
    in.resize(width, last);
    return in;
}
Dense slice(const Dense &in, size_t from, size_t width) {
    if (from >= in.size())
        return {};
    Dense result;
    for (size_t i = 0; i < std::min(width, in.size() - from); ++i)
        result.push_back(in[from + i]);
    return result;
}
void check(const DependencyBits &actual, const Dense &expected) {
    REQUIRE(actual.size() == expected.size());
    for (size_t i = 0; i < expected.size(); ++i)
        CHECK(actual.bit(i) == expected[i]);
    uint64_t end = 0;
    for (const auto &range : actual.ranges()) {
        REQUIRE(range.begin == end);
        REQUIRE(range.end > range.begin);
        end = range.end;
        for (const auto &dep : range.deps)
            if (dep.align == "bitwise")
                CHECK(dep.bits.width == range.end - range.begin);
    }
    CHECK(end == actual.size());
}
struct Random {
    uint64_t state = 348917;
    uint64_t next() {
        state = state * 6364136223846793005ULL + 1442695040888963407ULL;
        return state >> 32;
    }
    std::pair<DependencyBits, Dense> bits(size_t width) {
        DependencyBits actual;
        Dense expected;
        while (expected.size() < width) {
            const auto count = std::min<size_t>(1 + next() % 12, width - expected.size());
            Dependencies deps;
            for (size_t i = 0, n = next() % 4; i < n; ++i) {
                const bool linear = next() % 2;
                deps.push_back({"s::" + std::to_string(next() % 4),
                                {next() % 16, linear ? count : 1 + next() % 8},
                                next() % 2 ? "data" : "control",
                                next() % 2 ? "exact" : "conservative",
                                linear ? "bitwise" : "all"});
                if (next() % 4 == 0)
                    deps.push_back(deps.back()); // duplicates/order are observable before union
            }
            actual.append(count, deps);
            for (size_t bit = 0; bit < count; ++bit) {
                auto point = deps;
                for (auto &dep : point)
                    if (dep.align == "bitwise") {
                        dep.bits.lsb += bit;
                        dep.bits.width = 1;
                    }
                expected.push_back(std::move(point));
            }
        }
        return {std::move(actual), std::move(expected)};
    }
};
} // namespace

TEST_CASE("expression ranges match independent dense algebra including dependency order", "[a-m7]") {
    Random random;
    for (size_t step = 0; step < 1500; ++step) {
        const auto width = random.next() % 65;
        auto [a, left] = random.bits(width);
        auto [b, right] = random.bits(width);
        check(a, left);
        const auto from = random.next() % 80, count = random.next() % 90;
        check(a.slice(from, count), slice(left, from, count));
        const bool sign = random.next() % 2;
        check(a.resized(count, sign), resize(left, count, sign));
        Dense combined(width);
        for (size_t i = 0; i < width; ++i) {
            merge(combined[i], left[i]);
            merge(combined[i], right[i]);
        }
        check(a.united(b), combined);
        Dense repeated(count);
        if (width)
            for (size_t i = 0; i < count; ++i)
                repeated[i] = left[i % width];
        check(a.repeated(count), repeated);
        a.append(b);
        left.insert(left.end(), right.begin(), right.end());
        check(a, left);
        if (step % 17 == 0) {
            a.append(a);
            const auto copy = left;
            left.insert(left.end(), copy.begin(), copy.end());
            check(a, left);
        }
    }
}

TEST_CASE("projected writes match the old per-bit overwrite and control union", "[a-m7]") {
    Random random;
    WriteIntervals actual;
    std::map<std::pair<std::string, uint64_t>, Dependencies> expected;
    for (size_t step = 0; step < 2000; ++step) {
        auto [data, dense] = random.bits(random.next() % 25);
        const auto ref = "s::" + std::to_string(random.next() % 3);
        const auto start = random.next() % 24;
        const bool replace = random.next() % 3 == 0;
        const Dependencies control{{"ctrl", {2, 1}, "control", "exact",
                                    random.next() % 4 ? "all" : "bitwise"}};
        for (const auto &range : data.ranges()) {
            const hier::model::BitRange target{start + range.begin, range.end - range.begin};
            if (replace)
                actual.assignProjected(ref, target, range.deps);
            else
                actual.addProjected(ref, target, range.deps, control);
        }
        for (size_t i = 0; i < dense.size(); ++i) {
            auto &dest = expected[{ref, start + i}];
            if (replace)
                dest = dense[i];
            else {
                merge(dest, dense[i]);
                merge(dest, control);
            }
        }
        std::map<std::pair<std::string, uint64_t>, Dependencies> expanded;
        for (const auto &[key, range] : actual.entries()) {
            REQUIRE(range.end > key.second);
            for (auto bit = key.second; bit < range.end; ++bit) {
                auto point = range.deps;
                for (auto &dep : point)
                    if (dep.align == "bitwise") {
                        dep.bits.lsb += bit - key.second;
                        dep.bits.width = 1;
                    }
                REQUIRE(expanded.emplace(std::pair{key.first, bit}, std::move(point)).second);
            }
        }
        CHECK(expanded == expected);
    }
}

TEST_CASE("expression range boundaries are owned, clipped and do not expand uniform widths", "[a-m7]") {
    const uint64_t width = 1ULL << 50;
    DependencyBits bits(width, {{"s", {8, width}, "data", "exact", "bitwise"}});
    REQUIRE(bits.ranges().size() == 1);
    auto part = bits.slice(width - 4, std::numeric_limits<uint64_t>::max());
    REQUIRE(part.size() == 4);
    CHECK(part.bit(0).front().bits.lsb == width + 4);
    bits.append(7, {});
    REQUIRE(bits.ranges().size() == 2);
    CHECK(part.bit(3).front().bits.lsb == width + 7); // independent owned slice
    CHECK(bits.slice(std::numeric_limits<uint64_t>::max(), 9).empty());
    auto empty = DependencyBits(1).repeated(width);
    REQUIRE(empty.ranges().size() == 1);
    CHECK(empty.size() == width);
    DependencyBits all(width, {{"c", {0, 5}, "control", "exact", "all"}});
    auto combined = all.united(DependencyBits(width));
    REQUIRE(combined.ranges().size() == 1);
    CHECK(combined.bit(width - 1) == all.bit(0));
    DependencyBits sign(1, {{"s", {3, 1}, "data", "exact", "bitwise"}});
    REQUIRE(sign.resized(64, true).ranges().size() == 64);
    CHECK(sign.resized(64, true).bit(63) == sign.bit(0));
    CHECK_THROWS_AS(sign.united(DependencyBits(2)), std::logic_error);
    CHECK_THROWS_AS(bits.append(2, {{"s", {0, 1}, "data", "exact", "bitwise"}}), std::logic_error);
    CHECK_THROWS_AS(bits.append(std::numeric_limits<uint64_t>::max(), {}), std::overflow_error);
    CHECK_THROWS_AS(DependencyBits(2, {{"s", {std::numeric_limits<uint64_t>::max() - 1, 2},
                                      "data", "exact", "bitwise"}}), std::overflow_error);
    CHECK(bits.size() == width + 7);
}

TEST_CASE("projected merge deduplicates incoming accesses while replacement preserves duplicates", "[a-m7]") {
    const hier::model::Dep input{"s", {4, 2}, "data", "exact", "bitwise"};
    WriteIntervals writes;
    writes.addProjected("q", {0, 2}, {input, input}, {});
    REQUIRE(writes.entries().size() == 1);
    CHECK(writes.entries().begin()->second.deps == Dependencies{input});
    writes.assignProjected("q", {0, 2}, {input, input});
    CHECK(writes.entries().begin()->second.deps == Dependencies{input, input});
    writes.addProjected("q", {0, 2}, {input, input}, {});
    CHECK(writes.entries().begin()->second.deps == Dependencies{input, input});
}
