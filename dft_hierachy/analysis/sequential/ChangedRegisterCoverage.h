#pragma once
#include "RegisterScenarios.h"
#include <functional>
#include <span>
namespace dft::sequential::detail {
// All references/callback captures are borrowed synchronously, never stored in a result.
struct ChangedRegisterCoverage {
    const RegisterStatistics &statistics;
    const RegisterEventGroups &events;
    std::vector<RegisterChangedSignal> &signals;
    StatisticsTotals &totals;
    uint64_t maxMembers, maxSegments;
    uint64_t &memberFacts, &segmentCount;
    std::function<bool()> spend;
    std::function<void(const std::string &)> partial, incomplete;
    std::string membersReason = "changed_members_unfinished", coverageReason = "changed_coverage_unfinished";
};
void collectChangedFacts(ChangedRegisterCoverage &, std::span<const size_t>);
void summarizeChangedFacts(ChangedRegisterCoverage &);
}
