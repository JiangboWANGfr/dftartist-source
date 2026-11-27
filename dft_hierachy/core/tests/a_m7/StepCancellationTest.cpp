#include "hier/Design.h"
#include "hier/db/DesignDb.h"
#include "hier/frontend/Frontend.h"
#include "hier/protocol/Json.h"
#include "Step.h"
#include "Dispatch.h"
#include "Observe.h"
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>

#ifndef HIER_TEST_OBSERVER
#error This regression requires the complete observer-ON query and protocol libraries
#endif
using namespace hier;
namespace session = hier::protocol::session;
namespace obs = hier::observation;
using namespace std::chrono_literals;
namespace {
model::OpenOptions options(bool per, size_t cache, bool minimal = false) {
    model::OpenOptions result;
    result.files = {std::string(HIER_FIXTURES) + (minimal ? "/m3/partial_cancel.sv"
                                                         : "/a_m7/partial-reasons.sv")};
    result.tops = {minimal ? "B_partial_cancel_top" : "partial_reasons_top"};
    result.forcePerInstanceBodies = per;
    result.connectionCacheBytes = cache;
    return result;
}
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
struct Stop {
    std::stop_source source;
    obs::Kind kind;
    size_t target, seen = 0;
    static void event(void *context, const obs::Event &event) noexcept {
        auto &self = *static_cast<Stop *>(context);
        if (event.kind == self.kind && ++self.seen == self.target)
            self.source.request_stop();
    }
};
template<class T> void isCancelled(const Result<T> &value) {
    REQUIRE_FALSE(value);
    CHECK(value.error().code == ErrorCode::Cancelled);
    CHECK(value.error().message == "step cancelled");
}
session::JsonValue::Object object(std::string_view text) {
    auto value = session::decodeFrame(text);
    REQUIRE(std::holds_alternative<session::JsonValue::Object>(value));
    return std::get<session::JsonValue::Object>(std::move(value));
}
session::Output waitOutput(session::SessionState &state) {
    std::stop_source timeout;
    std::mutex mutex;
    std::condition_variable_any condition;
    std::jthread deadline([&](std::stop_token closed) {
        std::unique_lock lock(mutex);
        condition.wait_for(lock, closed, 5s, [] { return false; });
        if (!closed.stop_requested()) timeout.request_stop();
    });
    auto output = state.waitPop(timeout.get_token());
    deadline.request_stop();
    condition.notify_all();
    REQUIRE(output);
    return std::move(*output);
}
session::Terminal terminal(session::SessionState &state, uint64_t id) {
    for (uint64_t done : {uint64_t(0), uint64_t(1)}) {
        auto output = waitOutput(state);
        REQUIRE(std::holds_alternative<session::Progress>(output));
        const auto progress = std::get<session::Progress>(output);
        CHECK(progress.target == id);
        CHECK(progress.done == done);
    }
    auto output = waitOutput(state);
    REQUIRE(std::holds_alternative<session::Terminal>(output));
    CHECK(std::get<session::Terminal>(output).target == id);
    return std::get<session::Terminal>(std::move(output));
}
// Installs the existing thread-local sink on the actual worker thread. The
// pre-Core gate only fixes admission order; cancellation occurs at the real hop.
class CancelHop final : public session::SessionProbe {
  public:
    std::optional<std::reference_wrapper<session::SessionState>> state;
    size_t hops = 0, stops = 0;
    bool failed = false;
    void reach(session::SessionPhase phase, uint64_t id, std::stop_token closing) noexcept override {
        if (id != 1) return;
        if (phase == session::SessionPhase::before_core) {
            scope_.emplace(sink_);
            std::unique_lock lock(mutex_);
            reached_ = true;
            condition_.notify_all();
            if (!condition_.wait_for(lock, closing, 5s, [&] { return released_; })) failed = true;
        } else if (phase == session::SessionPhase::after_core)
            scope_.reset();
    }
    bool waitReached() {
        std::unique_lock lock(mutex_);
        return condition_.wait_for(lock, 5s, [&] { return reached_; });
    }
    void release() {
        std::lock_guard lock(mutex_);
        released_ = true;
        condition_.notify_all();
    }
    bool releasedScope() const { return !scope_; } // Only read after worker.join().
  private:
    static void event(void *context, const obs::Event &event) noexcept {
        auto &self = *static_cast<CancelHop *>(context);
        if (event.kind != obs::Kind::HopMaterialize || ++self.hops != 1) return;
        try {
            auto action = self.state->get().cancel(1);
            if (!action) { self.failed = true; return; }
            action->request_stop();
            ++self.stops;
        } catch (...) { self.failed = true; }
    }
    obs::Sink sink_{this, event, nullptr};
    std::optional<obs::Scope> scope_;
    std::mutex mutex_;
    std::condition_variable_any condition_;
    bool reached_ = false, released_ = false;
};
}

