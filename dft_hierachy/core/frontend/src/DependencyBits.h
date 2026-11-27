#pragma once
#include "DependencyRanges.h"
#include <limits>
#include <stdexcept>

namespace hier::frontend::detail {
// An owned, gap-free expression result in output-bit order. Every bitwise
// dependency maps its whole run linearly; repeated source bits remain separate.
class DependencyBits {
  public:
    struct Range {
        uint64_t begin, end;
        Dependencies deps;
    };
    DependencyBits() = default;
    explicit DependencyBits(uint64_t width, Dependencies deps = {}) {
        append(width, std::move(deps));
    }
    uint64_t size() const { return width_; }
    bool empty() const { return !width_; }
    // Borrowed only until mutation or destruction; slices and algebra own data.
    const std::vector<Range> &ranges() const { return ranges_; }

    void append(uint64_t width, Dependencies deps) {
        if (!width)
            return;
        if (width > std::numeric_limits<uint64_t>::max() - width_)
            throw std::overflow_error("expression result exceeds the bit space");
        for (const auto &dep : deps)
            if (dep.align == "bitwise") {
                if (dep.bits.width != width)
                    throw std::logic_error("expression dependency width differs from its run");
                if (width > std::numeric_limits<uint64_t>::max() - dep.bits.lsb)
                    throw std::overflow_error("expression source exceeds the bit space");
            }
        if (!ranges_.empty()) {
            auto &last = ranges_.back();
            if (dependenciesFollow(last.deps, deps, last.end - last.begin,
                                   last.end - last.begin, width)) {
                last.end += width;
                projectDependencies(last.deps, 0, last.end - last.begin);
                width_ += width;
                return;
            }
        }
        ranges_.push_back({width_, width_ + width, std::move(deps)});
        width_ += width;
    }
    void append(const DependencyBits &other) {
        if (this == &other) {
            const auto copy = other;
            append(copy);
            return;
        }
        for (const auto &range : other.ranges_)
            append(range.end - range.begin, range.deps);
    }
    // Clip to the existing result; callers explicitly zero/sign extend as needed.
    DependencyBits slice(uint64_t from, uint64_t width) const {
        DependencyBits result;
        if (from >= width_ || !width)
            return result;
        const auto end = from + std::min(width, width_ - from);
        auto at = std::lower_bound(ranges_.begin(), ranges_.end(), from,
                                   [](const Range &range, uint64_t bit) { return range.end <= bit; });
        for (; at != ranges_.end() && at->begin < end; ++at) {
            const auto first = std::max(from, at->begin), stop = std::min(end, at->end);
            result.append(stop - first,
                          sliceDependencies(at->deps, first - at->begin, stop - first));
        }
        return result;
    }
    Dependencies bit(uint64_t position) const {
        auto value = slice(position, 1);
        return value.empty() ? Dependencies{} : std::move(value.ranges_.front().deps);
    }
    DependencyBits resized(uint64_t width, bool sign = false) const {
        auto result = slice(0, width);
        if (width > width_) {
            const auto last = sign && width_ ? bit(width_ - 1) : Dependencies{};
            if (uniformDependencies(last))
                result.append(width - width_, last);
            else
                for (auto remaining = width - width_; remaining; --remaining)
                    result.append(1, last);
        }
        return result;
    }
    DependencyBits repeated(uint64_t width) const {
        if (empty())
            return DependencyBits(width);
        if (ranges_.size() == 1 && uniformDependencies(ranges_.front().deps))
            return DependencyBits(width, ranges_.front().deps);
        DependencyBits result;
        while (result.size() < width)
            result.append(slice(0, std::min(size(), width - result.size())));
        return result;
    }
    DependencyBits united(const DependencyBits &other) const {
        if (size() != other.size())
            throw std::logic_error("expression union requires equal result widths");
        DependencyBits result;
        size_t left = 0, right = 0;
        for (uint64_t from = 0; from < size();) {
            const auto &a = ranges_[left], &b = other.ranges_[right];
            const auto end = std::min(a.end, b.end);
            Dependencies deps;
            {
                DependencyUnion combined(deps);
                combined.append(sliceDependencies(a.deps, from - a.begin, end - from));
                combined.append(sliceDependencies(b.deps, from - b.begin, end - from));
            }
            result.append(end - from, std::move(deps));
            from = end;
            left += a.end == end;
            right += b.end == end;
        }
        return result;
    }

  private:
    uint64_t width_ = 0;
    std::vector<Range> ranges_;
};
} // namespace hier::frontend::detail
