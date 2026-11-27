#include "SlotPathPrefix.h"
#include "hier/Design.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <random>
#include <type_traits>

using namespace hier;
namespace {
using detail::PathSegment;
using Row = std::pair<size_t, size_t>;
std::vector<PathSegment> fullPath(const model::BodySkeleton &body, const model::ChildSlot &slot) {
    std::vector<PathSegment> result;
    for (auto scope = slot.scope; scope >= 0; scope = body.scopes[size_t(scope)].parent) {
        const auto &part = body.scopes[size_t(scope)];
        result.push_back({part.name, part.arrayIndex});
    }
    std::reverse(result.begin(), result.end());
    result.push_back({slot.name, slot.arrayIndex});
    return result;
}
size_t originalMatch(const model::BodySkeleton &body, const model::ChildSlot &slot,
                      std::span<const PathSegment> expected) {
    const auto path = fullPath(body, slot);
    return path.size() <= expected.size() && std::equal(path.begin(), path.end(), expected.begin())
               ? path.size() : 0;
}
std::vector<Row> expectedRows(const model::BodySkeleton &body, const std::vector<PathSegment> &target) {
    std::vector<Row> result;
    for (size_t index = 0; index < body.slots.size(); ++index)
        if (const auto count = originalMatch(body, body.slots[index], target))
            result.emplace_back(index, count);
    return result;
}
} // namespace

TEST_CASE("classified batches preserve full matches in flat mixed and scoped bodies", "[a-m7]") {
    std::mt19937 random(941731);
    const std::vector<std::string> names{"u", "g", "other", "a.b", "u[3]", "", std::string("x\0y", 3)};
    for (size_t mode = 0; mode < 3; ++mode)
        for (size_t round = 0; round < 40; ++round) {
            model::BodySkeleton body;
            if (mode)
                body.scopes = {{2, "u", {-2}}, {-1, "g", {3}}, {-1, "g", {-1}}};
            for (size_t i = 0; i < 256; ++i) {
                model::ChildSlot slot;
                slot.name = names[random() % names.size()];
                slot.scope = mode == 0 ? -1 : mode == 1 ? int32_t(random() % 4) - 1 : int32_t(random() % 3);
                if (random() % 2) slot.arrayIndex = {int32_t(random() % 9) - 4, 2};
                body.slots.push_back(std::move(slot));
            }
            std::vector<std::vector<PathSegment>> targets{{}, {{"absent", {}}}, {{"g", {-1}}, {"u", {-2}}, {"u", {}}}};
            for (size_t i = 0; i < 8; ++i) {
                auto path = fullPath(body, body.slots[random() % body.slots.size()]);
                targets.push_back(path);
                path.push_back({"tail", {}}); targets.push_back(path);
                path.pop_back(); path.back().indices.push_back(77); targets.push_back(std::move(path));
            }
            for (const auto &target : targets) {
                const auto expected = expectedRows(body, target);
                detail::SlotPathPrefix matcher(body, target);
                for (size_t pass = 0; pass < 2; ++pass) {
                    std::vector<Row> actual;
                    auto complete = matcher.visit([&](size_t index, size_t count) { actual.emplace_back(index, count); });
                    REQUIRE(complete); CHECK(*complete); CHECK(actual == expected);
                    for (size_t i = body.slots.size(); i-- > 0;) {
                        auto count = matcher.match(body.slots[i]); REQUIRE(count);
                        CHECK(*count == originalMatch(body, body.slots[i], target));
                    }
                }
            }
        }
}

