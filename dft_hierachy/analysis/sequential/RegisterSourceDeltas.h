#pragma once
#include "RegisterSourceScenarios.h"
namespace dft::sequential {
struct RegisterSourceDeltaLimits {
    RegisterSourceScenarioLimits scenarios;
    uint64_t maxRows=10000,maxSignals=100000,maxRanges=200000,maxIntervals=200000,maxWork=1000000,maxMillis=60000;
};
struct SourceDeltaCounts {uint64_t baselineBits=0,scenarioBits=0,addedBits=0,removedBits=0,retainedBits=0;};
struct SourceSignalDelta {
    size_t signal=0; // Original statistics signal, not a physical cell.
    std::vector<hier::model::BitRange> added,removed,retained;
    SourceDeltaCounts counts;
};
struct SourceCoverageDelta {std::vector<SourceSignalDelta> signals;SourceDeltaCounts totals;};
struct RegisterSourceDeltaRow {
    size_t matrixRow=0,scenario=0;
    std::string status; // Exactly the original matrix verdict; unresolved never has a delta.
    std::optional<SourceCoverageDelta> delta;
};
struct RegisterSourceDeltaReport {
    RegisterSourceScenarioReport analysis;
    RegisterSourceDeltaLimits limits;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t inputRows=0,inputComparisons=0,work=0,signals=0,ranges=0,intervals=0;
    std::vector<RegisterSourceDeltaRow> rows; // Matrix row first, then scenarios 1..N-1; whole-row atomic.
};
// Borrows Design/statistics only during the call. Owns analysis/delta containers; original fact IDs need the statistics.
// Describes source-specific RTL bit-set change, never physical FF/scan counts or waveform/DFT equivalence.
hier::Result<RegisterSourceDeltaReport> compareRegisterSourceDeltas(hier::Design &,const RegisterStatistics &,
    const RegisterScenarioRequest &,const RegisterSourceDeltaLimits & = {},hier::Cancel = {});
}
