#pragma once
#include "ChainPlan.h"
#include <chrono>
namespace dft::wrapper::detail {
// Validated internal consumers only; indices retain their original source meanings.
ChainLayout organizeChainsFromCells(const BoundaryReport &,const CellPlan &,const ChainPlanRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel);
hier::Result<ChainPlanReport> planWrapperChainsWithDeadline(hier::Design &,const ChainPlanRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