TEST_CASE("target groups preserve intermediate names arrays and exact escaped identifier bytes", "[a-m7]") {
    model::BodySkeleton body;
    body.scopes = {{-1, "g", {}}};
    const std::vector<std::pair<std::string, std::vector<int32_t>>> leaves{
        {"u", {3}}, {"u[3]", {}}, {"", {}}, {"a.b", {}}, {std::string("x\0y", 3), {}},
        {"u", {-2, 3}}, {"other", {}}, {"u", {3}}, {"", {2}}};
    for (const auto &[name, indices] : leaves) {
        model::ChildSlot slot; slot.name = name; slot.arrayIndex = indices; slot.scope = 0;
        body.slots.push_back(std::move(slot));
    }
    const std::vector<std::vector<PathSegment>> targets{
        {{"g", {}}, {"u", {3}}, {"port", {}}},
        {{"g", {}}, {"u[3]", {}}, {"port", {}}},
        {{"g", {}}, {"u", {-2, 3}}, {"u", {3}}, {"u", {-99}}},
        {{"g", {}}, {"", {}}}, {{"g", {}}, {"a.b", {}}},
        {{"g", {}}, {std::string("x\0y", 3), {}}}, {{"other", {}}, {"u", {3}}}};
    std::optional<detail::SlotPathPrefix> matcher;
    for (const auto &target : targets) {
        matcher.emplace(body, target);
        std::vector<Row> rows;
        REQUIRE(matcher->visit([&](size_t index, size_t count) { rows.emplace_back(index, count); }));
        CHECK(rows == expectedRows(body, target));
    }
    matcher.reset();
    static_assert(!std::is_copy_constructible_v<detail::SlotPathPrefix>);
    static_assert(!std::is_move_constructible_v<detail::SlotPathPrefix>);
}

TEST_CASE("classified scans retain cancellation at first and last hits and query rebinding", "[a-m7]") {
    const std::vector<PathSegment> flat{{"u", {}}}, scoped{{"g", {}}, {"u", {}}};
    for (bool scopes : {false, true}) {
        model::BodySkeleton body;
        if (scopes) body.scopes = {{-1, "g", {}}};
        for (size_t i = 0; i < 65; ++i) {
            model::ChildSlot slot; slot.name = i % 3 ? "u" : "absent"; slot.scope = scopes ? 0 : -1;
            body.slots.push_back(slot);
        }
        const auto &target = scopes ? scoped : flat;
        const auto expected = expectedRows(body, target);
        REQUIRE_FALSE(expected.empty());
        detail::SlotPathPrefix matcher(body, target);
        std::stop_source before; before.request_stop();
        auto pre = matcher.visit([](size_t, size_t) { FAIL("pre-cancel emitted"); }, before.get_token());
        REQUIRE_FALSE(pre); CHECK(pre.error().message == "lookup cancelled");
        for (size_t stopAt : {size_t{1}, expected.size()}) {
            std::stop_source stop; size_t emitted = 0;
            auto cancelled = matcher.visit([&](size_t, size_t) {
                if (++emitted == stopAt) stop.request_stop();
            }, stop.get_token());
            REQUIRE_FALSE(cancelled); CHECK(cancelled.error().code == ErrorCode::Cancelled); CHECK(emitted == stopAt);
            std::vector<Row> rows;
            auto retry = matcher.visit([&](size_t index, size_t count) { rows.emplace_back(index, count); });
            REQUIRE(retry); CHECK(*retry); CHECK(rows == expected);
        }
        const std::vector<PathSegment> different{{"not_here", {}}};
        detail::SlotPathPrefix rebound(body, different);
        size_t emitted = 0; REQUIRE(rebound.visit([&](size_t, size_t) { ++emitted; })); CHECK(emitted == 0);
    }
}

TEST_CASE("public generated and escaped paths still round trip across sharing and eviction", "[a-m7]") {
    std::vector<std::string> retained;
    for (bool per : {false, true})
        for (size_t cache : std::array<size_t, 3>{0, 128, 64 * 1024 * 1024}) {
            model::OpenOptions options; options.files = {HIER_PATH_SLOT_DISPATCH_FIXTURE};
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
            auto array = (*opened)->resolvePath("alpha.u[3]");
            auto escaped = (*opened)->resolvePath("alpha.\\u[3] ");
            REQUIRE(array); REQUIRE(escaped); CHECK(array->result != escaped->result);
            auto missing = (*opened)->resolvePath("alpha.g[-1].not_here"); REQUIRE(missing); CHECK(missing->result.empty());
            std::stop_source stop; stop.request_stop();
            auto cancelled = (*opened)->resolvePath("alpha.u[3]", stop.get_token()); REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == ErrorCode::Cancelled);
            auto bad = (*opened)->resolvePath("alpha..bad", stop.get_token()); REQUIRE_FALSE(bad);
            CHECK(bad.error().code == ErrorCode::BadRequest);
        }
    CHECK_FALSE(retained.empty());
}
