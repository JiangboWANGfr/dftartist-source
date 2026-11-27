#pragma once
#include "ChainCompatibility.h"
#include <chrono>
#include <functional>
namespace dft::wrapper::detail {
// Trusted original report, borrowed only for this call; tick owns cancellation/budget.
ChainCompatibilityRow evaluateActivityGroup(const ChainResetReport &,const std::vector<size_t> &,size_t,
    const std::function<void()> &tick);
hier::Result<ChainCompatibilityReport> inspectWrapperChainCompatibilityWithDeadline(hier::Design &,const ChainCompatibilityRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
