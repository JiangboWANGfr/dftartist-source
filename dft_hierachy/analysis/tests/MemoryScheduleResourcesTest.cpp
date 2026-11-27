#include "MemoryScheduleResourcesInput.h"
#include "MemoryTestScheduleInternal.h"
#include "MemoryTestScheduleJson.h"
#include "MemoryTestTiming.h"
#include "MemoryLibraryInput.h"
#include <iostream>
#include <set>
#include <stdexcept>
namespace {
using namespace dft::memory;size_t checks=0;
void need(bool b,const char *why){++checks;if(!b)throw std::runtime_error(why);}
MemoryTestScheduleRequest request(){MemoryTestScheduleRequest r;auto lib=loadMemoryLibrary(std::filesystem::path(DFT_MEMORY_RESOURCE_DIR)/"memory-test-schedule-library.json");need(bool(lib),"load library");r.test.investigation.scope="schedule_top";r.test.investigation.recursive=true;r.test.investigation.mapping.models=lib->models;r.test.planning.profiles=lib->testProfiles;r.test.planning.policy.maxParallelMemories=2;
 for(const auto *name:{"a0","a1","a2","a3","b0","b1","c0","d0"})r.test.planning.assignments.push_back({std::string("schedule_top.")+name,std::string(1,name[0]),""});r.scheduling.policy={4,1000000};return r;}
std::string json(const MemoryTestScheduleReport &r){hier::protocol::JsonWriter w(true);writeMemoryTestSchedule(w,r);return w.str();}
std::vector<std::vector<size_t>> verify(const MemoryTestScheduleReport &r){const auto &p=std::get<MemoryTestReport>(r.source).plan;std::vector<size_t> next(p.controllers.size());std::vector<std::vector<size_t>> waves;uint64_t steps=0,instances=0;
 for(const auto &w:r.schedule.waves){std::vector<size_t> cs;std::set<size_t> seen;uint64_t power=0;
  for(const auto &e:w.entries){need(seen.insert(e.controller).second&&e.step==next[e.controller]++,"order and unique controller");cs.push_back(e.controller);const auto &s=p.controllers[e.controller].steps[e.step];power+=s.powerMicrowatts;instances+=s.memories.size();++steps;}
  need(power==w.powerMicrowatts&&power<=r.schedule.request.policy.maxPowerMicrowatts,"power remains bounded");
  for(const auto &resource:r.schedule.request.resources){uint64_t n=0;for(auto ci:cs)for(const auto &domain:resource.clockDomains)if(p.controllers[ci].clockDomain==domain)++n;need(n<=resource.maxParallelControllers,"every overlapping capacity holds");}
  waves.push_back(cs);
 }
 for(size_t ci=0;ci<next.size();++ci)need(r.schedule.controllers[ci].nextStep==next[ci],"progress is published prefix");
 need(steps==r.schedule.scheduledSteps&&instances==r.schedule.scheduledInstances,"counts only published entries");return waves;}
}
int main()try {
 hier::model::OpenOptions o;o.tops={"schedule_top"};o.files={(std::filesystem::path(DFT_MEMORY_RESOURCE_DIR)/"memory-test-schedule.sv").string()};auto design=hier::Design::open(o);need(design&&design.value()->diagnostics(10).errorCount==0,"open fixture");auto &d=*design.value();auto r=request();
 auto plain=scheduleMemoryTests(d,r);need(plain&&plain->schedule.complete,"plain complete");need(verify(*plain)==std::vector<std::vector<size_t>>{{0,1,2,3},{0}},"plain two waves");need(json(*plain).find("\"resources\"")==std::string::npos,"absent resources preserve output");
 r.scheduling.resources={{"bus",1,{"a","b"}},{"port",1,{"a","c"}}};
 auto limited=scheduleMemoryTests(d,r);need(limited&&limited->schedule.complete,"resource schedule complete");need(verify(*limited)==std::vector<std::vector<size_t>>{{0,3},{0},{1,2}},"hand-calculated overlap leaves independent controller runnable");need(limited->schedule.work==19,"candidate plus ordered resource checks");
 for(uint64_t cap:{1ULL,2ULL,3ULL}){auto q=r;q.scheduling.resources={{"shared",cap,{"a","b","c","d"}}};auto got=scheduleMemoryTests(d,q);need(got&&got->schedule.complete,"capacity run");auto waves=verify(*got);need(waves.size()==(cap==1?5:cap==2?3:2),"capacity boundary waves");}
 // Same domain with distinct partition/controller consumes more than one slot.
 auto same=r;same.scheduling.resources={{"one",1,{"a"}}};for(auto &a:same.test.planning.assignments){a.clockDomain="a";a.partition=a.instancePath;}
 auto separate=scheduleMemoryTests(d,same);need(separate&&separate->schedule.complete&&separate->schedule.waves.size()==8,"same domain distinct controllers consume individually");verify(*separate);
 auto unrelated=r;unrelated.scheduling.resources={{"unused",1,{"absent"}}};auto un=scheduleMemoryTests(d,unrelated);need(un&&un->schedule.complete&&verify(*un)==verify(*plain)&&un->schedule.work==plain->schedule.work,"unobserved domain does not invent controllers or work");
 // First batch costs eight: each rejected controller pays through first conflict.
 for(uint64_t cap:{1ULL,2ULL,3ULL,7ULL,8ULL,11ULL,18ULL,19ULL}){auto q=r;q.scheduling.limits.maxWork=cap;auto got=scheduleMemoryTests(d,q);need(bool(got),"bounded result");verify(*got);need(got->schedule.work==cap&&got->schedule.complete==(cap==19),"exact work");if(cap<8)need(got->schedule.waves.empty()&&got->schedule.scheduledInstances==0,"mid resource check discards whole candidate");}
 auto q=r;q.scheduling.limits.maxWaves=1;auto prefix=scheduleMemoryTests(d,q);need(prefix&&prefix->schedule.waves.size()==1&&!prefix->schedule.complete,"wave prefix");verify(*prefix);
 q=r;q.test.planning.limits.maxWork=2;auto upstream=scheduleMemoryTests(d,q);need(upstream&&!upstream->schedule.complete&&upstream->schedule.reasons.front()=="plan_partial","upstream remains partial");verify(*upstream);
 q=r;q.scheduling.policy.maxPowerMicrowatts=199999;q.scheduling.limits.maxWork=3;auto atomic=scheduleMemoryTests(d,q);need(atomic&&atomic->schedule.waves.empty()&&atomic->schedule.controllers[0].status=="pending","uncommitted power blocking rolled back at resource check");
 q=r;q.scheduling.policy.maxPowerMicrowatts=199999;auto blocked=scheduleMemoryTests(d,q);need(blocked&&!blocked->schedule.complete&&blocked->schedule.controllers[0].status=="blocked"&&blocked->schedule.scheduledInstances==2,"permanent power block and resources coexist");verify(*blocked);
 MemoryTestTimingRequest time;time.schedule=r;for(const auto *domain:{"a","b","c","d"})time.timing.clocks.push_back({domain,1000});time.timing.policy.waveOverheadPicoseconds=7;auto timed=timeMemoryTests(d,time);need(timed&&timed->timeline.complete&&timed->timeline.durationPicoseconds==48021,"three resource waves affect timing");
 for(int k=0;k<12;++k){auto bad=r;bad.test.investigation.scope="absent";auto &resources=bad.scheduling.resources;switch(k){case 0:resources[0].maxParallelControllers=0;break;case 1:resources[0].maxParallelControllers=1025;break;case 2:resources[0].name="";break;case 3:resources[0].name=std::string(1,'\xff');break;case 4:resources[0].name=std::string("a\0b",3);break;case 5:resources[0].clockDomains={};break;case 6:resources[0].clockDomains={"a","a"};break;case 7:resources[1].name=resources[0].name;break;case 8:resources[0].clockDomains={""};break;case 9:resources[0].clockDomains={std::string(4097,'a')};break;case 10:resources.resize(1025);break;case 11:for(int j=0;j<5;++j){MemoryScheduleResource v;v.name="bulk"+std::to_string(j);for(int z=0;z<1024;++z)v.clockDomains.push_back(std::to_string(z));resources.push_back(std::move(v));}break;}auto got=scheduleMemoryTests(d,bad);need(!got&&got.error().code==hier::ErrorCode::BadRequest,"validate before scope lookup");}
 std::stop_source stop;stop.request_stop();need(scheduleMemoryTests(d,{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"query precancel");need(parseMemoryScheduleResources("broken",stop.get_token()).error().code==hier::ErrorCode::Cancelled,"parse precancel");need(loadMemoryScheduleResources("/absent",stop.get_token()).error().code==hier::ErrorCode::Cancelled,"file precancel");
 auto expired=detail::scheduleMemoryTestsWithDeadline(d,r,std::chrono::steady_clock::time_point::min());need(expired&&!expired->schedule.complete&&expired->schedule.waves.empty()&&expired->schedule.work==0,"expired index never runs");
 const std::string text=R"({"formatVersion":1,"kind":"memory-schedule-resources","resources":[{"name":"总线","maxParallelControllers":2,"clockDomains":["a,b","x"]}]})";auto parsed=parseMemoryScheduleResources(text);need(parsed&&parsed->at(0).clockDomains[0]=="a,b"&&parsed->at(0).maxParallelControllers==2,"Unicode and literal domain labels");
 auto bytes=json(*limited);r={};design.value().reset();need(json(*limited)==bytes,"result owns resources and plan after request/design release");std::cout<<checks<<" resource scheduling assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
