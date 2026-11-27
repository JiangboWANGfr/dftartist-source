#pragma once
#include "RegisterGeneration.h"
#include "RegisterFactCoverage.h"
namespace dft::sequential {
struct RegisterFanoutLimits {
    uint64_t maxOrigins = 100000, maxSeeds = 1000, maxNodes = 10000, maxLinks = 100000;
    uint64_t maxMembers = 100000, maxSegments = 200000, maxWork = 1000000, maxMillis = 30000;
};
struct FanoutOrigin {size_t event = 0;std::optional<size_t> seed;};
struct FanoutStep {
    size_t node = 0;
    std::optional<size_t> parent, generator, asyncIndex; // Parent is a step of this seed; null asyncIndex is clock.
};
struct FanoutSeed {
    size_t check = 0, node = 0;
    bool traversalComplete = true;
    std::vector<std::string> reasons;
    std::vector<size_t> origins;
    std::vector<FanoutStep> steps; // First shortest path to each visited node; cycles do not repeat nodes.
};
struct FanoutReach {size_t seed = 0, step = 0;};
struct FanoutNode {
    size_t node = 0;
    bool membersComplete = true; // Only the published reaches and collected origins, never whole-design coverage.
    std::vector<std::string> reasons;
    std::vector<FanoutReach> reaches;
    std::vector<size_t> rawGroups;
    std::vector<RegisterFactCoverage> signals;
    StatisticsTotals totals; // Per-node RTL state-bit union, not physical fanout/FF/scan cells.
};
struct RegisterFanout {
    std::string snapshotId, scope;
    RegisterFanoutLimits limits;
    bool complete = true;
    std::vector<std::string> reasons;
    uint64_t inputOrigins = 0, inputSeeds = 0, inputNodes = 0, relevantSeeds = 0;
    uint64_t work = 0, links = 0, memberFacts = 0, segmentCount = 0;
    std::vector<FanoutOrigin> origins;
    std::vector<FanoutSeed> seeds;
    std::vector<FanoutNode> nodes; // Only discovered nodes, not fabricated zero-fanout entries for unvisited nodes.
};
// Only borrows matching, unmodified input reports during the call; never queries Design.
// Owns paths/index containers/coverage. Original graph/event/fact indices require those same input reports.
hier::Result<RegisterFanout> registerGenerationFanout(const RegisterStatistics &,const RegisterControlProfile &,
    const RegisterGeneration &,const RegisterFanoutLimits & = {},hier::Cancel = {});
}
