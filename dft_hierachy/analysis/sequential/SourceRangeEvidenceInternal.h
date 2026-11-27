#pragma once
#include "SourceRangeEvidence.h"
#include <chrono>
namespace dft::sequential::detail {
void validateSourceRangeEvidenceLimits(const SourceRangeEvidenceLimits &);
hier::Result<SourceRangeEvidence> sourceRangeEvidenceWithDeadline(const RegisterStatistics &,const RegisterSourceHierarchyRangeReport &,
    const SourceRangeSelection &,const SourceRangeEvidenceLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
