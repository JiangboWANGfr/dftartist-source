#include "InstanceDescriptions.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <functional>
#include <random>

using namespace hier;
namespace {
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
struct Frontend final : frontend::Frontend {
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_{{"root", 0}, {"else.root", 0}};
    std::vector<model::DefInfo> defs_{{"root", model::DefKind::Module, "", 0},
        {"branch", model::DefKind::Module, "", 0}, {"bus", model::DefKind::Interface, "", 0},
        {"missing", model::DefKind::Blackbox, "", 0}, {"gate", model::DefKind::Primitive, "", 0},
        {"leaf", model::DefKind::Module, "", 0}};
    std::array<model::BodySkeleton, 4> bodies;
    std::stop_source *stop = nullptr; // Borrowed test control at the original boundary.
    model::BodyId stopBody = 1;
    Frontend() {
        bodies[1].def = 1;
        bodies[2].def = 2;
        bodies[2].kind = model::InstKind::Interface;
        bodies[3].def = 5;
        bodies[0].scopes = {{-1, "g.outer", {-2}}, {0, "h", {1, 2}}, {-1, "g", {10}}};
        bodies[1].scopes = {{-1, "local", {0}}};
        auto slot = [](std::string name, model::BodyId body, uint32_t def, model::InstKind kind) {
            model::ChildSlot result;
            result.name = std::move(name);
            result.body = body;
            result.def = def;
            result.kind = kind;
            return result;
        };
        auto first = slot("a", 1, 1, model::InstKind::Module);
        first.overriddenParams = {"W"};
        bodies[0].slots.push_back(first);
        auto generated = slot("a", 1, 1, model::InstKind::Module);
        generated.scope = 1;
        generated.arrayIndex = {3, 1};
        bodies[0].slots.push_back(generated);
        auto blackbox = slot("x.y", model::kNoBody, 3, model::InstKind::Blackbox);
        blackbox.scope = 2;
        blackbox.blackboxPins = {"A"};
        bodies[0].slots.push_back(blackbox);
        bodies[0].slots.push_back(slot("ifc", 2, 2, model::InstKind::Interface));
        auto primitive = slot("prm", model::kNoBody, 4, model::InstKind::Primitive);
        primitive.arrayIndex = {-1};
        bodies[0].slots.push_back(primitive);
        bodies[0].slots.push_back(slot("leaf", 3, 5, model::InstKind::Module));
        bodies[1].slots.push_back(slot("u", 3, 5, model::InstKind::Module));
        auto overridden = slot("over", 3, 5, model::InstKind::Module);
        overridden.overriddenParams = {"W"};
        bodies[1].slots.push_back(overridden);
        blackbox.name = "bb";
        blackbox.scope = 0;
        bodies[1].slots.push_back(blackbox);
        bodies[2].slots.push_back(slot("it", 3, 5, model::InstKind::Module));
    }
    const model::FrontendInfo &info() const override { return info_; }
    const std::vector<model::TopInfo> &tops() const override { return tops_; }
    const std::vector<model::DefInfo> &definitions() const override { return defs_; }
    size_t bodyCount() const override { return bodies.size(); }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId body) const override {
        if (stop && body == stopBody)
            stop->request_stop();
        return bodies.at(body);
    }
    model::BodyConnections connections(model::BodyId) const override { return {}; }
};
std::vector<model::InstKey> keys() {
    std::vector<model::InstKey> result;
    for (uint32_t top = 0; top < 2; ++top) {
        result.push_back({top});
        for (uint32_t child = 0; child < 6; ++child) {
            result.push_back({top, child});
            if (child < 2)
                for (uint32_t leaf = 0; leaf < 3; ++leaf)
                    result.push_back({top, child, leaf});
            if (child == 3)
                result.push_back({top, child, 0});
        }
    }
    return result;
}
} // namespace

