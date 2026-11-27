#pragma once
#include "MemoryInvestigation.h"
#include "Check.h"
namespace dft::memory {
struct MemoryClockLimits { uint64_t maxWork=1000000, maxDepth=64, maxMillis=1000; };
struct MemoryClockRequest { MemoryInvestigationRequest investigation; MemoryClockLimits limits; };
struct MemoryClockRow {
    size_t memory=0, macro=0;
    std::string status, reason;
    std::optional<size_t> pin, group;
    std::optional<sequential::LogicProof> proof;
};
struct MemoryClockGroup {
    hier::model::TracePoint point;
    std::string path, edge;
    std::vector<size_t> members; // indices in clocks.rows
};
struct MemoryClocks {
    bool complete=true;
    uint64_t work=0, resolvedInstances=0;
    std::vector<std::string> reasons;
    std::vector<MemoryClockRow> rows;
    std::vector<MemoryClockGroup> groups;
};
struct MemoryClockReport { MemoryInvestigation source; MemoryClockLimits limits; MemoryClocks clocks; };
// Synchronously borrows Design; returns owning investigation and raw logic proofs.
// Groups describe RTL source bits/effective edges, not physical or test clock domains.
hier::Result<MemoryClockReport> inspectMemoryClockSources(hier::Design &,const MemoryClockRequest &,hier::Cancel = {});
}
