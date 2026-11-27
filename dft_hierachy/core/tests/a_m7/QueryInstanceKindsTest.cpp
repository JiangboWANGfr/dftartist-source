#include "ConnectionSnapshot.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>

using namespace hier;
namespace {
struct Frontend final : frontend::Frontend {
    model::FrontendInfo metadata;
    std::vector<model::TopInfo> topList{{"root.dot", 0}, {"program", 3}};
    std::vector<model::DefInfo> definitionList{
        {"root", model::DefKind::Module, "", 0},
        {std::string(4096, 'n'), model::DefKind::Module, "", 0},
        {"bus", model::DefKind::Interface, "", 0},
        {"program", model::DefKind::Program, "", 0},
        {"missing", model::DefKind::Blackbox, "", 0},
        {"gate", model::DefKind::Primitive, "", 0}};
    std::array<model::BodySkeleton, 4> bodies;
    mutable std::array<size_t, 4> skeletonCalls{};
    mutable size_t definitionCalls = 0, connectionCalls = 0;
    model::BodyId failingBody = model::kNoBody;
    std::stop_source *cancelDefinitions = nullptr; // Borrowed synchronous test control.
    Frontend() {
        bodies[0].scopes = {{-1, "g.dot", {-1, 2}}};
        bodies[1].def = 1;
        bodies[2].def = 2;
        bodies[2].kind = model::InstKind::Interface;
        bodies[3].def = 3;
        bodies[3].kind = model::InstKind::Program;
        const std::array<model::BodyId, 6> bodyIds{1, 2, model::kNoBody, model::kNoBody, 3, 1};
        const std::array<uint32_t, 6> defs{1, 2, 4, 5, 3, 1};
        const std::array kinds{model::InstKind::Module, model::InstKind::Interface,
            model::InstKind::Blackbox, model::InstKind::Primitive,
            model::InstKind::Program, model::InstKind::Module};
        for (size_t i = 0; i < bodyIds.size(); ++i) {
            model::ChildSlot slot;
            slot.name = "child.dot";
            slot.body = bodyIds[i];
            slot.def = defs[i];
            slot.kind = kinds[i];
            slot.scope = 0;
            slot.arrayIndex = {int32_t(i)};
            if (i == 5) slot.overriddenParams = {"W"};
            bodies[0].slots.push_back(slot);
        }
        model::ChildSlot nested;
        nested.name = "leaf";
        nested.body = 3;
        nested.def = 3;
        nested.kind = model::InstKind::Program;
        bodies[1].slots.push_back(nested);
    }
    const model::FrontendInfo &info() const override { return metadata; }
    const std::vector<model::TopInfo> &tops() const override { return topList; }
    const std::vector<model::DefInfo> &definitions() const override {
        ++definitionCalls;
        if (cancelDefinitions) cancelDefinitions->request_stop();
        return definitionList;
    }
    size_t bodyCount() const override { return bodies.size(); }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId id) const override {
        ++skeletonCalls.at(id);
        if (id == failingBody)
            throw Error{ErrorCode::Internal, "A classification skeleton failure"};
        return bodies.at(id);
    }
    model::BodyConnections connections(model::BodyId) const override {
        ++connectionCalls;
        return {};
    }
};
const std::array<model::InstKey, 9> keys{{{0}, {0, 0}, {0, 1}, {0, 2}, {0, 3},
                                        {0, 4}, {0, 5}, {0, 0, 0}, {1}}};
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
// Original declaration projection, independent of the new summary. Path helpers
// are unchanged by this unit; all original owning InstInfo fields are compared.
model::InstInfo original(const db::DesignDb &db, const model::InstKey &key) {
    const auto at = detail::checked(db.locate(key, {}));
    model::InstInfo info;
    detail::startInstancePath(db, at.top, info);
    for (const auto &step : at.steps) detail::appendInstanceStep(db, step, info, {});
    info.ref = model::instRef(key);
    info.name = info.path.back();
    uint32_t definition;
    if (at.steps.empty()) {
        const auto &skeleton = db.skeleton(at.body);
        definition = skeleton.def;
        info.kind = skeleton.kind;
    } else {
        const auto &slot = *at.steps.back().slot;
        definition = slot.def;
        info.kind = slot.kind;
        info.hasParamOverrides = !slot.overriddenParams.empty();
    }
    info.def = model::defRef(definition);
    info.defName = db.frontend().definitions()[definition].name;
    if (at.body != model::kNoBody) info.childCount = uint32_t(db.skeleton(at.body).slots.size());
    return info;
}
} // namespace

