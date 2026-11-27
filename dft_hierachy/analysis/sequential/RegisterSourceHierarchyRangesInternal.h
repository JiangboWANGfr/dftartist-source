#pragma once
#include "RegisterSourceHierarchyRanges.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterSourceHierarchyRangeLimits(const RegisterSourceHierarchyRangeLimits &);
hier::Result<RegisterSourceHierarchyRangeReport> sourceHierarchyRangesWithDeadline(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceHierarchyRangeLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
