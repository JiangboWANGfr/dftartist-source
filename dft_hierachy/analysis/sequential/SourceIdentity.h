#pragma once
#include "ControlSource.h"
#include <functional>
#include <tuple>

namespace dft::sequential::detail {
using SourcePointKey = std::tuple<std::string, uint64_t, uint64_t, std::optional<std::string>>;
using SourceKey = std::tuple<std::string, std::optional<SourcePointKey>, std::optional<std::string>, std::optional<std::string>, bool>;
SourceKey sourceKey(const ControlSource &);
bool sameSource(const ControlSource &, const ControlSource &);
// Borrows control and continuation only during projection. A false continuation
// stops graph scans; a known logic result needs no graph scan.
std::optional<ControlSource> projectSource(const Control &, const std::function<bool()> &);
}
