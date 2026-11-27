#pragma once
#include <chrono>
#include <cstdint>
#include <span>

// Private test-build instrumentation; never part of the model or Design API.
namespace hier::observation {
enum class Kind {
    StepBodyAdmitted, ConnectionIndexEntry, ConnectionIndexNode,
    ConnectionSeekNode, ConnectionSeekCompare, StepCandidate,
    HopMaterialize, HopEmit, CachePublish, CacheEvict,
    OccurrenceVisit, OccurrencePublish,
    SourceIndexRange, SourceIndexSortCompare, SourceIndexDedupCandidate,
    SourceIndexPublish, SourceCandidate,
    SourceHitMaterialize, SourceHitEmit, TraceRelation, TraceFilterRange
};
struct Event {
    Kind kind;
    uint64_t subject = 0, amount = 1;
    std::span<const uint32_t> occurrence = {}; // Borrowed only during the callback.
};
using Clock = std::chrono::steady_clock;

#ifdef HIER_TEST_OBSERVER
struct Sink {
    void *context = nullptr; // Borrowed for the enclosing synchronous test scope.
    void (*event)(void *, const Event &) noexcept = nullptr;
    Clock::time_point (*now)(void *) noexcept = nullptr;
};
inline thread_local const Sink *active = nullptr;
class Scope {
  public:
    explicit Scope(const Sink &sink) noexcept : previous_(active) { active = &sink; }
    Scope(Sink &&) = delete; // A temporary sink would dangle before the query starts.
    ~Scope() { active = previous_; }
    Scope(const Scope &) = delete;
    Scope &operator=(const Scope &) = delete;
  private:
    const Sink *previous_;
};
inline void emit(Event value) noexcept {
    if (active && active->event)
        active->event(active->context, value);
}
inline Clock::time_point now() noexcept {
    return active && active->now ? active->now(active->context) : Clock::now();
}
#else
inline void emit(Event) noexcept {}
inline Clock::time_point now() noexcept { return Clock::now(); }
#endif
} // namespace hier::observation
