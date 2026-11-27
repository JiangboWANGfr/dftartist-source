#include "ChainResetsInternal.h"
#include "SourceLogic.h"
#include <algorithm>
#include <map>
#include <tuple>
namespace dft::wrapper {
namespace {
using namespace hier;using namespace hier::model;using Clock=std::chrono::steady_clock;
template<class T>T take(Result<T> r){if(!r)throw r.error();return std::move(r.value());}
void cancelled(Cancel c){if(c.stop_requested())throw Error{ErrorCode::Cancelled,"Wrapper reset inspection cancelled"};}
void validate(const ChainResetRequest &r,Cancel c) {
    cancelled(c);take(validateChainClockRequest(r.clock,c));const auto &l=r.limits;
    if(!l.maxRows||l.maxRows>100000||!l.maxEvents||l.maxEvents>1000000||!l.maxWork||l.maxWork>10000000||
       !l.maxDepth||l.maxDepth>256||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Wrapper reset limit out of range"};
}
void hold(std::vector<ChainResetHold> &v,const ChainResetHold &h) {
    auto it=std::find_if(v.begin(),v.end(),[&](const auto &x){return x.input==h.input;});
    if(it==v.end())v.push_back(h);else{it->low=it->low||h.low;it->high=it->high||h.high;}
}
bool conflict(const std::vector<ChainResetHold> &v){return std::any_of(v.begin(),v.end(),[](const auto &h){return h.low&&h.high;});}
struct Stop {std::string reason;};
class Inspector {
    Design &design_;const ChainClockReport &source_; // Borrowed during run only.
    ChainResets out_;Clock::time_point deadline_;Cancel cancel_;
    std::set<std::string> tops_;std::map<std::string,ObjectInfo> objects_;
    using EventKey=std::tuple<std::string,uint64_t,uint64_t,std::string,std::string>;
    std::map<EventKey,size_t> checks_;std::map<std::pair<std::string,uint64_t>,size_t> inputs_;
    void checkpoint(){cancelled(cancel_);if(Clock::now()>=deadline_)throw Stop{"budget_time"};}
    void tick(){checkpoint();if(out_.work>=out_.limits.maxWork)throw Stop{"budget_work"};++out_.work;}
    void partial(const std::string &s){out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),s)==out_.reasons.end())out_.reasons.push_back(s);}
    const ObjectInfo &object(const std::string &ref) {
        checkpoint();auto it=objects_.find(ref);if(it!=objects_.end())return it->second;
        tick();auto value=take(design_.object(ref,cancel_));checkpoint();return objects_.emplace(ref,std::move(value)).first->second;
    }
    size_t check(const EventInfo &event) {
        checkpoint();const EventKey key{event.signal,event.bits.lsb,event.bits.width,event.edge,event.type};auto at=checks_.find(key);if(at!=checks_.end())return at->second;
        ChainResetCheck c;c.event=event;c.reason="unsupported_event";
        if(!event.signal.empty()&&event.bits.width==1&&(event.edge=="posedge"||event.edge=="negedge")&&(event.type=="reset"||event.type=="set")) {
            const auto &obj=object(event.signal);
            if(obj.kind=="port"||obj.kind=="signal") {
                TracePoint point{{event.signal,event.bits},{}};if(obj.kind=="port")point.side="inside";
                sequential::Request request;request.maxDepth=out_.limits.maxDepth;request.maxLogicWork=out_.limits.maxWork;
                c.proof=sequential::detail::resolveSource(design_,point,request,tops_,out_.work,deadline_,cancel_);
                const auto &v=c.proof->result;c.reason=v.verdict;
                if(v.verdict=="primary_input"&&v.origin&&v.sourceRef&&v.origin->slice.bits.width==1) {
                    const auto inputKey=std::make_pair(*v.sourceRef,v.origin->slice.bits.lsb);auto input=inputs_.find(inputKey);
                    if(input==inputs_.end()){input=inputs_.emplace(inputKey,out_.inputs.size()).first;out_.inputs.push_back({*v.origin,*v.sourceRef});}
                    c.input=input->second;c.high=(event.edge=="negedge")!=bool(v.inversions%2);c.status="resolved";c.reason="primary_input";
                }else if(v.verdict=="constant"&&v.value&&(*v.value=="0"||*v.value=="1")) {
                    const bool inactive=(*v.value=="1")== (event.edge=="negedge");
                    c.status=inactive?"inactive":"asserted";c.reason=inactive?"constant_inactive":"constant_asserted";
                }
            }
        }
        const auto index=out_.checks.size();out_.checks.push_back(std::move(c));checks_.emplace(key,index);checkpoint();
        const auto &saved=out_.checks.back();if(saved.proof&&std::find(saved.proof->reasons.begin(),saved.proof->reasons.end(),"budget_logic_work")!=saved.proof->reasons.end())throw Stop{"budget_work"};
        return index;
    }
    ChainResetRow row(size_t chain,size_t segment,size_t sourceRow) {
        tick();ChainResetRow r;r.chain=chain;r.segment=segment;
        if(sourceRow>=source_.clocks.rows.size()){r.complete=false;r.status="pending";r.reason="clock_analysis_not_reached";return r;}
        const auto &cr=source_.clocks.rows[sourceRow];
        if(cr.chain!=chain||cr.segment!=segment)throw Error{ErrorCode::Internal,"Clock segment order mismatch"};r.sourceRow=sourceRow;
        if(cr.status=="dedicated"){r.status="dedicated";r.reason="control_not_in_rtl";return r;}
        if(cr.reason=="register_facts_partial"||cr.reason=="register_gap"||cr.reason=="register_overlap"){r.complete=false;r.status="unresolved";r.reason=cr.reason;return r;}
        bool asserted=false;
        for(size_t m=0;m<cr.matches.size();++m) {
            tick();const auto &match=cr.matches[m];const auto &fact=source_.clocks.pages.at(match.page).response.result.items.at(match.fact);
            for(size_t event=0;event<fact.async.size();++event) {
                checkpoint();if(out_.events==out_.limits.maxEvents)throw Stop{"budget_events"};tick();++out_.events;
                const auto index=check(fact.async[event]);const auto &c=out_.checks[index];r.events.push_back({m,event,index});
                if(c.status=="resolved")hold(r.holds,{*c.input,!*c.high,*c.high});
                else if(c.status=="asserted")asserted=true;
                else if(c.status=="unresolved")r.complete=false;
            }
        }
        if(asserted){r.status="asserted";r.reason="constant_asserted";}
        else if(conflict(r.holds)){r.status="conflict";r.reason="conflicting_levels";}
        else if(!r.complete){r.status="unresolved";r.reason="control_unresolved";}
        else if(!r.holds.empty()){r.status="hold";r.reason="inactive_inputs";}
        else {r.status="clear";r.reason=r.events.empty()?"no_async_controls":"constant_inactive";}
        return r;
    }
    void commit(ChainResetRow r) {
        checkpoint();auto &s=out_.chains[r.chain];const auto length=source_.source.layout.chains[r.chain].segments[r.segment].length;
        ++s.processedSegments;s.complete=s.complete&&r.complete;if(!r.complete)partial("control_unresolved");
        if(r.status=="clear")s.clearBits+=length;else if(r.status=="hold")s.holdBits+=length;
        else if(r.status=="conflict")s.conflictBits+=length;else if(r.status=="asserted")s.assertedBits+=length;
        else if(r.status=="pending")s.pendingBits+=length;else if(r.status=="dedicated")s.dedicatedBits+=length;else s.unresolvedBits+=length;
        for(const auto &h:r.holds)hold(s.holds,h);out_.rows.push_back(std::move(r));
    }
public:
    Inspector(Design &d,const ChainClockReport &s,const ChainResetLimits &l,Clock::time_point deadline,Cancel c)
        :design_(d),source_(s),deadline_(deadline),cancel_(c) {
        out_.limits=l;if(!s.clocks.complete)partial("source_partial");
        for(size_t i=0;i<s.source.layout.chains.size();++i){ChainResetSummary sum;sum.chain=i;out_.chains.push_back(std::move(sum));}
    }
    ChainResets run() {
        size_t chain=0,segment=0,index=0;
        try {
            checkpoint();for(const auto &top:take(design_.roots(cancel_))){checkpoint();tops_.insert(top.ref);}
            for(;chain<source_.source.layout.chains.size();++chain) {
                segment=0;
                for(;segment<source_.source.layout.chains[chain].segments.size();++segment,++index){checkpoint();if(out_.rows.size()==out_.limits.maxRows)throw Stop{"budget_rows"};commit(row(chain,segment,index));}
            }
            checkpoint();
        }catch(const Stop &s){partial(s.reason);out_.stop=ChainResetStop{s.reason,chain,segment};}
        for(auto &s:out_.chains) {
            cancelled(cancel_);s.complete=s.complete&&s.processedSegments==source_.source.layout.chains[s.chain].segments.size();
            if(s.assertedBits)s.status="asserted";else if(s.conflictBits||conflict(s.holds))s.status="conflict";
            else if(!s.complete)s.status="unresolved";else if(!s.holds.empty())s.status="hold";
            else if(s.clearBits)s.status="clear";else if(s.dedicatedBits)s.status="dedicated_only";
        }
        cancelled(cancel_);return std::move(out_);
    }
};
Result<ChainResetReport> execute(Design &d,const ChainResetRequest &r,Cancel c,std::optional<Clock::time_point> deadline={})try {
    validate(r,c);auto source=take(inspectWrapperChainClocks(d,r.clock,c));
    auto resets=Inspector(d,source,r.limits,deadline.value_or(Clock::now()+std::chrono::milliseconds(r.limits.maxMillis)),c).run();
    return ChainResetReport{std::move(source),std::move(resets)};
}catch(const Error &e){return e;}
}
hier::Result<bool> validateChainResetRequest(const ChainResetRequest &r,hier::Cancel c)try{validate(r,c);return true;}catch(const hier::Error &e){return e;}
hier::Result<ChainResetReport> inspectWrapperChainResets(hier::Design &d,const ChainResetRequest &r,hier::Cancel c){return execute(d,r,c);}
namespace detail {
hier::Result<ChainResetReport> inspectWrapperChainResetsWithDeadline(hier::Design &d,const ChainResetRequest &r,Clock::time_point deadline,hier::Cancel c){return execute(d,r,c,deadline);}
}
}
