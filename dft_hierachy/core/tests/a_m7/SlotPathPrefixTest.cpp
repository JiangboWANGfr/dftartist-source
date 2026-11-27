#include "SlotPathPrefix.h"
#include "Lookup.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <random>

using namespace hier;
namespace {
using detail::PathSegment;
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
// A test-local full candidate reference, not an independent B specification.
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
size_t completeMatch(const model::BodySkeleton &body, const model::ChildSlot &slot,
                     std::span<const PathSegment> remaining) {
    const auto path = fullPath(body, slot);
    return path.size() <= remaining.size() && std::equal(path.begin(), path.end(), remaining.begin())
               ? path.size() : 0;
}
struct Frontend final : frontend::Frontend {
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_{{"root", 0}, {"beta.top", 0}};
    std::vector<model::DefInfo> defs_{{"root", model::DefKind::Module, "", 0},
                                    {"shared", model::DefKind::Module, "", 0},
                                    {"last", model::DefKind::Module, "", 0}};
    std::array<model::BodySkeleton, 3> bodies;
    std::array<model::BodyConnections, 3> facts;
    std::stop_source *stop = nullptr;
    Frontend() {
        bodies[0].scopes = {{-1, "g", {}}};
        auto add = [&](size_t owner, std::string name, int32_t scope, model::BodyId body) {
            model::ChildSlot slot;
            slot.name = std::move(name); slot.scope = scope; slot.body = body;
            slot.def = body == model::kNoBody ? 2 : body;
            slot.kind = body == model::kNoBody ? model::InstKind::Blackbox : model::InstKind::Module;
            slot.blackboxPins = {"a.b", "a.b"};
            bodies[owner].slots.push_back(std::move(slot));
        };
        add(0, "g", -1, 1);
        add(0, "leaf", 0, 1);
        add(0, "bb", 0, model::kNoBody);
        // Shared body1 can be visited with remaining offsets1 and2 in one query.
        bodies[1].scopes = {{1, "inner", {2}}, {-1, "leaf", {}}};
        add(1, "tail", 1, 2);
        add(1, "other", 0, 2);
        for (size_t b = 0; b < bodies.size(); ++b) {
            bodies[b].def = uint32_t(b);
            facts[b].estimatedBytes = 1024;
        }
        model::PortInfo port; port.name = "tail"; bodies[1].ports.push_back(port);
        model::SignalInfo signal; signal.name = "tail"; signal.localPath = "tail";
        facts[1].signals.push_back(signal);
    }
    const model::FrontendInfo &info() const override { return info_; }
    const std::vector<model::TopInfo> &tops() const override { return tops_; }
    const std::vector<model::DefInfo> &definitions() const override { return defs_; }
    size_t bodyCount() const override { return bodies.size(); }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId id) const override { return bodies.at(id); }
    model::BodyConnections connections(model::BodyId id) const override {
        if (id == 1 && stop) stop->request_stop();
        return facts.at(id);
    }
};
} // namespace

TEST_CASE("scope prefixes equal full candidates with unordered parents and repeated slots", "[a-m7]") {
    std::mt19937 random(67219);
    const std::vector<std::string> names{"g", "other", "a.b", "u[3]", "", std::string("x\0y", 3)};
    for (size_t round = 0; round < 80; ++round) {
        model::BodySkeleton body;
        constexpr size_t scopes = 96, slots = 192;
        for (size_t i = 0; i < scopes; ++i) {
            const auto parent = i && random() % 4 ? int32_t(random() % i) : -1;
            body.scopes.push_back({parent, names[random() % names.size()], {int32_t(random() % 9) - 4}});
        }
        std::reverse(body.scopes.begin(), body.scopes.end());
        for (auto &scope : body.scopes)
            if (scope.parent >= 0) scope.parent = int32_t(scopes - 1) - scope.parent;
        for (size_t i = 0; i < slots; ++i) {
            model::ChildSlot slot;
            slot.name = names[random() % names.size()];
            slot.scope = random() % 5 ? int32_t(random() % scopes) : -1;
            if (random() % 2) slot.arrayIndex = {int32_t(random() % 9) - 4, 2};
            body.slots.push_back(std::move(slot));
        }
        std::vector<std::vector<PathSegment>> targets{{}, {{"absent", {}}}};
        for (size_t i = 0; i < 6; ++i) {
            auto path = fullPath(body, body.slots[random() % slots]);
            targets.push_back(path);
            path.push_back({"later", {}}); targets.push_back(path);
            path.pop_back(); path.back().indices.push_back(99); targets.push_back(path);
            path.pop_back(); targets.push_back(std::move(path));
        }
        for (const auto &target : targets) {
            detail::SlotPathPrefix matcher(body, target);
            for (size_t pass = 0; pass < 2; ++pass)
                for (size_t i = 0; i < slots; ++i) {
                    const auto &slot = body.slots[pass ? slots - i - 1 : i];
                    auto result = matcher.match(slot);
                    REQUIRE(result);
                    CHECK(*result == completeMatch(body, slot, target));
                }
        }
    }
}

