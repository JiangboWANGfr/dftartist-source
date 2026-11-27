#include "WrapperConfigInput.h"
#include "../input/JsonInputInternal.h"
namespace dft::wrapper {
namespace {
using namespace dft::analysis::input;
constexpr uint64_t safe=9007199254740991ULL;
void checkpoint(hier::Cancel c) {
    if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Wrapper config loading cancelled"};
}
using Numbers=std::initializer_list<std::pair<std::string_view,uint64_t *>>;
// Conversion only: the original validators own all semantic ranges/relationships.
void numbers(const Value &value,const std::string &where,Numbers destinations) {
    for(const auto &[key,v]:object(value,where)) {
        uint64_t *destination=nullptr;
        for(const auto &[name,address]:destinations)if(name==key){destination=address;break;}
        if(!destination)bad(where,"unknown field "+key);
        *destination=number(v,where+"."+key,0,safe);
    }
}
CellDirection direction(const Value &v,const std::string &where) {
    const auto s=text(v,where);
    if(s=="input")return CellDirection::Input;
    if(s=="output")return CellDirection::Output;
    if(s=="both")return CellDirection::Both;
    bad(where,"expected input, output or both");
}
CellAction action(const Value &v,const std::string &where) {
    const auto s=text(v,where);
    if(s=="exclude")return CellAction::Exclude;
    if(s=="dedicated")return CellAction::Dedicated;
    if(s=="share")return CellAction::Share;
    bad(where,"expected exclude, dedicated or share");
}
std::optional<hier::model::BitRange> bits(const Object &o,const std::string &where) {
    if(!o.contains("bits"))return {};
    const auto w=where+".bits";const auto &b=object(o.at("bits"),w);fields(b,w,{"lsb","width"});
    return hier::model::BitRange{number(b.at("lsb"),w+".lsb",0,safe),number(b.at("width"),w+".width",0,safe)};
}
BoundaryRequest boundary(const Value &v,hier::Cancel c) {
    const auto &o=object(v,"boundary");fields(o,"boundary",{"scope"},{"ports","limits"});
    BoundaryRequest r;r.scope=text(o.at("scope"),"boundary.scope");
    if(o.contains("ports")) {
        const auto &a=array(o.at("ports"),"boundary.ports",0,10000);
        for(size_t i=0;i<a.size();++i){checkpoint(c);r.ports.push_back(text(a[i],at("boundary.ports",i)));}
    }
    auto &l=r.limits;
    if(o.contains("limits"))numbers(o.at("limits"),"boundary.limits",{{"maxPorts",&l.maxPorts},{"maxBits",&l.maxBits},{"maxWork",&l.maxWork},{"maxDepth",&l.maxDepth},{"maxMillis",&l.maxMillis},{"pageSize",&l.pageSize}});
    return r;
}
void planning(const Value &v,CellPlanRequest &r,hier::Cancel c) {
    const auto &o=object(v,"planning");fields(o,"planning",{},{"policy","rules","limits"});
    if(o.contains("policy"))numbers(o.at("policy"),"planning.policy",{{"maxInputCandidates",&r.policy.maxInputCandidates},{"maxOutputCandidates",&r.policy.maxOutputCandidates}});
    auto &l=r.limits;
    if(o.contains("limits"))numbers(o.at("limits"),"planning.limits",{{"maxRows",&l.maxRows},{"maxWork",&l.maxWork},{"maxMillis",&l.maxMillis}});
    if(o.contains("rules")) {
        const auto &a=array(o.at("rules"),"planning.rules",0,10000);
        for(size_t i=0;i<a.size();++i) {
            checkpoint(c);const auto w=at("planning.rules",i);const auto &row=object(a[i],w);
            fields(row,w,{"port","direction","action"},{"bits"});
            r.rules.push_back({text(row.at("port"),w+".port"),direction(row.at("direction"),w+".direction"),action(row.at("action"),w+".action"),bits(row,w)});
        }
    }
}
void chaining(const Value &v,ChainPlanRequest &r,hier::Cancel c) {
    const auto &o=object(v,"chaining");fields(o,"chaining",{"chains"},{"assignments","defaultChain","limits"});
    const auto &a=array(o.at("chains"),"chaining.chains",1,1024);
    for(size_t i=0;i<a.size();++i) {
        checkpoint(c);const auto w=at("chaining.chains",i);const auto &row=object(a[i],w);fields(row,w,{"name","capacity"});
        r.chains.push_back({text(row.at("name"),w+".name"),number(row.at("capacity"),w+".capacity",0,safe)});
    }
    if(o.contains("defaultChain"))r.defaultChain=text(o.at("defaultChain"),"chaining.defaultChain");
    if(o.contains("assignments")) {
        const auto &rows=array(o.at("assignments"),"chaining.assignments",0,10000);
        for(size_t i=0;i<rows.size();++i) {
            checkpoint(c);const auto w=at("chaining.assignments",i);const auto &row=object(rows[i],w);
            fields(row,w,{"port","direction","chain"},{"bits"});
            r.assignments.push_back({text(row.at("port"),w+".port"),direction(row.at("direction"),w+".direction"),bits(row,w),text(row.at("chain"),w+".chain")});
        }
    }
    auto &l=r.limits;
    if(o.contains("limits"))numbers(o.at("limits"),"chaining.limits",{{"maxRows",&l.maxRows},{"maxSegments",&l.maxSegments},{"maxWork",&l.maxWork},{"maxMillis",&l.maxMillis}});
}
template<class T> WrapperConfig checked(T request,hier::Cancel c) {
    auto valid=[&] {
        if constexpr(std::is_same_v<T,BoundaryRequest>)return validateBoundaryRequest(request,c);
        else if constexpr(std::is_same_v<T,CellPlanRequest>)return validateCellPlanRequest(request,c);
        else return validateChainPlanRequest(request,c);
    }();
    if(!valid)throw valid.error();
    checkpoint(c);return WrapperConfig{std::move(request)};
}
WrapperConfig read(const Object &o,hier::Cancel c) {
    fields(o,"wrapper config",{"formatVersion","kind","mode","boundary"},{"planning","chaining"});
    (void)number(o.at("formatVersion"),"formatVersion",1,1);
    if(text(o.at("kind"),"kind")!="wrapper-config")bad("kind","expected wrapper-config");
    const auto mode=text(o.at("mode"),"mode");
    if(mode!="boundary"&&mode!="cells"&&mode!="chains")bad("mode","expected boundary, cells or chains");
    if(mode=="boundary"&&o.contains("planning"))bad("planning","requires cells or chains mode");
    if(mode!="chains"&&o.contains("chaining"))bad("chaining","requires chains mode");
    if(mode=="chains"&&!o.contains("chaining"))bad("chaining","required for chains mode");
    auto b=boundary(o.at("boundary"),c);
    if(mode=="boundary")return checked(std::move(b),c);
    CellPlanRequest p;p.boundary=std::move(b);
    if(o.contains("planning"))planning(o.at("planning"),p,c);
    if(mode=="cells")return checked(std::move(p),c);
    ChainPlanRequest r;r.cells=std::move(p);chaining(o.at("chaining"),r,c);
    return checked(std::move(r),c);
}
}
hier::Result<WrapperConfig> parseWrapperConfig(std::string_view input,hier::Cancel c)try {
    checkpoint(c);return read(dft::analysis::input::decode(input,"wrapper config",c),c);
}catch(const hier::Error &e){return e;}
hier::Result<WrapperConfig> loadWrapperConfig(const std::filesystem::path &path,hier::Cancel c)try {
    checkpoint(c);return parseWrapperConfig(dft::analysis::input::readFile(path,"wrapper config",c),c);
}catch(const hier::Error &e){return e;}
}
