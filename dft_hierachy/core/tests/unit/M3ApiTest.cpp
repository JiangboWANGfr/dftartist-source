// Agent B independent M3 gate; DESIGN 5.5 revised e8217ff1..., not A implementation.
// Include the public Design entry only: new L0 types must be available to its caller.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include <algorithm>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iterator>
#include <random>
#include <set>
#include <stop_token>
#include <tuple>

using namespace hier;
namespace {
std::unique_ptr<Design> openFixture(std::string fixture, std::vector<std::string> tops,
                                    bool per = false, size_t cacheBytes = 64 * 1024 * 1024) {
    model::OpenOptions options;
    options.files = {std::string(HIER_FIXTURES) + "/m3/" + fixture};
    options.tops = std::move(tops);
    options.forcePerInstanceBodies = per;
    options.connectionCacheBytes = cacheBytes;
    auto result = Design::open(options);
    REQUIRE(result.ok());
    auto design = std::move(result.value());
    REQUIRE(design->diagnostics().errorCount == 0);
    return design;
}
std::string root(Design& d, std::string_view name) {
    for (const auto& i : d.roots()) if (i.name == name) return i.ref;
    FAIL("missing fixture top");
    return {};
}
std::string signal(Design& d, std::string_view inst, std::string_view name) {
    auto reply = d.signals(inst);
    REQUIRE(reply.ok());
    for (const auto& s : reply->items) if (s.name == name) return s.ref;
    FAIL("missing fixture signal");
    return {};
}
std::string definition(Design& d, std::string_view name) {
    auto defs = d.definitions();
    REQUIRE(defs.ok());
    for (const auto& v : defs->items) if (v.name == name) return v.ref;
    FAIL("missing fixture definition");
    return {};
}
template<class T> std::vector<std::string> queryRefs(const T& reply) {
    REQUIRE(reply.ok());
    CHECK(reply->completeness.status == "complete");
    std::vector<std::string> result;
    for (const auto& i : reply->result.items) result.push_back(i.ref);
    return result;
}
model::TracePoint point(std::string ref, uint64_t lsb=0, uint64_t width=1) {
    model::TracePoint result;
    result.slice = {std::move(ref), {lsb, width}};
    return result;
}
std::vector<std::string> graphIds(const Result<model::QueryResult<model::TraceResult>>& reply) {
    REQUIRE(reply.ok());
    CHECK(reply->completeness.status == "complete");
    CHECK(reply->result.frontier.empty());
    std::vector<std::string> ids;
    for (const auto& n : reply->result.nodes) ids.push_back("node:" + n.id);
    for (const auto& e : reply->result.edges) ids.push_back("edge:" + e.id);
    return ids;
}
struct TemporarySources {
    std::filesystem::path folder;
    TemporarySources() {
        const auto serial = std::chrono::steady_clock::now().time_since_epoch().count();
        folder = std::filesystem::temp_directory_path() / ("hier-b-m3-source-" + std::to_string(serial));
        REQUIRE(std::filesystem::create_directory(folder));
        for (const auto& file : {"source.sv", "source_include.svh"})
            std::filesystem::copy_file(std::filesystem::path(HIER_FIXTURES) / "m3" / file, folder / file);
    }
    ~TemporarySources() { std::error_code error; std::filesystem::remove_all(folder, error); }
    std::unique_ptr<Design> open() const {
        model::OpenOptions options;
        options.files = {(folder / "source.sv").string()};
        options.tops = {"source_top"};
        auto reply = Design::open(options);
        REQUIRE(reply.ok());
        auto d = std::move(reply.value());
        REQUIRE(d->diagnostics().errorCount == 0);
        return d;
    }
};
}

TEST_CASE("B M3 API: search pages partition the hand-counted complete set", "[b-m3-api]") {
    for (bool per : {false, true}) DYNAMIC_SECTION("per=" << per) {
        auto d = openFixture("lookup.sv", {"alpha", "beta"}, per);
        model::SearchQuery query;
        query.text = "";
        PageRequest full;
        full.limit = 1000;
        const auto expected = queryRefs(d->search(query, full));
        REQUIRE(expected.size() == 136);
        PageRequest page;
        page.limit = 7;
        std::vector<std::string> got;
        std::set<std::string> cursors;
        do {
            auto reply = d->search(query, page);
            auto refs = queryRefs(reply);
            got.insert(got.end(), refs.begin(), refs.end());
            page.cursor = reply->result.next;
            if (!page.cursor.empty()) REQUIRE(cursors.insert(page.cursor).second);
            page.limit = 11; // page size is not bound into cursor identity
        } while (!page.cursor.empty());
        CHECK(got == expected);
        CHECK(std::set<std::string>(got.begin(), got.end()).size() == got.size());
    }
}