TEST_CASE("shared summary preserves full original instance fields and owning output", "[a-m7]") {
    model::InstInfo retained;
    std::string retainedJson;
    for (size_t budget : {size_t{0}, size_t{1}, size_t{1 << 20}}) {
        auto source = std::make_unique<Frontend>();
        auto &control = *source;
        db::DesignDb database(std::move(source), budget);
        for (const auto &key : keys) {
            auto located = database.locate(key, {});
            REQUIRE(located);
            const auto summary = detail::instanceSummary(database, *located, {});
            const auto expected = original(database, key);
            auto actual = detail::describeInstance(database, key, *located);
            CHECK(json(actual) == json(expected));
            CHECK(summary.kind == expected.kind);
            CHECK(summary.childCount == expected.childCount);
            CHECK(summary.hasParamOverrides == expected.hasParamOverrides);
            CHECK(summary.definitionName == expected.defName);
            CHECK(summary.definitionName.data() == control.definitionList[summary.definition].name.data());
            retained = std::move(actual);
            retainedJson = json(retained);
        }
        CHECK(control.connectionCalls == 0);
    }
    CHECK(json(retained) == retainedJson); // DB and borrowed definition names are gone.
}

TEST_CASE("query classification caches only successful kinds without extracting connections", "[a-m7]") {
    auto source = std::make_unique<Frontend>();
    auto &control = *source;
    db::DesignDb database(std::move(source), 0);
    detail::ConnectionSnapshot snapshot(database, {});
    const std::array expected{model::InstKind::Module, model::InstKind::Module,
        model::InstKind::Interface, model::InstKind::Blackbox, model::InstKind::Primitive,
        model::InstKind::Program, model::InstKind::Module, model::InstKind::Program,
        model::InstKind::Program};
    for (size_t pass = 0; pass < 10; ++pass)
        for (size_t i = 0; i < keys.size(); ++i) {
            auto kind = snapshot.instanceKind(model::instRef(keys[i]));
            REQUIRE(kind);
            CHECK(*kind == expected[i]);
        }
    CHECK(control.definitionCalls == keys.size());
    CHECK(control.connectionCalls == 0);
    auto alias = snapshot.instanceKind("i:000.000");
    REQUIRE(alias);
    CHECK(*alias == model::InstKind::Module);
    CHECK(control.definitionCalls == keys.size());
    detail::ConnectionSnapshot next(database, {});
    REQUIRE(next.instanceKind("i:0"));
    CHECK(control.definitionCalls == keys.size() + 1); // No global kind cache.
    CHECK(control.connectionCalls == 0);
}

TEST_CASE("classification keeps skeleton failures retryable and original reference errors", "[a-m7]") {
    auto source = std::make_unique<Frontend>();
    auto &control = *source;
    control.failingBody = 1;
    db::DesignDb database(std::move(source), 0);
    detail::ConnectionSnapshot snapshot(database, {});
    auto failed = snapshot.instanceKind("i:0.0");
    REQUIRE_FALSE(failed);
    CHECK(failed.error().code == ErrorCode::Internal);
    CHECK(failed.error().message == "A classification skeleton failure");
    control.failingBody = model::kNoBody;
    auto retried = snapshot.instanceKind("i:0.0");
    REQUIRE(retried);
    CHECK(*retried == model::InstKind::Module);
    CHECK(control.skeletonCalls[1] == 2);
    for (const auto &ref : {"bad", "i:"}) {
        auto error = snapshot.instanceKind(ref);
        REQUIRE_FALSE(error);
        CHECK(error.error().code == ErrorCode::BadRequest);
    }
    for (const auto &ref : {"i:99", "i:0.99", "i:0.2.0"}) {
        auto error = snapshot.instanceKind(ref);
        REQUIRE_FALSE(error);
        CHECK(error.error().code == ErrorCode::NotFound);
    }
    CHECK(control.connectionCalls == 0);
}

TEST_CASE("classification checks cancellation before cached hits and after bodiless metadata", "[a-m7]") {
    auto source = std::make_unique<Frontend>();
    auto &control = *source;
    std::stop_source stop;
    db::DesignDb database(std::move(source), 0);
    detail::ConnectionSnapshot snapshot(database, stop.get_token());
    REQUIRE(snapshot.instanceKind("i:0"));
    control.cancelDefinitions = &stop;
    auto cancelled = snapshot.instanceKind("i:0.2");
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    auto cached = snapshot.instanceKind("i:0");
    REQUIRE_FALSE(cached);
    CHECK(cached.error().code == ErrorCode::Cancelled);
    control.cancelDefinitions = nullptr;
    detail::ConnectionSnapshot next(database, {});
    auto retry = next.instanceKind("i:0.2");
    REQUIRE(retry);
    CHECK(*retry == model::InstKind::Blackbox);
    CHECK(control.connectionCalls == 0);
}
