#pragma once
#include "ControlGeneration.h"
#include "RegisterControlProfile.h"
namespace dft::sequential {
struct RegisterGenerationLimits {
    GenerationLimits generation;
    uint64_t maxEvents = 100000, maxWork = 1000000, maxMillis = 30000;
};
struct RegisterGenerationEvent {
    size_t rawGroup = 0;
    std::optional<size_t> asyncIndex; // Null for clock; otherwise the original ordered async index.
    std::optional<size_t> check, node; // Profile check and generation seed, respectively.
    std::vector<std::string> reasons;
};
struct RegisterGeneration {
    ControlGeneration graph;
    RegisterGenerationLimits limits;
    bool complete = true, mappingComplete = true;
    std::vector<std::string> reasons;
    uint64_t inputEvents = 0, work = 0;
    std::vector<RegisterGenerationEvent> events; // Original raw-group / clock-then-async prefix.
};
// Borrows a matching, unmodified statistics/profile from this Design during the call.
// Owns its graph/evidence/mappings; original check/fact indices still require the input reports.
// Can discover generating registers outside the statistics scope; never infers Q values or waveform/DFT safety.
hier::Result<RegisterGeneration> registerControlGeneration(hier::Design &, const RegisterStatistics &,
    const RegisterControlProfile &, const RegisterGenerationLimits & = {}, hier::Cancel = {});
}