TEST_CASE("incremental descriptions equal original full paths in arbitrary query order", "[a-m7]") {
    db::DesignDb db(std::make_unique<Frontend>(), 0);
    detail::InstanceDescriptions descriptions(db);
    auto all = keys();
    std::mt19937 random(731);
    model::InstInfo retained;
    std::string before;
    for (size_t pass = 0; pass < 20; ++pass) {
        if (pass % 2)
            std::shuffle(all.begin(), all.end(), random);
        else
            std::reverse(all.begin(), all.end());
        for (const auto &key : all) {
            auto at = db.locate(key, {});
            REQUIRE(at);
            const auto expected = detail::describeInstance(db, key, *at);
            const auto actual = descriptions.get(key);
            REQUIRE(actual);
            CHECK(json(**actual) == json(expected));
            retained = **actual;
            before = json(retained);
            auto located = descriptions.located(key, *at);
            REQUIRE(located);
            CHECK(json(**located) == json(expected));
            if (key.size() > 1) {
                auto parentKey = key;
                parentKey.pop_back();
                auto parent = db.locate(parentKey, {});
                REQUIRE(parent);
                auto child = descriptions.child(parentKey, *parent, key.back());
                REQUIRE(child);
                CHECK(json(**child) == json(expected));
            }
        }
    }
    auto root = descriptions.get({0});
    REQUIRE(root);
    CHECK(json(retained) == before);
    auto generated = descriptions.get({0, 1, 0});
    REQUIRE(generated);
    CHECK((*generated)->path == std::vector<std::string>{"root", "g.outer[-2]", "h[1][2]", "a[3][1]", "u"});
    CHECK((*generated)->pathText == "root.\\g.outer [-2].h[1][2].a[3][1].u");
    auto overridden = descriptions.get({0, 0});
    REQUIRE(overridden);
    CHECK((*overridden)->hasParamOverrides);
    CHECK((*overridden)->childCount == 3);
    auto box = descriptions.get({0, 2});
    REQUIRE(box);
    CHECK_FALSE((*box)->hasParamOverrides);
    CHECK((*box)->childCount == 0);
    CHECK((*box)->kind == model::InstKind::Blackbox);
    CHECK((*box)->pathText == "root.g[10].\\x.y ");
    root = descriptions.get({1});
    REQUIRE(root);
    CHECK_FALSE((*root)->hasParamOverrides);
    CHECK((*root)->childCount == 6);
    CHECK((*root)->defName == "root");
    CHECK((*root)->pathText == "\\else.root ");
}

TEST_CASE("description failures retain DB errors reset partial paths and retry safely", "[a-m7]") {
    auto frontend = std::make_unique<Frontend>();
    auto &control = *frontend;
    db::DesignDb db(std::move(frontend), 0);
    detail::InstanceDescriptions descriptions(db);
    auto root = descriptions.get({0});
    REQUIRE(root);
    auto owned = **root;
    const auto before = json(owned);
    std::stop_source stop;
    control.stop = &stop;
    auto cancelled = descriptions.get({0, 0}, stop.get_token());
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    CHECK(json(owned) == before);
    control.stop = nullptr;
    auto retry = descriptions.get({0, 0});
    REQUIRE(retry);
    CHECK((*retry)->pathText == "root.a");
    CHECK((*retry)->hasParamOverrides);
    for (const auto &key : std::vector<model::InstKey>{{}, {99}, {99, 0}, {0, 99}, {0, 99, 0}, {0, 2, 0}, {0, 2, 0, 0}, {0, 4, 1}, {0, 0, 99}}) {
        auto expected = db.locate(key, {});
        REQUIRE_FALSE(expected);
        auto actual = descriptions.get(key);
        REQUIRE_FALSE(actual);
        CHECK(json(actual.error()) == json(expected.error()));
        retry = descriptions.get({1, 1, 0});
        REQUIRE(retry);
        CHECK((*retry)->pathText == "\\else.root .\\g.outer [-2].h[1][2].a[3][1].u");
    }
    auto parent = db.locate({0}, {});
    REQUIRE(parent);
    auto invalid = descriptions.child({0}, *parent, 99);
    REQUIRE_FALSE(invalid);
    CHECK(invalid.error().message == "no such instance: 0.99");
    cancelled = descriptions.located({0}, *parent, stop.get_token());
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    REQUIRE(descriptions.get({0, 3, 0}));
}

