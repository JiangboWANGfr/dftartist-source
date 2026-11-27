#include "Signals.h"
#include "ConnectionRefs.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <charconv>
#include <limits>

using namespace hier;
namespace {
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
struct Frontend final : frontend::Frontend {
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_{{"root", 0}};
    std::vector<model::DefInfo> defs_{{"root", model::DefKind::Module, "", 0}};
    model::BodySkeleton body;
    model::BodyConnections facts;
    bool fail = false;
    std::stop_source *stop = nullptr; // Borrowed control at the existing Frontend boundary.
    explicit Frontend(size_t count = 257) {
        model::ChildSlot slot;
        slot.name = "same";
        slot.body = 0;
        body.slots.push_back(slot);
        slot.name = "missing";
        slot.body = model::kNoBody;
        slot.kind = model::InstKind::Blackbox;
        body.slots.push_back(slot);
        for (size_t i = 0; i < count; ++i) {
            model::SignalInfo signal;
            signal.ref = "s::" + std::to_string(i / 2); // Deliberate duplicates must survive.
            signal.name = std::array<std::string, 8>{"match", "Match", "match.dot", "",
                "xxmatchxx", "match@|filter:3:x", std::string("match\0tail", 10), "中文match"}[i % 8];
            signal.kind = i % 2 ? "net" : "var";
            signal.typeText = "type:" + std::to_string(i);
            signal.localPath = "scope[" + std::to_string(i) + "]." + signal.name;
            signal.width = i + 1;
            signal.isSigned = i % 2 != 0;
            signal.opaque = i % 3 == 0;
            signal.externalRead = i % 5 == 0;
            signal.externalWrite = i % 7 == 0;
            facts.signals.push_back(std::move(signal));
        }
        facts.estimatedBytes = 128;
    }
    const model::FrontendInfo &info() const override { return info_; }
    const std::vector<model::TopInfo> &tops() const override { return tops_; }
    const std::vector<model::DefInfo> &definitions() const override { return defs_; }
    size_t bodyCount() const override { return 1; }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId) const override { return body; }
    model::BodyConnections connections(model::BodyId) const override {
        if (fail)
            throw Error{ErrorCode::Internal, "original signal extraction failure"};
        if (stop)
            stop->request_stop();
        return facts;
    }
};
std::string binding(std::string_view ref, std::string_view filter) {
    auto result = "signals|" + std::string(ref);
    if (!filter.empty())
        result += "|filter:" + std::to_string(filter.size()) + ":" + std::string(filter);
    return result;
}
// The original complete matching-index algorithm, with an independent literal
// cursor decoder. It does not consume the new OffsetPage/window implementation.
Result<Page<model::SignalInfo>> original(const Frontend &source, std::string_view ref,
                                        const PageRequest &page, std::string_view filter) {
    std::vector<size_t> selected;
    for (size_t i = 0; i < source.facts.signals.size(); ++i)
        if (filter.empty() || source.facts.signals[i].name.find(filter) != std::string::npos)
            selected.push_back(i);
    if (page.limit <= 0)
        return Error{ErrorCode::BadRequest, "limit must be positive"};
    const auto prefix = binding(ref, filter) + "@";
    size_t offset = 0;
    if (!page.cursor.empty()) {
        if (!page.cursor.starts_with(prefix))
            return Error{ErrorCode::BadRequest, "cursor does not belong to this query"};
        const auto number = std::string_view(page.cursor).substr(prefix.size());
        const auto [end, ec] = std::from_chars(number.data(), number.data() + number.size(), offset);
        if (number.empty() || ec != std::errc{} || end != number.data() + number.size())
            return Error{ErrorCode::BadRequest, "malformed cursor"};
    }
    if (offset > selected.size())
        return Error{ErrorCode::BadRequest, "malformed cursor"};
    Page<model::SignalInfo> result;
    const auto stop = std::min(selected.size(), offset + size_t(page.limit));
    for (size_t i = offset; i < stop; ++i) {
        auto item = source.facts.signals[selected[i]];
        item.ref = detail::qualify(item.ref, *model::parseInstRef(ref));
        result.items.push_back(std::move(item));
    }
    if (stop < selected.size())
        result.next = prefix + std::to_string(stop);
    return result;
}
void same(const Result<Page<model::SignalInfo>> &actual,
          const Result<Page<model::SignalInfo>> &expected) {
    REQUIRE(actual.ok() == expected.ok());
    if (!expected) {
        CHECK(actual.error().code == expected.error().code);
        CHECK(actual.error().message == expected.error().message);
        return;
    }
    CHECK(json(*actual) == json(*expected));
    REQUIRE(actual->items.size() == expected->items.size());
    for (size_t i = 0; i < actual->items.size(); ++i) {
        // These original native fields are intentionally absent from JSON.
        CHECK(actual->items[i].localPath == expected->items[i].localPath);
        CHECK(actual->items[i].externalRead == expected->items[i].externalRead);
        CHECK(actual->items[i].externalWrite == expected->items[i].externalWrite);
    }
}
} // namespace

