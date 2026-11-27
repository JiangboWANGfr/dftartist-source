#include "MemoryInvestigation.h"
#include "MemoryMapJson.h"
#include "PinLibrary.h"
#include <algorithm>
#include <iostream>
#include <stdexcept>
namespace {
size_t checks=0;
void need(bool ok,const char *message){++checks;if(!ok)throw std::runtime_error(message);}
using namespace dft::memory;
MemoryInvestigationRequest request(){
 using R=MemoryRole;using S=PinSense;MemoryInvestigationRequest r;r.scope="library_top";r.recursive=true;
 MemoryModel m{"missing_ram",8,8,1,{{R::Clock,"CLK",S::Posedge},{R::Address,"A",S::None},{R::DataIn,"D",S::None},{R::DataOut,"Q",S::None}}};
 r.mapping.models={m};m.definitionName="known_ram";r.mapping.models.push_back(m);return r;
}
std::unique_ptr<hier::Design> open(bool library=false){
 hier::model::OpenOptions o;o.tops={"library_top"};o.files={DFT_MEMORY_INVESTIGATION_FIXTURE};
 if(library){using D=hier::model::Direction;LibraryDeclaration l{"fixture",{{"missing_ram",{{{"CLK",D::In,1,{}},{"A",D::In,3,{}},{"D",D::In,8,{}},{"Q",D::Out,8,{}}},{}}}}};o.library=PinLibrary::create(l).value();}
 auto d=hier::Design::open(o);need(bool(d)&&d.value()->diagnostics(100).errorCount==0,"open legal design");return std::move(d.value());
}
std::string json(const MacroInterfaces &i,const MemoryMap &m){hier::protocol::JsonWriter w;writeMemoryMap(w,i,m);return w.str();}
}
int main()try {
 auto d=open();auto r=request();auto all=investigateMemories(*d,r);
 need(all&&all->interfaces.macros.size()==5&&all->mapping.memories.size()==5,"all rows including anonymous survive");
 need(all->mapping.matchedInstances==1&&all->mapping.matchedCapacityBits==64&&!all->mapping.complete,"resolved neighbor retained without invented anonymous match");
 need(all->interfaces.request.definitionNames==std::vector<std::string>{"missing_ram","known_ram"},"models are the only definition selection");
 size_t anonymous=0;
 for(const auto &row:all->mapping.memories){const auto &macro=all->interfaces.macros[row.macro];
  for(const auto &pin:macro.pins)need(pin.object.ref==pin.port.ref&&!pin.port.ref.empty(),"original pin identity retained");
  if(std::all_of(macro.pins.begin(),macro.pins.end(),[](const auto &p){return p.port.name.empty();})){
   ++anonymous;need(row.status=="mismatch"&&row.issues.size()==8,"four missing model pins and four anonymous originals");
   for(size_t i=0;i<4;++i){need(!row.roles[i].pin&&!row.roles[i].compatible,"never guess positional name");need(row.issues[i].code=="pin_missing","missing by name");need(row.issues[i+4].code=="unmapped_pin"&&row.issues[i+4].pin.empty(),"original empty displayed name retained");}
  }
 }
 need(anonymous==2,"positional and hole each have anonymous pins");
 auto macro=all->interfaces.request;auto manual=inspectMacroInterfaces(*d,macro);auto mapped=mapMemories(*manual,r.mapping);need(manual&&mapped&&json(*manual,*mapped)==json(all->interfaces,all->mapping),"bundle exactly reuses original producer and mapper");
 auto withLib=open(true);auto fixed=investigateMemories(*withLib,r);need(fixed&&fixed->mapping.matchedInstances==4&&fixed->mapping.matchedCapacityBits==256,"explicit library names four compatible interfaces; extra pin excludes one");
 for(const auto *scope:{"library_top.positional","library_top.hole"}){auto one=r;one.scope=scope;one.recursive=false;auto v=investigateMemories(*d,one);need(v&&v->mapping.memories.size()==1&&!v->mapping.complete&&v->mapping.matchedCapacityBits==0,"pure anonymous scope returns partial");}
 auto cap=r;cap.mapping.limits.maxMacros=1;auto v=investigateMemories(*d,cap);need(v&&v->interfaces.macros.size()==5&&v->mapping.memories.size()==1&&!v->mapping.complete,"mapping cap preserves original full report");
 cap=r;cap.interfaces.maxMacros=1;v=investigateMemories(*d,cap);need(v&&v->interfaces.macros.size()==1&&v->mapping.memories.size()==1&&!v->mapping.complete,"macro partial continues into mapping");
 cap=r;cap.mapping.limits.maxWork=1;v=investigateMemories(*d,cap);need(v&&v->mapping.memories.empty()&&!v->mapping.complete,"whole mapping row budget");
 cap=r;cap.clockPins={"missing-clock"};v=investigateMemories(*withLib,cap);need(v&&!v->interfaces.complete&&!v->mapping.complete&&v->mapping.matchedInstances==4,"upstream trace failure retained alongside matches");
 auto reverse=r;std::reverse(reverse.mapping.models.begin(),reverse.mapping.models.end());v=investigateMemories(*d,reverse);need(v&&v->mapping.matchedInstances==1&&v->interfaces.request.definitionNames[0]=="known_ram","caller model ordering retained");
 auto local=r;local.recursive=false;v=investigateMemories(*d,local);need(v&&v->mapping.memories.empty()&&v->mapping.complete,"nonrecursive no candidate is complete scoped result");
 auto absent=r;absent.scope="absent";auto error=investigateMemories(*d,absent);need(!error&&error.error().code==hier::ErrorCode::NotFound,"valid missing scope propagated");
 for(int n=0;n<7;++n){auto bad=absent;if(n==0)bad.mapping.models.clear();if(n==1)bad.mapping.models[0].words=1;if(n==2)bad.mapping.limits.maxWork=0;if(n==3)bad.interfaces.maxPins=0;if(n==4)bad.traversal.pageSize=0;if(n==5)bad.clockPins={"x","x"};if(n==6)bad.mapping.models[0].roles[0].pin="";error=investigateMemories(*d,bad);need(!error&&error.error().code==hier::ErrorCode::BadRequest,"all request stages validated before missing scope lookup");}
 std::stop_source stop;stop.request_stop();error=investigateMemories(*d,{},stop.get_token());need(!error&&error.error().code==hier::ErrorCode::Cancelled,"pre-cancel wins invalid request");
 // Mutation tests exercise input guards, not alternative producer evidence.
 for(int n=0;n<4;++n){auto corrupt=all->interfaces;auto &pins=corrupt.macros[1].pins;
  if(n==0)pins[1].port.ref=pins[0].port.ref;if(n==1)pins[1].object.inst="wrong";if(n==2){pins[0].port.name="same";pins[1].port.name="same";}if(n==3)pins[0].port.name="\xff";
  auto bad=mapMemories(corrupt,r.mapping);need(!bad&&bad.error().code==hier::ErrorCode::BadRequest,"malformed ownership or nonempty names still rejected");
 }
 need(bool(investigateMemories(*d,r)),"valid reuse after error/cancel");auto owned=std::move(all.value());d.reset();r={};need(owned.mapping.matchedCapacityBits==64&&owned.interfaces.macros.size()==5&&owned.mapping.snapshotId==owned.interfaces.catalog.snapshot.snapshotId,"self-contained owned producer pair");
 std::cout<<checks<<" memory investigation assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
