#pragma once
#include "MemoryResourceUsage.h"
#include <chrono>
namespace dft::memory::detail {
void validateMemoryResourceUsageLimits(const MemoryResourceUsageLimits &);
void validateMemoryResourceUsageRequest(const MemoryResourceUsageRequest &,hier::Cancel = {});
// Trusted original timer only; not an external report import API.
MemoryResourceUsage deriveMemoryResourceUsage(const MemoryTestTimingReport &,const MemoryResourceUsageLimits &,hier::Cancel,std::optional<std::chrono::steady_clock::time_point> = {});
hier::Result<MemoryResourceUsageReport> inspectMemoryResourceUsageWithDeadline(hier::Design &,const MemoryResourceUsageRequest &,std::chrono::steady_clock::time_point,hier::Cancel = {});
}
