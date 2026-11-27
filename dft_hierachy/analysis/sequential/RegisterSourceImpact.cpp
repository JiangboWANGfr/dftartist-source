#include "RegisterSourceImpactInternal.h"
#include "RegisterSourceTransitionsInternal.h"
#include "AttributionCountsInternal.h"
#include <algorithm>
#include <map>
#include <set>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register source impact cancelled"};}
void require(bool valid) {if(!valid) throw Error{ErrorCode::BadRequest,"Source impact requires valid instance/definition references"};}
class Impact {
    RegisterSourceImpactReport out_;
    const RegisterStatistics &statistics_; // Borrowed only while run() executes synchronously.
    Time end_;
    Cancel cancel_;
    void partial(const std::string &r) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<end_) return true;partial("budget_source_impact_time");return false;}
    bool spend() {
        if(!time()) return false;
        if(out_.work>=out_.limits.maxWork) {partial("budget_source_impact_work");return false;}
        ++out_.work;return true;
    }
    bool comparison(size_t index) {
        auto &dest=out_.comparisons[index];const auto &input=out_.analysis.comparisons[index];dest.state="partial";
        if(!time()) return false;
        std::map<size_t,std::vector<SourceImpactMember>> groups;
        std::map<size_t,std::set<size_t>> definitionInstances;
        uint64_t inputMembers=0;
        const auto &attribution=out_.analysis.analysis.comparisons[index];
        for(size_t c=0;c<input.cohorts.size();++c) {
            if(!spend()) return false;
            for(size_t m=0;m<input.cohorts[c].members.size();++m) {
                if(!spend()) return false;
                if(inputMembers>=out_.limits.maxInputMembers-out_.inputMembers) {partial("budget_source_impact_input_members");return false;}
                const auto &member=input.cohorts[c].members[m];const auto signal=attribution.rows[member.row].signal;
                require(signal<statistics_.signals.size());const auto instance=statistics_.signals[signal].instance;
                require(instance<statistics_.instances.size());
                if(!groups.contains(instance)) {
                    const auto &inst=statistics_.instances[instance];const auto d=inst.definition;
                    require(d<statistics_.definitions.size());const auto &def=statistics_.definitions[d];
                    require(inst.info.def==def.ref&&inst.info.defName==def.name);
                    if(!definitionInstances.contains(d)) {
                        std::set<size_t> ids;
                        for(const auto id:def.instances) {
                            if(!spend()) return false;
                            require(id<statistics_.instances.size()&&statistics_.instances[id].definition==d&&
                                statistics_.instances[id].info.def==def.ref&&ids.insert(id).second);
                        }
                        definitionInstances.emplace(d,std::move(ids));
                    }
                    require(definitionInstances.at(d).contains(instance));
                }
                ++inputMembers;groups[instance].push_back({c,m});
            }
        }
        dest.inputCollected=true;dest.inputMembers=inputMembers;out_.inputMembers+=inputMembers;
        if(!dest.inputComplete) partial("source_impact_inputs_incomplete");
        std::map<size_t,SourceImpactDefinition> definitions;
        for(const auto &[instance,members]:groups) {
            if(out_.instanceRows>=out_.limits.maxInstances) {partial("budget_source_impact_instances");break;}
            if(!spend()) break;
            const auto d=statistics_.instances[instance].definition;const bool fresh=!definitions.contains(d);
            if(fresh&&out_.definitionRows>=out_.limits.maxDefinitions) {partial("budget_source_impact_definitions");break;}
            if(members.size()>out_.limits.maxMembers-out_.members) {partial("budget_source_impact_members");break;}
            SourceImpactInstance row;row.instance=instance;row.definition=d;bool ready=true;
            for(const auto &ref:members) {
                if(!spend()) {ready=false;break;}
                const auto &cohort=input.cohorts[ref.cohort];const auto &m=cohort.members[ref.member];
                const auto width=attribution.rows[m.row].segments[m.segment].bits.width;
                row.counts.coveredBits=detail::checkedCountAdd(row.counts.coveredBits,width);
                auto &count=cohort.changed?row.counts.changedBits:row.counts.retainedOnlyBits;count=detail::checkedCountAdd(count,width);
                row.members.push_back(ref);
            }
            if(!ready) break;
            SourceAttributionCounts totals=dest.totals,defTotals=fresh?SourceAttributionCounts{}:definitions.at(d).counts;
            detail::addSourceAttributionCounts(totals,row.counts);detail::addSourceAttributionCounts(defTotals,row.counts);
            // A whole instance, its definition membership, and both summary views commit together.
            if(fresh) {SourceImpactDefinition def;def.definition=d;definitions.emplace(d,std::move(def));++out_.definitionRows;}
            auto &def=definitions.at(d);def.instances.push_back(instance);def.counts=defTotals;
            dest.totals=totals;out_.members+=row.members.size();++out_.instanceRows;dest.instances.push_back(std::move(row));
        }
        for(auto &[id,def]:definitions) {(void)id;dest.definitions.push_back(std::move(def));}
        if(dest.instances.size()!=groups.size()) {partial("source_impact_unfinished");return false;}
        dest.state=dest.inputComplete?"complete":"partial";return true;
    }
  public:
    Impact(RegisterSourceTransitionReport input,const RegisterStatistics &s,const RegisterSourceImpactLimits &l,Time end,Cancel c):statistics_(s),end_(end),cancel_(c) {
        out_.analysis=std::move(input);out_.limits=l;
        for(const auto &v:out_.analysis.comparisons) {
            SourceImpactComparison dest;dest.scenario=v.scenario;dest.inputCohorts=v.cohorts.size();dest.inputComplete=v.state=="complete";dest.sourcesComplete=v.sourcesComplete;
            out_.comparisons.push_back(std::move(dest));
        }
    }
    RegisterSourceImpactReport run() {
        checkpoint(cancel_);if(!out_.analysis.complete) partial("analysis_incomplete");
        for(size_t i=0;i<out_.comparisons.size();++i) if(!comparison(i)) {partial("source_impact_unfinished");break;}
        (void)time();return std::move(out_);
    }
};
Result<RegisterSourceImpactReport> execute(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceImpactLimits &l,std::optional<Time> end,Cancel c) try {
    detail::validateRegisterSourceImpactLimits(l);checkpoint(c);
    auto input=compareRegisterSourceTransitions(d,s,r,l.transitions,c);if(!input) return input.error();
    return Impact(std::move(*input),s,l,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterSourceImpactLimits(const RegisterSourceImpactLimits &l) {
    validateRegisterSourceTransitionLimits(l.transitions);
    if(!l.maxInstances||l.maxInstances>100000||!l.maxDefinitions||l.maxDefinitions>100000||!l.maxMembers||l.maxMembers>2000000||
        !l.maxInputMembers||l.maxInputMembers>2000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register source impact budget"};
}
Result<RegisterSourceImpactReport> detail::sourceImpactWithDeadline(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceImpactLimits &l,Time end,Cancel c) {return execute(d,s,r,l,end,c);}
Result<RegisterSourceImpactReport> compareRegisterSourceImpact(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceImpactLimits &l,Cancel c) {return execute(d,s,r,l,{},c);}
}