TEST_CASE("B M3 API: cursors reject wrong query method and new snapshots", "[b-m3-api]") {
    auto d = openFixture("lookup.sv", {"alpha", "beta"});
    model::SearchQuery query;
    query.text = "";
    PageRequest first;
    first.limit = 1;
    auto page = d->search(query, first);
    REQUIRE(page.ok());
    REQUIRE_FALSE(page->result.next.empty());
    PageRequest next;
    next.cursor = page->result.next;
    query.text = "state";
    auto wrong = d->search(query, next);
    REQUIRE_FALSE(wrong.ok());
    CHECK(wrong.error().code == ErrorCode::BadRequest);
    auto method = d->instancesOf(definition(*d, "path_leaf"), next);
    REQUIRE_FALSE(method.ok());
    CHECK(method.error().code == ErrorCode::BadRequest);
    auto other = openFixture("lookup.sv", {"alpha", "beta"});
    query.text = "";
    auto stale = other->search(query, next);
    REQUIRE_FALSE(stale.ok());
    CHECK(stale.error().code == ErrorCode::StaleCursor);
}

TEST_CASE("B M3 API: definition pagination does not collapse shared bodies", "[b-m3-api]") {
    for (bool per : {false, true}) DYNAMIC_SECTION("per=" << per) {
        auto d = openFixture("lookup.sv", {"alpha", "beta"}, per);
        auto def = definition(*d, "path_leaf");
        auto all = queryRefs(d->instancesOf(def));
        CHECK(all.size() == 11);
        PageRequest page;
        page.limit = 2;
        std::vector<std::string> got;
        std::set<std::string> cursors;
        do {
            auto reply = d->instancesOf(def, page);
            auto refs = queryRefs(reply);
            got.insert(got.end(), refs.begin(), refs.end());
            page.cursor = reply->result.next;
            if (!page.cursor.empty()) REQUIRE(cursors.insert(page.cursor).second);
            page.limit = 3;
        } while (!page.cursor.empty());
        CHECK(got == all);
        CHECK(queryRefs(d->instancesOf(definition(*d, "path_unused"))).empty());
    }
}

TEST_CASE("B M3 API: high fanout pages have identical cold hot boundaries and no loss", "[b-m3-api]") {
    auto d = openFixture("flow.sv", {"fanout"});
    const auto owner = root(*d, "fanout");
    const auto a = signal(*d, owner, "a");
    auto children = d->children(owner);
    REQUIRE(children.ok());
    REQUIRE(children->items.size() == 12);
    std::set<std::string> expected;
    std::vector<std::vector<std::string>> cold;
    for (bool warm : {false, true}) {
        StepLimit limit;
        limit.maxHops = 1000;
        std::set<std::string> got, cursors;
        std::vector<std::vector<std::string>> pages;
        do {
            auto reply = d->step(a, false, {}, limit);
            REQUIRE(reply.ok());
            REQUIRE_FALSE(reply->result.hops.empty());
            std::vector<std::string> facts;
            size_t continuations = 0;
            for (const auto& h : reply->result.hops) {
                REQUIRE_FALSE(h.fact.empty());
                facts.push_back(h.fact);
                REQUIRE(h.next.size() <= 1);
                for (const auto& c : h.next) {
                    ++continuations;
                    CHECK(c.from == model::BitRange{0, 1});
                    CHECK(c.slice.bits == model::BitRange{0, 1});
                    REQUIRE(got.insert(c.slice.ref).second);
                }
            }
            // 12 distinct logical parameter bodies: cannot visit two child bodies in one page.
            CHECK(continuations <= 1);
            pages.push_back(facts);
            limit.cursor = reply->result.next;
            if (!limit.cursor.empty()) {
                CHECK(reply->completeness.status == "partial");
                REQUIRE(cursors.insert(limit.cursor).second);
            } else CHECK(reply->completeness.status == "complete");
            REQUIRE(pages.size() <= 20);
        } while (!limit.cursor.empty());
        if (!warm) {
            // Bootstrap expected refs only AFTER the first run: do not prewarm child facts.
            for (const auto& i : children->items) expected.insert(signal(*d, i.ref, "d"));
        }
        CHECK(got == expected);
        CHECK(pages.size() >= 12);
        if (!warm) cold = pages;
        else CHECK(pages == cold);
    }
}

