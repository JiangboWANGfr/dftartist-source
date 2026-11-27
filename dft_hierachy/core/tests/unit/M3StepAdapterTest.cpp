// B's C-approved internal integration adapter: genuine DB/index/step, hand facts.
// No product implementation or A test is used to calculate expected results.
#include "hier/db/DesignDb.h"
#include "hier/frontend/Frontend.h"
#include "Step.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <set>
#include <stop_token>

using namespace hier;
namespace {
struct State {
    std::array<size_t,4> extracts{};
    size_t calls=0, trigger=0;
    std::stop_source stop;
};
class HandFrontend final : public frontend::Frontend {
  public:
    HandFrontend(std::shared_ptr<State> state, bool fan) : state_(std::move(state)), fan_(fan) {
        info_.name="B-independent-hand-facts";
        if(fan_) tops_={{"parent",0}};
        else tops_={{"one",0},{"two",1},{"three",2}};
        defs_={{"parent",model::DefKind::Module,"",0},{"leaf",model::DefKind::Module,"",0}};
    }
    const model::FrontendInfo& info() const override { return info_; }
    const std::vector<model::TopInfo>& tops() const override { return tops_; }
    size_t bodyCount() const override { return fan_ ? 4 : 3; }
    const std::vector<model::DefInfo>& definitions() const override { return defs_; }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId body) const override {
        model::BodySkeleton s; s.def=body==0 ? 0U : 1U;
        if(fan_ && body==0) {
            for(uint32_t child=0;child<3;++child) {
                model::ChildSlot slot; slot.name="n"+std::to_string(child);
                slot.def=1; slot.body=child+1; s.slots.push_back(slot);
            }
        } else if(fan_) {
            model::PortInfo p; p.name="d"; p.direction=model::Direction::In; p.width=1;
            p.internal.kind="direct"; p.internal.signal="s::0"; p.internal.bits={0,1};
            s.ports.push_back(p);
        }
        return s;
    }
    model::BodyConnections connections(model::BodyId body) const override {
        ++state_->extracts.at(body); ++state_->calls;
        model::BodyConnections c;
        model::SignalInfo d; d.ref="s::0"; d.name=(fan_ && body==0)?"a":"d";
        d.kind="net"; d.width=1; c.signals.push_back(d);
        // Independent input accounting metadata; not an RSS estimate.
        c.estimatedBytes=8192;
        if(fan_ && body==0) {
            for(uint32_t child=0;child<3;++child) {
                model::PinBinding b; b.inst="i:"+std::to_string(child);
                b.pin="p:"+std::to_string(child)+":0"; b.port="d"; b.direction="in"; b.width=1;
                model::BindSegment seg; seg.pinBits={0,1}; seg.target.kind="signal";
                seg.target.signal="s::0"; seg.target.bits={0,1}; b.segments.push_back(seg);
                c.bindings.push_back(b);
            }
        } else if(fan_) {
            c.internals=skeleton(body).ports.empty() ? std::vector<model::PortInternal>{}
                                                     : std::vector<model::PortInternal>{skeleton(body).ports[0].internal};
        } else {
            model::SignalInfo y=d; y.ref="s::1"; y.name="y"; c.signals.push_back(y);
            model::ProcessInfo process; process.ref="x::0"; process.kind="assign";
            model::Write w; w.target={"s::1",{0,1}};
            model::Dep dep; dep.signal="s::0"; dep.bits={0,1}; w.deps.push_back(dep);
            process.writes.push_back(w); c.processes.push_back({process,{}});
        }
        // Synchronous stop inside the Nth actual extraction, AFTER entering with
        // an uncancelled token and preparing the returned facts.
        if(state_->trigger && state_->calls==state_->trigger) state_->stop.request_stop();
        return c;
    }
  private:
    std::shared_ptr<State> state_;
    bool fan_;
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_;
    std::vector<model::DefInfo> defs_;
};
auto query(const db::DesignDb& d,const StepLimit& limit={},Cancel stop={}) {
    return detail::step(d,"s:0:0",false,{},limit,stop);
}
std::string target(const Result<model::QueryResult<model::StepResult>>& r) {
    REQUIRE(r.ok()); REQUIRE(r->result.hops.size()==1);
    const auto& h=r->result.hops[0]; CHECK(h.kind=="binding_down"); CHECK_FALSE(h.fact.empty());
    REQUIRE(h.next.size()==1); CHECK(h.next[0].slice.bits==model::BitRange{0,1});
    CHECK(h.next[0].from==model::BitRange{0,1}); CHECK(h.next[0].role=="data");
    REQUIRE(h.next[0].map.size()==1); CHECK(h.next[0].map[0].from==0);
    CHECK(h.next[0].map[0].to==0); CHECK(h.next[0].map[0].width==1);
    return h.next[0].slice.ref;
}
template<class T> void cancelled(const Result<T>& r) {
    REQUIRE_FALSE(r.ok()); CHECK(r.error().code==ErrorCode::Cancelled);
    CHECK_FALSE(r.error().message.empty());
}
}

