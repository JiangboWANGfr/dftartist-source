#include "HierarchyPath.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <functional>
#include <random>

using namespace hier;
namespace {
using detail::PathSegment;
void compare(std::span<const std::string> texts, std::span<const PathSegment> expected) {
    detail::HierarchyPathMatcher matcher(expected);
    for (const auto &text : texts) {
        const auto parsed = detail::parseHierarchyPath(text);
        const auto scalar = detail::matchHierarchyPathSegments(text, expected);
        const auto actual = matcher.match(text);
        REQUIRE(bool(actual) == bool(parsed));
        CHECK(actual == scalar);
        if (actual)
            CHECK(*actual == (std::span(parsed->segments).size() == expected.size() &&
                  std::equal(parsed->segments.begin(), parsed->segments.end(), expected.begin())));
        else {
            CHECK(parsed.error().code == ErrorCode::BadRequest);
            CHECK(parsed.error().message == "invalid hierarchy path syntax");
        }
    }
}
}

TEST_CASE("ordinary signal names use the same grammar and complete segment semantics", "[a-m7]") {
    std::vector<std::string> texts{"", "a", "A", "_", "a$b0", "$a", "0a", "a[0]", "a[-0]",
        " a", "a ", "/a", "a/b", "a.b", "\\a.b ", "\\a$b0 ", "\\a", "a..b",
        "a[2147483648]", "a[-2147483649]", "a[+2147483647]", "a[-2147483648]",
        std::string("a\0b", 3), std::string("\\a\0b ", 5), std::string("a\xff", 2)};
    const std::string alphabet = "aA_0$";
    std::function<void(std::string, size_t)> add = [&](std::string value, size_t depth) {
        texts.push_back(value);
        if (depth)
            for (char byte : alphabet) add(value + byte, depth - 1);
    };
    add("", 6);
    const std::vector<std::vector<PathSegment>> targets{
        {}, {{"a", {}}}, {{"a", {0}}}, {{"a", {}}, {"b", {}}},
        {{"a$b0", {}}}, {{"a.b", {}}}, {{std::string("a\0b", 3), {}}}};
    for (const auto &target : targets) {
        compare(texts, target);
        std::reverse(texts.begin(), texts.end());
        compare(texts, target);
    }
    const std::vector<PathSegment> name{{"a$b0", {}}};
    detail::HierarchyPathMatcher matcher(name);
    CHECK(matcher.match("a$b0") == std::optional<bool>{true});
    CHECK(matcher.match("a$b0[0]") == std::optional<bool>{false});
    CHECK(matcher.match("a$b0..bad") == std::nullopt);
    CHECK(matcher.match("a$b0") == std::optional<bool>{true});
}

TEST_CASE("known mismatches still validate every tail and restore only unchanged prefixes", "[a-m7]") {
    std::vector<std::string> texts{
        "g[0].wrong[2].leaf", "g[0].wrong[2].other", "g[0].right[4].leaf",
        "g[0].right[4].leaf[0]", "g[0].right[4].leaf", "g[1].right[4].leaf",
        "g[1].right[4].other", "g[0].right[4].leaf", "g[0].wrong[2].leaf[2147483648]",
        "g[0].wrong[2].leaf", "g[0].wrong[2].\\unterminated", "g[0].wrong[2].",
        "g[0].right[4].leaf", "leaf", "g[0].right[4].leaf", "g[0].right[4].\\a.b ",
        "g[0].right[4].\\a.b .tail", "g[0].right[4].\\a.b .wrong", "g[0].right[4].leaf"};
    const std::vector<PathSegment> target{{"g", {0}}, {"right", {4}}, {"leaf", {}}};
    compare(texts, target);
    std::mt19937 random(0x8c75);
    std::string prefix;
    std::vector<PathSegment> deep;
    for (int i = 0; i < 64; ++i) {
        prefix += "g" + std::to_string(i) + "[0].";
        deep.push_back({"g" + std::to_string(i), {0}});
    }
    deep.push_back({"leaf", {}});
    for (int i = 0; i < 1500; ++i) {
        std::string text = prefix + (i % 3 ? "wrong" : "leaf");
        if (i % 5 == 0) text.replace(0, 2, "other");
        if (i % 7 == 0) text += "[2147483648]";
        if (i % 11 == 0) text.resize(size_t(random()) % text.size());
        texts.push_back(std::move(text));
        texts.push_back(i % 2 ? "leaf" : "wrong");
    }
    compare(texts, deep);
    std::shuffle(texts.begin(), texts.end(), random);
    compare(texts, deep);
    std::reverse(texts.begin(), texts.end());
    compare(texts, deep);
    compare(texts, target);
    compare(texts, {});
}
