#pragma once
#include "hier/Design.h"
#include "hier/db/DesignDb.h"

namespace hier::detail {
Result<model::QueryResult<Page<model::InstInfo>>>
instancesOf(const Design &design, const db::DesignDb &db, std::string_view definition,
            const PageRequest &page, Cancel cancel);
Result<model::QueryResult<Page<model::ObjectHit>>>
search(const Design &design, const db::DesignDb &db, const model::SearchQuery &query,
       const PageRequest &page, Cancel cancel);
Result<model::QueryResult<std::vector<std::string>>>
resolvePath(const db::DesignDb &db, std::string_view text, Cancel cancel);
} // namespace hier::detail
