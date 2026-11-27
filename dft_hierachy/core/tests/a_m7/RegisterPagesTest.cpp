#include "Registers.h"
#include "OffsetPage.h"
#include "ConnectionRefs.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <functional>
#include <limits>

using namespace hier;
namespace {
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer;protocol::write(writer,value);return writer.str();
}
struct Frontend final : frontend::Frontend {
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_{{"top",0}};
    std::vector<model::DefInfo> defs_{{"top",model::DefKind::Module,"",0}};
    std::array<model::BodySkeleton,4> skeletons;
    std::array<model::BodyConnections,4> facts;
    mutable std::array<size_t,4> calls{};
    bool fail = false;
    std::stop_source *stop = nullptr; // Existing Frontend boundary, test-owned control.
    Frontend() {
        for (const auto body : std::array<model::BodyId,5>{1,model::kNoBody,1,2,3}) {
            model::ChildSlot slot;slot.body=body;slot.kind=body==model::kNoBody ? model::InstKind::Blackbox : model::InstKind::Module;
            skeletons[0].slots.push_back(slot);
        }
        for (size_t body=0;body<facts.size();++body) {
            facts[body].estimatedBytes=128;
            const size_t count=body==0 ? 2 : body==1 ? 3 : body==2 ? 2 : 0;
            for (size_t i=0;i<count;++i) {
                model::RegisterInfo reg;
                reg.ref="r::"+std::to_string(i);reg.inst="i:";
                reg.signal="s::"+std::to_string(i);reg.process="x::"+std::to_string(i);
                reg.bits={2*i,2};reg.clock={"s::99",{0,1},"posedge",""};
                reg.async.push_back({"s::98",{0,1},"negedge","reset"});
                facts[body].registers.push_back(std::move(reg));
            }
        }
        facts[1].completeness={"partial",{{"hier_ref","x::0","same"},{"hier_ref","x::0","same"}}};
        facts[2].completeness={"partial",{{"unsupported","s::1","later"}}};
        facts[3].completeness.status="partial";
    }
    const model::FrontendInfo &info() const override {return info_;}
    const std::vector<model::TopInfo> &tops() const override {return tops_;}
    const std::vector<model::DefInfo> &definitions() const override {return defs_;}
    size_t bodyCount() const override {return facts.size();}
    model::Diagnostics diagnostics(size_t) const override {return {};}
    model::BodySkeleton skeleton(model::BodyId b) const override {return skeletons.at(b);}
    model::BodyConnections connections(model::BodyId b) const override {
        ++calls.at(b);
        if (b==3 && fail) throw Error{ErrorCode::Internal,"late fact failure"};
        if (b==3 && stop) stop->request_stop();
        return facts.at(b);
    }
};
// Original full materialization as an independent paging reference. Qualification
// is the unchanged shared boundary; this never uses the new page window.
auto full(const Frontend &front,bool recursive,model::InstKey key={0},model::BodyId body=0) {
    std::vector<model::RegisterInfo> all;model::Completeness summary;
    std::function<void(const model::InstKey &,model::BodyId)> walk=[&](const auto &k,auto b) {
        if(b==model::kNoBody)return;
        for(auto reg:front.facts[b].registers){detail::qualify(reg,k);all.push_back(std::move(reg));}
        const auto &completeness=front.facts[b].completeness;
        if(completeness.status!="complete") {
            summary.status="partial";
            for(auto reason:completeness.reasons){reason.at=detail::qualify(reason.at,k);summary.reasons.push_back(reason);}
        }
        if(recursive)for(size_t i=0;i<front.skeletons[b].slots.size();++i) {
            auto child=k;child.push_back(uint32_t(i));walk(child,front.skeletons[b].slots[i].body);
        }
    };
    walk(key,body);return std::pair{all,summary};
}
} // namespace

TEST_CASE("offset pages retain literal cursors limits and total validation", "[a-m7]") {
    for(const auto &binding:{std::string("registers|i:0|recursive"),std::string("raw@@|\0binding",14)})
        for(const size_t total:std::array<size_t,5>{0,1,8,9,65})
            for(const int limit:{1,2,8,200,std::numeric_limits<int>::max()})
                for(size_t offset=0;offset<=total+1;++offset) {
                    PageRequest page{binding+"@"+std::to_string(offset),limit};
                    auto window=detail::OffsetPage::read(page,binding);REQUIRE(window);
                    std::vector<size_t> materialized;
                    auto result=window->materialize<size_t>(total,binding,[&](size_t i){materialized.push_back(i);return i;});
                    if(offset>total){REQUIRE_FALSE(result);CHECK(result.error().message=="malformed cursor");continue;}
                    REQUIRE(result);
                    const auto end=std::min(total,offset+size_t(limit));
                    CHECK(result->items==materialized);CHECK(result->items.size()==end-offset);
                    CHECK(result->next==(end<total ? binding+"@"+std::to_string(end) : ""));
                    for(size_t i=0;i<total;++i)CHECK(window->contains(i)==(offset<=i && i<end));
                }
    CHECK_FALSE(detail::OffsetPage::read({"",0},"x"));
    for(const auto cursor:{"other@0","x@","x@-1","x@+1","x@1junk","x@18446744073709551616"})
        CHECK_FALSE(detail::OffsetPage::read({cursor,1},"x"));
}

