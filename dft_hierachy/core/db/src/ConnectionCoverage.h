#pragma once
#include "hier/model/Connections.h"
#include <algorithm>
#include <tuple>
#include <span>

namespace hier::db::detail {
// The original connection-coverage coalescing rule, including its unsigned
// endpoint arithmetic. Both in-place normalization and ordered merging use it.
inline void appendConnectionCoverage(std::vector<model::BitRange> &ranges, size_t &count,
                                      model::BitRange range) {
    if (!range.width)
        return;
    if (count && range.lsb <= ranges[count - 1].lsb + ranges[count - 1].width) {
        auto &last = ranges[count - 1];
        last.width = std::max(last.lsb + last.width, range.lsb + range.width) - last.lsb;
    } else {
        if (count < ranges.size())
            ranges[count] = range;
        else
            ranges.push_back(range);
        ++count;
    }
}
template<class Check>
void normalizeConnectionCoverage(std::vector<model::BitRange> &ranges, Check check) {
    std::sort(ranges.begin(), ranges.end(), [&](auto a, auto b) {
        check();
        return std::tie(a.lsb, a.width) < std::tie(b.lsb, b.width);
    });
    size_t count = 0;
    for (auto range : ranges) {
        check();
        appendConnectionCoverage(ranges, count, range);
    }
    ranges.resize(count);
}
// Each completed child owns its input storage. The caller supplies a distinct
// parent vector, so growing the output cannot invalidate these borrowed spans.
template<class Check>
void mergeConnectionCoverage(std::vector<model::BitRange> &ranges,
                               std::span<const model::BitRange> left,
                               std::span<const model::BitRange> right, Check check) {
    auto less = [&](auto a, auto b) {
        check();
        return std::tie(a.lsb, a.width) < std::tie(b.lsb, b.width);
    };
    ranges.clear();
    // Keep the old result for any future noncanonical leaf producer as well.
    if (!std::is_sorted(left.begin(), left.end(), less) ||
        !std::is_sorted(right.begin(), right.end(), less)) {
        for (auto range : left) {
            check();
            ranges.push_back(range);
        }
        for (auto range : right) {
            check();
            ranges.push_back(range);
        }
        normalizeConnectionCoverage(ranges, check);
        return;
    }
    size_t first = 0, second = 0, count = 0;
    while (first < left.size() || second < right.size()) {
        check();
        const auto range = second == right.size() ||
            (first < left.size() && !less(right[second], left[first]))
                ? left[first++] : right[second++];
        appendConnectionCoverage(ranges, count, range);
    }
    ranges.resize(count);
}
} // namespace hier::db::detail
