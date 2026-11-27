#pragma once
#include "MemoryTestCoverage.h"
#include "MemoryTestTimingJson.h"
namespace dft::memory {
void writeMemoryTestCoverage(hier::protocol::JsonWriter &,const MemoryTestCoverageReport &,const PinLibrary * = nullptr);
}