TEST_CASE("A public step and dispatch contain running cancellation after partial work", "[a-step-cancel-public]") {
    for (bool per : {false, true}) for (size_t cache : {size_t(0), size_t(64 * 1024 * 1024)}) {
        auto opened = Design::open(options(per, cache));
        REQUIRE(opened);
        auto &design = **opened;
        REQUIRE(design.diagnostics().errorCount == 0);
        const auto root = design.roots().at(0).ref;
        auto children = design.children(root);
        REQUIRE(children);
        auto signals = design.signals(children->items.at(0).ref);
        REQUIRE(signals);
        std::string ref;
        for (const auto &signal : signals->items) if (signal.name == "a") ref = signal.ref;
        REQUIRE_FALSE(ref.empty());
        const auto baseline = design.step(ref, false, {}, {1000, {}});
        REQUIRE(baseline);
        REQUIRE(baseline->completeness.reasons.size() == 40);
        for (auto kind : {obs::Kind::HopMaterialize, obs::Kind::HopEmit})
            for (size_t target : {size_t(1), size_t(24), size_t(40)}) {
                Stop stop{{}, kind, target};
                obs::Sink sink{&stop, Stop::event, nullptr};
                {
                    obs::Scope scope(sink);
                    const auto result = design.step(ref, false, {}, {1000, {}}, stop.source.get_token());
                    isCancelled(result);
                }
                CHECK(stop.seen == target);
                const auto retry = design.step(ref, false, {}, {1000, {}});
                REQUIRE(retry);
                CHECK(json(*retry) == json(*baseline));
            }
        // Trace delegates to the same step boundary; its public Result must
        // still contain cancellation while an unresolved relation is built.
        auto outputs = design.signals(children->items.at(0).ref);
        REQUIRE(outputs);
        std::string targetRef;
        for (const auto &signal : outputs->items) if (signal.name == "y") targetRef = signal.ref;
        REQUIRE_FALSE(targetRef.empty());
        for (bool paths : {false, true}) {
            Stop traceStop{{}, obs::Kind::HopMaterialize, 1};
            obs::Sink traceSink{&traceStop, Stop::event, nullptr};
            obs::Scope scope(traceSink);
            const model::TracePoint start{{ref, {0, 1}}, {}};
            const model::TracePoint finish{{targetRef, {0, 1}}, {}};
            const auto trace = paths ? design.paths(start, finish, {}, traceStop.source.get_token())
                : design.cone(start, model::TraceDirection::Forward, model::TracePolicy::Full,
                              {}, traceStop.source.get_token());
            REQUIRE_FALSE(trace);
            CHECK(trace.error().code == ErrorCode::Cancelled);
            CHECK_FALSE(trace.error().message.empty());
            CHECK(traceStop.seen == 1);
        }
        Stop stop{{}, obs::Kind::HopMaterialize, 40};
        obs::Sink sink{&stop, Stop::event, nullptr};
        session::ReplyFrame reply;
        {
            obs::Scope scope(sink);
            reply = session::execute(design, {7, "conn.step", design.snapshot().snapshotId,
                object("{\"from\":{\"ref\":\"" + ref + "\"},\"direction\":\"forward\",\"maxHops\":1000}")},
                stop.source.get_token());
        }
        const auto wire = object(reply.json);
        CHECK_FALSE(std::get<bool>(wire.at("ok").value));
        CHECK_FALSE(wire.contains("result"));
        const auto &error = std::get<session::JsonValue::Object>(wire.at("error").value);
        CHECK(std::get<std::string>(error.at("code").value) == "cancelled");
        CHECK(std::get<std::string>(error.at("message").value) == "step cancelled");
    }
}

