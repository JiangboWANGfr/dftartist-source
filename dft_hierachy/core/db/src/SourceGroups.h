#pragma once
#include "hier/db/SourceIndex.h"
#include <iterator>
#include <map>
#include <tuple>
#include <utility>

namespace hier::db::detail {
// One-shot unpublished builder. Map insertion preserves iterators; last_ only
// borrows a node in this builder and is never a second owner or an index cache.
class SourceGroups {
    using Key = std::tuple<size_t, size_t, size_t, model::SourceKind>;
    using Groups = std::map<Key, std::vector<SourceSequence>>;
    Groups groups_;
    Groups::iterator last_ = groups_.end();

  public:
    SourceGroups() = default;
    SourceGroups(const SourceGroups &) = delete;
    SourceGroups &operator=(const SourceGroups &) = delete;
    void add(model::SourceRange range, model::SourceKind kind, SourceSequence sequence) {
        const Key key{range.file, range.start, range.end, kind};
        if (last_ != groups_.end()) {
            if (last_->first == key) {
                last_->second.push_back(std::move(sequence));
                return;
            }
            if (last_->first < key) {
                auto next = std::next(last_);
                if (next == groups_.end() || key < next->first) {
                    last_ = groups_.try_emplace(next, key);
                    last_->second.push_back(std::move(sequence));
                    return;
                }
                if (next->first == key) {
                    last_ = next;
                    last_->second.push_back(std::move(sequence));
                    return;
                }
            }
        }
        // Out-of-order input keeps the original map lookup. The checked lower
        // bound is also the insertion hint; no extra tree search is necessary.
        auto found = groups_.lower_bound(key);
        if (found == groups_.end() || key < found->first)
            found = groups_.try_emplace(found, key);
        last_ = found;
        last_->second.push_back(std::move(sequence));
    }
    template<class Order>
    bool finish(std::vector<SourceGroup> &out, Cancel cancel, Order order) {
        for (auto &[key, sequences] : groups_) {
            if (cancel.stop_requested())
                return false;
            if (!order(sequences, out.size(), cancel))
                return false;
            auto [file, start, end, kind] = key;
            out.push_back({{file, start, end}, kind, std::move(sequences)});
        }
        return true;
    }
};
} // namespace hier::db::detail
