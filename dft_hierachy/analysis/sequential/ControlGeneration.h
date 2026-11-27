#pragma once
#include "ControlSource.h"

namespace dft::sequential {
struct GenerationLimits {
    uint64_t maxControls = 1000, maxGenerators = 1000, maxRegisterFacts = 10000;
    uint64_t maxWork = 1000000, maxDepth = 16, maxCycles = 64, maxMillis = 1000;
    uint64_t maxTraceNodes = 10000, maxTraceEdges = 40000, maxLogicWork = 10000;
};
struct GenerationSeed { size_t check = 0, node = 0; };
struct GenerationNode {
    hier::model::TracePoint point;
    std::string path;
    uint64_t depth = 0;
    std::optional<size_t> originalCheck, generator;
    std::optional<Control> control; // New query only; originalCheck refers to the input report.
    std::optional<ControlSource> source;
    std::vector<std::string> reasons;
};
struct RegisterLookupPage {
    std::string instance, cursor;
    hier::model::QueryResult<hier::Page<hier::model::RegisterInfo>> response;
};
struct GeneratingRegister {
    hier::model::RegisterInfo fact;
    std::string instancePath, signalPath;
    size_t page = 0, item = 0;
    std::optional<size_t> clockNode;
    std::vector<std::optional<size_t>> asyncNodes; // A prefix on truncation, in original event order.
    bool expanded = false;
};
struct GenerationCycle {
    std::vector<size_t> generators; // Closed path: first == last.
    std::vector<size_t> controls; // One original event edge for each adjacent generator pair.
};
struct ControlGeneration {
    std::string snapshotId, scope;
    GenerationLimits limits;
    bool complete = true;
    std::vector<std::string> reasons;
    uint64_t inputChecks = 0, work = 0, registerFacts = 0;
    uint64_t traceNodes = 0, traceEdges = 0, logicWork = 0;
    std::vector<GenerationSeed> seeds;
    std::vector<GenerationNode> nodes;
    std::vector<GeneratingRegister> generators;
    std::vector<RegisterLookupPage> registerPages;
    std::vector<GenerationCycle> cycles;
};
// Borrows the matching Design and its unmodified source report only for this call.
// Owns returned evidence. Indices/context require the same input report to interpret.
// Explains clock/async generation dependencies; never infers a register's Q value.
hier::Result<ControlGeneration> controlGeneration(hier::Design &, const Report &,
    const GenerationLimits & = {}, hier::Cancel = {});
}
