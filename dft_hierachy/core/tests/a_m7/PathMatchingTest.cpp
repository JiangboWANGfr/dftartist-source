#include "HierarchyPath.h"
#include "Lookup.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <functional>
#include <set>
#include <tuple>

using namespace hier;
namespace {
using detail::PathSegment;
using detail::parseHierarchyPath;
const Error cancelled{ErrorCode::Cancelled, "lookup cancelled"};
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
std::vector<PathSegment> slotPath(const model::BodySkeleton &body, const model::ChildSlot &slot) {
    std::vector<PathSegment> parts;
    for (auto scope = slot.scope; scope >= 0; scope = body.scopes[size_t(scope)].parent) {
        const auto &item = body.scopes[size_t(scope)];
        parts.push_back({item.name, item.arrayIndex});
    }
    std::reverse(parts.begin(), parts.end());
    parts.push_back({slot.name, slot.arrayIndex});
    return parts;
}
// The previous complete candidate-materialization algorithm. This is an A
// compatibility reference, not a new independent B grammar/semantic oracle.
Result<model::QueryResult<std::vector<std::string>>>
originalResolvePath(const db::DesignDb &db, std::string_view text, Cancel cancel) {
    auto path = parseHierarchyPath(text);
    if (!path)
        return path.error();
    if (cancel.stop_requested())
        return cancelled;
    const auto &parts = path->segments;
    const auto &tops = db.frontend().tops();
    struct Position { model::InstKey key; model::BodyId body; size_t offset; };
    std::vector<Position> work;
    bool includesTop = false;
    for (size_t i = 0; i < tops.size(); ++i) {
        if (cancel.stop_requested())
            return cancelled;
        if (parts[0] == PathSegment{tops[i].name, {}}) {
            includesTop = true;
            work.push_back({{uint32_t(i)}, tops[i].body, 1});
        }
    }
    if (!includesTop && !path->absolute)
        for (size_t i = 0; i < tops.size(); ++i) {
            if (cancel.stop_requested())
                return cancelled;
            work.push_back({{uint32_t(i)}, tops[i].body, 0});
        }
    // Tuple order is the public numeric reference order, with instance/port/signal
    // ranks. Insertion orders and shared-body identities cannot change the result.
    std::set<std::tuple<model::InstKey, int, size_t>> found;
    auto matches = [&](size_t offset, const std::vector<PathSegment> &candidate) {
        return candidate.size() <= parts.size() - offset &&
               std::equal(candidate.begin(), candidate.end(), parts.begin() + std::ptrdiff_t(offset));
    };
    while (!work.empty()) {
        if (cancel.stop_requested())
            return cancelled;
        auto current = std::move(work.back());
        work.pop_back();
        if (current.offset == parts.size()) {
            found.emplace(std::move(current.key), 0, 0);
            continue;
        }
        if (current.body == model::kNoBody) {
            auto at = db.locate(current.key, cancel);
            if (!at)
                return at.error();
            const auto &pins = at->steps.back().slot->blackboxPins;
            for (size_t i = 0; i < pins.size(); ++i) {
                if (cancel.stop_requested())
                    return cancelled;
                if (current.offset + 1 == parts.size() && parts.back() == PathSegment{pins[i], {}})
                    found.emplace(current.key, 1, i);
            }
            continue;
        }
        auto body = db.skeleton(current.body, cancel);
        if (!body)
            return body.error();
        for (size_t i = 0; i < (*body)->slots.size(); ++i) {
            if (cancel.stop_requested())
                return cancelled;
            const auto &slot = (*body)->slots[i];
            auto segments = slotPath(**body, slot);
            if (matches(current.offset, segments)) {
                auto key = current.key;
                key.push_back(uint32_t(i));
                work.push_back({std::move(key), slot.body, current.offset + segments.size()});
            }
        }
        for (size_t i = 0; i < (*body)->ports.size(); ++i) {
            if (cancel.stop_requested())
                return cancelled;
            if (current.offset + 1 == parts.size() &&
                parts.back() == PathSegment{(*body)->ports[i].name, {}})
                found.emplace(current.key, 1, i);
        }
        auto facts = db.connections(current.body, cancel);
        if (!facts)
            return facts.error();
        for (size_t i = 0; i < (*facts)->signals.size(); ++i) {
            if (cancel.stop_requested())
                return cancelled;
            auto local = parseHierarchyPath((*facts)->signals[i].localPath);
            if (!local)
                return Error{ErrorCode::Internal, "invalid frontend signal path"};
            if (local->segments.size() == parts.size() - current.offset &&
                matches(current.offset, local->segments))
                found.emplace(current.key, 2, i);
        }
    }
    model::QueryResult<std::vector<std::string>> result;
    for (const auto &[key, kind, index] : found) {
        if (cancel.stop_requested())
            return cancelled;
        result.result.push_back(kind == 0 ? model::instRef(key)
                                : std::string(kind == 1 ? "p:" : "s:") + model::formatInstKey(key) +
                                      ":" + std::to_string(index));
    }
    return result;
}

struct Frontend final : frontend::Frontend {
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_{{"root", 0}, {"other.root", 0}};
    std::vector<model::DefInfo> defs_{{"root", model::DefKind::Module, "", 0}};
    std::array<model::BodySkeleton, 3> bodies;
    std::array<model::BodyConnections, 3> facts;
    bool fail = false;
    std::stop_source *stop = nullptr; // Borrowed original Frontend-boundary control.
    Frontend() {
        bodies[0].scopes = {{-1, "g.outer", {-2}}, {0, "inner", {3}}};
        auto add = [&](std::string name, model::BodyId body, int32_t scope,
                       std::vector<int32_t> indices) {
            model::ChildSlot slot;
            slot.name = std::move(name); slot.body = body; slot.scope = scope;
            slot.arrayIndex = std::move(indices);
            slot.kind = body == model::kNoBody ? model::InstKind::Blackbox : model::InstKind::Module;
            slot.blackboxPins = {"A", "A", "B.dot"};
            bodies[0].slots.push_back(std::move(slot));
        };
        add("leaf", 1, -1, {});
        add("leaf", 1, 1, {-2, 3});
        add("name.with.dot", 1, -1, {});
        add("leaf[3]", 1, -1, {});
        add("leaf", 1, -1, {3});
        add("leaf", 1, -1, {});
        add("gate", model::kNoBody, -1, {});
        bodies[0].slots.back().kind = model::InstKind::Primitive;
        add("bb", model::kNoBody, -1, {});
        model::ChildSlot deep;
        deep.name = "deep"; deep.body = 2;
        bodies[1].slots.push_back(deep);
        for (const auto name : {"p", "same", "same", "a.b", ""}) {
            model::PortInfo port; port.name = name; bodies[1].ports.push_back(port);
        }
        for (const auto path : {"same", "p", "plain", "g[-1].inner[2].\\a.b ", "/ absolute", "same"}) {
            model::SignalInfo signal;
            signal.name = "label"; signal.localPath = path;
            facts[1].signals.push_back(std::move(signal));
        }
        model::SignalInfo last; last.name = "finish"; last.localPath = "finish";
        facts[2].signals.push_back(last);
        for (auto &body : facts) body.estimatedBytes = 1024;
    }
    const model::FrontendInfo &info() const override { return info_; }
    const std::vector<model::TopInfo> &tops() const override { return tops_; }
    const std::vector<model::DefInfo> &definitions() const override { return defs_; }
    size_t bodyCount() const override { return bodies.size(); }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId b) const override { return bodies.at(b); }
    model::BodyConnections connections(model::BodyId b) const override {
        if (b == 1 && fail) throw Error{ErrorCode::Internal, "original path extraction failure"};
        if (b == 1 && stop) stop->request_stop();
        return facts.at(b);
    }
};
} // namespace

