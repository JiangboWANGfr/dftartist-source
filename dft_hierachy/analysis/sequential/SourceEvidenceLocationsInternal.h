#pragma once
#include "SourceEvidenceLocations.h"
#include <chrono>
namespace dft::sequential::detail {
void validateSourceEvidenceLocationLimits(const SourceEvidenceLocationLimits &);
hier::Result<SourceEvidenceLocations> sourceEvidenceLocationsWithDeadline(hier::Design &,const SourceRangeEvidence &,
    const SourceEvidenceLocationLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
