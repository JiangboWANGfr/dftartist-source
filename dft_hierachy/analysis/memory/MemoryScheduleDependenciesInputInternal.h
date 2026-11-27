#pragma once
#include "MemoryScheduleDependenciesInput.h"
#include "MemoryInputInternal.h"
namespace dft::memory::detail::input {
std::vector<MemoryScheduleDependency> readMemoryScheduleDependencies(const Value &,hier::Cancel);
}
