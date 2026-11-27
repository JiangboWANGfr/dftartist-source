#pragma once
#include "ChainCoverage.h"
#include <chrono>
namespace dft::wrapper::detail {
hier::Result<ChainCoverageReport> inspectWrapperCoverageWithDeadline(hier::Design &,const ChainCoverageRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
