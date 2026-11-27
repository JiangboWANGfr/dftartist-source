#pragma once
#include "RegisterGenerationScenarios.h"
#include "RegisterControlSources.h"
namespace dft::sequential {
struct RegisterSourceScenarioLimits {
    RegisterGenerationScenarioLimits generation;
    RegisterSourceLimits sources;
    uint64_t maxRows=10000,maxCells=100000,maxIntervals=200000,maxWork=1000000,maxMillis=60000;
};
struct RegisterSourceContext {
    std::optional<RegisterControlSources> sources;
    std::vector<std::string> reasons;
};
struct RegisterSourceMatrixRow {
    ControlSource source;
    std::vector<std::optional<size_t>> groups; // Each context's source group; null is unknown unless that context is complete.
    std::vector<std::string> status; // Baseline context 0 versus contexts 1..N-1, by state-bit union only.
};
struct RegisterSourceScenarioReport {
    RegisterGenerationScenarioReport analysis;
    RegisterSourceScenarioLimits limits;
    bool complete=true,indexComplete=true;
    std::vector<std::string> reasons;
    std::vector<RegisterSourceContext> scenarios;
    uint64_t inputSources=0,indexedGroups=0,work=0,cells=0,intervals=0;
    std::vector<RegisterSourceMatrixRow> rows;
};
// Borrows Design/statistics during the synchronous call; owns all new context/path/source/matrix values.
// Original fact indices still need those statistics. Coverage change is not waveform or DFT equivalence.
hier::Result<RegisterSourceScenarioReport> compareRegisterSourceScenarios(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceScenarioLimits & = {},hier::Cancel = {});
}
