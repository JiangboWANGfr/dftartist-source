#pragma once
#include "MemoryMap.h"
#include <chrono>
namespace dft::memory::detail {
void validateMemoryMapRequest(const MemoryMapRequest &);
hier::Result<MemoryMap> mapMemoriesWithDeadline(const MacroInterfaces &,const MemoryMapRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
