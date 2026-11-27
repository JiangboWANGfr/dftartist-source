#include "RegisterPartition.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <limits>
#include <numeric>
#include <random>

using namespace hier;
namespace {
using Parts = std::vector<std::pair<model::BitRange,size_t>>;
auto overlap(model::BitRange a,model::BitRange b) {
    const auto lo = std::max(a.lsb,b.lsb), hi = std::min(a.lsb+a.width,b.lsb+b.width);
    return std::pair{lo,hi};
}
// Independent original cut/first-overlap definition, including unsigned wrapping.
Parts linear(std::span<const model::RegisterInfo> facts,std::span<const size_t> positions,model::BitRange write) {
    std::vector<uint64_t> cuts{write.lsb,write.lsb+write.width};
    for (auto r : positions) {
        auto [lo,hi] = overlap(write,facts[r].bits);
        if (lo < hi) { cuts.push_back(lo);cuts.push_back(hi); }
    }
    std::sort(cuts.begin(),cuts.end());cuts.erase(std::unique(cuts.begin(),cuts.end()),cuts.end());
    Parts result;
    for (size_t i = 1; i < cuts.size(); ++i) {
        model::BitRange target{cuts[i-1],cuts[i]-cuts[i-1]};
        auto first = db::noEntry;
        for (auto r : positions) {
            auto [lo,hi] = overlap(target,facts[r].bits);
            if (lo < hi) { first = r;break; }
        }
        result.emplace_back(target,first);
    }
    return result;
}
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer;protocol::write(writer,value);return writer.str();
}
struct Interrupted {};
} // namespace

TEST_CASE("register partitions retain every original boundary and first covering position", "[a-m7]") {
    std::mt19937 random(173);
    constexpr auto max = std::numeric_limits<uint64_t>::max();
    for (const size_t count : std::array<size_t,8>{0,1,8,9,17,63,129,513}) {
        std::vector<model::RegisterInfo> facts(count);
        std::vector<size_t> positions(count);
        std::iota(positions.begin(),positions.end(),0);
        for (auto &r : facts) r.bits = {random()%1024,random()%128};
        if (count > 8) {
            facts[0].bits = {0,900}; // Later boundaries must survive a covering winner.
            facts[1].bits = {max-3,8};facts[2].bits = {max-10,10};
            facts[3].bits = facts[4].bits;
        }
        for (size_t order = 0; order < 3; ++order) {
            if (order) std::shuffle(positions.begin(),positions.end(),random);
            db::detail::RegisterPartition partition(facts,positions);
            for (size_t n = 0; n < 128; ++n) {
                model::BitRange write{random()%1200,random()%1200};
                if (n == 0) write = {0,0};
                if (n == 1) write = {max-4,9};
                if (n == 2) write = {max-30,30};
                if (n == 3) write = {0,max};
                Parts result;
                partition.visit(write,[&](auto range,auto reg) { result.emplace_back(range,reg); },[]{});
                CHECK(result == linear(facts,positions,write));
            }
        }
    }
}

TEST_CASE("register partition failure and cancellation discard only unfinished local work", "[a-m7]") {
    std::vector<model::RegisterInfo> facts(32);
    std::vector<size_t> positions(32);std::iota(positions.begin(),positions.end(),0);
    for (size_t i = 0; i < facts.size(); ++i) facts[i].bits = {2*i,1};
    size_t total = 0;
    { db::detail::RegisterPartition control(facts,positions);
      control.visit({0,64},[](auto,auto){},[&]{++total;}); }
    REQUIRE(total > 8);
    for (const size_t stop : std::array<size_t,6>{0,total/8,total/4,total/2,total*3/4,total-1}) {
        CAPTURE(stop,total);
        db::detail::RegisterPartition partition(facts,positions);
        size_t checks = 0;
        bool stopped = false;
        try { partition.visit({0,64},[](auto,auto){},[&]{ if (checks++ == stop) throw Interrupted{}; }); }
        catch (const Interrupted &) { stopped = true; }
        CHECK(stopped);
        Parts retry;partition.visit({0,64},[&](auto bits,auto r){retry.emplace_back(bits,r);},[]{});
        CHECK(retry == linear(facts,positions,{0,64}));
        CHECK_THROWS_AS(partition.visit({0,64},[](auto,auto){throw Interrupted{};},[]{}),Interrupted);
        Parts again;partition.visit({0,64},[&](auto bits,auto r){again.emplace_back(bits,r);},[]{});
        CHECK(again == retry);
    }
}

TEST_CASE("wide register groups retain known partitions without rescanning every write", "[a-m7]") {
    std::vector<model::RegisterInfo> facts(32768);
    std::vector<size_t> positions(facts.size());std::iota(positions.begin(),positions.end(),0);
    for (size_t i = 0; i < facts.size(); ++i) facts[i].bits = {2*i,1};
    db::detail::RegisterPartition partition(facts,positions);
    for (size_t i = 0; i < facts.size(); ++i) {
        Parts result;partition.visit({2*i,2},[&](auto bits,auto r){result.emplace_back(bits,r);},[]{});
        REQUIRE(result.size() == 2);
        CHECK(result[0] == std::pair{model::BitRange{2*i,1},i});
        CHECK(result[1] == std::pair{model::BitRange{2*i+1,1},db::noEntry});
    }
}

TEST_CASE("public step retains register bit maps across sharing cache pages and cancellation", "[a-m7]") {
    for (bool per : {false,true})
        for (const size_t cache : std::array<size_t,4>{0,1,128,64*1024*1024}) {
            model::OpenOptions options;options.files={HIER_REGISTER_PARTITION_FIXTURE};options.tops={"reg_top"};
            options.connectionCacheBytes=cache;options.forcePerInstanceBodies=per;
            auto opened=Design::open(options);REQUIRE(opened);auto &design=**opened;
            REQUIRE(design.diagnostics().errorCount==0);
            for (const auto instance : {"0.0","0.1"}) {
                const std::string ref="s:"+std::string(instance)+":2";
                ConnectionRequest request;request.bits=model::BitRange{20,1};
                auto step=design.step(ref,true,request,{});REQUIRE(step);
                REQUIRE(step->result.hops.size()==2);
                for (const auto &hop : step->result.hops) {
                    CHECK(hop.kind=="register");CHECK(hop.via=="r:"+std::string(instance)+":10");
                    CHECK(hop.from.ref==ref);CHECK(hop.from.bits==model::BitRange{20,1});
                    REQUIRE(hop.next.size()==1);
                }
                const auto &data = step->result.hops[1].next.front();
                CHECK(data.slice.ref=="s:"+std::string(instance)+":1");
                CHECK(data.slice.bits==model::BitRange{10,1});
                CHECK(data.role=="data");
                CHECK(step->result.hops[0].next.front().role=="clock");
                CHECK(step->result.hops[0].next.front().slice.ref=="s:"+std::string(instance)+":0");
                CHECK(step->result.hops[0].next.front().slice.bits==model::BitRange{0,1});
                std::stop_source stop;stop.request_stop();
                auto cancelled=design.step(ref,true,request,{},stop.get_token());
                REQUIRE_FALSE(cancelled);CHECK(cancelled.error().code==ErrorCode::Cancelled);
                CHECK(json(design.step(ref,true,request,{}).value())==json(*step));
                request.bits=model::BitRange{21,1};
                auto hole=design.step(ref,true,request,{});REQUIRE(hole);CHECK(hole->result.hops.empty());
            }
        }
}
