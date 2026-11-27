// Independent B oracle: DESIGN 5.5.5/5.5.7; only public API/types.
#include "hier/Design.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <functional>
#include <set>
#include <stop_token>
#include <tuple>

using namespace hier;
namespace {
using Hit = model::ObjectHit;
using Kind = model::HitKind;
using Key = std::tuple<Kind, std::string, std::string, std::vector<std::string>,
                       std::string, std::optional<std::string>, std::optional<std::string>>;
Key key(const Hit& h) { return {h.kind, h.ref, h.name, h.path, h.pathText, h.inst, h.def}; }
std::unique_ptr<Design> open(bool per = false, size_t cache = 64 * 1024 * 1024,
                           bool edges = false) {
    model::OpenOptions o;
    o.files = {std::string(HIER_FIXTURES) + "/m3/" + (edges ? "lookup_edges.sv" : "lookup.sv")};
    o.tops = edges ? std::vector<std::string>{"edge_a", "edge_b"}
                   : std::vector<std::string>{"alpha", "beta"};
    o.forcePerInstanceBodies = per;
    o.connectionCacheBytes = cache;
    auto r = Design::open(o);
    REQUIRE(r.ok());
    auto d = std::move(r.value());
    REQUIRE(d->diagnostics().errorCount == 0);
    return d;
}
template<class T> const T& complete(const Result<model::QueryResult<T>>& r) {
    REQUIRE(r.ok());
    CHECK(r->completeness.status == "complete");
    CHECK(r->completeness.reasons.empty());
    return r->result;
}
template<class T> void error(const Result<T>& r, ErrorCode code) {
    REQUIRE_FALSE(r.ok());
    CHECK(r.error().code == code);
    CHECK_FALSE(r.error().message.empty());
}
std::string def(Design& d, const std::string& name) {
    auto r = d.definitions();
    REQUIRE(r.ok());
    for (const auto& x : r->items) if (x.name == name) return x.ref;
    FAIL("missing independently named definition");
    return {};
}
std::string inst(Design& d, const std::vector<std::string>& path) {
    std::vector<model::InstInfo> todo = d.roots();
    for (size_t i = 0; i < todo.size(); ++i) {
        const auto x = todo[i];
        if (x.path == path) return x.ref;
        auto r = d.children(x.ref);
        REQUIRE(r.ok());
        todo.insert(todo.end(), r->items.begin(), r->items.end());
    }
    FAIL("missing independently named occurrence");
    return {};
}
std::vector<Key> pages(Design& d, const model::SearchQuery& q, int limit) {
    PageRequest p;
    p.limit = limit;
    std::vector<Key> out;
    std::set<std::string> cursors, refs;
    do {
        auto r = d.search(q, p);
        const auto& result = complete(r);
        REQUIRE(result.items.size() <= static_cast<size_t>(p.limit));
        for (const auto& h : result.items) {
            REQUIRE(refs.insert(h.ref).second);
            out.push_back(key(h));
        }
        p.cursor = result.next;
        if (!p.cursor.empty()) {
            REQUIRE_FALSE(result.items.empty());
            REQUIRE(cursors.insert(p.cursor).second);
        }
        p.limit = p.limit == 1 ? 7 : (p.limit == 7 ? 11 : 1);
        REQUIRE(cursors.size() <= 200);
    } while (!p.cursor.empty());
    return out;
}
}

