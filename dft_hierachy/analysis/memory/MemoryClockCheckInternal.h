#pragma once
#include "MemoryClockCheck.h"
namespace dft::memory::detail {
void validateMemoryClockExpectations(const std::vector<MemoryClockExpectation> &,hier::Cancel = {});
void validateMemoryClockCheckRequest(const MemoryClockCheckRequest &,hier::Cancel = {});
// Consume trusted same-call facts and already validated declarations.
MemoryClockCheck evaluateMemoryClockExpectations(const MemoryTestDomains &,const MemoryClocks &,const std::vector<MemoryClockExpectation> &,hier::Cancel);
}
