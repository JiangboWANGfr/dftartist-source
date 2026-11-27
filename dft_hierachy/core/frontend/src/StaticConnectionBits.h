#pragma once
#include "hier/model/Connections.h"
#include <algorithm>
#include <limits>
#include <stdexcept>
#include <string_view>

namespace hier::frontend::detail {
// Owned static connections in low-to-high output order. Constant pieces are
// joined only when publishing segments, avoiding repeatedly copying long text.
class StaticConnectionBits {
  public:
    StaticConnectionBits() = default;
    StaticConnectionBits(uint64_t width, model::BindTarget target) {
        append(width, std::move(target));
    }
    static StaticConnectionBits signal(std::string ref, model::BitRange bits) {
        model::BindTarget target;
        target.kind = "signal";
        target.signal = std::move(ref);
        target.bits = bits;
        return {bits.width, std::move(target)};
    }
    static StaticConnectionBits constant(std::string_view digits) {
        model::BindTarget target;
        target.kind = "const";
        target.value = literal(digits);
        return {uint64_t(digits.size()), std::move(target)};
    }
    uint64_t size() const { return width_; }
    bool empty() const { return !width_; }
    // Borrowed until mutation/destruction. slice/resized/repeated/segments own values.
    const std::vector<model::BindSegment> &ranges() const { return ranges_; }

    void append(uint64_t width, model::BindTarget target) {
        if (!width)
            return;
        if (width > std::numeric_limits<uint64_t>::max() - width_)
            throw std::overflow_error("static connection exceeds the bit space");
        if (target.kind == "signal") {
            if (target.bits.width != width)
                throw std::logic_error("static signal width differs from its connection");
            if (width > std::numeric_limits<uint64_t>::max() - target.bits.lsb)
                throw std::overflow_error("static signal exceeds the bit space");
        } else if (target.kind == "const") {
            if (body(target).size() != width)
                throw std::logic_error("static constant width differs from its connection");
        } else if (target.kind != "unconnected") {
            throw std::logic_error("static connection requires a signal, constant or open target");
        }
        if (!ranges_.empty() && target.kind != "const") {
            auto &last = ranges_.back();
            if (joins(last.target, last.pinBits.width, target)) {
                last.pinBits.width += width;
                if (target.kind == "signal")
                    last.target.bits.width += width;
                width_ += width;
                return;
            }
        }
        ranges_.push_back({{width_, width}, std::move(target)});
        width_ += width;
    }
    void append(const StaticConnectionBits &other) {
        if (this == &other) {
            const auto copy = other;
            append(copy);
            return;
        }
        for (const auto &range : other.ranges_)
            append(range.pinBits.width, range.target);
    }
    StaticConnectionBits slice(uint64_t from, uint64_t width) const {
        StaticConnectionBits result;
        if (from >= size() || !width)
            return result;
        const auto end = from + std::min(width, size() - from);
        auto at = std::lower_bound(ranges_.begin(), ranges_.end(), from,
                                   [](const auto &range, uint64_t bit) {
                                       return range.pinBits.lsb + range.pinBits.width <= bit;
                                   });
        for (; at != ranges_.end() && at->pinBits.lsb < end; ++at) {
            const auto first = std::max(from, at->pinBits.lsb);
            const auto stop = std::min(end, at->pinBits.lsb + at->pinBits.width);
            auto target = at->target;
            const auto offset = first - at->pinBits.lsb, count = stop - first;
            if (target.kind == "signal") {
                target.bits.lsb += offset;
                target.bits.width = count;
            } else if (target.kind == "const") {
                const auto digits = body(target);
                target.value = literal(digits.substr(size_t(at->pinBits.width - offset - count),
                                                     size_t(count)));
            }
            result.append(count, std::move(target));
        }
        return result;
    }
    model::BindTarget bit(uint64_t position) const {
        auto one = slice(position, 1);
        return one.empty() ? model::BindTarget{} : std::move(one.ranges_.front().target);
    }
    StaticConnectionBits resized(uint64_t width, bool sign = false) const {
        auto result = slice(0, width);
        if (width > size()) {
            auto fill = sign && size() ? bit(size() - 1) : constant("0").bit(0);
            if (fill.kind == "const")
                result.append(constant(std::string(size_t(width - size()), fill.value.back())));
            else if (fill.kind == "unconnected")
                result.append(width - size(), std::move(fill));
            else
                for (auto remaining = width - size(); remaining; --remaining)
                    result.append(1, fill); // repeated source bits are not linear
        }
        return result;
    }
    StaticConnectionBits repeated(uint64_t width) const {
        if (empty())
            return {};
        if (std::all_of(ranges_.begin(), ranges_.end(), [](const auto &range) {
                return range.target.kind == "const";
            })) {
            const auto normalized = segments();
            const auto pattern = body(normalized.front().target);
            std::string digits;
            if (width > digits.max_size())
                throw std::length_error("static constant text is too large");
            digits.reserve(size_t(width));
            for (uint64_t bit = width; bit; --bit)
                digits.push_back(pattern[pattern.size() - 1 - size_t((bit - 1) % size())]);
            return constant(digits);
        }
        if (ranges_.size() == 1 && ranges_.front().target.kind == "unconnected")
            return {width, ranges_.front().target};
        StaticConnectionBits result;
        while (result.size() < width)
            result.append(slice(0, std::min(size(), width - result.size())));
        return result;
    }
    std::vector<model::BindSegment> segments() const {
        std::vector<model::BindSegment> result;
        for (size_t first = 0; first < ranges_.size();) {
            auto end = first + 1;
            auto width = ranges_[first].pinBits.width;
            while (end < ranges_.size() && joins(ranges_[first].target, width, ranges_[end].target)) {
                width += ranges_[end].pinBits.width;
                ++end;
            }
            auto target = ranges_[first].target;
            if (target.kind == "signal")
                target.bits.width = width;
            else if (target.kind == "const") {
                std::string digits;
                if (width > digits.max_size())
                    throw std::length_error("static constant text is too large");
                digits.reserve(size_t(width));
                for (auto i = end; i > first; --i)
                    digits.append(body(ranges_[i - 1].target));
                target.value = literal(digits);
            }
            result.push_back({{ranges_[first].pinBits.lsb, width}, std::move(target)});
            first = end;
        }
        return result;
    }

  private:
    uint64_t width_ = 0;
    std::vector<model::BindSegment> ranges_;
    static std::string_view body(const model::BindTarget &target) {
        const auto marker = target.value.find('b');
        if (marker == std::string::npos)
            throw std::logic_error("static constant requires binary text");
        return std::string_view(target.value).substr(marker + 1);
    }
    static std::string literal(std::string_view digits) {
        if (digits.empty())
            return "0'b";
        // Match the old coalescer's final expression, including string capacity
        // used by retained-fact accounting, without constructing all prior prefixes.
        return std::to_string(digits.size()) + "'b" + digits.front() + std::string(digits.substr(1));
    }
    static bool joins(const model::BindTarget &first, uint64_t width,
                      const model::BindTarget &next) {
        return first.kind == next.kind &&
               ((first.kind == "signal" && first.signal == next.signal &&
                 first.bits.lsb + width == next.bits.lsb) ||
                first.kind == "const" || first.kind == "unconnected");
    }
};
} // namespace hier::frontend::detail
