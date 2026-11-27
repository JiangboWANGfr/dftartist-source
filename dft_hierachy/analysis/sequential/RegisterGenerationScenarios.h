#pragma once
#include "RegisterGeneration.h"
#include "RegisterScenarios.h"
#include "GenerationComparison.h"
namespace dft::sequential {
struct RegisterGenerationScenarioLimits {
    RegisterGenerationLimits generation;
    GenerationComparisonLimits comparison;
    uint64_t maxMillis = 60000, maxRows = 10000, maxEvents = 100000, maxWork = 1000000;
    uint64_t maxMembers = 100000, maxSegments = 200000;
};
struct RegisterGenerationScenario {
    std::optional<RegisterGeneration> generation;
    std::vector<std::string> reasons;
};
struct RegisterGenerationImpactRow {
    size_t rawGroup = 0;
    std::string status;
    std::vector<std::optional<size_t>> events; // Structure comparison controls, clock then original async order.
    std::vector<std::string> reasons;
};
struct RegisterGenerationImpact {
    size_t baseline = 0, scenario = 0;
    uint64_t inputGroups = 0;
    bool complete = true;
    std::vector<std::string> reasons;
    std::vector<RegisterGenerationImpactRow> rows;
    std::vector<RegisterChangedSignal> changedSignals;
    StatisticsTotals changedTotals; // Per-comparison original state-bit union, not physical cells or batch unique bits.
};
struct RegisterGenerationScenarioReport {
    RegisterScenarioReport analysis;
    RegisterGenerationScenarioLimits limits;
    bool complete = true;
    std::vector<std::string> reasons;
    std::vector<RegisterGenerationScenario> scenarios;
    GenerationComparisonReport structure;
    uint64_t rows = 0, eventEntries = 0, work = 0, memberFacts = 0, segmentCount = 0;
    std::vector<RegisterGenerationImpact> impacts;
};
// Borrows the matching Design/statistics during this call. Owns all new contexts/proofs/indices.
// Fact indices require the original statistics. Compares proven structure, not Q values or waveform/DFT equivalence.
hier::Result<RegisterGenerationScenarioReport> compareRegisterGenerationScenarios(hier::Design &, const RegisterStatistics &,
    const RegisterScenarioRequest &, const RegisterGenerationScenarioLimits & = {}, hier::Cancel = {});
}
