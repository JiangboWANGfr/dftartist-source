#pragma once
#include "MemoryTestComparison.h"
#include "MemoryTestTimingJson.h"
namespace dft::memory {
void writeMemoryTestComparison(hier::protocol::JsonWriter &,const MemoryTestComparison &,const PinLibrary * = nullptr);
}
