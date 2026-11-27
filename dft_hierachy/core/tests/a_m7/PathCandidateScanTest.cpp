#include "HierarchyPath.h"
#include "SlotPathPrefix.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <functional>
#include <random>

using namespace hier;
namespace {
using detail::PathSegment;
using Row = std::pair<size_t, size_t>;
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
size_t fullMatch(const model::BodySkeleton &body, const model::ChildSlot &slot,
                  std::span<const PathSegment> expected) {
    std::vector<PathSegment> path;
    for (auto scope = slot.scope; scope >= 0; scope = body.scopes[size_t(scope)].parent) {
        const auto &item = body.scopes[size_t(scope)];
        path.push_back({item.name, item.arrayIndex});
    }
    std::reverse(path.begin(), path.end());
    path.push_back({slot.name, slot.arrayIndex});
    return path.size() <= expected.size() && std::equal(path.begin(), path.end(), expected.begin())
               ? path.size() : 0;
}
} // namespace

TEST_CASE("lightweight path matching keeps valid false distinct from malformed syntax", "[a-m7]") {
    const std::vector<PathSegment> known{{"top", {}}, {"g", {-2, 3}}, {"a.b", {}}};
    for (const auto text : {"top.g[-2][3].\\a.b ", "/ top / g[ -02 ][+003] / \\a.b \t"}) {
        auto result = detail::matchHierarchyPathSegments(text, known);
        REQUIRE(result); CHECK(*result);
    }
    for (const auto text : {"top.g[-2].\\a.b ", "other", "top.g[-2][3].a.b"}) {
        auto result = detail::matchHierarchyPathSegments(text, known);
        REQUIRE(result); CHECK_FALSE(*result);
    }
    for (const auto text : {"other..tail", "other[2147483648]", "other.\\unterminated", "top."})
        CHECK_FALSE(detail::matchHierarchyPathSegments(text, known));
    const std::vector<std::vector<PathSegment>> targets{{}, {{"a", {}}}, {{"a", {0}}}, known};
    const std::string alphabet("a0 ./\\[]+-\t\0\xff", 13);
    std::function<void(std::string, size_t)> check = [&](std::string text, size_t depth) {
        const auto parsed = detail::parseHierarchyPath(text);
        const auto valid = detail::validateHierarchyPath(text);
        CHECK(bool(parsed) == bool(valid));
        for (const auto &target : targets) {
            const auto light = detail::matchHierarchyPathSegments(text, target);
            const auto legacy = detail::matchesHierarchyPath(text, target);
            CHECK(bool(light) == bool(parsed)); CHECK(bool(light) == bool(legacy));
            if (light) {
                CHECK(*light == *legacy);
                CHECK(*light == (parsed->segments == target));
            } else {
                CHECK(legacy.error().code == ErrorCode::BadRequest);
                CHECK(legacy.error().message == "invalid hierarchy path syntax");
                CHECK(json(legacy.error()) == json(parsed.error()));
            }
        }
        if (depth) for (const char byte : alphabet) check(text + byte, depth - 1);
    };
    check("", 4);
    const std::vector<PathSegment> binary{{std::string("a\0b", 3), {}}};
    auto nul = detail::matchHierarchyPathSegments(std::string("\\a\0b ", 5), binary);
    REQUIRE(nul); CHECK(*nul);
    const std::vector<PathSegment> boundary{{"a", {INT32_MIN, INT32_MAX}}};
    auto indices = detail::matchHierarchyPathSegments("a[-2147483648][+2147483647]", boundary);
    REQUIRE(indices); CHECK(*indices);
}

TEST_CASE("slot batches preserve complete candidate order for flat and scoped branches", "[a-m7]") {
    std::mt19937 random(371836);
    for (size_t round = 0; round < 120; ++round) {
        model::BodySkeleton body;
        // Parent indexes deliberately follow children in the vector.
        body.scopes = {{2, "h", {2}}, {-1, "other", {}}, {-1, "g", {-1}}};
        for (size_t index = 0; index < 256; ++index) {
            model::ChildSlot slot;
            slot.name = random() % 3 ? "u" : "other";
            slot.scope = int32_t(random() % 4) - 1;
            if (random() % 2) slot.arrayIndex = {int32_t(random() % 4)};
            body.slots.push_back(std::move(slot));
        }
        const std::vector<std::vector<PathSegment>> queries{{}, {{"u", {}}}, {{"u", {2}}, {"tail", {}}},
            {{"g", {-1}}, {"u", {}}}, {{"g", {-1}}, {"h", {2}}, {"u", {2}}},
            {{"other", {}}, {"u", {}}}, {{"no_match", {}}}};
        for (const auto &target : queries) {
            std::vector<Row> expected;
            for (size_t index = 0; index < body.slots.size(); ++index)
                if (const auto count = fullMatch(body, body.slots[index], target))
                    expected.emplace_back(index, count);
            detail::SlotPathPrefix matcher(body, target);
            for (size_t pass = 0; pass < 3; ++pass) {
                std::vector<Row> actual;
                auto result = matcher.visit([&](size_t index, size_t count) { actual.emplace_back(index, count); });
                REQUIRE(result); CHECK(*result); CHECK(actual == expected);
                for (size_t index = 0; index < body.slots.size(); ++index) {
                    auto scalar = matcher.match(body.slots[index]); REQUIRE(scalar);
                    CHECK(*scalar == fullMatch(body, body.slots[index], target));
                }
            }
        }
    }
}

