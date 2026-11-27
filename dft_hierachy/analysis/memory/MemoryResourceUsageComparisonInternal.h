#pragma once
#include "MemoryResourceUsageComparison.h"
#include <chrono>
namespace dft::memory::detail {
void validateMemoryResourceUsageComparisonRequest(const MemoryResourceUsageComparisonRequest &,hier::Cancel = {});
hier::Result<MemoryResourceUsageComparison> compareMemoryResourceUsageWithDeadline(hier::Design &,const MemoryResourceUsageComparisonRequest &,std::chrono::steady_clock::time_point,hier::Cancel = {});
}
