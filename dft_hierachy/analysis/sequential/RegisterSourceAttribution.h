#pragma once
#include "RegisterSourceDeltas.h"
namespace dft::sequential {
struct RegisterSourceAttributionLimits {
    RegisterSourceDeltaLimits deltas;
    uint64_t maxRows=10000,maxIntervals=200000,maxSegments=200000,maxMembers=1000000,maxWork=1000000,maxMillis=60000;
};
struct SourceAttributionCounts {uint64_t coveredBits=0,changedBits=0,retainedOnlyBits=0;};
struct SourceAttributionSegment {
    hier::model::BitRange bits;
    std::vector<size_t> addedRows,removedRows,retainedRows; // Indices into analysis.rows, all for this comparison.
};
struct SourceAttributionRow {
    size_t signal=0; // Original statistics signal.
    std::vector<SourceAttributionSegment> segments;
    SourceAttributionCounts counts;
};
struct SourceAttributionComparison {
    size_t scenario=0;
    std::string state="not_run"; // complete, partial, not_run; complete requires sourcesComplete.
    bool inputCollected=false,sourcesComplete=false;
    uint64_t resolvedRows=0,unresolvedRows=0,missingRows=0;
    std::vector<SourceAttributionRow> rows; // Original signal order; whole-signal atomic.
    SourceAttributionCounts totals;
};
struct RegisterSourceAttributionReport {
    RegisterSourceDeltaReport analysis;
    RegisterSourceAttributionLimits limits;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t work=0,intervals=0,rows=0,segments=0,members=0;
    std::vector<SourceAttributionComparison> comparisons;
};
// Borrows Design/statistics synchronously; owns analysis/segments/row references on return.
// Counts only the published, resolved-source evidence domain. Retained-only bits are not a no-change proof
// when sourcesComplete is false. Original facts still need statistics; never physical FF/scan counts.
hier::Result<RegisterSourceAttributionReport> compareRegisterSourceAttribution(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceAttributionLimits & = {},hier::Cancel = {});
}
