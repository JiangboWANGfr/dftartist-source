#pragma once
#include "RegisterControlProfile.h"
#include <chrono>
namespace dft::sequential::detail {
// Internal trusted path: caller validates same Design/statistics snapshot and supplies the original shared groups.
// Takes an owned copy for the returned profile, so old DTO ownership/layout stays unchanged.
hier::Result<RegisterControlProfile> profileFromEvents(hier::Design &, const RegisterStatistics &, RegisterEventGroups,
    const RegisterControlOptions &, std::chrono::steady_clock::time_point, hier::Cancel);
void validateRegisterProfileReferences(const RegisterStatistics &, const RegisterControlProfile &, hier::Cancel);
void validateRegisterControlOptions(const RegisterControlOptions &);
hier::Result<RegisterControlProfile> profileWithDeadline(hier::Design &, const RegisterStatistics &,
    const RegisterControlOptions &, std::chrono::steady_clock::time_point, hier::Cancel);
}
