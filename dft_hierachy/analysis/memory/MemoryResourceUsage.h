#pragma once
#include "MemoryTestTiming.h"
namespace dft::memory {
struct MemoryResourceUsageLimits { uint64_t maxWork=1000000, maxUses=100000, maxMillis=1000; };
struct MemoryResourceUsageRequest { MemoryTestTimingRequest test; MemoryResourceUsageLimits limits; };
struct MemoryResourceUse { size_t wave=0; std::vector<size_t> entries; };
struct MemoryResourceUsageRow {
    size_t resource=0;
    uint64_t occupiedPicoseconds=0, peakControllers=0, peakPowerMicrowatts=0;
    std::vector<MemoryResourceUse> uses;
    std::optional<uint64_t> peakUnits{}; // Present only for an explicit unit declaration.
};
struct MemoryResourceUsageStop { size_t wave=0; std::optional<size_t> entry; std::string reason; };
struct MemoryResourceUsage {
    MemoryResourceUsageLimits limits;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t work=0, processedWaves=0, uses=0;
    std::vector<MemoryResourceUsageRow> rows; // Original resource order, including unused declarations.
    std::optional<MemoryResourceUsageStop> stop;
};
struct MemoryResourceUsageReport { MemoryTestTimingReport source; MemoryResourceUsage usage; };
// Synchronous Design borrow, owning source and references into its timed prefix.
// Occupancy reserves the whole wave, including overhead and barrier waiting.
hier::Result<MemoryResourceUsageReport> inspectMemoryResourceUsage(hier::Design &,const MemoryResourceUsageRequest &,hier::Cancel = {});
}
