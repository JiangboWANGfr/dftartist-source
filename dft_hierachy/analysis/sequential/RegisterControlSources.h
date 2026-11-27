#pragma once
#include "RegisterFanout.h"
namespace dft::sequential {
struct RegisterSourceLimits {
    RegisterFanoutLimits fanout;
    uint64_t maxRows=10000,maxSources=1000,maxMembers=100000,maxSegments=200000;
    uint64_t maxOverlapMembers=100000,maxWork=1000000,maxMillis=30000;
};
struct RegisterSourceRow {
    size_t node=0; // Index in fanout.nodes, not the original generation graph.
    std::string kind; // Proven primary_input/constant/undriven/generated, or unresolved.
    std::optional<size_t> group; // Only proven terminal sources have a group.
};
struct RegisterSourceGroup {
    ControlSource source; // Complete proven identity, including inversion; never a physical clock domain.
    std::vector<size_t> nodes,rawGroups; // fanout.nodes and original profile.events.groups respectively.
    bool membersComplete=true; // Only the published nodes and their captured raw groups.
    std::vector<std::string> reasons;
    std::vector<RegisterFactCoverage> signals;
    StatisticsTotals totals;
};
struct RegisterControlSources {
    std::string snapshotId,scope;
    RegisterSourceLimits limits;
    RegisterFanout fanout; // Owns the original path and attribution evidence.
    bool complete=true,attributionsComplete=true;
    std::vector<std::string> reasons;
    uint64_t inputNodes=0,work=0,memberFacts=0,segmentCount=0,overlapMembers=0;
    uint64_t attributionSignals=0,checkedSignals=0,crossGroupBits=0;
    std::vector<RegisterSourceRow> rows;
    std::vector<RegisterSourceGroup> groups;
    std::vector<SignalEventAttribution> attributions; // groups index this report; signal indexes original statistics.
};
// Borrows matching unmodified inputs only during this synchronous call, never queries Design.
// Owns fanout/source/index/coverage values; original graph/event/fact indices need the input reports.
hier::Result<RegisterControlSources> summarizeRegisterControlSources(const RegisterStatistics &,const RegisterControlProfile &,
    const RegisterGeneration &,const RegisterSourceLimits & = {},hier::Cancel = {});
}
