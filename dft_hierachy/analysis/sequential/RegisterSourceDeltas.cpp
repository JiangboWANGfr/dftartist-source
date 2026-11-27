#include "RegisterSourceDeltasInternal.h"
#include "RegisterSourceScenariosInternal.h"
#include "SourceCoverage.h"
#include "IntervalCoverage.h"
#include <algorithm>
#include <set>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register source coverage deltas cancelled"};}
class Compare {
    RegisterSourceDeltaReport out_;
    Time end_;
    Cancel cancel_;
    void partial(const std::string &r) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<end_) return true;partial("budget_source_delta_time");return false;}
    bool spend() {
        if(!time()) return false;
        if(out_.work>=out_.limits.maxWork) {partial("budget_source_delta_work");return false;}
        ++out_.work;return true;
    }
    bool canonical(const RegisterSourceGroup &group,detail::CanonicalSourceCoverage &value,uint64_t &intervals) {
        return detail::canonicalSourceCoverage(group,value,[&] {return spend();},[&] {
            if(intervals>=out_.limits.maxIntervals-out_.intervals) {partial("budget_source_delta_intervals");return false;}
            ++intervals;return true;
        });
    }
    bool count(const std::vector<model::BitRange> &ranges,uint64_t &value) {
        for(const auto &r:ranges) {if(!spend()) return false;value=detail::checkedCountAdd(value,r.width);}
        return true;
    }
    bool row(size_t matrixRow,size_t scenario) {
        if(out_.rows.size()>=out_.limits.maxRows) {partial("budget_source_delta_rows");return false;}
        if(!spend()) return false;
        const auto &input=out_.analysis.rows[matrixRow];RegisterSourceDeltaRow row;row.matrixRow=matrixRow;row.scenario=scenario;row.status=input.status[scenario-1];
        if(row.status=="unresolved") {partial("source_coverage_unresolved");out_.rows.push_back(std::move(row));return true;}
        detail::CanonicalSourceCoverage baseline,current;uint64_t intervals=0,ranges=0,signals=0;
        if(input.groups[0]&&!canonical(out_.analysis.scenarios[0].sources->groups[*input.groups[0]],baseline,intervals)) return false;
        if(input.groups[scenario]&&!canonical(out_.analysis.scenarios[scenario].sources->groups[*input.groups[scenario]],current,intervals)) return false;
        std::set<size_t> ids;
        for(const auto *value:{&baseline,&current}) for(const auto &[id,bits]:*value) {(void)bits;if(!spend()) return false;ids.insert(id);}
        SourceCoverageDelta delta;const detail::CanonicalIntervals empty;
        for(const auto id:ids) {
            if(signals>=out_.limits.maxSignals-out_.signals) {partial("budget_source_delta_signals");return false;}
            if(!spend()) return false;
            const auto a=baseline.find(id),b=current.find(id);
            auto partition=detail::partitionSourceIntervals(a==baseline.end()?empty:a->second,b==current.end()?empty:b->second,[&] {return spend();},[&] {
                if(ranges>=out_.limits.maxRanges-out_.ranges) {partial("budget_source_delta_ranges");return false;}
                ++ranges;return true;
            });
            if(!partition) return false;
            SourceSignalDelta value;value.signal=id;value.added=std::move(partition->added);value.removed=std::move(partition->removed);value.retained=std::move(partition->retained);
            if(!count(value.added,value.counts.addedBits)||!count(value.removed,value.counts.removedBits)||!count(value.retained,value.counts.retainedBits)) return false;
            value.counts.baselineBits=detail::checkedCountAdd(value.counts.removedBits,value.counts.retainedBits);
            value.counts.scenarioBits=detail::checkedCountAdd(value.counts.addedBits,value.counts.retainedBits);
            auto &t=delta.totals;const auto &c=value.counts;
            t.baselineBits=detail::checkedCountAdd(t.baselineBits,c.baselineBits);t.scenarioBits=detail::checkedCountAdd(t.scenarioBits,c.scenarioBits);
            t.addedBits=detail::checkedCountAdd(t.addedBits,c.addedBits);t.removedBits=detail::checkedCountAdd(t.removedBits,c.removedBits);t.retainedBits=detail::checkedCountAdd(t.retainedBits,c.retainedBits);
            ++signals;delta.signals.push_back(std::move(value));
        }
        if((delta.totals.addedBits||delta.totals.removedBits)!=(row.status=="changed"))
            throw Error{ErrorCode::Internal,"Source bit delta disagrees with its matrix verdict"};
        row.delta=std::move(delta);out_.signals+=signals;out_.ranges+=ranges;out_.intervals+=intervals;out_.rows.push_back(std::move(row));return true;
    }
  public:
    Compare(RegisterSourceScenarioReport input,const RegisterSourceDeltaLimits &l,Time end,Cancel c):end_(end),cancel_(c) {
        out_.analysis=std::move(input);out_.limits=l;out_.inputRows=out_.analysis.rows.size();
        out_.inputComparisons=out_.inputRows*uint64_t(out_.analysis.scenarios.size()-1);
    }
    RegisterSourceDeltaReport run() {
        checkpoint(cancel_);if(!out_.analysis.complete) partial("analysis_incomplete");bool all=true;
        for(size_t i=0;i<out_.analysis.rows.size()&&all;++i) for(size_t j=1;j<out_.analysis.scenarios.size();++j) if(!row(i,j)) {all=false;break;}
        if(out_.rows.size()!=out_.inputComparisons) partial("source_delta_rows_unfinished");(void)time();return std::move(out_);
    }
};
Result<RegisterSourceDeltaReport> execute(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceDeltaLimits &l,std::optional<Time> end,Cancel c) try {
    detail::validateRegisterSourceDeltaLimits(l);checkpoint(c);
    auto input=compareRegisterSourceScenarios(d,s,r,l.scenarios,c);if(!input) return input.error();
    return Compare(std::move(*input),l,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterSourceDeltaLimits(const RegisterSourceDeltaLimits &l) {
    validateRegisterSourceScenarioLimits(l.scenarios);
    if(!l.maxRows||l.maxRows>100000||!l.maxSignals||l.maxSignals>1000000||!l.maxRanges||l.maxRanges>2000000||
        !l.maxIntervals||l.maxIntervals>2000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register source delta budget"};
}
Result<RegisterSourceDeltaReport> detail::sourceDeltasWithDeadline(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceDeltaLimits &l,Time end,Cancel c) {return execute(d,s,r,l,end,c);}
Result<RegisterSourceDeltaReport> compareRegisterSourceDeltas(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceDeltaLimits &l,Cancel c) {return execute(d,s,r,l,{},c);}
}