TEST_CASE("signal pages equal complete matching indices for literal filters and cursors", "[a-m7]") {
    for (const size_t budget : std::array<size_t, 4>{0, 1, 128, 64 * 1024 * 1024}) {
        auto front = std::make_unique<Frontend>();
        auto &source = *front;
        db::DesignDb db(std::move(front), budget);
        for (const auto ref : {"i:0", "i:000.00"})
            for (const auto &filter : std::vector<std::string>{"", "match", "Match", "nomatch", ".",
                     "@|filter:", std::string("\0tail", 5), "中文", "scope", "MATCH"}) {
                const auto all = original(source, ref, {"", 1000}, filter);
                REQUIRE(all);
                const auto total = all->items.size();
                for (const int limit : {1, 2, 17, 200, std::numeric_limits<int>::max()})
                    for (const auto offset : std::array<size_t, 5>{0, 1, total / 2, total, total + 1}) {
                        PageRequest page{binding(ref, filter) + "@" + std::to_string(offset), limit};
                        same(detail::signals(db, ref, page, filter, {}), original(source, ref, page, filter));
                    }
                std::vector<model::SignalInfo> joined;
                std::string cursor;
                size_t pages = 0;
                do {
                    PageRequest request{cursor, std::array{1, 7, 3}[pages++ % 3]};
                    const auto result = detail::signals(db, ref, request, filter, {});
                    same(result, original(source, ref, request, filter));
                    REQUIRE(result);
                    joined.insert(joined.end(), result->items.begin(), result->items.end());
                    cursor = result->next;
                    REQUIRE(pages < 260);
                } while (!cursor.empty());
                CHECK(json(joined) == json(all->items));
                for (const auto &cursorText : std::vector<std::string>{"bad", binding(ref, filter) + "@",
                         binding(ref, filter) + "@-1", binding(ref, filter) + "@+1",
                         binding(ref, filter) + "@18446744073709551616", binding(ref, filter) + "@00"})
                    same(detail::signals(db, ref, {cursorText, 7}, filter, {}),
                         original(source, ref, {cursorText, 7}, filter));
                same(detail::signals(db, ref, {"", 0}, filter, {}), original(source, ref, {"", 0}, filter));
                same(detail::signals(db, ref, {"bad", -1}, filter, {}), original(source, ref, {"bad", -1}, filter));
            }
        const auto absent = detail::signals(db, "i:0.1", {}, "match", {});
        REQUIRE(absent);
        CHECK(absent->items.empty());
        CHECK(absent->next.empty());
        CHECK(source.facts.signals[0].ref == "s::0");
    }
    Page<model::SignalInfo> retained;
    {
        db::DesignDb db(std::make_unique<Frontend>(100000), 0);
        auto result = detail::signals(db, "i:0", {"signals|i:0|filter:5:match@74999", 1}, "match", {});
        REQUIRE(result);
        REQUIRE(result->items.size() == 1);
        retained = *result;
    }
    CHECK(retained.items[0].name == "中文match");
    CHECK(retained.items[0].ref == "s:0:49999");
    CHECK(retained.next.empty());
}

