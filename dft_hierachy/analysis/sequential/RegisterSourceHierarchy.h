#pragma once
#include "RegisterSourceImpact.h"
namespace dft::sequential {
struct RegisterSourceHierarchyLimits {
    RegisterSourceImpactLimits impact;
    uint64_t maxQueries=10000,maxAncestors=200000,maxNodes=10000,maxMembers=200000,maxWork=1000000,maxMillis=60000;
};
struct SourceHierarchyNode {
    hier::model::InstInfo info; // Owned authoritative Core navigation metadata.
    std::optional<std::string> parent; // Direct in-scope instance parent ref; null for scope.
    uint64_t depth=0; // Instance edges, not path-component depth.
    std::optional<size_t> local; // Original impact instance row for this node, when published there.
    std::vector<size_t> members; // Original impact instance rows in this subtree, sorted and unique.
    SourceAttributionCounts counts;
};
struct SourceHierarchyComparison {
    size_t scenario=0;
    std::string state="not_run";
    bool inputCollected=false,inputComplete=false,sourcesComplete=false;
    uint64_t inputRows=0;
    std::vector<SourceHierarchyNode> nodes; // Core path-vector lexicographic prefix; parents before children.
    SourceAttributionCounts totals; // Published scope node only, never the sum of overlapping subtrees.
};
struct RegisterSourceHierarchyReport {
    RegisterSourceImpactReport analysis;
    RegisterSourceHierarchyLimits limits;
    std::optional<hier::model::InstInfo> scope; // Omitted for an unvisited empty partial prefix: no navigation is charged.
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t queries=0,ancestorEntries=0,work=0,nodeRows=0,members=0;
    std::vector<SourceHierarchyComparison> comparisons;
};
// Borrows Design/statistics only synchronously; owns analysis/navigation/node/member values on return.
// Different levels contain the same state bits: do not add subtree counts. Scope/zero/partial are not DFT proofs.
hier::Result<RegisterSourceHierarchyReport> compareRegisterSourceHierarchy(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceHierarchyLimits & = {},hier::Cancel = {});
}