TEST_CASE("B lookup: six-kind pagination counts order metadata and roundtrip", "[b-lookup]") {
    std::vector<Key> reference;
    for (bool per : {false, true}) for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
        {
            INFO("per=" << per << " cache=" << cache);
            auto d = open(per, cache);
            model::SearchQuery q;
            auto cold = pages(*d, q, 1);
            REQUIRE(cold.size() == 136);
            std::array<size_t, 6> counts{};
            Kind previous = Kind::Definition;
            for (const auto& k : cold) {
                const auto& [kind, ref, name, path, text, owner, definition] = k;
                CHECK(kind >= previous);
                previous = kind;
                ++counts[static_cast<size_t>(kind)];
                REQUIRE(definition.has_value());
                if (kind == Kind::Definition) {
                    CHECK(*definition == ref);
                    CHECK_FALSE(owner.has_value());
                    CHECK(path == std::vector<std::string>{name});
                } else {
                    REQUIRE(owner.has_value());
                    auto i = d->instance(*owner);
                    REQUIRE(i.ok());
                    CHECK(i->def == *definition);
                    if (kind == Kind::Instance) CHECK(*owner == ref);
                    if (kind == Kind::Process || kind == Kind::Register) {
                        CHECK(name.starts_with(kind == Kind::Process ? "@process:" : "@register:"));
                        CHECK(path.back() == name);
                    } else {
                        auto resolved = d->resolvePath(text);
                        const auto& refs = complete(resolved);
                        CHECK(std::find(refs.begin(), refs.end(), ref) != refs.end());
                    }
                }
            }
            CHECK(counts == std::array<size_t, 6>{4, 13, 37, 49, 22, 11});
            CHECK(pages(*d, q, 11) == cold);
            if (reference.empty()) reference = cold;
            else CHECK(cold == reference);
        }
    }
}

TEST_CASE("B lookup: normalized kinds scoped cursor and changed query rejection", "[b-lookup]") {
    auto d = open();
    model::SearchQuery q;
    q.scope = inst(*d, {"alpha", "u_extra"});
    CHECK(pages(*d, q, 1).size() == 12);
    q.kinds = std::vector<Kind>{};
    CHECK(pages(*d, q, 1).empty());
    q.kinds = std::vector<Kind>{Kind::Signal, Kind::Port, Kind::Signal};
    auto first = d->search(q, {"", 1});
    REQUIRE_FALSE(complete(first).next.empty());
    PageRequest p{first->result.next, 2};
    q.kinds = std::vector<Kind>{Kind::Port, Kind::Signal};
    auto normalized = d->search(q, p);
    REQUIRE(complete(normalized).items.size() == 2);
    CHECK(pages(*d, q, 1).size() == 7);
    auto bad = q;
    bad.text = " ";
    error(d->search(bad, p), ErrorCode::BadRequest);
    bad = q; bad.kinds = std::vector<Kind>{Kind::Signal};
    error(d->search(bad, p), ErrorCode::BadRequest);
    bad = q; bad.scope = inst(*d, {"beta", "u_extra"});
    error(d->search(bad, p), ErrorCode::BadRequest);
    error(d->instancesOf(def(*d, "path_leaf"), p), ErrorCode::BadRequest);
    auto other = open();
    error(other->search(q, p), ErrorCode::StaleCursor);
    error(d->search(q, {"not-a-cursor", 1}), ErrorCode::BadRequest);
    error(d->search(q, {"", 0}), ErrorCode::BadRequest);
    error(d->search(q, {"", -1}), ErrorCode::BadRequest);
    bad = q; bad.scope = "s:0:0";
    error(d->search(bad), ErrorCode::BadRequest);
    bad.scope = "i:999999";
    error(d->search(bad), ErrorCode::NotFound);
}

TEST_CASE("B lookup: all definition occurrences paginate including primitive blackbox roots unused", "[b-lookup]") {
    for (bool per : {false, true}) for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
        DYNAMIC_SECTION("per=" << per << " cache=" << cache) {
            auto d = open(per, cache, true);
            for (const auto& [name, count] : std::vector<std::pair<std::string, size_t>>{
                     {"edge_leaf", 12}, {"absent_edge", 3}, {"buf", 3},
                     {"edge_a", 1}, {"edge_b", 1}, {"edge_unused", 0}}) {
                const auto definition = def(*d, name);
                model::SearchQuery query;
                query.kinds = std::vector<Kind>{Kind::Instance};
                auto hits = pages(*d, query, 1);
                // Literal search also matches ancestor pathText. Only the public
                // owning def field selects occurrences of this exact definition.
                std::erase_if(hits, [&](const Key& h) { return std::get<6>(h) != definition; });
                CHECK(hits.size() == count);
                std::vector<std::string> got;
                std::set<std::string> seen;
                PageRequest p{"", 1};
                do {
                    auto r = d->instancesOf(definition, p);
                    const auto& result = complete(r);
                    REQUIRE(result.items.size() <= static_cast<size_t>(p.limit));
                    for (const auto& x : result.items) {
                        CHECK(x.def == definition);
                        CHECK(x.defName == name);
                        REQUIRE(seen.insert(x.ref).second);
                        got.push_back(x.ref);
                    }
                    p.cursor = result.next;
                    p.limit = 2;
                    REQUIRE(got.size() <= count);
                } while (!p.cursor.empty());
                CHECK(got.size() == count);
                std::vector<std::string> want;
                for (const auto& h : hits) want.push_back(std::get<1>(h));
                CHECK(got == want);
            }
            auto leaf = d->instancesOf(def(*d, "edge_leaf"), {"", 1});
            PageRequest p{complete(leaf).next, 1};
            REQUIRE_FALSE(p.cursor.empty());
            error(d->instancesOf(def(*d, "absent_edge"), p), ErrorCode::BadRequest);
            error(d->search({}, p), ErrorCode::BadRequest);
        }
    }
}

