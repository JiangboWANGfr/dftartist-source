#pragma once
#include "MemoryMap.h"
#include "MacroInterfacesJson.h"
namespace dft::memory { void writeMemoryMap(hier::protocol::JsonWriter &,const MacroInterfaces &,const MemoryMap &); }
