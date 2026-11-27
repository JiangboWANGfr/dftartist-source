#include "InstanceQueries.h"
#include "ConnectionRefs.h"
#include "InstanceDescription.h"
#include "OccurrencePorts.h"
#include <algorithm>

namespace baseline {
using namespace hier;
using detail::describeInstance;
using detail::parseObject;
using namespace model;
Result<db::Located> locateInstance(const db::DesignDb &db, std::string_view ref,
                                    model::InstKey &key, Cancel cancel) {
    auto parsed = parseInstRef(ref);
    if (!parsed)
        return Error{ErrorCode::BadRequest, "not an instance reference: " + std::string(ref)};
    key = *parsed;
    return db.locate(key, cancel);
}

Result<model::InstInfo> instance(const db::DesignDb &db, std::string_view ref, Cancel cancel) try {
    detail::checkpoint(cancel);
    InstKey key;
    auto at = locateInstance(db, ref, key, cancel);
    if (!at)
        return at.error();
    return describeInstance(db, key, *at, cancel);
} catch (const Error &error) {
    return error;
}

Result<std::vector<model::PortInfo>> ports(const db::DesignDb &db, std::string_view ref, Cancel cancel) try {
    detail::checkpoint(cancel);
    InstKey key;
    auto at = locateInstance(db, ref, key, cancel);
    if (!at)
        return at.error();
    if (at->body != kNoBody)
        return detail::occurrencePorts(*detail::checked(db.skeleton(at->body, cancel)),
                                       key, cancel);
    // Project directly from canonical parent bindings, without copying unrelated
    // expressions/signals just to recover this occurrence's pin declarations.
    // Keep bindings()'s Error-as-result boundary: a failed parent query leaves
    // the original unknown declarations; cancellation is checked immediately.
    auto bound = [&]() -> Result<std::shared_ptr<const BodyConnections>> {
        try {
            return db.connections(at->steps.back().parentBody, cancel);
        } catch (const Error &error) {
            return error;
        }
    }();
    detail::checkpoint(cancel);
    return detail::occurrencePorts(*at->steps.back().slot, key,
                                   bound ? std::span<const PinBinding>((*bound)->bindings)
                                         : std::span<const PinBinding>{}, cancel);
} catch (const Error &error) {
    return error;
}

Result<std::vector<model::ParamInfo>> params(const db::DesignDb &db, std::string_view ref, Cancel cancel) try {
    detail::checkpoint(cancel);
    InstKey key;
    auto at = locateInstance(db, ref, key, cancel);
    if (!at)
        return at.error();
    if (at->body == kNoBody)
        return std::vector<ParamInfo>{};
    std::vector<ParamInfo> out = detail::checked(db.skeleton(at->body, cancel))->params;
    if (!at->steps.empty()) {
        auto &overridden = at->steps.back().slot->overriddenParams;
        for (auto &p : out) {
            detail::checkpoint(cancel);
            p.isOverridden =
                std::any_of(overridden.begin(), overridden.end(), [&](const auto &name) {
                    detail::checkpoint(cancel);
                    return name == p.name;
                });
        }
    }
    return out;
} catch (const Error &error) {
    return error;
}

Result<model::ObjectInfo> object(const db::DesignDb &db, std::string_view ref, Cancel cancel) try {
    detail::checkpoint(cancel);
    if (ref.starts_with("i:")) {
        auto i = instance(db, ref, cancel);
        if (!i)
            return i.error();
        return ObjectInfo{i->ref, "instance", i->name, i->ref, i->pathText};
    }
    auto key = detail::parseObject(ref);
    if (!key)
        return Error{ErrorCode::BadRequest, "malformed object reference"};
    auto at = db.locate(key->inst, cancel);
    if (!at)
        return at.error();
    auto inst = describeInstance(db, key->inst, *at, cancel);
    ObjectInfo o{std::string(ref), "", "", inst.ref, inst.pathText};
    if (key->kind == 'p') {
        auto p = ports(db, inst.ref, cancel);
        if (!p)
            return p.error();
        if (key->index >= p->size())
            return Error{ErrorCode::NotFound, "no such port"};
        o.kind = "port";
        o.name = p->at(key->index).name;
    } else {
        if (at->body == kNoBody)
            return Error{ErrorCode::NotFound, "object has no body"};
        auto facts = detail::checked(db.connections(at->body, cancel));
        if (key->kind == 's') {
            if (key->index >= facts->signals.size())
                return Error{ErrorCode::NotFound, "no such signal"};
            o.kind = "signal";
            o.name = facts->signals[key->index].name;
            o.pathText += "." + facts->signals[key->index].localPath;
        }
        if (key->kind == 'x') {
            if (key->index >= facts->processes.size())
                return Error{ErrorCode::NotFound, "no such process"};
            o.kind = "process";
        }
        if (key->kind == 'r') {
            if (key->index >= facts->registers.size())
                return Error{ErrorCode::NotFound, "no such register"};
            o.kind = "register";
        }
    }
    if (!o.name.empty() && o.kind != "signal")
        o.pathText += "." + escapeSegment(o.name, {});
    return o;
} catch (const Error &error) {
    return error;
}
} // namespace baseline

