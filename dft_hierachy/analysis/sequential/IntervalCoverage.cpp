#include "IntervalCoverage.h"
#include <algorithm>
#include <limits>
#include <map>
namespace dft::sequential::detail {
using namespace hier;
using namespace hier::model;
uint64_t checkedCountAdd(uint64_t a, uint64_t b) {
    if (b > std::numeric_limits<uint64_t>::max() - a)
        throw Error{ErrorCode::Unsupported, "Register statistics integer range exceeded"};
    return a + b;
}
uint64_t intervalEnd(const BitRange &b) {
    if (!b.width) throw Error{ErrorCode::Internal, "Register fact has an empty bit range"};
    return checkedCountAdd(b.lsb, b.width);
}
std::optional<RegisterCoverage> coverageForIntervals(std::span<const BitRange> ranges, uint64_t capacity,
    const std::function<bool()> &tick) {
    std::map<uint64_t, int64_t> events;
    for (const auto &bits : ranges) { if (!tick()) return {}; const auto last = intervalEnd(bits); ++events[bits.lsb]; --events[last]; }
    RegisterCoverage out; uint64_t previous = 0; int64_t active = 0;
    for (const auto &[position, delta] : events) {
        if (!tick()) return {};
        if (position > previous && active > 0) {
            const auto width = position - previous, count = uint64_t(active);
            if (!out.segments.empty() && intervalEnd(out.segments.back().bits) == previous && out.segments.back().factCount == count)
                out.segments.back().bits.width = checkedCountAdd(out.segments.back().bits.width, width);
            else {
                if (out.segments.size() >= capacity) return {};
                out.segments.push_back({{previous, width}, count});
            }
            out.coveredBits = checkedCountAdd(out.coveredBits, width);
            if (count > 1) out.overlapBits = checkedCountAdd(out.overlapBits, width);
            out.maxMultiplicity = std::max(out.maxMultiplicity, count);
        }
        active += delta; previous = position;
        if (active < 0) throw Error{ErrorCode::Internal, "Invalid register interval sweep"};
    }
    if (active) throw Error{ErrorCode::Internal, "Unclosed register interval sweep"};
    return out;
}
}
