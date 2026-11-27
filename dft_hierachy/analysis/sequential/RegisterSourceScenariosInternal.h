#pragma once
#include "RegisterSourceScenarios.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterSourceScenarioLimits(const RegisterSourceScenarioLimits &);
hier::Result<RegisterSourceScenarioReport> sourceScenariosWithDeadline(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceScenarioLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
