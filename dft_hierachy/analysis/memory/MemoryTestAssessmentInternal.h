#pragma once
#include "MemoryTestAssessment.h"
namespace dft::memory::detail {
void validateMemoryTestAssessmentRequest(const MemoryTestAssessmentRequest &,hier::Cancel = {});
MemoryTestAssessment assessMemoryCoverage(const MemoryTestCoverage &,const MemoryTestReport &,const MemoryTestDomains &,const MemoryClockCheck &,hier::Cancel = {});
}
