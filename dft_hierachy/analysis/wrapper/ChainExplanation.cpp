#include "ChainExplanationInternal.h"
#include <algorithm>
#include <map>
namespace dft::wrapper {
namespace {
using namespace hier;using Clock=std::chrono::steady_clock;
template<class T>T take(Result<T> r){if(!r)throw r.error();return std::move(r.value());}
void cancelled(Cancel c){if(c.stop_requested())throw Error{ErrorCode::Cancelled,"Wrapper explanation cancelled"};}
ChainCompatibilityRequest upstream(const ChainExplanationRequest &r){return {r.resets,{},r.inspection};}
void validate(const ChainExplanationRequest &r,Cancel c){
    cancelled(c);take(validateChainCompatibilityRequest(upstream(r),c));const auto &l=r.limits;
    if(!l.maxChains||l.maxChains>1024||!l.maxSegments||l.maxSegments>100000||!l.maxLocations||l.maxLocations>100000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Wrapper explanation limit out of range"};
}
struct Stop {std::string reason;};
class Explainer {
    Design &design_;const ChainCompatibilityReport &source_; // Both borrowed only during run().
    ChainExplanation out_;Clock::time_point deadline_;Cancel cancel_;
    std::map<std::string,size_t> locations_;
    std::map<std::pair<size_t,size_t>,size_t> clocks_,resets_;
    void checkpoint(){cancelled(cancel_);if(Clock::now()>=deadline_)throw Stop{"budget_time"};}
    void tick(){checkpoint();if(out_.work==out_.limits.maxWork)throw Stop{"budget_work"};++out_.work;}
    void partial(const std::string &reason){out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),reason)==out_.reasons.end())out_.reasons.push_back(reason);}
    size_t locate(const std::string &ref){
        checkpoint();auto it=locations_.find(ref);if(it!=locations_.end())return it->second;
        if(out_.locations.size()==out_.limits.maxLocations)throw Stop{"budget_locations"};tick();
        ChainExplanationLocation location;location.ref=ref;auto result=design_.source(ref,model::SourceKind::Definition,cancel_);
        if(result)location.span=std::move(result.value());else {
            if(result.error().code!=ErrorCode::NotFound&&result.error().code!=ErrorCode::Unsupported)throw result.error();
            location.error=result.error();partial("location_unavailable");
        }
        const auto index=out_.locations.size();out_.locations.push_back(std::move(location));locations_.emplace(ref,index);checkpoint();return index;
    }
    ChainExplanationRow row(size_t chain){
        tick();ChainExplanationRow r;r.chain=chain;r.status="pending";r.reasons={"compatibility_not_reached"};
        if(chain<source_.compatibility.rows.size()){const auto &c=source_.compatibility.rows[chain];r.compatibilityRow=chain;r.status=c.status;r.controlsComplete=c.complete;r.reasons=c.reasons;}
        const auto &plan=source_.source.source.source;const auto &cell=plan.source;const auto &boundary=cell.source;
        const auto &segments=plan.layout.chains[chain].segments;
        for(size_t s=0;s<segments.size();++s){checkpoint();if(out_.counts.segments+r.segments.size()==out_.limits.maxSegments)throw Stop{"budget_segments"};tick();
            const auto &segment=segments[s];const auto br=cell.plan.rows.at(segment.sourceRow).sourceRow;const auto &b=boundary.rows.at(br);const auto &port=boundary.ports.at(b.port);
            ChainExplanationSegment item;item.segment=s;item.boundaryRow=br;item.portLocation=locate(port.ref);
            if(segment.signal)item.stateLocation=locate(*segment.signal);
            auto clock=clocks_.find({chain,s});if(clock!=clocks_.end())item.clockRow=clock->second;
            auto reset=resets_.find({chain,s});if(reset!=resets_.end())item.resetRow=reset->second;
            r.segments.push_back(std::move(item));
        }
        return r;
    }
public:
    Explainer(Design &d,const ChainCompatibilityReport &s,const ChainExplanationLimits &l,Clock::time_point deadline,Cancel c)
        :design_(d),source_(s),deadline_(deadline),cancel_(c){out_.limits=l;if(!s.compatibility.complete)partial("source_partial");}
    ChainExplanation run(){
        size_t chain=0;
        try{
            const auto &clocks=source_.source.source.clocks.rows;for(size_t i=0;i<clocks.size();++i){tick();clocks_.emplace(std::pair{clocks[i].chain,clocks[i].segment},i);}
            const auto &resets=source_.source.resets.rows;for(size_t i=0;i<resets.size();++i){tick();resets_.emplace(std::pair{resets[i].chain,resets[i].segment},i);}
            for(;chain<source_.source.source.source.layout.chains.size();++chain){checkpoint();if(out_.rows.size()==out_.limits.maxChains)throw Stop{"budget_chains"};auto r=row(chain);checkpoint();
                auto &c=out_.counts;++c.chains;c.segments+=r.segments.size();
                if(r.status=="compatible")++c.compatible;else if(r.status=="conflict")++c.conflict;else if(r.status=="unresolved")++c.unresolved;else if(r.status=="empty")++c.empty;else ++c.pending;
                out_.rows.push_back(std::move(r));
            }
            checkpoint();
        }catch(const Stop &s){partial(s.reason);out_.stop=ChainExplanationStop{s.reason,chain};}
        cancelled(cancel_);return std::move(out_);
    }
};
Result<ChainExplanationReport> execute(Design &d,const ChainExplanationRequest &r,Cancel c,std::optional<Clock::time_point> deadline={})try{
    validate(r,c);auto source=take(inspectWrapperChainCompatibility(d,upstream(r),c));
    auto explanation=Explainer(d,source,r.limits,deadline.value_or(Clock::now()+std::chrono::milliseconds(r.limits.maxMillis)),c).run();return ChainExplanationReport{std::move(source),std::move(explanation)};
}catch(const Error &e){return e;}
}
Result<bool> validateChainExplanationRequest(const ChainExplanationRequest &r,Cancel c)try{validate(r,c);return true;}catch(const Error &e){return e;}
Result<ChainExplanationReport> explainWrapperChains(Design &d,const ChainExplanationRequest &r,Cancel c){return execute(d,r,c);}
namespace detail {
Result<ChainExplanationReport> explainWrapperChainsWithDeadline(Design &d,const ChainExplanationRequest &r,Clock::time_point deadline,Cancel c){return execute(d,r,c,deadline);}
}
}
