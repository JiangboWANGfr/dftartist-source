#include "hier/db/DesignDb.h"
#include <array>
#include <catch2/catch_test_macros.hpp>

using namespace hier;
namespace {
// Dependency injection through the existing L1 interface. No production callback,
// clock override or public test-only API is added.
struct InterruptingFrontend final : frontend::Frontend {
    model::FrontendInfo metadata;
    std::vector<model::TopInfo> roots{{"top", 0}};
    std::vector<model::DefInfo> defs{{"top", model::DefKind::Module, "", 0},
                                    {"child", model::DefKind::Module, "", 0},
                                    {"box", model::DefKind::Blackbox, "", 0}};
    mutable std::array<int, 2> skeletonCalls{}, connectionCalls{};
    std::stop_source *stop = nullptr; // Borrowed from the enclosing test scope.
    bool interruptConnections = false;
    model::BodyId interruptedBody = 0;
    const model::FrontendInfo &info() const override { return metadata; }
    const std::vector<model::TopInfo> &tops() const override { return roots; }
    const std::vector<model::DefInfo> &definitions() const override { return defs; }
    size_t bodyCount() const override { return 2; }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId body) const override {
        ++skeletonCalls.at(body);
        model::BodySkeleton result;
        result.def = body;
        if (body == 0) {
            model::ChildSlot child;
            child.name = "u";
            child.body = 1;
            child.def = 1;
            result.slots.push_back(child);
            child.name = "box";
            child.body = model::kNoBody;
            child.def = 2;
            child.kind = model::InstKind::Blackbox;
            result.slots.push_back(child);
        }
        if (stop && !interruptConnections && body == interruptedBody)
            stop->request_stop();
        return result;
    }
    model::BodyConnections connections(model::BodyId body) const override {
        ++connectionCalls.at(body);
        model::BodyConnections result;
        result.estimatedBytes = 64;
        if (stop && interruptConnections && body == interruptedBody)
            stop->request_stop();
        return result;
    }
};
} // namespace

TEST_CASE("cancelled extraction never publishes skeletons or connection facts", "[a-m3-index]") {
    for (bool connections : {false, true}) {
        auto source = std::make_unique<InterruptingFrontend>();
        auto &frontend = *source;
        std::stop_source stop;
        frontend.stop = &stop;
        frontend.interruptConnections = connections;
        db::DesignDb db(std::move(source));
        if (connections) {
            auto cancelled = db.connections(0, stop.get_token());
            REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == ErrorCode::Cancelled);
            frontend.stop = nullptr;
            auto first = db.connections(0);
            CHECK(db.connections(0) == first);
            CHECK(frontend.connectionCalls[0] == 2);
        } else {
            auto cancelled = db.skeleton(0, stop.get_token());
            REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == ErrorCode::Cancelled);
            frontend.stop = nullptr;
            auto &first = db.skeleton(0);
            CHECK(&db.skeleton(0) == &first);
            CHECK(frontend.skeletonCalls[0] == 2);
        }
    }
}

TEST_CASE("interrupted occurrence indexing retries without publishing a partial tree", "[a-m3-index]") {
    auto source = std::make_unique<InterruptingFrontend>();
    auto &frontend = *source;
    std::stop_source stop;
    frontend.stop = &stop;
    frontend.interruptedBody = 1;
    db::DesignDb db(std::move(source), 0);
    auto cancelled = db.occurrences(stop.get_token());
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    frontend.stop = nullptr;
    auto retry = db.occurrences({});
    REQUIRE(retry);
    REQUIRE((*retry)->items.size() == 3);
    CHECK((*retry)->items[0].end == 3);
    CHECK((*retry)->items[1].end == 2);
    CHECK((*retry)->items[2].end == 3);
    CHECK((*retry)->items[1].key == model::InstKey{0, 0});
    CHECK((*retry)->items[2].key == model::InstKey{0, 1});
    CHECK((*retry)->byDefinition == std::vector<std::vector<size_t>>{{0}, {1}, {2}});
    CHECK(frontend.skeletonCalls[0] == 1); // Completed facts may survive cancellation.
    CHECK(frontend.skeletonCalls[1] == 2);
    CHECK(frontend.connectionCalls == std::array<int, 2>{0, 0});
    auto hot = db.occurrences({});
    REQUIRE(hot);
    CHECK(*hot == *retry);
    auto cancelledHot = db.occurrences(stop.get_token());
    REQUIRE_FALSE(cancelledHot);
    CHECK(cancelledHot.error().code == ErrorCode::Cancelled);
    CHECK(*db.occurrences({}) == *retry);
}
