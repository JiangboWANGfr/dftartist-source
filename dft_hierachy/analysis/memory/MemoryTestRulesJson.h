#pragma once
#include "MemoryTestRules.h"
#include "PinLibrary.h"
#include "hier/protocol/Json.h"
namespace dft::memory {
void writeMemoryTestRules(hier::protocol::JsonWriter &,const MemoryTestRulePlan &,const PinLibrary * = nullptr);
}