TEST_CASE("B R1 adapter: current-body extraction cancellation publishes no unfinished facts", "[b-step-adapter]") {
    auto state=std::make_shared<State>(); state->trigger=1;
    db::DesignDb d(std::make_unique<HandFrontend>(state,true));
    REQUIRE_FALSE(state->stop.stop_requested());
    cancelled(query(d,{},state->stop.get_token()));
    CHECK(state->extracts[0]==1); CHECK(state->extracts[1]==0);
    state->trigger=0;
    std::set<std::string> got,cursors; StepLimit limit;
    do {
        auto r=query(d,limit); REQUIRE(r.ok()); REQUIRE(got.insert(target(r)).second);
        limit.cursor=r->result.next;
        if(!limit.cursor.empty()) {
            CHECK(r->completeness.status=="partial"); REQUIRE(cursors.insert(limit.cursor).second);
        } else CHECK(r->completeness.status=="complete");
    } while(!limit.cursor.empty());
    CHECK(got==std::set<std::string>{"s:0.0:0","s:0.1:0","s:0.2:0"});
    CHECK(state->extracts==std::array<size_t,4>{2,1,1,1});
}

TEST_CASE("B R1 adapter: later-page cancellation retains completed cache and retries original cursor", "[b-step-adapter]") {
    auto state=std::make_shared<State>(); state->trigger=3;
    db::DesignDb d(std::make_unique<HandFrontend>(state,true));
    auto first=query(d); CHECK(target(first)=="s:0.0:0");
    REQUIRE_FALSE(first->result.next.empty()); StepLimit limit; limit.cursor=first->result.next;
    REQUIRE_FALSE(state->stop.stop_requested());
    cancelled(query(d,limit,state->stop.get_token()));
    CHECK(state->extracts==std::array<size_t,4>{1,1,1,0});
    const auto saved=first->result; state->trigger=0;
    auto retry=query(d,limit); CHECK(target(retry)=="s:0.1:0");
    CHECK(state->extracts==std::array<size_t,4>{1,1,2,0});
    auto again=query(d,limit); CHECK(target(again)=="s:0.1:0");
    CHECK(again->result.hops[0].fact==retry->result.hops[0].fact);
    CHECK(state->extracts==std::array<size_t,4>{1,1,2,0});
    limit.cursor=retry->result.next; REQUIRE_FALSE(limit.cursor.empty());
    auto last=query(d,limit); CHECK(target(last)=="s:0.2:0");
    CHECK(last->result.next.empty()); CHECK(last->completeness.status=="complete");
    CHECK(saved.hops[0].next[0].slice.ref=="s:0.0:0");
    CHECK(state->extracts==std::array<size_t,4>{1,1,2,1});
}

TEST_CASE("B R1 adapter: positive-budget LRU charges indexes and preserves borrowed owners", "[b-step-adapter]") {
    constexpr size_t factsBytes=8192, budget=2*factsBytes;
    auto plain=std::make_shared<State>();
    db::DesignDb factsOnly(std::make_unique<HandFrontend>(plain,false),budget);
    (void)factsOnly.connections(0); (void)factsOnly.connections(1); (void)factsOnly.connections(0);
    CHECK(plain->extracts[0]==1); CHECK(plain->extracts[1]==1); // two facts fit exactly

    auto state=std::make_shared<State>();
    db::DesignDb d(std::make_unique<HandFrontend>(state,false),budget);
    auto a=d.indexedConnections(0); REQUIRE(a.ok()); REQUIRE(a->facts); REQUIRE(a->index);
    CHECK(a->facts->estimatedBytes==factsBytes);
    REQUIRE(a->index->estimatedBytes>0); REQUIRE(a->index->estimatedBytes<factsBytes);
    auto borrowed=*a; auto list=borrowed.index->find("s::0",false);
    REQUIRE(list); REQUIRE(list->entries.size()==1);
    const auto range=list->entries[0].target;
    auto b=d.indexedConnections(1); REQUIRE(b.ok()); REQUIRE(b->index);
    CHECK(b->index->estimatedBytes==borrowed.index->estimatedBytes);
    auto again=d.indexedConnections(0); REQUIRE(again.ok());
    CHECK(state->extracts[0]==2); CHECK(state->extracts[1]==1);
    // Two indexed entries do NOT fit: this distinguishes index charging from
    // a facts-only LRU, without peeking into private usedBytes/connections_.
    CHECK(borrowed.facts->processes[0].result.writes[0].target==model::Slice{"s::1",{0,1}});
    CHECK(list->entries[0].target==range); CHECK(borrowed.index->find("s::0",false)==list);
    auto third=d.indexedConnections(2); REQUIRE(third.ok());
    auto bAgain=d.indexedConnections(1); REQUIRE(bAgain.ok()); CHECK(state->extracts[1]==2);
    CHECK(list->entries.size()==1); // actual retained owner outlives eviction
}
