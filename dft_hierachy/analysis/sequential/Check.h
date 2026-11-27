#pragma once
#include "hier/Design.h"

namespace dft::sequential {
struct PrimaryInputRequest { std::string path; uint64_t bit = 0; };
struct PrimaryInputBit { hier::model::TracePoint point; std::string path; };
using ClockRootInput = PrimaryInputRequest;
using ClockRoot = PrimaryInputBit;
struct InputValueRequest { PrimaryInputRequest input; bool high = false; };
struct InputValue { PrimaryInputBit input; bool high = false; };
struct Request {
    std::string scope;
    bool recursive = false;
    uint64_t maxFacts = 10000, maxInstances = 10000, maxChecks = 1000;
    uint64_t maxTraceNodes = 10000, maxTraceEdges = 40000, maxDepth = 64, maxMillis = 30000;
    bool resolveLogic = false;
    uint64_t maxLogicWork = 10000;
    bool analyzeClockUsage = false;
    uint64_t maxUsageWork = 10000;
    std::vector<ClockRootInput> clockRoots = {};
    std::vector<InputValueRequest> inputValues = {};
};
struct Record {
    hier::model::RegisterInfo fact;
    std::string instancePath, signalPath;
    std::optional<hier::model::SourceSpan> source;
    std::optional<std::string> sourceUnavailable;
    std::optional<size_t> clockCheck;
    std::vector<std::optional<size_t>> asyncChecks;
};
struct LogicValue {
    std::string verdict = "unknown";
    std::optional<hier::model::TracePoint> origin;
    std::optional<std::string> sourceRef, value;
    uint64_t inversions = 0;
    std::optional<size_t> gate;
};
struct Gate {
    std::string op, process;
    hier::model::TracePoint point;
    std::vector<size_t> exprPath;
    uint64_t bit = 0;
    LogicValue clock, enable;
};
struct LogicStep {
    hier::model::TracePoint point;
    hier::model::QueryResult<hier::model::StepResult> response;
};
struct LogicProof {
    LogicValue result;
    uint64_t work = 0;
    std::vector<std::string> reasons;
    std::vector<LogicStep> steps;
    std::vector<hier::model::QueryResult<hier::model::ProcessInfo>> processes;
    std::vector<Gate> gates;
    std::vector<size_t> appliedInputs;
};
struct Control {
    hier::model::TracePoint point;
    std::string path, verdict = "unknown";
    std::vector<std::string> reasons;
    std::optional<hier::model::QueryResult<hier::model::TraceResult>> trace;
    std::optional<LogicProof> logic;
};
struct Finding { std::string rule; size_t check = 0; std::string severity = "error"; };
struct UsageStep {
    hier::model::TracePoint point;
    bool upstream = false;
    hier::model::QueryResult<hier::model::StepResult> response;
};
struct UsageWitness { size_t step = 0, hop = 0, continuation = 0; std::string role; };
struct ClockUsage {
    size_t check = 0;
    bool complete = true;
    uint64_t work = 0;
    std::vector<std::string> reasons;
    std::vector<UsageStep> steps;
    std::vector<UsageWitness> witnesses;
};
struct Report {
    Request request;
    std::string scope;
    hier::model::SnapshotInfo snapshot;
    bool complete = true;
    uint64_t visitedInstances = 0, traceNodes = 0, traceEdges = 0, logicWork = 0;
    std::vector<std::string> reasons;
    std::vector<Record> registers;
    std::vector<Control> checks;
    std::vector<Finding> findings;
    std::vector<ClockUsage> clockUsage;
    std::vector<ClockRoot> clockRoots;
    std::vector<InputValue> inputValues;
};

// Borrows Design only for this call. No process, global cache or Slang object is owned.
// Cancellation/errors return an Error, never a successful partial Report.
hier::Result<Report> analyze(hier::Design &, const Request &, hier::Cancel = {});
} // namespace dft::sequential
