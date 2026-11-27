#pragma once
#include "RegisterSourceAttribution.h"
#include "IntervalCoverage.h"
namespace dft::sequential::detail {
inline void addSourceAttributionCounts(SourceAttributionCounts &to,const SourceAttributionCounts &from) {
    to.coveredBits=checkedCountAdd(to.coveredBits,from.coveredBits);
    to.changedBits=checkedCountAdd(to.changedBits,from.changedBits);
    to.retainedOnlyBits=checkedCountAdd(to.retainedOnlyBits,from.retainedOnlyBits);
}
}
