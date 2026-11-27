#pragma once
#include "hier/Design.h"
#include "hier/db/DesignDb.h"

namespace hier::detail {
Result<model::QueryResult<std::vector<model::Endpoint>>>
connections(const Design &, const db::DesignDb &, std::string_view,
            const ConnectionRequest &, bool upstream, Cancel);
} // namespace hier::detail
