#pragma once
#include "MemoryScheduleResourcesInput.h"
#include "MemoryInputInternal.h"
namespace dft::memory::detail::input {
std::vector<MemoryScheduleResource> readMemoryScheduleResources(const Value &,hier::Cancel);
}
