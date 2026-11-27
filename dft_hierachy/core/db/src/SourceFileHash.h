#pragma once
#include "hier/db/SourceIndex.h"

namespace hier::db {
// Internal L2 boundary: reads current disk bytes, preserving the owning reader's
// diagnostics. Returns a digest only after a complete successful read.
Result<std::string> hashSourceFile(const SourceFile &file, Cancel cancel);
} // namespace hier::db
