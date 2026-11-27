#pragma once
#include "MemoryInvestigation.h"
namespace dft::memory {
struct MemoryTestProfile {
    std::string definitionName;
    uint64_t operationsPerWord=0, powerMicrowatts=0;
};
struct MemoryTestAssignment { std::string instancePath, clockDomain, partition; };
struct MemoryTestPolicy {
    uint64_t maxMemoriesPerController=64, maxParallelMemories=4, maxPowerMicrowatts=500000;
};
struct MemoryTestLimits { uint64_t maxControllers=1000, maxWork=100000, maxMillis=1000; };
struct MemoryTestPlanning {
    std::vector<MemoryTestProfile> profiles;
    std::vector<MemoryTestAssignment> assignments;
    MemoryTestPolicy policy;
    MemoryTestLimits limits;
};
struct MemoryTestRequest { MemoryInvestigationRequest investigation; MemoryTestPlanning planning; };
struct PlannedMemory {
    size_t memory=0; // investigation.mapping.memories index
    std::optional<size_t> assignment, controller, step; // step is local to controller
    std::string status, reason; // scheduled/blocked; empty reason for scheduled
};
struct MemoryTestStep {
    std::vector<size_t> memories; // plan.memories indices
    std::vector<std::string> reasons;
    uint64_t cycles=0, powerMicrowatts=0;
};
struct MemoryTestController {
    size_t model=0, profile=0;
    std::string clockDomain, partition, reason;
    std::vector<MemoryTestStep> steps;
    uint64_t cycles=0, peakPowerMicrowatts=0;
};
struct MemoryTestPlan {
    MemoryTestPlanning request;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t work=0, visitedMemories=0, scheduledInstances=0, scheduledCapacityBits=0;
    std::vector<PlannedMemory> memories;
    std::vector<MemoryTestController> controllers;
    std::vector<size_t> unusedAssignments;
};
struct MemoryTestReport { MemoryInvestigation investigation; MemoryTestPlan plan; };
// Synchronous Design borrow. Owns the full investigation and conditional schedule.
// Clock domains, operations and power are caller declarations, not measured facts.
// Does not generate a test algorithm/RTL or certify RAM function/testability.
hier::Result<MemoryTestReport> planMemoryTests(hier::Design &,const MemoryTestRequest &,hier::Cancel = {});
}
