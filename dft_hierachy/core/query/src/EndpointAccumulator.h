#pragma once
#include "QueryCancel.h"
#include "hier/model/Connections.h"
#include <compare>
#include <functional>
#include <optional>
#include <set>
#include <string_view>
#include <tuple>
#include <vector>

namespace hier::detail {
// Borrows the query-owned result vector. It is the sole fact representation;
// auxiliary sets contain stable vector positions, never element addresses.
// The caller must not otherwise change or move the vector during this lifetime.
class EndpointAccumulator {
    using Endpoint = model::Endpoint;
    using Endpoints = std::vector<Endpoint>;
    static auto rangeKey(const std::optional<model::BitRange> &bits) {
        return std::tuple{bool(bits), bits ? bits->lsb : 0, bits ? bits->width : 0};
    }
    static auto sliceKey(const std::optional<model::Slice> &at) {
        return std::tuple{bool(at), at ? std::string_view(at->ref) : std::string_view{},
                          at ? at->bits.lsb : 0, at ? at->bits.width : 0};
    }
    static auto identity(const Endpoint &e) {
        // Keep the original emit identity; route/inst/reason/value do not replace
        // the first record when the same endpoint is discovered again.
        return std::tuple{std::string_view(e.kind), std::string_view(e.ref),
                          rangeKey(e.bits), sliceKey(e.at), e.queried.lsb, e.queried.width};
    }
    struct IdentityOrder {
        using is_transparent = void;
        std::reference_wrapper<const Endpoints> values;
        Cancel cancel;
        bool operator()(size_t a, size_t b) const {
            return (*this)(values.get()[a], values.get()[b]);
        }
        bool operator()(size_t a, const Endpoint &b) const { return (*this)(values.get()[a], b); }
        bool operator()(const Endpoint &a, size_t b) const { return (*this)(a, values.get()[b]); }
        bool operator()(const Endpoint &a, const Endpoint &b) const {
            checkpoint(cancel);
            return identity(a) < identity(b);
        }
    };
    static uint64_t coordinate(model::BitRange bits, bool end) {
        return bits.lsb + (end ? bits.width : 0);
    }
    static auto mergePrefix(const Endpoint &e, bool end) {
        return std::tuple{std::string_view(e.kind), std::string_view(e.ref),
                          std::string_view(e.inst), std::string_view(e.reason),
                          coordinate(e.queried, end), e.via.size(), bool(e.bits),
                          e.bits ? coordinate(*e.bits, end) : 0, bool(e.at),
                          e.at ? std::string_view(e.at->ref) : std::string_view{},
                          e.at ? coordinate(e.at->bits, end) : 0};
    }
    struct MergeOrder {
        using is_transparent = void;
        std::reference_wrapper<const Endpoints> values;
        Cancel cancel;
        std::strong_ordering compare(const Endpoint &a, const Endpoint &b,
                                     bool aEnd, bool bEnd) const {
            checkpoint(cancel);
            if (auto order = mergePrefix(a, aEnd) <=> mergePrefix(b, bEnd); order != 0)
                return order;
            for (size_t i = 0; i < a.via.size(); ++i) {
                checkpoint(cancel);
                const auto &x = a.via[i], &y = b.via[i];
                const auto route = [](const auto &hop) {
                    return std::tuple{std::string_view(hop.kind), std::string_view(hop.via),
                                      hop.next.size()};
                };
                if (auto order = route(x) <=> route(y); order != 0)
                    return order;
                for (size_t j = 0; j < x.next.size(); ++j) {
                    checkpoint(cancel);
                    if (auto order = x.next[j].slice.ref <=> y.next[j].slice.ref; order != 0)
                        return order;
                }
            }
            return std::strong_ordering::equal;
        }
        bool operator()(size_t a, size_t b) const {
            const auto order = compare(values.get()[a], values.get()[b], true, true);
            return order < 0 || (order == 0 && a < b);
        }
        // An incoming start represents ordinal zero. lower_bound therefore
        // selects the earliest original slot among all matching ending keys.
        bool operator()(size_t a, const Endpoint &b) const {
            return compare(values.get()[a], b, true, false) < 0;
        }
        bool operator()(const Endpoint &a, size_t b) const {
            const auto order = compare(a, values.get()[b], false, true);
            return order < 0 || (order == 0 && b > 0);
        }
    };
    using IdentitySet = std::set<size_t, IdentityOrder>;
    using MergeSet = std::set<size_t, MergeOrder>;
    static constexpr size_t scanLimit = 256;

