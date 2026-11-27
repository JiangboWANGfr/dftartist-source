#include "BoundaryInternal.h"
#include "../common/Utf8.h"
#include <algorithm>
#include <map>
#include <set>
#include <tuple>

namespace dft::wrapper {
namespace {
using namespace hier;
using namespace hier::model;
template<class T> T take(Result<T> result) {
    if(!result) throw result.error();
    return std::move(result.value());
}
void cancelled(Cancel cancel) {
    if(cancel.stop_requested()) throw Error{ErrorCode::Cancelled,"Boundary investigation cancelled"};
}
void add(std::vector<std::string> &values,const std::string &value) {
    if(std::find(values.begin(),values.end(),value)==values.end()) values.push_back(value);
}
void text(const std::string &s) {
    if(s.empty() || s.size()>4096 || s.find('\0')!=std::string::npos || !dft::detail::validUtf8(s))
        throw Error{ErrorCode::BadRequest,"Expected nonempty UTF-8 text of at most 4096 bytes without NUL"};
}
void validate(const BoundaryRequest &r,Cancel cancel) {
    cancelled(cancel);text(r.scope);
    if(r.ports.size()>10000) throw Error{ErrorCode::BadRequest,"Too many port selectors"};
    std::set<std::string> names;size_t bytes=r.scope.size();
    for(const auto &p:r.ports) {
        cancelled(cancel);text(p);bytes+=p.size();
        if(bytes>1024*1024 || !names.insert(p).second) throw Error{ErrorCode::BadRequest,"Duplicate or oversized port selection"};
    }
    const auto &l=r.limits;
    for(const auto &[value,maximum]:{std::pair{l.maxPorts,100000ULL}, {l.maxBits,100000ULL},
        {l.maxWork,10000000ULL}, {l.maxDepth,256ULL}, {l.maxMillis,60000ULL}, {l.pageSize,1000ULL}})
        if(value==0 || value>maximum) throw Error{ErrorCode::BadRequest,"Boundary limit out of range"};
}
struct BudgetStop {std::string reason;};
using Key=std::tuple<std::string,uint64_t,uint64_t,std::optional<std::string>>;
Key key(const TracePoint &p) {return {p.slice.ref,p.slice.bits.lsb,p.slice.bits.width,p.side};}
class Investigation {
    Design &design_;
    BoundaryReport out_;
    Cancel cancel_;
    std::chrono::steady_clock::time_point deadline_;
    std::set<std::string> boundary_;
    std::map<Key,bool> visited_; // false = active, true = completely traversed
    BoundaryRow row_;
    void checkpoint() {
        cancelled(cancel_);
        if(std::chrono::steady_clock::now()>=deadline_) throw BudgetStop{"budget_time"};
    }
    void tick() {
        checkpoint();
        if(out_.work==out_.request.limits.maxWork) throw BudgetStop{"budget_work"};
        ++out_.work;
    }
    void partial(const std::string &reason) {row_.complete=false;add(row_.reasons,reason);}
    void terminal(std::string kind,size_t step,std::optional<size_t> hop={},std::optional<size_t> next={}) {
        row_.terminals.push_back({std::move(kind),step,hop,next});
    }
    void walk(const TracePoint &point,uint64_t depth) {
        checkpoint();
        const auto [it,inserted]=visited_.emplace(key(point),false);
        if(!inserted) {if(!it->second) partial("cycle");return;}
        if(depth>=out_.request.limits.maxDepth) throw BudgetStop{"budget_depth"};
        StepLimit limit;limit.maxHops=static_cast<int>(out_.request.limits.pageSize);
        bool any=false;
        do {
            tick();ConnectionRequest request;request.bits=point.slice.bits;request.reach="hier";request.side=point.side.value_or("");
            auto response=take(design_.step(point.slice.ref,row_.upstream,request,limit,cancel_));
            checkpoint();
            for(const auto &reason:response.completeness.reasons)
                if(reason.code!="budget_nodes" || response.result.next.empty()) partial("core_step_partial");
            if(response.completeness.status!="complete" && response.completeness.reasons.empty()) partial("core_step_partial");
            if(response.result.hasConservative) {row_.hasConservative=true;partial("conservative_dependency");}
            const auto step=row_.steps.size();const auto nextPage=response.result.next;
            row_.steps.push_back({point,std::move(response)});
            // Recursive descent can reallocate steps: do not retain references into it.
            const auto count=row_.steps[step].response.result.hops.size();any|=count!=0;
            for(size_t h=0;h<count;++h) {
                tick();const auto hop=row_.steps[step].response.result.hops[h];
                if(hop.from.ref!=hop.via && boundary_.contains(hop.via)) {
                    terminal("boundary",step,h);continue;
                }
                if(hop.kind=="register") {
                    if(row_.upstream) terminal("register_output",step,h);
                    else if(hop.next.empty()) {terminal("opaque",step,h);partial("register_role_missing");}
                    else for(size_t n=0;n<hop.next.size();++n) {
                        tick();const auto &role=hop.next[n].role;
                        if(role=="data" || role=="clock" || role=="control" || role=="async") terminal("register_"+role,step,h,n);
                        else {terminal("opaque",step,h,n);partial("unsupported_role");}
                    }
                } else if(hop.kind=="const" || hop.kind=="unconnected") terminal(hop.kind,step,h);
                else if(hop.kind=="process" && hop.next.empty() && row_.upstream) {
                    tick();auto process=take(design_.proc(hop.via,cancel_));checkpoint();
                    const auto &p=process.result;
                    bool literal=false;
                    if(process.completeness.status=="complete" && p.expr && p.expr->op=="const")
                        for(const auto &write:p.writes) {
                            tick();
                            if(write.target.ref!=hop.from.ref || !write.exprMap || write.exprMap->status!="mapped") continue;
                            for(const auto &segment:write.exprMap->segments) {
                                tick();
                                if(hop.from.bits.lsb>=segment.to && hop.from.bits.lsb-segment.to<segment.width &&
                                    hop.from.bits.width<=segment.width-(hop.from.bits.lsb-segment.to)) literal=true;
                            }
                        }
                    row_.processes.push_back({step,h,std::move(process)});
                    terminal(literal?"const":"opaque",step,h);
                    if(!literal) partial("unsupported_process");
                }
                else if((hop.kind=="process" || hop.kind=="binding_up" || hop.kind=="binding_down") && !hop.next.empty()) {
                    for(const auto &next:hop.next) {
                        tick();if(next.precision!="exact") {row_.hasConservative=true;partial("conservative_dependency");}
                        walk({next.slice,next.side},depth+1);
                    }
                } else {terminal("opaque",step,h);partial("opaque_boundary");}
            }
            if(nextPage.empty()) {
                if(!any) terminal("dangling",step);
                break;
            }
            if(nextPage==limit.cursor) throw Error{ErrorCode::Internal,"Boundary step cursor did not advance"};
            limit.cursor=nextPage;
        } while(true);
        it->second=true;
    }
    void summarize() {
        if(!row_.complete) {row_.summary="unknown";return;}
        std::set<std::string> kinds;
        for(const auto &t:row_.terminals) {
            checkpoint();
            if(t.kind=="register_output" || t.kind=="register_data") kinds.insert("register");
            else if(t.kind=="register_clock" || t.kind=="register_control" || t.kind=="register_async") kinds.insert("control");
            else kinds.insert(t.kind=="const"?"constant":t.kind);
        }
        row_.summary=kinds.size()==1?*kinds.begin():"mixed";
    }
  public:
    Investigation(Design &d,const BoundaryRequest &r,std::chrono::steady_clock::time_point deadline,Cancel c)
        :design_(d),cancel_(c),deadline_(deadline) {out_.request=r;}
    BoundaryReport run() {
        out_.snapshot=take(design_.snapshot(cancel_));
        // Resolve target before publishing a budget prefix: every report has a real scope.
        const auto resolved=take(design_.resolvePath(out_.request.scope,cancel_));
        if(resolved.completeness.status!="complete" || resolved.result.size()!=1)
            throw Error{ErrorCode::NotFound,"Scope must resolve to one instance"};
        out_.scope=take(design_.instance(resolved.result.front(),cancel_));
        auto ports=take(design_.ports(out_.scope.ref,cancel_));
        std::set<std::string> wanted(out_.request.ports.begin(),out_.request.ports.end()),found;
        for(const auto &p:ports) {cancelled(cancel_);boundary_.insert(p.ref);if(wanted.contains(p.name)) found.insert(p.name);}
        if(found!=wanted) throw Error{ErrorCode::NotFound,"Selected port does not exist in scope"};
        for(auto &p:ports) if(wanted.empty() || wanted.contains(p.name)) out_.ports.push_back(std::move(p));
        const bool portLimit=out_.ports.size()>out_.request.limits.maxPorts;
        if(portLimit) out_.ports.resize(static_cast<size_t>(out_.request.limits.maxPorts));
        std::optional<size_t> atPort;std::optional<uint64_t> atBit;std::optional<bool> upstream;
        try {
            checkpoint();
            for(size_t p=0;p<out_.ports.size();++p) {
                atPort=p;atBit.reset();upstream.reset();tick();const auto &port=out_.ports[p];
                if(port.kind!=PortKind::Port || port.width==0 ||
                    (port.direction!=Direction::In && port.direction!=Direction::Out && port.direction!=Direction::InOut)) {
                    out_.unsupportedPorts.push_back(p);out_.complete=false;add(out_.reasons,"unsupported_port");continue;
                }
                for(uint64_t bit=0;bit<port.width;++bit) {
                    for(bool back:{false,true}) {
                        if((back && port.direction==Direction::In) || (!back && port.direction==Direction::Out)) continue;
                        atBit=bit;upstream=back;checkpoint();
                        if(out_.rows.size()==out_.request.limits.maxBits) throw BudgetStop{"budget_bits"};
                        tick();row_={};row_.port=p;row_.bit=bit;row_.upstream=back;visited_.clear();
                        walk({{port.ref,{bit,1}},"inside"},0);summarize();checkpoint();
                        if(!row_.complete) {out_.complete=false;add(out_.reasons,"row_partial");}
                        out_.rows.push_back(std::move(row_));
                    }
                }
            }
            if(portLimit) {out_.complete=false;add(out_.reasons,"budget_ports");out_.stop=BoundaryStop{"budget_ports",{},{},{}};}
        } catch(const BudgetStop &stop) {
            out_.complete=false;add(out_.reasons,stop.reason);out_.stop=BoundaryStop{stop.reason,atPort,atBit,upstream};
        }
        cancelled(cancel_);return std::move(out_);
    }
};
}
hier::Result<bool> validateBoundaryRequest(const BoundaryRequest &r,hier::Cancel c) try {validate(r,c);return true;} catch(const hier::Error &e) {return e;}
namespace detail {
hier::Result<BoundaryReport> investigateBoundaryWithDeadline(hier::Design &d,const BoundaryRequest &r,
    std::chrono::steady_clock::time_point deadline,hier::Cancel c) try {
    validate(r,c);return Investigation(d,r,deadline,c).run();
} catch(const hier::Error &e) {return e;}
}
hier::Result<BoundaryReport> investigateBoundary(hier::Design &d,const BoundaryRequest &r,hier::Cancel c) {
    auto valid=validateBoundaryRequest(r,c);if(!valid) return valid.error();
    return detail::investigateBoundaryWithDeadline(d,r,std::chrono::steady_clock::now()+std::chrono::milliseconds(r.limits.maxMillis),c);
}
}
