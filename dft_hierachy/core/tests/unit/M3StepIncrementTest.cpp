// Agent B R1 oracle: DESIGN 5.5.1/5.5.2 + independently declared fixtures.
#include "hier/Design.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <set>
#include <sstream>
#include <stop_token>
#include <tuple>

using namespace hier;
namespace {
std::unique_ptr<Design> open(const std::string& top, bool per = false,
                             size_t cache = 64 * 1024 * 1024, bool flow = false) {
    model::OpenOptions o;
    o.files = {std::string(HIER_FIXTURES) + "/m3/" + (flow ? "flow.sv" : "step_edges.sv")};
    o.tops = {top}; o.forcePerInstanceBodies = per; o.connectionCacheBytes = cache;
    auto r = Design::open(o); REQUIRE(r.ok());
    auto d = std::move(r.value()); REQUIRE(d->diagnostics().errorCount == 0);
    return d;
}
std::string root(Design& d) { REQUIRE(d.roots().size() == 1); return d.roots()[0].ref; }
std::string sig(Design& d, const std::string& i, const std::string& name) {
    auto r = d.signals(i); REQUIRE(r.ok());
    for (const auto& s : r->items) if (s.name == name) return s.ref;
    FAIL("fixture signal missing"); return {};
}
std::string port(Design& d, const std::string& i, const std::string& name) {
    auto r = d.ports(i); REQUIRE(r.ok());
    for (const auto& s : r.value()) if (s.name == name) return s.ref;
    FAIL("fixture port missing"); return {};
}
ConnectionRequest bits(uint64_t lsb, uint64_t width, std::string side = {}) {
    ConnectionRequest r; r.bits = model::BitRange{lsb, width}; r.side = std::move(side); return r;
}
template<class T> void error(const Result<T>& r, ErrorCode code) {
    REQUIRE_FALSE(r.ok()); CHECK(r.error().code == code); CHECK_FALSE(r.error().message.empty());
}
const model::StepResult& full(const Result<model::QueryResult<model::StepResult>>& r) {
    REQUIRE(r.ok()); CHECK(r->completeness.status == "complete");
    CHECK(r->completeness.reasons.empty()); CHECK(r->result.next.empty());
    return r->result;
}
std::string key(const model::Hop& h) {
    std::ostringstream s;
    s << h.kind << '|' << h.fact << '|' << h.via << '|' << h.reason << '|'
      << h.from.ref << ':' << h.from.bits.lsb << ':' << h.from.bits.width;
    auto maps = [&](const auto& m) { for (const auto& x : m) s << '(' << x.from << ',' << x.to << ',' << x.width << ')'; };
    maps(h.map);
    for (const auto& c : h.next) {
        s << '/' << c.from.lsb << ':' << c.from.width << ':' << c.slice.ref << ':'
          << c.slice.bits.lsb << ':' << c.slice.bits.width << ':' << c.side.value_or("")
          << ':' << c.role << ':' << c.precision << ':' << c.align; maps(c.map);
    }
    if (h.at) s << '@' << h.at->slice.ref << ':' << h.at->slice.bits.lsb << ':'
                << h.at->slice.bits.width << ':' << h.at->side.value_or("");
    if (h.value) s << '=' << *h.value;
    return s.str();
}
void relation(const model::Hop& h) {
    CHECK_FALSE(h.fact.empty()); CHECK(h.next.size() <= 1);
    std::vector<std::tuple<uint64_t,uint64_t,uint64_t>> maps, compatibility;
    for (const auto& m : h.map) compatibility.emplace_back(m.from,m.to,m.width);
    for (const auto& c : h.next) {
        CHECK(c.from.width > 0); CHECK(c.slice.bits.width > 0);
        CHECK(c.from.lsb >= h.from.bits.lsb);
        CHECK(c.from.lsb + c.from.width <= h.from.bits.lsb + h.from.bits.width);
        if (c.precision == "conservative") CHECK(c.align == "all");
        if (c.align == "all") CHECK(c.map.empty());
        else {
            REQUIRE(c.align == "bitwise");
            uint64_t width = 0;
            for (const auto& m : c.map) {
                CHECK(m.width > 0); width += m.width;
                CHECK(m.from >= c.from.lsb); CHECK(m.from + m.width <= c.from.lsb + c.from.width);
                CHECK(m.to >= c.slice.bits.lsb); CHECK(m.to + m.width <= c.slice.bits.lsb + c.slice.bits.width);
                maps.emplace_back(m.from,m.to,m.width);
            }
            CHECK(width == c.from.width); CHECK(width == c.slice.bits.width);
        }
    }
    if (!h.next.empty()) CHECK(compatibility == maps);
}
}

