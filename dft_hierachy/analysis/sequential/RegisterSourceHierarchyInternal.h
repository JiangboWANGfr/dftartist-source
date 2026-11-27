#pragma once
#include "RegisterSourceHierarchy.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterSourceHierarchyLimits(const RegisterSourceHierarchyLimits &);
hier::Result<RegisterSourceHierarchyReport> sourceHierarchyWithDeadline(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceHierarchyLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
