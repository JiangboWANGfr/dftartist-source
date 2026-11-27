#include "MemoryClockSourcesJson.h"
#include "MemoryLibraryInput.h"
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::memory;size_t checks=0;
void need(bool ok,const char *what){++checks;if(!ok)throw std::runtime_error(what);}
std::string json(const MemoryClockReport &r){hier::protocol::JsonWriter w;writeMemoryClockSources(w,r);return w.str();}
const MemoryClockRow &row(const MemoryClockReport &r,const std::string &name){for(const auto &v:r.clocks.rows){const auto &macro=r.source.interfaces.macros[v.macro];if(r.source.interfaces.catalog.instances[macro.instance].info.pathText==name)return v;}throw std::runtime_error("missing row "+name);}
}
int main()try {
 const auto dir=std::filesystem::path(DFT_MEMORY_CLOCK_DIR);
 auto lib=loadMemoryLibrary(dir/"memory-clock-library.json");need(bool(lib),"library input");
 MemoryClockRequest request;request.investigation.scope="clock_top";request.investigation.recursive=true;request.investigation.mapping.models=lib->models;
 hier::model::OpenOptions options;options.tops={"clock_top"};options.files={dir/"memory-clock-sources.sv"};
 auto design=hier::Design::open(options);need(design&&design.value()->diagnostics(100).errorCount==0,"actual fixture elaboration");auto &d=*design.value();
 auto r=inspectMemoryClockSources(d,request);need(bool(r),"clock sources");need(!r->clocks.complete&&r->clocks.rows.size()==15,"all mapped clock rows, partial");
 need(r->clocks.resolvedInstances==6&&r->clocks.groups.size()==3,"six resolved clocks, three source/edge groups");
 const auto g=row(*r,"clock_top.direct0").group;need(g.has_value(),"primary clock group");
 for(const auto *name:{"clock_top.double_inv","clock_top.neg_inv","clock_top.branch.nested"})need(row(*r,name).group==g,"same source/effective edge");
 need(row(*r,"clock_top.direct1").group!=g&&row(*r,"clock_top.inverted").group!=g,"different bit and edge separated");
 need(r->clocks.groups[*g].edge=="posedge"&&r->clocks.groups[*g].point.slice.bits.lsb==0,"normalized group bit and edge");
 for(const auto *name:{"constant0","folded","floating","open_pin"})need(row(*r,std::string("clock_top.")+name).status=="unusable","unusable constant or undriven");
 for(const auto *name:{"generated","selected","gated","cycle","multiple"})need(row(*r,std::string("clock_top.")+name).status=="unresolved","unresolved logic boundary");
 need(row(*r,"clock_top.generated").proof->result.verdict=="generated","retain generating register boundary");
 need(row(*r,"clock_top.inverted").proof->result.inversions==1&&row(*r,"clock_top.double_inv").proof->result.inversions==2,"raw inversion proof retained");
 auto original=investigateMemories(d,request.investigation);need(bool(original),"original investigation");hier::protocol::JsonWriter a,b;writeMemoryMap(a,original->interfaces,original->mapping);writeMemoryMap(b,r->source.interfaces,r->source.mapping);need(a.str()==b.str(),"unchanged original investigation");
 for(const auto &group:r->clocks.groups)for(auto member:group.members){need(member<r->clocks.rows.size()&&r->clocks.rows[member].group&&r->clocks.rows[member].status=="resolved","group indices and statuses");}
 auto q=request;q.investigation.scope="clock_top.branch";auto nested=inspectMemoryClockSources(d,q);need(nested&&nested->clocks.complete&&nested->clocks.resolvedInstances==1,"scope below actual design root");
 q.limits.maxWork=nested->clocks.work;auto exact=inspectMemoryClockSources(d,q);need(exact&&exact->clocks.complete&&exact->clocks.groups.size()==1,"exact total work permits final group");
 --q.limits.maxWork;auto noMetadata=inspectMemoryClockSources(d,q);need(noMetadata&&!noMetadata->clocks.complete&&noMetadata->clocks.groups.empty()&&noMetadata->clocks.rows.size()==1,"group metadata budget publishes no orphan");need(noMetadata->clocks.rows[0].proof->result.verdict=="primary_input"&&noMetadata->clocks.rows[0].reason=="budget_work","proven PI retained when group publication cannot finish");
 q=request;q.investigation.mapping.models[0].dataBits=16;auto mismatch=inspectMemoryClockSources(d,q);need(mismatch&&!mismatch->clocks.complete&&row(*mismatch,"clock_top.direct0").status=="unmatched"&&!row(*mismatch,"clock_top.direct0").proof,"no source proof on mismatched model");
 q=request;q.investigation.mapping.limits.maxMacros=2;auto prefix=inspectMemoryClockSources(d,q);need(prefix&&prefix->clocks.rows.size()==2&&!prefix->clocks.complete,"mapping prefix never upgraded");
 q=request;q.investigation.recursive=false;auto empty=inspectMemoryClockSources(d,q);need(empty&&empty->clocks.complete&&empty->clocks.rows.empty(),"complete empty");
 q=request;q.limits.maxWork=1;auto limited=inspectMemoryClockSources(d,q);need(limited&&limited->clocks.work==1&&limited->clocks.rows.size()==1&&limited->clocks.groups.empty()&&!limited->clocks.complete,"work budget, no invented group");
 q=request;q.limits.maxDepth=1;limited=inspectMemoryClockSources(d,q);need(limited&&!limited->clocks.complete&&limited->clocks.groups.empty(),"depth cutoff");
 for(const auto cap:{uint64_t(0),uint64_t(1000001)}){q=request;q.limits.maxWork=cap;q.investigation.scope="absent";auto bad=inspectMemoryClockSources(d,q);need(!bad&&bad.error().code==hier::ErrorCode::BadRequest,"all validation before lookup");}
 std::stop_source stop;stop.request_stop();auto cancelled=inspectMemoryClockSources(d,q,stop.get_token());need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel first");
 q=request;q.investigation.scope="absent";auto absent=inspectMemoryClockSources(d,q);need(!absent&&absent.error().code==hier::ErrorCode::NotFound,"missing scope");need(bool(inspectMemoryClockSources(d,request)),"recovery");
 const auto owned=json(*r);design.value().reset();request={};need(json(*r)==owned,"owning proofs after design/request release");
 std::cout<<checks<<" memory clock source assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
