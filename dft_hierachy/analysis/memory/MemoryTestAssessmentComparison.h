#pragma once
#include "MemoryTestAssessment.h"
#include "MemoryTestComparison.h"
namespace dft::memory {
struct MemoryTestAssessmentComparisonRequest {
    MemoryTestComparisonRequest tests;
    MemoryClockLimits clockLimits;
    std::vector<std::vector<MemoryClockExpectation>> expectations; // Same order as tests.configurations.
};
struct MemoryTestAssessmentCase {
    MemoryTestCoverage coverage;
    MemoryTestDomains domains;
    MemoryClockCheck check;
    MemoryTestAssessment assessment;
};
struct MemoryTestAssessmentDelta { int64_t satisfiedInstances=0, blockedInstances=0, pendingInstances=0; };
struct MemoryTestAssessmentTransition { size_t macro=0; std::string referenceStatus, status; };
struct MemoryTestAssessmentComparisonRow {
    bool comparable=false;
    std::optional<MemoryTestAssessmentDelta> delta;
    std::vector<MemoryTestAssessmentTransition> transitions;
};
struct MemoryTestAssessmentComparison {
    MemoryTestComparison source;
    MemoryClockLimits clockLimits;
    MemoryClocks clocks;
    std::vector<MemoryTestAssessmentCase> configurations;
    bool complete=true;
    std::vector<MemoryTestAssessmentComparisonRow> rows;
};
// One investigation and one clock resolution; all facts/results owned.
// Design is borrowed synchronously. No ranking or physical equivalence implied.
hier::Result<MemoryTestAssessmentComparison> compareMemoryTestAssessments(hier::Design &,const MemoryTestAssessmentComparisonRequest &,hier::Cancel = {});
}
