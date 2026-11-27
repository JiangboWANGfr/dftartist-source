#pragma once
#include "MemoryTestTiming.h"
#include "PinLibrary.h"
#include "hier/protocol/Json.h"
namespace dft::memory {
void writeMemoryTestTiming(hier::protocol::JsonWriter &,const MemoryTestTimingReport &,const PinLibrary * = nullptr);
}
