#pragma once
#include "MemoryTestCoverage.h"
#include "MemoryClockCheck.h"
namespace dft::memory {
struct MemoryTestAssessmentRequest {
    MemoryTestTimingRequest test;
    MemoryClockLimits clockLimits;
    std::vector<MemoryClockExpectation> expectations;
};
struct MemoryTestAssessmentRow {
    size_t macro=0; // Also the original coverage row index.
    std::optional<size_t> clockCheck; // check.rows; absent before mapping publication.
    std::string status;
    std::vector<std::string> issues;
};
struct MemoryTestAssessment {
    bool complete=true;
    std::string verdict;
    std::vector<std::string> reasons;
    uint64_t satisfiedInstances=0, blockedInstances=0, pendingInstances=0;
    std::vector<MemoryTestAssessmentRow> rows;
};
struct MemoryTestAssessmentReport {
    MemoryTestCoverageReport source;
    MemoryClockLimits clockLimits;
    MemoryClocks clocks;
    MemoryTestDomains domains;
    MemoryClockCheck check;
    MemoryTestAssessment assessment;
};
// Synchronous Design borrow; owns the one original investigation and all results.
// Satisfied declarations do not prove electrical safety or an executable MBIST design.
hier::Result<MemoryTestAssessmentReport> assessMemoryTests(hier::Design &,const MemoryTestAssessmentRequest &,hier::Cancel = {});
}
