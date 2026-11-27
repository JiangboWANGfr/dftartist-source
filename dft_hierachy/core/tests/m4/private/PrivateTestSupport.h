#pragma once
// B-only inputs/assertions. No parser, reader or scheduler implementation here.
#include "SessionContract.h"
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <condition_variable>
#include <future>
#include <latch>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <type_traits>
#include <utility>

namespace b_m4_private {
using namespace hier::protocol::session;
using namespace std::chrono_literals;

inline std::span<const std::byte> bytes(std::string_view text) {
    return {reinterpret_cast<const std::byte*>(text.data()), text.size()};
}
inline Request request(uint64_t id, std::string marker = "B-owned") {
    JsonValue value; value.value = std::move(marker);
    JsonValue::Object params; params.emplace("B_marker", std::move(value));
    return {id, "inst.roots", "B-private-snapshot", std::move(params)};
}
inline ReplyFrame reply(uint64_t id) {
    return {"{\"id\":" + std::to_string(id) +
            ",\"ok\":true,\"result\":[],\"completeness\":{\"status\":\"complete\",\"reasons\":[]}}"};
}
inline void unchanged(const Request& value, uint64_t id) {
    CHECK(value.id == id); CHECK(value.method == "inst.roots");
    CHECK(value.snapshot == "B-private-snapshot");
    REQUIRE(value.params.contains("B_marker"));
    CHECK(std::get<std::string>(value.params.at("B_marker").value) == "B-owned");
}
inline std::vector<Output> drain(SessionState& state) {
    std::vector<Output> out;
    while (auto value = state.tryPop()) {
        out.push_back(std::move(*value)); REQUIRE(out.size() <= 768);
    }
    return out;
}
inline void progress(const Output& value, uint64_t id, uint64_t done) {
    REQUIRE(std::holds_alternative<Progress>(value));
    const auto& item = std::get<Progress>(value);
    CHECK(item.target == id); CHECK(item.done == done); CHECK(item.total == 1);
}
inline void terminal(const Output& value, uint64_t id, bool cancelled) {
    REQUIRE(std::holds_alternative<Terminal>(value));
    const auto& item = std::get<Terminal>(value); CHECK(item.target == id);
    CHECK(std::holds_alternative<Cancelled>(item.outcome) == cancelled);
    if (!cancelled) {
        REQUIRE(std::holds_alternative<ReplyFrame>(item.outcome));
        CHECK(std::get<ReplyFrame>(item.outcome).json == reply(id).json);
    }
}
// Deadline only bounds a broken test run; never chooses success/cancel ordering.
class WaitDeadline {
  public:
    explicit WaitDeadline(std::chrono::milliseconds duration = 5000ms)
        : timer_([this, duration](std::stop_token token) {
              std::unique_lock lock(mutex_);
              if (!condition_.wait_for(lock, token, duration, [] { return false; }))
                  if (!token.stop_requested()) source_.request_stop();
          }) {}
    ~WaitDeadline() { timer_.request_stop(); condition_.notify_all(); }
    std::stop_token token() const { return source_.get_token(); }
  private:
    std::stop_source source_;
    std::mutex mutex_;
    std::condition_variable_any condition_;
    std::jthread timer_;
};
inline Output waitOutput(SessionState& state) {
    WaitDeadline deadline;
    auto value = state.waitPop(deadline.token());
    REQUIRE(value.has_value()); return std::move(*value);
}
inline hier::model::OpenOptions options() {
    hier::model::OpenOptions value;
    value.files = {std::string(HIER_FIXTURES) + "/nav/nav.sv"};
    value.tops = {"top_b"}; return value;
}
template<class Snapshot> std::string snapshotId(const Snapshot& value) {
    // Current schema6 model compiles this consumer; actually running it cannot
    // fake a missing schema7 identity. The separate public-model gate stays red.
    if constexpr (requires { value.snapshotId; }) return value.snapshotId;
    else { FAIL("M4 worker must return the public schema7 snapshot identity"); return {}; }
}
inline Request rootRequest(uint64_t id, const hier::model::SnapshotInfo& snapshot) {
    CHECK(snapshot.schemaVersion == 7);
    return {id, "inst.roots", snapshotId(snapshot), {}};
}
} // namespace b_m4_private
