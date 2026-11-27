#pragma once
#include "hier/Design.h"

namespace dft::sequential {
struct StatisticsRequest {
    std::string scope;
    bool recursive = false;
    uint64_t maxFacts = 100000, maxInstances = 100000, maxSignals = 100000;
    uint64_t maxSegments = 200000, maxWork = 1000000, maxMillis = 30000;
};
struct StatisticsTotals {
    uint64_t facts = 0, signals = 0, factBits = 0;
    uint64_t summarizedFacts = 0, summarizedSignals = 0;
    uint64_t coveredBits = 0, overlapBits = 0, maxMultiplicity = 0;
};
struct CoverageSegment { hier::model::BitRange bits; uint64_t factCount = 0; };
struct RegisterCoverage {
    uint64_t coveredBits = 0, overlapBits = 0, maxMultiplicity = 0;
    std::vector<CoverageSegment> segments;
};
struct StatisticsSignal {
    hier::model::ObjectInfo object;
    size_t instance = 0;
    std::vector<size_t> facts;
    std::optional<RegisterCoverage> coverage; // Atomic summary of this signal's collected facts only.
};
struct StatisticsInstance {
    hier::model::InstInfo info;
    size_t definition = 0;
    bool enumerated = false; // All pages visited, not a claim that extraction was complete.
    StatisticsTotals totals;
};
struct StatisticsDefinition {
    std::string ref, name;
    std::vector<size_t> instances;
    StatisticsTotals totals;
};
struct StatisticsPage {
    size_t instance = 0;
    std::string cursor;
    hier::model::QueryResult<hier::Page<hier::model::RegisterInfo>> response;
};
struct StatisticsFact { size_t page = 0, item = 0, signal = 0; };
struct RegisterStatistics {
    StatisticsRequest request;
    hier::model::SnapshotInfo snapshot;
    std::string scope;
    bool complete = true;
    std::vector<std::string> reasons;
    uint64_t returnedFacts = 0, work = 0, segmentCount = 0;
    StatisticsTotals totals;
    std::vector<StatisticsPage> pages;
    std::vector<StatisticsFact> facts;
    std::vector<StatisticsSignal> signals;
    std::vector<StatisticsInstance> instances;
    std::vector<StatisticsDefinition> definitions;
};
// Borrows Design only for this call. All returned facts, metadata and indices are owned.
// Counts collected RTL register write intervals, never physical flip-flops or scan cells.
hier::Result<RegisterStatistics> registerStatistics(hier::Design &, const StatisticsRequest &, hier::Cancel = {});
}
