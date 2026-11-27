#pragma once
#include "ChainExplanation.h"
#include <chrono>
namespace dft::wrapper::detail {
hier::Result<ChainExplanationReport> explainWrapperChainsWithDeadline(hier::Design &,const ChainExplanationRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
