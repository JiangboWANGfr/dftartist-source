// B frozen observer oracle: DESIGN + C-reviewed synchronous event semantics.
// No A helpers, implementation source, sleeps, reentrant Design calls or output mocks.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include "Observe.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <set>
#include <stop_token>
#include <tuple>
#include <type_traits>
#ifndef HIER_TEST_OBSERVER
#error B observer tests must link a coherently rebuilt ON product
#endif
using namespace hier;
namespace {
namespace obs=hier::observation;
constexpr size_t Kinds=static_cast<size_t>(obs::Kind::TraceFilterRange)+1;
struct State {
    std::array<size_t,Kinds> counts{};
    std::array<uint64_t,2> bodies{};
    std::array<std::array<uint32_t,16>,2> occurrence{};
    std::array<size_t,2> length{};
    bool overflow=false;
    std::stop_source* stop=nullptr;
    obs::Kind trigger=obs::Kind::SourceHitEmit;
    size_t triggerAt=0,afterStop=0;
    uint64_t lastEmitAmount=0,clockCalls=0;
    int64_t tickMillis=0;
    size_t count(obs::Kind k) const {return counts[static_cast<size_t>(k)];}
};
void event(void* context,const obs::Event& e) noexcept {
    auto& s=*static_cast<State*>(context);
    if(s.stop && s.stop->stop_requested()) ++s.afterStop;
    const auto index=static_cast<size_t>(e.kind);
    ++s.counts[index];
    if(e.kind==obs::Kind::StepBodyAdmitted) {
        const auto n=s.counts[index]-1;
        if(n<2) {
            s.bodies[n]=e.subject; s.length[n]=e.occurrence.size();
            if(e.occurrence.size()>16) s.overflow=true;
            else std::copy(e.occurrence.begin(),e.occurrence.end(),s.occurrence[n].begin());
        } else s.overflow=true;
    }
    if(e.kind==obs::Kind::SourceHitEmit) s.lastEmitAmount=e.amount;
    if(s.stop && e.kind==s.trigger && s.counts[index]==s.triggerAt) s.stop->request_stop();
}
obs::Clock::time_point clockNow(void* context) noexcept {
    auto& s=*static_cast<State*>(context);
    return obs::Clock::time_point{}+
        std::chrono::milliseconds(static_cast<int64_t>(s.clockCalls++)*s.tickMillis);
}
obs::Sink sink(State& s,bool fakeClock=false) {return {&s,event,fakeClock?clockNow:nullptr};}
static_assert(!std::is_constructible_v<obs::Scope,obs::Sink&&>);
std::unique_ptr<Design> open(std::string_view fixture,std::string_view top,
                             bool per=false,size_t cache=64U*1024U*1024U) {
    model::OpenOptions options;
    options.files={std::string(HIER_FIXTURES)+"/m3/"+std::string(fixture)};
    options.tops={std::string(top)};options.forcePerInstanceBodies=per;
    options.connectionCacheBytes=cache;
    auto r=Design::open(options);REQUIRE(r.ok());
    auto d=std::move(r.value());REQUIRE(d->diagnostics().errorCount==0);
    return d;
}
std::string root(Design& d) {REQUIRE(d.roots().size()==1);return d.roots()[0].ref;}
std::string signal(Design& d,std::string_view name) {
    auto list=d.signals(root(d));REQUIRE(list.ok());
    for(const auto& s:list->items) if(s.name==name) return s.ref;
    FAIL("missing independent signal");return {};
}
model::SourceSpan leaf(Design& d) {
    const auto defs=d.definitions();REQUIRE(defs.ok());
    for(const auto& def:defs->items) if(def.name=="leaf") {
        auto r=d.source(def.ref,model::SourceKind::Definition);REQUIRE(r.ok());return *r;
    }
    FAIL("missing frozen synthetic leaf");return {};
}
template<class T> void cancelled(const T& r) {
    REQUIRE_FALSE(r.ok());CHECK(r.error().code==ErrorCode::Cancelled);
    CHECK_FALSE(r.error().message.empty());
}
using HitKey=std::tuple<std::string,model::SourceKind,size_t,size_t>;
std::vector<HitKey> hits(const std::vector<model::SourceHit>& items) {
    std::vector<HitKey> result;
    for(const auto& h:items) result.emplace_back(h.ref,h.kind,h.span.start.offset,h.span.end.offset);
    return result;
}
std::vector<std::string> facts(const model::StepResult& result) {
    std::vector<std::string> out;
    for(const auto& h:result.hops) out.push_back(h.fact);
    return out;
}
std::vector<std::string> graph(const model::TraceResult& result) {
    std::vector<std::string> out;
    for(const auto& n:result.nodes) out.push_back("n:"+n.id);
    for(const auto& e:result.edges) out.push_back("e:"+e.id);
    return out;
}
}

