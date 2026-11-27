#pragma once
#include "hier/model/Connections.h"

namespace hier::model {
enum class TraceDirection { Back, Forward };
enum class TracePolicy { Structural, Combinational, Full };
struct Budget {
    int64_t maxNodes = 1000, maxEdges = 4000, maxDepth = 64;
    std::optional<int64_t> maxMillis;
};
struct TraceNode {
    std::string id, kind;
    std::optional<TracePoint> point;
    std::optional<std::string> ref, fact, value, reason;
};
struct TraceEdge {
    std::string id, fact, from, to;
    std::optional<std::string> via;
    std::string kind, role = "data", precision = "exact", align = "bitwise";
    std::optional<BitRange> fromBits, toBits;
    std::vector<BitMapSegment> map;
};
struct TraceFrontier {
    TracePoint point;
    uint64_t depth = 0;
    std::string reason;
    std::optional<std::string> stepCursor;
};
struct TraceResult {
    std::vector<TraceNode> nodes;
    std::vector<TraceEdge> edges;
    std::vector<TraceFrontier> frontier;
    bool hasConservative = false;
};
} // namespace hier::model
