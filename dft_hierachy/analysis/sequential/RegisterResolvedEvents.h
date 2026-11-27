#pragma once
#include "RegisterControlProfile.h"
namespace dft::sequential {
struct ResolvedEventLimits {
    uint64_t maxRows = 10000, maxGroups = 10000, maxMembers = 100000;
    uint64_t maxSegments = 200000, maxOverlapMembers = 100000, maxWork = 1000000, maxMillis = 30000;
};
struct ResolvedControlEvent { ControlSource source; std::string edge, type; }; // Clock type is empty.
struct ResolvedRegisterGroup {
    ResolvedControlEvent clock;
    std::vector<ResolvedControlEvent> async;
    std::vector<size_t> rawGroups, signals;
    StatisticsTotals totals;
};
struct ResolvedGroupRow {
    size_t rawGroup = 0;
    std::optional<size_t> resolvedGroup;
    bool membersComplete = false;
    std::vector<std::string> reasons;
};
struct RegisterResolvedEvents {
    std::string snapshotId, scope;
    ResolvedEventLimits limits;
    bool complete = true;
    std::vector<std::string> reasons;
    uint64_t inputRawGroups = 0, inputFacts = 0, processedRawGroups = 0, resolvedRows = 0;
    uint64_t visitedEvents = 0, assignedFacts = 0, work = 0, segmentCount = 0;
    uint64_t checkedSignals = 0, crossGroupBits = 0, overlapMembers = 0;
    std::vector<ResolvedGroupRow> rows;
    std::vector<ResolvedRegisterGroup> groups;
    std::vector<EventGroupSignal> signals; // group indexes this report; facts index original statistics.
    std::vector<SignalEventAttribution> attributions; // group indexes this report.
};
// Only borrows matching, unmodified statistics/profile during this call; never queries Design.
// Owns copied sources and index containers. Indices still need those original reports to interpret.
// Groups proven event-source tuples, not physical domains, waveform equivalence or DFT safety.
hier::Result<RegisterResolvedEvents> groupResolvedRegisterEvents(const RegisterStatistics &, const RegisterControlProfile &,
    const ResolvedEventLimits & = {}, hier::Cancel = {});
}
