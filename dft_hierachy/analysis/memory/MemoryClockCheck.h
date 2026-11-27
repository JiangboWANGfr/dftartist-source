#pragma once
#include "MemoryTestDomains.h"
namespace dft::memory {
struct MemoryClockSourceSpec { std::string path; uint64_t bit=0; std::string edge; };
struct MemoryClockExpectation { std::string clockDomain; std::vector<MemoryClockSourceSpec> sources; };
struct MemoryClockCheckRequest { MemoryTestDomainRequest domains; std::vector<MemoryClockExpectation> expectations; };
struct MemoryClockCheckRow {
    size_t row=0; // source.domains.rows index
    std::string status, reason;
    std::optional<size_t> expectation, source; // request index, local allowed source index
};
struct MemoryClockCheck {
    std::vector<MemoryClockExpectation> request;
    bool complete=true;
    std::string verdict;
    std::vector<std::string> reasons;
    uint64_t matchedInstances=0, mismatchedInstances=0, unresolvedInstances=0, unconstrainedInstances=0, unassignedInstances=0;
    std::vector<MemoryClockCheckRow> rows;
    std::vector<size_t> unusedExpectations;
};
struct MemoryClockCheckReport { MemoryTestDomainReport source; MemoryClockCheck check; };
// Synchronously borrows Design; owns evidence and declarations. An RTL-source
// allowlist check, not a proof of test-clock switching or electrical feasibility.
hier::Result<MemoryClockCheckReport> checkMemoryClockSources(hier::Design &,const MemoryClockCheckRequest &,hier::Cancel = {});
}