TEST_CASE("B R1 step: all fanout pages preserve logical budget cold hot and cache0", "[b-step]") {
    for (bool distinct : {false,true}) for (bool per : {false,true})
      for (size_t cache : {size_t{0},size_t{64 * 1024 * 1024}}) {
        INFO("distinct=" << distinct << " per=" << per << " cache=" << cache);
        auto d = open(distinct ? "fanout" : "b_step_shared", per, cache, distinct);
        const auto owner = root(*d), a = sig(*d, owner, "a");
        auto children = d->children(owner); REQUIRE(children.ok());
        REQUIRE(children->items.size() == (distinct ? 12 : 4));
        std::vector<std::vector<std::string>> cold;
        for (bool warm : {false,true}) {
            StepLimit lim; lim.maxHops = 1000;
            std::vector<std::vector<std::string>> pages;
            std::set<std::string> refs, cursors, facts;
            do {
                auto r = d->step(a, false, bits(0, distinct ? 1 : 4), lim); REQUIRE(r.ok());
                REQUIRE_FALSE(r->result.hops.empty());
                REQUIRE(r->result.hops.size() <= static_cast<size_t>(lim.maxHops));
                std::vector<std::string> page; size_t count = 0;
                for (const auto& h : r->result.hops) {
                    relation(h); page.push_back(key(h)); REQUIRE(facts.insert(h.fact).second);
                    CHECK(h.kind == "binding_down");
                    for (const auto& c : h.next) {
                        ++count; REQUIRE(refs.insert(c.slice.ref).second);
                        CHECK(c.from == model::BitRange{0,distinct ? 1U : 4U});
                        CHECK(c.slice.bits == c.from); CHECK(c.role == "data");
                        CHECK(c.precision == "exact"); CHECK(c.align == "bitwise");
                    }
                }
                CHECK(count <= 1); // current + ONE logical child, even physically shared
                pages.push_back(page); lim.cursor = r->result.next;
                if (!lim.cursor.empty()) {
                    CHECK(r->completeness.status == "partial");
                    CHECK(std::any_of(r->completeness.reasons.begin(),r->completeness.reasons.end(),
                                      [](const auto& x){return x.code == "budget_nodes";}));
                    REQUIRE(cursors.insert(lim.cursor).second);
                } else CHECK(r->completeness.status == "complete");
                REQUIRE(pages.size() <= 20);
            } while (!lim.cursor.empty());
            std::set<std::string> expected;
            for (const auto& c : children->items) expected.insert(sig(*d,c.ref,"d"));
            CHECK(refs == expected); CHECK(pages.size() == expected.size());
            if (!warm) cold = pages; else CHECK(pages == cold);
        }
    }
}

