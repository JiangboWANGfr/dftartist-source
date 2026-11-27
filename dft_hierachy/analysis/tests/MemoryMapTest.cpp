#include "MemoryMapInternal.h"
#include <iostream>
#include <stdexcept>
namespace {
size_t checks=0;
void need(bool v,const char *message){++checks;if(!v)throw std::runtime_error(message);}
dft::memory::MemoryMapRequest request(){
 using namespace dft::memory;using R=MemoryRole;using S=PinSense;
 MemoryModel a{"mapped_ram",8,8,4,{{R::Clock,"CLK",S::Posedge},{R::Address,"A",S::None},{R::DataIn,"D",S::None},{R::DataOut,"Q",S::None},{R::WriteEnable,"WE",S::Low},{R::ChipEnable,"CEN",S::Low},{R::WriteMask,"MASK",S::High}}};
 MemoryModel b{"plain_ram",3,4,1,{{R::Address,"addr",S::None},{R::DataIn,"din",S::None},{R::DataOut,"dout",S::None},{R::Clock,"ck",S::Negedge}}};
 return {{a,b},{}};
}
}
int main()try {
 using namespace dft::memory;using hier::ErrorCode;
 hier::model::OpenOptions o;o.tops={"map_top"};o.files={DFT_MEMORY_MAP_FIXTURE};auto design=hier::Design::open(o);need(bool(design),"open design");
 MacroRequest r;r.scope="map_top";r.recursive=true;r.definitionNames={"mapped_ram","plain_ram"};auto input=inspectMacroInterfaces(**design,r);need(input&&input->complete&&input->macros.size()==9,"nine actual macro occurrences");
 auto req=request();auto result=mapMemories(*input,req);need(result&&!result->complete&&result->memories.size()==9,"mapping retains all actual instances");need(result->matchedInstances==8&&result->matchedCapacityBits==460,"seven 8x8 plus one 3x4, mismatched geometry excluded");
 size_t mismatches=0;
 for(const auto &m:result->memories){
  const auto &macro=input->macros[m.macro];const auto &inst=input->catalog.instances[macro.instance].info;
  need(m.model&&req.models[*m.model].definitionName==inst.defName,"exact definition binding");
  for(const auto &role:m.roles)need(role.pin&&req.models[*m.model].roles[role.role].pin==macro.pins[*role.pin].port.name,"original role and pin indices");
  if(inst.pathText=="map_top.narrow"){++mismatches;need(m.status=="mismatch"&&m.issues.size()==3,"actual parameterized geometry mismatch");}
  else need(m.status=="matched"&&m.issues.empty(),"known matching interface");
 }
 need(mismatches==1,"one incompatible parameterization");
 auto one=r;one.scope="map_top.left.a";one.recursive=false;auto local=inspectMacroInterfaces(**design,one);auto matched=mapMemories(*local,req);need(matched&&matched->complete&&matched->matchedCapacityBits==64,"scope outside-parent input still maps");
 auto exact=req;exact.limits.maxMacros=9;exact.limits.maxWork=result->work;need(mapMemories(*input,exact)->memories.size()==9,"exact limits retain all rows");
 for(auto limit:{1ULL,2ULL,3ULL,9ULL}){auto cut=req;cut.limits.maxMacros=limit;auto v=mapMemories(*input,cut);need(v&&v->memories.size()==limit,"complete row prefix by cap");uint64_t bits=0;for(size_t i=0;i<v->memories.size();++i){need(v->memories[i].macro==result->memories[i].macro,"stable prefix order");if(v->memories[i].status=="matched"){const auto &m=req.models[*v->memories[i].model];bits+=m.words*m.dataBits;}}need(bits==v->matchedCapacityBits,"capacity only published matches");}
 for(auto work:{1ULL,5ULL,22ULL,23ULL}){auto cut=req;cut.limits.maxWork=work;auto v=mapMemories(*input,cut);need(v&&!v->complete&&v->work<=work,"soft work cap");for(const auto &m:v->memories)need(m.roles.size()==req.models[*m.model].roles.size(),"no half mapping row");}
 auto unknown=req;unknown.models.erase(unknown.models.begin());auto u=mapMemories(*input,unknown);need(u&&u->matchedInstances==1&&u->matchedCapacityBits==12,"unmapped definitions not silently omitted");
 auto missing=req;missing.models[0].roles[0].pin="NO_CLOCK";auto m=mapMemories(*local,missing);need(m&&m->memories[0].issues.size()==2&&!m->memories[0].roles[0].pin,"missing and extra pin diagnosed");
 auto partial=*local;partial.complete=false;auto pv=mapMemories(partial,req);need(pv&&!pv->complete&&pv->memories[0].status=="matched","local match does not erase producer partial");
 auto expired=detail::mapMemoriesWithDeadline(*input,req,{});need(expired&&!expired->complete&&expired->memories.empty()&&expired->work==0,"deterministic mapping expiry");
 std::stop_source stop;stop.request_stop();auto cancelled=mapMemories({}, {},stop.get_token());need(!cancelled&&cancelled.error().code==ErrorCode::Cancelled,"pre-cancel priority");
 for(int n=0;n<13;++n){auto bad=req;
  if(n==0)bad.models.clear();if(n==1)bad.models.push_back(bad.models[0]);if(n==2)bad.models[0].words=1;if(n==3)bad.models[0].dataBits=65537;
  if(n==4)bad.models[0].maskLaneBits=3;if(n==5)bad.models[0].roles.pop_back(),bad.models[0].roles.pop_back(),bad.models[0].roles.pop_back(),bad.models[0].roles.pop_back();
  if(n==6)bad.models[0].roles[1].role=MemoryRole::Clock;if(n==7)bad.models[0].roles[1].pin="CLK";if(n==8)bad.models[0].roles[0].sense=PinSense::Low;
  if(n==9)bad.models[0].definitionName="\xff";if(n==10)bad.models[0].roles[0].role=static_cast<MemoryRole>(99);if(n==11)bad.limits.maxMacros=0;if(n==12)bad.limits.maxWork=10000001;
  auto v=mapMemories(*input,bad);need(!v&&v.error().code==ErrorCode::BadRequest,"invalid request rejected");
 }
 auto corrupt=*local;corrupt.macros[0].pins[0].object.inst="wrong";auto fail=mapMemories(corrupt,req);need(!fail&&fail.error().code==ErrorCode::BadRequest,"bad input owner rejected");
 // Synthetic boundary DTO tests numeric limits only, not RTL producer evidence.
 auto wide=*local;auto wideReq=req;wideReq.models[0].words=4294967296ULL;wideReq.models[0].dataBits=65536;wideReq.models[0].maskLaneBits=1;
 for(auto &pin:wide.macros[0].pins){if(pin.port.name=="A")pin.port.width=32;else if(pin.port.name=="D"||pin.port.name=="Q"||pin.port.name=="MASK")pin.port.width=65536;}
 need(mapMemories(wide,wideReq)->matchedCapacityBits==281474976710656ULL,"large declared capacity exact uint64");
 auto owned=std::move(result.value());design.value().reset();input={hier::Error{ErrorCode::Internal,"released"}};req={};need(owned.memories.size()==9&&owned.request.models[0].words==8,"own mapping after inputs released");
 std::cout<<checks<<" memory map assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