TEST_CASE("signal pages retain extraction and cancellation priority over page errors", "[a-m7]") {
    auto front = std::make_unique<Frontend>();
    auto &source = *front;
    db::DesignDb db(std::move(front), 0);
    for (const auto &filter : {std::string{}, std::string("match")})
        for (const PageRequest &request : std::array<PageRequest, 3>{{{"", 1}, {"bad", 1}, {"", 0}}}) {
            source.fail = true;
            auto result = detail::signals(db, "i:0", request, filter, {});
            REQUIRE_FALSE(result);
            CHECK(result.error().message == "original signal extraction failure");
            source.fail = false;
            std::stop_source stop;
            source.stop = &stop;
            result = detail::signals(db, "i:0", request, filter, stop.get_token());
            REQUIRE_FALSE(result);
            CHECK(result.error().code == ErrorCode::Cancelled);
            source.stop = nullptr;
            REQUIRE(detail::signals(db, "i:0", {"", 1}, filter, {}));
        }
    for (const auto ref : {"bad", "i:99", "i:0.99"}) {
        auto failed = detail::signals(db, ref, {"", 0}, "match", {});
        REQUIRE_FALSE(failed);
        CHECK(failed.error().message != "limit must be positive");
        std::stop_source stop;
        stop.request_stop();
        failed = detail::signals(db, ref, {"bad", 0}, "match", stop.get_token());
        REQUIRE_FALSE(failed);
        CHECK(failed.error().message == "signals cancelled");
    }
}

TEST_CASE("public signal pages retain RTL fields ownership sharing and literal bindings", "[a-m7]") {
    Page<model::SignalInfo> retained;
    for (bool perInstance : {false, true})
        for (const size_t cache : std::array<size_t, 4>{0, 1, 128, 64 * 1024 * 1024}) {
            model::OpenOptions options;
            options.files = {HIER_SIGNAL_PAGES_FIXTURE};
            options.tops = {"signal_top"};
            options.forcePerInstanceBodies = perInstance;
            options.connectionCacheBytes = cache;
            auto opened = Design::open(options);
            REQUIRE(opened);
            auto &design = **opened;
            REQUIRE(design.diagnostics().errorCount == 0);
            for (const auto ref : {"i:0.0", "i:0.1", "i:000.01"}) {
                const auto all = design.signals(ref, {"", 1000});
                REQUIRE(all);
                for (const auto &filter : std::vector<std::string>{"", "match", "Match", ".", "g[", "nomatch", std::string(1, '\0')}) {
                    std::vector<model::SignalInfo> expected;
                    for (const auto &item : all->items)
                        if (item.name.find(filter) != std::string::npos)
                            expected.push_back(item);
                    if (filter == "match") {
                        REQUIRE(expected.size() == 6);
                        CHECK(expected.front().name == "match_first");
                        CHECK(expected.back().name == "match_scoped");
                    }
                    std::string cursor;
                    std::vector<model::SignalInfo> joined;
                    size_t pages = 0;
                    do {
                        auto result = design.signals(ref, {cursor, std::array{1, 3, 2}[pages++ % 3]}, filter, {});
                        REQUIRE(result);
                        joined.insert(joined.end(), result->items.begin(), result->items.end());
                        cursor = result->next;
                        if (!cursor.empty())
                            CHECK(cursor == binding(ref, filter) + "@" + std::to_string(joined.size()));
                        REQUIRE(pages < 20);
                    } while (!cursor.empty());
                    CHECK(json(joined) == json(expected));
                    const auto eof = design.signals(ref, {binding(ref, filter) + "@" + std::to_string(expected.size()), 3}, filter, {});
                    REQUIRE(eof);
                    CHECK(eof->items.empty());
                    CHECK(eof->next.empty());
                    if (!expected.empty()) {
                        const auto first = design.signals(ref, {"", 1}, filter, {});
                        REQUIRE(first);
                        retained = *first;
                    }
                }
                auto first = design.signals(ref, {"", 1}, "match", {});
                REQUIRE(first);
                REQUIRE_FALSE(first->next.empty());
                CHECK_FALSE(design.signals(ref, {first->next, 1}, "Match", {}));
                const auto otherRef = std::string(ref) == "i:0.0" ? "i:000.0" : "i:0.0";
                CHECK_FALSE(design.signals(otherRef, {first->next, 1}, "match", {}));
                std::stop_source stop;
                stop.request_stop();
                auto cancelled = design.signals(ref, {"bad", 0}, "match", stop.get_token());
                REQUIRE_FALSE(cancelled);
                CHECK(cancelled.error().code == ErrorCode::Cancelled);
                REQUIRE(design.signals(ref, {first->next, 1}, "match", {}));
            }
            auto blackbox = design.signals("i:0.2", {}, "match", {});
            REQUIRE(blackbox);
            CHECK(blackbox->items.empty());
        }
    REQUIRE(retained.items.size() == 1);
    CHECK(retained.items[0].name == "match.dot");
    CHECK(retained.items[0].localPath == "\\match.dot ");
}
