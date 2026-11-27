#pragma once
#include "InstanceDescription.h"
#include <algorithm>

namespace hier::detail {
// One query's working description. Borrowed results last only until the next
// call (including a failed call). Public consumers copy every returned value.
// Located arguments must describe the supplied key in this immutable DB.
class InstanceDescriptions {
  public:
    explicit InstanceDescriptions(const db::DesignDb &db) : db_(db) {}
    InstanceDescriptions(const InstanceDescriptions &) = delete;
    InstanceDescriptions &operator=(const InstanceDescriptions &) = delete;

    Result<const model::InstInfo *> get(const model::InstKey &key, Cancel cancel = {}) try {
        checkpoint(cancel);
        if (key.size() <= 1)
            return describeLocated(key, checked(db_.locate(key, cancel)), cancel);
        if (!parent_ || parentKey_.size() + 1 != key.size() ||
            !std::equal(parentKey_.begin(), parentKey_.end(), key.begin())) {
            parentKey_.assign(key.begin(), key.end() - 1);
            auto parent = db_.locate(parentKey_, cancel);
            if (!parent && parent.error().code == ErrorCode::NotFound)
                return describeLocated(key, checked(db_.locate(key, cancel)), cancel);
            parent_ = checked(std::move(parent));
        }
        return describeChild(parentKey_, *parent_, key.back(), cancel);
    } catch (const Error &error) {
        reset();
        return error;
    }

    Result<const model::InstInfo *> child(const model::InstKey &parentKey,
                                          const db::Located &parent, uint32_t index,
                                          Cancel cancel = {}) try {
        checkpoint(cancel);
        return describeChild(parentKey, parent, index, cancel);
    } catch (const Error &error) {
        reset();
        return error;
    }

    Result<const model::InstInfo *> located(const model::InstKey &key, const db::Located &at,
                                            Cancel cancel = {}) try {
        checkpoint(cancel);
        return describeLocated(key, at, cancel);
    } catch (const Error &error) {
        reset();
        return error;
    }

  private:
    const db::DesignDb &db_;
    model::InstInfo info_;
    model::InstKey describedKey_, parentKey_, childParentKey_, childKey_;
    struct Lengths { size_t path, text; };
    std::vector<Lengths> lengths_; // Scalar marks, not full ancestor descriptions.
    std::optional<db::Located> parent_;
    db::Located childAt_; // Skeleton steps borrow the DB's immutable skeletons.

    void reset() {
        info_ = {};
        describedKey_.clear();
        lengths_.clear();
        parent_.reset();
        parentKey_.clear();
        childParentKey_.clear();
        childKey_.clear();
        childAt_ = {};
    }
    const model::InstInfo *describeLocated(const model::InstKey &key, const db::Located &at,
                                           Cancel cancel) {
        size_t common = 0;
        while (common < key.size() && common < describedKey_.size() &&
               key[common] == describedKey_[common]) {
            checkpoint(cancel);
            ++common;
        }
        if (common) {
            info_.path.resize(lengths_[common - 1].path);
            info_.pathText.resize(lengths_[common - 1].text);
            lengths_.resize(common);
        } else {
            startInstancePath(db_, at.top, info_);
            lengths_.clear();
            lengths_.push_back({info_.path.size(), info_.pathText.size()});
            common = 1;
        }
        for (size_t depth = common; depth < key.size(); ++depth) {
            checkpoint(cancel);
            appendInstanceStep(db_, at.steps[depth - 1], info_, cancel);
            lengths_.push_back({info_.path.size(), info_.pathText.size()});
        }
        completeInstanceDescription(db_, key, at, info_, cancel);
        checkpoint(cancel);
        describedKey_ = key;
        return &info_;
    }
    const model::InstInfo *describeChild(const model::InstKey &parentKey, const db::Located &parent,
                                         uint32_t index, Cancel cancel) {
        // Invalid keys retain the original DB's error code/message/priority.
        if (parent.body == model::kNoBody) {
            auto key = parentKey;
            key.push_back(index);
            return describeLocated(key, checked(db_.locate(key, cancel)), cancel);
        }
        const auto &slots = checked(db_.skeleton(parent.body, cancel))->slots;
        if (index >= slots.size()) {
            auto key = parentKey;
            key.push_back(index);
            return describeLocated(key, checked(db_.locate(key, cancel)), cancel);
        }
        const auto &slot = slots[index];
        if (childParentKey_ != parentKey) {
            childAt_ = parent;
            childAt_.steps.push_back({parent.body, &slot});
            childParentKey_ = parentKey;
            childKey_ = parentKey;
            childKey_.push_back(index);
        } else
            childAt_.steps.back().slot = &slot;
        childAt_.body = slot.body;
        childKey_.back() = index;
        return describeLocated(childKey_, childAt_, cancel);
    }
};
} // namespace hier::detail
