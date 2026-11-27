#pragma once
#include "MemoryClockSources.h"
namespace dft::memory::detail {
// Shared pre-query validation for public API and CLI; throws hier::Error.
void validateMemoryClockRequest(const MemoryClockRequest &);
// Borrow trusted investigation produced by this API family; throws hier::Error.
MemoryClocks resolveMemoryClocks(hier::Design &,const MemoryInvestigation &,const MemoryClockLimits &,hier::Cancel);
}
