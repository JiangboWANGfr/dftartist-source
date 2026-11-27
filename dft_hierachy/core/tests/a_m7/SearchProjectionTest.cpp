#include "HierarchyPath.h"
#include "Lookup.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <functional>
#include <set>

using namespace hier;
namespace {
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
auto open(bool per = false, size_t cache = 64 * 1024 * 1024) {
    model::OpenOptions options;
    options.files = {HIER_SEARCH_PROJECTION_FIXTURE};
    options.tops = {"alpha", "beta"};
    options.forcePerInstanceBodies = per;
    options.connectionCacheBytes = cache;
    auto design = Design::open(options);
    REQUIRE(design);
    REQUIRE((*design)->diagnostics().errorCount == 0);
    return std::move(design.value());
}
// Test-owned facts at the existing Frontend boundary. The real Design supplies
// the root's instance metadata; this DB deliberately has only that occurrence.
struct Frontend final : frontend::Frontend {
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_{{"alpha", 0}};
    std::vector<model::DefInfo> defs_{{"alpha", model::DefKind::Module, "", 0}};
    model::BodySkeleton body;
    model::BodyConnections facts;
    std::stop_source *stop = nullptr;
    Frontend() {
        for (const auto name : {"", "a.b", "z"}) {
            model::PortInfo port;
            port.name = name;
            body.ports.push_back(port);
        }
        for (const auto &[name, local] : std::array<std::pair<const char *, const char *>, 4>{
                 {{"", "ignored..path"}, {"first", "first"}, {"last", "bank[-2].\\a.b "},
                  {"hidden", "invalid..path"}}}) {
            model::SignalInfo signal;
            signal.name = name;
            signal.localPath = local;
            facts.signals.push_back(signal);
        }
        facts.estimatedBytes = 1024;
    }
    const model::FrontendInfo &info() const override { return info_; }
    const std::vector<model::TopInfo> &tops() const override { return tops_; }
    const std::vector<model::DefInfo> &definitions() const override { return defs_; }
    size_t bodyCount() const override { return 1; }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId) const override { return body; }
    model::BodyConnections connections(model::BodyId) const override {
        if (stop)
            stop->request_stop();
        return facts;
    }
};
} // namespace

TEST_CASE("path validation uses the original syntax without building a path", "[a-m7]") {
    for (const auto text : {"a", "/ top.g[-2147483648][+2147483647].\\x.y ",
                            "\\a/b[2] \t[ -2 ] / child$0", "a[+0]", "a[-0]"}) {
        REQUIRE(detail::validateHierarchyPath(text));
        REQUIRE(detail::parseHierarchyPath(text));
    }
    for (const auto text : {"", " ", "/", "a.", "a/", "a..b", "a//b", "\\a", "\\ ",
                            "a[2147483648]", "a[-2147483649]", "a[+]", "a[]", "a[1x]",
                            "a[--1]", "a[ 1", "0a", "a b", "a#"}) {
        auto checked = detail::validateHierarchyPath(text);
        auto parsed = detail::parseHierarchyPath(text);
        REQUIRE_FALSE(checked);
        REQUIRE_FALSE(parsed);
        CHECK(checked.error().code == ErrorCode::BadRequest);
        CHECK(checked.error().message == "invalid hierarchy path syntax");
        CHECK(json(checked.error()) == json(parsed.error()));
    }
    auto parsed = detail::parseHierarchyPath("/ top.g[-2][+3].\\x.y ");
    REQUIRE(parsed);
    CHECK(parsed->absolute);
    CHECK(parsed->segments == std::vector<detail::PathSegment>{{"top", {}}, {"g", {-2, 3}}, {"x.y", {}}});
    // Exhaustive short byte strings exercise every sink on identical input,
    // including NUL and non-ASCII bytes; hand-written syntax expectations above
    // and the existing frozen path suite remain the grammar oracle.
    const std::string alphabet("a0 ./\\[]+-\t\0\xff", 13);
    std::function<void(std::string, size_t)> visit = [&](std::string text, size_t depth) {
        const auto checked = detail::validateHierarchyPath(text);
        const auto built = detail::parseHierarchyPath(text);
        REQUIRE(bool(checked) == bool(built));
        if (!checked)
            CHECK(json(checked.error()) == json(built.error()));
        if (depth)
            for (const auto byte : alphabet)
                visit(text + byte, depth - 1);
    };
    visit("", 4);
    std::string deep = "top";
    for (size_t i = 0; i < 2000; ++i)
        deep += ".\\long.segment ";
    REQUIRE(detail::validateHierarchyPath(deep));
    parsed = detail::parseHierarchyPath(deep);
    REQUIRE(parsed);
    CHECK(parsed->segments.size() == 2001);
}

