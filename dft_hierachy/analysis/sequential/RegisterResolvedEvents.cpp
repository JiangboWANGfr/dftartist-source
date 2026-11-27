#include "RegisterResolvedEventsInternal.h"
#include "RegisterControlProfileInternal.h"
#include "RegisterStatisticsInternal.h"
#include "RegisterEventGroupsInternal.h"
#include "EventIdentity.h"
#include "SourceIdentity.h"
#include "ResolvedEventIdentity.h"
#include "GroupIntervalAttribution.h"
#include <algorithm>
#include <map>
#include <set>

namespace dft::sequential {
namespace {
using namespace hier;
using namespace hier::model;
void checkpoint(Cancel c) { if (c.stop_requested()) throw Error{ErrorCode::Cancelled, "Resolved register event grouping cancelled"}; }
const RegisterInfo &fact(const RegisterStatistics &s, size_t i) {
    const auto &f = s.facts[i]; return s.pages[f.page].response.result.items[f.item];
}

class Group {
    const RegisterStatistics &s_;
    const RegisterControlProfile &p_;
    RegisterResolvedEvents out_;
    std::chrono::steady_clock::time_point deadline_;
    Cancel cancel_;
    std::map<detail::ResolvedEventKey,size_t> keys_;
    std::map<std::pair<size_t,size_t>,size_t> pairs_;
    std::vector<std::optional<size_t>> factGroups_;
    void partial(const std::string &why) {
        out_.complete = false;
        if (std::find(out_.reasons.begin(), out_.reasons.end(), why) == out_.reasons.end()) out_.reasons.push_back(why);
    }
    bool time() {
        checkpoint(cancel_); if (std::chrono::steady_clock::now() < deadline_) return true;
        partial("budget_time"); return false;
    }
    bool spend() {
        if (!time()) return false;
        if (out_.work >= out_.limits.maxWork) { partial("budget_work"); return false; }
        ++out_.work; return true;
    }
    bool row(size_t raw) {
        if (!spend()) return false;
        if (out_.rows.size() >= out_.limits.maxRows) { partial("budget_rows"); return false; }
        ResolvedGroupRow r; r.rawGroup = raw;
        const auto finish = [&] { out_.rows.push_back(std::move(r)); ++out_.processedRawGroups; };
        if (raw >= p_.groupControls.size()) { r.reasons.push_back("profile_group_not_visited"); partial("event_sources_unresolved"); finish(); return true; }
        const auto &map = p_.groupControls[raw]; const auto &g = p_.events.groups[raw];
        std::vector<ResolvedControlEvent> events;
        const auto event = [&](std::optional<size_t> check, const EventInfo &original, bool clock) {
            if (!spend()) return false;
            ++out_.visitedEvents;
            if (!check || !p_.checks[*check].source) {
                const std::string reason = clock ? "clock_source_unresolved" : "async_source_unresolved";
                if (std::find(r.reasons.begin(), r.reasons.end(), reason) == r.reasons.end()) r.reasons.push_back(reason);
            } else events.push_back({*p_.checks[*check].source, original.edge, clock ? "" : original.type});
            return true;
        };
        if (!event(map.clockCheck, g.clock, true)) return false;
        for (size_t i = 0; i < g.async.size(); ++i) if (!event(map.asyncChecks[i], g.async[i], false)) return false;
        if (!r.reasons.empty()) { partial("event_sources_unresolved"); finish(); return true; }
        const auto key = detail::resolvedEventKey(events[0],std::span<const ResolvedControlEvent>(events).subspan(1),[&] { return spend(); });
        if (!key) return false;
        auto found = keys_.find(*key); size_t group;
        if (found == keys_.end()) {
            if (out_.groups.size() >= out_.limits.maxGroups) { partial("budget_groups"); return false; }
            group = out_.groups.size(); keys_.emplace(*key, group);
            out_.groups.push_back({events[0], {events.begin()+1,events.end()}, {}, {}, {}});
        } else group = found->second;
        r.resolvedGroup = group; ++out_.resolvedRows; auto &result = out_.groups[group]; result.rawGroups.push_back(raw);
        bool all = true;
        for (const auto si : g.signals) {
            if (!spend()) { all = false; break; }
            const auto &s = p_.events.signals[si];
            for (const auto f : s.facts) {
                if (!spend()) { all = false; break; }
                if (out_.assignedFacts >= out_.limits.maxMembers) { partial("budget_members"); all = false; break; }
                auto [it,fresh] = pairs_.try_emplace({group,s.signal},out_.signals.size());
                if (fresh) { out_.signals.push_back({s.signal,group,{}, {}}); result.signals.push_back(it->second); ++result.totals.signals; }
                out_.signals[it->second].facts.push_back(f); factGroups_[f] = group; ++out_.assignedFacts; ++result.totals.facts;
                result.totals.factBits = detail::checkedCountAdd(result.totals.factBits, fact(s_,f).bits.width);
            }
            if (!all) break;
        }
        r.membersComplete = all; if (!all) r.reasons.push_back("members_incomplete"); finish(); return all;
    }
    void coverage() {
        for (auto &s : out_.signals) {
            if (!spend()) break;
            std::vector<BitRange> ranges;
            for (const auto f : s.facts) { if (!spend()) break; ranges.push_back(fact(s_,f).bits); }
            if (ranges.size() != s.facts.size()) break;
            bool interrupted = false;
            auto c = detail::coverageForIntervals(ranges,out_.limits.maxSegments-out_.segmentCount,[&] {
                if (spend()) return true; interrupted = true; return false;
            });
            if (!c) { if (!interrupted) partial("budget_segments"); break; }
            auto &t = out_.groups[s.group].totals; ++t.summarizedSignals; t.summarizedFacts += s.facts.size();
            t.coveredBits = detail::checkedCountAdd(t.coveredBits,c->coveredBits); t.overlapBits = detail::checkedCountAdd(t.overlapBits,c->overlapBits);
            t.maxMultiplicity = std::max(t.maxMultiplicity,c->maxMultiplicity); out_.segmentCount += c->segments.size(); s.coverage = std::move(c);
        }
        if (std::any_of(out_.signals.begin(),out_.signals.end(),[](const auto &s) { return !s.coverage; })) partial("coverage_unfinished");
    }
    void attributions() {
        for (size_t si = 0; si < s_.signals.size(); ++si) {
            if (!spend()) break;
            bool all = true; std::set<size_t> groups; const auto &facts = s_.signals[si].facts;
            for (const auto f : facts) {
                if (!spend()) { all = false; break; }
                if (!factGroups_[f]) { all = false; continue; } groups.insert(*factGroups_[f]);
            }
            if (!all) { partial("attribution_incomplete"); continue; }
            if (groups.size()>1) {
                auto attempt = detail::attributeGroupIntervals(facts.size(),[&](size_t i) {
                    const auto f=facts[i];return detail::GroupBitInterval{fact(s_,f).bits,*factGroups_[f]};
                },out_.limits.maxSegments-out_.segmentCount,out_.limits.maxOverlapMembers-out_.overlapMembers,[&] { return spend(); });
                if (!attempt.value) { if (!attempt.reason.empty()) partial(attempt.reason); break; }
                auto &v=*attempt.value; out_.segmentCount+=v.segments.size();
                for (const auto &segment:v.segments) out_.overlapMembers+=segment.groups.size();
                out_.crossGroupBits=detail::checkedCountAdd(out_.crossGroupBits,v.crossGroupBits);
                out_.attributions.push_back({si,{groups.begin(),groups.end()},v.crossGroupBits,std::move(v.segments)});
            }
            ++out_.checkedSignals;
        }
        if (out_.checkedSignals!=s_.signals.size()) partial("attribution_incomplete");
    }
  public:
    Group(const RegisterStatistics &s,const RegisterControlProfile &p,const ResolvedEventLimits &limits,
        std::chrono::steady_clock::time_point deadline,Cancel cancel)
        :s_(s),p_(p),deadline_(deadline),cancel_(cancel),factGroups_(s.facts.size()) {
        out_.snapshotId=p.snapshotId;out_.scope=p.scope;out_.limits=limits;out_.inputRawGroups=p.events.groups.size();out_.inputFacts=s.facts.size();
    }
    RegisterResolvedEvents run() {
        checkpoint(cancel_); if (!s_.complete || !p_.events.complete || !p_.complete) partial("profile_incomplete");
        for (size_t i=0;i<p_.events.groups.size();++i) if (!row(i)) break;
        coverage();attributions();(void)time();return std::move(out_);
    }
};
}
void detail::validateResolvedEventLimits(const ResolvedEventLimits &l) {
    if (!l.maxRows||l.maxRows>100000||!l.maxGroups||l.maxGroups>100000||!l.maxMembers||l.maxMembers>1000000||
        !l.maxSegments||l.maxSegments>2000000||!l.maxOverlapMembers||l.maxOverlapMembers>1000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid resolved register event budget"};
}
Result<RegisterResolvedEvents> detail::resolvedEventsWithDeadline(const RegisterStatistics &s,const RegisterControlProfile &p,
    const ResolvedEventLimits &limits,std::chrono::steady_clock::time_point deadline,Cancel cancel) try {
    validateResolvedEventLimits(limits);checkpoint(cancel);validateRegisterProfileReferences(s,p,cancel);return Group(s,p,limits,deadline,cancel).run();
} catch(const Error &e) {return e;}
Result<RegisterResolvedEvents> groupResolvedRegisterEvents(const RegisterStatistics &s,const RegisterControlProfile &p,
    const ResolvedEventLimits &l,Cancel c) {
    try {detail::validateResolvedEventLimits(l);} catch(const Error &e) {return e;}
    return detail::resolvedEventsWithDeadline(s,p,l,std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis)),c);
}
}
