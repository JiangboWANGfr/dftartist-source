#pragma once
#include "Check.h"
#include "ControlSource.h"

namespace dft::sequential {
struct Scenario {
    std::string name;
    std::vector<InputValueRequest> inputValues;
};
struct ScenarioRequest {
    Request common;
    std::vector<Scenario> scenarios;
    uint64_t maxMillis = 60000, maxComparisons = 10000;
};
struct ScenarioResult {
    std::string name;
    std::vector<InputValueRequest> inputValuesRequested;
    // Absent only for a scenario not started before the shared soft deadline.
    std::optional<Report> report;
};
struct ScenarioControl {
    hier::model::TracePoint point;
    std::optional<size_t> baselineCheck, scenarioCheck;
    std::string status;
    std::vector<std::string> reasons;
    std::optional<ScenarioSource> baselineSource, scenarioSource;
};
struct ScenarioComparison {
    size_t baseline = 0, scenario = 0;
    std::vector<ScenarioControl> controls;
};
struct ScenarioReport {
    ScenarioRequest request;
    hier::model::SnapshotInfo snapshot;
    std::string scope;
    bool complete = true;
    std::vector<std::string> reasons;
    std::vector<ScenarioResult> scenarios;
    std::vector<ScenarioComparison> comparisons;
};

// Borrows one immutable Design for all scenarios. Returned reports own their data.
// Compares proven sources, not functional, waveform or test-protocol equivalence.
// Errors/cancellation publish no successful partial batch.
hier::Result<ScenarioReport> compareScenarios(hier::Design &, const ScenarioRequest &, hier::Cancel = {});
}
