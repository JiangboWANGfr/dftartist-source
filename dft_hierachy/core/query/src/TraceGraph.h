#pragma once
#include "hier/model/Trace.h"
#include "hier/model/Result.h"
#include <map>
#include <functional>

namespace hier::detail::tracing {
std::optional<model::BitRange> overlap(model::BitRange, model::BitRange);
model::BitRange project(model::BitRange selected, model::BitRange from, model::BitRange to);
std::vector<model::BitRange> subtract(model::BitRange, model::BitRange);
bool sameObject(const model::TracePoint &, const model::TracePoint &);
std::string pointId(const model::TracePoint &);
std::string nodeId(const model::TraceNode &);
std::string edgeId(const model::TraceEdge &);
model::TraceNode sliceNode(const model::TracePoint &);
struct Link {
    model::TraceNode node;
    model::TraceEdge edge;
};
// Per-query, bounded working graph. Relations are admitted atomically before any
// node/edge is published. Stable identities do not depend on insertion order.
class TraceGraph {
  public:
    explicit TraceGraph(const model::Budget &budget, Cancel cancel)
        : budget_(budget), cancel_(cancel) {}
    model::TraceResult result;
    std::string root(const model::TracePoint &);
    std::string admit(std::vector<Link> &); // Empty on success, otherwise budget reason.
    std::string routes(const model::TracePoint &target, const std::function<bool()> &expired);
    void sort();
  private:
    model::Budget budget_;
    Cancel cancel_;
    std::map<std::string, size_t> nodes_, edges_;
};
} // namespace hier::detail::tracing