TEST_CASE("B M3 API: fixed-seed query order and tiny cache preserve graph identities", "[b-m3-api]") {
    for (size_t budget : {size_t{1}, size_t{64 * 1024 * 1024}}) DYNAMIC_SECTION("cache=" << budget) {
        auto d = openFixture("flow.sv", {"bit_paths"}, false, budget);
        const auto owner = root(*d, "bit_paths");
        const auto a = point(signal(*d, owner, "a"));
        const auto b = point(signal(*d, owner, "b"));
        model::SearchQuery query;
        query.text = "";
        std::vector<std::function<std::vector<std::string>()>> calls = {
            [&] { return graphIds(d->cone(b, model::TraceDirection::Back, model::TracePolicy::Combinational)); },
            [&] { return graphIds(d->paths(a, b)); },
            [&] { return queryRefs(d->search(query)); },
            [&] { auto r = d->resolvePath("bit_paths.a"); REQUIRE(r.ok()); return r->result; }
        };
        std::vector<std::vector<std::string>> controls;
        for (auto& call : calls) controls.push_back(call());
        std::vector<size_t> order{0, 1, 2, 3};
        std::mt19937 random(120316);
        for (int repetition=0; repetition<8; ++repetition) {
            std::shuffle(order.begin(), order.end(), random);
            for (size_t index : order) CHECK(calls[index]() == controls[index]);
        }
    }
}

TEST_CASE("B M3 API: shared and per-instance modes both preserve the KAT route", "[b-m3-api]") {
    auto shared = openFixture("flow.sv", {"bit_paths"});
    auto per = openFixture("flow.sv", {"bit_paths"}, true);
    auto a = point(signal(*shared, root(*shared, "bit_paths"), "a"));
    auto b = point(signal(*shared, root(*shared, "bit_paths"), "b"));
    CHECK(signal(*per, root(*per, "bit_paths"), "a") == a.slice.ref);
    CHECK(signal(*per, root(*per, "bit_paths"), "b") == b.slice.ref);
    auto first = shared->paths(a, b);
    auto second = per->paths(a, b);
    REQUIRE(first.ok());
    REQUIRE(second.ok());
    CHECK(first->completeness.status == "complete");
    CHECK(second->completeness.status == "complete");
    CHECK_FALSE(first->result.edges.empty());
    CHECK(first->result.nodes.size() == second->result.nodes.size());
    CHECK(first->result.edges.size() == second->result.edges.size());
    CHECK(first->result.hasConservative == second->result.hasConservative);
    // IDs are opaque and only promised within a snapshot. Never demand the same
    // token across two opens; detailed semantic maps are independently checked in CLI KATs.
}

TEST_CASE("B M3 API: pre-cancelled operations fail without partial and next query succeeds", "[b-m3-api]") {
    auto d = openFixture("flow.sv", {"bit_paths"});
    auto a = point(signal(*d, root(*d, "bit_paths"), "a"));
    auto b = point(signal(*d, root(*d, "bit_paths"), "b"));
    model::SearchQuery query;
    query.text = "";
    const auto def = definition(*d, "bit_paths");
    auto source = d->source(a.slice.ref, model::SourceKind::Definition);
    REQUIRE(source.ok());
    std::stop_source cancelled;
    cancelled.request_stop();
    const auto token = cancelled.get_token();
    auto assertCancelled = [](const auto& r) { REQUIRE_FALSE(r.ok()); CHECK(r.error().code == ErrorCode::Cancelled); };
    assertCancelled(d->search(query, {}, token));
    assertCancelled(d->instancesOf(def, {}, token));
    assertCancelled(d->resolvePath("bit_paths.a", token));
    assertCancelled(d->cone(a, model::TraceDirection::Forward, model::TracePolicy::Full, {}, token));
    assertCancelled(d->paths(a, b, {}, token));
    assertCancelled(d->step(a.slice.ref, false, {}, {}, token));
    assertCancelled(d->resolveSource(source->file, source->start.line, source->start.column, {}, token));
    assertCancelled(d->readSource(source->file, token));
    assertCancelled(d->checkInputs(token));
    CHECK_FALSE(queryRefs(d->search(query)).empty());
    CHECK_FALSE(graphIds(d->paths(a, b)).empty());
}

