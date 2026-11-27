#pragma once
#include "RegisterStatistics.h"
#include <functional>
#include <span>
namespace dft::sequential::detail {
uint64_t checkedCountAdd(uint64_t, uint64_t);
uint64_t intervalEnd(const hier::model::BitRange &);
std::optional<RegisterCoverage> coverageForIntervals(std::span<const hier::model::BitRange>, uint64_t,
    const std::function<bool()> &);
}