TEST_CASE("B observer: 100001 source hits materialize only one on cold and hot first pages",
          "[b-m3-observer]") {
    auto d=open("source_large.sv","top");
    const auto span=leaf(*d);
    PageRequest page;page.limit=1;
    std::vector<HitKey> cold;
    for(bool hot:{false,true}) {
        State state;auto observer=sink(state);
        obs::Scope scope(observer);
        auto r=d->resolveSource(span.file,span.start.line,span.start.column,page);
        REQUIRE(r.ok());CHECK(r->completeness.status=="complete");
        REQUIRE(r->result.items.size()==1);REQUIRE_FALSE(r->result.next.empty());
        CHECK(state.count(obs::Kind::SourceCandidate)==2); // one + one next probe
        CHECK(state.count(obs::Kind::SourceHitMaterialize)==1);
        CHECK(state.count(obs::Kind::SourceHitEmit)==1);
        CHECK(state.lastEmitAmount==1);
        if(!hot) {
            CHECK(state.count(obs::Kind::SourceIndexRange)>0);
            CHECK(state.count(obs::Kind::OccurrenceVisit)>0);
            CHECK(state.count(obs::Kind::SourceIndexPublish)==1);
            cold=hits(r->result.items);
        } else {
            CHECK(state.count(obs::Kind::SourceIndexRange)==0);
            CHECK(state.count(obs::Kind::OccurrenceVisit)==0);
            CHECK(state.count(obs::Kind::SourceIndexPublish)==0);
            CHECK(hits(r->result.items)==cold);
        }
    }
}

TEST_CASE("B observer: occurrence and shared source index cancel before publishing and retry cold",
          "[b-m3-observer]") {
    for(const auto stage:{obs::Kind::OccurrenceVisit,obs::Kind::OccurrencePublish,
                          obs::Kind::SourceIndexRange,obs::Kind::SourceIndexPublish})
    DYNAMIC_SECTION("stage="<<static_cast<int>(stage)) {
        auto d=open("source_large.sv","top");const auto span=leaf(*d);
        PageRequest page;page.limit=1;
        std::stop_source stop;State state;state.stop=&stop;state.trigger=stage;
        state.triggerAt=(stage==obs::Kind::OccurrenceVisit || stage==obs::Kind::SourceIndexRange)?2:1;
        auto observer=sink(state);
        {
            obs::Scope scope(observer);
            auto r=d->resolveSource(span.file,span.start.line,span.start.column,page,stop.get_token());
            cancelled(r);
        }
        REQUIRE(stop.stop_requested());CHECK(state.count(stage)==state.triggerAt);
        CHECK(state.afterStop==0);
        State retry;auto retrySink=sink(retry);
        {
            obs::Scope scope(retrySink);
            auto r=d->resolveSource(span.file,span.start.line,span.start.column,page);
            REQUIRE(r.ok());CHECK(r->result.items.size()==1);CHECK_FALSE(r->result.next.empty());
        }
        if(stage==obs::Kind::OccurrenceVisit || stage==obs::Kind::OccurrencePublish)
            CHECK(retry.count(obs::Kind::OccurrenceVisit)>0);
        else CHECK(retry.count(obs::Kind::SourceIndexRange)>0);
        CHECK(retry.count(obs::Kind::SourceHitMaterialize)==1);
    }
}

