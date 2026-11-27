#pragma once
#include "MemoryTestTiming.h"
namespace dft::memory {
struct MemoryTestInterval {
    uint64_t startPicoseconds=0, durationPicoseconds=0, endPicoseconds=0, barrierEndPicoseconds=0;
};
struct MemoryTestCoverageRow {
    size_t macro=0;
    std::string stage, status, reason;
    std::optional<size_t> memory, plannedMemory, controller, step, wave, entry;
    std::optional<MemoryTestInterval> timing;
};
struct MemoryTestCoverage {
    bool complete=true;
    uint64_t observedMacros=0, matchedInstances=0, plannedInstances=0, scheduledInstances=0;
    uint64_t timedInstances=0, blockedInstances=0, pendingInstances=0;
    std::vector<MemoryTestCoverageRow> rows; // One per published source macro, same order.
};
struct MemoryTestCoverageReport { MemoryTestTimingReport source; MemoryTestCoverage coverage; };
// Synchronous Design borrow; owns the unchanged timing source and derived indices.
// Unobserved macros are not invented. Timed intervals describe declarations only.
hier::Result<MemoryTestCoverageReport> inspectMemoryTestCoverage(hier::Design &,const MemoryTestTimingRequest &,hier::Cancel = {});
}
