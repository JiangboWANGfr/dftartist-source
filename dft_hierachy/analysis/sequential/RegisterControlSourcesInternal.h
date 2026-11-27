#pragma once
#include "RegisterControlSources.h"
#include <chrono>
namespace dft::sequential::detail {
// Outer deadline also clips the fanout phase; original public and post-only entry semantics stay unchanged.
hier::Result<RegisterControlSources> sourcesBefore(const RegisterStatistics &,const RegisterControlProfile &,
    const RegisterGeneration &,const RegisterSourceLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
void validateRegisterSourceLimits(const RegisterSourceLimits &);
// Only fixes the post deadline. The original fanout phase keeps its own validation and budgets.
hier::Result<RegisterControlSources> sourcesWithDeadline(const RegisterStatistics &,const RegisterControlProfile &,
    const RegisterGeneration &,const RegisterSourceLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
