#pragma once
#include "RegisterGeneration.h"
#include <chrono>
namespace dft::sequential::detail {
hier::Result<RegisterGeneration> registerGenerationBefore(hier::Design &, const RegisterStatistics &, const RegisterControlProfile &,
    const RegisterGenerationLimits &, std::chrono::steady_clock::time_point, hier::Cancel);
void validateRegisterGenerationLimits(const RegisterGenerationLimits &);
hier::Result<RegisterGeneration> registerGenerationWithDeadlines(hier::Design &, const RegisterStatistics &,
    const RegisterControlProfile &, const RegisterGenerationLimits &, std::chrono::steady_clock::time_point,
    std::chrono::steady_clock::time_point, hier::Cancel);
}
