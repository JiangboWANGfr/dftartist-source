#pragma once
#include "ChainClocks.h"
namespace dft::wrapper {
struct ChainResetLimits {uint64_t maxRows=10000,maxEvents=100000,maxWork=1000000,maxDepth=64,maxMillis=30000;};
struct ChainResetRequest {ChainClockRequest clock;ChainResetLimits limits;};
struct ChainResetInput {hier::model::TracePoint point;std::string sourceRef;};
struct ChainResetCheck {
    hier::model::EventInfo event;
    std::string status="unresolved",reason;
    std::optional<sequential::LogicProof> proof;
    std::optional<size_t> input;
    std::optional<bool> high;
};
struct ChainResetEvent {size_t match=0,event=0,check=0;};
struct ChainResetHold {size_t input=0;bool low=false,high=false;};
struct ChainResetRow {
    size_t chain=0,segment=0;std::optional<size_t> sourceRow;
    bool complete=true;std::string status,reason;
    std::vector<ChainResetEvent> events;std::vector<ChainResetHold> holds;
};
struct ChainResetSummary {
    size_t chain=0;uint64_t processedSegments=0,clearBits=0,holdBits=0,conflictBits=0,assertedBits=0,unresolvedBits=0,pendingBits=0,dedicatedBits=0;
    bool complete=true;std::string status="empty";std::vector<ChainResetHold> holds;
};
struct ChainResetStop {std::string reason;size_t chain=0,segment=0;};
struct ChainResets {
    ChainResetLimits limits;bool complete=true;uint64_t work=0,events=0;
    std::vector<std::string> reasons;
    std::vector<ChainResetInput> inputs;
    std::vector<ChainResetCheck> checks;
    std::vector<ChainResetRow> rows;
    std::vector<ChainResetSummary> chains;
    std::optional<ChainResetStop> stop;
};
struct ChainResetReport {ChainClockReport source;ChainResets resets;};
// Borrows Design synchronously, owns source facts and proofs. Async inactive constraints only.
hier::Result<ChainResetReport> inspectWrapperChainResets(hier::Design &,const ChainResetRequest &,hier::Cancel = {});
hier::Result<bool> validateChainResetRequest(const ChainResetRequest &,hier::Cancel = {});
}