TEST_CASE("B M3 API: invalid budget is rejected before pre-cancellation", "[b-m3-api]") {
    auto d = openFixture("flow.sv", {"bit_paths"});
    auto a = point(signal(*d, root(*d, "bit_paths"), "a"));
    model::Budget budget;
    budget.maxNodes = 0;
    std::stop_source stopped;
    stopped.request_stop();
    auto reply = d->cone(a, model::TraceDirection::Back, model::TracePolicy::Full, budget, stopped.get_token());
    REQUIRE_FALSE(reply.ok());
    CHECK(reply.error().code == ErrorCode::BadRequest);
}

TEST_CASE("B M3 API: disk edits do not mutate snapshot spans and source read reports new bytes", "[b-m3-api]") {
    TemporarySources files;
    auto d = files.open();
    auto top = root(*d, "source_top");
    auto old = d->source(top, model::SourceKind::Definition);
    REQUIRE(old.ok());
    auto before = d->readSource(old->file);
    REQUIRE(before.ok());
    REQUIRE(before->matchesSnapshot);
    PageRequest first;
    first.limit = 1;
    auto originalPage = d->resolveSource(old->file, old->start.line, old->start.column, first);
    REQUIRE(originalPage.ok());
    REQUIRE_FALSE(originalPage->result.next.empty());
    PageRequest next;
    next.cursor = originalPage->result.next;
    auto originalNext = d->resolveSource(old->file, old->start.line, old->start.column, next);
    const auto oldRefs = queryRefs(originalNext);
    { std::ofstream out(files.folder / "source.sv", std::ios::binary | std::ios::app); out << "// changed\n"; }
    auto changed = d->checkInputs();
    REQUIRE(changed.ok());
    CHECK(changed->complete);
    CHECK(changed->changed == std::vector<std::string>{old->file});
    auto after = d->readSource(old->file);
    REQUIRE(after.ok());
    CHECK_FALSE(after->matchesSnapshot);
    CHECK(after->text == before->text + "// changed\n");
    CHECK(after->contentHash != before->contentHash);
    auto still = d->source(top, model::SourceKind::Definition);
    REQUIRE(still.ok());
    CHECK(still->contentHash == old->contentHash);
    CHECK(still->start.offset == old->start.offset);
    CHECK(still->end.offset == old->end.offset);
    CHECK(queryRefs(d->resolveSource(old->file, old->start.line, old->start.column, next)) == oldRefs);
}

TEST_CASE("B M3 API: source pages retain all overlapping occurrences and stable order", "[b-m3-api]") {
    for (bool per : {false, true}) DYNAMIC_SECTION("per=" << per) {
        auto d = openFixture("source.sv", {"source_top"}, per);
        const auto def = definition(*d, "source_leaf");
        auto span = d->source(def, model::SourceKind::Definition);
        REQUIRE(span.ok());
        // At the module token: exactly DefRef + its two occurrence definitions.
        PageRequest all;
        all.limit = 1000;
        auto expected = queryRefs(d->resolveSource(span->file, span->start.line, span->start.column, all));
        REQUIRE(expected.size() == 3);
        REQUIRE(expected.front() == def); // definition ref sorts before ObjectRef
        for (bool hot : {false, true}) {
            PageRequest page;
            page.limit = 1;
            std::vector<std::string> got;
            std::set<std::string> cursors;
            do {
                auto reply = d->resolveSource(span->file, span->start.line, span->start.column, page);
                auto refs = queryRefs(reply);
                REQUIRE(refs.size() <= static_cast<size_t>(page.limit));
                got.insert(got.end(), refs.begin(), refs.end());
                page.cursor = reply->result.next;
                if (!page.cursor.empty()) REQUIRE(cursors.insert(page.cursor).second);
                page.limit = hot ? 2 : 1;
            } while (!page.cursor.empty());
            CHECK(got == expected);
            CHECK(std::set<std::string>(got.begin(), got.end()).size() == 3);
        }
    }
}

