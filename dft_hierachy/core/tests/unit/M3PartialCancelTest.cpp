// Minimal B regression after C-M7-03. Oracle: DESIGN 5.5.1, not an implementation.
// Reuses the original C-reviewed HopMaterialize seam; no new observation point.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include "Observe.h"
#include <optional>
#include <stop_token>

#ifndef HIER_TEST_OBSERVER
#error The public cancellation regression requires a coherent observer-ON build
#endif

namespace {
struct StopAtHop {
    std::stop_source stop;
    size_t materialized = 0;
};
void stopAtHop(void* context, const hier::observation::Event& event) noexcept {
    auto& state = *static_cast<StopAtHop*>(context);
    if (event.kind == hier::observation::Kind::HopMaterialize) {
        ++state.materialized;
        state.stop.request_stop();
    }
}
}

TEST_CASE("B step: cancelling a partial hop returns Cancelled without escaping Result",
          "[b-m3-partial-cancel]") {
    for (bool perInstance : {false, true})
    for (size_t cache : {size_t{0}, size_t{64U * 1024U * 1024U}})
    DYNAMIC_SECTION("per-instance=" << perInstance << " cache=" << cache) {
        hier::model::OpenOptions options;
        options.files = {std::string(HIER_FIXTURES) + "/m3/partial_cancel.sv"};
        options.tops = {"B_partial_cancel_top"};
        options.forcePerInstanceBodies = perInstance;
        options.connectionCacheBytes = cache;
        auto opened = hier::Design::open(options);
        REQUIRE(opened.ok());
        auto design = std::move(opened.value());
        REQUIRE(design->diagnostics().errorCount == 0);
        REQUIRE(design->roots().size() == 1);
        auto children = design->children(design->roots().front().ref);
        REQUIRE(children.ok());
        REQUIRE(children->items.size() == 1);
        auto ports = design->ports(children->items.front().ref);
        REQUIRE(ports.ok());
        REQUIRE(ports->size() == 1);
        CHECK(ports->front().name == "PIN");
        const auto pin = ports->front().ref;
        hier::ConnectionRequest request;
        request.side = "inside";
        StopAtHop state;
        hier::observation::Sink sink{&state, stopAtHop, nullptr};
        using Answer = decltype(design->step(pin, false, request));
        std::optional<Answer> answer;
        bool escaped = false;
        {
            hier::observation::Scope scope(sink);
            try {
                answer.emplace(design->step(pin, false, request, {}, state.stop.get_token()));
            } catch (const hier::Error& error) {
                escaped = true;
                INFO("hier::Error escaped the public Result boundary: " << error.message);
                CHECK_FALSE(escaped);
            } catch (...) {
                escaped = true;
                FAIL_CHECK("An exception escaped the public step Result boundary");
            }
        }
        REQUIRE(state.stop.stop_requested());
        CHECK(state.materialized == 1);
        CHECK(answer.has_value());
        if (answer) {
            REQUIRE_FALSE(answer->ok());
            CHECK(answer->error().code == hier::ErrorCode::Cancelled);
            CHECK_FALSE(answer->error().message.empty());
        }
        // Cancellation returns no successful partial page; a fresh request still works.
        auto retry = design->step(pin, false, request);
        REQUIRE(retry.ok());
        CHECK(retry->completeness.status == "partial");
        CHECK_FALSE(retry->result.hops.empty());
        CHECK_FALSE(retry->completeness.reasons.empty());
    }
}
