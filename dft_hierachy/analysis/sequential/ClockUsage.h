#pragma once
#include "Check.h"
#include <chrono>

namespace dft::sequential::detail {
// Borrowed Design, request and global work counter live for this synchronous call.
// Only exact structural aliases are traversed; processes are usage boundaries.
ClockUsage clockUsage(hier::Design &, const hier::model::TracePoint &, const Request &,
                      uint64_t &work, std::chrono::steady_clock::time_point deadline, hier::Cancel);
}
