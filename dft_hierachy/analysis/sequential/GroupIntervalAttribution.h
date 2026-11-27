#pragma once
#include "RegisterEventGroups.h"
#include <functional>
namespace dft::sequential::detail {
struct GroupBitInterval { hier::model::BitRange bits; size_t group = 0; };
struct GroupOverlap { uint64_t crossGroupBits = 0; std::vector<EventOverlapSegment> segments; };
struct GroupOverlapAttempt { std::optional<GroupOverlap> value; std::string reason; };
struct GroupIntervalPartition { uint64_t coveredBits = 0; std::vector<EventOverlapSegment> segments; };
struct GroupPartitionAttempt { std::optional<GroupIntervalPartition> value; std::string reason; };
// Shared endpoint partition. minGroups selects the supported active membership domain (1 or 2).
GroupPartitionAttempt partitionGroupIntervals(size_t, const std::function<GroupBitInterval(size_t)> &,
    size_t minGroups, uint64_t maxSegments, uint64_t maxMembers, const std::function<bool()> &tick);
// Borrows getters only during the call. Atomic segments; a failed tick is already accounted by the caller.
GroupOverlapAttempt attributeGroupIntervals(size_t, const std::function<GroupBitInterval(size_t)> &,
    uint64_t maxSegments, uint64_t maxMembers, const std::function<bool()> &tick);
}
