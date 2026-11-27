#pragma once
#include "Boundary.h"
namespace dft::wrapper {
enum class CellDirection { Input, Output, Both };
enum class CellAction { Exclude, Dedicated, Share };
std::string_view cellDirectionName(CellDirection);
std::string_view cellActionName(CellAction);
struct CellRule {
    std::string port;
    CellDirection direction=CellDirection::Both;
    CellAction action=CellAction::Exclude;
    std::optional<hier::model::BitRange> bits;
};
struct CellPolicy {uint64_t maxInputCandidates=4, maxOutputCandidates=1;};
struct CellPlanLimits {uint64_t maxRows=10000, maxWork=1000000, maxMillis=30000;};
struct CellPlanRequest {
    BoundaryRequest boundary;
    CellPolicy policy;
    std::vector<CellRule> rules;
    CellPlanLimits limits;
};
struct CellCandidate {
    std::string signal;
    std::vector<hier::model::BitRange> ranges;
    uint64_t bits=0;
    std::vector<size_t> terminals; // Indices in source.rows[sourceRow].terminals.
};
struct CellPlanRow {
    size_t sourceRow=0;
    std::optional<size_t> rule;
    std::string decision, reason;
    uint64_t candidateBits=0;
    std::vector<CellCandidate> candidates;
};
struct SharedCellSignal {
    std::string signal;
    std::vector<hier::model::BitRange> ranges;
    uint64_t bits=0;
    std::vector<size_t> rows; // Indices in plan.rows, not source rows.
};
struct CellCounts {
    uint64_t inputRows=0,outputRows=0,excluded=0,dedicated=0,sharedCandidate=0,blocked=0;
    uint64_t sharedCandidateBits=0,uniqueSharedBits=0,addedCells=0;
};
struct CellPlanStop {std::string reason;size_t sourceRow=0;};
struct CellPlan {
    CellPolicy policy;
    std::vector<CellRule> rules;
    CellPlanLimits limits;
    bool complete=true;
    uint64_t work=0;
    std::vector<std::string> reasons;
    std::vector<CellPlanRow> rows;
    std::vector<SharedCellSignal> sharedSignals;
    CellCounts counts;
    std::vector<size_t> unusedRules;
    std::optional<CellPlanStop> stop;
};
struct CellPlanReport {BoundaryReport source;CellPlan plan;};
// Structural proposals under explicit policy, not inserted/physically certified cells.
// Borrows Design synchronously, calls the original boundary investigation once, owns all results.
hier::Result<CellPlanReport> planWrapperCells(hier::Design &,const CellPlanRequest &,hier::Cancel = {});
hier::Result<bool> validateCellPlanRequest(const CellPlanRequest &,hier::Cancel = {});
}
