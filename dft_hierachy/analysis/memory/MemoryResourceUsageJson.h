#pragma once
#include "MemoryResourceUsage.h"
#include "MemoryTestTimingJson.h"
namespace dft::memory {
void writeMemoryResourceUsage(hier::protocol::JsonWriter &,const MemoryResourceUsageReport &,const PinLibrary * = nullptr);
}
