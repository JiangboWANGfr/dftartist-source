#pragma once
#include "Boundary.h"
#include <chrono>
namespace dft::wrapper::detail {
// Production entry also uses this deadline path; deterministic timeout verification.
hier::Result<BoundaryReport> investigateBoundaryWithDeadline(hier::Design &,const BoundaryRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
