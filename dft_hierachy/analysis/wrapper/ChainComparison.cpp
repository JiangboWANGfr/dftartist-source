#include "ChainComparisonInternal.h"
#include "CellPlanInternal.h"
#include "ChainPlanInternal.h"
#include "../common/Utf8.h"
#include <algorithm>
#include <map>
#include <set>
#include <tuple>
namespace dft::wrapper {
namespace {
using namespace hier;
using Clock=std::chrono::steady_clock;
void cancelled(Cancel c){if(c.stop_requested())throw Error{ErrorCode::Cancelled,"Wrapper comparison cancelled"};}
void bad(const char *s){throw Error{ErrorCode::BadRequest,s};}
template<class T>T take(Result<T> r){if(!r)throw r.error();return std::move(r.value());}
auto limitsKey(const BoundaryLimits &l){return std::tie(l.maxPorts,l.maxBits,l.maxWork,l.maxDepth,l.maxMillis,l.pageSize);}
void validate(const ChainComparisonRequest &r,Cancel c) {
    cancelled(c);
    if(r.configurations.size()<2 || r.configurations.size()>8)bad("Compare 2..8 wrapper chain configurations");
    if(r.reference>=r.configurations.size())bad("Invalid wrapper reference configuration");
    const auto &l=r.limits;
    if(!l.maxChains || l.maxChains>100000 || !l.maxWork || l.maxWork>10000000 || !l.maxMillis || l.maxMillis>60000)bad("Wrapper comparison limit out of range");
    std::set<std::string> names;const auto &base=r.configurations.front().request.cells.boundary;
    for(const auto &config:r.configurations) {
        cancelled(c);const auto &name=config.name;
        if(name.empty() || name.size()>4096 || name.find('\0')!=std::string::npos || !dft::detail::validUtf8(name) || !names.insert(name).second)bad("Invalid or duplicate wrapper configuration name");
        take(validateChainPlanRequest(config.request,c));const auto &b=config.request.cells.boundary;
        if(b.scope!=base.scope || b.ports!=base.ports || limitsKey(b.limits)!=limitsKey(base.limits))bad("Wrapper configurations require identical boundary requests");
    }
}
// Inputs are nonnegative safe integer counts; subtraction stays in the signed safe range.
int64_t delta(uint64_t current,uint64_t reference){return static_cast<int64_t>(current)-static_cast<int64_t>(reference);}
ChainCountsDelta countsDelta(const ChainCounts &a,const ChainCounts &b) {
    return {delta(a.rows,b.rows),delta(a.placed,b.placed),delta(a.excluded,b.excluded),delta(a.blocked,b.blocked),
        delta(a.dedicatedBits,b.dedicatedBits),delta(a.sharedBits,b.sharedBits),delta(a.reusedBits,b.reusedBits),delta(a.totalBits,b.totalBits)};
}
void partial(ChainComparisonReport &r,const std::string &why){r.complete=false;if(std::find(r.reasons.begin(),r.reasons.end(),why)==r.reasons.end())r.reasons.push_back(why);}
struct Stop {std::string reason;};
void compare(ChainComparisonReport &out,Clock::time_point deadline,Cancel c) {
    const auto &reference=out.configurations[out.reference].layout;
    if(!out.source.complete)partial(out,"source_partial");
    // Summaries are bounded by eight configurations and remain available with a truncated matrix.
    for(size_t i=0;i<out.configurations.size();++i) {
        cancelled(c);const auto &layout=out.configurations[i].layout;ChainComparisonSummary summary;
        summary.configuration=i;summary.comparable=reference.complete&&layout.complete;
        if(summary.comparable)summary.delta=countsDelta(layout.counts,reference.counts);
        if(!layout.complete)partial(out,"configuration_partial");out.summaries.push_back(std::move(summary));
    }
    const auto checkpoint=[&]{cancelled(c);if(Clock::now()>=deadline)throw Stop{"budget_time"};};
    const auto tick=[&]{checkpoint();if(out.work==out.limits.maxWork)throw Stop{"budget_work"};++out.work;};
    size_t at=0;
    try {
        checkpoint();std::vector<std::map<std::string,size_t>> indices(out.configurations.size());std::vector<std::string> names;std::set<std::string> seen;
        for(size_t i=0;i<out.configurations.size();++i)for(size_t j=0;j<out.configurations[i].layout.chains.size();++j) {
            checkpoint();indices[i].emplace(out.configurations[i].layout.chains[j].name,j);
        }
        const auto collect=[&](size_t i){for(const auto &chain:out.configurations[i].layout.chains){checkpoint();if(seen.insert(chain.name).second)names.push_back(chain.name);}};
        collect(out.reference);for(size_t i=0;i<out.configurations.size();++i)if(i!=out.reference)collect(i);
        for(;at<names.size();++at) {
            checkpoint();if(out.chains.size()==out.limits.maxChains)throw Stop{"budget_chains"};tick();ComparedChain row;row.name=names[at];
            const auto old=indices[out.reference].find(row.name);const PlannedChain *before=nullptr;
            if(old!=indices[out.reference].end()){row.referenceChain=old->second;before=&reference.chains[old->second];}
            for(size_t i=0;i<out.configurations.size();++i) {
                tick();ChainComparisonEntry entry;entry.configuration=i;entry.comparable=out.summaries[i].comparable;
                const auto current=indices[i].find(row.name);const PlannedChain *after=nullptr;
                if(current!=indices[i].end()){entry.chain=current->second;after=&out.configurations[i].layout.chains[current->second];}
                entry.presence=before?(after?"both":"removed"):(after?"added":"absent");
                if(entry.comparable)entry.delta=ChainSizeDelta{delta(after?after->capacity:0,before?before->capacity:0),delta(after?after->length:0,before?before->length:0)};
                row.entries.push_back(std::move(entry));
            }
            checkpoint();out.chains.push_back(std::move(row));
        }
        checkpoint();
    }catch(const Stop &s){partial(out,s.reason);out.stop=ChainComparisonStop{s.reason,at};}
    cancelled(c);
}
Result<ChainComparisonReport> execute(Design &d,const ChainComparisonRequest &r,Cancel c,std::optional<Clock::time_point> deadline={})try {
    validate(r,c);ChainComparisonReport out;out.reference=r.reference;out.limits=r.limits;
    out.source=take(investigateBoundary(d,r.configurations.front().request.cells.boundary,c));
    for(const auto &config:r.configurations) {
        cancelled(c);const auto &request=config.request;NamedChainResult result;result.name=config.name;
        result.plan=detail::planCellsFromBoundary(out.source,request.cells,Clock::now()+std::chrono::milliseconds(request.cells.limits.maxMillis),c);
        result.layout=detail::organizeChainsFromCells(out.source,result.plan,request,Clock::now()+std::chrono::milliseconds(request.limits.maxMillis),c);
        out.configurations.push_back(std::move(result));
    }
    compare(out,deadline.value_or(Clock::now()+std::chrono::milliseconds(r.limits.maxMillis)),c);return out;
}catch(const Error &e){return e;}
}
hier::Result<bool> validateChainComparisonRequest(const ChainComparisonRequest &r,hier::Cancel c)try{validate(r,c);return true;}catch(const hier::Error &e){return e;}
hier::Result<ChainComparisonReport> compareWrapperChains(hier::Design &d,const ChainComparisonRequest &r,hier::Cancel c){return execute(d,r,c);}
namespace detail {
hier::Result<ChainComparisonReport> compareWrapperChainsWithDeadline(hier::Design &d,const ChainComparisonRequest &r,Clock::time_point deadline,hier::Cancel c){return execute(d,r,c,deadline);}
}
}
