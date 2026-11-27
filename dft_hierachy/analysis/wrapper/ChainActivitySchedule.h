#pragma once
#include "ChainActivityPlan.h"
namespace dft::wrapper {
struct ChainActivityPulse {uint64_t setupTicks=1,highTicks=1,lowTicks=1,pulses=1;};
struct ChainActivityScheduleLimits {uint64_t maxRows=1024,maxTicks=9007199254740991ULL,maxWork=1000000,maxMillis=30000;};
struct ChainActivityScheduleRequest {ChainActivityPlanRequest activity;ChainActivityPulse pulse;ChainActivityScheduleLimits limits;};
struct ChainActivityInputHold {size_t input=0;bool high=false;};
struct ChainActivityScheduleRow {
    size_t batch=0;uint64_t start=0,end=0,firstEdge=0,lastEdge=0,lastReturn=0;
    size_t clockGroup=0;bool idleHigh=false,activeHigh=true;uint64_t activeTicks=0,idleTicks=0;
    std::vector<ChainActivityInputHold> holds;
};
struct ChainActivityScheduleCounts {uint64_t batches=0,chains=0,sharedBits=0,elapsedTicks=0;};
struct ChainActivityScheduleStop {std::string reason;size_t batch=0;};
struct ChainActivitySchedule {
    ChainActivityPulse pulse;uint64_t periodTicks=0,batchTicks=0;ChainActivityScheduleLimits limits;
    bool complete=true;uint64_t work=0;std::vector<std::string> reasons;
    std::vector<ChainActivityScheduleRow> rows;ChainActivityScheduleCounts counts;
    std::optional<ChainActivityScheduleStop> stop;
};
struct ChainActivityScheduleReport {ChainActivityPlanReport source;ChainActivitySchedule schedule;};
// Explicit abstract ticks; synchronous borrow of Design, owned evidence. Does not certify test/physical timing.
hier::Result<bool> validateChainActivityScheduleRequest(const ChainActivityScheduleRequest &,hier::Cancel = {});
hier::Result<ChainActivityScheduleReport> scheduleWrapperChainActivity(hier::Design &,const ChainActivityScheduleRequest &,hier::Cancel = {});
}
