#pragma once
#include "Check.h"
#include <chrono>
#include <set>

namespace dft::sequential::detail {
enum class InputPurpose { ClockRoot, Value };
// Returns owned canonical input bits; all public paths/ports are read during this call.
hier::Result<std::vector<PrimaryInputBit>> resolvePrimaryInputs(
    hier::Design &, const std::vector<PrimaryInputRequest> &, const std::set<std::string> &tops,
    std::chrono::steady_clock::time_point deadline, hier::Cancel, InputPurpose);
}
