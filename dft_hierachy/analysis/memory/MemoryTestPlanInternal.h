#pragma once
#include "MemoryTestPlan.h"
#include <chrono>
namespace dft::memory::detail {
void validateMemoryTestPlanning(const std::vector<MemoryModel> &,const MemoryTestPlanning &);
void validateMemoryTestRequest(const MemoryTestRequest &);
// Internal trusted investigation from the same call; never a public fact import.
MemoryTestPlan planInvestigatedMemories(const MemoryInvestigation &,const MemoryTestPlanning &,hier::Cancel);
// Deterministic soft scheduling deadline seam; investigation still uses its own budgets.
hier::Result<MemoryTestReport> planMemoryTestsWithDeadline(hier::Design &,const MemoryTestRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
