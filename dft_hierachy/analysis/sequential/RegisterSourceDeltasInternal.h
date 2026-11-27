#pragma once
#include "RegisterSourceDeltas.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterSourceDeltaLimits(const RegisterSourceDeltaLimits &);
hier::Result<RegisterSourceDeltaReport> sourceDeltasWithDeadline(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceDeltaLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
