#pragma once
#include "MemoryTestPlan.h"
namespace dft::memory {
struct MemoryTestRule {
    std::vector<std::string> path; // Exact unescaped Core InstInfo.path segments.
    bool recursive=false;
    std::string clockDomain, partition;
};
struct MemoryTestRuleRequest { MemoryTestRequest test; std::vector<MemoryTestRule> rules; };
struct MemoryTestRuleChoice {
    size_t memory=0; // report.investigation.mapping.memories index
    std::optional<size_t> rule, assignment; // rules and report.plan.request.assignments
};
struct MemoryTestRulePlan {
    std::vector<MemoryTestRule> rules;
    std::vector<MemoryTestRuleChoice> choices;
    std::vector<size_t> unusedRules;
    uint64_t visitedSegments=0;
    MemoryTestReport report;
};
// One investigation, explicit hierarchical allocation, then the original planner.
// Owns all facts and declarations; final completeness is report.plan.complete.
hier::Result<MemoryTestRulePlan> planMemoryTestsByRules(hier::Design &,const MemoryTestRuleRequest &,hier::Cancel = {});
}
