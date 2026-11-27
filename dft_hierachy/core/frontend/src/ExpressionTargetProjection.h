#pragma once
#include "hier/model/Connections.h"
#include <algorithm>
#include <map>
#include <span>
#include <string_view>
#include <vector>

namespace hier::frontend::detail {
struct ExpressionTarget {
    model::Slice target;
    uint64_t from;
};

// Borrow the completed, immutable target vector only for this mapping operation.
// Its strings and elements must remain stable and outlive the projection. The
// index owns ordinals / subtree bounds, never copies the source facts.
class ExpressionTargetProjection {
  public:
    ExpressionTargetProjection(std::span<const ExpressionTarget> targets, size_t queries)
        : targets_(targets) {
        // Ordinary one-target / one-write assignments keep their linear path.
        if (targets.size() < 32 || queries < 2 || queries <= 2048 / targets.size())
            return;
        decltype(groups_) complete;
        for (size_t i = 0; i < targets.size(); ++i) {
            const auto bits = targets[i].target.bits;
            // Empty or wrapping ranges never intersect under the original
            // unsigned max(begin) / min(end) predicate either.
            if (bits.lsb < bits.lsb + bits.width)
                complete[targets[i].target.ref].order.push_back(i);
        }
        for (auto &[ref, group] : complete) {
            (void)ref;
            std::sort(group.order.begin(), group.order.end(), [&](size_t a, size_t b) {
                const auto first = targets[a].target.bits.lsb, next = targets[b].target.bits.lsb;
                return first == next ? a < b : first < next;
            });
            group.high.resize(group.order.size());
            cover(group, 0, group.order.size());
        }
        groups_.swap(complete);
        indexed_ = true;
    }
    ExpressionTargetProjection(const ExpressionTargetProjection &) = delete;
    ExpressionTargetProjection &operator=(const ExpressionTargetProjection &) = delete;

    template <class Emit> void project(const model::Slice &write, Emit &&emit) const {
        const auto end = write.bits.lsb + write.bits.width;
        if (end <= write.bits.lsb)
            return;
        if (!indexed_) {
            for (size_t i = 0; i < targets_.size(); ++i)
                fragment(i, write, emit);
            return;
        }
        const auto found = groups_.find(std::string_view(write.ref));
        if (found == groups_.end())
            return;
        std::vector<size_t> matches;
        const auto &group = found->second;
        intersect(group, 0, group.order.size(), write.bits.lsb, end, matches);
        // Restore the exact old emission order before the caller's original
        // (to, from) sort, including ties, duplicates and vector growth.
        std::sort(matches.begin(), matches.end());
        for (const auto index : matches)
            fragment(index, write, emit);
    }

  private:
    struct Group {
        std::vector<size_t> order;
        std::vector<uint64_t> high;
    };
    std::span<const ExpressionTarget> targets_;
    std::map<std::string_view, Group, std::less<>> groups_;
    bool indexed_ = false;

    uint64_t cover(Group &group, size_t first, size_t stop) const {
        if (first == stop)
            return 0;
        const auto middle = first + (stop - first) / 2;
        const auto bits = targets_[group.order[middle]].target.bits;
        return group.high[middle] = std::max({bits.lsb + bits.width,
            cover(group, first, middle), cover(group, middle + 1, stop)});
    }
    void intersect(const Group &group, size_t first, size_t stop, uint64_t from, uint64_t end,
                   std::vector<size_t> &matches) const {
        if (first == stop)
            return;
        const auto middle = first + (stop - first) / 2;
        if (group.high[middle] <= from)
            return;
        const auto index = group.order[middle];
        const auto bits = targets_[index].target.bits;
        intersect(group, first, middle, from, end, matches);
        if (bits.lsb >= end)
            return; // Every item on the right starts at or after this one.
        if (bits.lsb + bits.width > from)
            matches.push_back(index);
        intersect(group, middle + 1, stop, from, end, matches);
    }
    template <class Emit> void fragment(size_t index, const model::Slice &write, Emit &emit) const {
        const auto &target = targets_[index];
        if (target.target.ref != write.ref)
            return;
        const auto lo = std::max(target.target.bits.lsb, write.bits.lsb);
        const auto hi = std::min(target.target.bits.lsb + target.target.bits.width,
                                 write.bits.lsb + write.bits.width);
        if (lo < hi)
            emit(model::BitMapSegment{target.from + lo - target.target.bits.lsb, lo, hi - lo});
    }
};
} // namespace hier::frontend::detail