#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
using namespace hier;
namespace {
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer; protocol::write(writer, value); return writer.str();
}
template<class T> void same(const Result<T> &current, const Result<T> &old) {
    REQUIRE(current.ok()==old.ok());
    if(current) CHECK(json(*current)==json(*old));
    else CHECK(json(current.error())==json(old.error()));
}
struct Frontend final : frontend::Frontend {
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_{{"top.with.dot",0},{"second",1}};
    std::vector<model::DefInfo> definitions_{{"root",model::DefKind::Module,"",0},{"leaf",model::DefKind::Module,"",0},
        {"ghost",model::DefKind::Blackbox,"",0},{"primitive",model::DefKind::Primitive,"",0}};
    std::array<model::BodySkeleton,2> bodies;
    std::array<model::BodyConnections,2> facts;
    mutable size_t connectionsCalled=0;
    bool fail=false;
    std::stop_source *stop=nullptr; // Existing synchronous provider boundary.
    explicit Frontend(size_t count=31,size_t overrideCount=31) {
        bodies[0].def=0;bodies[1].def=1;
        bodies[0].scopes.push_back({-1,"g.scope",{2,-1}});
        for(size_t i=0;i<count;++i) {
            model::ParamInfo param;param.name="P"+std::to_string(i);
            if(i%7==0)param.name="";if(i%7==1)param.name="same";
            if(i%7==2)param.name="P";if(i%7==3)param.name="p";
            if(i%7==4)param.name=std::string("n\0ul",4);
            param.value=std::to_string(i);param.typeText="int[31:0]";
            param.isType=i%3==0;param.isLocal=i%4==0;param.isPort=i%5==0;param.isOverridden=i%2==0;
            bodies[0].params.push_back(param);bodies[1].params.push_back(param);
            model::PortInfo port;port.name="pin"+std::to_string(i);if(i%5==0)port.name="";
            if(i%5==1)port.name="same.pin";if(i%5==2)port.name="pin[2]";
            port.ref="p::"+std::to_string(i);port.width=8;port.typeText="logic[7:0]";port.isSigned=i%2==0;
            port.direction=i%2==0?model::Direction::In:model::Direction::Out;
            port.attrs={{"keep","true"},{"owned",std::to_string(i)}};
            port.internal.kind="direct";port.internal.signal="s::0";port.internal.bits={2,8};
            bodies[0].ports.push_back(port);bodies[1].ports.push_back(port);
        }
        for(size_t slot=0;slot<5;++slot) {
            model::ChildSlot item;item.name="u.name"+std::to_string(slot);item.def=slot<2?1:slot==3?3:2;
            item.body=slot<2?1:model::kNoBody;item.kind=slot<2?model::InstKind::Module:slot==3?model::InstKind::Primitive:model::InstKind::Blackbox;
            item.scope=slot==1?0:-1;item.arrayIndex={int32_t(slot),-1};
            if(slot==0)for(size_t j=0;j<overrideCount;++j)item.overriddenParams.push_back(j<count?bodies[1].params[j].name:"absent"+std::to_string(j));
            if(slot==1)item.overriddenParams={"P",std::string("n\0ul",4)};
            if(slot==2||slot==3)for(size_t j=0;j<count;++j)item.blackboxPins.push_back(bodies[1].ports[j].name);
            bodies[0].slots.push_back(item);
        }
        for(size_t b=0;b<2;++b) {
            for(size_t i=0;i<3;++i){model::SignalInfo signal;signal.ref="s::"+std::to_string(i);signal.name="signal"+std::to_string(i);signal.localPath="\\scope.name .signal"+std::to_string(i);facts[b].signals.push_back(signal);}
            model::QueryResult<model::ProcessInfo> process;process.result.ref="x::0";process.result.inst="i:";process.result.kind="always_comb";facts[b].processes.push_back(process);
            model::RegisterInfo reg;reg.ref="r::0";facts[b].registers.push_back(reg);facts[b].estimatedBytes=1024;
        }
        for(size_t slot : {size_t(2),size_t(3)})for(size_t i=0;i<count;++i){model::PinBinding binding;binding.pin="p:"+std::to_string(slot)+":"+std::to_string(i);binding.inst="i:"+std::to_string(slot);binding.width=i+1;binding.direction=i%2?"out":"in";binding.attrs={{"from","parent"}};facts[0].bindings.push_back(binding);}
    }
    const model::FrontendInfo &info() const override{return info_;}
    const std::vector<model::TopInfo> &tops() const override{return tops_;}
    const std::vector<model::DefInfo> &definitions() const override{return definitions_;}
    size_t bodyCount() const override{return bodies.size();}
    model::Diagnostics diagnostics(size_t) const override{return {};}
    model::BodySkeleton skeleton(model::BodyId body) const override{return bodies.at(body);}
    model::BodyConnections connections(model::BodyId body) const override {
        ++connectionsCalled;if(stop)stop->request_stop();if(fail)throw Error{ErrorCode::Internal,"A parent extraction failure"};return facts.at(body);
    }
};
} // namespace

