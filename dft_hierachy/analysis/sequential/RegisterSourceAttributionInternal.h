#pragma once
#include "RegisterSourceAttribution.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterSourceAttributionLimits(const RegisterSourceAttributionLimits &);
hier::Result<RegisterSourceAttributionReport> sourceAttributionWithDeadline(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceAttributionLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
