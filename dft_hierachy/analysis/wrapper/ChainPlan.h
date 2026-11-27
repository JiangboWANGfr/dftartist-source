#pragma once
#include "CellPlan.h"
namespace dft::wrapper {
struct ChainDeclaration {std::string name;uint64_t capacity=1;};
struct ChainAssignment {
    std::string port;
    CellDirection direction=CellDirection::Both;
    std::optional<hier::model::BitRange> bits;
    std::string chain;
};
struct ChainLimits {uint64_t maxRows=10000,maxSegments=10000,maxWork=1000000,maxMillis=30000;};
struct ChainPlanRequest {
    CellPlanRequest cells;
    std::vector<ChainDeclaration> chains;
    std::vector<ChainAssignment> assignments;
    std::optional<std::string> defaultChain;
    ChainLimits limits;
};
struct ChainSegment {
    std::string kind;
    uint64_t offset=0,length=0;
    size_t sourceRow=0; // First allocating row in source.plan.rows.
    std::optional<std::string> signal;
    std::optional<hier::model::BitRange> bits;
};
struct PlannedChain {std::string name;uint64_t capacity=0,length=0;std::vector<ChainSegment> segments;};
struct ChainUse {size_t segment=0;uint64_t offset=0,width=0;}; // Segment-local offset.
struct ChainRow {
    size_t sourceRow=0;
    std::optional<size_t> assignment,chain;
    std::string status,reason;
    uint64_t newBits=0,reusedBits=0;
    std::vector<ChainUse> uses;
};
struct ChainCounts {uint64_t rows=0,placed=0,excluded=0,blocked=0,dedicatedBits=0,sharedBits=0,reusedBits=0,totalBits=0;};
struct ChainStop {std::string reason;size_t sourceRow=0;};
struct ChainLayout {
    std::vector<PlannedChain> chains;
    std::vector<ChainAssignment> assignments;
    std::optional<std::string> defaultChain;
    ChainLimits limits;
    bool complete=true;
    uint64_t work=0;
    std::vector<std::string> reasons;
    std::vector<ChainRow> rows;
    ChainCounts counts;
    std::vector<size_t> unusedAssignments;
    std::optional<ChainStop> stop;
};
struct ChainPlanReport {CellPlanReport source;ChainLayout layout;};
// Borrows Design during this synchronous call; owns the original cell plan and logical positions.
// Does not insert RTL or certify scan/clock compatibility.
hier::Result<ChainPlanReport> planWrapperChains(hier::Design &,const ChainPlanRequest &,hier::Cancel = {});
hier::Result<bool> validateChainPlanRequest(const ChainPlanRequest &,hier::Cancel = {});
}
