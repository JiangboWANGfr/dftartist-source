#include "RegisterSourceTransitionsInternal.h"
#include "RegisterSourceAttributionInternal.h"
#include "IntervalCoverage.h"
#include <algorithm>
#include <map>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
using Sources=std::vector<size_t>;
using Key=std::pair<Sources,Sources>;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register source transition cohorts cancelled"};}
class Transitions {
    RegisterSourceTransitionReport out_;
    Time end_;
    Cancel cancel_;
    void partial(const std::string &r) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<end_) return true;partial("budget_source_transition_time");return false;}
    bool spend() {
        if(!time()) return false;
        if(out_.work>=out_.limits.maxWork) {partial("budget_source_transition_work");return false;}
        ++out_.work;return true;
    }
    bool append(Sources &dest,const std::vector<size_t> &rows) {
        for(const auto row:rows) {if(!spend()) return false;dest.push_back(out_.analysis.analysis.rows[row].matrixRow);}
        return true;
    }
    static void canonical(Sources &v) {std::sort(v.begin(),v.end());v.erase(std::unique(v.begin(),v.end()),v.end());}
    bool comparison(size_t index) {
        auto &dest=out_.comparisons[index];const auto &input=out_.analysis.comparisons[index];dest.state="partial";
        if(!time()) return false;
        std::map<Key,std::vector<SourceTransitionMember>> groups;uint64_t inputSegments=0;
        for(size_t row=0;row<input.rows.size();++row) {
            if(!spend()) return false;
            for(size_t segment=0;segment<input.rows[row].segments.size();++segment) {
                if(!spend()) return false;
                if(inputSegments>=out_.limits.maxInputSegments-out_.inputSegments) {partial("budget_source_transition_input_segments");return false;}
                ++inputSegments;const auto &v=input.rows[row].segments[segment];Key key;
                if(!append(key.first,v.removedRows)||!append(key.first,v.retainedRows)||
                    !append(key.second,v.addedRows)||!append(key.second,v.retainedRows)) return false;
                canonical(key.first);canonical(key.second);groups[std::move(key)].push_back({row,segment});
            }
        }
        dest.inputCollected=true;dest.inputSegments=inputSegments;out_.inputSegments+=inputSegments;
        if(!dest.inputComplete) partial("source_transition_inputs_incomplete");
        for(const auto &[key,members]:groups) {
            if(out_.cohorts>=out_.limits.maxCohorts) {partial("budget_source_transition_cohorts");return false;}
            if(!spend()) return false;
            if(members.size()>out_.limits.maxMembers-out_.members) {partial("budget_source_transition_members");return false;}
            const auto sourceCount=detail::checkedCountAdd(key.first.size(),key.second.size());
            if(sourceCount>out_.limits.maxSources-out_.sources) {partial("budget_source_transition_sources");return false;}
            // Copy/count the whole cohort before any publication; work/time/cancel can abort without a half result.
            SourceTransitionCohort cohort;cohort.changed=key.first!=key.second;
            for(const auto source:key.first) {if(!spend()) return false;cohort.baselineSources.push_back(source);}
            for(const auto source:key.second) {if(!spend()) return false;cohort.scenarioSources.push_back(source);}
            for(const auto &member:members) {
                if(!spend()) return false;
                const auto &v=input.rows[member.row].segments[member.segment];
                if(cohort.changed!=(!v.addedRows.empty()||!v.removedRows.empty()))
                    throw Error{ErrorCode::Internal,"Source transition sets disagree with original attribution"};
                cohort.counts.coveredBits=detail::checkedCountAdd(cohort.counts.coveredBits,v.bits.width);
                cohort.members.push_back(member);
            }
            if(cohort.changed) cohort.counts.changedBits=cohort.counts.coveredBits;
            else cohort.counts.retainedOnlyBits=cohort.counts.coveredBits;
            auto &t=dest.totals;const auto &c=cohort.counts;
            t.coveredBits=detail::checkedCountAdd(t.coveredBits,c.coveredBits);t.changedBits=detail::checkedCountAdd(t.changedBits,c.changedBits);
            t.retainedOnlyBits=detail::checkedCountAdd(t.retainedOnlyBits,c.retainedOnlyBits);
            ++out_.cohorts;out_.members+=cohort.members.size();out_.sources+=sourceCount;dest.cohorts.push_back(std::move(cohort));
        }
        dest.state=dest.inputComplete?"complete":"partial";return true;
    }
  public:
    Transitions(RegisterSourceAttributionReport input,const RegisterSourceTransitionLimits &l,Time end,Cancel c):end_(end),cancel_(c) {
        out_.analysis=std::move(input);out_.limits=l;
        for(const auto &v:out_.analysis.comparisons) {
            SourceTransitionComparison dest;dest.scenario=v.scenario;dest.inputRows=v.rows.size();dest.inputComplete=v.state=="complete";dest.sourcesComplete=v.sourcesComplete;
            out_.comparisons.push_back(std::move(dest));
        }
    }
    RegisterSourceTransitionReport run() {
        checkpoint(cancel_);if(!out_.analysis.complete) partial("analysis_incomplete");
        for(size_t i=0;i<out_.comparisons.size();++i) if(!comparison(i)) {partial("source_transition_unfinished");break;}
        (void)time();return std::move(out_);
    }
};
Result<RegisterSourceTransitionReport> execute(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceTransitionLimits &l,std::optional<Time> end,Cancel c) try {
    detail::validateRegisterSourceTransitionLimits(l);checkpoint(c);
    auto input=compareRegisterSourceAttribution(d,s,r,l.attribution,c);if(!input) return input.error();
    return Transitions(std::move(*input),l,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterSourceTransitionLimits(const RegisterSourceTransitionLimits &l) {
    validateRegisterSourceAttributionLimits(l.attribution);
    if(!l.maxCohorts||l.maxCohorts>10000||!l.maxMembers||l.maxMembers>1000000||!l.maxSources||l.maxSources>1000000||
        !l.maxInputSegments||l.maxInputSegments>2000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register source transition budget"};
}
Result<RegisterSourceTransitionReport> detail::sourceTransitionsWithDeadline(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceTransitionLimits &l,Time end,Cancel c) {return execute(d,s,r,l,end,c);}
Result<RegisterSourceTransitionReport> compareRegisterSourceTransitions(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceTransitionLimits &l,Cancel c) {return execute(d,s,r,l,{},c);}
}