TEST_CASE("B R1 step: query bound cursors page size retry and pre-cancellation", "[b-step]") {
    auto d = open("flow",false,0,true);
    const auto owner=root(*d), gate=sig(*d,owner,"gate"), choice=sig(*d,owner,"choice");
    StepLimit l; l.maxHops=1;
    auto first=d->step(gate,true,bits(0,4),l); REQUIRE(first.ok());
    REQUIRE(first->result.hops.size()==1); REQUIRE_FALSE(first->result.next.empty());
    l.cursor=first->result.next;
    error(d->step(choice,true,bits(0,4),l),ErrorCode::BadRequest);
    error(d->step(gate,false,bits(0,4),l),ErrorCode::BadRequest);
    error(d->step(gate,true,bits(1,1),l),ErrorCode::BadRequest);
    auto other=open("flow",false,0,true);
    error(other->step(sig(*other,root(*other),"gate"),true,bits(0,4),l),ErrorCode::StaleCursor);
    std::stop_source stop; stop.request_stop();
    error(d->step(gate,true,bits(0,4),l,stop.get_token()),ErrorCode::Cancelled);
    l.maxHops=17;
    auto second=d->step(gate,true,bits(0,4),l); const auto saved=full(second);
    REQUIRE(saved.hops.size()==1);
    CHECK(first->result.hops[0].fact != saved.hops[0].fact);
    auto retry=d->step(gate,true,bits(0,4),l);
    CHECK(key(full(retry).hops[0]) == key(saved.hops[0]));
    auto one=d->step(gate,true,bits(0,4)); REQUIRE(full(one).hops.size()==2);
    CHECK(key(one->result.hops[0]) == key(first->result.hops[0]));
    CHECK(key(one->result.hops[1]) == key(saved.hops[0]));
    StepLimit bad; bad.cursor="not-a-cursor";
    error(d->step(gate,true,bits(0,4),bad),ErrorCode::BadRequest);
    bad.cursor.clear(); bad.maxHops=0; error(d->step(gate,true,{},bad),ErrorCode::BadRequest);
    bad.maxHops=-1; error(d->step(gate,true,{},bad),ErrorCode::BadRequest);
    error(d->step(gate,true,bits(4,1)),ErrorCode::BadRequest);
    error(d->step(gate,true,bits(0,0)),ErrorCode::BadRequest);
    error(d->step(gate,true,bits(0,1,"inside")),ErrorCode::BadRequest);
    auto savedKeys=std::vector<std::string>{key(saved.hops[0])};
    d.reset(); CHECK(key(saved.hops[0]) == savedKeys[0]); // owning returned value
}

TEST_CASE("B R1 step: reverse repeated bindings keep side and absolute maps", "[b-step]") {
    for(bool per:{false,true}) for(size_t cache:{size_t{0},size_t{64*1024*1024}}) {
        auto d=open("b_step_map",per,cache); const auto owner=root(*d), a=sig(*d,owner,"a");
        auto ch=d->children(owner); REQUIRE(ch.ok()); REQUIRE(ch->items.size()==1);
        const auto child=ch->items[0].ref, pin=port(*d,child,"d");
        error(d->step(pin,true),ErrorCode::BadRequest);
        auto r=d->step(pin,true,bits(1,3,"outside")); const auto& out=full(r);
        std::set<std::tuple<uint64_t,uint64_t,uint64_t>> maps;
        // DESIGN permits adjacent continuous mappings to coalesce; semantic pairs
        // must still be 1->0, 2->1, 3->0 irrespective of interval partition.
        REQUIRE(out.hops.size()>=2);
        REQUIRE(out.hops.size()<=3);
        for(const auto& h:out.hops) {
            relation(h); CHECK(h.kind=="binding_up"); REQUIRE(h.next.size()==1);
            const auto& c=h.next[0]; CHECK(c.slice.ref==a); CHECK_FALSE(c.side.has_value());
            for(const auto& m:c.map)
                for(uint64_t bit=0;bit<m.width;++bit) maps.emplace(m.from+bit,m.to+bit,1);
        }
        CHECK(maps==std::set<std::tuple<uint64_t,uint64_t,uint64_t>>{{1,0,1},{2,1,1},{3,0,1}});
        auto inward=d->step(pin,false,bits(0,4,"outside"));
        const auto& in=full(inward);
        REQUIRE_FALSE(in.hops.empty());
        // Explicit outside stays in the parent; it must NOT silently flip to
        // inside just because the direction is forward (DESIGN 5.5.2 rule 1).
        for(const auto& h:in.hops) {
            relation(h);
            for(const auto& c:h.next) {
                CHECK(c.slice.ref==a);
                auto object=d->object(c.slice.ref); REQUIRE(object.ok()); CHECK(object->inst==owner);
            }
        }
        auto inside=d->step(pin,false,bits(0,4,"inside"));
        const auto& local=full(inside); size_t continuations=0;
        for(const auto& h:local.hops) {
            relation(h);
            for(const auto& c:h.next) {
                ++continuations;
                auto object=d->object(c.slice.ref); REQUIRE(object.ok()); CHECK(object->inst==child);
                auto next=d->step(c.slice.ref,false,bits(c.slice.bits.lsb,c.slice.bits.width,c.side.value_or("")));
                REQUIRE(next.ok()); CHECK(next->completeness.status=="complete");
            }
        }
        CHECK(continuations>0);
        const auto top=port(*d,owner,"a");
        error(d->step(top,true,bits(0,1,"outside")),ErrorCode::BadRequest);
    }
}

