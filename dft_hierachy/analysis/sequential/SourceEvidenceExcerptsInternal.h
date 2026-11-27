#pragma once
#include "SourceEvidenceExcerpts.h"
#include <chrono>
namespace dft::sequential::detail {
void validateSourceEvidenceExcerptLimits(const SourceEvidenceExcerptLimits &);
hier::Result<SourceEvidenceExcerpts> sourceEvidenceExcerptsWithDeadline(hier::Design &,const SourceEvidenceLocations &,
    const SourceEvidenceExcerptLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
