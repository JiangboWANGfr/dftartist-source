#pragma once
#include "MemoryInputInternal.h"
#include "MemoryTestRules.h"
namespace dft::memory::detail::input {
std::vector<MemoryTestRule> readMemoryTestRules(const Value &,hier::Cancel);
}
