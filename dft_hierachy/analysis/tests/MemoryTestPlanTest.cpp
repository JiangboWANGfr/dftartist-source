#include "MemoryTestPlanInternal.h"
#include "MemoryTestPlanJson.h"
#include <algorithm>
#include <iostream>
#include <set>
#include <stdexcept>
namespace {
using namespace dft::memory;
size_t checks=0;
void need(bool ok,const char *why){++checks;if(!ok)throw std::runtime_error(why);}
MemoryTestRequest request(){
 using R=MemoryRole;using S=PinSense;MemoryTestRequest r;r.investigation.scope="plan_top";r.investigation.recursive=true;
 MemoryModel m{"plan_ram",8,8,1,{{R::Clock,"CLK",S::Posedge},{R::Address,"A",S::None},{R::DataIn,"D",S::None},{R::DataOut,"Q",S::None}}};
 r.investigation.mapping.models={m};m.definitionName="plan_alt";r.investigation.mapping.models.push_back(m);
 r.planning.profiles={{"plan_ram",2,120000},{"plan_alt",3,80000}};
 for(const char *n:{"a0","b0","c0","d0","e0","f0","g0","h0","x0"})r.planning.assignments.push_back({std::string("plan_top.")+n,std::string(n)=="d0"?"other":"clk",std::string(n)=="e0"?"separate":""});
 r.planning.policy={3,3,250000};return r;
}
void invariants(const MemoryTestReport &r){
 const auto &p=r.plan;std::set<size_t> seen;uint64_t capacity=0,count=0;
 for(size_t ci=0;ci<p.controllers.size();++ci){const auto &c=p.controllers[ci];uint64_t cycles=0,peak=0,memories=0;
  for(size_t si=0;si<c.steps.size();++si){const auto &s=c.steps[si];uint64_t power=0;need(!s.memories.empty()&&s.memories.size()<=p.request.policy.maxParallelMemories,"nonempty bounded steps");
   for(auto mi:s.memories){need(mi<p.memories.size()&&seen.insert(mi).second,"exactly one step owns published scheduled row");const auto &row=p.memories[mi];need(row.controller==ci&&row.step==si&&row.status=="scheduled"&&row.reason.empty()&&row.assignment.has_value(),"row reverse indices");
    const auto &mapping=r.investigation.mapping.memories[row.memory];need(mapping.status=="matched"&&mapping.model==c.model,"only exact model matches scheduled");
    const auto &a=p.request.assignments[*row.assignment];need(a.clockDomain==c.clockDomain&&a.partition==c.partition,"no cross domain or partition");
    const auto &model=r.investigation.mapping.request.models[c.model];const auto &profile=p.request.profiles[c.profile];need(profile.definitionName==model.definitionName&&s.cycles==model.words*profile.operationsPerWord,"declared test costs");
    capacity+=model.words*model.dataBits;power+=profile.powerMicrowatts;++count;++memories;
   }
   need(power==s.powerMicrowatts&&power<=p.request.policy.maxPowerMicrowatts,"sum power respects policy");cycles+=s.cycles;peak=std::max(peak,power);
  }
  need(memories<=p.request.policy.maxMemoriesPerController&&cycles==c.cycles&&peak==c.peakPowerMicrowatts,"controller totals and capacity");
 }
 need(count==p.scheduledInstances&&capacity==p.scheduledCapacityBits,"report counts scheduled only");
 for(size_t i=0;i<p.memories.size();++i)need(p.memories[i].memory==i&&(p.memories[i].status=="scheduled")==seen.contains(i),"prefix and complete membership");
}
}
int main()try{
 hier::model::OpenOptions o;o.tops={"plan_top"};o.files={DFT_MEMORY_TEST_PLAN_FIXTURE};auto d=hier::Design::open(o);need(d&&d.value()->diagnostics(100).errorCount==0,"open fixture");auto r=request();
 auto full=planMemoryTests(*d.value(),r);need(bool(full),"plan");const auto &p=full->plan;
 need(p.memories.size()==9&&p.scheduledInstances==8&&p.scheduledCapacityBits==512&&p.controllers.size()==5&&!p.complete&&p.unusedAssignments.empty(),"baseline grouping plus unmatched row");invariants(*full);
 need(p.controllers[0].steps.size()==2&&p.controllers[0].cycles==32&&p.controllers[0].peakPowerMicrowatts==240000&&p.controllers[0].steps[1].reasons==std::vector<std::string>{"power_limit"},"power split arithmetic");
 need(p.controllers[3].reason=="controller_capacity","controller split reason");
 auto q=r;q.planning.policy.maxParallelMemories=1;auto v=planMemoryTests(*d.value(),q);need(v&&v->plan.controllers[0].steps.size()==3&&v->plan.controllers[0].cycles==48,"parallel serialization");invariants(*v);
 q=r;q.planning.policy.maxPowerMicrowatts=119999;v=planMemoryTests(*d.value(),q);need(v&&v->plan.scheduledInstances==2&&v->plan.controllers.size()==1,"oversize macro blocked, other model retained");invariants(*v);
 q=r;q.planning.assignments.clear();v=planMemoryTests(*d.value(),q);need(v&&v->plan.controllers.empty()&&v->plan.memories.size()==9&&v->plan.memories[0].reason=="domain_missing"&&v->plan.memories.back().reason=="interface_unmatched","diagnostic precedence without domains");
 q=r;q.planning.assignments.push_back({"absent","clk",""});v=planMemoryTests(*d.value(),q);need(v&&v->plan.unusedAssignments==std::vector<size_t>{9},"unused is reported, not not-found");
 for(uint64_t n:{1ULL,2ULL,8ULL,9ULL,10ULL}){q=r;q.planning.limits.maxWork=n;v=planMemoryTests(*d.value(),q);need(v&&v->plan.memories.size()==std::min<uint64_t>(9,n)&&v->plan.work==std::min<uint64_t>(9,n),"exact row work budget");invariants(*v);}
 q=r;q.planning.limits.maxControllers=1;v=planMemoryTests(*d.value(),q);need(v&&v->plan.controllers.size()==1&&v->plan.memories.size()==3&&v->plan.visitedMemories==4&&v->plan.unusedAssignments.size()==6,"new-controller budget publishes atomic prefix");invariants(*v);
 q=r;q.investigation.mapping.limits.maxMacros=2;v=planMemoryTests(*d.value(),q);need(v&&v->plan.scheduledInstances==2&&!v->plan.complete&&v->plan.reasons.front()=="mapping_partial","mapping partial is conditional plan");invariants(*v);
 q=r;q.investigation.scope="plan_top.a0";q.investigation.recursive=false;q.planning.assignments.resize(1);v=planMemoryTests(*d.value(),q);need(v&&v->plan.complete&&v->plan.memories.size()==1,"complete scoped plan");
 q=r;q.investigation.recursive=false;q.planning.assignments.clear();v=planMemoryTests(*d.value(),q);need(v&&v->plan.complete&&v->plan.memories.empty(),"complete empty scoped plan");
 v=detail::planMemoryTestsWithDeadline(*d.value(),r,std::chrono::steady_clock::now()-std::chrono::seconds(1));need(v&&v->plan.work==0&&v->plan.controllers.empty()&&v->plan.unusedAssignments.size()==9,"expired scheduling deadline no partial row");
 for(int n=0;n<15;++n){q=r;q.investigation.scope="absent";
  switch(n){case 0:q.planning.profiles.clear();break;case 1:q.planning.profiles[1]=q.planning.profiles[0];break;case 2:q.planning.profiles[0].definitionName="unknown";break;case 3:q.planning.profiles[0].operationsPerWord=1025;break;case 4:q.planning.profiles[0].powerMicrowatts=0;break;case 5:q.planning.assignments[1]=q.planning.assignments[0];break;case 6:q.planning.assignments[0].clockDomain="";break;case 7:q.planning.assignments[0].partition="\xff";break;case 8:q.planning.policy.maxParallelMemories=0;break;case 9:q.planning.policy.maxMemoriesPerController=1025;break;case 10:q.planning.policy.maxPowerMicrowatts=1000000000001ULL;break;case 11:q.planning.limits.maxControllers=0;break;case 12:q.planning.limits.maxWork=0;break;case 13:q.planning.limits.maxMillis=0;break;case 14:q.planning.profiles[0]=MemoryTestProfile{"plan_ram"};break;}
  v=planMemoryTests(*d.value(),q);need(!v&&v.error().code==hier::ErrorCode::BadRequest,"planning validation before missing scope");
 }
 q=r;q.investigation.scope="absent";v=planMemoryTests(*d.value(),q);need(!v&&v.error().code==hier::ErrorCode::NotFound,"valid absent scope");
 std::stop_source stop;stop.request_stop();v=planMemoryTests(*d.value(),{},stop.get_token());need(!v&&v.error().code==hier::ErrorCode::Cancelled,"pre-cancel wins invalid request");
 v=planMemoryTests(*d.value(),r);need(bool(v),"reuse after cancellation and errors");invariants(*v);
 auto owned=std::move(full.value());d.value().reset();r={};hier::protocol::JsonWriter w;writeMemoryTestPlan(w,owned);need(w.str().find("rtl-memory-test-plan-v1")!=std::string::npos&&owned.plan.scheduledInstances==8,"owned plan survives design and request");
 std::cout<<checks<<" memory test planning assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