TEST_CASE("register pages preserve DFS rows full subtree reasons and owning values", "[a-m7]") {
    for(const size_t budget:std::array<size_t,4>{0,1,128,1024}) {
        auto front=std::make_unique<Frontend>();auto &source=*front;
        const auto [all,summary]=full(source,true);REQUIRE(all.size()==10);REQUIRE(summary.reasons.size()==5);
        db::DesignDb db(std::move(front),budget);
        for(const auto ref:{"i:0","i:000"}) {
            std::vector<model::RegisterInfo> joined;std::string cursor;size_t offset=0;
            do {
                const int limit=std::array{1,3,2}[offset%3];
                auto page=detail::registers(db,ref,{cursor,limit},true,{});REQUIRE(page);
                CHECK(json(page->completeness)==json(summary));
                const auto stop=std::min(all.size(),offset+size_t(limit));
                CHECK(json(page->result.items)==json(std::vector<model::RegisterInfo>(all.begin()+std::ptrdiff_t(offset),all.begin()+std::ptrdiff_t(stop))));
                joined.insert(joined.end(),page->result.items.begin(),page->result.items.end());offset=stop;
                cursor=page->result.next;
                CHECK(cursor==(offset<all.size() ? "registers|"+std::string(ref)+"|recursive@"+std::to_string(offset) : ""));
            } while(!cursor.empty());
            CHECK(json(joined)==json(all));
            auto end=detail::registers(db,ref,{"registers|"+std::string(ref)+"|recursive@10",7},true,{});
            REQUIRE(end);CHECK(end->result.items.empty());CHECK(json(end->completeness)==json(summary));
        }
        auto local=detail::registers(db,"i:0",{},false,{});REQUIRE(local);CHECK(local->result.items.size()==2);CHECK(local->completeness.status=="complete");
        auto absent=detail::registers(db,"i:0.1",{},true,{});REQUIRE(absent);CHECK(absent->result.items.empty());
        CHECK(source.facts[1].registers[0].ref=="r::0");
    }
    model::QueryResult<Page<model::RegisterInfo>> retained;
    {db::DesignDb db(std::make_unique<Frontend>(),0);auto result=detail::registers(db,"i:0",{"",1},true,{});REQUIRE(result);retained=*result;}
    CHECK(retained.result.items.front().ref=="r:0:0");CHECK(retained.result.items.front().async.front().signal=="s:0:98");
}

TEST_CASE("off-page failure and cancellation retain their original error precedence", "[a-m7]") {
    auto front=std::make_unique<Frontend>();auto &source=*front;db::DesignDb db(std::move(front),0);
    for(const PageRequest &page:std::array<PageRequest,3>{{{"",1},{"",0},{"bad",1}}}) {
        source.fail=true;auto failed=detail::registers(db,"i:0",page,true,{});
        REQUIRE_FALSE(failed);CHECK(failed.error().message=="late fact failure");
        source.fail=false;std::stop_source stop;source.stop=&stop;
        auto cancelled=detail::registers(db,"i:0",page,true,stop.get_token());
        REQUIRE_FALSE(cancelled);CHECK(cancelled.error().code==ErrorCode::Cancelled);source.stop=nullptr;
        auto retry=detail::registers(db,"i:0",{"",1},true,{});REQUIRE(retry);CHECK(retry->completeness.reasons.size()==5);
    }
    for(const PageRequest &page:std::array<PageRequest,4>{{{"",0},{"bad",1},{"registers|i:0|recursive@11",1},{"registers|i:0@0",1}}})
        CHECK_FALSE(detail::registers(db,"i:0",page,true,{}));
    auto missing=detail::registers(db,"i:99",{"",0},true,{});REQUIRE_FALSE(missing);CHECK(missing.error().code==ErrorCode::NotFound);
    std::stop_source stop;stop.request_stop();auto cancelled=detail::registers(db,"bad",{"",0},true,stop.get_token());
    REQUIRE_FALSE(cancelled);CHECK(cancelled.error().code==ErrorCode::Cancelled);
}

TEST_CASE("public register pages keep RTL occurrence identity across sharing and caches", "[a-m7]") {
    for(bool per:{false,true})for(const size_t cache:std::array<size_t,4>{0,1,128,64*1024*1024}) {
        model::OpenOptions options;options.files={HIER_REGISTER_PAGES_FIXTURE};options.tops={"reg_top"};
        options.forcePerInstanceBodies=per;options.connectionCacheBytes=cache;
        auto opened=Design::open(options);REQUIRE(opened);auto &design=**opened;REQUIRE(design.diagnostics().errorCount==0);
        std::string cursor;size_t total=0;
        do {
            auto result=design.registers("i:0",{cursor,total%2 ? 7:1},true);REQUIRE(result);
            CHECK(result->completeness.status=="complete");
            for(const auto &reg:result->result.items) {
                const auto key="0."+std::to_string(total/32);const auto index=total%32;
                CHECK(reg.ref=="r:"+key+":"+std::to_string(index));CHECK(reg.inst=="i:"+key);
                CHECK(reg.signal=="s:"+key+":2");CHECK(reg.bits==model::BitRange{2*index,1});
                CHECK(reg.process=="x:"+key+":0");CHECK(reg.clock.signal=="s:"+key+":0");CHECK(reg.async.empty());++total;
            }
            cursor=result->result.next;
        }while(!cursor.empty());
        CHECK(total==64);
        std::stop_source stop;stop.request_stop();auto cancelled=design.registers("i:0",{},true,stop.get_token());
        REQUIRE_FALSE(cancelled);CHECK(cancelled.error().code==ErrorCode::Cancelled);
    }
}
