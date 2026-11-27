#pragma once
#include "MemoryTestSchedule.h"
namespace dft::memory {
struct MemoryTestClock { std::string clockDomain; uint64_t periodPicoseconds=0; std::vector<std::string> partitions{}; };
struct MemoryTimingPolicy {
    uint64_t waveOverheadPicoseconds=0, maxDurationPicoseconds=9007199254740991ULL;
};
struct MemoryTimingLimits { uint64_t maxWork=1000000, maxMillis=1000; };
struct MemoryTestTiming {
    std::vector<MemoryTestClock> clocks;
    MemoryTimingPolicy policy;
    MemoryTimingLimits limits;
};
struct MemoryTestTimingRequest { MemoryTestScheduleRequest schedule; MemoryTestTiming timing; };
struct MemoryTimedEntry { size_t clock=0; uint64_t durationPicoseconds=0; };
struct MemoryResourceWait {
    uint64_t durationPicoseconds=0;
    std::vector<size_t> resources; // Request indices whose recovery extends past prior wave end.
};
struct MemoryDependencyWait {
    uint64_t durationPicoseconds=0; // Extra delay beyond resource recovery.
    std::vector<size_t> dependencies; // Original dependency indices.
};
struct MemoryResourceIntervalRef { size_t resource=0, interval=0; };
struct MemoryAvailabilityWait {
    uint64_t durationPicoseconds=0; // Extra delay after recovery and dependency readiness.
    std::vector<MemoryResourceIntervalRef> intervals; // Only intervals that advanced start.
};
struct MemoryTimedWave {
    uint64_t startPicoseconds=0, durationPicoseconds=0, endPicoseconds=0;
    std::vector<MemoryTimedEntry> entries; // Same order as corresponding source wave.
    std::optional<MemoryResourceWait> resourceWait;
    std::optional<MemoryDependencyWait> dependencyWait;
    std::optional<MemoryAvailabilityWait> availabilityWait{};
};
struct MemoryTimingStop { size_t wave=0; std::optional<size_t> entry; std::string reason; };
struct MemoryTestTimeline {
    MemoryTestTiming request;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t work=0, durationPicoseconds=0, timedSteps=0, timedInstances=0, timedCapacityBits=0;
    std::vector<MemoryTimedWave> waves; // Complete prefix of source.schedule.waves.
    std::vector<size_t> unusedClocks; // Not referenced by any published wave.
    std::optional<MemoryTimingStop> stop;
    uint64_t resourceWaitPicoseconds=0; // Sum over published waves only.
    uint64_t dependencyWaitPicoseconds=0;
    uint64_t availabilityWaitPicoseconds=0;
};
struct MemoryTestTimingReport { MemoryTestScheduleReport source; MemoryTestTimeline timeline; };
// Synchronous Design borrow, owning result. Periods and overhead are declarations;
// batches require barriers. No RTL generation, measured runtime or frequency inference.
hier::Result<MemoryTestTimingReport> timeMemoryTests(hier::Design &,const MemoryTestTimingRequest &,hier::Cancel = {});
}
