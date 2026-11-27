#pragma once
#include "RegisterControlSources.h"
#include <functional>
#include <map>
#include <span>
#include <optional>
namespace dft::sequential::detail {
using CanonicalInterval=std::pair<uint64_t,uint64_t>; // lsb,width of a state-bit union, without write multiplicity.
using CanonicalIntervals=std::vector<CanonicalInterval>;
using CanonicalSourceCoverage=std::map<size_t,CanonicalIntervals>;
// A complete source group's signal coverages are known. Output starts empty; callbacks are borrowed synchronously.
bool canonicalSourceCoverage(const RegisterSourceGroup &,CanonicalSourceCoverage &,
    const std::function<bool()> &tick,const std::function<bool()> &admitInterval);
struct SourceIntervalPartition {std::vector<hier::model::BitRange> added,removed,retained;};
// Append an ascending disjoint range, coalescing adjacency; admission only charges a new range.
bool appendCanonicalRange(std::vector<hier::model::BitRange> &,const hier::model::BitRange &,const std::function<bool()> &);
// Inputs are sorted, disjoint canonical unions. One endpoint sweep, including uint64_t maximum endpoints.
std::optional<SourceIntervalPartition> partitionSourceIntervals(std::span<const CanonicalInterval> baseline,
    std::span<const CanonicalInterval> scenario,const std::function<bool()> &tick,const std::function<bool()> &admitRange);
}
