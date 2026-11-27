#pragma once
#include "RegisterEventGroups.h"
#include <chrono>
namespace dft::sequential::detail {
void validateEventGroupLimits(const EventGroupLimits &);
hier::Result<RegisterEventGroups> eventGroupsWithDeadline(const RegisterStatistics &, const EventGroupLimits &,
    std::chrono::steady_clock::time_point, hier::Cancel);
}
