#pragma once
#include "RegisterStatistics.h"

namespace dft::sequential {
struct EventGroupLimits {
    uint64_t maxGroups = 100000, maxMembers = 100000, maxSegments = 200000;
    uint64_t maxOverlapMembers = 100000, maxWork = 1000000, maxMillis = 30000;
};
struct RegisterEventGroup {
    hier::model::EventInfo clock; // ClockEvent: type is empty; async classification is not a clock field.
    std::vector<hier::model::EventInfo> async;
    bool identityComplete = true;
    std::vector<size_t> signals; // Indices in RegisterEventGroups::signals.
    StatisticsTotals totals; // Covered bits deduplicated within this group only.
};
struct EventGroupSignal {
    size_t signal = 0, group = 0;
    std::vector<size_t> facts; // Original RegisterStatistics::facts indices.
    std::optional<RegisterCoverage> coverage;
};
struct EventOverlapSegment { hier::model::BitRange bits; std::vector<size_t> groups; };
struct SignalEventAttribution {
    size_t signal = 0;
    std::vector<size_t> groups;
    uint64_t crossGroupBits = 0;
    std::vector<EventOverlapSegment> segments;
};
struct RegisterEventGroups {
    std::string snapshotId, scope;
    EventGroupLimits limits;
    bool complete = true;
    std::vector<std::string> reasons;
    uint64_t inputFacts = 0, inputSignals = 0, processedFacts = 0, work = 0;
    uint64_t segmentCount = 0, overlapMembers = 0, checkedSignals = 0, crossGroupBits = 0;
    std::vector<RegisterEventGroup> groups;
    std::vector<EventGroupSignal> signals;
    std::vector<SignalEventAttribution> attributions; // Only signals with multiple known event groups.
};
// Borrows an unmodified statistics report only during this call, never queries Design.
// Owns event values and index containers; indices require that same statistics report.
// Groups literal event tuples, not proven clock roots or physical clock domains.
hier::Result<RegisterEventGroups> groupRegisterEvents(const RegisterStatistics &, const EventGroupLimits & = {}, hier::Cancel = {});
}
