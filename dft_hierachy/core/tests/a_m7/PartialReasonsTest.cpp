#include "PartialReasons.h"
#include "hier/model/Result.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <type_traits>

using namespace hier;
namespace {
void original(model::Completeness &value, const std::string &code, const std::string &at) {
    value.status = "partial";
    for (const auto &reason : value.reasons)
        if (reason.code == code && reason.at == at)
            return;
    value.reasons.push_back({code, at, {}});
}
void same(const model::Completeness &a, const model::Completeness &b) {
    CHECK(a.status == b.status);
    REQUIRE(a.reasons.size() == b.reasons.size());
    for (size_t i = 0; i < a.reasons.size(); ++i)
        CHECK(std::tie(a.reasons[i].code, a.reasons[i].at, a.reasons[i].detail) ==
              std::tie(b.reasons[i].code, b.reasons[i].at, b.reasons[i].detail));
}
uint64_t word(uint64_t &seed) {
    seed ^= seed << 13;
    seed ^= seed >> 7;
    seed ^= seed << 17;
    return seed;
}
}

TEST_CASE("partial reasons retain first-discovery order complete byte identity and original detail", "[a-m7]") {
    static_assert(!std::is_copy_constructible_v<detail::PartialReasons>);
    static_assert(!std::is_move_constructible_v<detail::PartialReasons>);
    uint64_t seed = 0x482ef17a91ULL;
    for (size_t shape = 0; shape < 32; ++shape) {
        model::Completeness value;
        // Existing duplicates/details are preserved, never normalized away.
        if (shape % 2)
            value.reasons = {{"same", "at", "first"}, {"same", "at", "second"}};
        auto expected = value;
        {
            detail::PartialReasons reasons(value, [] {});
            const std::array<std::string, 7> codes{"", "blackbox", "BLACKBOX", "unsupported",
                "hier_ref", std::string("a\0b", 3), "边界"};
            for (size_t i = 0; i < 2048; ++i) {
                auto code = codes[word(seed) % codes.size()];
                auto at = std::to_string(word(seed) % (shape * 7 + 1));
                if (i % 7 == 0) at += std::string("\0tail", 5);
                if (i % 11 == 0) { code = "same"; at = "at"; }
                reasons.append(code, at);
                original(expected, code, at);
                CHECK(value.reasons.size() == expected.reasons.size());
            }
            reasons.release();
        }
        same(value, expected);
    }
}

TEST_CASE("partial reason metadata survives result growth and short-prefix repetitions", "[a-m7]") {
    model::Completeness value, expected;
    {
        detail::PartialReasons reasons(value, [] {});
        for (size_t i = 0; i < 8192; ++i) {
            const auto at = "p:0." + std::to_string(i) + ":0";
            reasons.append("blackbox", at);
            original(expected, "blackbox", at);
        }
        for (size_t i = 8192; i-- > 0;)
            reasons.append("blackbox", "p:0." + std::to_string(i) + ":0");
        same(value, expected);
        reasons.release();
        auto owned = std::move(value);
        same(owned, expected);
    }
    model::Completeness small;
    size_t checks = 0;
    detail::PartialReasons repeated(small, [&] { ++checks; });
    for (size_t i = 0; i < 8192; ++i)
        repeated.append("blackbox", "first");
    CHECK(small.reasons.size() == 1);
    CHECK(checks <= 3 * 8192);
}

TEST_CASE("partial reason cancellation discards unpublished work and allows retry", "[a-m7]") {
    for (size_t stop : {size_t(1), size_t(32), size_t(256), size_t(270), size_t(1000), size_t(4000)}) {
        model::Completeness value;
        size_t checks = 0;
        bool stopped = false, published = false;
        detail::PartialReasons reasons(value, [&] {
            if (++checks == stop) {
                stopped = true;
                throw Error{ErrorCode::Cancelled, "A reason accumulation cancelled"};
            }
        });
        try {
            for (size_t i = 0; i < 1024; ++i)
                reasons.append("unsupported", std::to_string(i));
            published = true;
        } catch (const Error &error) {
            CHECK(error.code == ErrorCode::Cancelled);
            CHECK(error.message == "A reason accumulation cancelled");
        }
        CHECK(stopped);
        CHECK_FALSE(published);
        // Retry the same accumulator after cancellation, including insertion
        // cancellation after the owning result has already gained a row.
        model::Completeness expected;
        for (size_t i = 0; i < 1024; ++i) {
            const auto at = std::to_string(i);
            reasons.append("unsupported", at);
            original(expected, "unsupported", at);
        }
        reasons.release();
        same(value, expected);
    }
}
