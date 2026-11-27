#include "MemoryLibraryInput.h"
#include "MemoryMapInternal.h"
#include "MemoryTestPlanInternal.h"
#include "MemoryInputInternal.h"
namespace dft::memory {
namespace {
using namespace detail::input;
void checkpoint(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory library loading cancelled"};}
class Reader {
    hier::Cancel cancel_;
    std::map<std::string,std::string> attrs(const Object &o,const std::string &where) {
        std::map<std::string,std::string> out;
        if(!o.contains("attrs"))return out;
        const auto &input=object(o.at("attrs"),where+".attrs");if(input.size()>32)bad(where,"too many attributes");
        for(const auto &[key,value]:input){checkpoint(cancel_);out.emplace(key,text(value,where+".attrs."+key));}return out;
    }
    MemoryModel model(const Value &v,const std::string &where) {
        checkpoint(cancel_);const auto &o=object(v,where);fields(o,where,{"definitionName","words","dataBits","roles"},{"maskLaneBits"});
        MemoryModel m;m.definitionName=text(o.at("definitionName"),where+".definitionName");m.words=number(o.at("words"),where+".words",2,4294967296ULL);m.dataBits=number(o.at("dataBits"),where+".dataBits",1,65536);
        if(o.contains("maskLaneBits"))m.maskLaneBits=number(o.at("maskLaneBits"),where+".maskLaneBits",1,65536);
        const auto &roles=array(o.at("roles"),where+".roles",4,8);
        for(size_t i=0;i<roles.size();++i){checkpoint(cancel_);auto w=at(where+".roles",i);const auto &b=object(roles[i],w);fields(b,w,{"role","pin","sense"});
            const auto role=parseMemoryRole(text(b.at("role"),w+".role"));const auto sense=parsePinSense(text(b.at("sense"),w+".sense"));if(!role||!sense)bad(w,"unknown role or sense");m.roles.push_back({*role,text(b.at("pin"),w+".pin"),*sense});}
        return m;
    }
    LibraryDeclaration library(const Value &v) {
        const auto &o=object(v,"library");fields(o,"library",{"source","cells"});LibraryDeclaration result;result.source=text(o.at("source"),"library.source");
        const auto &cells=array(o.at("cells"),"library.cells",1,256);size_t count=0;
        for(size_t i=0;i<cells.size();++i){checkpoint(cancel_);auto w=at("library.cells",i);const auto &c=object(cells[i],w);fields(c,w,{"definitionName","cell"});const auto name=text(c.at("definitionName"),w+".definitionName");
            if(result.cells.contains(name))bad(w,"duplicate definitionName");const auto &info=object(c.at("cell"),w+".cell");fields(info,w+".cell",{"pins"},{"attrs"});hier::model::CellInfo cell;cell.attrs=attrs(info,w+".cell");
            const auto &pins=array(info.at("pins"),w+".cell.pins",1,256);count+=pins.size();if(count>16384)bad("library","too many pins");
            for(size_t j=0;j<pins.size();++j){checkpoint(cancel_);auto pw=at(w+".cell.pins",j);const auto &p=object(pins[j],pw);fields(p,pw,{"name","direction","width"},{"attrs"});auto direction=parseLibraryDirection(text(p.at("direction"),pw+".direction"));if(!direction)bad(pw,"unknown direction");cell.pins.push_back({text(p.at("name"),pw+".name"),*direction,uint32_t(number(p.at("width"),pw+".width",1,65536)),attrs(p,pw)});}
            result.cells.emplace(name,std::move(cell));
        }
        return result;
    }
public:
    explicit Reader(hier::Cancel c):cancel_(c){}
    MemoryLibraryInput read(const Object &o) {
        fields(o,"memory library",{"formatVersion","kind","models"},{"library","testProfiles"});
        (void)number(o.at("formatVersion"),"formatVersion",1,1);if(text(o.at("kind"),"kind")!="memory-library")bad("kind","expected memory-library");MemoryLibraryInput result;
        const auto &models=array(o.at("models"),"models",1,256);for(size_t i=0;i<models.size();++i)result.models.push_back(model(models[i],at("models",i)));
        detail::validateMemoryMapRequest({result.models,{}});checkpoint(cancel_);
        if(o.contains("testProfiles")) {
            const auto &profiles=array(o.at("testProfiles"),"testProfiles",0,256);
            for(size_t i=0;i<profiles.size();++i){checkpoint(cancel_);auto w=at("testProfiles",i);const auto &p=object(profiles[i],w);fields(p,w,{"definitionName","operationsPerWord","powerMicrowatts"});result.testProfiles.push_back({text(p.at("definitionName"),w+".definitionName"),number(p.at("operationsPerWord"),w+".operationsPerWord",1,1024),number(p.at("powerMicrowatts"),w+".powerMicrowatts",1,1000000000000ULL)});}
            if(!result.testProfiles.empty()){MemoryTestPlanning planning;planning.profiles=result.testProfiles;detail::validateMemoryTestPlanning(result.models,planning);}
        }
        if(o.contains("library")){auto provider=PinLibrary::create(library(o.at("library")),cancel_);if(!provider)throw provider.error();result.library=std::move(provider.value());}
        checkpoint(cancel_);return result;
    }
};
}
hier::Result<MemoryLibraryInput> parseMemoryLibrary(std::string_view input,hier::Cancel c)try {
    checkpoint(c);return Reader(c).read(detail::input::decode(input,"memory library",c));
}catch(const hier::Error &e){return e;}
hier::Result<MemoryLibraryInput> loadMemoryLibrary(const std::filesystem::path &path,hier::Cancel c)try {
    checkpoint(c);return parseMemoryLibrary(detail::input::readFile(path,"memory library",c),c);
}catch(const hier::Error &e){return e;}
}
