#pragma once
#include "RegisterFanout.h"
#include <chrono>
namespace dft::sequential::detail {
void validateRegisterFanoutLimits(const RegisterFanoutLimits &);
hier::Result<RegisterFanout> fanoutWithDeadline(const RegisterStatistics &,const RegisterControlProfile &,
    const RegisterGeneration &,const RegisterFanoutLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
