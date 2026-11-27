#pragma once
#include "ObjectCatalog.h"
namespace dft::memory {
struct MacroLimits {
    uint64_t maxMacros=1000,maxPins=10000,maxBindings=20000,maxQueries=100000;
    uint64_t maxWork=1000000,maxMillis=30000,maxTraceNodes=10000,maxTraceEdges=40000,maxDepth=64;
};
struct MacroRequest {
    std::string scope;
    bool recursive=false;
    std::vector<std::string> definitionNames,clockPins;
    objects::CatalogLimits traversal;
    MacroLimits limits;
};
struct MacroPin {
    hier::model::PortInfo port;
    hier::model::ObjectInfo object;
    std::vector<hier::model::PinBinding> bindings;
    std::optional<hier::model::QueryResult<hier::model::TraceResult>> clock;
};
struct MacroInterface {
    size_t instance=0; // Index in this report's catalog.instances, never a definition index.
    std::optional<hier::model::InstInfo> parent;
    std::optional<hier::model::Completeness> parentStatus;
    std::vector<MacroPin> pins;
    std::vector<std::string> missingClockPins;
};
struct MacroInterfaces {
    MacroRequest request;
    objects::ObjectCatalog catalog;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t queries=0,work=0,traceNodes=0,traceEdges=0;
    std::vector<MacroInterface> macros;
};
// Owns all returned facts. Definition names identify caller-selected candidates, not proven RAMs.
// Two soft budget stages, no hard bound on Core extraction / entire ports or bindings vectors.
hier::Result<MacroInterfaces> inspectMacroInterfaces(hier::Design &,const MacroRequest &,hier::Cancel = {});
}
