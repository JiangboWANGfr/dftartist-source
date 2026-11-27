#include "ChainActivityPlanInternal.h"
#include "ChainCompatibilityInternal.h"
namespace dft::wrapper {
namespace {
using namespace hier;using Clock=std::chrono::steady_clock;
template<class T>T take(Result<T> r){if(!r)throw r.error();return std::move(r.value());}
void cancelled(Cancel c){if(c.stop_requested())throw Error{ErrorCode::Cancelled,"Wrapper activity planning cancelled"};}
ChainCompatibilityRequest upstream(const ChainActivityPlanRequest &r){return {r.resets,{},r.inspection};}
void validate(const ChainActivityPlanRequest &r,Cancel c){
    cancelled(c);take(validateChainCompatibilityRequest(upstream(r),c));const auto &l=r.limits;
    if(!l.maxBatches||l.maxBatches>1024||!l.maxChainsPerBatch||l.maxChainsPerBatch>1024||
       !l.maxSharedBitsPerBatch||l.maxSharedBitsPerBatch>9007199254740991ULL||
       !l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Wrapper activity limit out of range"};
}
struct Stop {std::string reason;};
class Planner {
    const ChainCompatibilityReport &source_; // Synchronous borrow, never escapes run().
    ChainActivityPlan out_;Clock::time_point deadline_;Cancel cancel_;
    void checkpoint(){cancelled(cancel_);if(Clock::now()>=deadline_)throw Stop{"budget_time"};}
    void tick(){checkpoint();if(out_.work==out_.limits.maxWork)throw Stop{"budget_work"};++out_.work;}
    ChainActivityBatch evaluate(std::vector<size_t> members,size_t index){
        auto r=detail::evaluateActivityGroup(source_.source,members,index,[&]{tick();});
        if(!r.complete||r.status!="compatible")return {};
        return {std::move(members),r.allocatedSharedBits,r.clockGroups.at(0),std::move(r.holds)};
    }
    void process(size_t chain){
        tick();ChainActivityRow row{chain,"pending",{}, {}};std::optional<ChainActivityBatch> next;
        if(chain<source_.compatibility.rows.size()){
            row.sourceRow=chain;const auto &s=source_.compatibility.rows[chain];row.status=s.status;
            if(s.complete&&s.status=="compatible"){
                if(s.allocatedSharedBits>out_.limits.maxSharedBitsPerBatch)row.status="oversized";
                else {
                    size_t index=0;
                    for(;index<out_.batches.size();++index){
                        tick();const auto &b=out_.batches[index];
                        if(b.chains.size()>=out_.limits.maxChainsPerBatch||s.allocatedSharedBits>out_.limits.maxSharedBitsPerBatch-b.sharedBits)continue;
                        auto members=b.chains;members.push_back(chain);auto candidate=evaluate(std::move(members),index);
                        if(!candidate.chains.empty()){next=std::move(candidate);break;}
                    }
                    if(!next){
                        if(out_.batches.size()>=out_.limits.maxBatches)throw Stop{"budget_batches"};
                        next=evaluate({chain},index);
                        // A complete compatible singleton must satisfy the same evaluator.
                        if(next->chains.empty())throw Error{ErrorCode::Internal,"Inconsistent Wrapper singleton compatibility"};
                    }
                    row.status="assigned";row.batch=index;
                }
            }
        }
        checkpoint();auto &c=out_.counts;++c.chains;
        if(row.status=="assigned"){
            ++c.assigned;c.assignedSharedBits+=source_.compatibility.rows[chain].allocatedSharedBits;
            if(*row.batch==out_.batches.size())out_.batches.push_back(std::move(*next));else out_.batches[*row.batch]=std::move(*next);
        }else if(row.status=="conflict")++c.conflict;else if(row.status=="unresolved")++c.unresolved;
        else if(row.status=="empty")++c.empty;else if(row.status=="oversized")++c.oversized;else ++c.pending;
        out_.rows.push_back(std::move(row));
    }
public:
    Planner(const ChainCompatibilityReport &s,const ChainActivityPlanLimits &l,Clock::time_point deadline,Cancel c)
        :source_(s),deadline_(deadline),cancel_(c){out_.limits=l;if(!s.compatibility.complete){out_.complete=false;out_.reasons.push_back("source_partial");}}
    ChainActivityPlan run(){
        size_t chain=0;
        try{for(;chain<source_.compatibility.groups.size();++chain)process(chain);checkpoint();}
        catch(const Stop &s){out_.complete=false;out_.reasons.push_back(s.reason);out_.stop=ChainActivityStop{s.reason,chain};}
        cancelled(cancel_);return std::move(out_);
    }
};
Result<ChainActivityPlanReport> execute(Design &d,const ChainActivityPlanRequest &r,Cancel c,std::optional<Clock::time_point> deadline={})try{
    validate(r,c);auto source=take(inspectWrapperChainCompatibility(d,upstream(r),c));
    auto activity=Planner(source,r.limits,deadline.value_or(Clock::now()+std::chrono::milliseconds(r.limits.maxMillis)),c).run();
    return ChainActivityPlanReport{std::move(source),std::move(activity)};
}catch(const Error &e){return e;}
}
Result<bool> validateChainActivityPlanRequest(const ChainActivityPlanRequest &r,Cancel c)try{validate(r,c);return true;}catch(const Error &e){return e;}
Result<ChainActivityPlanReport> planWrapperChainActivity(Design &d,const ChainActivityPlanRequest &r,Cancel c){return execute(d,r,c);}
namespace detail {
Result<ChainActivityPlanReport> planWrapperChainActivityWithDeadline(Design &d,const ChainActivityPlanRequest &r,Clock::time_point deadline,Cancel c){return execute(d,r,c,deadline);}
}
}
