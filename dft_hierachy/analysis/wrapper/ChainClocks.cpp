#include "ChainClocksInternal.h"
#include "SourceLogic.h"
#include <algorithm>
#include <map>
#include <tuple>
namespace dft::wrapper {
namespace {
using namespace hier;
using namespace hier::model;
using Clock=std::chrono::steady_clock;
template<class T>T take(Result<T> r){if(!r)throw r.error();return std::move(r.value());}
void cancelled(Cancel c){if(c.stop_requested())throw Error{ErrorCode::Cancelled,"Wrapper clock inspection cancelled"};}
void validate(const ChainClockRequest &r,Cancel c) {
    cancelled(c);take(validateChainPlanRequest(r.chains,c));const auto &l=r.limits;
    if(!l.maxRows||l.maxRows>100000||!l.maxRegisters||l.maxRegisters>100000||!l.maxWork||l.maxWork>10000000||
       !l.maxDepth||l.maxDepth>256||!l.maxMillis||l.maxMillis>60000||!l.pageSize||l.pageSize>1000)
        throw Error{ErrorCode::BadRequest,"Wrapper clock limit out of range"};
}
uint64_t end(BitRange r) {
    constexpr uint64_t safe=9007199254740991ULL;
    if(r.lsb>safe||!r.width||r.width>safe-r.lsb)throw Error{ErrorCode::Internal,"Invalid register interval"};return r.lsb+r.width;
}
template<class T>void unique(std::vector<T> &v,const T &x){if(std::find(v.begin(),v.end(),x)==v.end())v.push_back(x);}
struct Stop {std::string reason;};
struct Facts {bool complete=true;std::map<std::string,std::vector<std::pair<size_t,size_t>>> signals;};
class Inspector {
    Design &design_;const ChainPlanReport &source_; // Borrowed until run returns.
    ChainClocks out_;Clock::time_point deadline_;Cancel cancel_;
    std::set<std::string> tops_;
    std::map<std::string,ObjectInfo> objects_;
    std::map<std::string,Facts> instances_;
    using EventKey=std::tuple<std::string,uint64_t,uint64_t,std::string,std::string>;
    std::map<EventKey,size_t> checks_;
    using GroupKey=std::tuple<std::string,uint64_t,std::string>;
    std::map<GroupKey,size_t> groups_;
    void checkpoint(){cancelled(cancel_);if(Clock::now()>=deadline_)throw Stop{"budget_time"};}
    void tick(){checkpoint();if(out_.work>=out_.limits.maxWork)throw Stop{"budget_work"};++out_.work;}
    void partial(const std::string &why){out_.complete=false;unique(out_.reasons,why);}
    const ObjectInfo &object(const std::string &ref) {
        checkpoint();auto it=objects_.find(ref);if(it!=objects_.end())return it->second;
        tick();auto obj=take(design_.object(ref,cancel_));checkpoint();return objects_.emplace(ref,std::move(obj)).first->second;
    }
    const Facts &facts(const std::string &inst) {
        auto found=instances_.find(inst);if(found!=instances_.end())return found->second;
        Facts value;PageRequest request;
        do {
            checkpoint();if(out_.registers==out_.limits.maxRegisters)throw Stop{"budget_registers"};
            request.limit=int(std::min(out_.limits.pageSize,out_.limits.maxRegisters-out_.registers));tick();
            auto response=take(design_.registers(inst,request,false,cancel_));checkpoint();
            if(response.result.items.size()>out_.limits.maxRegisters-out_.registers)throw Error{ErrorCode::Internal,"Register page exceeds request"};
            request.cursor=response.result.next;value.complete=value.complete&&response.completeness.status=="complete";
            const auto p=out_.pages.size();out_.registers+=response.result.items.size();out_.pages.push_back({inst,std::move(response)});
            const auto &items=out_.pages.back().response.result.items;
            for(size_t i=0;i<items.size();++i){tick();if(items[i].inst!=inst)throw Error{ErrorCode::Internal,"Register instance mismatch"};value.signals[items[i].signal].emplace_back(p,i);}
        }while(!request.cursor.empty());
        return instances_.emplace(inst,std::move(value)).first->second;
    }
    size_t check(const EventInfo &event) {
        checkpoint();const EventKey key{event.signal,event.bits.lsb,event.bits.width,event.edge,event.type};
        const auto it=checks_.find(key);if(it!=checks_.end())return it->second;
        ChainClockCheck c;c.event=event;c.reason="unsupported_event";
        if(!event.signal.empty()&&event.bits.width==1&&(event.edge=="posedge"||event.edge=="negedge")) {
            const auto &obj=object(event.signal);
            if(obj.kind=="port"||obj.kind=="signal") {
                TracePoint point{{event.signal,event.bits},{}};if(obj.kind=="port")point.side="inside";
                sequential::Request request;request.maxDepth=out_.limits.maxDepth;request.maxLogicWork=out_.limits.maxWork;
                c.proof=sequential::detail::resolveSource(design_,point,request,tops_,out_.work,deadline_,cancel_);
                const auto &v=c.proof->result;c.reason=v.verdict;
                if(v.verdict=="primary_input"&&v.origin&&v.sourceRef&&v.origin->slice.bits.width==1) {
                    const std::string edge=((event.edge=="negedge")!=bool(v.inversions%2))?"negedge":"posedge";
                    const GroupKey group{*v.sourceRef,v.origin->slice.bits.lsb,edge};auto g=groups_.find(group);
                    if(g==groups_.end()){g=groups_.emplace(group,out_.groups.size()).first;out_.groups.push_back({*v.origin,*v.sourceRef,edge});}
                    c.group=g->second;c.status="resolved";c.reason="primary_input";
                }
            }
        }
        const auto index=out_.checks.size();out_.checks.push_back(std::move(c));checks_.emplace(key,index);
        checkpoint();const auto &saved=out_.checks.back();
        if(saved.proof&&std::find(saved.proof->reasons.begin(),saved.proof->reasons.end(),"budget_logic_work")!=saved.proof->reasons.end())throw Stop{"budget_work"};
        return index;
    }
    ChainClockRow row(size_t chain,size_t segment) {
        tick();ChainClockRow r;r.chain=chain;r.segment=segment;const auto &s=source_.layout.chains[chain].segments[segment];
        if(s.kind=="dedicated"){r.status="dedicated";r.reason="clock_not_in_rtl";return r;}
        r.status="unresolved";const auto &obj=object(*s.signal);const auto &f=facts(obj.inst);
        const auto at=f.signals.find(*s.signal);const auto last=end(*s.bits);
        if(at!=f.signals.end())for(const auto &[page,index]:at->second) {
            tick();const auto &fact=out_.pages[page].response.result.items[index];const auto first=std::max(fact.bits.lsb,s.bits->lsb),stop=std::min(end(fact.bits),last);
            if(first<stop)r.matches.push_back({page,index,{first,stop-first},{},{}});
        }
        if(!f.complete){r.reason="register_facts_partial";return r;}
        std::sort(r.matches.begin(),r.matches.end(),[](const auto &a,const auto &b){return std::tie(a.bits.lsb,a.page,a.fact)<std::tie(b.bits.lsb,b.page,b.fact);});
        auto cursor=s.bits->lsb;bool gap=false,overlap=false;
        for(const auto &m:r.matches){checkpoint();gap=gap||m.bits.lsb>cursor;overlap=overlap||m.bits.lsb<cursor;cursor=std::max(cursor,end(m.bits));}
        if(overlap||gap||cursor!=last){r.reason=overlap?"register_overlap":"register_gap";return r;}
        bool resolved=true;
        for(auto &m:r.matches) {
            tick();const auto event=out_.pages[m.page].response.result.items[m.fact].clock;
            m.check=check(event);const auto &c=out_.checks[*m.check];m.group=c.group;
            if(m.group)unique(r.groups,*m.group);else resolved=false;
        }
        if(!resolved)r.reason="clock_unresolved";
        else if(r.groups.size()>1){r.status="mixed";r.reason="mixed_clocks";}
        else {r.status="resolved";r.reason="single_clock";}
        return r;
    }
    void commit(ChainClockRow r) {
        checkpoint();auto &summary=out_.chains[r.chain];const auto length=source_.layout.chains[r.chain].segments[r.segment].length;
        ++summary.processedSegments;
        if(r.status=="dedicated")summary.dedicatedBits+=length;
        else if(r.status=="unresolved"){summary.unresolvedBits+=length;partial("clock_unresolved");}
        else summary.resolvedBits+=length;
        for(const auto group:r.groups)unique(summary.groups,group);
        out_.rows.push_back(std::move(r));
    }
public:
    Inspector(Design &design,const ChainPlanReport &source,const ChainClockLimits &l,Clock::time_point deadline,Cancel c)
        :design_(design),source_(source),deadline_(deadline),cancel_(c) {
        out_.limits=l;if(!source.layout.complete)partial("source_partial");
        for(size_t i=0;i<source.layout.chains.size();++i){ChainClockSummary summary;summary.chain=i;out_.chains.push_back(std::move(summary));}
    }
    ChainClocks run() {
        size_t chain=0,segment=0;
        try {
            checkpoint();for(const auto &top:take(design_.roots(cancel_))){checkpoint();tops_.insert(top.ref);}
            for(;chain<source_.layout.chains.size();++chain) {
                segment=0;
                for(;segment<source_.layout.chains[chain].segments.size();++segment){checkpoint();if(out_.rows.size()==out_.limits.maxRows)throw Stop{"budget_rows"};commit(row(chain,segment));}
            }
            checkpoint();
        }catch(const Stop &s){partial(s.reason);out_.stop=ChainClockStop{s.reason,chain,segment};}
        for(auto &c:out_.chains) {
            cancelled(cancel_);
            if(c.groups.size()>1)c.status="mixed_clock";
            else if(c.unresolvedBits||c.processedSegments<source_.layout.chains[c.chain].segments.size())c.status="unresolved";
            else if(!c.groups.empty())c.status="single_clock";
            else if(c.dedicatedBits)c.status="dedicated_only";
        }
        cancelled(cancel_);return std::move(out_);
    }
};
Result<ChainClockReport> execute(Design &d,const ChainClockRequest &r,Cancel c,std::optional<Clock::time_point> deadline={})try {
    validate(r,c);auto source=take(planWrapperChains(d,r.chains,c));
    auto clocks=Inspector(d,source,r.limits,deadline.value_or(Clock::now()+std::chrono::milliseconds(r.limits.maxMillis)),c).run();
    return ChainClockReport{std::move(source),std::move(clocks)};
}catch(const Error &e){return e;}
}
hier::Result<bool> validateChainClockRequest(const ChainClockRequest &r,hier::Cancel c)try{validate(r,c);return true;}catch(const hier::Error &e){return e;}
hier::Result<ChainClockReport> inspectWrapperChainClocks(hier::Design &d,const ChainClockRequest &r,hier::Cancel c){return execute(d,r,c);}
namespace detail {
hier::Result<ChainClockReport> inspectWrapperChainClocksWithDeadline(hier::Design &d,const ChainClockRequest &r,Clock::time_point deadline,hier::Cancel c){return execute(d,r,c,deadline);}
}
}
