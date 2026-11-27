#pragma once
#include "Check.h"
#include <chrono>
#include <set>

namespace dft::sequential::detail {
LogicProof resolveSource(hier::Design &, const hier::model::TracePoint &, const Request &,
                         const std::set<std::string> &tops, uint64_t &work,
                         std::chrono::steady_clock::time_point deadline, hier::Cancel,
                         const std::vector<ClockRoot> &roots = {}, const std::vector<InputValue> &inputs = {});
} // namespace dft::sequential::detail
