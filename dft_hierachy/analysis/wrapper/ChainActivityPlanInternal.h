#pragma once
#include "ChainActivityPlan.h"
#include <chrono>
namespace dft::wrapper::detail {
hier::Result<ChainActivityPlanReport> planWrapperChainActivityWithDeadline(hier::Design &,const ChainActivityPlanRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
