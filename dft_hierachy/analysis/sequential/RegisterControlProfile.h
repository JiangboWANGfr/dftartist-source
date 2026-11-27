#pragma once
#include "RegisterEventGroups.h"
#include "ControlSource.h"

namespace dft::sequential {
struct RegisterControlOptions {
    EventGroupLimits eventGroups;
    bool resolveLogic = false;
    std::vector<ClockRootInput> clockRoots;
    std::vector<InputValueRequest> inputValues;
    uint64_t maxChecks = 1000, maxTraceNodes = 10000, maxTraceEdges = 40000, maxDepth = 64;
    uint64_t maxLogicWork = 10000, maxMillis = 30000;
    uint64_t maxWork = 1000000, maxMembers = 100000, maxSegments = 200000;
};
struct ProfileControl { Control control; std::optional<ControlSource> source; };
struct GroupControls {
    size_t group = 0;
    std::optional<size_t> clockCheck;
    std::vector<std::optional<size_t>> asyncChecks;
    bool eventsComplete = false;
    std::optional<size_t> cohort;
};
struct ClockSourceCohort {
    ControlSource source;
    std::string edge; // Original clock edge. Inversions are not converted into edge equivalences.
    std::vector<size_t> groups, signals;
    StatisticsTotals totals; // Deduplicated within this source+polarity+edge only.
};
struct CohortSignal {
    size_t cohort = 0, signal = 0;
    std::vector<size_t> facts; // Original RegisterStatistics::facts indices.
    std::optional<RegisterCoverage> coverage;
};
struct RegisterControlProfile {
    std::string snapshotId, scope;
    RegisterControlOptions options;
    RegisterEventGroups events;
    bool complete = true;
    std::vector<std::string> reasons;
    uint64_t processedGroups = 0, visitedEvents = 0, attributedFacts = 0;
    uint64_t traceNodes = 0, traceEdges = 0, logicWork = 0, work = 0, segmentCount = 0;
    std::vector<ClockRoot> clockRoots;
    std::vector<InputValue> inputValues;
    std::vector<ProfileControl> checks;
    std::vector<GroupControls> groupControls;
    std::vector<ClockSourceCohort> cohorts;
    std::vector<CohortSignal> signals;
};
// Requires unmodified statistics from this Design snapshot. Borrows inputs only during the call.
// Owns new proofs/events/indices; fact indices still require that original statistics report.
// A cohort groups a proven clock source+polarity+original edge, not async equivalence or a physical domain.
hier::Result<RegisterControlProfile> profileRegisterControls(hier::Design &, const RegisterStatistics &,
    const RegisterControlOptions & = {}, hier::Cancel = {});
}
