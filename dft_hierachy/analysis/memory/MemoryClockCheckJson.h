#pragma once
#include "MemoryClockCheck.h"
#include "MemoryTestDomainsJson.h"
namespace dft::memory {
void writeMemoryClockCheck(hier::protocol::JsonWriter &,const MemoryClockCheckReport &,const PinLibrary * = nullptr);
}
