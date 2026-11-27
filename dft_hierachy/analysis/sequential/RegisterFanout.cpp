#include "RegisterFanoutInternal.h"
#include "RegisterControlProfileInternal.h"
#include "RegisterGenerationInternal.h"
#include "GenerationGraphValidation.h"
#include "ChangedRegisterCoverage.h"
#include <algorithm>
#include <deque>
#include <map>
#include <set>

namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register fanout cancelled"};}
void require(bool b) {if(!b) throw Error{ErrorCode::BadRequest,"Register fanout requires matching, unmodified profile and generation"};}
void validate(const RegisterStatistics &s,const RegisterControlProfile &p,const RegisterGeneration &g,Cancel c) {
    detail::validateRegisterProfileReferences(s,p,c);detail::validateRegisterGenerationLimits(g.limits);
    require(g.graph.snapshotId==p.snapshotId&&g.graph.scope==p.scope&&g.graph.inputChecks==p.checks.size());
    detail::validateGenerationGraphReferences(g.graph,p.checks.size(),[&](size_t i)->const Control & {return p.checks[i].control;},c);
    require(g.events.size()<=g.limits.maxEvents&&g.work==g.events.size());
    uint64_t count=0;bool mapped=true;
    for(size_t gi=0;gi<p.events.groups.size();++gi) {
        checkpoint(c);const auto &group=p.events.groups[gi];
        for(size_t ei=0;ei<=group.async.size();++ei,++count) {
            checkpoint(c);if(count>=g.events.size()) continue;
            const auto &row=g.events[size_t(count)];std::optional<size_t> check,node;
            if(gi<p.groupControls.size()) check=ei?p.groupControls[gi].asyncChecks[ei-1]:p.groupControls[gi].clockCheck;
            if(check&&*check<g.graph.seeds.size()) node=g.graph.seeds[*check].node;
            require(row.rawGroup==gi&&row.asyncIndex==(ei?std::optional<size_t>{ei-1}:std::nullopt)&&row.check==check&&row.node==node);
            mapped=mapped&&bool(node);
        }
    }
    require(g.inputEvents==count&&g.events.size()<=count&&g.mappingComplete==(mapped&&g.events.size()==count));
    require(!g.complete||(s.complete&&p.complete&&p.events.complete&&g.graph.complete&&g.mappingComplete));
    uint64_t cycleMembers=0;
    for(const auto &cycle:g.graph.cycles) {
        checkpoint(c);require(!g.graph.complete&&cycle.generators.size()>=2&&cycle.generators.front()==cycle.generators.back()&&
            cycle.controls.size()+1==cycle.generators.size()&&cycle.controls.size()<=1000000-cycleMembers);
        cycleMembers+=cycle.controls.size();
        for(size_t i=0;i<cycle.controls.size();++i) {
            checkpoint(c);const auto from=cycle.generators[i],to=cycle.generators[i+1],node=cycle.controls[i];
            require(from<g.graph.generators.size()&&to<g.graph.generators.size()&&node<g.graph.nodes.size());
            const auto &parent=g.graph.generators[from];require((parent.clockNode==node||std::find(parent.asyncNodes.begin(),parent.asyncNodes.end(),node)!=parent.asyncNodes.end())&&g.graph.nodes[node].generator==to);
        }
    }
}
class Walk {
    const RegisterStatistics &s_;
    const RegisterControlProfile &p_;
    const RegisterGeneration &g_;
    RegisterFanout out_;
    Time deadline_;
    Cancel cancel_;
    std::map<size_t,std::vector<size_t>> origins_;
    std::map<size_t,size_t> nodes_;
    bool walkStopped_=false;
    void partial(const std::string &r) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);}
    void partial(FanoutSeed &seed,const std::string &r) {
        seed.traversalComplete=false;if(std::find(seed.reasons.begin(),seed.reasons.end(),r)==seed.reasons.end()) seed.reasons.push_back(r);partial(r);
    }
    void partial(FanoutNode &node,const std::string &r) {
        node.membersComplete=false;if(std::find(node.reasons.begin(),node.reasons.end(),r)==node.reasons.end()) node.reasons.push_back(r);partial(r);
    }
    bool spend() {
        checkpoint(cancel_);
        if(std::chrono::steady_clock::now()>=deadline_) {partial("budget_time");return false;}
        if(out_.work>=out_.limits.maxWork) {partial("budget_work");return false;}
        ++out_.work;return true;
    }
    void origins() {
        for(size_t i=0;i<g_.events.size();++i) {
            if(out_.origins.size()>=out_.limits.maxOrigins) {partial("budget_origins");break;}
            if(!spend()) break;
            const auto index=out_.origins.size();out_.origins.push_back({i,{}});
            const auto &e=g_.events[i];if(e.check&&e.node) origins_[*e.check].push_back(index);
        }
        out_.relevantSeeds=origins_.size();
    }
    bool add(size_t seed,size_t node,std::optional<size_t> parent,std::optional<size_t> generator,std::optional<size_t> async) {
        auto found=nodes_.find(node);
        if(found==nodes_.end()&&out_.nodes.size()>=out_.limits.maxNodes) {partial("budget_nodes");walkStopped_=true;return false;}
        if(out_.links>=out_.limits.maxLinks) {partial("budget_links");walkStopped_=true;return false;}
        if(!spend()) {walkStopped_=true;return false;}
        if(found==nodes_.end()) {
            const auto index=out_.nodes.size();FanoutNode value;value.node=node;out_.nodes.push_back(std::move(value));
            found=nodes_.emplace(node,index).first;
        }
        const auto step=out_.seeds[seed].steps.size();out_.seeds[seed].steps.push_back({node,parent,generator,async});
        out_.nodes[found->second].reaches.push_back({seed,step});++out_.links;return true;
    }
    void seeds() {
        for(const auto &[check,origins]:origins_) {
            if(walkStopped_) break;
            if(out_.seeds.size()>=out_.limits.maxSeeds) {partial("budget_seeds");break;}
            if(!spend()) break;
            const auto id=out_.seeds.size();FanoutSeed seed;seed.check=check;seed.node=g_.graph.seeds[check].node;seed.origins=origins;
            out_.seeds.push_back(std::move(seed));for(const auto o:origins) out_.origins[o].seed=id;
            if(!add(id,out_.seeds[id].node,{},{},{})) {partial(out_.seeds[id],"traversal_unfinished");break;}
            std::set<size_t> seen{out_.seeds[id].node};std::deque<size_t> pending{0};
            while(!pending.empty()&&!walkStopped_) {
                if(!spend()) {partial(out_.seeds[id],"traversal_unfinished");walkStopped_=true;break;}
                const auto parent=pending.front();pending.pop_front();const auto node=out_.seeds[id].steps[parent].node;const auto &n=g_.graph.nodes[node];
                if(!n.source) partial(out_.seeds[id],"source_unresolved");
                if(n.source&&n.source->kind=="generated"&&!n.generator) partial(out_.seeds[id],"generator_unexpanded");
                if(!n.generator) continue;
                const auto &v=g_.graph.generators[*n.generator];if(!v.expanded) partial(out_.seeds[id],"generator_unexpanded");
                for(size_t ei=0;ei<=v.asyncNodes.size();++ei) {
                    if(!spend()) {partial(out_.seeds[id],"traversal_unfinished");walkStopped_=true;break;}
                    const auto child=ei?v.asyncNodes[ei-1]:v.clockNode;
                    if(!child) {partial(out_.seeds[id],"event_missing");continue;}
                    if(!seen.insert(*child).second) continue;
                    const auto step=out_.seeds[id].steps.size();
                    if(!add(id,*child,parent,n.generator,ei?std::optional<size_t>{ei-1}:std::nullopt)) {partial(out_.seeds[id],"traversal_unfinished");break;}
                    pending.push_back(step);
                }
            }
        }
    }
    void coverage() {
        for(auto &node:out_.nodes) {
            std::set<size_t> groups;bool stopped=false;
            for(const auto &reach:node.reaches) {
                if(!spend()) {stopped=true;break;}
                for(const auto oi:out_.seeds[reach.seed].origins) {
                    if(!spend()) {stopped=true;break;}
                    groups.insert(g_.events[out_.origins[oi].event].rawGroup);
                }
                if(stopped) break;
            }
            node.rawGroups.assign(groups.begin(),groups.end());if(stopped) partial(node,"groups_unfinished");
            detail::ChangedRegisterCoverage context{s_,p_.events,node.signals,node.totals,out_.limits.maxMembers,out_.limits.maxSegments,
                out_.memberFacts,out_.segmentCount,[&] {return spend();},[&](const std::string &r) {partial(r);},
                [&](const std::string &r) {partial(node,r);}};
            context.membersReason="fanout_members_unfinished";context.coverageReason="fanout_coverage_unfinished";
            detail::collectChangedFacts(context,node.rawGroups);detail::summarizeChangedFacts(context);
        }
    }
  public:
    Walk(const RegisterStatistics &s,const RegisterControlProfile &p,const RegisterGeneration &g,const RegisterFanoutLimits &l,Time end,Cancel c)
        :s_(s),p_(p),g_(g),deadline_(end),cancel_(c) {
        out_.snapshotId=p.snapshotId;out_.scope=p.scope;out_.limits=l;out_.inputOrigins=g.inputEvents;out_.inputSeeds=g.graph.seeds.size();out_.inputNodes=g.graph.nodes.size();
    }
    RegisterFanout run() {
        checkpoint(cancel_);if(!s_.complete||!p_.complete||!g_.complete) partial("generation_incomplete");
        origins();seeds();coverage();checkpoint(cancel_);return std::move(out_);
    }
};
Result<RegisterFanout> execute(const RegisterStatistics &s,const RegisterControlProfile &p,const RegisterGeneration &g,
    const RegisterFanoutLimits &l,std::optional<Time> end,Cancel c) try {
    detail::validateRegisterFanoutLimits(l);checkpoint(c);validate(s,p,g,c);
    return Walk(s,p,g,l,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterFanoutLimits(const RegisterFanoutLimits &l) {
    if(!l.maxOrigins||l.maxOrigins>1000000||!l.maxSeeds||l.maxSeeds>10000||!l.maxNodes||l.maxNodes>10000||!l.maxLinks||l.maxLinks>1000000||
        !l.maxMembers||l.maxMembers>1000000||!l.maxSegments||l.maxSegments>2000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register fanout budget"};
}
Result<RegisterFanout> detail::fanoutWithDeadline(const RegisterStatistics &s,const RegisterControlProfile &p,const RegisterGeneration &g,
    const RegisterFanoutLimits &l,Time end,Cancel c) {return execute(s,p,g,l,end,c);}
Result<RegisterFanout> registerGenerationFanout(const RegisterStatistics &s,const RegisterControlProfile &p,const RegisterGeneration &g,
    const RegisterFanoutLimits &l,Cancel c) {return execute(s,p,g,l,{},c);}
}
