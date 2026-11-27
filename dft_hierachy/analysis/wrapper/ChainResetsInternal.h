#pragma once
#include "ChainResets.h"
#include <chrono>
namespace dft::wrapper::detail {
hier::Result<ChainResetReport> inspectWrapperChainResetsWithDeadline(hier::Design &,const ChainResetRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
