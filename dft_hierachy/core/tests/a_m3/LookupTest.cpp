// Agent A integration checks. B's frozen CLI/API oracles remain unchanged.
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <set>

using namespace hier;
namespace {
std::unique_ptr<Design> openLookup(bool per = false, size_t cache = 64 * 1024 * 1024,
                                  bool edges = false) {
    model::OpenOptions options;
    options.files = {edges ? HIER_FIXTURES "/../a_m3/fixtures/lookup_edges.sv"
                          : HIER_FIXTURES "/m3/lookup.sv"};
    options.tops = edges ? std::vector<std::string>{"edges"}
                        : std::vector<std::string>{"alpha", "beta"};
    options.forcePerInstanceBodies = per;
    options.connectionCacheBytes = cache;
    auto result = Design::open(options);
    REQUIRE(result);
    REQUIRE(result.value()->diagnostics().errorCount == 0);
    return std::move(result.value());
}
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
std::vector<model::ObjectHit> allHits(Design &design, const model::SearchQuery &query,
                                     int initialLimit = 1000) {
    std::vector<model::ObjectHit> result;
    PageRequest page;
    page.limit = initialLimit;
    std::set<std::string> seen;
    do {
        auto reply = design.search(query, page);
        REQUIRE(reply);
        CHECK(reply->completeness.status == "complete");
        CHECK(reply->completeness.reasons.empty());
        CHECK(reply->result.items.size() <= size_t(page.limit));
        result.insert(result.end(), reply->result.items.begin(), reply->result.items.end());
        page.cursor = reply->result.next;
        if (!page.cursor.empty())
            REQUIRE(seen.insert(page.cursor).second);
        page.limit = page.limit == 7 ? 11 : 7;
    } while (!page.cursor.empty());
    return result;
}
} // namespace

TEST_CASE("lookup pages and query order preserve every occurrence", "[a-m3-lookup]") {
    std::string baseline;
    for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
            auto design = openLookup(per, cache);
            auto full = allHits(*design, {});
            REQUIRE(full.size() == 136);
            std::set<std::string> refs;
            for (const auto &h : full)
                REQUIRE(refs.insert(h.ref).second);
            CHECK(json(allHits(*design, {}, 7)) == json(full));
            model::SearchQuery scoped;
            scoped.scope = "i:0.0";
            CHECK(allHits(*design, scoped).size() == 12);
            CHECK(json(allHits(*design, {}, 2)) == json(full));
            if (baseline.empty())
                baseline = json(full);
            CHECK(json(full) == baseline);
        }
}

TEST_CASE("lookup kinds optionality and cursors bind normalized queries and snapshots", "[a-m3-lookup]") {
    auto design = openLookup();
    model::SearchQuery query;
    query.kinds = std::vector<model::HitKind>{};
    CHECK(allHits(*design, query).empty());
    query.kinds = std::vector{model::HitKind::Signal, model::HitKind::Port,
                             model::HitKind::Signal};
    PageRequest page;
    page.limit = 1;
    auto first = design->search(query, page);
    REQUIRE(first);
    REQUIRE_FALSE(first->result.next.empty());
    page.cursor = first->result.next;
    query.kinds = std::vector{model::HitKind::Port, model::HitKind::Signal};
    CHECK(design->search(query, page));
    auto wrong = query;
    wrong.text = " ";
    auto reply = design->search(wrong, page);
    REQUIRE_FALSE(reply);
    CHECK(reply.error().code == ErrorCode::BadRequest);
    wrong = query;
    wrong.scope = "i:0";
    reply = design->search(wrong, page);
    REQUIRE_FALSE(reply);
    CHECK(reply.error().code == ErrorCode::BadRequest);
    auto method = design->instancesOf("d:0", page);
    REQUIRE_FALSE(method);
    CHECK(method.error().code == ErrorCode::BadRequest);
    auto other = openLookup();
    reply = other->search(query, page);
    REQUIRE_FALSE(reply);
    CHECK(reply.error().code == ErrorCode::StaleCursor);
    query.kinds.reset();
    page.cursor.clear();
    first = design->search(query, page);
    REQUIRE(first);
    page.cursor = first->result.next;
    query.kinds = std::vector{model::HitKind::Register, model::HitKind::Signal,
                             model::HitKind::Instance, model::HitKind::Port,
                             model::HitKind::Process, model::HitKind::Definition};
    CHECK(design->search(query, page)); // Explicit all kinds equals omitted kinds.
    auto malformed = page;
    malformed.cursor += "trailing";
    reply = design->search(query, malformed);
    REQUIRE_FALSE(reply);
    CHECK(reply.error().code == ErrorCode::BadRequest);
}