TEST_CASE("public navigation definition pages and instance search share exact owning descriptions", "[a-m7]") {
    model::QueryResult<Page<model::InstInfo>> retained;
    std::string retainedJson;
    for (bool per : {false, true})
        for (const size_t cache : {size_t{0}, size_t{1}, size_t{128}, size_t{64 * 1024 * 1024}}) {
            model::OpenOptions options;
            options.files = {HIER_INSTANCE_DESCRIPTIONS_FIXTURE};
            options.forcePerInstanceBodies = per;
            options.connectionCacheBytes = cache;
            auto opened = Design::open(options);
            REQUIRE(opened);
            auto &design = **opened;
            REQUIRE(design.diagnostics().errorCount == 0);
            const auto roots = design.roots();
            REQUIRE(roots.size() == 2);
            CHECK(roots[0].name == "top_a");
            CHECK(roots[1].name == "top_b");
            std::vector<model::InstInfo> all;
            std::function<void(const model::InstInfo &)> walk = [&](const auto &instance) {
                all.push_back(instance);
                auto expected = design.instance(instance.ref);
                REQUIRE(expected);
                CHECK(json(instance) == json(*expected));
                auto ancestor = design.ancestors(instance.ref);
                REQUIRE(ancestor);
                const auto key = *model::parseInstRef(instance.ref);
                REQUIRE(ancestor->size() + 1 == key.size());
                for (size_t i = 0; i < ancestor->size(); ++i) {
                    model::InstKey prefix(key.begin(), key.begin() + std::ptrdiff_t(i + 1));
                    auto parent = design.instance(model::instRef(prefix));
                    REQUIRE(parent);
                    CHECK(json((*ancestor)[i]) == json(*parent));
                }
                std::string cursor;
                size_t page = 0;
                do {
                    auto children = design.children(instance.ref, {cursor, page++ % 2 ? 7 : 1});
                    REQUIRE(children);
                    for (const auto &child : children->items)
                        walk(child);
                    cursor = children->next;
                } while (!cursor.empty());
            };
            for (const auto &root : roots)
                walk(root);
            auto definitions = design.definitions({"", 1000});
            REQUIRE(definitions);
            for (const auto &definition : definitions->items) {
                std::vector<model::InstInfo> expected, actual;
                for (const auto &instance : all)
                    if (instance.def == definition.ref)
                        expected.push_back(instance);
                std::string cursor;
                size_t page = 0;
                do {
                    auto result = design.instancesOf(definition.ref, {cursor, page++ % 2 ? 5 : 1});
                    REQUIRE(result);
                    CHECK(result->completeness.status == "complete");
                    actual.insert(actual.end(), result->result.items.begin(), result->result.items.end());
                    cursor = result->result.next;
                    if (!result->result.items.empty()) {
                        retained = *result;
                        retainedJson = json(retained);
                    }
                } while (!cursor.empty());
                CHECK(json(actual) == json(expected));
            }
            model::SearchQuery query;
            query.kinds = {model::HitKind::Instance};
            std::string cursor;
            size_t position = 0;
            do {
                auto result = design.search(query, {cursor, position % 2 ? 7 : 1});
                REQUIRE(result);
                for (const auto &hit : result->result.items) {
                    REQUIRE(position < all.size());
                    const auto &instance = all[position++];
                    CHECK(hit.ref == instance.ref);
                    CHECK(hit.inst == instance.ref);
                    CHECK(hit.def == instance.def);
                    CHECK(hit.name == instance.name);
                    CHECK(hit.path == instance.path);
                    CHECK(hit.pathText == instance.pathText);
                }
                cursor = result->result.next;
            } while (!cursor.empty());
            CHECK(position == all.size());
            auto alias = design.children("i:000", {"", 1});
            REQUIRE(alias);
            CHECK(alias->next == "children|i:000@1");
            auto wrong = design.children("i:0", {alias->next, 1});
            REQUIRE_FALSE(wrong);
            CHECK(wrong.error().code == ErrorCode::BadRequest);
        }
    REQUIRE_FALSE(retained.result.items.empty());
    CHECK(json(retained) == retainedJson);
}
