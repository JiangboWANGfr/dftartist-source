#include "MemoryMapInternal.h"
#include "../common/Utf8.h"
#include <algorithm>
#include <array>
#include <bit>
#include <map>
#include <set>
namespace dft::memory {
namespace {
constexpr std::array<std::string_view,8> roles={"address","data_in","data_out","clock","chip_enable","write_enable","output_enable","write_mask"};
constexpr std::array<std::string_view,5> senses={"none","high","low","posedge","negedge"};
using Time=std::chrono::steady_clock::time_point;
std::string directionText(hier::model::Direction d){
    using D=hier::model::Direction;
    switch(d){case D::In:return "in";case D::Out:return "out";case D::InOut:return "inout";case D::Ref:return "ref";case D::Unknown:return "unknown";}
    return "unknown";
}
void cancel(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory mapping cancelled"};}
void require(bool b,const char *message){if(!b)throw hier::Error{hier::ErrorCode::BadRequest,message};}
bool validName(const std::string &s){return !s.empty()&&s.size()<=4096&&s.find('\0')==std::string::npos&&dft::detail::validUtf8(s);}
void validateInput(const MacroInterfaces &input,hier::Cancel c) {
    require(input.macros.size()<=10000,"Too many macro inputs");
    std::set<size_t> instances;uint64_t count=0;
    for(const auto &m:input.macros) {
        cancel(c);require(m.instance<input.catalog.instances.size()&&instances.insert(m.instance).second,"Invalid or repeated macro instance");
        const auto &inst=input.catalog.instances[m.instance].info;
        require(!inst.ref.empty()&&validName(inst.defName),"Invalid macro identity");
        require(m.pins.size()<=100000-count,"Too many macro pins");count+=m.pins.size();
        std::set<std::string> refs,names;
        for(const auto &p:m.pins) {
            cancel(c);
            // Positional blackbox pins legitimately have no declared name. Identity
            // is the original port ref and owner, never the displayed name/position.
            const bool named=p.port.name.empty()||(validName(p.port.name)&&names.insert(p.port.name).second);
            require(named&&!p.port.ref.empty()&&refs.insert(p.port.ref).second&&p.object.inst==inst.ref&&p.object.ref==p.port.ref&&p.object.kind=="port","Invalid macro pin ownership");
        }
    }
}
class Mapper {
    const MacroInterfaces &input_;
    MemoryMap out_;
    hier::Cancel cancel_;
    Time deadline_;
    std::map<std::string,size_t> models_;
    void partial(const std::string &s){out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),s)==out_.reasons.end())out_.reasons.push_back(s);}
    bool time(){cancel(cancel_);if(std::chrono::steady_clock::now()>=deadline_){partial("budget_time");return false;}return true;}
    bool spend(){if(!time())return false;if(out_.work>=out_.request.limits.maxWork){partial("budget_work");return false;}++out_.work;return true;}
    static void issue(MappedMemory &m,const char *code,std::string role,std::string pin,std::string expected,std::string actual){m.issues.push_back({code,std::move(role),std::move(pin),std::move(expected),std::move(actual)});}
    bool row(size_t index) {
        const auto &macro=input_.macros[index];const auto &inst=input_.catalog.instances[macro.instance].info;
        MappedMemory row;row.macro=index;auto found=models_.find(inst.defName);
        if(found==models_.end()) {row.status="unmapped";issue(row,"model_missing","","","declared model",inst.defName);}
        else {
            row.model=found->second;const auto &model=out_.request.models[*row.model];
            std::map<std::string,size_t> pins;std::set<size_t> used;
            for(size_t i=0;i<macro.pins.size();++i){if(!spend())return false;if(!macro.pins[i].port.name.empty())pins.emplace(macro.pins[i].port.name,i);}
            for(size_t i=0;i<model.roles.size();++i) {
                if(!spend())return false;
                const auto &binding=model.roles[i];MappedRole role;role.role=i;
                auto at=pins.find(binding.pin);const std::string name(roleName(binding.role));
                if(at==pins.end())issue(row,"pin_missing",name,binding.pin,"declared pin","missing");
                else {
                    role.pin=at->second;used.insert(*role.pin);const auto &pin=macro.pins[*role.pin].port;
                    const auto direction=binding.role==MemoryRole::DataOut?hier::model::Direction::Out:hier::model::Direction::In;
                    uint64_t width=1;
                    if(binding.role==MemoryRole::Address)width=uint64_t(std::bit_width(model.words-1));
                    if(binding.role==MemoryRole::DataIn||binding.role==MemoryRole::DataOut)width=model.dataBits;
                    if(binding.role==MemoryRole::WriteMask)width=model.dataBits/model.maskLaneBits;
                    if(pin.width!=width)issue(row,"pin_width",name,binding.pin,std::to_string(width),std::to_string(pin.width));
                    if(pin.direction!=direction)issue(row,"pin_direction",name,binding.pin,directionText(direction),directionText(pin.direction));
                    role.compatible=pin.width==width&&pin.direction==direction;
                }
                row.roles.push_back(std::move(role));
            }
            for(size_t i=0;i<macro.pins.size();++i){if(!spend())return false;if(!used.contains(i))issue(row,"unmapped_pin","",macro.pins[i].port.name,"declared role","unmapped");}
            row.status=row.issues.empty()?"matched":"mismatch";
        }
        if(!time())return false;
        if(row.status=="matched") {const auto &m=out_.request.models[*row.model];++out_.matchedInstances;out_.matchedCapacityBits+=m.words*m.dataBits;}
        else partial(row.status=="unmapped"?"model_missing":"interface_mismatch");
        out_.memories.push_back(std::move(row));return true;
    }
public:
    Mapper(const MacroInterfaces &input,const MemoryMapRequest &request,std::optional<Time> end,hier::Cancel c):input_(input),cancel_(c),deadline_(end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(request.limits.maxMillis)))) {
        out_.request=request;out_.snapshotId=input.catalog.snapshot.snapshotId;if(!input.complete)partial("interfaces_partial");
        for(size_t i=0;i<request.models.size();++i)models_.emplace(request.models[i].definitionName,i);
    }
    MemoryMap run() {
        for(size_t i=0;i<input_.macros.size();++i) {
            if(!time())break;
            if(out_.memories.size()>=out_.request.limits.maxMacros){partial("budget_macros");break;}
            if(!spend())break;++out_.visitedMacros;
            if(!row(i))break;
        }
        (void)time();return std::move(out_);
    }
};
hier::Result<MemoryMap> execute(const MacroInterfaces &input,const MemoryMapRequest &r,std::optional<Time> end,hier::Cancel c)try {
    cancel(c);detail::validateMemoryMapRequest(r);validateInput(input,c);return Mapper(input,r,end,c).run();
}catch(const hier::Error &e){return e;}
}
std::string_view roleName(MemoryRole r){auto n=static_cast<size_t>(r);return n<roles.size()?roles[n]:std::string_view{};}
std::string_view senseName(PinSense s){auto n=static_cast<size_t>(s);return n<senses.size()?senses[n]:std::string_view{};}
std::optional<MemoryRole> parseMemoryRole(std::string_view name){for(size_t i=0;i<roles.size();++i)if(name==roles[i])return static_cast<MemoryRole>(i);return {};}
std::optional<PinSense> parsePinSense(std::string_view name){for(size_t i=0;i<senses.size();++i)if(name==senses[i])return static_cast<PinSense>(i);return {};}
void detail::validateMemoryMapRequest(const MemoryMapRequest &r) {
    require(!r.models.empty()&&r.models.size()<=256,"Provide 1..256 memory models");std::set<std::string> defs;
    for(const auto &m:r.models) {
        require(validName(m.definitionName)&&defs.insert(m.definitionName).second,"Invalid or duplicate memory definition");
        require(m.words>=2&&m.words<=4294967296ULL&&m.dataBits&&m.dataBits<=65536&&m.maskLaneBits&&m.maskLaneBits<=m.dataBits&&m.dataBits%m.maskLaneBits==0,"Invalid declared memory geometry");
        require(m.roles.size()>=4&&m.roles.size()<=8,"Memory model needs 4..8 roles");std::set<MemoryRole> seen;std::set<std::string> pins;
        for(const auto &b:m.roles) {
            require(!roleName(b.role).empty()&&!senseName(b.sense).empty()&&seen.insert(b.role).second&&validName(b.pin)&&pins.insert(b.pin).second,"Invalid or duplicate memory role/pin");
            bool sense=b.role==MemoryRole::Clock?(b.sense==PinSense::Posedge||b.sense==PinSense::Negedge):
                (b.role==MemoryRole::Address||b.role==MemoryRole::DataIn||b.role==MemoryRole::DataOut)?b.sense==PinSense::None:(b.sense==PinSense::High||b.sense==PinSense::Low);
            require(sense,"Invalid sense for memory role");
        }
        for(auto role:{MemoryRole::Address,MemoryRole::DataIn,MemoryRole::DataOut,MemoryRole::Clock})require(seen.contains(role),"Missing required memory role");
    }
    const auto &l=r.limits;require(l.maxMacros&&l.maxMacros<=10000&&l.maxWork&&l.maxWork<=10000000&&l.maxMillis&&l.maxMillis<=60000,"Invalid mapping limits");
}
hier::Result<MemoryMap> mapMemories(const MacroInterfaces &input,const MemoryMapRequest &r,hier::Cancel c){return execute(input,r,{},c);}
hier::Result<MemoryMap> detail::mapMemoriesWithDeadline(const MacroInterfaces &input,const MemoryMapRequest &r,Time end,hier::Cancel c){return execute(input,r,end,c);}
}
