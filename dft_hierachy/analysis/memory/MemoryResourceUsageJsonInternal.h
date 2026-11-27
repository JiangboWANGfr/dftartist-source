#pragma once
#include "MemoryResourceUsageJson.h"
namespace dft::memory::detail {
void writeMemoryResourceUsageBody(hier::protocol::JsonWriter &,const MemoryResourceUsage &);
}