  public:
    EndpointAccumulator(Endpoints &values, Cancel cancel) : values_(values), cancel_(cancel) {}
    EndpointAccumulator(const EndpointAccumulator &) = delete;
    EndpointAccumulator &operator=(const EndpointAccumulator &) = delete;
    EndpointAccumulator(EndpointAccumulator &&) = delete;
    EndpointAccumulator &operator=(EndpointAccumulator &&) = delete;

    void append(Endpoint e, bool deduplicate) {
        checkpoint(cancel_);
        if (deduplicate) {
            if (!seen_ && scans_ >= scanLimit) {
                IdentitySet index(IdentityOrder{values_, cancel_});
                for (size_t i = 0; i < values_.size(); ++i)
                    index.insert(i);
                seen_.emplace(std::move(index));
            }
            if (seen_) {
                if (seen_->find(e) != seen_->end())
                    return;
            } else
                for (const auto &old : values_) {
                    checkpoint(cancel_);
                    if (scans_ < scanLimit)
                        ++scans_;
                    if (identity(old) == identity(e))
                        return;
                }
        }
        values_.push_back(std::move(e));
        if (seen_)
            try {
                seen_->insert(values_.size() - 1);
            } catch (...) {
                seen_.reset();
                scans_ = 0;
                throw;
            }
    }
    void coalesce() {
        checkpoint(cancel_);
        seen_.reset(); // Identity keys must not survive coordinate changes.
        scans_ = 0;
        Endpoints merged;
        {
            MergeOrder order{merged, cancel_};
            std::optional<MergeSet> endings;
            size_t scans = 0;
            for (auto &e : values_) {
                checkpoint(cancel_);
                if (!endings && scans >= scanLimit) {
                    MergeSet index(order);
                    for (size_t i = 0; i < merged.size(); ++i)
                        index.insert(i);
                    endings.emplace(std::move(index));
                }
                auto slot = merged.size();
                if (endings) {
                    auto next = endings->lower_bound(e);
                    if (next != endings->end() && order.compare(merged[*next], e, true, false) == 0) {
                        slot = *next;
                        endings->erase(next); // Remove the old ending before mutation.
                    }
                } else
                    for (size_t i = 0; i < merged.size(); ++i) {
                        if (scans < scanLimit)
                            ++scans;
                        if (order.compare(merged[i], e, true, false) == 0) {
                            slot = i;
                            break;
                        }
                    }
                if (slot == merged.size())
                    merged.push_back(std::move(e));
                else
                    merge(merged[slot], e);
                if (endings)
                    endings->insert(slot);
            }
        } // Destroy borrowed indices before moving the vector.
        values_ = std::move(merged);
    }

  private:
    Endpoints &values_;
    Cancel cancel_;
    size_t scans_ = 0;
    std::optional<IdentitySet> seen_;
    void merge(Endpoint &dest, const Endpoint &part) const {
        if (dest.kind == "const")
            dest.value = std::to_string(dest.queried.width + part.queried.width) + "'b" +
                         part.value.substr(part.value.find('b') + 1) +
                         dest.value.substr(dest.value.find('b') + 1);
        dest.queried.width += part.queried.width;
        if (dest.bits)
            dest.bits->width += part.bits->width;
        if (dest.at)
            dest.at->bits.width += part.at->bits.width;
        for (size_t i = 0; i < dest.via.size(); ++i) {
            checkpoint(cancel_);
            dest.via[i].from.bits.width += part.queried.width;
            for (auto &mapping : dest.via[i].map)
                mapping.width += part.queried.width;
            for (auto &next : dest.via[i].next)
                next.slice.bits.width += part.queried.width;
        }
    }
};
} // namespace hier::detail