TEST_CASE("B observer: cancelling source page materialization or emit preserves original cursor",
          "[b-m3-observer]") {
    auto d=open("source_large.sv","top");const auto span=leaf(*d);
    PageRequest page;page.limit=1;
    auto first=d->resolveSource(span.file,span.start.line,span.start.column,page);
    REQUIRE(first.ok());REQUIRE_FALSE(first->result.next.empty());
    page.cursor=first->result.next;page.limit=7;
    auto control=d->resolveSource(span.file,span.start.line,span.start.column,page);
    REQUIRE(control.ok());REQUIRE(control->result.items.size()==7);
    const auto expected=hits(control->result.items);
    for(const auto stage:{obs::Kind::SourceHitMaterialize,obs::Kind::SourceHitEmit}) {
        std::stop_source stop;State state;state.stop=&stop;state.trigger=stage;state.triggerAt=1;
        auto observer=sink(state);
        {
            obs::Scope scope(observer);
            cancelled(d->resolveSource(span.file,span.start.line,span.start.column,page,stop.get_token()));
        }
        REQUIRE(stop.stop_requested());CHECK(state.count(stage)==1);CHECK(state.afterStop==0);
        CHECK(state.count(obs::Kind::SourceIndexRange)==0);
        State retry;auto retrySink=sink(retry);
        {
            obs::Scope scope(retrySink);
            auto r=d->resolveSource(span.file,span.start.line,span.start.column,page);
            REQUIRE(r.ok());CHECK(hits(r->result.items)==expected);
            CHECK(r->result.next==control->result.next);
        }
        CHECK(retry.count(obs::Kind::SourceCandidate)<=8);
        CHECK(retry.count(obs::Kind::SourceHitMaterialize)==7);
        CHECK(retry.count(obs::Kind::SourceHitEmit)==7);
    }
}

TEST_CASE("B observer: hot cache still admits exactly two logical step contexts before third",
          "[b-m3-observer]") {
    for(bool per:{false,true}) DYNAMIC_SECTION("per="<<per) {
        auto d=open("flow.sv","fanout",per);
        const auto a=signal(*d,"a");
        StepLimit limit;limit.maxHops=1000;
        std::vector<std::string> cold;std::string cursor;
        for(bool hot:{false,true}) {
            State state;auto observer=sink(state);
            obs::Scope scope(observer);
            auto r=d->step(a,false,{},limit);REQUIRE(r.ok());
            CHECK(r->completeness.status=="partial");
            REQUIRE_FALSE(r->result.next.empty());
            CHECK(state.count(obs::Kind::StepBodyAdmitted)==2);
            CHECK_FALSE(state.overflow);
            CHECK((state.bodies[0]!=state.bodies[1] ||
                   state.length[0]!=state.length[1] ||
                   state.occurrence[0]!=state.occurrence[1]));
            if(!hot) {cold=facts(r->result);cursor=r->result.next;
                CHECK(state.count(obs::Kind::ConnectionIndexEntry)>0);
            } else {
                CHECK(state.count(obs::Kind::ConnectionIndexEntry)==0);
                CHECK(facts(r->result)==cold);CHECK(r->result.next==cursor);
            }
        }
    }
}

TEST_CASE("B observer: hot end-bit seeks a 4096-fact index without enumerating the fanout",
          "[b-m3-observer]") {
    size_t smallSeek=0,largeSeek=0;
    for(uint64_t width:{uint64_t{64},uint64_t{4096}}) {
      auto d=open("observed_intervals.sv",width==64?"observed_small":"observed_intervals");
      const auto a=signal(*d,"a"),y=signal(*d,"y");
      ConnectionRequest req;req.bits=model::BitRange{width-1,1};
      StepLimit limit;limit.maxHops=1;
      for(bool hot:{false,true}) {
        State state;auto observer=sink(state);obs::Scope scope(observer);
        auto r=d->step(a,false,req,limit);REQUIRE(r.ok());
        REQUIRE(r->result.hops.size()==1);
        REQUIRE(r->result.hops[0].next.size()==1);
        CHECK(r->result.hops[0].next[0].slice.ref==y);
        CHECK(r->result.hops[0].next[0].slice.bits==model::BitRange{width-1,1});
        CHECK(state.count(obs::Kind::StepCandidate)<=2);
        CHECK(state.count(obs::Kind::HopMaterialize)<=2);
        CHECK(state.count(obs::Kind::HopEmit)==1);
        const auto seek=state.count(obs::Kind::ConnectionSeekNode)+state.count(obs::Kind::ConnectionSeekCompare);
        CHECK(seek>0);
        if(!hot) CHECK(state.count(obs::Kind::ConnectionIndexEntry)>0);
        else {
            CHECK(state.count(obs::Kind::ConnectionIndexEntry)==0);
            if(width==64) smallSeek=seek;else largeSeek=seek;
        }
      }
    }
    // Fanout grows 64x; logarithmic seeking receives a generous 16x envelope.
    // Relative independent control, not a fitted A count or absolute timing SLA.
    CHECK(largeSeek<=16*(smallSeek+1));
}

