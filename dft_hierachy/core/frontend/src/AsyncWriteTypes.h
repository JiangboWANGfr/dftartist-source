#pragma once
#include "hier/model/Connections.h"
#include <algorithm>
#include <iterator>
#include <limits>
#include <map>
#include <stdexcept>
#include <string_view>

namespace hier::frontend::detail {
// Per-object / event classification. Callers use the same target boundaries for
// dependency writes so final writes cannot cross distinct classifications.
class AsyncWriteTypes {
  public:
    void record(const std::string &ref, model::BitRange bits, const std::string &event,
                std::string_view type) {
        if (!bits.width)
            return;
        if (bits.width > std::numeric_limits<uint64_t>::max() - bits.lsb)
            throw std::overflow_error("async classification exceeds the bit space");
        const auto end = bits.lsb + bits.width;
        const std::string incoming(type);
        auto &ranges = groups_[{ref, event}];
        split(ranges, bits.lsb);
        split(ranges, end);
        auto next = ranges.lower_bound(bits.lsb);
        for (auto position = bits.lsb; position < end;) {
            if (next != ranges.end() && next->first == position) {
                if (next->second.type != incoming)
                    next->second.type = "unknown";
                position = next->second.end;
                ++next;
            } else {
                const auto stop = next == ranges.end() ? end : std::min(end, next->first);
                ranges.emplace(position, Span{stop, incoming});
                position = stop;
            }
        }
    }

    // Borrowed until the next mutation or clear; missing classifications remain
    // absent, and read-only queries never create empty entries.
    std::string_view typeAt(const std::string &ref, uint64_t bit,
                            const std::string &event) const {
        const auto group = groups_.find({ref, event});
        if (group == groups_.end())
            return {};
        const auto next = group->second.upper_bound(bit);
        if (next == group->second.begin())
            return {};
        const auto previous = std::prev(next);
        return bit < previous->second.end ? std::string_view(previous->second.type)
                                          : std::string_view{};
    }
    size_t spanCount() const {
        size_t count = 0;
        for (const auto &group : groups_)
            count += group.second.size();
        return count;
    }
    void clear() { groups_.clear(); }

  private:
    struct Span {
        uint64_t end;
        std::string type;
    };
    using Ranges = std::map<uint64_t, Span>;
    std::map<std::pair<std::string, std::string>, Ranges> groups_;
    static void split(Ranges &ranges, uint64_t position) {
        auto next = ranges.lower_bound(position);
        if (next == ranges.begin() || (next != ranges.end() && next->first == position))
            return;
        auto previous = std::prev(next);
        if (previous->second.end <= position)
            return;
        ranges.emplace(position, previous->second);
        previous->second.end = position;
    }
};
} // namespace hier::frontend::detail