TEST_CASE("path matching consumes the complete original grammar without candidate ownership", "[a-m7]") {
    const std::vector<PathSegment> target{{"top", {}}, {"g", {-2, 3}}, {"a.b", {}}};
    for (const auto text : {"top.g[-2][3].\\a.b ", "/ top / g[ -02 ][+003] / \\a.b \t"}) {
        const auto matched = detail::matchesHierarchyPath(text, target);
        REQUIRE(matched); CHECK(*matched);
    }
    for (const auto text : {"top.g[-2][3].\\a.b .tail", "top.g[-2].\\a.b ", "top.g[-2][3][4].\\a.b ", "top.g[-2][3].a.b"}) {
        const auto matched = detail::matchesHierarchyPath(text, target);
        REQUIRE(matched); CHECK_FALSE(*matched);
    }
    for (const auto text : {"no_match..tail", "no_match[2147483648]", "no_match.\\unterminated", "top.g[-2][3].\\a.b ."}) {
        const auto matched = detail::matchesHierarchyPath(text, target);
        REQUIRE_FALSE(matched); CHECK(matched.error().message == "invalid hierarchy path syntax");
    }
    const std::vector<std::vector<PathSegment>> targets{{}, {{"a", {}}}, {{"a", {0}}},
        {{"a", {}}, {"b", {}}}, target, {{std::string("a\0b", 3), {}}}};
    const std::string alphabet("a0 ./\\[]+-\t\0\xff", 13);
    std::function<void(std::string, size_t)> visit = [&](std::string text, size_t depth) {
        const auto parsed = parseHierarchyPath(text);
        for (const auto &expected : targets) {
            const auto matched = detail::matchesHierarchyPath(text, expected);
            REQUIRE(bool(matched) == bool(parsed));
            if (parsed) CHECK(*matched == (parsed->segments == expected));
            else CHECK(json(matched.error()) == json(parsed.error()));
        }
        if (depth) for (char byte : alphabet) visit(text + byte, depth - 1);
    };
    visit("", 4);
    const std::string nul("\\a\0b ", 5);
    REQUIRE(detail::matchesHierarchyPath(nul, targets.back()));
    CHECK(*detail::matchesHierarchyPath(nul, targets.back()));
    std::string deep = "top";
    std::vector<PathSegment> parts{{"top", {}}};
    for (int32_t i = 0; i < 2000; ++i) {
        deep += ".\\long.segment [" + std::to_string(i) + "]";
        parts.push_back({"long.segment", {i}});
    }
    REQUIRE(detail::matchesHierarchyPath(deep, parts));
    CHECK(*detail::matchesHierarchyPath(deep, parts));
    parts.back().indices[0] = -1;
    REQUIRE(detail::matchesHierarchyPath(deep, parts));
    CHECK_FALSE(*detail::matchesHierarchyPath(deep, parts));
}

