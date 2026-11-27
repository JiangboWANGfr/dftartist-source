#include "GroupIntervalAttribution.h"
#include "IntervalCoverage.h"
#include <algorithm>
#include <map>
namespace dft::sequential::detail {
GroupPartitionAttempt partitionGroupIntervals(size_t count, const std::function<GroupBitInterval(size_t)> &get,
    size_t minGroups, uint64_t maxSegments, uint64_t maxMembers, const std::function<bool()> &tick) {
    GroupIntervalPartition out;
    struct Event { uint64_t position; size_t group; int delta; };
    std::vector<Event> events;
    for (size_t i = 0; i < count; ++i) {
        if (!tick()) return {};
        const auto value = get(i);
        events.push_back({value.bits.lsb, value.group, 1}); events.push_back({intervalEnd(value.bits), value.group, -1});
    }
    std::sort(events.begin(), events.end(), [](const auto &a, const auto &b) { return a.position < b.position; });
    std::map<size_t, uint64_t> active;
    uint64_t previous = 0, members = 0;
    for (size_t i = 0; i < events.size();) {
        if (!tick()) return {};
        const auto position = events[i].position;
        if (position > previous && active.size() >= minGroups) {
            std::vector<size_t> ids;
            for (const auto &[g, n] : active) { (void)n; if (!tick()) return {}; ids.push_back(g); }
            const auto width = position - previous;
            if (!out.segments.empty() && intervalEnd(out.segments.back().bits) == previous && out.segments.back().groups == ids)
                out.segments.back().bits.width = checkedCountAdd(out.segments.back().bits.width, width);
            else {
                if (out.segments.size() >= maxSegments) return {{}, "budget_segments"};
                if (ids.size() > maxMembers - members) return {{}, "budget_overlap_members"};
                members += ids.size(); out.segments.push_back({{previous, width}, std::move(ids)});
            }
            out.coveredBits = checkedCountAdd(out.coveredBits, width);
        }
        do {
            if (!tick()) return {};
            const auto &e = events[i];
            if (e.delta > 0) ++active[e.group];
            else {
                const auto found = active.find(e.group);
                if (found == active.end()) throw hier::Error{hier::ErrorCode::Internal, "Unmatched register group interval"};
                if (!--found->second) active.erase(found);
            }
            ++i;
        } while (i < events.size() && events[i].position == position);
        previous = position;
    }
    if (!active.empty()) throw hier::Error{hier::ErrorCode::Internal, "Unclosed register group intervals"};
    return {std::move(out), {}};
}
GroupOverlapAttempt attributeGroupIntervals(size_t count, const std::function<GroupBitInterval(size_t)> &get,
    uint64_t maxSegments, uint64_t maxMembers, const std::function<bool()> &tick) {
    auto result = partitionGroupIntervals(count, get, 2, maxSegments, maxMembers, tick);
    if (!result.value) return {{}, std::move(result.reason)};
    return {GroupOverlap{result.value->coveredBits, std::move(result.value->segments)}, {}};
}
}
