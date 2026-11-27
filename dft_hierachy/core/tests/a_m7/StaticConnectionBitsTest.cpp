#include "StaticConnectionBits.h"
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <tuple>

using hier::frontend::detail::StaticConnectionBits;
using hier::model::BindSegment;
using hier::model::BindTarget;
using Dense = std::vector<BindTarget>;

namespace {
bool equal(const BindTarget &a, const BindTarget &b) {
    return std::tie(a.kind, a.signal, a.value, a.process, a.reason, a.bits) ==
           std::tie(b.kind, b.signal, b.value, b.process, b.reason, b.bits);
}
// Original cda4349 coalescer: independent dense input, including its literal
// construction/capacity behavior. This is test oracle code, not a second runtime.
std::vector<BindSegment> legacySegments(const Dense &bits) {
    std::vector<BindSegment> result;
    for (size_t i = 0; i < bits.size(); ++i) {
        auto t = bits[i];
        if (!result.empty()) {
            auto &prev = result.back();
            auto &a = prev.target;
            if (a.kind == t.kind && ((a.kind == "signal" && a.signal == t.signal &&
                                      a.bits.lsb + a.bits.width == t.bits.lsb) ||
                                     a.kind == "const" || a.kind == "unconnected")) {
                ++prev.pinBits.width;
                if (a.kind == "signal")
                    ++a.bits.width;
                if (a.kind == "const")
                    a.value = std::to_string(prev.pinBits.width) + "'b" + t.value.back() +
                              a.value.substr(a.value.find('b') + 1);
                continue;
            }
        }
        result.push_back({{i, 1}, std::move(t)});
    }
    return result;
}
void check(const StaticConnectionBits &actual, const Dense &expected) {
    REQUIRE(actual.size() == expected.size());
    for (size_t i = 0; i < expected.size(); ++i) {
        CAPTURE(i);
        CHECK(equal(actual.bit(i), expected[i]));
    }
    const auto segments = actual.segments(), reference = legacySegments(expected);
    REQUIRE(segments.size() == reference.size());
    CHECK(segments.capacity() == reference.capacity());
    for (size_t i = 0; i < reference.size(); ++i) {
        CAPTURE(i, reference[i].pinBits.width, reference[i].target.value);
        CHECK(segments[i].pinBits == reference[i].pinBits);
        CHECK(equal(segments[i].target, reference[i].target));
        CHECK(segments[i].target.value.capacity() == reference[i].target.value.capacity());
    }
    uint64_t covered = 0;
    for (const auto &range : actual.ranges()) {
        CHECK(range.pinBits.lsb == covered);
        REQUIRE(range.pinBits.width > 0);
        covered += range.pinBits.width;
    }
    CHECK(covered == actual.size());
}
BindTarget constant(char digit) {
    BindTarget result;
    result.kind = "const";
    result.value = std::string("1'b") + digit;
    return result;
}
Dense slice(const Dense &input, size_t from, size_t width) {
    Dense result;
    if (from < input.size())
        for (size_t i = 0; i < std::min(width, input.size() - from); ++i)
            result.push_back(input[from + i]);
    return result;
}
struct Random {
    uint64_t state = 927461;
    uint64_t next() {
        state = state * 6364136223846793005ULL + 1442695040888963407ULL;
        return state >> 32;
    }
    std::pair<StaticConnectionBits, Dense> bits(size_t width) {
        StaticConnectionBits actual;
        Dense expected;
        while (expected.size() < width) {
            const auto count = std::min<size_t>(1 + next() % 12, width - expected.size());
            const auto kind = next() % 3;
            const auto start = next() % 16;
            const auto ref = "s::" + std::to_string(next() % 3);
            std::string digits;
            for (size_t i = 0; i < count; ++i)
                digits += "01xz"[next() % 4];
            if (kind == 0)
                actual.append(StaticConnectionBits::signal(ref, {start, count}));
            else if (kind == 1)
                actual.append(StaticConnectionBits::constant(digits));
            else
                actual.append(count, {});
            for (size_t i = 0; i < count; ++i) {
                BindTarget target;
                if (kind == 0) {
                    target.kind = "signal";
                    target.signal = ref;
                    target.bits = {start + i, 1};
                } else if (kind == 1)
                    target = constant(digits[count - 1 - i]);
                expected.push_back(std::move(target));
            }
        }
        return {std::move(actual), std::move(expected)};
    }
};
} // namespace

