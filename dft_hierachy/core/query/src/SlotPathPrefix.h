#pragma once
#include "HierarchyPath.h"
#include "hier/model/Model.h"
#include <algorithm>
#include <limits>
#include <unordered_map>

namespace hier::detail {
// One immutable body and one remaining query suffix. Both inputs outlive this
// synchronous matcher; no reference to them or this working table escapes.
class SlotPathPrefix {
  public:
    SlotPathPrefix(const model::BodySkeleton &body, std::span<const PathSegment> remaining)
        : body_(body), remaining_(remaining) {}
    SlotPathPrefix(const SlotPathPrefix &) = delete;
    SlotPathPrefix &operator=(const SlotPathPrefix &) = delete;
    SlotPathPrefix(SlotPathPrefix &&) = delete;
    SlotPathPrefix &operator=(SlotPathPrefix &&) = delete;

    Result<size_t> match(const model::ChildSlot &slot, Cancel cancel = {}) {
        if (cancel.stop_requested())
            return cancelled();
        auto count = matchingCount(slot, cancel);
        if (!count)
            return cancelled();
        return *count;
    }

    // The callback only extends the caller's unpublished query work. A batch
    // has one Result boundary; every slot still has a cancellation checkpoint.
    template <class Emit> Result<bool> visit(Emit emit, Cancel cancel = {}) {
        // Valid body skeletons without generate scopes contain only flat slots.
        return body_.scopes.empty() ? visitRows<false>(emit, cancel) : visitRows<true>(emit, cancel);
    }

  private:
    const model::BodySkeleton &body_;
    const std::span<const PathSegment> remaining_;
    // unknown: not visited; zero: mismatch; otherwise matched scope count + 1.
    static constexpr size_t unknown = std::numeric_limits<size_t>::max();
    std::vector<size_t> prefixes_;
    std::vector<int32_t> pending_;
    // All names and segment pointers borrow remaining_; nothing is formatted or
    // copied into a second path representation. The table is complete before use.
    std::unordered_map<std::string_view, std::vector<const PathSegment *>> targetNames_;
    bool namesReady_ = false, nameKnown_ = false;
    std::string_view currentName_; // Borrows the immutable body slot vector.
    const std::vector<const PathSegment *> *currentCandidates_ = nullptr; // Borrows targetNames_.
    static Error cancelled() { return {ErrorCode::Cancelled, "lookup cancelled"}; }

    template <bool Scoped, class Emit> Result<bool> visitRows(Emit &emit, Cancel cancel) {
        for (size_t index = 0; index < body_.slots.size(); ++index) {
            if (cancel.stop_requested())
                return cancelled();
            size_t count = 0;
            if constexpr (Scoped) {
                auto matched = matchingCount(body_.slots[index], cancel);
                if (!matched)
                    return cancelled();
                count = *matched;
            } else
                count = matchLeaf(body_.slots[index], 0);
            if (count)
                emit(index, count);
        }
        if (cancel.stop_requested())
            return cancelled();
        return true;
    }

    size_t matchLeaf(const model::ChildSlot &slot, size_t depth) const {
        if (depth >= remaining_.size() || remaining_[depth].name != slot.name ||
            remaining_[depth].indices != slot.arrayIndex)
            return 0;
        return depth + 1;
    }

    std::optional<size_t> matchingCount(const model::ChildSlot &slot, Cancel cancel) {
        if (slot.scope < 0)
            return matchLeaf(slot, 0);
        auto possible = possibleLeaf(slot, cancel);
        if (!possible)
            return std::nullopt;
        if (!*possible)
            return size_t{0};
        auto prefix = scopePrefix(slot.scope, cancel);
        if (!prefix)
            return std::nullopt;
        return *prefix ? matchLeaf(slot, *prefix - 1) : 0;
    }

    bool prepareNames(Cancel cancel) {
        // A cancelled preparation never publishes a partial name index.
        targetNames_.clear();
        nameKnown_ = false;
        currentCandidates_ = nullptr;
        for (const auto &part : remaining_) {
            if (cancel.stop_requested())
                return false;
            targetNames_[part.name].push_back(&part);
        }
        for (auto &[name, parts] : targetNames_) {
            (void)name;
            if (cancel.stop_requested())
                return false;
            std::sort(parts.begin(), parts.end(), [](const auto *a, const auto *b) {
                return a->indices < b->indices;
            });
        }
        if (cancel.stop_requested())
            return false;
        namesReady_ = true;
        return true;
    }

    std::optional<bool> possibleLeaf(const model::ChildSlot &slot, Cancel cancel) {
        if (!namesReady_ && !prepareNames(cancel))
            return std::nullopt;
        if (!nameKnown_ || currentName_ != slot.name) {
            currentName_ = slot.name;
            const auto found = targetNames_.find(currentName_);
            currentCandidates_ = found == targetNames_.end() ? nullptr : &found->second;
            nameKnown_ = true;
        }
        if (!currentCandidates_)
            return false;
        const auto &parts = *currentCandidates_;
        const auto found = std::lower_bound(parts.begin(), parts.end(), slot.arrayIndex,
            [](const auto *part, const auto &indices) { return part->indices < indices; });
        // This is only a necessary condition: the original complete scope
        // prefix still decides which of these target positions can match.
        return found != parts.end() && (*found)->indices == slot.arrayIndex;
    }

    std::optional<size_t> scopePrefix(int32_t scope, Cancel cancel) {
        if (scope < 0)
            return size_t{1};
        // Flat slots need no table, even if their body contains other scopes.
        if (prefixes_.empty())
            prefixes_.assign(body_.scopes.size(), unknown);
        pending_.clear();
        while (scope >= 0 && prefixes_[size_t(scope)] == unknown) {
            if (cancel.stop_requested())
                return std::nullopt;
            pending_.push_back(scope);
            scope = body_.scopes[size_t(scope)].parent;
        }
        size_t prefix = scope < 0 ? 1 : prefixes_[size_t(scope)];
        // Parent order need not equal vector order. Commit only a fully matched
        // ancestor result; cancellation leaves remaining entries unknown.
        while (!pending_.empty()) {
            if (cancel.stop_requested())
                return std::nullopt;
            const auto index = size_t(pending_.back());
            const auto &item = body_.scopes[index];
            if (prefix && prefix - 1 < remaining_.size() &&
                remaining_[prefix - 1].name == item.name &&
                remaining_[prefix - 1].indices == item.arrayIndex)
                ++prefix;
            else
                prefix = 0;
            prefixes_[index] = prefix;
            pending_.pop_back();
        }
        return prefix;
    }
};
} // namespace hier::detail
