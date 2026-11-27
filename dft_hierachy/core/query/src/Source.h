#pragma once
#include "hier/db/DesignDb.h"

namespace hier::detail {
Result<model::SourceSpan> source(const db::DesignDb &, std::string_view, model::SourceKind,
                                 Cancel = {});
Result<model::QueryResult<Page<model::SourceHit>>>
resolveSource(const db::DesignDb &, std::string_view, size_t, std::optional<size_t>,
              const PageRequest &, Cancel);
Result<model::SourceRead> readSource(const db::DesignDb &, std::string_view, Cancel);
Result<model::InputCheck> checkInputs(const db::DesignDb &, Cancel);
} // namespace hier::detail
