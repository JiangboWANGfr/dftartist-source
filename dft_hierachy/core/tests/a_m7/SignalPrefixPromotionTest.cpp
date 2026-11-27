#include "HierarchyPath.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <random>

using namespace hier;
namespace {
using detail::PathSegment;
void checkBatch(std::span<const std::string> texts, std::span<const PathSegment> target) {
    detail::HierarchyPathMatcher matcher(target);
    for (const auto &text : texts) {
        auto original = detail::parseHierarchyPath(text);
        auto actual = matcher.match(text);
        detail::HierarchyPathMatcher cold(target);
        CHECK(actual == cold.match(text));
        CHECK(actual == detail::matchHierarchyPathSegments(text, target));
        REQUIRE(bool(actual) == bool(original));
        if (actual)
            CHECK(*actual == (original->segments.size() == target.size() &&
                  std::equal(original->segments.begin(), original->segments.end(), target.begin())));
        else {
            CHECK(original.error().code == ErrorCode::BadRequest);
            CHECK(original.error().message == "invalid hierarchy path syntax");
        }
    }
}
}

TEST_CASE("first signal boundary promotes only an unchanged prefix and never hides an invalid tail", "[a-m7]") {
    const std::vector<PathSegment> target{{"g", {0}}, {"h", {1}}, {"leaf", {}}};
    std::vector<std::string> texts{
        "g[0].h[1].leaf", "g[0].h[1].other", "g[0].h[1].leaf", "g[0].h[2].leaf",
        "g[0].h[1].leaf", "g[1].h[1].leaf", "g[1].h[1].other", "g[0].h[1].leaf",
        "g[0].", "g[0].h[1].leaf", "g[0].h[1].", "g[0].h[1].leaf",
        "g[0].h[1].leaf[2147483648]", "g[0].h[1].leaf", "g[0].h[1].\\unterminated",
        "g[0].h[1].leaf", "leaf", "g[0].h[1].leaf", "g[0].h[1].leaf",
        "g[0][1].h[1].leaf", "g[0][1].h[1].other", "g[0].h[1].leaf",
        "g[0].h[1][2].leaf", "g[0].h[1][2].other", "g[0].h[1].leaf",
        " g[+00] / h[01] . leaf", " g[+00] / h[01] . other", "g[0].h[1].leaf",
        "\\g.h [0].leaf", "\\g.h [0].other", "\\g.h [0].", "g[0].h[1].leaf",
        "g[0].h[1].\\a.b /leaf", "g[0].h[1].\\a.b /other", "g[0].h[1].leaf",
        std::string("g[0].\\a\0b .leaf", 15), std::string("g[0].\\a\0b .other", 16),
        "", "/", "a", "a ", "a[0]", "a[0].b", "a[1].b", "a[1].c", "a[0].b"};
    for (const auto &expected : std::vector<std::vector<PathSegment>>{
        target, {}, {{"a", {0}}, {"b", {}}}, {{"g.h", {0}}, {"leaf", {}}},
        {{"g", {0}}, {std::string("a\0b", 3), {}}, {"leaf", {}}}}) {
        checkBatch(texts, expected);
        std::reverse(texts.begin(), texts.end());
        checkBatch(texts, expected);
    }
    detail::HierarchyPathMatcher matcher(target);
    CHECK(matcher.match("g[0].h[1].leaf") == std::optional<bool>{true});
    CHECK(matcher.match("g[0].h[2].leaf") == std::optional<bool>{false});
    CHECK(matcher.match("g[0].h[2].leaf.") == std::nullopt);
    CHECK(matcher.match("g[0].h[1].leaf") == std::optional<bool>{true});
}

TEST_CASE("cold repeated diverging and shuffled signal batches match the original full parser", "[a-m7]") {
    std::mt19937 random(0x3ae18);
    for (size_t depth : std::array<size_t, 7>{0, 1, 2, 3, 8, 64, 128}) {
        std::vector<PathSegment> target;
        std::string prefix;
        for (size_t i = 0; i < depth; ++i) {
            prefix += "g" + std::to_string(i) + "[-2][3].";
            target.push_back({"g" + std::to_string(i), {-2, 3}});
        }
        target.push_back({"leaf", {}});
        std::vector<std::string> texts;
        for (int i = 0; i < 1200; ++i) {
            auto text = prefix + (i % 3 ? "other" : "leaf");
            if (depth && i % 5 == 0) text.replace(0, 2, "different");
            if (i % 7 == 0) text += "[2147483648]";
            if (i % 11 == 0) text.resize(size_t(random()) % text.size());
            texts.push_back(std::move(text));
            if (i % 13 == 0) texts.push_back("leaf");
            if (i % 17 == 0) texts.push_back(prefix + "leaf");
        }
        checkBatch(texts, target);
        std::shuffle(texts.begin(), texts.end(), random);
        checkBatch(texts, target);
        std::reverse(texts.begin(), texts.end());
        checkBatch(texts, target);
        checkBatch(texts, {});
    }
}
