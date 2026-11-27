#pragma once
#include "IntervalCoverage.h"
#include <chrono>
#include <functional>
#include <span>
namespace dft::sequential::detail {
void validateStatisticsReferences(const RegisterStatistics &, hier::Cancel);
void validateStatisticsRequest(const StatisticsRequest &);
hier::Result<RegisterStatistics> statisticsWithDeadline(hier::Design &, const StatisticsRequest &,
    std::chrono::steady_clock::time_point, hier::Cancel);
}
