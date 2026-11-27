#pragma once
#include "RegisterSourceTransitions.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterSourceTransitionLimits(const RegisterSourceTransitionLimits &);
hier::Result<RegisterSourceTransitionReport> sourceTransitionsWithDeadline(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceTransitionLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
