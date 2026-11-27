#include "PinLibrary.h"
#include "MemoryMap.h"
#include <iostream>
#include <stdexcept>
namespace {
size_t checks=0;
void need(bool v,const char *message){++checks;if(!v)throw std::runtime_error(message);}
using namespace dft::memory;
using D=hier::model::Direction;
LibraryDeclaration declaration(){return {"handwritten-fixture-v1",{{"missing_ram",{{{"CLK",D::In,1,{}},{"A",D::In,3,{}},{"D",D::In,8,{}},{"Q",D::Out,8,{}}},{}}}}};}
std::unique_ptr<hier::Design> open(std::shared_ptr<const PinLibrary> lib={}){
 hier::model::OpenOptions o;o.tops={"library_top"};o.files={DFT_MEMORY_LIBRARY_FIXTURE};o.library=std::move(lib);o.connectionCacheBytes=0;
 auto r=hier::Design::open(o);need(bool(r),"open");need(r.value()->diagnostics(100).errorCount==0,"legal RTL");return std::move(r.value());
}
MacroInterfaces inspect(hier::Design &d,const char *scope){MacroRequest r;r.scope=scope;r.definitionNames={"missing_ram","known_ram"};auto v=inspectMacroInterfaces(d,r);need(bool(v)&&v->macros.size()==1,"inspect exact occurrence");return std::move(v.value());}
MemoryMapRequest models(){using R=MemoryRole;using S=PinSense;return {{{"missing_ram",8,8,1,{{R::Clock,"CLK",S::Posedge},{R::Address,"A",S::None},{R::DataIn,"D",S::None},{R::DataOut,"Q",S::None}}}}, {}};}
}
int main()try {
 auto req=declaration();auto made=PinLibrary::create(req);need(bool(made),"valid provider");auto lib=made.value();need(!lib->cell("unknown"),"absent definition");
 req.cells["missing_ram"].pins[0].width=44;req.source="changed";
 auto copy=lib->cell("missing_ram");copy->pins[0].width=33;need(lib->cell("missing_ram")->pins[0].width==1,"owned provider and owned returns");
 need(lib->cell("missing_ram")->attrs.at("dft.library.source")=="handwritten-fixture-v1","opaque provenance");
 auto d=open(lib);const auto hash=d->snapshot().inputHash;need(!d->snapshot().inputHashComplete,"opaque provider remains incomplete identity");
 for(const auto *scope:{"library_top.named","library_top.positional","library_top.hole"}){
  auto facts=inspect(*d,scope);const auto &pins=facts.macros[0].pins;need(pins.size()==4,"declared pins");
  for(size_t i=0;i<4;++i){const auto expected=lib->cell("missing_ram")->pins[i];need(pins[i].port.name==expected.name&&pins[i].port.width==*expected.width&&pins[i].port.direction==expected.dir,"declared order width direction");}
  auto mapped=mapMemories(facts,models());need(mapped&&mapped->matchedInstances==1&&mapped->matchedCapacityBits==64,"interface model compatibility");
  if(std::string_view(scope)=="library_top.hole")need(pins[1].bindings[0].segments[0].target.kind=="unconnected","positional hole retained");
 }
 auto extra=mapMemories(inspect(*d,"library_top.extra"),models());need(extra&&extra->matchedInstances==0&&extra->memories[0].issues[0].code=="unmapped_pin","extra RTL pin preserved");
 auto same=open(PinLibrary::create(declaration()).value());need(same->snapshot().inputHash==hash,"same effective input same hash");
 for(int n=0;n<4;++n){auto changed=declaration();if(n==0)changed.source="revision2";if(n==1)changed.cells.begin()->second.pins[1].width=4;if(n==2)changed.cells.begin()->second.pins[1].dir=D::Unknown;if(n==3)changed.cells.begin()->second.pins[1].attrs["opaque"]="x";
  auto other=open(PinLibrary::create(changed).value());need(other->snapshot().inputHash!=hash,"used source or pin facts enter hash");
  need(inspect(*d,"library_top.named").macros[0].pins[1].port.width==3,"existing snapshot unchanged");
  if(n==1||n==2)need(mapMemories(inspect(*other,"library_top.named"),models())->matchedInstances==0,"library conflicts cannot be repaired by model");
 }
 auto unused=declaration();unused.cells["unused"]=unused.cells.begin()->second;auto withUnused=open(PinLibrary::create(unused).value());need(withUnused->snapshot().inputHash==hash,"unused declaration not promised in Core hash");
 auto resolved=declaration();resolved.cells["known_ram"]={{{"wrong",D::Out,99,{}}},{}};auto resolvedD=open(PinLibrary::create(resolved).value());auto known=inspect(*resolvedD,"library_top.known");need(known.macros[0].pins.size()==4&&known.macros[0].pins[1].port.name=="A"&&known.macros[0].pins[1].port.width==3,"resolved RTL not overridden");
 auto no=open();need(mapMemories(inspect(*no,"library_top.named"),models())->matchedInstances==0,"no library leaves unknown directions");
 std::stop_source stop;stop.request_stop();auto cancel=PinLibrary::create({},stop.get_token());need(!cancel&&cancel.error().code==hier::ErrorCode::Cancelled,"pre-cancel before validation");
 for(int n=0;n<18;++n){auto bad=declaration();auto &cell=bad.cells.begin()->second;
  if(n==0)bad.source="";if(n==1)bad.source="\xff";if(n==2)bad.source=std::string("a\0b",3);if(n==3)cell.pins[0].width.reset();if(n==4)cell.pins[0].width=0;if(n==5)cell.pins[0].width=65537;if(n==6)cell.pins[0].dir=static_cast<D>(99);if(n==7)cell.pins.push_back(cell.pins[0]);if(n==8)cell.attrs["dft.library.source"]="fake";if(n==9)cell.pins[0].name="";if(n==10)cell.pins[0].attrs[""]="x";if(n==11)cell.attrs["k"]=std::string(4097,'x');if(n==12)cell.pins.clear();if(n==13)cell.pins.resize(257);if(n==14)bad.cells.clear();if(n==15){auto c=cell;for(int i=0;i<257;++i)bad.cells[std::to_string(i)]=c;}if(n==16)for(int i=0;i<33;++i)cell.attrs[std::to_string(i)]="";if(n==17)bad.source=std::string(4097,'x');
  auto v=PinLibrary::create(bad);need(!v&&v.error().code==hier::ErrorCode::BadRequest,"invalid input");
 }
 auto opaque=declaration();opaque.cells.begin()->second.attrs["arbitrary"]="";opaque.cells.begin()->second.pins[0].attrs["role"]="not interpreted";auto good=PinLibrary::create(opaque);need(good&&good.value()->cell("missing_ram")->pins[0].attrs.at("role")=="not interpreted","opaque attrs preserved");
 auto dense=declaration();auto &pins=dense.cells.begin()->second.pins;pins.clear();for(int i=0;i<256;++i)pins.push_back({std::to_string(i),D::In,65536,{}});auto c=dense.cells.begin()->second;for(int i=1;i<64;++i)dense.cells[std::to_string(i)]=c;need(bool(PinLibrary::create(dense)),"16384 pins allowed");dense.cells["over"]=c;need(!PinLibrary::create(dense),"total pin cap");
 auto huge=declaration();auto &p=huge.cells.begin()->second.pins;p.resize(128,p[0]);for(size_t i=0;i<p.size();++i){p[i].name=std::to_string(i);for(int a=0;a<32;++a)p[i].attrs[std::to_string(a)]=std::string(4096,'x');}need(!PinLibrary::create(huge),"aggregate text cap");
 for(const auto *dir:{"in","out","inout","ref","unknown"})need(parseLibraryDirection(dir)&&libraryDirectionName(*parseLibraryDirection(dir))==dir,"direction roundtrip");need(!parseLibraryDirection("input"),"strict direction token");
 auto owned=inspect(*d,"library_top.named");d.reset();lib.reset();made={hier::Error{hier::ErrorCode::Internal,"released"}};need(owned.macros[0].pins[0].port.name=="CLK","report owns pin facts");
 std::cout<<checks<<" library assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
