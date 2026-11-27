#pragma once
#include "DependencyRanges.h"
#include <algorithm>
#include <iterator>
#include <limits>
#include <map>
#include <span>
#include <stdexcept>

namespace hier::frontend::detail {
// One union of accesses per target bit, represented by disjoint intervals.
// All-aligned dependencies are uniform; bitwise dependencies map the target
// interval linearly to a source interval of the same width.
class WriteIntervals {
  public:
    struct Span {
        uint64_t end;
        Dependencies deps;
    };
    using Entries = std::map<std::pair<std::string, uint64_t>, Span>;

    Dependencies &bit(const std::string &ref, uint64_t position) {
        const auto end = endOf({position, 1});
        split(ref, position);
        split(ref, end);
        return entries_.try_emplace({ref, position}, Span{end, {}}).first->second.deps;
    }

    void addUniform(const std::string &ref, model::BitRange bits, const Dependencies &deps) {
        if (!bits.width)
            return;
        endOf(bits);
        for (const auto &dep : deps)
            if (dep.align != "all")
                throw std::logic_error("uniform write dependencies must be all-aligned");
        addRange(ref, bits, deps);
    }
    // Input order is target-bit order. A missing suffix still writes empty
    // dependencies. Replacement (net / port expression) preserves the source
    // vector; merge (procedural assignment) retains the original access union.
    void assignBits(const std::string &ref, model::BitRange target,
                    std::span<const Dependencies> data) {
        applyBits(ref, target, data, {}, true);
    }
    void addBits(const std::string &ref, model::BitRange target,
                 std::span<const Dependencies> data, const Dependencies &control) {
        applyBits(ref, target, data, control, false);
    }
    // Input already projects each bitwise dependency across the full target.
    // Values own their data before splitting a possibly aliased old write.
    void assignProjected(const std::string &ref, model::BitRange target, Dependencies deps) {
        if (!target.width)
            return;
        assignRange(ref, target, std::move(deps));
    }
    void addProjected(const std::string &ref, model::BitRange target, Dependencies deps,
                      Dependencies control) {
        if (!target.width)
            return;
        if (!uniformDependencies(control)) {
            endOf(target);
            for (uint64_t i = 0; i < target.width; ++i) {
                auto &dest = bit(ref, target.lsb + i);
                DependencyUnion combined(dest);
                combined.append(sliceDependencies(deps, i, 1));
                combined.append(control);
            }
            return;
        }
        Dependencies combined;
        {
            DependencyUnion accesses(combined);
            accesses.append(deps);
            accesses.append(control);
        }
        addRange(ref, target, combined);
    }
    Entries &entries() { return entries_; }
    const Entries &entries() const { return entries_; }
    void clear() { entries_.clear(); }

  private:
    Entries entries_;
    void addRange(const std::string &ref, model::BitRange bits, const Dependencies &deps) {
        const auto end = endOf(bits);
        split(ref, bits.lsb);
        split(ref, end);
        auto next = entries_.lower_bound({ref, bits.lsb});
        const bool mapped = !uniformDependencies(deps);
        for (auto position = bits.lsb; position < end;) {
            const bool present = next != entries_.end() && next->first.first == ref &&
                                 next->first.second == position;
            auto stop = end;
            if (present)
                stop = next->second.end;
            else if (next != entries_.end() && next->first.first == ref)
                stop = std::min(end, next->first.second);
            Dependencies fragment;
            const auto *incoming = &deps;
            if (mapped && (position != bits.lsb || stop != end)) {
                fragment = sliceDependencies(deps, position - bits.lsb, stop - position);
                incoming = &fragment;
            }
            if (present) {
                appendDependencies(next->second.deps, *incoming);
                ++next;
            } else {
                entries_.emplace(std::pair{ref, position}, Span{stop, *incoming});
            }
            position = stop;
        }
    }
    void assignRange(const std::string &ref, model::BitRange bits, Dependencies deps) {
        const auto end = endOf(bits);
        Span replacement{end, std::move(deps)};
        split(ref, bits.lsb);
        split(ref, end);
        auto [at, inserted] = entries_.try_emplace(std::pair{ref, bits.lsb}, std::move(replacement));
        if (!inserted)
            at->second = std::move(replacement);
        entries_.erase(std::next(at), entries_.lower_bound({ref, end}));
    }
    void applyBits(const std::string &ref, model::BitRange target,
                   std::span<const Dependencies> data, const Dependencies &control,
                   bool replace) {
        if (!target.width)
            return;
        endOf(target);
        const Dependencies empty;
        const bool uniformControl = uniformDependencies(control);
        for (uint64_t offset = 0; offset < target.width;) {
            const auto &deps = offset < data.size() ? data[size_t(offset)] : empty;
            auto end = offset + 1;
            if (uniformControl) {
                const auto limit = std::min<uint64_t>(target.width, data.size());
                while (end < limit && dependenciesFollow(deps, data[size_t(end)], end - offset))
                    ++end;
                if (end >= data.size() && deps.empty())
                    end = target.width;
            }
            if (end - offset == 1) {
                auto &dest = bit(ref, target.lsb + offset);
                if (replace)
                    dest = deps;
                else {
                    DependencyUnion combined(dest);
                    combined.append(deps);
                    combined.append(control);
                }
            } else if (replace) {
                assignRange(ref, {target.lsb + offset, end - offset},
                            sliceDependencies(deps, 0, end - offset));
            } else {
                Dependencies combined;
                {
                    DependencyUnion accesses(combined);
                    accesses.append(deps);
                    accesses.append(control);
                }
                projectDependencies(combined, 0, end - offset);
                addRange(ref, {target.lsb + offset, end - offset}, combined);
            }
            offset = end;
        }
    }
    static uint64_t endOf(model::BitRange bits) {
        if (bits.width > std::numeric_limits<uint64_t>::max() - bits.lsb)
            throw std::overflow_error("write interval exceeds the bit space");
        return bits.lsb + bits.width;
    }
    void split(const std::string &ref, uint64_t position) {
        auto next = entries_.lower_bound({ref, position});
        if (next == entries_.begin() ||
            (next != entries_.end() && next->first == std::pair{ref, position}))
            return;
        auto previous = std::prev(next);
        if (previous->first.first != ref || previous->second.end <= position)
            return;
        // Insert before changing the old boundary: allocation failure must not
        // discard part of an existing write interval.
        const auto oldEnd = previous->second.end;
        entries_.emplace(std::pair{ref, position},
                         Span{oldEnd, sliceDependencies(previous->second.deps,
                                                      position - previous->first.second,
                                                      oldEnd - position)});
        previous->second.end = position;
        projectDependencies(previous->second.deps, 0, position - previous->first.second);
    }
};
} // namespace hier::frontend::detail