TEST_CASE("B observer: connection build and cache publication cancel then rebuild without half index",
          "[b-m3-observer]") {
    for(const auto stage:{obs::Kind::ConnectionIndexEntry,obs::Kind::CachePublish})
    DYNAMIC_SECTION("stage="<<static_cast<int>(stage)) {
        auto d=open("observed_intervals.sv","observed_intervals");
        const auto a=signal(*d,"a");
        ConnectionRequest req;req.bits=model::BitRange{4095,1};
        std::stop_source stop;State state;state.stop=&stop;state.trigger=stage;state.triggerAt=1;
        auto observer=sink(state);
        {
            obs::Scope scope(observer);
            cancelled(d->step(a,false,req,{},stop.get_token()));
        }
        REQUIRE(stop.stop_requested());CHECK(state.count(stage)==1);CHECK(state.afterStop==0);
        State retry;auto retrySink=sink(retry);
        {
            obs::Scope scope(retrySink);
            auto r=d->step(a,false,req);REQUIRE(r.ok());CHECK(r->result.hops.size()==1);
        }
        CHECK(retry.count(obs::Kind::ConnectionIndexEntry)>0);
        State warm;auto warmSink=sink(warm);
        {
            obs::Scope scope(warmSink);
            auto r=d->step(a,false,req);REQUIRE(r.ok());CHECK(r->result.hops.size()==1);
        }
        CHECK(warm.count(obs::Kind::ConnectionIndexEntry)==0);
    }
}

TEST_CASE("B observer: trace relation and filtering cancel without publishing a partial graph",
          "[b-m3-observer]") {
    // Two real arms converge: an existing filter interval must be merged.
    auto d=open("observed_intervals.sv","observed_diamond");
    const auto a=signal(*d,"a"),c=signal(*d,"q");
    ConnectionRequest from,to;from.bits=model::BitRange{0,1};to.bits=model::BitRange{0,1};
    auto control=d->paths(a,c,from,to);REQUIRE(control.ok());
    REQUIRE_FALSE(control->result.edges.empty());
    const auto expected=graph(control->result);
    for(const auto stage:{obs::Kind::TraceRelation,obs::Kind::TraceFilterRange}) {
        std::stop_source stop;State state;state.stop=&stop;state.trigger=stage;state.triggerAt=1;
        auto observer=sink(state);
        {
            obs::Scope scope(observer);
            const auto result=d->paths(a,c,from,to,{},stop.get_token());
            CAPTURE(static_cast<int>(stage),state.count(stage),stop.stop_requested());
            REQUIRE(stop.stop_requested());
            cancelled(result);
        }
        REQUIRE(stop.stop_requested());CHECK(state.count(stage)==1);
        auto retry=d->paths(a,c,from,to);REQUIRE(retry.ok());
        CHECK(retry->completeness.status=="complete");CHECK(graph(retry->result)==expected);
    }
}

TEST_CASE("B observer: deterministic monotonic time budget expires and retry has the real graph",
          "[b-m3-observer]") {
    auto d=open("flow.sv","bit_paths");const auto a=signal(*d,"a");
    model::Budget budget;budget.maxMillis=1;
    State expire;expire.tickMillis=2;auto expiredSink=sink(expire,true);
    {
        obs::Scope scope(expiredSink);
        auto r=d->cone(a,model::TraceDirection::Forward,model::TracePolicy::Full,{},budget);
        REQUIRE(r.ok());CHECK(r->completeness.status=="partial");
        CHECK(std::any_of(r->completeness.reasons.begin(),r->completeness.reasons.end(),
                          [](const auto& x){return x.code=="budget_time";}));
        CHECK_FALSE(r->result.frontier.empty());
    }
    CHECK(expire.clockCalls>=2);
    State steady;auto steadySink=sink(steady,true);
    {
        obs::Scope scope(steadySink);
        auto r=d->cone(a,model::TraceDirection::Forward,model::TracePolicy::Full,{},budget);
        REQUIRE(r.ok());CHECK(r->completeness.status=="complete");
        CHECK_FALSE(r->result.edges.empty());
    }
    CHECK(steady.clockCalls>=2);
}
