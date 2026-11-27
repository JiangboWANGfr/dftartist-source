#pragma once
#include "MemoryResourceUsage.h"
#include "MemoryTestComparison.h"
namespace dft::memory {
struct MemoryResourceUsageComparisonRequest {
    MemoryTestComparisonRequest tests;
    MemoryResourceUsageLimits limits; // Independent, identical budget per configuration.
};
enum class MemoryResourceComparisonStatus { MissingResource, ReferenceMissing, DomainMismatch, Partial, Compared, PartitionMismatch };
struct MemoryResourceUsageDelta {
    int64_t occupiedPicoseconds=0, peakControllers=0, peakPowerMicrowatts=0;
    std::optional<int64_t> peakUnits{};
};
struct MemoryResourceUsageComparisonCell {
    std::optional<size_t> resource; // Local resource/usage row index; absent is not zero usage.
    MemoryResourceComparisonStatus status=MemoryResourceComparisonStatus::MissingResource;
    std::optional<MemoryResourceUsageDelta> delta;
};
struct MemoryResourceUsageComparisonRow {
    std::string name;
    std::vector<MemoryResourceUsageComparisonCell> cells;
};
struct MemoryResourceUsageComparison {
    MemoryTestComparison source;
    std::vector<MemoryResourceUsage> configurations; // Same order as source; reference is 0.
    bool complete=true;
    std::vector<MemoryResourceUsageComparisonRow> rows; // First declaration encounter order.
};
// One investigation, trusted original timelines, owning output. Design is
// borrowed synchronously. Declared resource identity is not physical equivalence.
hier::Result<MemoryResourceUsageComparison> compareMemoryResourceUsage(hier::Design &,const MemoryResourceUsageComparisonRequest &,hier::Cancel = {});
}
