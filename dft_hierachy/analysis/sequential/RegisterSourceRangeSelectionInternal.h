#pragma once
#include "RegisterSourceRangeSelection.h"
#include <chrono>
namespace dft::sequential::detail {
std::optional<hier::model::BitRange> intersectSourceRanges(const hier::model::BitRange &,const hier::model::BitRange &);
void validateSourceRangeQuery(const SourceRangeQuery &);
void validateSourceRangeSelectionLimits(const SourceRangeSelectionLimits &);
hier::Result<SourceRangeSelection> sourceRangeSelectionWithDeadline(const RegisterSourceHierarchyRangeReport &,
    const SourceRangeQuery &,const SourceRangeSelectionLimits &,std::chrono::steady_clock::time_point,hier::Cancel);
}
