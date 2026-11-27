#pragma once
#include "hier/Design.h"

namespace dft::objects {
enum class Kind { Instance, Port, Signal };
std::string_view kindName(Kind);
struct CatalogLimits {
    uint64_t maxInstances=10000, maxObjects=100000, maxQueries=100000;
    uint64_t maxWork=1000000, maxMillis=30000, pageSize=200;
};
struct CatalogRequest {
    std::string scope, text;
    bool recursive=false;
    std::vector<Kind> kinds{Kind::Instance,Kind::Port,Kind::Signal};
    CatalogLimits limits;
};
struct CatalogInstance {
    hier::model::InstInfo info;
    bool objectsComplete=false, childrenComplete=false;
    // Core connection quality for signals, or explicit unknown blackbox/primitive internals.
    std::optional<hier::model::Completeness> signalStatus;
};
struct CatalogObject {
    Kind kind=Kind::Instance;
    size_t instance=0;
    hier::model::ObjectInfo object; // Original canonical path and occurrence ref, not a synthesized SDC name.
    std::optional<hier::model::PortInfo> port;
    std::optional<hier::model::SignalInfo> signal;
};
struct ObjectCatalog {
    CatalogRequest request;
    hier::model::SnapshotInfo snapshot;
    hier::model::InstInfo scope;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t queries=0, work=0, visitedObjects=0;
    std::vector<CatalogInstance> instances;
    std::vector<CatalogObject> objects;
};
// Synchronous Design borrow. Owns returned Core facts and paths after Design release.
// Explicit scope; literal name/path filter, not SDC/glob/Tcl evaluation. Instance/port/signal
// identities remain distinct. Complete describes this RTL catalog, not timing/physical completeness.
// Soft budgets exclude hard bounds on Core extraction, the whole ports vector or compilation.
hier::Result<ObjectCatalog> enumerateObjects(hier::Design &,const CatalogRequest &,hier::Cancel = {});
}