TEST_CASE("B R1 step: constant slices are four-state terminals not processes", "[b-step]") {
    auto d=open("b_step_const"); auto ch=d->children(root(*d)); REQUIRE(ch.ok());
    const auto pin=port(*d,ch->items[0].ref,"d");
    std::set<std::string> facts;
    const std::vector<std::string> values={"1'bz","1'bx","1'b0","1'b1"};
    for(uint64_t bit=0;bit<4;++bit) {
        auto r=d->step(pin,true,bits(bit,1,"outside")); const auto& x=full(r);
        REQUIRE(x.hops.size()==1); const auto& h=x.hops[0];
        CHECK(h.kind=="const"); CHECK(h.value==values[static_cast<size_t>(bit)]);
        CHECK(h.from.bits==model::BitRange{bit,1}); CHECK(h.map.empty()); CHECK(h.next.empty());
        CHECK_FALSE(h.at.has_value()); CHECK_FALSE(h.fact.empty()); facts.insert(h.fact);
    }
    CHECK(facts.size()==1); // clip does not enter the identity of the same binding segment
}

TEST_CASE("B R1 step: multi-driver facts retain direction and clipping identities", "[b-step]") {
    auto d=open("b_step_multi"); const auto i=root(*d), y=sig(*d,i,"y");
    auto all=d->step(y,true,bits(0,4)); REQUIRE(full(all).hops.size()==2);
    std::set<std::string> facts;
    for(const auto& h:all->result.hops) {
        relation(h); REQUIRE(h.next.size()==1); REQUIRE(facts.insert(h.fact).second);
        CHECK(h.kind=="process"); const auto& c=h.next[0]; CHECK(c.role=="data");
        auto back=d->step(y,true,bits(2,1)); const auto& b=full(back);
        CHECK(std::count_if(b.hops.begin(),b.hops.end(),[&](const auto& z){return z.fact==h.fact;})==1);
        auto forward=d->step(c.slice.ref,false,bits(2,1)); REQUIRE(full(forward).hops.size()==1);
        const auto& f=forward->result.hops[0]; CHECK(f.fact==h.fact); relation(f);
        REQUIRE(f.next.size()==1); CHECK(f.next[0].slice==model::Slice{y,{2,1}});
        REQUIRE(f.next[0].map.size()==1);
        CHECK(f.next[0].map[0].from==2); CHECK(f.next[0].map[0].to==2);
    }
}

TEST_CASE("B R1 step: register coverage splits process and register with event roles", "[b-step]") {
    for(bool per:{false,true}) for(size_t cache:{size_t{0},size_t{64*1024*1024}}) {
        auto d=open("b_step_reg",per,cache); const auto i=root(*d), q=sig(*d,i,"q"), data=sig(*d,i,"d");
        auto r=d->step(q,true,bits(0,4)); const auto& x=full(r);
        REQUIRE(x.hops.size()==3);
        size_t registerData=0,clock=0,process=0;
        for(const auto& h:x.hops) {
            relation(h); REQUIRE(h.next.size()==1); const auto& c=h.next[0];
            if(c.role=="clock") {
                ++clock; CHECK(h.kind=="register"); CHECK(c.align=="all"); CHECK(c.map.empty());
                CHECK(c.from==model::BitRange{0,2}); CHECK(c.slice.ref==sig(*d,i,"clk"));
            } else {
                CHECK(c.role=="data"); CHECK(c.slice.ref==data);
                if(h.kind=="register") {++registerData; CHECK(c.from==model::BitRange{0,2});}
                else {++process; CHECK(h.kind=="process"); CHECK(c.from==model::BitRange{2,2});}
                auto f=d->step(data,false,bits(c.slice.bits.lsb,c.slice.bits.width));
                const auto& z=full(f);
                REQUIRE(z.hops.size()==1); CHECK(z.hops[0].fact==h.fact); CHECK(z.hops[0].kind==h.kind);
            }
        }
        CHECK(registerData==1); CHECK(clock==1); CHECK(process==1);
    }
}
