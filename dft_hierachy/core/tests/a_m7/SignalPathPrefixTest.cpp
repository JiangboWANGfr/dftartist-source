#include "HierarchyPath.h"
#include "hier/Design.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <random>
#include <type_traits>

using namespace hier;
namespace {
using detail::PathSegment;
void compare(const std::vector<std::string> &texts, const std::vector<PathSegment> &target) {
    detail::HierarchyPathMatcher matcher(target);
    auto check = [&](const std::string &text) {
        auto actual = matcher.match(text);
        auto original = detail::parseHierarchyPath(text);
        REQUIRE(bool(actual) == bool(original));
        if (actual)
            CHECK(*actual == (original->segments == target));
        else {
            CHECK(original.error().code == ErrorCode::BadRequest);
            CHECK(original.error().message == "invalid hierarchy path syntax");
        }
        auto scalar = detail::matchHierarchyPathSegments(text, target);
        CHECK(actual == scalar);
    };
    for (const auto &text : texts) check(text);
    for (auto it = texts.rbegin(); it != texts.rend(); ++it) check(*it);
    for (const auto &text : texts) { check(text); check(text); }
}
}

TEST_CASE("signal batch prefixes retain complete grammar and matching state", "[a-m7]") {
    static_assert(!std::is_copy_constructible_v<detail::HierarchyPathMatcher>);
    static_assert(!std::is_move_constructible_v<detail::HierarchyPathMatcher>);
    std::vector<std::string> texts{
        "g[0].bank[-2][3].value", "g[0].bank[-2][3].other", "g[0].bank[-2][3].value[1]",
        "g[0].bank[-2][3].", "g[0].bank[-2][3]", "g[0].bank[-2][3].value.",
        "g[0].bank[-2][3].value[2147483648]", "g[0].bank[-2][3].\\unterminated",
        "g[0].bank[-2][3].value", "/ g [ +00 ] / bank [ -02 ][ +003 ] / value ",
        "g[0].bank[-2][3] / value", "g[0].bank[-2][3] / ",
        "g[0].bank[-2][3].\\a.b ", "g[0].bank[-2][3].\\a.b .value",
        "g[0].bank[-2][3].\\a.b .other", "g[0].bank[-2][3].\\a.b .",
        "g[0].bank[-2][3].\\a.b .value[0]", "g[0].bank[-2][3].value",
        "\\g[0].bank[-2][3].value ", "", "/", " ", "a..b", "a[+].b",
        "a[-2147483648].b", "a[-2147483648].c", "a[-2147483649].b",
        "a[2147483647].b", "a[2147483648].b", "a[0][1].b", "a[0][2].b",
        "a . \t\n b . c", "a . \t\n b . d", "a . \t\n b .", "a . \t\n b .c",
        std::string("g[0].\\a\0b .value", 16), std::string("g[0].\\a\0b .other", 16),
        std::string("g[0].\\a\xff .value", 15)};
    for (const auto &target : std::vector<std::vector<PathSegment>>{
        {}, {{"g", {0}}, {"bank", {-2, 3}}, {"value", {}}},
        {{"g", {0}}, {"bank", {-2, 3}}, {"a.b", {}}, {"value", {}}},
        {{"a", {INT32_MIN}}, {"b", {}}}, {{"a", {}}, {"b", {}}, {"c", {}}},
        {{"g", {0}}, {std::string("a\0b", 3), {}}, {"value", {}}}})
        compare(texts, target);
}

TEST_CASE("signal batch checkpoints survive deep ordered shuffled and malformed candidates", "[a-m7]") {
    std::mt19937 random(0x7a317);
    std::vector<std::string> texts;
    std::string prefix;
    std::vector<PathSegment> target;
    for (int i = 0; i < 96; ++i) {
        prefix += "g" + std::to_string(i) + "[0].";
        target.push_back({"g" + std::to_string(i), {0}});
        texts.push_back(prefix + "leaf");
        texts.push_back(prefix); // A former checkpoint at end must remain invalid.
    }
    target.push_back({"leaf", {}});
    for (int i = 0; i < 500; ++i) {
        auto text = prefix + (i % 3 ? "other" : "leaf");
        if (i % 5 == 0) text.resize(size_t(random()) % text.size());
        if (i % 7 == 0) text += "..bad";
        if (i % 11 == 0) text += "[2147483648]";
        texts.push_back(std::move(text));
    }
    compare(texts, target);
    std::shuffle(texts.begin(), texts.end(), random);
    compare(texts, target);
    const std::string alphabet("a0 ./\\[]+-\t\0\xff", 13);
    texts.clear();
    for (int i = 0; i < 6000; ++i) {
        std::string text;
        const auto count = size_t(random()) % 50;
        for (size_t j = 0; j < count; ++j) text += alphabet[size_t(random()) % alphabet.size()];
        texts.push_back(std::move(text));
    }
    compare(texts, target);
    compare(texts, {{"a", {0}}});
}

TEST_CASE("public signal paths retain round trip cancellation and owning results", "[a-m7]") {
    for (const auto separate : {false, true}) for (const uint64_t cache : {uint64_t{0}, uint64_t{128}, uint64_t{67108864}}) {
        model::OpenOptions options;
        options.files = {HIER_SIGNAL_PATH_PREFIX_FIXTURE};
        options.tops = {"alpha", "beta"};
        options.forcePerInstanceBodies = separate;
        options.connectionCacheBytes = cache;
        auto opened = Design::open(options);
        REQUIRE(opened);
        auto design = std::move(opened.value());
        model::SearchQuery query;
        query.kinds = std::vector{model::HitKind::Signal};
        PageRequest page;
        page.limit = 7;
        std::vector<std::string> retained;
        size_t count = 0;
        do {
            auto hits = design->search(query, page);
            REQUIRE(hits);
            for (const auto &hit : hits->result.items) {
                auto resolved = design->resolvePath(hit.pathText);
                REQUIRE(resolved);
                CHECK(std::find(resolved->result.begin(), resolved->result.end(), hit.ref) != resolved->result.end());
                retained.insert(retained.end(), resolved->result.begin(), resolved->result.end());
                ++count;
            }
            page.cursor = hits->result.next;
        } while (!page.cursor.empty());
        CHECK(count > 0);
        std::stop_source stop;
        stop.request_stop();
        auto cancelled = design->resolvePath("alpha.a", stop.get_token());
        REQUIRE_FALSE(cancelled);
        CHECK(cancelled.error().code == ErrorCode::Cancelled);
        auto invalid = design->resolvePath("alpha..a", stop.get_token());
        REQUIRE_FALSE(invalid);
        CHECK(invalid.error().code == ErrorCode::BadRequest);
        design.reset();
        CHECK_FALSE(retained.empty());
        for (const auto &ref : retained) CHECK_FALSE(ref.empty());
    }
}
