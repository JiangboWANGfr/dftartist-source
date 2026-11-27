#pragma once
#include "ChainCompatibility.h"
namespace dft::wrapper {
struct ChainActivityPlanLimits {
    uint64_t maxBatches=1024,maxChainsPerBatch=1024,maxSharedBitsPerBatch=9007199254740991ULL;
    uint64_t maxWork=1000000,maxMillis=30000;
};
struct ChainActivityPlanRequest {ChainResetRequest resets;ChainCompatibilityLimits inspection;ChainActivityPlanLimits limits;};
struct ChainActivityBatch {
    std::vector<size_t> chains;uint64_t sharedBits=0;size_t clockGroup=0;std::vector<ChainResetHold> holds;
};
struct ChainActivityRow {size_t chain=0;std::string status;std::optional<size_t> sourceRow,batch;};
struct ChainActivityCounts {
    uint64_t chains=0,assigned=0,conflict=0,unresolved=0,empty=0,oversized=0,pending=0,assignedSharedBits=0;
};
struct ChainActivityStop {std::string reason;size_t chain=0;};
struct ChainActivityPlan {
    ChainActivityPlanLimits limits;bool complete=true;uint64_t work=0;std::vector<std::string> reasons;
    std::vector<ChainActivityRow> rows;std::vector<ChainActivityBatch> batches;ChainActivityCounts counts;
    std::optional<ChainActivityStop> stop;
};
struct ChainActivityPlanReport {ChainCompatibilityReport source;ChainActivityPlan activity;};
// Synchronous borrow of Design; report owns all original evidence. Greedy functional groups, not a test schedule.
hier::Result<bool> validateChainActivityPlanRequest(const ChainActivityPlanRequest &,hier::Cancel = {});
hier::Result<ChainActivityPlanReport> planWrapperChainActivity(hier::Design &,const ChainActivityPlanRequest &,hier::Cancel = {});
}
