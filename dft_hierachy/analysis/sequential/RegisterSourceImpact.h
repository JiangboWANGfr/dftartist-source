#pragma once
#include "RegisterSourceTransitions.h"
namespace dft::sequential {
struct RegisterSourceImpactLimits {
    RegisterSourceTransitionLimits transitions;
    uint64_t maxInstances=10000,maxDefinitions=10000,maxMembers=200000,maxInputMembers=200000,maxWork=1000000,maxMillis=60000;
};
struct SourceImpactMember {size_t cohort=0,member=0;}; // Original analysis.comparisons[scenario-1].cohorts[cohort].members[member].
struct SourceImpactInstance {
    size_t instance=0,definition=0; // Original statistics indices, not physical cells.
    std::vector<SourceImpactMember> members;
    SourceAttributionCounts counts;
};
struct SourceImpactDefinition {
    size_t definition=0;
    std::vector<size_t> instances; // Original statistics instances, only the published instance rows.
    SourceAttributionCounts counts;
};
struct SourceImpactComparison {
    size_t scenario=0;
    std::string state="not_run";
    bool inputCollected=false,inputComplete=false,sourcesComplete=false;
    uint64_t inputCohorts=0,inputMembers=0;
    std::vector<SourceImpactInstance> instances; // Original instance order; atomic with definition aggregation.
    std::vector<SourceImpactDefinition> definitions; // Original definition order, only the instance prefix above.
    SourceAttributionCounts totals;
};
struct RegisterSourceImpactReport {
    RegisterSourceTransitionReport analysis;
    RegisterSourceImpactLimits limits;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t work=0,inputMembers=0,instanceRows=0,definitionRows=0,members=0;
    std::vector<SourceImpactComparison> comparisons;
};
// Borrows Design/statistics synchronously; owns analysis/instance/definition/member values on return.
// The two summaries describe the same published evidence: never add their totals together or deduplicate
// different instances just because they share a definition. Original fact indices still need statistics.
hier::Result<RegisterSourceImpactReport> compareRegisterSourceImpact(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceImpactLimits & = {},hier::Cancel = {});
}
