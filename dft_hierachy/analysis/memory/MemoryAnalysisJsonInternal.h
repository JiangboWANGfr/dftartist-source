#pragma once
#include "MemoryTestAssessment.h"
#include "MemoryTestDomainsJson.h"
#include "MemoryClockCheckJson.h"
namespace dft::memory::detail {
void writeMemoryDomains(hier::protocol::JsonWriter &,const MemoryTestDomains &);
void writeMemoryClockCheck(hier::protocol::JsonWriter &,const MemoryClockCheck &);
void writeMemoryCoverage(hier::protocol::JsonWriter &,const MemoryTestCoverage &);
void writeMemoryAssessment(hier::protocol::JsonWriter &,const MemoryTestAssessment &);
}
