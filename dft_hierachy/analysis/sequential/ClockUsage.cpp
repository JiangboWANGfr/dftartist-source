#include "ClockUsage.h"
#include <algorithm>
#include <deque>
#include <set>
#include <tuple>

namespace dft::sequential::detail {
namespace {
using namespace hier;
using namespace hier::model;
using Key = std::tuple<std::string, uint64_t, uint64_t, std::optional<std::string>>;
Key key(const TracePoint &p) { return {p.slice.ref, p.slice.bits.lsb, p.slice.bits.width, p.side}; }
template<class T> T take(Result<T> value) {
    if (!value) throw value.error();
    return std::move(value.value());
}
class Walk {
    Design &design_;
    const Request &request_;
    uint64_t &work_;
    std::chrono::steady_clock::time_point deadline_;
    Cancel cancel_;
    ClockUsage proof_;
    std::set<Key> seen_;
    using WitnessKey = std::tuple<std::string, std::string, Key, Key>;
    std::set<WitnessKey> witnesses_;
    struct Pending { TracePoint point; uint64_t depth; };
    std::deque<Pending> pending_;

    void partial(const std::string &reason) {
        proof_.complete = false;
        if (std::find(proof_.reasons.begin(), proof_.reasons.end(), reason) == proof_.reasons.end())
            proof_.reasons.push_back(reason);
    }
    bool spend() {
        if (cancel_.stop_requested()) throw Error{ErrorCode::Cancelled, "Clock usage analysis cancelled"};
        if (std::chrono::steady_clock::now() >= deadline_) { partial("budget_time"); return false; }
        if (work_ >= request_.maxUsageWork) { partial("budget_usage_work"); return false; }
        ++work_;
        return true;
    }
    void page(const Pending &at, bool upstream) {
        ConnectionRequest request;
        request.bits = at.point.slice.bits; request.reach = "hier";
        request.side = at.point.side.value_or("");
        StepLimit limit;
        do {
            if (!spend()) return;
            if (work_ >= request_.maxUsageWork) { partial("budget_usage_work"); return; }
            limit.maxHops = int(std::min<uint64_t>(64, request_.maxUsageWork - work_));
            auto response = take(design_.step(at.point.slice.ref, upstream, request, limit, cancel_));
            const auto step = proof_.steps.size();
            // Intermediate budget pages are not semantic gaps; retain all raw
            // responses but judge completeness after draining their cursor.
            for (const auto &reason : response.completeness.reasons)
                if (reason.code != "budget_nodes" || response.result.next.empty()) partial("core_step_partial");
            if (response.completeness.status != "complete" && response.completeness.reasons.empty())
                partial("core_step_partial");
            bool stopped = false;
            for (size_t h = 0; h < response.result.hops.size() && !stopped; ++h) {
                if (!spend()) { stopped = true; break; }
                const auto &hop = response.result.hops[h];
                const bool binding = hop.kind == "binding_up" || hop.kind == "binding_down";
                if (hop.kind == "unresolved" || hop.kind == "blackbox_pin" || hop.kind == "primitive_pin")
                    partial("opaque_usage_boundary");
                // An assign can be a clock buffer or functional data logic.
                // Merely reading a clock in it is not a sequential data witness.
                if (!upstream && hop.kind == "process") partial("combinational_usage_boundary");
                if (binding && hop.next.empty()) partial("unsupported_alias_binding");
                for (size_t n = 0; n < hop.next.size(); ++n) {
                    if (!spend()) { stopped = true; break; }
                    const auto &next = hop.next[n];
                    const TracePoint target{next.slice, next.side};
                    if (binding) {
                        if (next.precision != "exact" || next.align != "bitwise" || next.map.empty()) {
                            partial("unsupported_alias_binding"); continue;
                        }
                        // Public step already clips the exact map to the queried
                        // bits. Never match aliases by name or parse opaque refs.
                        if (seen_.insert(key(target)).second) pending_.push_back({target, at.depth + 1});
                    } else if (!upstream && hop.kind == "register" &&
                               (next.role == "data" || next.role == "control" || next.role == "async")) {
                        if (next.precision != "exact") { partial("conservative_usage"); continue; }
                        if (witnesses_.emplace(hop.fact, next.role, key({hop.from, at.point.side}), key(target)).second)
                            proof_.witnesses.push_back({step, h, n, next.role});
                    }
                }
            }
            const auto next = response.result.next;
            proof_.steps.push_back({at.point, upstream, std::move(response)});
            if (stopped) return;
            if (!next.empty() && next == limit.cursor)
                throw Error{ErrorCode::Internal, "Clock usage step cursor did not advance"};
            limit.cursor = next;
        } while (!limit.cursor.empty());
    }
  public:
    Walk(Design &design, const Request &request, uint64_t &work,
         std::chrono::steady_clock::time_point deadline, Cancel cancel)
        : design_(design), request_(request), work_(work), deadline_(deadline), cancel_(cancel) {}
    ClockUsage run(const TracePoint &point) {
        const auto start = work_;
        seen_.insert(key(point)); pending_.push_back({point, 0});
        while (!pending_.empty()) {
            if (!spend()) break;
            auto at = std::move(pending_.front()); pending_.pop_front();
            if (at.depth >= request_.maxDepth) { partial("budget_usage_depth"); continue; }
            page(at, true);
            page(at, false);
        }
        proof_.work = work_ - start;
        return std::move(proof_);
    }
};
}
ClockUsage clockUsage(Design &design, const TracePoint &point, const Request &request,
                      uint64_t &work, std::chrono::steady_clock::time_point deadline, Cancel cancel) {
    return Walk(design, request, work, deadline, cancel).run(point);
}
} // namespace dft::sequential::detail