TEST_CASE("path resolution matches original candidate materialization across every branch", "[a-m7]") {
    const std::vector<std::string> queries{"root", "/root", "other.root", "\\other.root ",
        "leaf", "root.leaf", "leaf.same", "root.leaf.same", "root.leaf.p", "root.leaf.deep.finish",
        "root.\\g.outer [-2].inner[3].leaf[-2][3].same",
        "root/\\g.outer [-02]/inner[+03]/leaf[-2][03]/plain",
        "root.\\g.outer [-2].inner", "root.\\g.outer [-2].inner[3].leaf[-2]",
        "root.\\name.with.dot .same", "root.name.with.dot.same", "root.leaf[3].same",
        "root.\\leaf[3] .same", "root.leaf[+003].same", "root.leaf.\\a.b ",
        "root.leaf.g[-1].inner[2].\\a.b ", "root.leaf.absolute",
        "\\other.root /leaf/same", "root.gate.A", "bb.A", "root.bb.\\B.dot ",
        "/leaf.same", "/unknown/leaf", "root.no_match", "root.leaf.no_match"};
    model::QueryResult<std::vector<std::string>> retained;
    for (const size_t budget : std::array<size_t, 4>{0, 1, 128, 64 * 1024 * 1024}) {
        db::DesignDb db(std::make_unique<Frontend>(), budget);
        for (size_t pass = 0; pass < 4; ++pass)
            for (size_t step = 0; step < queries.size(); ++step) {
                const auto &query = queries[pass % 2 ? queries.size() - step - 1 : step];
                const auto expected = originalResolvePath(db, query, {});
                const auto actual = detail::resolvePath(db, query, {});
                REQUIRE(actual); REQUIRE(expected);
                CHECK(json(*actual) == json(*expected));
            }
        const auto result = detail::resolvePath(db, "root.leaf.same", {});
        REQUIRE(result);
        CHECK(result->result == std::vector<std::string>{"p:0.0:1", "p:0.0:2", "s:0.0:0", "s:0.0:5",
                                                       "p:0.5:1", "p:0.5:2", "s:0.5:0", "s:0.5:5"});
        const auto generated = detail::resolvePath(db, "root.\\g.outer [-2].inner[3].leaf[-2][3].same", {});
        REQUIRE(generated);
        CHECK(generated->result == std::vector<std::string>{"p:0.1:1", "p:0.1:2", "s:0.1:0", "s:0.1:5"});
        const auto pins = detail::resolvePath(db, "bb.A", {});
        REQUIRE(pins);
        CHECK(pins->result == std::vector<std::string>{"p:0.7:0", "p:0.7:1", "p:1.7:0", "p:1.7:1"});
        retained = *result;
    }
    REQUIRE(retained.result.size() == 8);
    CHECK(retained.result.front() == "p:0.0:1");
    CHECK(retained.result.back() == "s:0.5:5");
}

