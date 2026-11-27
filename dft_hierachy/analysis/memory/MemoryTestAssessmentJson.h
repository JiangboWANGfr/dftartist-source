#pragma once
#include "MemoryTestAssessment.h"
#include "MemoryTestCoverageJson.h"
namespace dft::memory {
void writeMemoryTestAssessment(hier::protocol::JsonWriter &,const MemoryTestAssessmentReport &,const PinLibrary * = nullptr);
}
