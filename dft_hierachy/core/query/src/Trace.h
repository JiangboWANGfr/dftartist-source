#pragma once
#include "hier/Design.h"
#include "hier/db/DesignDb.h"

namespace hier::detail {
struct TraceSelection {
    std::string ref;
    std::optional<model::BitRange> bits;
    std::optional<std::string> side;
    bool unknownWidth = false; // Explicit TracePoint permits {0,0} only for opaque objects.
};
Result<model::QueryResult<model::TraceResult>>
trace(const db::DesignDb &, const TraceSelection &, const std::optional<TraceSelection> &target,
      model::TraceDirection, model::TracePolicy, const model::Budget &, Cancel);
} // namespace hier::detail