TEST_CASE("B lookup: pre-cancel cold hot and cursor retry do not poison queries", "[b-lookup]") {
    for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
        DYNAMIC_SECTION("cache=" << cache) {
            auto d = open(false, cache);
            std::stop_source stop;
            stop.request_stop();
            model::SearchQuery q;
            error(d->search(q, {"", 1}, stop.get_token()), ErrorCode::Cancelled);
            error(d->resolvePath("alpha.u_extra", stop.get_token()), ErrorCode::Cancelled);
            const auto leaf = def(*d, "path_leaf");
            error(d->instancesOf(leaf, {"", 1}, stop.get_token()), ErrorCode::Cancelled);
            CHECK(pages(*d, q, 1).size() == 136);
            for (int repeat = 0; repeat < 3; ++repeat) {
                auto first = d->search(q, {"", 1});
                PageRequest p{complete(first).next, 3};
                REQUIRE_FALSE(p.cursor.empty());
                auto expected = d->search(q, p);
                complete(expected);
                error(d->search(q, p, stop.get_token()), ErrorCode::Cancelled);
                auto retry = d->search(q, p);
                const auto& result = complete(retry);
                CHECK(result.next == expected->result.next);
                REQUIRE(result.items.size() == expected->result.items.size());
                for (size_t i = 0; i < result.items.size(); ++i)
                    CHECK(key(result.items[i]) == key(expected->result.items[i]));
                auto one = d->instancesOf(leaf, {"", 1});
                p.cursor = complete(one).next;
                auto before = d->instancesOf(leaf, p);
                complete(before);
                error(d->instancesOf(leaf, p, stop.get_token()), ErrorCode::Cancelled);
                auto after = d->instancesOf(leaf, p);
                CHECK(complete(after).next == before->result.next);
                REQUIRE(after->result.items.size() == before->result.items.size());
                for (size_t i = 0; i < after->result.items.size(); ++i)
                    CHECK(after->result.items[i].ref == before->result.items[i].ref);
                CHECK(complete(d->resolvePath("alpha.u_extra")).size() == 1);
            }
            CHECK(pages(*d, q, 7).size() == 136);
        }
    }
}

TEST_CASE("B lookup: returned page values own data after Design destruction", "[b-lookup]") {
    auto d = open();
    model::SearchQuery q;
    q.scope = inst(*d, {"alpha", "u_extra"});
    auto hits = d->search(q, {"", 1000});
    auto occurrences = d->instancesOf(def(*d, "path_leaf"), {"", 1000});
    REQUIRE(complete(hits).items.size() == 12);
    REQUIRE(complete(occurrences).items.size() == 11);
    const auto saved = hits->result.items;
    d.reset();
    for (size_t i = 0; i < saved.size(); ++i) {
        CHECK(key(saved[i]) == key(hits->result.items[i]));
        CHECK_FALSE(saved[i].name.empty());
        CHECK_FALSE(saved[i].pathText.empty());
    }
    for (const auto& x : occurrences->result.items) {
        CHECK(x.defName == "path_leaf");
        CHECK(x.path.size() >= 2);
    }
}