TEST_CASE("A failed internal step clears unpublished anchors and retries", "[a-step-cancel-anchors]") {
    auto frontend = frontend::openDesign(options(false, 0));
    REQUIRE(frontend);
    db::DesignDb database(std::move(frontend.value()), 0);
    std::vector<std::optional<detail::StepAnchor>> anchors;
    const auto baseline = detail::step(database, "s:0.0:0", false, {}, {1000, {}}, {}, false, &anchors);
    REQUIRE(baseline);
    REQUIRE(anchors.size() == baseline->result.hops.size());
    for (auto kind : {obs::Kind::HopMaterialize, obs::Kind::HopEmit})
        for (size_t target : {size_t(1), size_t(40)}) {
            Stop stop{{}, kind, target};
            obs::Sink sink{&stop, Stop::event, nullptr};
            {
                obs::Scope scope(sink);
                const auto result = detail::step(database, "s:0.0:0", false, {}, {1000, {}},
                    stop.source.get_token(), false, &anchors);
                isCancelled(result);
            }
            CHECK(anchors.empty());
            const auto retry = detail::step(database, "s:0.0:0", false, {}, {1000, {}}, {}, false, &anchors);
            REQUIRE(retry);
            CHECK(json(*retry) == json(*baseline));
            CHECK(anchors.size() == retry->result.hops.size());
        }
    auto invalid = detail::step(database, "bad", false, {}, {}, {}, false, &anchors);
    CHECK_FALSE(invalid);
    CHECK(anchors.empty());
}

TEST_CASE("A real worker survives partial step cancellation and completes queued requests", "[a-step-cancel-worker]") {
    for (bool per : {false, true}) for (size_t cache : {size_t(0), size_t(64 * 1024 * 1024)}) {
        auto probe = std::make_shared<CancelHop>();
        session::SessionWorker worker(options(per, cache, true), probe);
        probe->state = worker.state();
        REQUIRE(worker.start() == session::StartStatus::started);
        auto opened = worker.waitOpened();
        REQUIRE(std::holds_alternative<model::SnapshotInfo>(opened));
        const auto snapshot = std::get<model::SnapshotInfo>(opened);
        const auto params = object(R"({"from":{"ref":"p:0.0:0"},"side":"inside","direction":"forward"})");
        REQUIRE(worker.state().admit({1, "conn.step", snapshot.snapshotId, params}) == session::AdmitStatus::accepted);
        REQUIRE(probe->waitReached());
        REQUIRE(worker.state().admit({2, "inst.roots", snapshot.snapshotId, {}}) == session::AdmitStatus::accepted);
        probe->release();
        CHECK(std::holds_alternative<session::Cancelled>(terminal(worker.state(), 1).outcome));
        const auto followup = terminal(worker.state(), 2);
        REQUIRE(std::holds_alternative<session::ReplyFrame>(followup.outcome));
        const auto roots = object(std::get<session::ReplyFrame>(followup.outcome).json);
        CHECK(std::get<bool>(roots.at("ok").value));
        CHECK(std::get<session::JsonValue::Array>(roots.at("result").value).size() == 1);
        REQUIRE(worker.state().admit({3, "conn.step", snapshot.snapshotId, params}) == session::AdmitStatus::accepted);
        const auto retry = terminal(worker.state(), 3);
        REQUIRE(std::holds_alternative<session::ReplyFrame>(retry.outcome));
        const auto step = object(std::get<session::ReplyFrame>(retry.outcome).json);
        CHECK(std::get<bool>(step.at("ok").value));
        const auto &completeness = std::get<session::JsonValue::Object>(step.at("completeness").value);
        CHECK(std::get<std::string>(completeness.at("status").value) == "partial");
        worker.close(); worker.join();
        CHECK(worker.joined());
        CHECK_FALSE(probe->failed);
        CHECK(probe->hops == 1);
        CHECK(probe->stops == 1);
        CHECK(probe->releasedScope());
        CHECK_FALSE(worker.state().tryPop());
    }
}
