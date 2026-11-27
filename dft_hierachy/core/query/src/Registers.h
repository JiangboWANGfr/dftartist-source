#pragma once
#include "hier/db/DesignDb.h"

namespace hier::detail {
Result<model::QueryResult<Page<model::RegisterInfo>>>
registers(const db::DesignDb &, std::string_view, const PageRequest &, bool recursive, Cancel);
} // namespace hier::detail
