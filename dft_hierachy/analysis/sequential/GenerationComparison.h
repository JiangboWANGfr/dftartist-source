#pragma once
#include "ControlGeneration.h"
#include "Scenarios.h"
#include <functional>
#include <span>

namespace dft::sequential {
struct GenerationComparisonLimits {
    uint64_t maxCones = 10000, maxMembers = 100000, maxRows = 10000;
    uint64_t maxWork = 1000000, maxMillis = 1000;
};
struct GenerationContext {
    size_t scenario;
    std::reference_wrapper<const ControlGeneration> graph; // Borrowed only during the call.
};
struct GenerationCone {
    size_t check = 0;
    std::optional<size_t> node;
    bool complete = true;
    std::vector<std::string> reasons;
    std::vector<size_t> nodes; // Original graph indices, ordered by full point identity.
};
struct GenerationCones { size_t scenario = 0; std::vector<GenerationCone> cones; };
struct GenerationChange {
    hier::model::TracePoint point;
    std::optional<size_t> baselineCone, scenarioCone;
    std::string status;
    std::vector<std::string> reasons;
};
struct GenerationChanges {
    size_t baseline = 0, scenario = 0;
    std::vector<std::string> reasons;
    std::vector<GenerationChange> controls;
};
struct GenerationComparisonReport {
    std::string snapshotId, scope;
    GenerationComparisonLimits limits;
    bool complete = true;
    std::vector<std::string> reasons;
    uint64_t inputCones = 0, processedCones = 0, memberEntries = 0, work = 0;
    std::vector<GenerationCones> contexts;
    std::vector<GenerationChanges> comparisons;
};
// Requires unmodified reports/graphs from the same scenario batch. No Design is queried.
// Returned values are owned; indices require those same original graphs to interpret.
// Compares proven generating-control structure, never waveform or functional equivalence.
hier::Result<GenerationComparisonReport> compareGenerationScenarios(const ScenarioReport &,
    std::span<const GenerationContext>, const GenerationComparisonLimits & = {}, hier::Cancel = {});
}
