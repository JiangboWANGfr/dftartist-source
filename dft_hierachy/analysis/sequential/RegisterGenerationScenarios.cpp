#include "RegisterGenerationScenariosInternal.h"
#include "RegisterGenerationInternal.h"
#include "GenerationComparisonInternal.h"
#include "ChangedRegisterCoverage.h"
#include "SourceIdentity.h"
#include <algorithm>
#include <map>

namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
using Key=detail::SourcePointKey;
Key key(const model::TracePoint &p) {return {p.slice.ref,p.slice.bits.lsb,p.slice.bits.width,p.side};}
template<class T> T take(Result<T> v) {if(!v) throw v.error();return std::move(v.value());}
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register generation scenarios cancelled"};}
class Batch {
    Design &d_;
    const RegisterStatistics &s_;
    RegisterGenerationScenarioReport out_;
    Time deadline_;
    Cancel cancel_;
    void partial(const std::string &r) {
        out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);
    }
    void partial(RegisterGenerationImpact &c,const std::string &r) {
        c.complete=false;if(std::find(c.reasons.begin(),c.reasons.end(),r)==c.reasons.end()) c.reasons.push_back(r);partial(r);
    }
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<deadline_) return true;partial("budget_post_time");return false;}
    bool spend() {
        if(!time()) return false;
        if(out_.work>=out_.limits.maxWork) {partial("budget_impact_work");return false;}
        ++out_.work;return true;
    }
    uint64_t remaining(uint64_t cap) const {
        const auto ms=std::chrono::duration_cast<std::chrono::milliseconds>(deadline_-std::chrono::steady_clock::now()).count();
        return std::min(cap,uint64_t(std::max(int64_t{1},int64_t(ms))));
    }
    void generations() {
        out_.scenarios.resize(out_.analysis.scenarios.size());
        for(size_t i=0;i<out_.scenarios.size();++i) {
            auto &dest=out_.scenarios[i];const auto &input=out_.analysis.scenarios[i];
            if(!input.profile) {dest.reasons.push_back("profile_not_run");partial("generation_not_run");continue;}
            if(!time()) {dest.reasons.push_back("budget_post_time");partial("generation_not_run");continue;}
            auto l=out_.limits.generation;l.generation.maxMillis=remaining(l.generation.maxMillis);l.maxMillis=remaining(l.maxMillis);
            auto r=detail::registerGenerationBefore(d_,s_,*input.profile,l,deadline_,cancel_);
            if(!r) {auto e=r.error();e.message="Register generation scenario "+input.name+": "+e.message;throw e;}
            dest.generation=std::move(r.value());if(!dest.generation->complete) partial("generation_incomplete");
        }
    }
    void compareStructure() {
        std::vector<GenerationContext> contexts;
        for(size_t i=0;i<out_.scenarios.size();++i) if(out_.scenarios[i].generation)
            contexts.push_back({i,std::cref(out_.scenarios[i].generation->graph)});
        const detail::GenerationComparisonInput view{out_.analysis.snapshotId,out_.analysis.scope,out_.analysis.complete,out_.scenarios.size(),
            [&](size_t i) {return bool(out_.scenarios[i].generation);},
            [&](size_t i) {return out_.analysis.scenarios[i].profile->checks.size();},
            [&](size_t i,size_t j)->const model::TracePoint & {return out_.analysis.scenarios[i].profile->checks[j].control.point;}};
        auto l=out_.limits.comparison;l.maxMillis=remaining(l.maxMillis);
        out_.structure=take(detail::generationComparisonFromInput(view,contexts,l,
            std::min(deadline_,std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),cancel_));
        if(!out_.structure.complete) partial("structure_comparison_incomplete");
    }
    void impact(size_t scenario) {
        RegisterGenerationImpact c;c.scenario=scenario;c.inputGroups=out_.analysis.events.groups.size();
        const auto &a=out_.scenarios[0].generation;const auto &b=out_.scenarios[scenario].generation;
        if(!a) partial(c,"baseline_generation_not_run");
        if(!b) partial(c,"scenario_generation_not_run");
        if(!a||!b) {out_.impacts.push_back(std::move(c));return;}
        if(!out_.analysis.complete||!a->complete||!b->complete||!out_.structure.complete) partial(c,"analysis_incomplete");
        const auto &rows=out_.structure.comparisons[scenario-1].controls;std::map<Key,size_t> indices;
        for(size_t i=0;i<rows.size();++i) {checkpoint(cancel_);indices.emplace(key(rows[i].point),i);}
        size_t eventOffset=0;std::vector<size_t> changed;
        for(size_t gi=0;gi<out_.analysis.events.groups.size();++gi) {
            const auto count=1+out_.analysis.events.groups[gi].async.size();
            if(out_.rows>=out_.limits.maxRows) {partial("budget_impact_rows");break;}
            if(count>out_.limits.maxEvents-out_.eventEntries) {partial("budget_impact_events");break;}
            if(!spend()) break;
            RegisterGenerationImpactRow row;row.rawGroup=gi;bool stopped=false,known=true,different=false;
            for(size_t e=0;e<count;++e) {
                if(!spend()) {stopped=true;break;}
                std::optional<size_t> match;
                if(eventOffset+e<a->events.size()&&eventOffset+e<b->events.size()) {
                    const auto &x=a->events[eventOffset+e];const auto &y=b->events[eventOffset+e];
                    if(x.check&&x.node&&y.check&&y.node) {
                        const auto &px=out_.analysis.scenarios[0].profile->checks[*x.check].control.point;
                        const auto &py=out_.analysis.scenarios[scenario].profile->checks[*y.check].control.point;
                        const auto found=indices.find(key(px));
                        if(key(px)==key(py)&&found!=indices.end()) match=found->second;
                    }
                }
                if(!match||rows[*match].status=="unresolved") known=false;
                else different=different||rows[*match].status=="changed";
                row.events.push_back(match);
            }
            if(stopped) break;
            row.status=!known?"unresolved":different?"changed":"unchanged";
            if(!known) {row.reasons.push_back("generation_event_unresolved");partial(c,"generation_event_unresolved");}
            if(row.status=="changed") changed.push_back(gi);
            out_.eventEntries+=count;eventOffset+=count;++out_.rows;c.rows.push_back(std::move(row));
        }
        if(c.rows.size()!=c.inputGroups) partial(c,"impact_rows_unfinished");
        detail::ChangedRegisterCoverage coverage{s_,out_.analysis.events,c.changedSignals,c.changedTotals,out_.limits.maxMembers,out_.limits.maxSegments,
            out_.memberFacts,out_.segmentCount,[&] {return spend();},[&](const std::string &r) {partial("impact_"+r);},
            [&](const std::string &r) {partial(c,r);}};
        detail::collectChangedFacts(coverage,changed);detail::summarizeChangedFacts(coverage);
        out_.impacts.push_back(std::move(c));
    }
  public:
    Batch(Design &d,const RegisterStatistics &s,RegisterScenarioReport input,const RegisterGenerationScenarioLimits &l,Time end,Cancel c)
        :d_(d),s_(s),deadline_(end),cancel_(c) {out_.analysis=std::move(input);out_.limits=l;}
    RegisterGenerationScenarioReport run() {
        checkpoint(cancel_);if(!out_.analysis.complete) partial("analysis_incomplete");generations();compareStructure();
        for(size_t i=1;i<out_.scenarios.size();++i) impact(i);
        (void)time();return std::move(out_);
    }
};
Result<RegisterGenerationScenarioReport> execute(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterGenerationScenarioLimits &l,std::optional<Time> end,Cancel c) try {
    detail::validateRegisterGenerationScenarioLimits(l);checkpoint(c);
    auto input=take(compareRegisterScenarios(d,s,r,c));
    return Batch(d,s,std::move(input),l,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterGenerationScenarioLimits(const RegisterGenerationScenarioLimits &l) {
    validateRegisterGenerationLimits(l.generation);validateGenerationComparisonLimits(l.comparison);
    if(!l.maxMillis||l.maxMillis>60000||!l.maxRows||l.maxRows>100000||!l.maxEvents||l.maxEvents>1000000||
        !l.maxWork||l.maxWork>10000000||!l.maxMembers||l.maxMembers>1000000||!l.maxSegments||l.maxSegments>2000000)
        throw Error{ErrorCode::BadRequest,"Invalid register generation scenario impact budget"};
}
Result<RegisterGenerationScenarioReport> detail::registerGenerationScenariosWithDeadline(Design &d,const RegisterStatistics &s,
    const RegisterScenarioRequest &r,const RegisterGenerationScenarioLimits &l,Time end,Cancel c) {return execute(d,s,r,l,end,c);}
Result<RegisterGenerationScenarioReport> compareRegisterGenerationScenarios(Design &d,const RegisterStatistics &s,
    const RegisterScenarioRequest &r,const RegisterGenerationScenarioLimits &l,Cancel c) {return execute(d,s,r,l,{},c);}
}
