#include "RegisterEventGroupsInternal.h"
#include "RegisterStatisticsInternal.h"
#include "EventIdentity.h"
#include "GroupIntervalAttribution.h"
#include <algorithm>
#include <map>
#include <set>

namespace dft::sequential {
namespace {
using namespace hier;
using namespace hier::model;
using detail::checkedCountAdd;
using detail::intervalEnd;
void checkpoint(Cancel cancel) {
    if (cancel.stop_requested()) throw Error{ErrorCode::Cancelled, "Register event grouping cancelled"};
}
const RegisterInfo &fact(const RegisterStatistics &r, size_t i) {
    const auto &f = r.facts[i]; return r.pages[f.page].response.result.items[f.item];
}
class Walk {
    const RegisterStatistics &input_;
    RegisterEventGroups out_;
    std::chrono::steady_clock::time_point deadline_;
    Cancel cancel_;
    using Signature = std::pair<detail::EventKey, std::vector<detail::EventKey>>;
    std::map<Signature, size_t> signatures_;
    std::map<std::pair<size_t,size_t>, size_t> pairs_;
    std::vector<size_t> factGroups_;
    void partial(const std::string &why) {
        out_.complete = false;
        if (std::find(out_.reasons.begin(), out_.reasons.end(), why) == out_.reasons.end()) out_.reasons.push_back(why);
    }
    bool time() {
        checkpoint(cancel_);
        if (std::chrono::steady_clock::now() < deadline_) return true;
        partial("budget_time"); return false;
    }
    bool spend() {
        if (!time()) return false;
        if (out_.work >= out_.limits.maxWork) { partial("budget_work"); return false; }
        ++out_.work; return true;
    }
    bool member(size_t index) {
        if (!spend()) return false;
        if (out_.processedFacts >= out_.limits.maxMembers) { partial("budget_members"); return false; }
        const auto &v = fact(input_, index);
        bool known = !v.clock.signal.empty() && v.clock.bits.width;
        // ClockEvent has no async classification; Core's shared EventInfo may carry a default type.
        auto clock = v.clock; clock.type.clear();
        Signature signature{detail::eventKey(clock), {}};
        for (const auto &event : v.async) {
            if (!spend()) return false;
            known = known && !event.signal.empty() && event.bits.width;
            signature.second.push_back(detail::eventKey(event));
        }
        auto found = known ? signatures_.find(signature) : signatures_.end();
        size_t group;
        if (found == signatures_.end()) {
            if (out_.groups.size() >= out_.limits.maxGroups) { partial("budget_groups"); return false; }
            group = out_.groups.size();
            out_.groups.push_back({std::move(clock), v.async, known, {}, {}});
            if (known) signatures_.emplace(std::move(signature), group);
            else partial("event_identity_incomplete"); // Unidentified events never prove equality.
        } else group = found->second;
        const auto source = input_.facts[index].signal;
        auto [it, inserted] = pairs_.try_emplace({group, source}, out_.signals.size());
        auto &g = out_.groups[group];
        if (inserted) {
            out_.signals.push_back({source, group, {}, {}}); g.signals.push_back(it->second); ++g.totals.signals;
        }
        out_.signals[it->second].facts.push_back(index); factGroups_.push_back(group);
        ++g.totals.facts; g.totals.factBits = checkedCountAdd(g.totals.factBits, v.bits.width);
        ++out_.processedFacts; return true;
    }
    void coverage() {
        for (auto &s : out_.signals) {
            if (!spend()) break;
            std::vector<BitRange> ranges;
            for (const auto i : s.facts) { if (!spend()) break; ranges.push_back(fact(input_, i).bits); }
            if (ranges.size() != s.facts.size()) break;
            bool interrupted = false;
            auto value = detail::coverageForIntervals(ranges, out_.limits.maxSegments - out_.segmentCount, [&] {
                if (spend()) return true; interrupted = true; return false;
            });
            if (!value) { if (!interrupted) partial("budget_segments"); break; }
            out_.segmentCount += value->segments.size();
            auto &t = out_.groups[s.group].totals;
            ++t.summarizedSignals; t.summarizedFacts += s.facts.size();
            t.coveredBits = checkedCountAdd(t.coveredBits, value->coveredBits); t.overlapBits = checkedCountAdd(t.overlapBits, value->overlapBits);
            t.maxMultiplicity = std::max(t.maxMultiplicity, value->maxMultiplicity); s.coverage = std::move(value);
        }
        if (std::any_of(out_.signals.begin(), out_.signals.end(), [](const auto &s) { return !s.coverage; })) partial("group_coverage_incomplete");
    }
    std::optional<SignalEventAttribution> attribution(size_t signal, const std::set<size_t> &groups) {
        const auto &facts = input_.signals[signal].facts;
        auto attempt = detail::attributeGroupIntervals(facts.size(), [&](size_t i) {
            const auto f = facts[i]; return detail::GroupBitInterval{fact(input_, f).bits, factGroups_[f]};
        }, out_.limits.maxSegments - out_.segmentCount, out_.limits.maxOverlapMembers - out_.overlapMembers, [&] { return spend(); });
        if (!attempt.value) { if (!attempt.reason.empty()) partial(attempt.reason); return {}; }
        return SignalEventAttribution{signal, {groups.begin(), groups.end()}, attempt.value->crossGroupBits, std::move(attempt.value->segments)};
    }
    void attributions() {
        for (size_t i = 0; i < input_.signals.size(); ++i) {
            if (!spend()) break;
            bool all = true, known = true;
            std::set<size_t> groups;
            for (const auto f : input_.signals[i].facts) {
                if (!spend()) { all = false; break; }
                if (f >= factGroups_.size()) { all = false; continue; }
                const auto g = factGroups_[f]; groups.insert(g); known = known && out_.groups[g].identityComplete;
            }
            if (!all || !known) { partial("attribution_incomplete"); continue; }
            if (groups.size() > 1) {
                auto value = attribution(i, groups); if (!value) break;
                out_.segmentCount += value->segments.size();
                for (const auto &segment : value->segments) out_.overlapMembers += segment.groups.size();
                out_.crossGroupBits = checkedCountAdd(out_.crossGroupBits, value->crossGroupBits);
                out_.attributions.push_back(std::move(*value));
            }
            ++out_.checkedSignals;
        }
        if (out_.checkedSignals != out_.inputSignals) partial("attribution_incomplete");
    }
  public:
    Walk(const RegisterStatistics &input, EventGroupLimits limits, std::chrono::steady_clock::time_point deadline, Cancel cancel)
        : input_(input), deadline_(deadline), cancel_(cancel) {
        out_.snapshotId = input.snapshot.snapshotId; out_.scope = input.scope; out_.limits = limits;
        out_.inputFacts = input.facts.size(); out_.inputSignals = input.signals.size();
    }
    RegisterEventGroups run() {
        checkpoint(cancel_); if (!input_.complete) partial("statistics_incomplete");
        for (size_t i = 0; i < input_.facts.size(); ++i) if (!member(i)) break;
        coverage(); attributions(); (void)time(); return std::move(out_);
    }
};
}
void detail::validateEventGroupLimits(const EventGroupLimits &r) {
    if (!r.maxGroups || r.maxGroups > 100000 || !r.maxMembers || r.maxMembers > 1000000 || !r.maxSegments || r.maxSegments > 2000000 ||
        !r.maxOverlapMembers || r.maxOverlapMembers > 1000000 || !r.maxWork || r.maxWork > 10000000 || !r.maxMillis || r.maxMillis > 60000)
        throw Error{ErrorCode::BadRequest, "Invalid register event grouping budget"};
}
Result<RegisterEventGroups> detail::eventGroupsWithDeadline(const RegisterStatistics &input, const EventGroupLimits &limits,
    std::chrono::steady_clock::time_point deadline, Cancel cancel) try {
    validateEventGroupLimits(limits); checkpoint(cancel); validateStatisticsReferences(input, cancel);
    return Walk(input, limits, deadline, cancel).run();
} catch (const Error &error) { return error; }
Result<RegisterEventGroups> groupRegisterEvents(const RegisterStatistics &input, const EventGroupLimits &limits, Cancel cancel) {
    try { detail::validateEventGroupLimits(limits); } catch (const Error &error) { return error; }
    return detail::eventGroupsWithDeadline(input, limits,
        std::chrono::steady_clock::now() + std::chrono::milliseconds(int64_t(limits.maxMillis)), cancel);
}
}
