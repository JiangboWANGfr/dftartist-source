#pragma once
#include "ChainActivitySchedule.h"
#include <chrono>
namespace dft::wrapper::detail {
hier::Result<ChainActivityScheduleReport> scheduleWrapperChainActivityWithDeadline(hier::Design &,const ChainActivityScheduleRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
