#include "DependencyRanges.h"
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <type_traits>

using hier::frontend::detail::Dependencies;
using hier::frontend::detail::DependencyUnion;
using hier::frontend::detail::appendDependencies;
using hier::model::Dep;

namespace {
// Original ordered union, independent of the production membership index.
void reference(Dependencies &dest, const Dependencies &source) {
    for (const auto &dep : source)
        if (std::find(dest.begin(), dest.end(), dep) == dest.end())
            dest.push_back(dep);
}
void check(const Dependencies &actual, const Dependencies &expected) {
    REQUIRE(actual == expected);
    CHECK(actual.capacity() == expected.capacity());
    for (size_t i = 0; i < expected.size(); ++i) {
        CHECK(actual[i].signal.capacity() == expected[i].signal.capacity());
        CHECK(actual[i].role.capacity() == expected[i].role.capacity());
        CHECK(actual[i].precision.capacity() == expected[i].precision.capacity());
        CHECK(actual[i].align.capacity() == expected[i].align.capacity());
    }
}
struct Random {
    uint64_t state = 436782;
    uint64_t next() {
        state = state * 6364136223846793005ULL + 1442695040888963407ULL;
        return state >> 32;
    }
    Dep dep() {
        return {std::string(next() % 3 == 0 ? 95 : 1, 's') + std::to_string(next() % 4),
                {next() % 4, next() % 5}, next() % 2 ? "data" : "control",
                next() % 2 ? "exact" : "conservative", next() % 2 ? "bitwise" : "all"};
    }
};
} // namespace

TEST_CASE("ordered union preserves all equality fields and existing duplicates", "[a-m7]") {
    const Dep base{"s", {0, 1}, "data", "exact", "all"};
    Dependencies input{base};
    for (size_t field = 0; field < 6; ++field) {
        auto dep = base;
        switch (field) {
        case 0: dep.signal += 'x'; break;
        case 1: ++dep.bits.lsb; break;
        case 2: ++dep.bits.width; break;
        case 3: dep.role = "control"; break;
        case 4: dep.precision = "conservative"; break;
        case 5: dep.align = "bitwise"; break;
        }
        input.push_back(dep);
        input.push_back(dep);
    }
    Dependencies actual{base, base}, expected = actual;
    reference(expected, input);
    appendDependencies(actual, input);
    check(actual, expected);
    CHECK(actual.size() == 8);
    appendDependencies(actual, actual);
    check(actual, expected);
    appendDependencies(actual, {});
    check(actual, expected);
    static_assert(!std::is_copy_constructible_v<DependencyUnion>);
    static_assert(!std::is_move_constructible_v<DependencyUnion>);
}

TEST_CASE("scoped union matches the original ordered model across growth and batches", "[a-m7]") {
    Random random;
    for (size_t scenario = 0; scenario < 600; ++scenario) {
        CAPTURE(scenario);
        Dependencies initial;
        for (size_t i = 0, n = random.next() % 37; i < n; ++i)
            initial.push_back(random.dep());
        Dependencies actual = initial, expected = initial;
        {
            DependencyUnion accesses(actual);
            for (size_t batch = 0; batch < 9; ++batch) {
                Dependencies incoming;
                for (size_t i = 0, n = random.next() % 89; i < n; ++i) {
                    auto dep = random.dep();
                    // Equal values with different source string capacities must
                    // be found, without replacing the original stored value.
                    incoming.push_back(dep);
                    if (i % 7 == 0)
                        incoming.back().signal.reserve(300);
                    if (i % 4 == 0)
                        incoming.push_back(dep);
                }
                reference(expected, incoming);
                accesses.append(incoming);
                check(actual, expected);
                accesses.append(actual);
                check(actual, expected);
            }
        }
        // A fresh builder may borrow a previously accumulated vector.
        auto incoming = initial;
        reference(expected, incoming);
        appendDependencies(actual, incoming);
        check(actual, expected);
    }
}

TEST_CASE("bulk union retains order and capacity for overlapping large sources", "[a-m7]") {
    for (size_t count : {0U, 7U, 8U, 23U, 24U, 256U, 1024U, 8192U}) {
        CAPTURE(count);
        Dependencies source;
        for (size_t i = 0; i < count; ++i)
            source.push_back({"s::" + std::to_string(i),
                              {std::numeric_limits<uint64_t>::max() - i, i},
                              "control", "conservative", "all"});
        Dependencies actual, expected;
        {
            DependencyUnion accesses(actual);
            reference(expected, source);
            accesses.append(source);
            check(actual, expected);
            std::reverse(source.begin(), source.end());
            reference(expected, source);
            accesses.append(source);
            check(actual, expected);
            auto distinct = source;
            for (auto &dep : distinct)
                dep.role = "data";
            reference(expected, distinct);
            accesses.append(distinct);
            check(actual, expected);
        }
    }
}
