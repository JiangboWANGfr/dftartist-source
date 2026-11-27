#pragma once
#include "CellPlan.h"
#include <chrono>
namespace dft::wrapper::detail {
// Validated internal consumers only: borrow the original Design-produced boundary.
CellPlan planCellsFromBoundary(const BoundaryReport &,const CellPlanRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel);
hier::Result<CellPlanReport> planWrapperCellsWithDeadline(hier::Design &,const CellPlanRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
