#pragma once
#include "RegisterSourceHierarchyMatrix.h"
#include "IntervalCoverage.h"
namespace dft::sequential::detail {
inline void addSourceHierarchyRoleCounts(SourceDeltaCounts &counts,SourceHierarchyRole role,uint64_t width) {
    using Role=SourceHierarchyRole;
    if(role!=Role::Added) counts.baselineBits=checkedCountAdd(counts.baselineBits,width);
    if(role!=Role::Removed) counts.scenarioBits=checkedCountAdd(counts.scenarioBits,width);
    auto &count=role==Role::Added?counts.addedBits:role==Role::Removed?counts.removedBits:counts.retainedBits;
    count=checkedCountAdd(count,width);
}
}
