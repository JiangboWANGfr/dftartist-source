#pragma once
#include "RegisterScenarios.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterScenarioRequest(const RegisterScenarioRequest &);
hier::Result<RegisterScenarioReport> registerScenariosWithDeadline(hier::Design &, const RegisterStatistics &,
    const RegisterScenarioRequest &, std::chrono::steady_clock::time_point, hier::Cancel);
}
