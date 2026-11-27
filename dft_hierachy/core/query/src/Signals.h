#pragma once
#include "hier/db/DesignDb.h"

namespace hier::detail {
Result<Page<model::SignalInfo>> signals(const db::DesignDb &, std::string_view,
                                      const PageRequest &, std::string_view filterText, Cancel);
} // namespace hier::detail
