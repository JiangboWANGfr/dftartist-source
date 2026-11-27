// B C56/C57: frozen HDL/contract oracle; no A implementation or C probe.
#include "hier/Design.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
using namespace hier;
namespace {
auto open(const std::string& top, bool per, size_t cache) {
    model::OpenOptions o;
    o.files={std::string(HIER_FIXTURES)+"/m3/trace_boundaries.sv"}; o.tops={top};
    o.forcePerInstanceBodies=per; o.connectionCacheBytes=cache;
    auto r=Design::open(o); REQUIRE(r.ok()); auto d=std::move(r.value());
    REQUIRE(d->diagnostics().errorCount==0); return d;
}
std::string child(Design& d) {
    auto r=d.children(d.roots()[0].ref); REQUIRE(r.ok()); REQUIRE(r->items.size()==1); return r->items[0].ref;
}
std::string pin(Design& d,const std::string& inst,const std::string& name) {
    auto r=d.ports(inst); REQUIRE(r.ok());
    for(const auto& p:r.value()) if(p.name==name || (name=="@input" && p.direction==model::Direction::In)) return p.ref;
    FAIL("missing frozen pin"); return {};
}
std::string signal(Design& d,const std::string& inst,const std::string& name) {
    auto r=d.signals(inst); REQUIRE(r.ok());
    for(const auto& s:r->items) if(s.name==name) return s.ref;
    FAIL("missing frozen signal"); return {};
}
model::TracePoint point(const std::string& ref,model::BitRange bits,const std::string& side="") {
    model::TracePoint p; p.slice={ref,bits}; if(!side.empty()) p.side=side; return p;
}
bool hasPoint(const model::TraceResult& g,const model::TracePoint& p) {
    return std::any_of(g.nodes.begin(),g.nodes.end(),[&](const auto& n){
        return n.point && n.point->slice.ref==p.slice.ref && n.point->side==p.side &&
            n.point->slice.bits.lsb < p.slice.bits.lsb+p.slice.bits.width &&
            p.slice.bits.lsb < n.point->slice.bits.lsb+n.point->slice.bits.width;
    });
}
void route(const Result<model::QueryResult<model::TraceResult>>& r,
           const model::TracePoint& from,const model::TracePoint& to) {
    REQUIRE(r.ok()); CHECK(r->completeness.status=="complete"); CHECK(r->completeness.reasons.empty());
    CHECK(r->result.frontier.empty()); CHECK_FALSE(r->result.edges.empty());
    CHECK(hasPoint(r->result,from)); CHECK(hasPoint(r->result,to));
}
auto ids(const model::TraceResult& g) {
    std::vector<std::string> out; for(const auto& n:g.nodes) out.push_back(n.id);
    out.push_back("--edges--"); for(const auto& e:g.edges) out.push_back(e.id); return out;
}
void semantic(const Result<model::QueryResult<model::TraceResult>>& r,
              const model::TracePoint& p,const std::string& reason,uint64_t depth) {
    REQUIRE(r.ok()); CHECK(r->completeness.status=="partial");
    CHECK(std::any_of(r->completeness.reasons.begin(),r->completeness.reasons.end(),
                     [&](const auto& x){return x.code==reason && x.at==p.slice.ref;}));
    size_t found=0;
    for(const auto& f:r->result.frontier) if(f.reason==reason && f.point.slice.ref==p.slice.ref) {
        ++found; CHECK(f.depth==depth); CHECK(f.point.side==p.side);
        CHECK(f.point.slice.bits.lsb==p.slice.bits.lsb); CHECK(f.point.slice.bits.width==p.slice.bits.width);
        CHECK_FALSE(f.stepCursor.has_value());
    }
    CHECK(found>0);
}
}
TEST_CASE("B C56: outside input sources retain clipped internal routes cold hot cache0", "[b-trace-boundary]") {
    for(bool per:{false,true}) for(size_t cache:{size_t{0},size_t{64*1024*1024}})
      for(const std::string top:{"b_trace_constant","b_trace_expr","b_trace_wire"}) {
        auto d=open(top,per,cache); const auto leaf=child(*d), dp=pin(*d,leaf,"d"), qp=pin(*d,leaf,"q");
        const auto ds=signal(*d,leaf,"d");
        for(const model::BitRange bits:{model::BitRange{0,4},model::BitRange{1,2}}) {
            const auto from=point(dp,bits,"outside");
            for(const auto& to:{point(dp,bits,"inside"),point(ds,bits),point(qp,bits,"outside")}) {
                INFO("top="<<top<<" per="<<per<<" cache="<<cache<<" target="<<to.slice.ref);
                auto cold=d->paths(from,to); route(cold,from,to);
                auto hot=d->paths(from,to); route(hot,from,to); CHECK(ids(cold->result)==ids(hot->result));
            }
        }
    }
}
TEST_CASE("B C56: source anchors count work while same-side zero hits and disjoint bits stay distinct", "[b-trace-boundary]") {
    for(bool per:{false,true}) for(size_t cache:{size_t{0},size_t{64*1024*1024}})
      for(const std::string top:{"b_trace_constant","b_trace_expr","b_trace_wire"}) {
        auto d=open(top,per,cache); const auto leaf=child(*d), dp=pin(*d,leaf,"d"), qp=pin(*d,leaf,"q");
        const auto from=point(dp,{1,2},"outside"), to=point(qp,{1,2},"outside");
        for(bool nodes:{false,true}) {
            model::Budget b; if(nodes) b.maxNodes=1; else b.maxEdges=0;
            const std::string why=nodes?"budget_nodes":"budget_edges";
            auto r=d->paths(from,to,b); REQUIRE(r.ok()); CHECK(r->completeness.status=="partial");
            CHECK(std::any_of(r->completeness.reasons.begin(),r->completeness.reasons.end(),
                             [&](const auto& x){return x.code==why;}));
            CHECK(r->result.edges.empty());
            CHECK(std::any_of(r->result.frontier.begin(),r->result.frontier.end(),[&](const auto& f){
                return f.reason==why && f.point.slice.ref==from.slice.ref && f.point.side==from.side &&
                    f.point.slice.bits.lsb==1 && f.point.slice.bits.width==2;
            }));
        }
        model::Budget zero; zero.maxDepth=0; auto same=d->paths(from,from,zero); REQUIRE(same.ok());
        CHECK(same->completeness.status=="complete"); CHECK(same->result.nodes.size()==1);
        CHECK(same->result.edges.empty()); CHECK(same->result.frontier.empty());
        CHECK(hasPoint(same->result,from));
        auto miss=d->paths(point(dp,{0,1},"outside"),point(dp,{1,1},"inside")); REQUIRE(miss.ok());
        CHECK(miss->completeness.status=="complete"); CHECK(miss->result.nodes.empty());
        CHECK(miss->result.edges.empty()); CHECK(miss->result.frontier.empty());
        route(d->paths(point(dp,{1,2},"inside"),to),point(dp,{1,2},"inside"),to);
    }
}
TEST_CASE("B C57: stopping at the initial primitive or unknown pin adds no dependency depth", "[b-trace-boundary]") {
    for(bool per:{false,true}) for(size_t cache:{size_t{0},size_t{64*1024*1024}})
      for(const std::string top:{"b_trace_primitive","b_trace_unknown"}) {
        auto d=open(top,per,cache); const auto p=point(pin(*d,child(*d),top=="b_trace_primitive"?"@input":"A"),{0,1},"outside");
        for(auto policy:{model::TracePolicy::Combinational,model::TracePolicy::Full}) {
            semantic(d->cone(p,model::TraceDirection::Forward,policy),p,top=="b_trace_primitive"?"unsupported":"blackbox",0);
        }
    }
}
TEST_CASE("B C57: one real binding increases depth once; structural and zero-depth controls", "[b-trace-boundary]") {
    for(bool per:{false,true}) for(size_t cache:{size_t{0},size_t{64*1024*1024}}) {
        auto d=open("b_trace_primitive",per,cache); const auto p=point(pin(*d,child(*d),"@input"),{0,1},"outside");
        const auto a=point(signal(*d,d->roots()[0].ref,"a"),{0,1});
        semantic(d->cone(a,model::TraceDirection::Forward,model::TracePolicy::Full),p,"unsupported",1);
        auto stop=d->cone(p,model::TraceDirection::Forward,model::TracePolicy::Structural); REQUIRE(stop.ok());
        CHECK(stop->completeness.status=="complete"); CHECK(stop->result.frontier.empty());
        model::Budget b; b.maxDepth=0; auto zero=d->cone(p,model::TraceDirection::Forward,model::TracePolicy::Full,b);
        REQUIRE(zero.ok()); CHECK(zero->completeness.status=="partial");
        CHECK(std::any_of(zero->completeness.reasons.begin(),zero->completeness.reasons.end(),
                         [](const auto& x){return x.code=="budget_depth";}));
        CHECK_FALSE(zero->result.frontier.empty()); for(const auto& f:zero->result.frontier) CHECK(f.depth==0);
    }
}
