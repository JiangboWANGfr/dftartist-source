#include "hier/Design.h"
#include "Observe.h"
#include <array>
#include <catch2/catch_test_macros.hpp>

using namespace hier;
using observation::Kind;
namespace {
struct Recorder {
    std::array<size_t, size_t(Kind::TraceFilterRange) + 1> counts{};
    std::optional<Kind> stopAt;
    size_t stopCount = 1;
    std::stop_source stop;
    int64_t ticks = 0;
    size_t count(Kind kind) const { return counts[size_t(kind)]; }
    observation::Sink sink() {
        return {this, [](void *context, const observation::Event &event) noexcept {
            auto &record = *static_cast<Recorder *>(context);
            const auto count = ++record.counts[size_t(event.kind)];
            if (record.stopAt == event.kind && count == record.stopCount)
                record.stop.request_stop();
        }, nullptr};
    }
};
std::unique_ptr<Design> open(const char *fixture, const char *top, bool per = false,
                             size_t cache = 64 * 1024 * 1024) {
    model::OpenOptions options;
    options.files = {std::string(HIER_FIXTURES) + "/m3/" + fixture};
    options.tops = {top};
    options.forcePerInstanceBodies = per;
    options.connectionCacheBytes = cache;
    auto result = Design::open(options);
    REQUIRE(result);
    REQUIRE((*result)->diagnostics().errorCount == 0);
    return std::move(result.value());
}
model::SourceSpan leaf(const Design &d) {
    auto definitions = d.definitions();
    REQUIRE(definitions);
    for (auto &def : definitions->items)
        if (def.name == "leaf" || def.name == "source_leaf") {
            auto span = d.source(def.ref, model::SourceKind::Definition);
            REQUIRE(span);
            return *span;
        }
    FAIL("missing source leaf definition");
    return {};
}
template<class T> void cancelled(const Result<T> &result) {
    REQUIRE_FALSE(result);
    REQUIRE(result.error().code == ErrorCode::Cancelled);
}
} // namespace

TEST_CASE("private observation scope restores its caller and accepts a deterministic clock", "[a-m3-observer]") {
    Recorder outer, inner;
    auto a = outer.sink(), b = inner.sink();
    {
        observation::Scope scope(a);
        observation::emit({Kind::SourceCandidate});
        { observation::Scope nested(b); observation::emit({Kind::SourceCandidate}); }
        observation::emit({Kind::SourceCandidate});
    }
    observation::emit({Kind::SourceCandidate});
    CHECK(outer.count(Kind::SourceCandidate) == 2);
    CHECK(inner.count(Kind::SourceCandidate) == 1);
    CHECK(observation::active == nullptr);
}

TEST_CASE("source first page materializes only its limit across one hundred thousand occurrences", "[a-m3-observer]") {
    auto d = open("source_large.sv", "top");
    auto span = leaf(*d);
    for (bool hot : {false, true}) {
        Recorder record;
        auto sink = record.sink();
        observation::Scope scope(sink);
        PageRequest page;
        page.limit = 1;
        auto result = d->resolveSource(span.file, span.start.line, span.start.column, page);
        REQUIRE(result);
        REQUIRE(result->result.items.size() == 1);
        REQUIRE_FALSE(result->result.next.empty());
        CHECK(record.count(Kind::SourceHitMaterialize) == 1);
        CHECK(record.count(Kind::SourceHitEmit) == 1);
        CHECK(record.count(Kind::SourceCandidate) == 2);
        if (hot) {
            CHECK(record.count(Kind::SourceIndexRange) == 0);
            CHECK(record.count(Kind::OccurrenceVisit) == 0);
        } else {
            CHECK(record.count(Kind::SourceIndexPublish) == 1);
            CHECK(record.count(Kind::OccurrencePublish) == 1);
        }
    }
}