TEST_CASE("B M3 API: source cursor binds file line column snapshot and survives cancelled retry", "[b-m3-api]") {
    auto d = openFixture("source.sv", {"source_top"});
    const auto def = definition(*d, "source_leaf");
    auto span = d->source(def, model::SourceKind::Definition);
    REQUIRE(span.ok());
    auto main = d->source(root(*d, "source_top"), model::SourceKind::Definition);
    REQUIRE(main.ok());
    PageRequest page;
    page.limit = 1;
    auto first = d->resolveSource(span->file, span->start.line, span->start.column, page);
    REQUIRE(first.ok());
    REQUIRE_FALSE(first->result.next.empty());
    page.cursor = first->result.next;
    const auto errorIs = [](const auto& r, ErrorCode code) { REQUIRE_FALSE(r.ok()); CHECK(r.error().code == code); };
    errorIs(d->resolveSource(main->file, main->start.line, main->start.column, page), ErrorCode::BadRequest);
    errorIs(d->resolveSource(span->file, span->start.line+1, span->start.column, page), ErrorCode::BadRequest);
    errorIs(d->resolveSource(span->file, span->start.line, span->start.column+1, page), ErrorCode::BadRequest);
    errorIs(d->resolveSource(span->file, span->start.line, {}, page), ErrorCode::BadRequest);
    auto other = openFixture("source.sv", {"source_top"});
    errorIs(other->resolveSource(span->file, span->start.line, span->start.column, page), ErrorCode::StaleCursor);
    std::stop_source stopped;
    stopped.request_stop();
    errorIs(d->resolveSource(span->file, span->start.line, span->start.column, page, stopped.get_token()), ErrorCode::Cancelled);
    auto retry = d->resolveSource(span->file, span->start.line, span->start.column, page);
    CHECK(queryRefs(retry).size() == 1);
    page.cursor = "not_a_valid_cursor";
    errorIs(d->resolveSource(span->file, span->start.line, span->start.column, page), ErrorCode::BadRequest);
}

TEST_CASE("B M3 API: generated 100000 leaves return bounded first page and exhaustive paged union", "[b-m3-api][b-m3-scale]") {
    // Exact output of baseline synthetic/gen.py --fanout 10 --depth 5 --unique 0.
    // Shared mode is the specified scaling case; no unapproved RAM/time SLA.
    auto d = openFixture("source_large.sv", {"top"});
    const auto def = definition(*d, "leaf");
    auto span = d->source(def, model::SourceKind::Definition);
    REQUIRE(span.ok());
    PageRequest page;
    page.limit = 1;
    auto first = d->resolveSource(span->file, span->start.line, span->start.column, page);
    REQUIRE(first.ok());
    REQUIRE(first->result.items.size() == 1);
    CHECK(first->completeness.status == "complete");
    REQUIRE_FALSE(first->result.next.empty());
    CHECK(first->result.items.front().ref == def);
    std::set<std::string> got{def}, cursors;
    page.cursor = first->result.next;
    page.limit = 512;
    while (!page.cursor.empty()) {
        auto reply = d->resolveSource(span->file, span->start.line, span->start.column, page);
        REQUIRE(reply.ok());
        CHECK(reply->completeness.status == "complete");
        REQUIRE(reply->result.items.size() <= static_cast<size_t>(page.limit));
        REQUIRE_FALSE(reply->result.items.empty());
        for (const auto& hit : reply->result.items) REQUIRE(got.insert(hit.ref).second);
        page.cursor = reply->result.next;
        if (!page.cursor.empty()) REQUIRE(cursors.insert(page.cursor).second);
        REQUIRE(cursors.size() <= 200);
    }
    // At 'module leaf': no leaf statement/declarator starts yet. One definition
    // plus all leaf occurrences, not a representative shared body.
    CHECK(got.size() == 100001);
}

