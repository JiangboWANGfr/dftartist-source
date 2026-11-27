#pragma once
#include "MemoryTestPlan.h"
#include "PinLibrary.h"
#include "hier/protocol/Json.h"
namespace dft::memory {
// Library is optional provenance supplied by the caller that opened the Design.
void writeMemoryTestPlan(hier::protocol::JsonWriter &,const MemoryTestReport &,const PinLibrary * = nullptr);
}
