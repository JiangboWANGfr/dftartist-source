#pragma once
#include "ControlGeneration.h"
#include <chrono>
#include <functional>
namespace dft::sequential::detail {
// Private synchronous view: all inputs and controls outlive generationFromInput. Caller validates provenance.
struct GenerationInput {
    const Request &request;
    const std::string &snapshotId, &scope;
    bool complete;
    size_t checkCount;
    std::function<const Control &(size_t)> check;
    const std::vector<ClockRoot> &clockRoots;
    const std::vector<InputValue> &inputValues;
};
hier::Result<ControlGeneration> generationFromInput(hier::Design &, const GenerationInput &, const GenerationLimits &,
    std::chrono::steady_clock::time_point, hier::Cancel);
void validateGenerationLimits(const GenerationLimits &);
hier::Result<ControlGeneration> generationWithDeadline(hier::Design &, const Report &, const GenerationLimits &,
    std::chrono::steady_clock::time_point, hier::Cancel);
}