TEST_CASE("path matching retains nonmatching malformed tails and original error priority", "[a-m7]") {
    auto front = std::make_unique<Frontend>();
    auto &source = *front;
    db::DesignDb db(std::move(front), 0);
    for (const auto local : {"different..tail", "different[2147483648]", "different.\\unterminated"}) {
        source.facts[1].signals.back().localPath = local;
        for (const auto query : {"root.leaf.no_match", "root.leaf.same", "root.leaf.p", "root.leaf.deep.finish"}) {
            const auto expected = originalResolvePath(db, query, {});
            const auto actual = detail::resolvePath(db, query, {});
            REQUIRE_FALSE(actual); REQUIRE_FALSE(expected);
            CHECK(json(actual.error()) == json(expected.error()));
            CHECK(actual.error().message == "invalid frontend signal path");
        }
        REQUIRE(detail::resolvePath(db, "root", {}));
        REQUIRE(detail::resolvePath(db, "root.leaf", {}));
    }
    source.facts[1].signals.back().localPath = "same";
    source.fail = true;
    // This test-owned provider throws through the existing DB boundary. Both
    // old and new private queries propagate that Error; do not invent a Result.
    for (bool original : {true, false}) {
        try {
            if (original) (void)originalResolvePath(db, "root.leaf.same", {});
            else (void)detail::resolvePath(db, "root.leaf.same", {});
            FAIL("provider Error must propagate");
        } catch (const Error &error) {
            CHECK(error.code == ErrorCode::Internal);
            CHECK(error.message == "original path extraction failure");
        }
    }
    source.fail = false;
    std::stop_source beforeStop;
    source.stop = &beforeStop;
    const auto before = originalResolvePath(db, "root.leaf.same", beforeStop.get_token());
    std::stop_source afterStop;
    source.stop = &afterStop;
    const auto after = detail::resolvePath(db, "root.leaf.same", afterStop.get_token());
    REQUIRE_FALSE(before); REQUIRE_FALSE(after);
    CHECK(json(before.error()) == json(after.error()));
    CHECK(after.error().code == ErrorCode::Cancelled);
    source.stop = nullptr;
    REQUIRE(detail::resolvePath(db, "root.leaf.same", {}));
    for (const auto query : {"bad..path", "root.leaf[2147483648]", "root.\\unterminated", "root.leaf.same"}) {
        const auto expected = originalResolvePath(db, query, beforeStop.get_token());
        const auto actual = detail::resolvePath(db, query, beforeStop.get_token());
        REQUIRE_FALSE(actual); REQUIRE_FALSE(expected);
        CHECK(json(actual.error()) == json(expected.error()));
    }
}

TEST_CASE("public path resolution round trips RTL search values across sharing and cache eviction", "[a-m7]") {
    std::vector<std::string> retained;
    for (bool perInstance : {false, true})
        for (const size_t cache : std::array<size_t, 4>{0, 1, 128, 64 * 1024 * 1024}) {
            model::OpenOptions options;
            options.files = {HIER_PATH_MATCHING_FIXTURE};
            options.tops = {"alpha", "beta"};
            options.forcePerInstanceBodies = perInstance;
            options.connectionCacheBytes = cache;
            auto opened = Design::open(options);
            REQUIRE(opened);
            auto &design = **opened;
            REQUIRE(design.diagnostics().errorCount == 0);
            model::SearchQuery query;
            query.kinds = {model::HitKind::Instance, model::HitKind::Port, model::HitKind::Signal};
            std::string cursor;
            size_t count = 0;
            do {
                auto page = design.search(query, {cursor, 7});
                REQUIRE(page);
                for (const auto &hit : page->result.items) {
                    const auto resolved = design.resolvePath(hit.pathText);
                    REQUIRE(resolved);
                    CHECK(resolved->completeness.status == "complete");
                    CHECK(std::find(resolved->result.begin(), resolved->result.end(), hit.ref) != resolved->result.end());
                    retained = resolved->result;
                    ++count;
                }
                cursor = page->result.next;
            } while (!cursor.empty());
            CHECK(count > 50);
            const auto escaped = design.resolvePath("alpha.\\u[3] ");
            const auto array = design.resolvePath("alpha.u[3]");
            REQUIRE(escaped); REQUIRE(array);
            CHECK(escaped->result.size() == 1); CHECK(array->result.size() == 1);
            CHECK(escaped->result != array->result);
            const auto alias = design.resolvePath(" / alpha / u[+003] ");
            REQUIRE(alias); CHECK(json(*alias) == json(*array));
            std::stop_source stop;
            stop.request_stop();
            const auto cancelledResult = design.resolvePath("alpha.u[3]", stop.get_token());
            REQUIRE_FALSE(cancelledResult);
            CHECK(cancelledResult.error().code == ErrorCode::Cancelled);
            REQUIRE(design.resolvePath("alpha.u[3]"));
        }
    REQUIRE_FALSE(retained.empty());
    CHECK((retained.front().starts_with("s:") || retained.front().starts_with("p:")));
}
