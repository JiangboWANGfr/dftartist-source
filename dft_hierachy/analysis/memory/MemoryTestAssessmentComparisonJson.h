#pragma once
#include "MemoryTestAssessmentComparison.h"
#include "MemoryTestComparisonJson.h"
namespace dft::memory {
void writeMemoryTestAssessmentComparison(hier::protocol::JsonWriter &,const MemoryTestAssessmentComparison &,const PinLibrary * = nullptr);
}
