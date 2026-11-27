#pragma once
#include "RegisterResolvedEvents.h"
#include "Scenarios.h"
#include "RegisterFactCoverage.h"
namespace dft::sequential {
struct RegisterScenarioRequest {
    RegisterControlOptions common;
    ResolvedEventLimits resolved;
    std::vector<Scenario> scenarios;
    uint64_t maxMillis = 60000, maxComparisons = 10000, maxWork = 1000000;
    uint64_t maxMembers = 100000, maxSegments = 200000;
};
struct RegisterScenarioResult {
    std::string name;
    std::vector<InputValueRequest> inputValuesRequested;
    std::optional<RegisterControlProfile> profile;
    std::optional<RegisterResolvedEvents> resolved;
    std::vector<std::string> reasons;
};
struct RegisterScenarioRow {
    size_t rawGroup = 0;
    std::optional<size_t> baselineGroup, scenarioGroup;
    std::string status;
    std::vector<std::string> reasons;
};

struct RegisterScenarioComparison {
    size_t baseline = 0, scenario = 0;
    uint64_t inputGroups = 0;
    bool complete = true;
    std::vector<std::string> reasons;
    std::vector<RegisterScenarioRow> rows;
    std::vector<RegisterChangedSignal> changedSignals;
    StatisticsTotals changedTotals; // Per comparison union, not a batch-wide physical state count.
};
struct RegisterScenarioReport {
    std::string snapshotId, scope;
    RegisterScenarioRequest request;
    RegisterEventGroups events; // Computed once. Every started profile owns an identical copy.
    bool complete = true;
    std::vector<std::string> reasons;
    uint64_t work = 0, comparisonRows = 0, memberFacts = 0, segmentCount = 0;
    std::vector<RegisterScenarioResult> scenarios;
    std::vector<RegisterScenarioComparison> comparisons;
};
// Borrows the Design and its unmodified statistics only for this call. Results own their evidence/indices.
// Fact indices still require that original statistics. Changes concern proven event sources, not waveforms or DFT safety.
hier::Result<RegisterScenarioReport> compareRegisterScenarios(hier::Design &, const RegisterStatistics &,
    const RegisterScenarioRequest &, hier::Cancel = {});
}
