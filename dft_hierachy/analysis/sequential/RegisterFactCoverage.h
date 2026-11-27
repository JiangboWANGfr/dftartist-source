#pragma once
#include "RegisterStatistics.h"
namespace dft::sequential {
struct RegisterChangedSignal {
    size_t signal = 0;
    std::vector<size_t> facts;
    std::optional<RegisterCoverage> coverage;
};
// Preserve the original public struct tag; one representation for attributed original fact coverage.
using RegisterFactCoverage = RegisterChangedSignal;
}
