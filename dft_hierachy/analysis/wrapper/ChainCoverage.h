#pragma once
#include "ChainPlan.h"
namespace dft::wrapper {
struct ChainCoverageLimits {uint64_t maxRows=10000,maxPositions=10000,maxWork=1000000,maxMillis=30000;};
struct ChainCoverageRequest {ChainPlanRequest chains;ChainCoverageLimits limits;};
struct CoveragePosition {
    size_t use=0,chain=0,segment=0;
    std::string kind;
    uint64_t chainOffset=0,width=0;
    std::optional<std::string> signal;
    std::optional<hier::model::BitRange> bits;
};
struct ChainCoverageRow {
    size_t sourceRow=0; // BoundaryReport.rows, not CellPlan.rows.
    std::optional<size_t> cellRow,chainRow;
    std::string stage,status,reason;
    std::vector<CoveragePosition> positions;
};
struct ChainCoverageCounts {uint64_t rows=0,placed=0,excluded=0,blocked=0,pending=0,positions=0;};
struct PortCoverage {size_t port=0;bool upstream=false;ChainCoverageCounts counts;};
struct ChainCoverageStop {std::string reason;size_t sourceRow=0;};
struct ChainCoverage {
    ChainCoverageLimits limits;
    bool complete=true;
    uint64_t work=0;
    std::vector<std::string> reasons;
    std::vector<ChainCoverageRow> rows;
    ChainCoverageCounts counts;
    std::vector<PortCoverage> ports;
    std::optional<ChainCoverageStop> stop;
};
struct ChainCoverageReport {ChainPlanReport source;ChainCoverage coverage;};
// Borrows Design synchronously; owns the original plan and all coverage links/positions.
// Describes investigated bit/direction rows, not physical test coverage.
hier::Result<ChainCoverageReport> inspectWrapperCoverage(hier::Design &,const ChainCoverageRequest &,hier::Cancel = {});
hier::Result<bool> validateChainCoverageRequest(const ChainCoverageRequest &,hier::Cancel = {});
}