TEST_CASE("instance properties preserve complete old fields order aliases and ownership", "[a-m7]") {
    std::vector<model::PortInfo> retainedPorts;std::vector<model::ParamInfo> retainedParams;model::ObjectInfo retainedObject;
    for(size_t count : {size_t(0),size_t(1),size_t(8),size_t(9),size_t(31),size_t(257)})
        for(size_t overrides : {size_t(0),size_t(1),size_t(8),size_t(9),size_t(300)})
            for(size_t cache : {size_t(0),size_t(1),size_t(128),size_t(64*1024*1024)}) {
                db::DesignDb db(std::make_unique<Frontend>(count,overrides),cache);
                for(const auto &ref : {"i:0","i:1","i:0.0","i:0.1","i:0.2","i:0.3","i:0.4","i:00.0","i:0.999","i:999","bad"}) {
                    same(detail::instance(db,ref,{}),baseline::instance(db,ref,{}));
                    same(detail::params(db,ref,{}),baseline::params(db,ref,{}));
                    same(detail::ports(db,ref,{}),baseline::ports(db,ref,{}));
                    same(detail::object(db,ref,{}),baseline::object(db,ref,{}));
                }
                for(const auto &inst : {"0","00.0","0.0","0.1","0.2","0.3","0.4","1","999","0.999"})
                    for(char kind : std::string("psxr"))for(size_t id : {size_t(0),count/2,count?count-1:0,count,count+1}) {
                        const auto ref=std::string(1,kind)+":"+inst+":"+std::to_string(id);
                        same(detail::object(db,ref,{}),baseline::object(db,ref,{}));
                    }
                const auto params=detail::params(db,"i:1",{});REQUIRE(params);for(size_t i=0;i<count;++i)CHECK(params->at(i).isOverridden==(i%2==0));
                if(count){auto ports=detail::ports(db,"i:0.2",{});REQUIRE(ports);CHECK(ports->at(0).width==1);CHECK(ports->at(0).attrs.at("from")=="parent");retainedPorts=*ports;
                    auto nested=detail::params(db,"i:0.0",{});REQUIRE(nested);retainedParams=*nested;auto object=detail::object(db,"p:0.0:1",{});if(object)retainedObject=*object;}
            }
    REQUIRE_FALSE(retainedPorts.empty());CHECK(retainedPorts.at(0).attrs.at("from")=="parent");REQUIRE_FALSE(retainedParams.empty());CHECK(retainedParams.at(0).value=="0");CHECK(retainedObject.kind=="port");CHECK(retainedObject.name=="same.pin");
}

TEST_CASE("single port names retain bodiless provider failures cancellation and retry", "[a-m7]") {
    auto front=std::make_unique<Frontend>();auto *provider=front.get();db::DesignDb db(std::move(front),0);
    for(bool fail : {false,true}) {
        provider->fail=fail;
        for(const auto &ref : {"p:0.2:0","p:0.2:30","p:0.3:1","p:0.4:0","p:0.2:999"}) {
            const auto before=provider->connectionsCalled;auto old=baseline::object(db,ref,{});CHECK(provider->connectionsCalled==before+1);
            auto current=detail::object(db,ref,{});CHECK(provider->connectionsCalled==before+2);same(current,old);
        }
    }
    provider->fail=false;
    std::stop_source stopped;stopped.request_stop();
    for(const auto &ref : {"p:0.2:0","p:0.2:999","i:0.0","bad"}) {
        same(detail::object(db,ref,stopped.get_token()),baseline::object(db,ref,stopped.get_token()));
        same(detail::params(db,ref,stopped.get_token()),baseline::params(db,ref,stopped.get_token()));
        same(detail::ports(db,ref,stopped.get_token()),baseline::ports(db,ref,stopped.get_token()));
    }
    auto run=[](bool old){auto fe=std::make_unique<Frontend>();std::stop_source stop;fe->stop=&stop;db::DesignDb local(std::move(fe),0);return old?baseline::object(local,"p:0.2:999",stop.get_token()):detail::object(local,"p:0.2:999",stop.get_token());};
    auto old=run(true),current=run(false);REQUIRE_FALSE(old);REQUIRE_FALSE(current);CHECK(json(old.error())==json(current.error()));
    for(const auto &ref : {"p:0.2:0","p:0.3:1"}){REQUIRE(detail::object(db,ref,{}));same(detail::object(db,ref,{}),baseline::object(db,ref,{}));}
}
