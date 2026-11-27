#pragma once
#include "RegisterSourceImpact.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterSourceImpactLimits(const RegisterSourceImpactLimits &);
hier::Result<RegisterSourceImpactReport> sourceImpactWithDeadline(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceImpactLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
