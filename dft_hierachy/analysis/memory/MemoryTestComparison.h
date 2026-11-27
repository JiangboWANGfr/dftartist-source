#pragma once
#include "MemoryTestTiming.h"
namespace dft::memory {
// Reuses the authoritative phase types; investigation is common to every case.
struct MemoryTestConfiguration {
    MemoryTestPlanning planning;
    std::optional<std::vector<MemoryTestRule>> rules;
    MemoryTestScheduling scheduling;
    MemoryTestTiming timing;
};
struct NamedMemoryTestConfiguration { std::string name; MemoryTestConfiguration configuration; };
struct MemoryTestComparisonRequest {
    MemoryInvestigationRequest investigation;
    std::vector<NamedMemoryTestConfiguration> configurations;
};
struct MemoryTestMetrics {
    uint64_t controllers=0, plannedSteps=0, scheduledWaves=0, timedWaves=0;
    uint64_t timedInstances=0, timedCapacityBits=0, durationPicoseconds=0;
    uint64_t resourceWaitPicoseconds=0, dependencyWaitPicoseconds=0, availabilityWaitPicoseconds=0;
};
struct MemoryTestDelta { int64_t controllers=0, plannedSteps=0, scheduledWaves=0, durationPicoseconds=0, resourceWaitPicoseconds=0, dependencyWaitPicoseconds=0, availabilityWaitPicoseconds=0; };
struct MemoryTestComparisonRow {
    MemoryTestMetrics metrics;
    bool comparable=false; // Both this timeline and reference timeline complete.
    std::optional<MemoryTestDelta> delta;
};
struct NamedMemoryTestTimingReport { std::string name; MemoryTestTimingReport report; };
struct MemoryTestComparison {
    bool complete=true;
    std::vector<NamedMemoryTestTimingReport> configurations; // Reference is index 0.
    std::vector<MemoryTestComparisonRow> rows; // Same order as configurations.
};
// Synchronous Design borrow. One investigation, owning original reports per case.
// No external fact import, automatic ranking, cross-design or physical equivalence.
hier::Result<MemoryTestComparison> compareMemoryTestConfigurations(hier::Design &,const MemoryTestComparisonRequest &,hier::Cancel = {});
}
