#pragma once
#include "MemoryTestDomains.h"
namespace dft::memory::detail {
void validateMemoryTestDomainRequest(const MemoryTestDomainRequest &); // throws hier::Error
// Trusted facts from one original planner call; not an external report API.
MemoryTestDomains associateMemoryDomains(const MemoryTestReport &,const MemoryClocks &,hier::Cancel);
}
