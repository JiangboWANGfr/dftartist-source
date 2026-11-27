#pragma once
#include <string_view>
#include "Scenarios.h"
#include <chrono>
#include <set>

namespace dft::sequential::detail {
// Borrows the name/set only during validation; preserves the original UTF-8/uniqueness policy.
bool validUtf8(std::string_view);
void validateScenarioName(const std::string &, std::set<std::string> &);
// Shared production seam for deterministic expired-deadline tests; no clock override/global state.
hier::Result<ScenarioReport> compareScenariosWithDeadline(hier::Design &, const ScenarioRequest &,
    std::chrono::steady_clock::time_point, hier::Cancel);
}
