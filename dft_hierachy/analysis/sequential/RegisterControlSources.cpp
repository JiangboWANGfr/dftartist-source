#include "RegisterControlSourcesInternal.h"
#include "RegisterFanoutInternal.h"
#include "SourceIdentity.h"
#include "ChangedRegisterCoverage.h"
#include "GroupIntervalAttribution.h"
#include "IntervalCoverage.h"
#include <algorithm>
#include <map>
#include <set>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register control source summary cancelled"};}
class Summarize {
    const RegisterStatistics &s_;
    const RegisterControlProfile &p_;
    const RegisterGeneration &g_;
    RegisterControlSources out_;
    Time end_;
    Cancel cancel_;
    std::map<detail::SourceKey,size_t> keys_;
    void partial(const std::string &r) {
        out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);
    }
    void partial(RegisterSourceGroup &group,const std::string &r) {
        group.membersComplete=false;if(std::find(group.reasons.begin(),group.reasons.end(),r)==group.reasons.end()) group.reasons.push_back(r);partial(r);
    }
    bool spend() {
        checkpoint(cancel_);
        if(std::chrono::steady_clock::now()>=end_) {partial("budget_time");return false;}
        if(out_.work>=out_.limits.maxWork) {partial("budget_work");return false;}
        ++out_.work;return true;
    }
    void rows() {
        for(size_t i=0;i<out_.fanout.nodes.size();++i) {
            if(out_.rows.size()>=out_.limits.maxRows) {partial("budget_rows");break;}
            if(!spend()) break;
            const auto &n=g_.graph.nodes[out_.fanout.nodes[i].node];
            RegisterSourceRow row;row.node=i;row.kind=n.source?n.source->kind:"unresolved";
            if(n.source&&n.source->kind!="generated") {
                const auto key=detail::sourceKey(*n.source);auto found=keys_.find(key);
                if(found==keys_.end()) {
                    if(out_.groups.size()>=out_.limits.maxSources) {partial("budget_sources");break;}
                    const auto index=out_.groups.size();RegisterSourceGroup group;group.source=*n.source;
                    out_.groups.push_back(std::move(group));found=keys_.emplace(key,index).first;
                }
                row.group=found->second;out_.groups[*row.group].nodes.push_back(i);
            }
            out_.rows.push_back(std::move(row)); // Reverse membership and row are published together.
        }
    }
    void coverage() {
        for(auto &group:out_.groups) {
            std::set<size_t> raw;bool stopped=false;
            for(const auto ni:group.nodes) {
                if(!spend()) {stopped=true;break;}
                const auto &node=out_.fanout.nodes[ni];if(!node.membersComplete) partial(group,"fanout_members_incomplete");
                for(const auto gi:node.rawGroups) {if(!spend()) {stopped=true;break;}raw.insert(gi);}
                if(stopped) break;
            }
            group.rawGroups.assign(raw.begin(),raw.end());if(stopped) partial(group,"source_groups_unfinished");
            detail::ChangedRegisterCoverage c{s_,p_.events,group.signals,group.totals,out_.limits.maxMembers,out_.limits.maxSegments,
                out_.memberFacts,out_.segmentCount,[&] {return spend();},[&](const std::string &r) {partial(r);},
                [&](const std::string &r) {partial(group,r);}};
            c.membersReason="source_members_unfinished";c.coverageReason="source_coverage_unfinished";
            detail::collectChangedFacts(c,group.rawGroups);detail::summarizeChangedFacts(c);
        }
    }
    void attributions() {
        // At most maxMembers entries; the index is temporary and borrows original fact IDs only.
        std::map<size_t,std::vector<std::pair<size_t,size_t>>> signals;bool stopped=false;
        for(size_t gi=0;gi<out_.groups.size();++gi) {
            const auto &group=out_.groups[gi];if(!group.membersComplete) out_.attributionsComplete=false;
            for(const auto &signal:group.signals) {
                if(!spend()) {stopped=true;break;}
                for(const auto f:signal.facts) {if(!spend()) {stopped=true;break;}signals[signal.signal].emplace_back(f,gi);}
                if(stopped) break;
            }
            if(stopped) break;
        }
        out_.attributionSignals=signals.size();
        if(stopped) {out_.attributionsComplete=false;partial("attribution_unfinished");return;}
        for(const auto &[si,members]:signals) {
            if(!spend()) break;
            std::set<size_t> groups;bool all=true;
            for(const auto &[f,gi]:members) {(void)f;if(!spend()) {all=false;break;}groups.insert(gi);}
            if(!all) break;
            if(groups.size()>1) {
                auto attempt=detail::attributeGroupIntervals(members.size(),[&](size_t i) {
                    const auto [f,gi]=members[i];const auto &ref=s_.facts[f];return detail::GroupBitInterval{s_.pages[ref.page].response.result.items[ref.item].bits,gi};
                },out_.limits.maxSegments-out_.segmentCount,out_.limits.maxOverlapMembers-out_.overlapMembers,[&] {return spend();});
                if(!attempt.value) {if(!attempt.reason.empty()) partial(attempt.reason);break;}
                auto &v=*attempt.value;out_.segmentCount+=v.segments.size();
                for(const auto &segment:v.segments) out_.overlapMembers+=segment.groups.size();
                out_.crossGroupBits=detail::checkedCountAdd(out_.crossGroupBits,v.crossGroupBits);
                out_.attributions.push_back({si,{groups.begin(),groups.end()},v.crossGroupBits,std::move(v.segments)});
            }
            ++out_.checkedSignals;
        }
        if(out_.checkedSignals!=out_.attributionSignals) out_.attributionsComplete=false;
        if(!out_.attributionsComplete) partial("attribution_unfinished");
    }
  public:
    Summarize(const RegisterStatistics &s,const RegisterControlProfile &p,const RegisterGeneration &g,RegisterFanout fanout,
        const RegisterSourceLimits &l,Time end,Cancel c):s_(s),p_(p),g_(g),end_(end),cancel_(c) {
        out_.snapshotId=p.snapshotId;out_.scope=p.scope;out_.limits=l;out_.fanout=std::move(fanout);out_.inputNodes=out_.fanout.nodes.size();
    }
    RegisterControlSources run() {
        checkpoint(cancel_);if(!out_.fanout.complete) partial("fanout_incomplete");
        rows();coverage();attributions();checkpoint(cancel_);return std::move(out_);
    }
};
Result<RegisterControlSources> execute(const RegisterStatistics &s,const RegisterControlProfile &p,const RegisterGeneration &g,
    const RegisterSourceLimits &l,std::optional<Time> end,Cancel c,std::optional<Time> outer={}) try {
    detail::validateRegisterSourceLimits(l);checkpoint(c);
    auto fanout=outer?detail::fanoutWithDeadline(s,p,g,l.fanout,std::min(*outer,std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.fanout.maxMillis))),c):registerGenerationFanout(s,p,g,l.fanout,c);
    if(!fanout) return fanout.error();
    auto deadline=end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis)));
    if(outer) deadline=std::min(deadline,*outer);
    return Summarize(s,p,g,std::move(*fanout),l,deadline,c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterSourceLimits(const RegisterSourceLimits &l) {
    validateRegisterFanoutLimits(l.fanout);
    if(!l.maxRows||l.maxRows>10000||!l.maxSources||l.maxSources>10000||!l.maxMembers||l.maxMembers>1000000||
        !l.maxSegments||l.maxSegments>2000000||!l.maxOverlapMembers||l.maxOverlapMembers>1000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register control source budget"};
}
Result<RegisterControlSources> detail::sourcesBefore(const RegisterStatistics &s,const RegisterControlProfile &p,const RegisterGeneration &g,
    const RegisterSourceLimits &l,Time end,Cancel c) {return execute(s,p,g,l,{},c,end);}
Result<RegisterControlSources> detail::sourcesWithDeadline(const RegisterStatistics &s,const RegisterControlProfile &p,const RegisterGeneration &g,
    const RegisterSourceLimits &l,Time end,Cancel c) {return execute(s,p,g,l,end,c);}
Result<RegisterControlSources> summarizeRegisterControlSources(const RegisterStatistics &s,const RegisterControlProfile &p,const RegisterGeneration &g,
    const RegisterSourceLimits &l,Cancel c) {return execute(s,p,g,l,{},c);}
}
