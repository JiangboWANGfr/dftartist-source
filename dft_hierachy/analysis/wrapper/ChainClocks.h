#pragma once
#include "ChainPlan.h"
#include "Check.h"
namespace dft::wrapper {
struct ChainClockLimits {uint64_t maxRows=10000,maxRegisters=10000,maxWork=1000000,maxDepth=64,maxMillis=30000,pageSize=64;};
struct ChainClockRequest {ChainPlanRequest chains;ChainClockLimits limits;};
struct ChainClockPage {std::string inst;hier::model::QueryResult<hier::Page<hier::model::RegisterInfo>> response;};
struct ChainClockGroup {hier::model::TracePoint point;std::string sourceRef,edge;};
struct ChainClockCheck {
    hier::model::EventInfo event;
    std::string status="unresolved",reason;
    std::optional<sequential::LogicProof> proof;
    std::optional<size_t> group;
};
struct ChainClockMatch {size_t page=0,fact=0;hier::model::BitRange bits;std::optional<size_t> check,group;};
struct ChainClockRow {size_t chain=0,segment=0;std::string status,reason;std::vector<ChainClockMatch> matches;std::vector<size_t> groups;};
struct ChainClockSummary {
    size_t chain=0;uint64_t processedSegments=0,resolvedBits=0,unresolvedBits=0,dedicatedBits=0;
    std::vector<size_t> groups;std::string status="empty";
};
struct ChainClockStop {std::string reason;size_t chain=0,segment=0;};
struct ChainClocks {
    ChainClockLimits limits;bool complete=true;uint64_t work=0,registers=0;
    std::vector<std::string> reasons;
    std::vector<ChainClockPage> pages;
    std::vector<ChainClockCheck> checks;
    std::vector<ChainClockGroup> groups;
    std::vector<ChainClockRow> rows;
    std::vector<ChainClockSummary> chains;
    std::optional<ChainClockStop> stop;
};
struct ChainClockReport {ChainPlanReport source;ChainClocks clocks;};
// Synchronous borrowed Design; owns original plan and clock evidence. Functional clocks only.
hier::Result<ChainClockReport> inspectWrapperChainClocks(hier::Design &,const ChainClockRequest &,hier::Cancel = {});
hier::Result<bool> validateChainClockRequest(const ChainClockRequest &,hier::Cancel = {});
}