TEST_CASE("source index and occurrence cancellation never publish incomplete indexes", "[a-m3-observer]") {
    for (auto event : {Kind::SourceIndexRange, Kind::SourceIndexPublish,
                       Kind::OccurrenceVisit, Kind::OccurrencePublish}) {
        auto d = open("source.sv", "source_top");
        auto span = leaf(*d);
        Recorder first;
        first.stopAt = event;
        auto sink = first.sink();
        {
            observation::Scope scope(sink);
            cancelled(d->resolveSource(span.file, span.start.line, span.start.column, {}, first.stop.get_token()));
        }
        CHECK(first.count(event) == 1);
        Recorder retry;
        sink = retry.sink();
        observation::Scope scope(sink);
        auto result = d->resolveSource(span.file, span.start.line, span.start.column);
        REQUIRE(result);
        CHECK(result->result.items.size() == 3);
        // Observing construction again, plus a full result, proves no half index
        // was reused. A publish event alone is only an attempted publication.
        CHECK(retry.count(event) > 0);
    }
}

TEST_CASE("source page cancellation retains the original cursor and materializes no hidden tail", "[a-m3-observer]") {
    auto d = open("source.sv", "source_top");
    auto span = leaf(*d);
    PageRequest page;
    page.limit = 1;
    auto first = d->resolveSource(span.file, span.start.line, span.start.column, page);
    REQUIRE(first);
    page.cursor = first->result.next;
    page.limit = 2;
    for (auto event : {Kind::SourceCandidate, Kind::SourceHitMaterialize, Kind::SourceHitEmit}) {
        Recorder record;
        record.stopAt = event;
        record.stopCount = 2;
        auto sink = record.sink();
        {
            observation::Scope scope(sink);
            cancelled(d->resolveSource(span.file, span.start.line, span.start.column, page, record.stop.get_token()));
        }
        CHECK(record.count(event) == 2);
        auto retry = d->resolveSource(span.file, span.start.line, span.start.column, page);
        REQUIRE(retry);
        REQUIRE(retry->result.items.size() == 2);
        CHECK(retry->result.items[0].ref == "i:0.0");
        CHECK(retry->result.items[1].ref == "i:0.1");
        CHECK(retry->result.next.empty());
    }
}

TEST_CASE("source large range sorting and deduplication cancel inside the group and rebuild", "[a-m3-observer]") {
    // Five four-way macro levels produce 1024 declarations at the same outer
    // invocation. The module definition and its instance precede those hits.
    std::vector<std::string> expected{"d:0", "i:0"};
    for (size_t i = 0; i < 1024; ++i)
        expected.push_back("s:0:" + std::to_string(i));
    for (auto event : {Kind::SourceIndexSortCompare, Kind::SourceIndexDedupCandidate}) {
        for (size_t stopCount : {257u, 769u}) {
            INFO("event=" << int(event) << ", stop at " << stopCount);
            model::OpenOptions options;
            options.files = {A_SOURCE_BULK_FIXTURE};
            options.tops = {"source_bulk"};
            options.connectionCacheBytes = 0;
            auto opened = Design::open(options);
            REQUIRE(opened);
            auto d = std::move(opened.value());
            REQUIRE(d->diagnostics().errorCount == 0);
            auto span = d->source("s:0:0", model::SourceKind::Definition);
            REQUIRE(span);
            PageRequest request;
            request.limit = 2000;
            Recorder first;
            first.stopAt = event;
            first.stopCount = stopCount;
            auto sink = first.sink();
            {
                observation::Scope scope(sink);
                cancelled(d->resolveSource(span->file, span->start.line, span->start.column,
                                           request, first.stop.get_token()));
            }
            CHECK(first.count(event) == stopCount);
            CHECK(first.count(Kind::SourceIndexPublish) == 0);
            CHECK(first.count(Kind::SourceHitMaterialize) == 0);
            for (bool hot : {false, true}) {
                Recorder retry;
                sink = retry.sink();
                observation::Scope scope(sink);
                auto result = d->resolveSource(span->file, span->start.line, span->start.column, request);
                REQUIRE(result);
                CHECK(result->completeness.status == "complete");
                CHECK(result->result.next.empty());
                std::vector<std::string> refs;
                for (const auto &hit : result->result.items)
                    refs.push_back(hit.ref);
                CHECK(refs == expected);
                if (hot) {
                    CHECK(retry.count(event) == 0);
                    CHECK(retry.count(Kind::SourceIndexRange) == 0);
                } else {
                    CHECK(retry.count(event) >= 1024);
                    CHECK(retry.count(Kind::SourceIndexPublish) == 1);
                }
            }
        }
    }
}

