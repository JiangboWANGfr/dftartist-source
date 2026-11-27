#pragma once
#include "MemoryTestSchedule.h"
#include <chrono>
namespace dft::memory::detail {
// Trusted same-call producer; no external report import.
MemoryTestSchedule schedulePlannedMemories(const MemoryTestReport &,const MemoryTestScheduling &,hier::Cancel,std::optional<std::chrono::steady_clock::time_point> = {});
void validateMemoryTestScheduleRequest(const MemoryTestScheduleRequest &);
// Deterministic expired deadline, same private pattern as the original planner.
hier::Result<MemoryTestScheduleReport> scheduleMemoryTestsWithDeadline(hier::Design &,const MemoryTestScheduleRequest &,std::chrono::steady_clock::time_point,hier::Cancel = {});
}
