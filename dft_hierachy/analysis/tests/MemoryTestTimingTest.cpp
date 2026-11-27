#include "MemoryTestTimingInternal.h"
#include "MemoryTestTimingJson.h"
#include "MemoryTestScheduleJson.h"
#include <algorithm>
#include <iostream>
#include <set>
#include <stdexcept>
namespace {
using namespace dft::memory;size_t checks=0;
void need(bool ok,const char *why){++checks;if(!ok)throw std::runtime_error(why);}
MemoryModel model(const char *name,uint64_t words){return {name,words,8,1,{{MemoryRole::Clock,"CLK",PinSense::Posedge},{MemoryRole::Address,"A",PinSense::None},{MemoryRole::DataIn,"D",PinSense::None},{MemoryRole::DataOut,"Q",PinSense::None}}};}
MemoryTestTimingRequest request() {
 MemoryTestTimingRequest r;auto &s=r.schedule;s.test.investigation.scope="schedule_top";s.test.investigation.recursive=true;s.test.investigation.mapping.models={model("schedule_ram",8)};
 s.test.planning.profiles={{"schedule_ram",2,100000}};s.test.planning.policy.maxParallelMemories=2;s.scheduling.policy={2,300000};
 for(const auto *name:{"a0","a1","a2","a3","b0","b1","c0","d0"})s.test.planning.assignments.push_back({std::string("schedule_top.")+name,std::string(1,name[0]),""});
 r.timing.clocks={{"a",1000},{"b",2000},{"c",3000},{"d",4000},{"unused",1}};r.timing.policy.waveOverheadPicoseconds=7;return r;
}
std::string json(const MemoryTestScheduleReport &r){hier::protocol::JsonWriter w(true);writeMemoryTestSchedule(w,r);return w.str();}
std::string json(const MemoryTestTimingReport &r){hier::protocol::JsonWriter w(true);writeMemoryTestTiming(w,r);return w.str();}
void verify(const MemoryTestTimingReport &r) {
 const auto *p=std::get_if<MemoryTestReport>(&r.source.source);const auto &source=p?*p:std::get<MemoryTestRulePlan>(r.source.source).report;const auto &t=r.timeline;
 uint64_t end=0,steps=0,instances=0,bits=0;std::set<size_t> used;
 for(size_t wi=0;wi<t.waves.size();++wi){const auto &w=t.waves[wi];const auto &original=r.source.schedule.waves[wi];uint64_t longest=0;need(w.entries.size()==original.entries.size(),"whole-wave entries");
  for(size_t ei=0;ei<w.entries.size();++ei){const auto &e=w.entries[ei];const auto &ref=original.entries[ei];const auto &ctrl=source.plan.controllers[ref.controller];const auto &step=ctrl.steps[ref.step];const auto &m=source.investigation.mapping.request.models[ctrl.model];const auto &clock=t.request.clocks[e.clock];need(clock.clockDomain==ctrl.clockDomain&&e.durationPicoseconds==step.cycles*clock.periodPicoseconds,"declared domain duration");longest=std::max(longest,e.durationPicoseconds);used.insert(e.clock);++steps;instances+=step.memories.size();bits+=uint64_t(step.memories.size())*m.words*m.dataBits;}
  need(w.startPicoseconds==end&&w.durationPicoseconds==longest+t.request.policy.waveOverheadPicoseconds,"barrier max rather than sum");end+=w.durationPicoseconds;need(w.endPicoseconds==end&&end<=t.request.policy.maxDurationPicoseconds,"bounded exact cumulative time");
 }
 need(end==t.durationPicoseconds&&steps==t.timedSteps&&instances==t.timedInstances&&bits==t.timedCapacityBits,"published counts only");std::vector<size_t> unused;for(size_t i=0;i<t.request.clocks.size();++i)if(!used.contains(i))unused.push_back(i);need(unused==t.unusedClocks,"unpublished clocks remain unused");
 if(t.stop)need(t.stop->wave==t.waves.size()&&!t.complete,"stop at first unpublished wave");
 if(t.complete)need(r.source.schedule.complete&&t.waves.size()==r.source.schedule.waves.size()&&!t.stop&&t.reasons.empty(),"all stages complete");
}
}
int main()try {
 hier::model::OpenOptions o;o.tops={"schedule_top"};o.files={DFT_MEMORY_SCHEDULE_FIXTURE};auto d=hier::Design::open(o);need(d&&d.value()->diagnostics(10).errorCount==0,"actual RTL open");auto r=request();
 auto got=timeMemoryTests(*d.value(),r);need(got&&got->timeline.complete,"timing complete");verify(*got);
 need(got->timeline.durationPicoseconds==144021&&got->timeline.waves[0].durationPicoseconds==48007&&got->timeline.waves[1].durationPicoseconds==64007&&got->timeline.waves[2].durationPicoseconds==32007&&got->timeline.work==5,"hand derived three wave durations");
 auto old=scheduleMemoryTests(*d.value(),r.schedule);need(old&&json(*old)==json(got->source),"source schedule unchanged");
 for(uint64_t cap:{1ULL,48006ULL,48007ULL,112014ULL,144020ULL,144021ULL}){auto x=r;x.timing.policy.maxDurationPicoseconds=cap;auto v=timeMemoryTests(*d.value(),x);need(bool(v),"duration limited result");verify(*v);const size_t count=cap<48007?0:cap<112014?1:cap<144021?2:3;need(v->timeline.waves.size()==count&&v->timeline.complete==(count==3),"exact duration boundary");if(count!=3)need(v->timeline.stop->reason=="duration_limit"&&!v->timeline.stop->entry,"duration stop refers whole batch");}
 for(uint64_t cap:{1ULL,2ULL,3ULL,4ULL,5ULL}){auto x=r;x.timing.limits.maxWork=cap;auto v=timeMemoryTests(*d.value(),x);need(bool(v),"work result");verify(*v);need(v->timeline.work==cap&&v->timeline.waves.size()==cap/2+(cap==5?1:0)&&v->timeline.complete==(cap==5),"work exact and atomic prefix");}
 auto missing=r;missing.timing.clocks.erase(missing.timing.clocks.begin()+3);auto mr=timeMemoryTests(*d.value(),missing);need(mr&&mr->timeline.waves.size()==1&&mr->timeline.stop->reason=="clock_missing"&&mr->timeline.stop->entry==1&&mr->timeline.work==4,"missing clock second wave retains only first");verify(*mr);
 auto noClocks=r;noClocks.timing.clocks.clear();auto nc=timeMemoryTests(*d.value(),noClocks);need(nc&&nc->timeline.work==1&&nc->timeline.waves.empty()&&nc->timeline.stop->entry==0,"no clock is partial not zero time");
 auto partial=r;partial.schedule.scheduling.limits.maxWaves=1;auto pr=timeMemoryTests(*d.value(),partial);need(pr&&!pr->timeline.complete&&pr->timeline.reasons==std::vector<std::string>({"schedule_partial"})&&!pr->timeline.stop&&pr->timeline.waves.size()==1,"upstream prefix not global complete");verify(*pr);
 auto empty=r;empty.schedule.test.investigation.recursive=false;empty.schedule.test.planning.assignments.clear();auto er=timeMemoryTests(*d.value(),empty);need(er&&er->timeline.complete&&er->timeline.work==0&&er->timeline.durationPicoseconds==0,"empty complete");verify(*er);
 auto blocked=r;blocked.schedule.scheduling.policy.maxPowerMicrowatts=1;auto br=timeMemoryTests(*d.value(),blocked);need(br&&!br->timeline.complete&&br->timeline.waves.empty(),"empty blocked schedule partial");verify(*br);
 auto rule=r;rule.schedule.rules.emplace();for(const auto &a:r.schedule.test.planning.assignments)rule.schedule.rules->push_back({{"schedule_top",a.instancePath.substr(13)},false,a.clockDomain,a.partition});rule.schedule.test.planning.assignments.clear();auto rr=timeMemoryTests(*d.value(),rule);need(rr&&rr->timeline.durationPicoseconds==144021&&std::holds_alternative<MemoryTestRulePlan>(rr->source.source),"rule-based actual chain");verify(*rr);
 for(int i=0;i<14;++i){auto x=r;x.schedule.test.investigation.scope="absent";switch(i){case 0:x.timing.clocks[0].clockDomain="";break;case 1:x.timing.clocks[0].clockDomain=std::string("x\0y",3);break;case 2:x.timing.clocks[0].clockDomain="\xff";break;case 3:x.timing.clocks[0].periodPicoseconds=0;break;case 4:x.timing.clocks[0].periodPicoseconds=1000000000001ULL;break;case 5:x.timing.clocks.push_back(x.timing.clocks[0]);break;case 6:x.timing.policy.maxDurationPicoseconds=0;break;case 7:x.timing.policy.maxDurationPicoseconds=9007199254740992ULL;break;case 8:x.timing.policy.waveOverheadPicoseconds=1000000000001ULL;break;case 9:x.timing.limits.maxWork=0;break;case 10:x.timing.limits.maxMillis=60001;break;case 11:x.timing.clocks[0].clockDomain=std::string(4097,'x');break;case 12:x.schedule.test.planning.profiles.clear();break;case 13:x.timing.clocks.resize(10001);break;}auto v=timeMemoryTests(*d.value(),x);need(!v&&v.error().code==hier::ErrorCode::BadRequest,"all validation before absent scope");}
 std::stop_source stop;stop.request_stop();need(timeMemoryTests(*d.value(),{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre-cancel before validation");auto expired=detail::timeMemoryTestsWithDeadline(*d.value(),r,std::chrono::steady_clock::time_point::min());need(expired&&expired->timeline.work==0&&expired->timeline.waves.empty()&&expired->timeline.stop->reason=="budget_time","deterministic expired deadline");verify(*expired);
 // Exercise all three checked arithmetic operations using real 32-bit address ports.
 hier::model::OpenOptions ho;ho.tops={"timing_top"};ho.files={DFT_MEMORY_TIMING_FIXTURE};auto hd=hier::Design::open(ho);need(hd&&hd.value()->diagnostics(10).errorCount==0,"wide-address fixture open");MemoryTestTimingRequest h;h.schedule.test.investigation.scope="timing_top";h.schedule.test.investigation.recursive=true;h.schedule.test.investigation.mapping.models={model("timing_small",8),model("timing_large",4294967296ULL)};h.schedule.test.planning.profiles={{"timing_small",1,1},{"timing_large",1,1}};h.schedule.test.planning.assignments={{"timing_top.u_small","s",""},{"timing_top.big","b",""}};h.schedule.scheduling.policy.maxParallelControllers=1;h.timing.clocks={{"s",1000000000},{"b",4294967296ULL}};
 auto mult=timeMemoryTests(*hd.value(),h);need(mult&&mult->timeline.waves.size()==1&&mult->timeline.stop->reason=="duration_overflow"&&mult->timeline.stop->entry==0,"multiplication overflow");verify(*mult);
 h.timing.clocks[1].periodPicoseconds=4294967295ULL;auto sum=timeMemoryTests(*hd.value(),h);need(sum&&sum->timeline.waves.size()==1&&sum->timeline.stop->reason=="duration_overflow"&&!sum->timeline.stop->entry,"cumulative addition overflow");verify(*sum);
 h.timing.policy.waveOverheadPicoseconds=1000000000000ULL;auto overhead=timeMemoryTests(*hd.value(),h);need(overhead&&overhead->timeline.stop->reason=="duration_overflow"&&!overhead->timeline.stop->entry,"wave overhead addition overflow");
 h.timing.policy.waveOverheadPicoseconds=0;h.schedule.test.investigation.scope="timing_top.big";h.schedule.test.planning.assignments.erase(h.schedule.test.planning.assignments.begin());auto safe=timeMemoryTests(*hd.value(),h);need(safe&&safe->timeline.stop->reason=="duration_limit","large nonoverflow duration limited");
 // Large but JSON-safe exact value and its one-picosecond neighbour.
 auto exact=r;exact.schedule.test.investigation.scope="schedule_top.a0";exact.schedule.test.planning.assignments.resize(1);exact.timing.clocks={{"a",1000000000000ULL}};exact.timing.policy.waveOverheadPicoseconds=1;exact.timing.policy.maxDurationPicoseconds=16000000000001ULL;auto ex=timeMemoryTests(*d.value(),exact);need(ex&&ex->timeline.complete&&ex->timeline.durationPicoseconds==16000000000001ULL,"integer precision exact cap");--exact.timing.policy.maxDurationPicoseconds;auto less=timeMemoryTests(*d.value(),exact);need(less&&less->timeline.waves.empty()&&less->timeline.stop->reason=="duration_limit","one picosecond below");
 need(bool(timeMemoryTests(*d.value(),r)),"recover after failures");auto bytes=json(*got);r={};d.value().reset();need(json(*got)==bytes,"owns source and timing after Design destruction");std::cout<<checks<<" memory test timing assertions passed\n";
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
