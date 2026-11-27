#include "MacroInterfacesInternal.h"
#include "ObjectCatalogInternal.h"
#include "../common/Utf8.h"
#include <algorithm>
#include <map>
#include <set>
#include <type_traits>
namespace dft::memory {
namespace {
using namespace hier;
using namespace hier::model;
using Time=std::chrono::steady_clock::time_point;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Macro interface investigation cancelled"};}
template<class T> T take(Result<T> r) {if(!r)throw r.error();return std::move(r.value());}
objects::CatalogRequest catalogRequest(const MacroRequest &r) {
    objects::CatalogRequest c;c.scope=r.scope;c.recursive=r.recursive;c.kinds={objects::Kind::Instance};c.limits=r.traversal;return c;
}
class Scan {
    Design &design_;
    MacroInterfaces out_;
    Cancel cancel_;
    Time deadline_;
    bool stopped_=false;
    uint64_t pins_=0,bindings_=0;
    void partial(const std::string &reason) {
        out_.complete=false;
        if(std::find(out_.reasons.begin(),out_.reasons.end(),reason)==out_.reasons.end())out_.reasons.push_back(reason);
    }
    bool stop(const char *why) {partial(why);stopped_=true;return false;}
    bool time() {checkpoint(cancel_);return !stopped_&&(std::chrono::steady_clock::now()<deadline_||stop("budget_time"));}
    bool spend() {if(!time())return false;if(out_.work>=out_.request.limits.maxWork)return stop("budget_work");++out_.work;return true;}
    template<class F> auto query(F f) {
        using T=std::remove_cvref_t<decltype(f().value())>;
        if(!time())return std::optional<T>{};
        if(out_.queries>=out_.request.limits.maxQueries){stop("budget_queries");return std::optional<T>{};}
        if(!spend())return std::optional<T>{};
        ++out_.queries;auto value=take(f());if(!time())return std::optional<T>{};
        return std::optional<T>{std::move(value)};
    }
    bool trace(MacroPin &pin,bool top) {
        const auto &l=out_.request.limits;
        if(out_.traceNodes>=l.maxTraceNodes)return stop("budget_trace_nodes");
        if(out_.traceEdges>=l.maxTraceEdges)return stop("budget_trace_edges");
        Budget b;b.maxNodes=int64_t(std::min<uint64_t>(1000,l.maxTraceNodes-out_.traceNodes));
        b.maxEdges=int64_t(std::min<uint64_t>(4000,l.maxTraceEdges-out_.traceEdges));b.maxDepth=int64_t(l.maxDepth);
        b.maxMillis=std::clamp<int64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(deadline_-std::chrono::steady_clock::now()).count(),1,100);
        ConnectionRequest r;r.side=top?"inside":"outside";
        auto reply=query([&]{return design_.cone(pin.port.ref,TraceDirection::Back,TracePolicy::Structural,r,b,cancel_);});
        if(!reply)return false;
        out_.traceNodes+=reply->result.nodes.size();out_.traceEdges+=reply->result.edges.size();
        if(reply->completeness.status!="complete"||reply->result.hasConservative||!reply->result.frontier.empty())partial("clock_trace_partial");
        for(const auto &n:reply->result.nodes) {
            if(!spend())return false;
            if(n.kind!="slice"&&n.kind!="top_port"&&n.kind!="const"&&n.kind!="unconnected")partial("clock_boundary");
        }
        for(const auto &edge:reply->result.edges){(void)edge;if(!spend())return false;}
        pin.clock=std::move(*reply);return true;
    }
    bool macro(size_t index) {
        const auto &info=out_.catalog.instances[index].info;MacroInterface m;m.instance=index;
        if(out_.macros.size()>=out_.request.limits.maxMacros)return stop("budget_macros");
        auto ports=query([&]{return design_.ports(info.ref,cancel_);});if(!ports)return false;
        bool top=false;for(const auto &t:out_.catalog.snapshot.tops)if(t.ref==info.ref)top=true;
        std::map<std::string,std::vector<PinBinding>> byPort;
        uint64_t localBindings=0;
        if(!top) {
            auto parents=query([&]{return design_.ancestors(info.ref,cancel_);});if(!parents)return false;
            if(parents->empty())throw Error{ErrorCode::Internal,"Non-top macro has no parent"};
            m.parent=std::move(parents->back());
            auto status=query([&]{return design_.connectionStatus(m.parent->ref,cancel_);});if(!status)return false;
            m.parentStatus=std::move(*status);if(m.parentStatus->status!="complete")partial("parent_connections_partial");
            auto netlist=query([&]{return design_.bindings(m.parent->ref,cancel_);});if(!netlist)return false;
            if(netlist->inst!=m.parent->ref)throw Error{ErrorCode::Internal,"Parent binding ownership mismatch"};
            for(auto &b:netlist->bindings) {
                if(!spend())return false;
                if(b.inst!=info.ref)continue;
                if(bindings_+localBindings>=out_.request.limits.maxBindings)return stop("budget_bindings");
                ++localBindings;
                if(!b.unresolved.empty())partial("binding_unresolved");
                for(const auto &s:b.segments) {
                    if(!spend())return false;
                    if(s.target.kind!="signal"&&s.target.kind!="const"&&s.target.kind!="unconnected")partial("binding_unresolved");
                }
                byPort[b.pin].push_back(std::move(b));
            }
        }
        std::set<std::string> names;
        for(auto &port:*ports) {
            if(!spend())return false;
            if(pins_+m.pins.size()>=out_.request.limits.maxPins)return stop("budget_pins");
            auto object=query([&]{return design_.object(port.ref,cancel_);});if(!object)return false;
            if(object->ref!=port.ref||object->inst!=info.ref||object->kind!="port")throw Error{ErrorCode::Internal,"Macro port ownership mismatch"};
            MacroPin pin;pin.port=std::move(port);pin.object=std::move(*object);names.insert(pin.port.name);
            auto at=byPort.find(pin.port.ref);
            if(at!=byPort.end()){pin.bindings=std::move(at->second);byPort.erase(at);}else if(!top)partial("missing_binding");
            if(std::find(out_.request.clockPins.begin(),out_.request.clockPins.end(),pin.port.name)!=out_.request.clockPins.end()&&!trace(pin,top))return false;
            m.pins.push_back(std::move(pin));
        }
        if(!byPort.empty())throw Error{ErrorCode::Internal,"Binding does not belong to a published macro port"};
        for(const auto &name:out_.request.clockPins) {
            if(!spend())return false;
            if(!names.contains(name)){m.missingClockPins.push_back(name);partial("missing_clock_pin");}
        }
        if(!time())return false;
        pins_+=m.pins.size();bindings_+=localBindings;out_.macros.push_back(std::move(m));return true;
    }
public:
    Scan(Design &d,const MacroRequest &r,objects::ObjectCatalog catalog,std::optional<Time> deadline,Cancel c):design_(d),cancel_(c),deadline_(deadline.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(r.limits.maxMillis)))) {
        out_.request=r;out_.catalog=std::move(catalog);if(!out_.catalog.complete)partial("catalog_partial");
    }
    MacroInterfaces run() {
        for(size_t i=0;i<out_.catalog.instances.size();++i) {
            if(!spend())break;
            const auto &name=out_.catalog.instances[i].info.defName;
            if(std::find(out_.request.definitionNames.begin(),out_.request.definitionNames.end(),name)!=out_.request.definitionNames.end()&&!macro(i))break;
        }
        (void)time();return std::move(out_);
    }
};
Result<MacroInterfaces> execute(Design &d,const MacroRequest &r,std::optional<Time> end,Cancel c) try {
    checkpoint(c);detail::validateMacroRequest(r);auto catalog=take(objects::enumerateObjects(d,catalogRequest(r),c));
    return Scan(d,r,std::move(catalog),end,c).run();
} catch(const Error &e){return e;}
}
void detail::validateMacroRequest(const MacroRequest &r) {
    objects::detail::validateCatalogRequest(catalogRequest(r));
    const auto names=[](const auto &values,size_t max,bool required) {
        if(values.size()>max||(required&&values.empty()))return false;
        std::set<std::string> seen;
        for(const auto &s:values)if(s.empty()||s.size()>4096||s.find('\0')!=std::string::npos||!dft::detail::validUtf8(s)||!seen.insert(s).second)return false;
        return true;
    };
    const auto &l=r.limits;
    if(!names(r.definitionNames,256,true)||!names(r.clockPins,32,false)||
       !l.maxMacros||l.maxMacros>10000||!l.maxPins||l.maxPins>100000||!l.maxBindings||l.maxBindings>1000000||
       !l.maxQueries||l.maxQueries>1000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000||
       !l.maxTraceNodes||l.maxTraceNodes>1000000||!l.maxTraceEdges||l.maxTraceEdges>4000000||!l.maxDepth||l.maxDepth>1024)
        throw hier::Error{hier::ErrorCode::BadRequest,"Invalid macro definitions, clock pins or detail budget"};
}
hier::Result<MacroInterfaces> inspectMacroInterfaces(hier::Design &d,const MacroRequest &r,hier::Cancel c){return execute(d,r,{},c);}
hier::Result<MacroInterfaces> detail::inspectMacroInterfacesWithDeadline(hier::Design &d,const MacroRequest &r,Time t,hier::Cancel c){return execute(d,r,t,c);}
}
