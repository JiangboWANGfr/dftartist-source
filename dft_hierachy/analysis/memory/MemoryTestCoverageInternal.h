#pragma once
#include "MemoryTestCoverage.h"
namespace dft::memory::detail {
MemoryTestCoverage deriveMemoryTestCoverage(const MemoryTestTimingReport &,hier::Cancel = {});
}
