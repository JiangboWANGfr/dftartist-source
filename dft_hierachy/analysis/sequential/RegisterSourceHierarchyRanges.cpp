#include "RegisterSourceHierarchyRangesInternal.h"
#include "RegisterSourceHierarchyMatrixInternal.h"
#include "SourceHierarchyRoleCountsInternal.h"
#include "SourceCoverage.h"
#include <algorithm>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
using Role=SourceHierarchyRole;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register source hierarchy ranges cancelled"};}
void require(bool v) {if(!v) throw Error{ErrorCode::BadRequest,"Source hierarchy ranges require valid ordered member intervals"};}
class Ranges {
    RegisterSourceHierarchyRangeReport out_;
    const RegisterStatistics &statistics_;
    Time end_;
    Cancel cancel_;
    void partial(const std::string &r) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<end_) return true;partial("budget_source_hierarchy_ranges_time");return false;}
    bool spend() {
        if(!time()) return false;
        if(out_.work>=out_.limits.maxWork) {partial("budget_source_hierarchy_ranges_work");return false;}
        ++out_.work;return true;
    }
    bool row(size_t comparison,size_t index) {
        if(out_.rows>=out_.limits.maxRows) {partial("budget_source_hierarchy_ranges_rows");return false;}
        if(!spend()) return false;
        const auto &original=out_.analysis.comparisons[comparison].rows[index];
        const auto &attribution=out_.analysis.analysis.analysis.analysis.analysis.comparisons[comparison];
        SourceHierarchyRangeRow result;result.matrixRow=index;
        uint64_t ranges=0,members=0;std::optional<uint64_t> previousEnd;
        for(size_t mi=0;mi<original.members.size();++mi) {
            if(!spend()) return false;
            if(members>=out_.limits.maxMembers-out_.members) {partial("budget_source_hierarchy_ranges_members");return false;}
            const auto &member=original.members[mi];require(member.row<attribution.rows.size());const auto &r=attribution.rows[member.row];
            require(member.segment<r.segments.size()&&r.signal<statistics_.signals.size());const auto &bits=r.segments[member.segment].bits;
            const auto end=detail::intervalEnd(bits);
            if(result.signals.empty()||result.signals.back().signal!=r.signal) {
                require(result.signals.empty()||result.signals.back().signal<r.signal);
                if(result.signals.size()>=out_.limits.maxSignals-out_.signals) {partial("budget_source_hierarchy_ranges_signals");return false;}
                SourceHierarchySignalRanges signal;signal.signal=r.signal;result.signals.push_back(std::move(signal));previousEnd.reset();
            }
            require(!previousEnd||*previousEnd<=bits.lsb);previousEnd=end;
            auto &signal=result.signals.back();auto &dest=member.role==Role::Added?signal.added:member.role==Role::Removed?signal.removed:signal.retained;
            if(!detail::appendCanonicalRange(dest,bits,[&] {
                if(ranges>=out_.limits.maxRanges-out_.ranges) {partial("budget_source_hierarchy_ranges_ranges");return false;}
                ++ranges;return true;
            })) return false;
            detail::addSourceHierarchyRoleCounts(signal.counts,member.role,bits.width);signal.members.push_back(mi);++members;
        }
        out_.signals+=result.signals.size();out_.ranges+=ranges;out_.members+=members;++out_.rows;
        out_.comparisons[comparison].rows.push_back(std::move(result));return true;
    }
    bool comparison(size_t index) {
        auto &dest=out_.comparisons[index];dest.state="partial";if(!time()) return false;
        if(!dest.inputComplete) partial("source_hierarchy_ranges_inputs_incomplete");
        for(size_t i=0;i<out_.analysis.comparisons[index].rows.size();++i) if(!row(index,i)) return false;
        dest.state=dest.inputComplete?"complete":"partial";return true;
    }
  public:
    Ranges(RegisterSourceHierarchyMatrixReport input,const RegisterStatistics &s,const RegisterSourceHierarchyRangeLimits &l,Time end,Cancel c):statistics_(s),end_(end),cancel_(c) {
        out_.analysis=std::move(input);out_.limits=l;
        for(const auto &v:out_.analysis.comparisons) {
            SourceHierarchyRangeComparison dest;dest.scenario=v.scenario;dest.inputRows=v.rows.size();dest.inputComplete=v.state=="complete";dest.sourcesComplete=v.sourcesComplete;
            out_.comparisons.push_back(std::move(dest));
        }
    }
    RegisterSourceHierarchyRangeReport run() {
        checkpoint(cancel_);if(!out_.analysis.complete) partial("analysis_incomplete");
        for(size_t i=0;i<out_.comparisons.size();++i) if(!comparison(i)) {partial("source_hierarchy_ranges_unfinished");break;}
        (void)time();return std::move(out_);
    }
};
Result<RegisterSourceHierarchyRangeReport> execute(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceHierarchyRangeLimits &l,std::optional<Time> end,Cancel c) try {
    detail::validateRegisterSourceHierarchyRangeLimits(l);checkpoint(c);
    auto input=compareRegisterSourceHierarchyMatrix(d,s,r,l.matrix,c);if(!input) return input.error();
    return Ranges(std::move(*input),s,l,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterSourceHierarchyRangeLimits(const RegisterSourceHierarchyRangeLimits &l) {
    validateRegisterSourceHierarchyMatrixLimits(l.matrix);
    if(!l.maxRows||l.maxRows>100000||!l.maxSignals||l.maxSignals>1000000||!l.maxRanges||l.maxRanges>2000000||
        !l.maxMembers||l.maxMembers>2000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register source hierarchy range budget"};
}
Result<RegisterSourceHierarchyRangeReport> detail::sourceHierarchyRangesWithDeadline(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceHierarchyRangeLimits &l,Time end,Cancel c) {return execute(d,s,r,l,end,c);}
Result<RegisterSourceHierarchyRangeReport> expandRegisterSourceHierarchyRanges(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceHierarchyRangeLimits &l,Cancel c) {return execute(d,s,r,l,{},c);}
}
