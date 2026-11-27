#pragma once
#include "RegisterSourceAttribution.h"
namespace dft::sequential {
struct RegisterSourceTransitionLimits {
    RegisterSourceAttributionLimits attribution;
    uint64_t maxCohorts=1000,maxMembers=100000,maxSources=100000,maxInputSegments=200000,maxWork=1000000,maxMillis=60000;
};
struct SourceTransitionMember {
    size_t row=0,segment=0; // analysis.comparisons[scenario-1].rows[row].segments[segment].
};
struct SourceTransitionCohort {
    std::vector<size_t> baselineSources,scenarioSources; // Matrix rows: analysis.analysis.analysis.rows.
    bool changed=false; // Difference of the two known source sets, not waveform/DFT equivalence.
    std::vector<SourceTransitionMember> members;
    SourceAttributionCounts counts;
};
struct SourceTransitionComparison {
    size_t scenario=0;
    std::string state="not_run";
    bool inputCollected=false,inputComplete=false,sourcesComplete=false;
    uint64_t inputRows=0,inputSegments=0;
    std::vector<SourceTransitionCohort> cohorts; // Lexicographic (baselineSources, scenarioSources) prefix.
    SourceAttributionCounts totals;
};
struct RegisterSourceTransitionReport {
    RegisterSourceAttributionReport analysis;
    RegisterSourceTransitionLimits limits;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t work=0,inputSegments=0,cohorts=0,members=0,sources=0;
    std::vector<SourceTransitionComparison> comparisons;
};
// Synchronously borrows Design/statistics; owns all analysis/cohort/member/source values on return.
// Groups only the published resolved-source evidence, never guesses pairwise transfers between multi-source sets.
// Empty/retained-only sets under partial input do not prove no source/change. Original fact IDs need statistics.
hier::Result<RegisterSourceTransitionReport> compareRegisterSourceTransitions(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceTransitionLimits & = {},hier::Cancel = {});
}
