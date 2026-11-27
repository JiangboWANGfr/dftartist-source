#pragma once
#include "hier/Design.h"

namespace dft::wrapper {
struct BoundaryLimits {
    uint64_t maxPorts=10000, maxBits=10000, maxWork=1000000;
    uint64_t maxDepth=64, maxMillis=30000, pageSize=64;
};
struct BoundaryRequest {
    std::string scope;
    std::vector<std::string> ports;
    BoundaryLimits limits;
};
struct BoundaryStep {
    hier::model::TracePoint point;
    hier::model::QueryResult<hier::model::StepResult> response;
};
struct BoundaryTerminal {
    std::string kind;
    size_t step=0;
    std::optional<size_t> hop, continuation;
};
struct BoundaryProcess {
    size_t step=0, hop=0;
    hier::model::QueryResult<hier::model::ProcessInfo> response;
};
struct BoundaryRow {
    size_t port=0;
    uint64_t bit=0;
    bool upstream=false, complete=true, hasConservative=false;
    std::string summary;
    std::vector<std::string> reasons;
    std::vector<BoundaryStep> steps;
    std::vector<BoundaryProcess> processes;
    std::vector<BoundaryTerminal> terminals;
};
struct BoundaryStop {
    std::string reason;
    std::optional<size_t> port;
    std::optional<uint64_t> bit;
    std::optional<bool> upstream;
};
struct BoundaryReport {
    BoundaryRequest request;
    hier::model::SnapshotInfo snapshot;
    hier::model::InstInfo scope;
    bool complete=true;
    uint64_t work=0;
    std::vector<std::string> reasons;
    std::vector<hier::model::PortInfo> ports;
    std::vector<size_t> unsupportedPorts;
    std::vector<BoundaryRow> rows;
    std::optional<BoundaryStop> stop;
};
// Synchronous Design borrow; all returned facts/evidence are owned. Structural
// investigation only, not a scan-cell insertion or functional reachability proof.
hier::Result<BoundaryReport> investigateBoundary(hier::Design &,const BoundaryRequest &,hier::Cancel = {});
hier::Result<bool> validateBoundaryRequest(const BoundaryRequest &,hier::Cancel = {});
}
