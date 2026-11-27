#pragma once
#include "ChainComparison.h"
#include <chrono>
namespace dft::wrapper::detail {
hier::Result<ChainComparisonReport> compareWrapperChainsWithDeadline(hier::Design &,const ChainComparisonRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
