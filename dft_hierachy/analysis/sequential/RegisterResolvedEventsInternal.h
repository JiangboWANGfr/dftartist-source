#pragma once
#include "RegisterResolvedEvents.h"
#include <chrono>
namespace dft::sequential::detail {
void validateResolvedEventLimits(const ResolvedEventLimits &);
hier::Result<RegisterResolvedEvents> resolvedEventsWithDeadline(const RegisterStatistics &, const RegisterControlProfile &,
    const ResolvedEventLimits &, std::chrono::steady_clock::time_point, hier::Cancel);
}
