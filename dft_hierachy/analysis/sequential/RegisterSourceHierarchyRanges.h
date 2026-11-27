#pragma once
#include "RegisterSourceHierarchyMatrix.h"
namespace dft::sequential {
struct RegisterSourceHierarchyRangeLimits {
    RegisterSourceHierarchyMatrixLimits matrix;
    uint64_t maxRows=10000,maxSignals=100000,maxRanges=200000,maxMembers=200000,maxWork=1000000,maxMillis=60000;
};
struct SourceHierarchySignalRanges {
    size_t signal=0; // Original statistics signal, not a physical cell.
    std::vector<hier::model::BitRange> added,removed,retained; // Sorted, disjoint within each role; adjacent ranges merged.
    SourceDeltaCounts counts;
    std::vector<size_t> members; // Indices into the original matrix row.members, including all coalesced evidence.
};
struct SourceHierarchyRangeRow {
    size_t matrixRow=0; // analysis.comparisons[scenario-1].rows: authoritative source/node identity and counts.
    std::vector<SourceHierarchySignalRanges> signals; // Original signal order; complete pair atomic.
};
struct SourceHierarchyRangeComparison {
    size_t scenario=0;
    std::string state="not_run";
    bool inputComplete=false,sourcesComplete=false;
    uint64_t inputRows=0;
    std::vector<SourceHierarchyRangeRow> rows; // Original matrix row prefix.
};
struct RegisterSourceHierarchyRangeReport {
    RegisterSourceHierarchyMatrixReport analysis;
    RegisterSourceHierarchyRangeLimits limits;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t work=0,rows=0,signals=0,ranges=0,members=0;
    std::vector<SourceHierarchyRangeComparison> comparisons;
};
// Borrows Design/statistics synchronously; owns all new ranges/references and the original analysis on return.
// Rows overlap across sources/ancestors: do not sum as global unique state bits. Partial/empty is no DFT proof.
hier::Result<RegisterSourceHierarchyRangeReport> expandRegisterSourceHierarchyRanges(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceHierarchyRangeLimits & = {},hier::Cancel = {});
}