TEST_CASE("search preserves unmatched path errors anonymous objects and next-match boundaries", "[a-m7]") {
    auto design = open();
    model::SearchQuery query;
    query.kinds = {model::HitKind::Signal};
    for (const size_t cache : std::array<size_t, 3>{0, 1, 1024 * 1024}) {
        auto front = std::make_unique<Frontend>();
        auto &facts = *front;
        db::DesignDb db(std::move(front), cache);
        for (const auto text : {"no match", "hidden", "first", ""}) {
            query.text = text;
            // Even after filling one row, a later nonmatching malformed path
            // still wins unless the next matching row was already encountered.
            const int limit = query.text.empty() ? 100 : 1;
            auto result = detail::search(*design, db, query, {"", limit}, {});
            REQUIRE_FALSE(result);
            CHECK(result.error().code == ErrorCode::Internal);
            CHECK(result.error().message == "invalid frontend object path: invalid..path");
        }
        query.text = "alpha";
        auto first = detail::search(*design, db, query, {"", 1}, {});
        REQUIRE(first);
        CHECK(first->result.items.size() == 1);
        CHECK(first->result.items[0].ref == "s:0:0");
        CHECK(first->result.items[0].pathText == "alpha");
        CHECK_FALSE(first->result.next.empty());
        auto next = detail::search(*design, db, query, {first->result.next, 1}, {});
        REQUIRE(next);
        CHECK(next->result.items[0].ref == "s:0:1");
        auto last = detail::search(*design, db, query, {next->result.next, 1}, {});
        REQUIRE_FALSE(last);
        CHECK(last.error().code == ErrorCode::Internal);
        CHECK(facts.facts.signals[0].localPath == "ignored..path");
    }
    auto front = std::make_unique<Frontend>();
    auto &facts = *front;
    facts.facts.signals.pop_back();
    db::DesignDb db(std::move(front), 0);
    query.text = "a.bank[-2].\\a.b "; // Starts inside the parent and crosses '.'
    auto result = detail::search(*design, db, query, {}, {});
    REQUIRE(result);
    REQUIRE(result->result.items.size() == 1);
    CHECK(result->result.items[0].ref == "s:0:2");
    CHECK(result->result.items[0].name == "last");
    CHECK(result->result.items[0].path == std::vector<std::string>{"alpha", "bank[-2]", "a.b"});
    query.text = "a.\\a.b ";
    query.kinds = {model::HitKind::Port};
    result = detail::search(*design, db, query, {}, {});
    REQUIRE(result);
    REQUIRE(result->result.items.size() == 1);
    CHECK(result->result.items[0].ref == "p:0:1");
    CHECK(result->result.items[0].pathText == "alpha.\\a.b ");
    std::stop_source stop;
    facts.stop = &stop;
    query.kinds = {model::HitKind::Signal};
    auto cancelled = detail::search(*design, db, query, {}, stop.get_token());
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    facts.stop = nullptr;
    REQUIRE(detail::search(*design, db, query, {}, {}));
}

TEST_CASE("public search matches literal fields through every page kind scope and cache", "[a-m7]") {
    std::vector<model::ObjectHit> retained;
    std::string retainedJson;
    for (bool per : {false, true})
        for (const size_t cache : std::array<size_t, 4>{0, 1, 128, 64 * 1024 * 1024}) {
            auto design = open(per, cache);
            for (const auto &scope : {std::string(), std::string("i:0"), std::string("i:1"), std::string("i:0.1")}) {
                model::SearchQuery query;
                if (!scope.empty())
                    query.scope = scope;
                auto all = design->search(query, {"", 10000});
                REQUIRE(all);
                REQUIRE(all->result.next.empty());
                std::set<std::string> texts{"", "no match", "*", "A", " ", ".", "[", "@process:", "@register:", "path_leaf"};
                texts.insert(std::string("\0", 1));
                for (const auto &hit : all->result.items) {
                    texts.insert(hit.name);
                    const auto pos = hit.pathText.find('.');
                    if (pos != std::string::npos)
                        texts.insert(hit.pathText.substr(pos - 1, 4));
                }
                for (const auto &text : texts) {
                    query.text = text;
                    std::vector<model::ObjectHit> expected;
                    for (const auto &hit : all->result.items) {
                        const auto instance = hit.inst ? design->instance(*hit.inst) : Result<model::InstInfo>(Error{ErrorCode::NotFound, "none"});
                        if (hit.name.find(text) != std::string::npos || hit.pathText.find(text) != std::string::npos ||
                            (hit.kind == model::HitKind::Instance && instance && instance->defName.find(text) != std::string::npos))
                            expected.push_back(hit);
                    }
                    std::vector<model::ObjectHit> actual;
                    std::string cursor;
                    size_t pages = 0;
                    do {
                        auto result = design->search(query, {cursor, pages % 2 ? 7 : 1});
                        REQUIRE(result);
                        CHECK(result->completeness.status == "complete");
                        actual.insert(actual.end(), result->result.items.begin(), result->result.items.end());
                        cursor = result->result.next;
                        REQUIRE(++pages < 1000);
                    } while (!cursor.empty());
                    CHECK(json(actual) == json(expected));
                }
                for (const auto kind : {model::HitKind::Definition, model::HitKind::Instance, model::HitKind::Port,
                                        model::HitKind::Signal, model::HitKind::Process, model::HitKind::Register}) {
                    query.text = "";
                    query.kinds = {kind, kind};
                    auto result = design->search(query, {"", 10000});
                    REQUIRE(result);
                    std::vector<model::ObjectHit> expected;
                    for (const auto &hit : all->result.items)
                        if (hit.kind == kind)
                            expected.push_back(hit);
                    CHECK(json(result->result.items) == json(expected));
                }
                retained = all->result.items;
                retainedJson = json(retained);
            }
        }
    REQUIRE_FALSE(retained.empty());
    CHECK(json(retained) == retainedJson); // All Designs and fact caches are gone.
}
