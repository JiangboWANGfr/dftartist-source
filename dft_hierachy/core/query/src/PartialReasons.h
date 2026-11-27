#pragma once
#include "hier/model/Connections.h"
#include <functional>
#include <optional>
#include <set>
#include <string_view>
#include <tuple>

namespace hier::detail {
// The query-owned Completeness remains authoritative. Reason identity has
// always excluded detail, and the first discovered (code, at) keeps its slot.
class PartialReasons {
    using Identity = std::tuple<std::string_view, std::string_view>;
    static Identity identity(const model::Reason &reason) { return {reason.code, reason.at}; }
    struct Order {
        using is_transparent = void;
        const PartialReasons &owner;
        bool operator()(size_t a, size_t b) const {
            return compare(identity(owner.value_.reasons[a]), identity(owner.value_.reasons[b]));
        }
        bool operator()(size_t a, const Identity &b) const {
            return compare(identity(owner.value_.reasons[a]), b);
        }
        bool operator()(const Identity &a, size_t b) const {
            return compare(a, identity(owner.value_.reasons[b]));
        }
        bool compare(const Identity &a, const Identity &b) const {
            owner.check_();
            return a < b;
        }
    };
    using Index = std::set<size_t, Order>;
    static constexpr size_t scanLimit = 256;

  public:
    PartialReasons(model::Completeness &value, std::function<void()> check)
        : value_(value), check_(std::move(check)) {}
    PartialReasons(const PartialReasons &) = delete;
    PartialReasons &operator=(const PartialReasons &) = delete;
    PartialReasons(PartialReasons &&) = delete;
    PartialReasons &operator=(PartialReasons &&) = delete;

    void append(std::string_view code, std::string_view at) {
        check_();
        value_.status = "partial";
        // Count actual comparisons: repeated early matches keep the cheap scan.
        if (!index_ && scans_ >= scanLimit) {
            Index completed(Order{*this});
            for (size_t i = 0; i < value_.reasons.size(); ++i) {
                check_();
                completed.insert(i);
            }
            index_.emplace(std::move(completed));
        }
        if (index_) {
            if (index_->find(Identity{code, at}) != index_->end())
                return;
        } else
            for (const auto &reason : value_.reasons) {
                check_();
                if (scans_ < scanLimit)
                    ++scans_;
                if (reason.code == code && reason.at == at)
                    return;
            }
        value_.reasons.push_back({std::string(code), std::string(at), {}});
        if (index_)
            try {
                index_->insert(value_.reasons.size() - 1);
            } catch (...) {
                release(); // A caller that retries must not use an incomplete index.
                throw;
            }
    }
    // Destroy borrowed metadata before the caller moves its result vector.
    void release() { index_.reset(); scans_ = 0; }

  private:
    model::Completeness &value_;
    std::function<void()> check_;
    size_t scans_ = 0;
    // Stable positions survive vector growth; no string_view or element address
    // is stored. The caller only appends through this object until release().
    std::optional<Index> index_;
};
} // namespace hier::detail
