#pragma once
#include "MemoryTestDomains.h"
#include "PinLibraryJson.h"
namespace dft::memory {
void writeMemoryTestDomains(hier::protocol::JsonWriter &,const MemoryTestDomainReport &,const PinLibrary * = nullptr);
}
