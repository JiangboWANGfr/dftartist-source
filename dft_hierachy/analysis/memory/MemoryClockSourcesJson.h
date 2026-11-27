#pragma once
#include "MemoryClockSources.h"
#include "MemoryMapJson.h"
#include "PinLibraryJson.h"
namespace dft::memory {
void writeMemoryClockSources(hier::protocol::JsonWriter &,const MemoryClockReport &,const PinLibrary * = nullptr);
void writeMemoryClocks(hier::protocol::JsonWriter &,const MemoryClocks &);
}
