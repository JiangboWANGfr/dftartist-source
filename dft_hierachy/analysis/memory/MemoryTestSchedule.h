#pragma once
#include "MemoryTestRules.h"
#include <variant>
namespace dft::memory {
struct MemorySchedulePolicy { uint64_t maxParallelControllers=4, maxPowerMicrowatts=500000; };
struct MemoryScheduleLimits { uint64_t maxWaves=10000, maxWork=1000000, maxMillis=1000; };
struct MemoryResourceDomainUnits { std::string clockDomain; uint64_t units=1; };
// Each controller reserves its domain demand (default one) for the whole wave.
// Multiple resources apply simultaneously; domain labels are explicit declarations.
struct MemoryResourceUnavailableInterval { uint64_t startPicoseconds=0, endPicoseconds=0; };
struct MemoryScheduleResource {
    std::string name;
    uint64_t maxParallelControllers=1;
    std::vector<std::string> clockDomains;
    uint64_t recoveryPicoseconds=0; // After a used wave's barrier, before reuse.
    uint64_t maxPowerMicrowatts=0; // Zero disables this resource's extra power ceiling.
    uint64_t maxUnits=0; // Zero disables the independent unit ceiling.
    std::vector<MemoryResourceDomainUnits> domainUnits{};
    std::vector<MemoryResourceUnavailableInterval> unavailableIntervals{};
    std::vector<std::string> partitions{}; // Empty means all; {""} selects only the empty partition.
};
// All matching published controllers in before finish before matching after starts.
struct MemoryScheduleDependency {
    std::string before, after;
    uint64_t minimumGapPicoseconds=0;
    std::vector<std::string> beforePartitions{}, afterPartitions{}; // Empty selects all.
};
struct MemoryTestScheduling {
    MemorySchedulePolicy policy;
    MemoryScheduleLimits limits;
    std::vector<MemoryScheduleResource> resources;
    std::vector<MemoryScheduleDependency> dependencies;
};
struct MemoryTestScheduleRequest {
    MemoryTestRequest test;
    std::optional<std::vector<MemoryTestRule>> rules;
    MemoryTestScheduling scheduling;
};
struct MemoryWaveEntry { size_t controller=0, step=0; };
struct MemoryTestWave { std::vector<MemoryWaveEntry> entries; uint64_t powerMicrowatts=0; };
struct MemoryControllerProgress {
    size_t nextStep=0;
    std::string status="pending", reason;
    std::optional<size_t> dependency; // original request index, only dependency blocks
    std::optional<size_t> resource; // original request index, only resource power/unit blocks
};
struct MemoryTestSchedule {
    MemoryTestScheduling request;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t work=0, scheduledSteps=0, scheduledInstances=0, scheduledCapacityBits=0;
    std::vector<MemoryControllerProgress> controllers; // source plan controller order
    std::vector<MemoryTestWave> waves;
};
struct MemoryTestScheduleReport {
    std::variant<MemoryTestReport,MemoryTestRulePlan> source;
    MemoryTestSchedule schedule;
};
// Owned conditional execution batches; one actual investigation through the
// existing planner. A barrier between batches is an execution assumption, not
// an implemented protocol. No cross-domain time or physical-power inference.
hier::Result<MemoryTestScheduleReport> scheduleMemoryTests(hier::Design &,const MemoryTestScheduleRequest &,hier::Cancel = {});
}