TEST_CASE("B M3 API: deleted and invalid UTF8 source have specific errors and clean teardown", "[b-m3-api]") {
    TemporarySources files;
    auto d = files.open();
    auto source = d->source(root(*d, "source_top"), model::SourceKind::Definition);
    REQUIRE(source.ok());
    { std::ofstream out(files.folder / "source.sv", std::ios::binary | std::ios::trunc); out.put(static_cast<char>(0xff)); }
    auto invalid = d->readSource(source->file);
    REQUIRE_FALSE(invalid.ok());
    CHECK(invalid.error().code == ErrorCode::Unsupported);
    REQUIRE(std::filesystem::remove(files.folder / "source.sv"));
    auto missing = d->readSource(source->file);
    REQUIRE_FALSE(missing.ok());
    CHECK(missing.error().code == ErrorCode::NotFound);
    auto changes = d->checkInputs();
    REQUIRE(changes.ok());
    CHECK_FALSE(changes->complete);
    CHECK(changes->changed == std::vector<std::string>{source->file});
    CHECK(d->source(root(*d, "source_top"), model::SourceKind::Definition).ok());
}

TEST_CASE("B M3 API: CRLF is preserved and source offsets remain byte based", "[b-m3-api]") {
    TemporarySources files;
    const auto path = files.folder / "source.sv";
    std::ifstream in(path, std::ios::binary);
    const std::string lf{std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
    in.close();
    std::string crlf;
    for (char ch : lf) { if (ch == '\n') crlf += '\r'; crlf += ch; }
    { std::ofstream out(path, std::ios::binary | std::ios::trunc); out << crlf; }
    auto d = files.open();
    const auto top = root(*d, "source_top");
    auto span = d->source(top, model::SourceKind::Definition);
    REQUIRE(span.ok());
    CHECK(span->start.offset == crlf.find("module source_top"));
    CHECK(span->start.line == 2);
    CHECK(span->start.column == 1);
    auto read = d->readSource(span->file);
    REQUIRE(read.ok());
    CHECK(read->text == crlf);
    CHECK(read->matchesSnapshot);
}

TEST_CASE("B M3 API: known library directions permit full conservative traversal but attrs do not", "[b-m3-api]") {
    struct Library final : model::LibraryProvider {
        bool descriptiveAttrs;
        explicit Library(bool value) : descriptiveAttrs(value) {}
        std::optional<model::CellInfo> cell(std::string_view name) const override {
            if (name != "absent_m3") return {};
            model::CellInfo result;
            result.pins = {{"A", model::Direction::In, 1, {}},
                           {"Y", model::Direction::Out, 1, {}},
                           {"EMPTY", model::Direction::In, 1, {}}};
            if (descriptiveAttrs) result.attrs = {{"role", "flipflop"}, {"clock", "A"}};
            return result;
        }
    };
    for (bool attrs : {false, true}) DYNAMIC_SECTION("attrs=" << attrs) {
        model::OpenOptions options;
        options.files = {HIER_FIXTURES "/m3/flow.sv"};
        options.tops = {"box_boundary"};
        options.library = std::make_shared<Library>(attrs);
        auto result = Design::open(options);
        REQUIRE(result.ok());
        auto d = std::move(result.value());
        REQUIRE(d->diagnostics().errorCount == 0);
        auto y = point(signal(*d, root(*d, "box_boundary"), "y"));
        for (auto policy : {model::TracePolicy::Structural, model::TracePolicy::Combinational,
                            model::TracePolicy::Full}) {
            auto reply = d->cone(y, model::TraceDirection::Back, policy);
            REQUIRE(reply.ok());
            CHECK(reply->completeness.status == "complete");
            CHECK(reply->result.hasConservative == (policy == model::TracePolicy::Full));
            size_t crossings = 0;
            for (const auto& edge : reply->result.edges) {
                if (edge.kind != "blackbox") continue;
                ++crossings;
                CHECK(edge.precision == "conservative");
                CHECK(edge.role == "data");
                CHECK(edge.align == "all");
                CHECK(edge.map.empty());
            }
            if (policy == model::TracePolicy::Full) CHECK(crossings > 0);
            else CHECK(crossings == 0);
        }
    }
}