TEST_CASE("batch cancellation at emissions and empty or last row keeps retry and errors", "[a-m7]") {
    const std::vector<PathSegment> target{{"u", {}}};
    for (size_t count : std::array<size_t, 4>{0, 1, 8, 65}) {
        model::BodySkeleton body; body.slots.resize(count);
        for (auto &slot : body.slots) slot.name = "u";
        detail::SlotPathPrefix matcher(body, target);
        std::stop_source before; before.request_stop();
        auto cancelled = matcher.visit([](size_t, size_t) { FAIL("pre-cancelled batch emitted"); }, before.get_token());
        REQUIRE_FALSE(cancelled); CHECK(cancelled.error().code == ErrorCode::Cancelled);
        CHECK(cancelled.error().message == "lookup cancelled");
        for (const size_t stopAt : {size_t{1}, count}) {
            std::stop_source stop;
            size_t emitted = 0;
            auto result = matcher.visit([&](size_t, size_t) {
                if (++emitted == stopAt) stop.request_stop();
            }, stop.get_token());
            if (count) { REQUIRE_FALSE(result); CHECK(emitted == stopAt); }
            else { REQUIRE(result); CHECK(*result); CHECK(emitted == 0); }
            emitted = 0;
            auto retry = matcher.visit([&](size_t, size_t) { ++emitted; });
            REQUIRE(retry); CHECK(*retry); CHECK(emitted == count);
        }
        if (count) {
            try {
                (void)matcher.visit([](size_t, size_t) { throw Error{ErrorCode::Internal, "original callback failure"}; });
                FAIL("callback error was swallowed");
            } catch (const Error &error) {
                CHECK(error.code == ErrorCode::Internal); CHECK(error.message == "original callback failure");
            }
        }
    }
}

TEST_CASE("public path candidates retain RTL round trips errors cancellation and owning results", "[a-m7]") {
    std::vector<std::string> retained;
    for (bool per : {false, true})
        for (size_t cache : std::array<size_t, 3>{0, 128, 64 * 1024 * 1024}) {
            model::OpenOptions options; options.files = {HIER_PATH_CANDIDATE_SCAN_FIXTURE};
            options.tops = {"alpha", "beta"}; options.forcePerInstanceBodies = per; options.connectionCacheBytes = cache;
            auto opened = Design::open(options); REQUIRE(opened); REQUIRE((*opened)->diagnostics().errorCount == 0);
            model::SearchQuery query; query.kinds = {model::HitKind::Instance, model::HitKind::Port, model::HitKind::Signal};
            PageRequest page; page.limit = 7; size_t count = 0;
            do {
                auto hits = (*opened)->search(query, page); REQUIRE(hits);
                for (const auto &hit : hits->result.items) {
                    auto result = (*opened)->resolvePath(hit.pathText); REQUIRE(result);
                    CHECK(std::find(result->result.begin(), result->result.end(), hit.ref) != result->result.end());
                    retained = result->result; ++count;
                }
                page.cursor = hits->result.next;
            } while (!page.cursor.empty());
            CHECK(count > 50);
            auto missing = (*opened)->resolvePath("alpha.no_match"); REQUIRE(missing); CHECK(missing->result.empty());
            std::stop_source stop; stop.request_stop();
            auto cancelled = (*opened)->resolvePath("alpha.u[3]", stop.get_token()); REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == ErrorCode::Cancelled);
            auto bad = (*opened)->resolvePath("alpha..bad", stop.get_token()); REQUIRE_FALSE(bad);
            CHECK(bad.error().code == ErrorCode::BadRequest);
            auto retry = (*opened)->resolvePath("alpha.u[3]"); REQUIRE(retry); CHECK(retry->result.size() == 1);
        }
    CHECK_FALSE(retained.empty());
}
