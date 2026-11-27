#pragma once
#include "RegisterSourceHierarchyMatrix.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterSourceHierarchyMatrixLimits(const RegisterSourceHierarchyMatrixLimits &);
hier::Result<RegisterSourceHierarchyMatrixReport> sourceHierarchyMatrixWithDeadline(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceHierarchyMatrixLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
