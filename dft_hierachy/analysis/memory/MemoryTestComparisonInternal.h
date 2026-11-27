#pragma once
#include "MemoryTestComparison.h"
namespace dft::memory::detail {
void validateMemoryTestComparisonRequest(const MemoryTestComparisonRequest &,hier::Cancel = {});
}
