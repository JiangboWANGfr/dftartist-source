#pragma once
#include "MemoryResourceUsageComparison.h"
#include "MemoryTestComparisonJson.h"
namespace dft::memory {
void writeMemoryResourceUsageComparison(hier::protocol::JsonWriter &,const MemoryResourceUsageComparison &,const PinLibrary * = nullptr);
}
