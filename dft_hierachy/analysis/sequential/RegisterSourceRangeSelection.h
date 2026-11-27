#pragma once
#include "RegisterSourceHierarchyRanges.h"
namespace dft::sequential {
struct SourceRangeQuery {
    size_t scenario=1; // Original comparison against baseline scenario 0.
    std::optional<size_t> source,signal; // Original source matrix/statistics indices; no match is valid.
    std::optional<std::string> node; // Exact canonical Core pathText, never a path prefix or guessed ancestry.
    std::optional<SourceHierarchyRole> role;
    std::optional<hier::model::BitRange> bits; // Half-open window; applies independently to each state signal.
};
struct SourceRangeSelectionLimits {
    uint64_t maxRows=10000,maxRanges=200000,maxMembers=200000,maxWork=1000000,maxMillis=60000;
};
struct SourceRangeSelectionRow {
    size_t rangeRow=0,rangeSignal=0; // Indices into input.comparisons[query.scenario-1].rows[rangeRow].signals.
    SourceHierarchySignalRanges value; // Selected roles/window only; members remain original matrix-row member indices.
};
struct SourceRangeSelection {
    SourceRangeQuery query;
    SourceRangeSelectionLimits limits;
    bool complete=true,inputComplete=false,sourcesComplete=false;
    std::vector<std::string> reasons;
    uint64_t inputRows=0,visitedRows=0,work=0,ranges=0,members=0;
    std::vector<SourceRangeSelectionRow> rows; // Complete matching signal prefix in original row/signal order.
};
// Borrows an unmodified producer report synchronously, never queries Design. Results own all new values;
// their indices still require that original report. Design/statistics may already have been released.
// Partial/no match is not a no-change or DFT proof. Source/ancestor records overlap: never sum globally.
hier::Result<SourceRangeSelection> selectRegisterSourceHierarchyRanges(const RegisterSourceHierarchyRangeReport &,
    const SourceRangeQuery & = {},const SourceRangeSelectionLimits & = {},hier::Cancel = {});
}
