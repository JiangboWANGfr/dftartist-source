#pragma once
#include "ChainResets.h"
namespace dft::wrapper {
struct ChainActivityGroup {std::string name;std::vector<std::string> chains;};
struct ChainCompatibilityLimits {uint64_t maxGroups=1024,maxWork=1000000,maxMillis=30000;};
struct ChainCompatibilityRequest {ChainResetRequest resets;std::vector<ChainActivityGroup> groups;ChainCompatibilityLimits limits;};
struct ResolvedActivityGroup {std::string name;std::vector<size_t> chains;};
struct HeldClock {size_t clockGroup=0,input=0;};
struct ChainCompatibilityRow {
    size_t group=0;bool complete=true;std::string status;
    uint64_t allocatedSharedBits=0,allocatedDedicatedBits=0;
    std::vector<size_t> clockGroups;std::vector<ChainResetHold> holds;std::vector<HeldClock> heldClocks;
    std::vector<std::string> reasons;
};
struct ChainCompatibilityCounts {uint64_t groups=0,compatible=0,conflict=0,unresolved=0,empty=0;};
struct ChainCompatibilityStop {std::string reason;size_t group=0;};
struct ChainCompatibility {
    ChainCompatibilityLimits limits;bool complete=true;uint64_t work=0;
    std::vector<std::string> reasons;std::vector<ResolvedActivityGroup> groups;
    std::vector<ChainCompatibilityRow> rows;ChainCompatibilityCounts counts;
    std::optional<ChainCompatibilityStop> stop;
};
struct ChainCompatibilityReport {ChainResetReport source;ChainCompatibility compatibility;};
// Borrows Design synchronously; owns original evidence. Single functional clock policy, not scan certification.
hier::Result<ChainCompatibilityReport> inspectWrapperChainCompatibility(hier::Design &,const ChainCompatibilityRequest &,hier::Cancel = {});
hier::Result<bool> validateChainCompatibilityRequest(const ChainCompatibilityRequest &,hier::Cancel = {});
}
