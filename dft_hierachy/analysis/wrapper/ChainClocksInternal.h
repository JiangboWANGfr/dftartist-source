#pragma once
#include "ChainClocks.h"
#include <chrono>
namespace dft::wrapper::detail {
hier::Result<ChainClockReport> inspectWrapperChainClocksWithDeadline(hier::Design &,const ChainClockRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
