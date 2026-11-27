#pragma once
#include "MemoryTestTiming.h"
#include <chrono>
namespace dft::memory::detail {
// Trusted same-call producer; no external report import.
MemoryTestTimeline timeScheduledMemories(const MemoryTestScheduleReport &,const MemoryTestTiming &,hier::Cancel,std::optional<std::chrono::steady_clock::time_point> = {});
void validateMemoryTestTimingRequest(const MemoryTestTimingRequest &,hier::Cancel = {});
// Private deterministic deadline, same convention as planning and scheduling.
hier::Result<MemoryTestTimingReport> timeMemoryTestsWithDeadline(hier::Design &,const MemoryTestTimingRequest &,std::chrono::steady_clock::time_point,hier::Cancel = {});
}
