#pragma once
#include "GenerationComparison.h"
#include <chrono>
#include <functional>
namespace dft::sequential::detail {
// Synchronous trusted view. Caller validates graph/reference provenance; all inputs outlive the call.
struct GenerationComparisonInput {
    const std::string &snapshotId, &scope;
    bool complete;
    size_t scenarios;
    std::function<bool(size_t)> present;
    std::function<size_t(size_t)> checkCount;
    std::function<const hier::model::TracePoint &(size_t,size_t)> point;
};
hier::Result<GenerationComparisonReport> generationComparisonFromInput(const GenerationComparisonInput &,
    std::span<const GenerationContext>, const GenerationComparisonLimits &, std::chrono::steady_clock::time_point, hier::Cancel);
void validateGenerationComparisonLimits(const GenerationComparisonLimits &);
hier::Result<GenerationComparisonReport> compareGenerationWithDeadline(const ScenarioReport &,
    std::span<const GenerationContext>, const GenerationComparisonLimits &,
    std::chrono::steady_clock::time_point, hier::Cancel);
}
