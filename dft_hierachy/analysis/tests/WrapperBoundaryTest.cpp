#include "BoundaryInternal.h"
#include "BoundaryJson.h"
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::wrapper;
size_t checks=0;
void need(bool b,const char *m){++checks;if(!b)throw std::runtime_error(m);}
auto open(const char *top) {
    hier::model::OpenOptions o;o.files={DFT_WRAPPER_FIXTURE};o.tops={top};
    auto d=hier::Design::open(o);need(bool(d),"open");need(d.value()->diagnostics(10).errorCount==0,"compile");return std::move(d.value());
}
BoundaryReport run(hier::Design &d,const char *scope,std::vector<std::string> ports={}) {
    BoundaryRequest r;r.scope=scope;r.ports=std::move(ports);auto got=investigateBoundary(d,r);need(bool(got),"analyze");return std::move(got.value());
}
std::string json(const BoundaryReport &r){hier::protocol::JsonWriter w;writeBoundary(w,r);return w.str();}
void references(const BoundaryReport &r) {
    for(const auto &row:r.rows) {
        need(row.port<r.ports.size() && row.bit<r.ports[row.port].width,"row references");
        for(const auto &t:row.terminals) {
            need(t.step<row.steps.size(),"step reference");
            if(t.hop) {const auto &hs=row.steps[t.step].response.result.hops;need(*t.hop<hs.size(),"hop reference");if(t.continuation)need(*t.continuation<hs[*t.hop].next.size(),"continuation reference");}
        }
    }
}
}
int main()try {
    auto d=open("boundary_top");auto got=run(*d,"boundary_top",{"d"});need(got.complete && got.rows.size()==4,"4 complete input bits");
    for(uint64_t b=0;b<4;++b) {
        const auto &r=got.rows[static_cast<size_t>(b)];need(r.summary=="register" && r.terminals.size()==2,"shared occurrences");
        const auto &a=r.terminals[0],&z=r.terminals[1];const auto &h=r.steps[a.step].response.result.hops[*a.hop],&g=r.steps[z.step].response.result.hops[*z.hop];
        need(h.via!=g.via,"occurrence identities");need(h.next[*a.continuation].slice.bits==hier::model::BitRange{3-b,1},"reversed binding exact bit");need(g.next[*z.continuation].slice.bits==hier::model::BitRange{b,1},"straight binding exact bit");
    }
    references(got);
    for(const auto *name:{"c","r","en"}) {auto x=run(*d,"boundary_top",{name});need(x.complete && x.rows[0].summary=="control","event and condition roles");const auto kind=std::string(name)=="c"?"register_clock":std::string(name)=="r"?"register_async":"register_control";bool present=false;for(const auto &t:x.rows[0].terminals){present|=t.kind==kind;need(t.kind==kind || (std::string(name)=="r" && t.kind=="register_control"),"literal role");}need(present,"expected event role present");}
    for(const auto *name:{"pass","through"}) {auto x=run(*d,"boundary_top",{name});need(x.complete && x.rows[0].summary=="boundary","feedthrough structure");}
    auto constant=run(*d,"boundary_top",{"one"});need(constant.complete && constant.rows[0].summary=="constant" && constant.rows[0].processes.size()==1,"literal constant proof");
    auto unused=run(*d,"boundary_top",{"unused"});need(unused.complete && unused.rows[0].summary=="dangling","unloaded input");
    auto unknown=run(*d,"boundary_top",{"out_unknown"});need(!unknown.complete && unknown.rows[0].summary=="unknown","opaque never complete");
    auto q=run(*d,"boundary_top",{"q"});need(q.complete && q.rows.size()==4,"output stop");for(const auto &r:q.rows)for(const auto &t:r.terminals)need(t.kind=="register_output","does not traverse flop");
    auto nested=run(*d,"boundary_top.u",{"d"});need(nested.complete && nested.rows.size()==4 && nested.rows[0].terminals.size()==1,"nested occurrence excludes siblings");
    BoundaryRequest request;request.scope="boundary_top";request.ports={"d"};
    auto base=investigateBoundary(*d,request);need(bool(base),"base");
    for(uint64_t cap=1;cap<=base->work;++cap) {
        request.limits.maxWork=cap;auto x=investigateBoundary(*d,request);need(x && x->work==cap,"work accounting");need(x->rows.size()<=4,"prefix bound");references(*x);
        for(size_t i=0;i<x->rows.size();++i)need(x->rows[i].bit==base->rows[i].bit && x->rows[i].terminals.size()==base->rows[i].terminals.size(),"no partial row commit");
        need(x->complete==(cap==base->work),"exact completion boundary");
    }
    request.limits={};request.limits.maxBits=2;auto limited=investigateBoundary(*d,request);need(limited && limited->rows.size()==2 && limited->stop->bit==2 && limited->stop->reason=="budget_bits","bit prefix");
    request.limits={};request.limits.maxDepth=1;limited=investigateBoundary(*d,request);need(limited && limited->rows.empty() && limited->stop->reason=="budget_depth","depth atomic row");
    request.limits={};request.ports.clear();request.limits.maxPorts=1;limited=investigateBoundary(*d,request);need(limited && limited->ports.size()==1 && limited->rows.size()==1 && limited->stop->reason=="budget_ports","port prefix");
    request.limits={};auto expired=detail::investigateBoundaryWithDeadline(*d,request,std::chrono::steady_clock::time_point::min());need(expired && !expired->complete && expired->rows.empty() && expired->work==0 && expired->stop->reason=="budget_time","deterministic deadline");
    request.ports={"nope"};auto bad=investigateBoundary(*d,request);need(!bad && bad.error().code==hier::ErrorCode::NotFound,"missing port");
    request.scope="absent";request.ports={"c","c"};bad=investigateBoundary(*d,request);need(!bad && bad.error().code==hier::ErrorCode::BadRequest,"validate before lookup");
    std::stop_source stop;stop.request_stop();bad=investigateBoundary(*d,request,stop.get_token());need(!bad && bad.error().code==hier::ErrorCode::Cancelled,"cancel before validation");
    request={};request.scope="boundary_top";
    for(int test=0;test<8;++test) {auto invalid=request;switch(test){case 0:invalid.scope=std::string("x\0y",3);break;case 1:invalid.scope=std::string(1,static_cast<char>(255));break;case 2:invalid.limits.maxWork=0;break;case 3:invalid.limits.maxDepth=257;break;case 4:invalid.limits.pageSize=1001;break;case 5:invalid.ports={""};break;case 6:invalid.limits.maxMillis=60001;break;case 7:invalid.ports={std::string(4097,'a')};break;}need(!validateBoundaryRequest(invalid),"invalid request");}
    auto shell=open("boundary_shell");auto enclosed=run(*shell,"boundary_shell.u");need(enclosed.complete && enclosed.rows.size()==2,"nested scope complete");for(const auto &r:enclosed.rows)need(r.summary=="boundary","parent constant and flop excluded");
    auto diamond=open("boundary_diamond");auto converged=run(*diamond,"boundary_diamond",{"d"});need(converged.complete && converged.rows[0].summary=="register","convergence is not cycle");
    auto cycle=open("boundary_cycle");auto cyclic=run(*cycle,"boundary_cycle");need(!cyclic.complete && cyclic.rows[0].summary=="unknown","cycle partial");
    auto io=open("boundary_inout");auto inout=run(*io,"boundary_inout");need(inout.rows.size()==4 && !inout.rows[0].upstream && inout.rows[1].upstream && inout.rows[2].bit==1,"inout direction rows");
    auto mixed=open("boundary_mixed");auto m=run(*mixed,"boundary_mixed",{"d"});need(m.complete && m.rows[0].summary=="mixed","mixed register and boundary");
    auto opaque=open("boundary_opaque");auto op=run(*opaque,"boundary_opaque.u");need(!op.complete && op.unsupportedPorts==std::vector<size_t>{0,1} && op.rows.empty(),"unknown direction ports not guessed");
    const auto saved=json(got);d.reset();request={};need(json(got)==saved,"report owns data");
    std::cout<<checks<<" wrapper assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