TEST_CASE("step observes actual index and hop cancellation in cold and hot queries", "[a-m3-observer]") {
    for (auto event : {Kind::StepBodyAdmitted, Kind::ConnectionIndexEntry, Kind::ConnectionIndexNode,
                       Kind::ConnectionSeekNode, Kind::ConnectionSeekCompare, Kind::StepCandidate,
                       Kind::HopMaterialize, Kind::HopEmit, Kind::CachePublish}) {
        auto d = open("flow.sv", "flow");
        Recorder record;
        record.stopAt = event;
        auto sink = record.sink();
        {
            observation::Scope scope(sink);
            cancelled(d->step("s:0:0", false, {}, {}, record.stop.get_token()));
        }
        REQUIRE(record.count(event) > 0);
        auto retry = d->step("s:0:0", false);
        REQUIRE(retry);
        REQUIRE_FALSE(retry->result.hops.empty());
        Recorder hot;
        sink = hot.sink();
        observation::Scope scope(sink);
        auto again = d->step("s:0:0", false);
        REQUIRE(again);
        CHECK(again->result.hops.size() == retry->result.hops.size());
        CHECK(hot.count(Kind::StepBodyAdmitted) > 0);
        CHECK(hot.count(Kind::StepBodyAdmitted) <= 2);
        CHECK(hot.count(Kind::ConnectionIndexEntry) == 0);
    }
}

TEST_CASE("trace uses a deterministic monotonic timeout and can retry", "[a-m3-observer]") {
    auto d = open("flow.sv", "bit_paths");
    model::Budget budget;
    budget.maxMillis = 1;
    Recorder record;
    auto sink = record.sink();
    sink.now = [](void *context) noexcept {
        auto &r = *static_cast<Recorder *>(context);
        return observation::Clock::time_point{} + std::chrono::milliseconds(r.ticks++);
    };
    {
        observation::Scope scope(sink);
        auto timed = d->cone("s:0:0", model::TraceDirection::Forward, model::TracePolicy::Full, {}, budget);
        REQUIRE(timed);
        REQUIRE(timed->completeness.status == "partial");
        REQUIRE_FALSE(timed->result.frontier.empty());
        CHECK(timed->result.frontier[0].reason == "budget_time");
    }
    auto retry = d->cone("s:0:0", model::TraceDirection::Forward, model::TracePolicy::Full);
    REQUIRE(retry);
    CHECK(retry->completeness.status == "complete");
    CHECK_FALSE(retry->result.edges.empty());
}

TEST_CASE("trace construction and route filtering cancel without retaining partial results", "[a-m3-observer]") {
    for (auto event : {Kind::TraceRelation, Kind::TraceFilterRange}) {
        auto d = open("flow.sv", "bit_paths");
        Recorder record;
        record.stopAt = event;
        auto sink = record.sink();
        {
            observation::Scope scope(sink);
            cancelled(d->paths("s:0:0", "s:0:2", {}, {}, {}, record.stop.get_token()));
        }
        CHECK(record.count(event) == 1);
        auto retry = d->paths("s:0:0", "s:0:2");
        REQUIRE(retry);
        CHECK(retry->completeness.status == "complete");
        CHECK_FALSE(retry->result.edges.empty());
    }
}
