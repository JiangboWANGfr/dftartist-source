#include "RegisterSourceRangeSelectionInternal.h"
#include "ScenariosInternal.h"
#include "SourceHierarchyRoleCountsInternal.h"
#include <algorithm>
#include <limits>
namespace dft::sequential {
namespace {
using namespace hier;
using Role=SourceHierarchyRole;
using Time=std::chrono::steady_clock::time_point;
void require(bool value) {if(!value) throw Error{ErrorCode::BadRequest,"Source range selection requires valid query and published range references"};}
bool validRole(Role r) {return r==Role::Added||r==Role::Removed||r==Role::Retained;}
void checkpoint(Cancel cancel) {if(cancel.stop_requested()) throw Error{ErrorCode::Cancelled,"Source range selection cancelled"};}
uint64_t end(const model::BitRange &b) {require(b.width&&b.width<=std::numeric_limits<uint64_t>::max()-b.lsb);return b.lsb+b.width;}
std::optional<model::BitRange> clip(const model::BitRange &b,const SourceRangeQuery &q) {
    const auto last=end(b);if(!q.bits) return b;
    (void)last;return detail::intersectSourceRanges(b,*q.bits);
}
class Selection {
    const RegisterSourceHierarchyRangeReport &input_;
    SourceRangeSelection out_;
    Time deadline_;
    Cancel cancel_;
    void partial(const std::string &reason) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),reason)==out_.reasons.end()) out_.reasons.push_back(reason);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<deadline_) return true;partial("budget_source_selection_time");return false;}
    bool spend() {if(!time()) return false;if(out_.work>=out_.limits.maxWork) {partial("budget_source_selection_work");return false;}++out_.work;return true;}
    bool signal(size_t ri,size_t si) {
        if(!spend()) return false;
        const auto ci=out_.query.scenario-1;const auto &row=input_.comparisons[ci].rows[ri];const auto &original=row.signals[si];
        if(out_.query.signal&&*out_.query.signal!=original.signal) return true;
        SourceRangeSelectionRow result;result.rangeRow=ri;result.rangeSignal=si;result.value.signal=original.signal;
        uint64_t ranges=0;
        const auto collect=[&](const auto &values,auto &dest,Role role) {
            if(out_.query.role&&*out_.query.role!=role) return true;
            std::optional<uint64_t> previous;
            for(const auto &bits:values) {
                if(!spend()) return false;
                require(!previous||*previous<bits.lsb);previous=end(bits);
                const auto selected=clip(bits,out_.query);if(!selected) continue;
                if(ranges>=out_.limits.maxRanges-out_.ranges) {partial("budget_source_selection_ranges");return false;}
                dest.push_back(*selected);++ranges;detail::addSourceHierarchyRoleCounts(result.value.counts,role,selected->width);
            }
            return true;
        };
        if(!collect(original.added,result.value.added,Role::Added)||!collect(original.removed,result.value.removed,Role::Removed)||!collect(original.retained,result.value.retained,Role::Retained)) return false;
        if(!ranges) return true;
        if(out_.rows.size()>=out_.limits.maxRows) {partial("budget_source_selection_rows");return false;}
        const auto &matrix=input_.analysis.comparisons[ci].rows[row.matrixRow];
        const auto &attribution=input_.analysis.analysis.analysis.analysis.analysis.comparisons[ci];
        std::optional<size_t> previousMember;
        for(const auto mi:original.members) {
            if(!spend()) return false;
            require(mi<matrix.members.size()&&(!previousMember||*previousMember<mi));previousMember=mi;
            const auto &member=matrix.members[mi];require(validRole(member.role)&&member.row<attribution.rows.size());
            const auto &ar=attribution.rows[member.row];require(ar.signal==original.signal&&member.segment<ar.segments.size());
            if(out_.query.role&&*out_.query.role!=member.role) continue;
            if(!clip(ar.segments[member.segment].bits,out_.query)) continue;
            if(result.value.members.size()>=out_.limits.maxMembers-out_.members) {partial("budget_source_selection_members");return false;}
            result.value.members.push_back(mi);
        }
        require(!result.value.members.empty());out_.ranges+=ranges;out_.members+=result.value.members.size();out_.rows.push_back(std::move(result));return true;
    }
  public:
    Selection(const RegisterSourceHierarchyRangeReport &r,const SourceRangeQuery &q,const SourceRangeSelectionLimits &l,Time deadline,Cancel cancel):input_(r),deadline_(deadline),cancel_(cancel) {
        out_.query=q;out_.limits=l;const auto ci=q.scenario-1;
        require(r.comparisons.size()<=7&&ci<r.comparisons.size()&&r.analysis.comparisons.size()==r.comparisons.size()&&r.analysis.analysis.comparisons.size()==r.comparisons.size()&&r.analysis.analysis.analysis.analysis.analysis.comparisons.size()==r.comparisons.size());
        const auto &c=r.comparisons[ci];require(c.scenario==q.scenario&&c.rows.size()<=100000);
        out_.inputRows=c.rows.size();out_.inputComplete=c.state=="complete";out_.sourcesComplete=c.sourcesComplete;
        if(!r.complete) partial("analysis_incomplete");if(!out_.inputComplete) partial("source_selection_inputs_incomplete");
    }
    SourceRangeSelection run() {
        const auto ci=out_.query.scenario-1;
        for(size_t ri=0;ri<input_.comparisons[ci].rows.size();++ri) {
            if(!spend()) break;++out_.visitedRows;
            const auto &row=input_.comparisons[ci].rows[ri];require(row.matrixRow<input_.analysis.comparisons[ci].rows.size());
            const auto &matrix=input_.analysis.comparisons[ci].rows[row.matrixRow];const auto &nodes=input_.analysis.analysis.comparisons[ci].nodes;
            require(matrix.node<nodes.size()&&matrix.source<input_.analysis.analysis.analysis.analysis.analysis.analysis.analysis.rows.size());
            if(out_.query.source&&*out_.query.source!=matrix.source) continue;
            if(out_.query.node&&*out_.query.node!=nodes[matrix.node].info.pathText) continue;
            for(size_t si=0;si<row.signals.size();++si) if(!signal(ri,si)) {(void)time();return std::move(out_);}
        }
        (void)time();return std::move(out_);
    }
};
Result<SourceRangeSelection> execute(const RegisterSourceHierarchyRangeReport &input,const SourceRangeQuery &query,const SourceRangeSelectionLimits &limits,std::optional<Time> deadline,Cancel cancel) try {
    detail::validateSourceRangeQuery(query);detail::validateSourceRangeSelectionLimits(limits);checkpoint(cancel);
    return Selection(input,query,limits,deadline.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(limits.maxMillis))),cancel).run();
} catch(const Error &error) {return error;}
}
std::optional<hier::model::BitRange> detail::intersectSourceRanges(const hier::model::BitRange &a,const hier::model::BitRange &b) {
    const auto lo=std::max(a.lsb,b.lsb),hi=std::min(end(a),end(b));if(lo>=hi) return {};return hier::model::BitRange{lo,hi-lo};
}
void detail::validateSourceRangeQuery(const SourceRangeQuery &q) {
    require(q.scenario>=1&&q.scenario<=7&&(!q.role||validRole(*q.role)));
    if(q.node) require(!q.node->empty()&&q.node->size()<=4096&&q.node->find('\0')==std::string::npos&&validUtf8(*q.node));
    if(q.bits) (void)end(*q.bits);
}
void detail::validateSourceRangeSelectionLimits(const SourceRangeSelectionLimits &l) {
    require(l.maxRows&&l.maxRows<=100000&&l.maxRanges&&l.maxRanges<=2000000&&l.maxMembers&&l.maxMembers<=2000000&&l.maxWork&&l.maxWork<=10000000&&l.maxMillis&&l.maxMillis<=60000);
}
Result<SourceRangeSelection> detail::sourceRangeSelectionWithDeadline(const RegisterSourceHierarchyRangeReport &r,const SourceRangeQuery &q,const SourceRangeSelectionLimits &l,Time deadline,Cancel cancel) {return execute(r,q,l,deadline,cancel);}
Result<SourceRangeSelection> selectRegisterSourceHierarchyRanges(const RegisterSourceHierarchyRangeReport &r,const SourceRangeQuery &q,const SourceRangeSelectionLimits &l,Cancel cancel) {return execute(r,q,l,{},cancel);}
}
