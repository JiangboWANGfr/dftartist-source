#pragma once
#include "MemoryClockSources.h"
#include "MemoryTestRules.h"
#include <variant>
namespace dft::memory {
struct MemoryTestDomainRequest {
    MemoryTestRequest test;
    std::optional<std::vector<MemoryTestRule>> rules;
    MemoryClockLimits limits;
};
struct MemoryTestDomainRow {
    size_t memory=0; // original mapping index
    std::optional<size_t> assignment, domain, clock; // original assignment, domain group, clock row
};
struct MemoryTestDomainGroup {
    std::string clockDomain, status;
    std::vector<size_t> members, clockGroups, controllers; // rows, clocks.groups, original plan.controllers
    uint64_t resolvedInstances=0;
    bool sourcesComplete=false; // observed members only
};
struct MemoryTestDomains {
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t assignedInstances=0, resolvedInstances=0;
    std::vector<size_t> unassignedMemories;
    std::vector<MemoryTestDomainRow> rows;
    std::vector<MemoryTestDomainGroup> groups;
};
struct MemoryTestDomainReport {
    std::variant<MemoryTestReport,MemoryTestRulePlan> source;
    MemoryClockLimits limits;
    MemoryClocks clocks;
    MemoryTestDomains domains;
};
// Borrows Design synchronously, owns the original plan and all evidence.
// Mixed RTL sources are an observation, not an invalidation of declared test domains.
hier::Result<MemoryTestDomainReport> inspectMemoryTestDomains(hier::Design &,const MemoryTestDomainRequest &,hier::Cancel = {});
}
