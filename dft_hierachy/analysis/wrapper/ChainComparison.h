#pragma once
#include "ChainPlan.h"
namespace dft::wrapper {
struct NamedChainRequest {std::string name;ChainPlanRequest request;};
struct ChainComparisonLimits {uint64_t maxChains=10000,maxWork=1000000,maxMillis=30000;};
struct ChainComparisonRequest {
    std::vector<NamedChainRequest> configurations;
    size_t reference=0;
    ChainComparisonLimits limits;
};
struct NamedChainResult {std::string name;CellPlan plan;ChainLayout layout;};
struct ChainCountsDelta {
    int64_t rows=0,placed=0,excluded=0,blocked=0,dedicatedBits=0,sharedBits=0,reusedBits=0,totalBits=0;
};
struct ChainComparisonSummary {
    size_t configuration=0;
    bool comparable=false;
    std::optional<ChainCountsDelta> delta;
};
struct ChainSizeDelta {int64_t capacity=0,length=0;};
struct ChainComparisonEntry {
    size_t configuration=0;
    std::optional<size_t> chain;
    std::string presence;
    bool comparable=false;
    std::optional<ChainSizeDelta> delta;
};
struct ComparedChain {
    std::string name;
    std::optional<size_t> referenceChain;
    std::vector<ChainComparisonEntry> entries;
};
struct ChainComparisonStop {std::string reason;size_t chain=0;};
struct ChainComparisonReport {
    BoundaryReport source;
    std::vector<NamedChainResult> configurations;
    size_t reference=0;
    ChainComparisonLimits limits;
    bool complete=true;
    uint64_t work=0;
    std::vector<std::string> reasons;
    std::vector<ChainComparisonSummary> summaries;
    std::vector<ComparedChain> chains;
    std::optional<ChainComparisonStop> stop;
};
// Borrows one Design synchronously. Investigates once, owns all plans and comparisons.
// Structural resource comparison only; does not certify equivalent physical chains.
hier::Result<ChainComparisonReport> compareWrapperChains(hier::Design &,const ChainComparisonRequest &,hier::Cancel = {});
hier::Result<bool> validateChainComparisonRequest(const ChainComparisonRequest &,hier::Cancel = {});
}
