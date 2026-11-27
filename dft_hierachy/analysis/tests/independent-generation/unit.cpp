#include "SourceInventory.h"
#include "GenerationComparison.h"
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <stop_token>
#include <type_traits>
using namespace dft::sequential;
static unsigned count=0;
static void need(bool v,const char* why){++count;if(!v)throw std::runtime_error(why);}
static void bad(const auto& r,const char* why){need(!r && r.error().code==hier::ErrorCode::BadRequest,why);}
static std::unique_ptr<hier::Design> open(const char* f,const char* top){hier::model::OpenOptions o;o.files={f};o.tops={top};auto x=hier::Design::open(o);need(x.ok(),"open own RTL");return std::move(x.value());}
static ControlGeneration reversed(ControlGeneration g){
 const size_t n=g.nodes.size();std::reverse(g.nodes.begin(),g.nodes.end());
 auto map=[n](size_t i){return n-1-i;};
 for(auto& s:g.seeds)s.node=map(s.node);
 for(auto& z:g.generators){if(z.clockNode)z.clockNode=map(*z.clockNode);for(auto& i:z.asyncNodes)if(i)i=map(*i);}
 for(auto& c:g.cycles)for(auto& i:c.controls)i=map(i);
 return g;
}
int main(int argc,char** argv){try{
 need(argc==2,"fixture argument");static_assert(std::is_same_v<struct ScenarioSource,ControlSource>);
 std::stop_source stop;stop.request_stop();
 auto d=open(argv[1],"H_events");Request req;req.scope="H_events";req.resolveLogic=true;
 auto report=analyze(*d,req);need(report.ok(),"analyze events");
 auto ci=inventorySources(*report,{},stop.get_token());need(!ci&&ci.error().code==hier::ErrorCode::Cancelled,"pre-cancel inventory");
 InventoryLimits il;il.maxWork=0;bad(inventorySources(*report,il),"invalid inventory limit");
 auto corrupt=*report;corrupt.checks.push_back(corrupt.checks[0]);bad(inventorySources(corrupt),"duplicate full check point invalid");
 corrupt=*report;corrupt.registers[0].clockCheck=99999;bad(inventorySources(corrupt),"bad original event reference invalid");
 d.reset();auto inv=inventorySources(*report);need(inv.ok()&&inv->complete&&inv->groups.size()==2,"inventory after Design release");
 size_t members=0;for(const auto& g:inv->groups)members+=g.members.size();need(members==4,"four original events preserved");
 report=hier::Error{hier::ErrorCode::BadRequest,"released"};need(inv->groups.size()==2&&members==4,"inventory owns values after report release");
 auto chain=open(argv[1],"H_chain");req.scope="H_chain.u";auto base=analyze(*chain,req);need(base.ok(),"analyze sink scope");
 auto cg=controlGeneration(*chain,*base,{},stop.get_token());need(!cg&&cg.error().code==hier::ErrorCode::Cancelled,"pre-cancel graph");
 GenerationLimits gl;gl.maxControls=0;bad(controlGeneration(*chain,*base,gl),"invalid graph limit");
 auto stale=*base;stale.snapshot.snapshotId+="wrong";bad(controlGeneration(*chain,stale),"wrong snapshot graph");
 auto graph=controlGeneration(*chain,*base);need(graph.ok()&&graph->complete&&graph->generators.size()==2&&graph->nodes.size()==3,"cross-scope chain");
 chain.reset();base=hier::Error{hier::ErrorCode::BadRequest,"released"};need(graph->generators[0].fact.ref.size()>0&&!graph->registerPages.empty(),"graph owns facts and raw pages");
 auto modes=open(argv[1],"H_modes");ScenarioRequest request;request.common.scope="H_modes.u";request.common.resolveLogic=true;request.scenarios={{"ZERO",{{{"H_modes.sel",0},false}}},{"ONE",{{{"H_modes.sel",0},true}}},{"BACK",{{{"H_modes.sel",0},false}}}};
 auto batch=compareScenarios(*modes,request);need(batch.ok()&&batch->complete,"mode batch");
 std::vector<ControlGeneration> graphs;
 for(const auto& s:batch->scenarios){need(s.report.has_value(),"scenario report");auto g=controlGeneration(*modes,*s.report);need(g.ok()&&g->complete,"scenario graph");graphs.push_back(std::move(*g));}
 std::vector<GenerationContext> contexts;for(size_t i=0;i<graphs.size();++i)contexts.push_back({i,std::cref(graphs[i])});
 auto cancelled=compareGenerationScenarios(*batch,contexts,{},stop.get_token());need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel comparison");
 GenerationComparisonLimits cl;cl.maxRows=0;bad(compareGenerationScenarios(*batch,contexts,cl),"invalid comparison limit");
 auto old=graphs[1].snapshotId;graphs[1].snapshotId+="wrong";bad(compareGenerationScenarios(*batch,contexts),"mismatched graph snapshot");graphs[1].snapshotId=old;
 auto seed=graphs[1].seeds[0].node;graphs[1].seeds[0].node=graphs[1].nodes.size();bad(compareGenerationScenarios(*batch,contexts),"bad seed index");graphs[1].seeds[0].node=seed;
 modes.reset();auto compared=compareGenerationScenarios(*batch,contexts);need(compared.ok()&&compared->complete,"comparison after Design release/error retry");need(compared->comparisons.size()==2&&compared->comparisons[0].controls[0].status=="changed"&&compared->comparisons[1].controls[0].status=="unchanged","deeper context changes and return");
 graphs[2]=reversed(graphs[2]);auto reordered=compareGenerationScenarios(*batch,contexts);need(reordered.ok()&&reordered->comparisons[1].controls[0].status=="unchanged","node numbering is not structure identity");
 batch=hier::Error{hier::ErrorCode::BadRequest,"released"};graphs.clear();contexts.clear();need(compared->comparisons[0].controls[0].status=="changed"&&!compared->contexts[0].cones[0].nodes.empty(),"comparison owns result after inputs released");
 std::cout<<"{\"passed\":true,\"assertions\":"<<count<<"}\n";return 0;
 }catch(const std::exception& e){std::cerr<<"after "<<count<<" assertions: "<<e.what()<<'\n';return 1;}}