TEST_CASE("definition occurrence pages include leaf objects and survive cache churn", "[a-m3-lookup]") {
    for (bool edges : {false, true}) {
        auto design = openLookup(false, 0, edges);
        auto definitions = design->definitions();
        REQUIRE(definitions);
        for (const auto &definition : definitions->items) {
            auto full = design->instancesOf(definition.ref);
            REQUIRE(full);
            std::vector<model::InstInfo> paged;
            PageRequest page;
            page.limit = 1;
            std::set<std::string> cursors;
            do {
                auto reply = design->instancesOf(definition.ref, page);
                REQUIRE(reply);
                CHECK(reply->completeness.status == "complete");
                paged.insert(paged.end(), reply->result.items.begin(), reply->result.items.end());
                page.cursor = reply->result.next;
                if (!page.cursor.empty())
                    REQUIRE(cursors.insert(page.cursor).second);
                (void)allHits(*design, {}); // Queries may evict every connection fact.
                page.limit = 3;
            } while (!page.cursor.empty());
            CHECK(json(paged) == json(full->result.items));
            for (const auto &instance : paged)
                CHECK(instance.def == definition.ref);
        }
    }
}

TEST_CASE("real HDL lookup paths round trip and escaped array names stay distinct", "[a-m3-lookup]") {
    for (bool edges : {false, true}) {
        auto design = openLookup(false, 0, edges);
        auto hits = allHits(*design, {});
        for (const auto &h : hits) {
            if (h.kind == model::HitKind::Definition || h.kind == model::HitKind::Process ||
                h.kind == model::HitKind::Register || h.name.empty())
                continue;
            CAPTURE(h.ref, h.pathText);
            auto resolved = design->resolvePath(h.pathText);
            REQUIRE(resolved);
            CHECK(resolved->completeness.status == "complete");
            CHECK(std::find(resolved->result.begin(), resolved->result.end(), h.ref) !=
                  resolved->result.end());
        }
        if (edges) {
            auto normal = design->resolvePath("edges.g[-1].u[+2][1]");
            auto escaped = design->resolvePath("edges.g[-1].\\u[2][1] ");
            REQUIRE(normal);
            REQUIRE(escaped);
            REQUIRE(normal->result.size() == 1);
            REQUIRE(escaped->result.size() == 1);
            CHECK(normal->result != escaped->result);
            CHECK(design->resolvePath("edges.a[0]")->result.empty());
            CHECK(design->resolvePath("/a")->result.empty());
        }
    }
}

TEST_CASE("lookup validates input before cancellation and cancelled queries are retryable", "[a-m3-lookup]") {
    auto design = openLookup();
    std::stop_source stop;
    stop.request_stop();
    auto token = stop.get_token();
    model::SearchQuery query;
    auto cancelled = design->search(query, {}, token);
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    auto instances = design->instancesOf("d:0", {}, token);
    REQUIRE_FALSE(instances);
    CHECK(instances.error().code == ErrorCode::Cancelled);
    auto path = design->resolvePath("alpha.u_extra", token);
    REQUIRE_FALSE(path);
    CHECK(path.error().code == ErrorCode::Cancelled);
    PageRequest bad;
    bad.limit = 0;
    auto badPage = design->search(query, bad, token);
    REQUIRE_FALSE(badPage);
    CHECK(badPage.error().code == ErrorCode::BadRequest);
    query.kinds = std::vector{static_cast<model::HitKind>(100)};
    badPage = design->search(query, {}, token);
    REQUIRE_FALSE(badPage);
    CHECK(badPage.error().code == ErrorCode::BadRequest);
    for (const auto *text : {"", "//alpha", "alpha/", "alpha..u", "alpha.\\unterminated",
                             "alpha.u[-]", "alpha.u[2147483648]", "alpha.u[1:2]"}) {
        path = design->resolvePath(text, token);
        REQUIRE_FALSE(path);
        CHECK(path.error().code == ErrorCode::BadRequest);
    }
    CHECK(allHits(*design, {}).size() == 136);
    auto good = design->resolvePath("alpha.u_extra");
    REQUIRE(good);
    CHECK(good->result.size() == 1);
    CHECK(json(Error{ErrorCode::Cancelled, "stopped"}).find("cancelled") != std::string::npos);
}