TEST_CASE("deep prefixes are iterative and pre cancellation cannot poison retry", "[a-m7]") {
    model::BodySkeleton body;
    constexpr int32_t depth = 10000;
    std::vector<PathSegment> target;
    for (int32_t i = 0; i < depth; ++i) {
        body.scopes.push_back({i + 1 == depth ? -1 : i + 1, "g", {i}});
        target.push_back({"g", {depth - i - 1}});
    }
    model::ChildSlot slot; slot.name = "leaf"; slot.scope = 0;
    target.push_back({"leaf", {}});
    detail::SlotPathPrefix matcher(body, target);
    std::stop_source stop; stop.request_stop();
    auto cancelled = matcher.match(slot, stop.get_token());
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    CHECK(cancelled.error().message == "lookup cancelled");
    for (size_t i = 0; i < 8; ++i) {
        auto result = matcher.match(slot); REQUIRE(result); CHECK(*result == size_t(depth + 1));
    }
    REQUIRE_FALSE(matcher.match(slot, stop.get_token()));
    auto retried = matcher.match(slot); REQUIRE(retried); CHECK(*retried == completeMatch(body, slot, target));
    target.pop_back();
    detail::SlotPathPrefix shorter(body, target);
    auto noLeaf = shorter.match(slot); REQUIRE(noLeaf); CHECK(*noLeaf == 0);
    model::ChildSlot flat; flat.name = "g"; flat.arrayIndex = {depth - 1};
    detail::SlotPathPrefix flatOnly(body, target);
    auto flatResult = flatOnly.match(flat); REQUIRE(flatResult); CHECK(*flatResult == 1);
}

TEST_CASE("public resolver rebinds shared body offsets and keeps errors order and ownership", "[a-m7]") {
    std::vector<std::string> retained;
    for (size_t cache : std::array<size_t, 4>{0, 1, 128, 64 * 1024 * 1024}) {
        auto source = std::make_unique<Frontend>(); auto &control = *source;
        db::DesignDb db(std::move(source), cache);
        const std::vector<std::string> expected{"i:0.0.0", "p:0.1:0", "s:0.1:0"};
        for (size_t pass = 0; pass < 4; ++pass) {
            auto reply = detail::resolvePath(db, "root/g/leaf/tail", {}); REQUIRE(reply);
            CHECK(reply->result == expected); CHECK(reply->completeness.status == "complete");
            auto missing = detail::resolvePath(db, "root.g.leaf.missing", {}); REQUIRE(missing); CHECK(missing->result.empty());
        }
        auto both = detail::resolvePath(db, "g.leaf.tail", {}); REQUIRE(both);
        CHECK(both->result == std::vector<std::string>{"i:0.0.0", "p:0.1:0", "s:0.1:0", "i:1.0.0", "p:1.1:0", "s:1.1:0"});
        auto pins = detail::resolvePath(db, "root.g.bb.\\a.b ", {}); REQUIRE(pins);
        CHECK(pins->result == std::vector<std::string>{"p:0.2:0", "p:0.2:1"});
        retained = both->result;
        if (cache == 0) {
            control.facts[1].signals[0].localPath = "different..invalid";
            auto invalid = detail::resolvePath(db, "root.g.leaf.tail", {}); REQUIRE_FALSE(invalid);
            CHECK(invalid.error().code == ErrorCode::Internal); CHECK(invalid.error().message == "invalid frontend signal path");
            control.facts[1].signals[0].localPath = "tail";
            std::stop_source stop; control.stop = &stop;
            auto cancelled = detail::resolvePath(db, "root.g.leaf.tail", stop.get_token()); REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == ErrorCode::Cancelled);
            control.stop = nullptr;
            auto retry = detail::resolvePath(db, "root.g.leaf.tail", {}); REQUIRE(retry); CHECK(retry->result == expected);
            auto syntax = detail::resolvePath(db, "root..bad", stop.get_token()); REQUIRE_FALSE(syntax);
            CHECK(syntax.error().code == ErrorCode::BadRequest);
        }
    }
    CHECK(retained.size() == 6); CHECK(retained.back() == "s:1.1:0");
}

TEST_CASE("RTL paths still round trip across shared per instance and eviction", "[a-m7]") {
    for (bool per : {false, true})
        for (size_t cache : std::array<size_t, 3>{0, 128, 64 * 1024 * 1024}) {
            model::OpenOptions options; options.files = {HIER_SLOT_PATH_PREFIX_FIXTURE};
            options.tops = {"alpha", "beta"}; options.forcePerInstanceBodies = per; options.connectionCacheBytes = cache;
            auto opened = Design::open(options); REQUIRE(opened); REQUIRE((*opened)->diagnostics().errorCount == 0);
            model::SearchQuery query; query.kinds = {model::HitKind::Instance, model::HitKind::Port, model::HitKind::Signal};
            PageRequest page; page.limit = 7; size_t count = 0;
            do {
                auto hits = (*opened)->search(query, page); REQUIRE(hits);
                for (const auto &hit : hits->result.items) {
                    auto reply = (*opened)->resolvePath(hit.pathText); REQUIRE(reply);
                    CHECK(std::find(reply->result.begin(), reply->result.end(), hit.ref) != reply->result.end()); ++count;
                }
                page.cursor = hits->result.next;
            } while (!page.cursor.empty());
            CHECK(count > 50);
        }
}
