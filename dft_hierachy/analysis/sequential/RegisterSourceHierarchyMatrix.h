#pragma once
#include "RegisterSourceHierarchy.h"
namespace dft::sequential {
struct RegisterSourceHierarchyMatrixLimits {
    RegisterSourceHierarchyLimits hierarchy;
    uint64_t maxRows=10000,maxMembers=200000,maxInputNodes=10000,maxInputMembers=200000,maxWork=1000000,maxMillis=60000;
};
enum class SourceHierarchyRole {Added,Removed,Retained};
const char *sourceHierarchyRoleName(SourceHierarchyRole);
struct SourceHierarchyMatrixMember {
    size_t row=0,segment=0; // Original attribution, four analysis layers below this report.
    SourceHierarchyRole role=SourceHierarchyRole::Retained;
};
struct SourceHierarchyMatrixRow {
    size_t source=0,node=0; // Original source matrix (six analysis layers) and analysis.comparisons[scenario-1].nodes.
    std::vector<SourceHierarchyMatrixMember> members; // Original row/segment ascending; unique within this pair.
    SourceDeltaCounts counts;
};
struct SourceHierarchyMatrixComparison {
    size_t scenario=0;
    std::string state="not_run";
    bool inputCollected=false,inputComplete=false,sourcesComplete=false;
    uint64_t inputNodes=0,inputMembers=0;
    std::vector<SourceHierarchyMatrixRow> rows; // Complete (source,node) lexicographic prefix.
};
struct RegisterSourceHierarchyMatrixReport {
    RegisterSourceHierarchyReport analysis;
    RegisterSourceHierarchyMatrixLimits limits;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t work=0,inputNodes=0,inputMembers=0,rows=0,members=0;
    std::vector<SourceHierarchyMatrixComparison> comparisons;
};
// Borrows Design/statistics synchronously; owns every new value and original analysis on return.
// Sources can share bits and ancestor nodes repeat descendants: rows must not be added as global unique bits.
// Only the published resolved evidence domain is projected, never a physical FF/scan/DFT or no-change proof.
hier::Result<RegisterSourceHierarchyMatrixReport> compareRegisterSourceHierarchyMatrix(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceHierarchyMatrixLimits & = {},hier::Cancel = {});
}
