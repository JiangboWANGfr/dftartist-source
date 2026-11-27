#include "RegisterSourceAttributionInternal.h"
#include "RegisterSourceDeltasInternal.h"
#include "GroupIntervalAttribution.h"
#include "IntervalCoverage.h"
#include <algorithm>
#include <map>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register source bit attribution cancelled"};}
class Attribute {
    RegisterSourceAttributionReport out_;
    Time end_;
    Cancel cancel_;
    void partial(const std::string &r) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<end_) return true;partial("budget_source_attribution_time");return false;}
    bool spend() {
        if(!time()) return false;
        if(out_.work>=out_.limits.maxWork) {partial("budget_source_attribution_work");return false;}
        ++out_.work;return true;
    }
    bool comparison(SourceAttributionComparison &dest) {
        dest.state="partial";if(!time()) return false;
        std::map<size_t,std::vector<detail::GroupBitInterval>> signals;
        uint64_t intervals=0,resolved=0,unresolved=0;
        // Collect one complete comparison before publishing its input index/counters or output rows.
        for(size_t i=0;i<out_.analysis.rows.size();++i) {
            if(!spend()) return false;
            const auto &source=out_.analysis.rows[i];if(source.scenario!=dest.scenario) continue;
            if(!source.delta) {++unresolved;continue;}
            ++resolved;
            for(const auto &signal:source.delta->signals) {
                if(!spend()) return false;
                auto &values=signals[signal.signal];
                const std::vector<model::BitRange> *roles[]={&signal.added,&signal.removed,&signal.retained};
                for(size_t role=0;role<3;++role) for(const auto &bits:*roles[role]) {
                    if(!spend()) return false;
                    if(intervals>=out_.limits.maxIntervals-out_.intervals) {partial("budget_source_attribution_intervals");return false;}
                    ++intervals;values.push_back({bits,i*3+role});
                }
            }
        }
        dest.inputCollected=true;dest.resolvedRows=resolved;dest.unresolvedRows=unresolved;
        dest.missingRows=out_.analysis.inputRows-resolved-unresolved;
        dest.sourcesComplete=out_.analysis.analysis.complete&&!dest.missingRows&&!unresolved;
        out_.intervals+=intervals;
        if(!dest.sourcesComplete) partial("source_attribution_inputs_incomplete");
        for(const auto &[signal,input]:signals) {
            if(out_.rows>=out_.limits.maxRows) {partial("budget_source_attribution_rows");return false;}
            if(!spend()) return false;
            auto attempt=detail::partitionGroupIntervals(input.size(),[&](size_t i) {return input[i];},1,
                out_.limits.maxSegments-out_.segments,out_.limits.maxMembers-out_.members,[&] {return spend();});
            if(!attempt.value) {
                if(!attempt.reason.empty()) partial(attempt.reason=="budget_segments"?"budget_source_attribution_segments":"budget_source_attribution_members");
                return false;
            }
            SourceAttributionRow row;row.signal=signal;uint64_t members=0;
            for(const auto &segment:attempt.value->segments) {
                if(!spend()) return false;
                SourceAttributionSegment value;value.bits=segment.bits;
                for(const auto encoded:segment.groups) {
                    if(!spend()) return false;
                    auto &refs=encoded%3==0?value.addedRows:encoded%3==1?value.removedRows:value.retainedRows;
                    refs.push_back(encoded/3);++members;
                }
                row.counts.coveredBits=detail::checkedCountAdd(row.counts.coveredBits,value.bits.width);
                auto &count=value.addedRows.empty()&&value.removedRows.empty()?row.counts.retainedOnlyBits:row.counts.changedBits;
                count=detail::checkedCountAdd(count,value.bits.width);row.segments.push_back(std::move(value));
            }
            auto &totals=dest.totals;
            totals.coveredBits=detail::checkedCountAdd(totals.coveredBits,row.counts.coveredBits);
            totals.changedBits=detail::checkedCountAdd(totals.changedBits,row.counts.changedBits);
            totals.retainedOnlyBits=detail::checkedCountAdd(totals.retainedOnlyBits,row.counts.retainedOnlyBits);
            out_.segments+=row.segments.size();out_.members+=members;++out_.rows;dest.rows.push_back(std::move(row));
        }
        dest.state=dest.sourcesComplete?"complete":"partial";return true;
    }
  public:
    Attribute(RegisterSourceDeltaReport input,const RegisterSourceAttributionLimits &l,Time end,Cancel c):end_(end),cancel_(c) {
        out_.analysis=std::move(input);out_.limits=l;
        for(size_t i=1;i<out_.analysis.analysis.scenarios.size();++i) {SourceAttributionComparison v;v.scenario=i;v.missingRows=out_.analysis.inputRows;out_.comparisons.push_back(std::move(v));}
    }
    RegisterSourceAttributionReport run() {
        checkpoint(cancel_);if(!out_.analysis.complete) partial("analysis_incomplete");
        for(auto &v:out_.comparisons) if(!comparison(v)) {partial("source_attribution_unfinished");break;}
        (void)time();return std::move(out_);
    }
};
Result<RegisterSourceAttributionReport> execute(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceAttributionLimits &l,std::optional<Time> end,Cancel c) try {
    detail::validateRegisterSourceAttributionLimits(l);checkpoint(c);
    auto input=compareRegisterSourceDeltas(d,s,r,l.deltas,c);if(!input) return input.error();
    return Attribute(std::move(*input),l,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterSourceAttributionLimits(const RegisterSourceAttributionLimits &l) {
    validateRegisterSourceDeltaLimits(l.deltas);
    if(!l.maxRows||l.maxRows>100000||!l.maxIntervals||l.maxIntervals>2000000||!l.maxSegments||l.maxSegments>2000000||
        !l.maxMembers||l.maxMembers>10000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register source attribution budget"};
}
Result<RegisterSourceAttributionReport> detail::sourceAttributionWithDeadline(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceAttributionLimits &l,Time end,Cancel c) {return execute(d,s,r,l,end,c);}
Result<RegisterSourceAttributionReport> compareRegisterSourceAttribution(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceAttributionLimits &l,Cancel c) {return execute(d,s,r,l,{},c);}
}