TEST_CASE("static connection algebra and published capacities match the original dense model", "[a-m7]") {
    Random random;
    for (size_t step = 0; step < 1200; ++step) {
        CAPTURE(step);
        auto [a, dense] = random.bits(random.next() % 65);
        auto [b, other] = random.bits(random.next() % 45);
        check(a, dense);
        const auto from = random.next() % 80, width = random.next() % 90;
        check(a.slice(from, width), slice(dense, from, width));
        const bool sign = random.next() % 2;
        auto resized = dense;
        resized.resize(width, sign && !dense.empty() ? dense.back() : constant('0'));
        check(a.resized(width, sign), resized);
        Dense repeated;
        if (!dense.empty())
            for (size_t i = 0; i < width; ++i)
                repeated.push_back(dense[i % dense.size()]);
        check(a.repeated(width), repeated);
        a.append(b);
        dense.insert(dense.end(), other.begin(), other.end());
        check(a, dense);
        if (step % 17 == 0) {
            const auto copy = dense;
            a.append(a);
            dense.insert(dense.end(), copy.begin(), copy.end());
            check(a, dense);
        }
    }
}

TEST_CASE("constant chunks retain old text and capacity across size-class boundaries", "[a-m7]") {
    Random random;
    std::vector<size_t> widths;
    for (size_t n = 1; n <= 96; ++n)
        widths.push_back(n);
    for (size_t n : {127U, 128U, 255U, 256U, 511U, 512U, 1024U, 4096U})
        widths.push_back(n);
    for (auto width : widths) {
        CAPTURE(width);
        std::string digits;
        Dense expected;
        for (size_t i = 0; i < width; ++i)
            digits += "01xz"[random.next() % 4];
        for (size_t i = 0; i < width; ++i)
            expected.push_back(constant(digits[width - 1 - i]));
        const auto actual = StaticConnectionBits::constant(digits);
        check(actual, expected);
        StaticConnectionBits pieces;
        for (size_t offset = 0; offset < width; offset += 7)
            pieces.append(actual.slice(offset, std::min<size_t>(7, width - offset)));
        check(pieces, expected);
    }
}

TEST_CASE("static connection slices own values and uniform signals follow range boundaries", "[a-m7]") {
    const uint64_t width = 1ULL << 50;
    auto actual = StaticConnectionBits::signal("s", {7, width});
    REQUIRE(actual.ranges().size() == 1);
    REQUIRE(actual.segments().size() == 1);
    auto part = actual.slice(width - 4, std::numeric_limits<uint64_t>::max());
    CHECK(part.size() == 4);
    CHECK(part.bit(0).bits == hier::model::BitRange{width + 3, 1});
    actual.append(StaticConnectionBits::constant("xz"));
    CHECK(part.bit(3).bits == hier::model::BitRange{width + 6, 1});
    CHECK(actual.slice(std::numeric_limits<uint64_t>::max(), 1).empty());
    auto sign = StaticConnectionBits::signal("s", {3, 1}).resized(64, true);
    CHECK(sign.segments().size() == 64);
    CHECK(sign.bit(63).bits == hier::model::BitRange{3, 1});
    auto repeated = StaticConnectionBits::constant("xz").repeated(65536);
    CHECK(repeated.ranges().size() == 1);
    CHECK(repeated.segments().front().target.value.size() == 65543);
    const auto maximum = std::numeric_limits<uint64_t>::max();
    auto edge = StaticConnectionBits::signal("s", {maximum - 4, 4});
    CHECK(edge.slice(2, maximum).bit(1).bits == hier::model::BitRange{maximum - 1, 1});
    CHECK_THROWS_AS(StaticConnectionBits::signal("s", {maximum - 1, 2}), std::overflow_error);
    CHECK_THROWS_AS(actual.append(maximum, {}), std::overflow_error);
    BindTarget invalid;
    invalid.kind = "const";
    invalid.value = "2'b0";
    CHECK_THROWS_AS(actual.append(2, invalid), std::logic_error);
    CHECK(actual.size() == width + 2);
}
