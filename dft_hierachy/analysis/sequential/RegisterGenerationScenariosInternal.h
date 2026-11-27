#pragma once
#include "RegisterGenerationScenarios.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterGenerationScenarioLimits(const RegisterGenerationScenarioLimits &);
hier::Result<RegisterGenerationScenarioReport> registerGenerationScenariosWithDeadline(hier::Design &, const RegisterStatistics &,
    const RegisterScenarioRequest &, const RegisterGenerationScenarioLimits &, std::chrono::steady_clock::time_point, hier::Cancel);
}
