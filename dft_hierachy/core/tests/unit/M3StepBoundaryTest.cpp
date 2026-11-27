// Independent B boundary oracle: DESIGN 4.4 /5.4 /5.5.1 /5.5.2.
// C's minimal HDL identifies missing coverage; no C probe or A source is used.
#include "hier/Design.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
using namespace hier;
namespace {
class DirectionLibrary final : public model::LibraryProvider {
  public:
    explicit DirectionLibrary(model::Direction dir) : dir_(dir) {}
    std::optional<model::CellInfo> cell(std::string_view name) const override {
        if(name!="absent_b_boundary") return {};
        model::CellInfo c; model::PinInfo p; p.name="P"; p.dir=dir_; p.width=4; c.pins.push_back(p); return c;
    }
  private: model::Direction dir_;
};
auto open(const std::string& top,bool per,size_t cache,
          std::shared_ptr<const model::LibraryProvider> lib={},bool flow=false) {
    model::OpenOptions o;
    o.files={std::string(HIER_FIXTURES)+"/m3/"+(flow?"flow.sv":"step_boundaries.sv")};
    o.tops={top}; o.forcePerInstanceBodies=per; o.connectionCacheBytes=cache; o.library=std::move(lib);
    auto r=Design::open(o); REQUIRE(r.ok()); auto d=std::move(r.value());
    REQUIRE(d->diagnostics().errorCount==0); return d;
}
std::string signal(Design& d,const std::string& i,const std::string& name) {
    auto r=d.signals(i); REQUIRE(r.ok());
    for(const auto& s:r->items) if(s.name==name) return s.ref;
    FAIL("missing boundary signal"); return {};
}
std::string pin(Design& d,const std::string& name) {
    auto c=d.children(d.roots()[0].ref); REQUIRE(c.ok()); REQUIRE_FALSE(c->items.empty());
    auto r=d.ports(c->items[0].ref); REQUIRE(r.ok());
    for(const auto& p:r.value()) if(p.name==name) return p.ref;
    FAIL("missing boundary pin"); return {};
}
template<class T> bool reason(const Result<model::QueryResult<T>>& r,const std::string& code,
                              const std::string& at) {
    REQUIRE(r.ok());
    return r->completeness.status=="partial" &&
        std::any_of(r->completeness.reasons.begin(),r->completeness.reasons.end(),
          [&](const auto& x){return x.code==code && x.at==at;});
}
}
TEST_CASE("B C53: unknown width has priority on both sides and directions", "[b-step-boundary]") {
    for(bool per:{false,true}) for(size_t cache:{size_t{0},size_t{64*1024*1024}}) {
        auto d=open("box_boundary",per,cache,{},true); const auto empty=pin(*d,"EMPTY"), known=pin(*d,"A");
        for(const std::string side:{"inside","outside"}) for(bool upstream:{false,true}) {
            INFO("per=" << per << " side=" << side << " back=" << upstream);
            ConnectionRequest q; q.side=side;
            auto r=d->step(empty,upstream,q);
            CHECK(reason(r,"unknown_pin_width",empty));
            for(const auto& h:r->result.hops) {
                CHECK(h.kind=="unresolved"); CHECK(h.reason=="unknown_pin_width");
                CHECK(h.next.empty()); CHECK(h.map.empty()); CHECK_FALSE(h.at.has_value());
            }
            q.bits=model::BitRange{0,1};
            auto bad=d->step(empty,upstream,q); CHECK_FALSE(bad.ok());
            if(!bad.ok()) CHECK(bad.error().code==ErrorCode::BadRequest);
            q.bits.reset();
            auto k=d->step(known,upstream,q); CHECK(reason(k,"blackbox",known));
        }
    }
}
TEST_CASE("B C54: streaming writable data cannot be complete empty driver or predecessor", "[b-step-boundary]") {
    for(bool per:{false,true}) for(size_t cache:{size_t{0},size_t{64*1024*1024}}) {
        auto d=open("b_boundary_unknown",per,cache);
        const auto data=signal(*d,d->roots()[0].ref,"data"), p=pin(*d,"P");
        for(const model::BitRange range:{model::BitRange{0,4},model::BitRange{1,2}}) {
            ConnectionRequest q; q.bits=range;
            auto r=d->step(data,true,q); CHECK(reason(r,"blackbox",p));
            CHECK(std::any_of(r->result.hops.begin(),r->result.hops.end(),[&](const auto& h){
                return h.kind=="unresolved" && h.via==p && h.reason=="blackbox" && h.next.empty();
            }));
            auto drivers=d->drivers(data,q); CHECK(reason(drivers,"blackbox",p));
            CHECK_FALSE(drivers->result.empty());
            // Forward side has an input-expression read regardless of unknown pin direction.
            auto forward=d->step(data,false,q); REQUIRE(forward.ok()); CHECK_FALSE(forward->result.hops.empty());
            auto loads=d->loads(data,q); REQUIRE(loads.ok()); CHECK_FALSE(loads->result.empty());
        }
    }
}
TEST_CASE("B C54: declared and library directions distinguish streaming input and output", "[b-step-boundary]") {
    for(bool per:{false,true}) for(size_t cache:{size_t{0},size_t{64*1024*1024}})
      for(bool library:{false,true}) for(bool output:{false,true}) {
        auto lib=library?std::make_shared<DirectionLibrary>(output?model::Direction::Out:model::Direction::In):nullptr;
        auto d=open(library?"b_boundary_unknown":(output?"b_boundary_out":"b_boundary_in"),per,cache,lib);
        const auto data=signal(*d,d->roots()[0].ref,"data");
        auto bindings=d->bindings(d->roots()[0].ref); REQUIRE(bindings.ok());
        REQUIRE(bindings->bindings.size()==1); CHECK(bindings->bindings[0].width==4);
        CHECK(bindings->bindings[0].direction==(output?"out":"in"));
        for(const model::BitRange range:{model::BitRange{0,4},model::BitRange{1,2}}) {
            ConnectionRequest q; q.bits=range;
            auto drivers=d->drivers(data,q); REQUIRE(drivers.ok());
            auto back=d->step(data,true,q); REQUIRE(back.ok());
            if(output) {
                // V1 streaming left-value may remain unsupported, but not empty COMPLETE.
                CHECK_FALSE((drivers->result.empty() && drivers->completeness.status=="complete"));
                CHECK_FALSE((back->result.hops.empty() && back->completeness.status=="complete"));
            } else {
                CHECK(drivers->completeness.status=="complete"); CHECK(drivers->result.empty());
                CHECK(back->completeness.status=="complete"); CHECK(back->result.hops.empty());
                auto forward=d->step(data,false,q); REQUIRE(forward.ok()); CHECK_FALSE(forward->result.hops.empty());
                auto loads=d->loads(data,q); REQUIRE(loads.ok()); CHECK_FALSE(loads->result.empty());
            }
        }
    }
}
