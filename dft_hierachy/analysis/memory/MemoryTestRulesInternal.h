#pragma once
#include "MemoryTestRules.h"
namespace dft::memory::detail {
// Trusted investigation from this call, not a public fact import.
MemoryTestRulePlan planInvestigatedMemoriesByRules(MemoryInvestigation,const MemoryTestPlanning &,const std::vector<MemoryTestRule> &,hier::Cancel);
void validateMemoryTestRules(const std::vector<MemoryTestRule> &);
void validateMemoryTestRuleRequest(const MemoryTestRuleRequest &);
}
