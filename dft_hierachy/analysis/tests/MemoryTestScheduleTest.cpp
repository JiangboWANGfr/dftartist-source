#include "MemoryTestScheduleInternal.h"
#include "MemoryTestScheduleJson.h"
#include "MemoryTestPlanJson.h"
#include <iostream>
#include <stdexcept>
#include <set>
namespace {
using namespace dft::memory;size_t checks=0;
void need(bool b,const char *why){++checks;if(!b)throw std::runtime_error(why);}
MemoryTestScheduleRequest request(){MemoryTestScheduleRequest r;auto &i=r.test.investigation;i.scope="schedule_top";i.recursive=true;
 i.mapping.models={{"schedule_ram",8,8,1,{{MemoryRole::Clock,"CLK",PinSense::Posedge},{MemoryRole::Address,"A",PinSense::None},{MemoryRole::DataIn,"D",PinSense::None},{MemoryRole::DataOut,"Q",PinSense::None}}}};
 r.test.planning.profiles={{"schedule_ram",2,100000}};r.test.planning.policy.maxParallelMemories=2;
 for(const auto *name:{"a0","a1","a2","a3","b0","b1","c0","d0"})r.test.planning.assignments.push_back({std::string("schedule_top.")+name,std::string(1,name[0]),""});
 r.scheduling.policy={2,300000};return r;}
std::string json(const MemoryTestReport &r){hier::protocol::JsonWriter w(true);writeMemoryTestPlan(w,r);return w.str();}
std::string json(const MemoryTestScheduleReport &r){hier::protocol::JsonWriter w(true);writeMemoryTestSchedule(w,r);return w.str();}
const MemoryTestReport &source(const MemoryTestScheduleReport &r){const auto *p=std::get_if<MemoryTestReport>(&r.source);return p?*p:std::get<MemoryTestRulePlan>(r.source).report;}
void verify(const MemoryTestScheduleReport &r){const auto &p=source(r).plan;const auto &s=r.schedule;std::vector<size_t> next(p.controllers.size());uint64_t steps=0,memories=0,bits=0;
 for(const auto &w:s.waves){need(!w.entries.empty()&&w.entries.size()<=s.request.policy.maxParallelControllers,"nonempty bounded wave");std::set<size_t> used;uint64_t power=0;
  for(const auto &e:w.entries){need(used.insert(e.controller).second&&e.step==next[e.controller]++,"one ready step per controller");const auto &ctrl=p.controllers[e.controller];const auto &st=ctrl.steps[e.step];const auto &model=source(r).investigation.mapping.request.models[ctrl.model];power+=st.powerMicrowatts;memories+=st.memories.size();bits+=uint64_t(st.memories.size())*model.words*model.dataBits;++steps;}
  need(power==w.powerMicrowatts&&power<=s.request.policy.maxPowerMicrowatts,"aggregate power cap");}
 need(steps==s.scheduledSteps&&memories==s.scheduledInstances&&bits==s.scheduledCapacityBits,"only published members counted");
 for(size_t i=0;i<next.size();++i)need(next[i]==s.controllers[i].nextStep&&((next[i]==p.controllers[i].steps.size())==(s.controllers[i].status=="complete")),"progress matches published source steps");}
}
int main()try {
 hier::model::OpenOptions o;o.tops={"schedule_top"};o.files={DFT_MEMORY_SCHEDULE_FIXTURE};auto d=hier::Design::open(o);need(d&&d.value()->diagnostics(10).errorCount==0,"open actual schedule fixture");auto r=request();auto got=scheduleMemoryTests(*d.value(),r);need(got&&got->schedule.complete,"complete schedule");verify(*got);const auto &s=got->schedule;
 need(s.waves.size()==3&&s.work==7&&s.scheduledSteps==5&&s.scheduledInstances==8&&s.scheduledCapacityBits==512,"hand calculated three waves");
 need(s.waves[0].entries[0].controller==0&&s.waves[0].entries[1].controller==2&&s.waves[1].entries[0].controller==0&&s.waves[1].entries[0].step==1&&s.waves[1].entries[1].controller==3&&s.waves[2].entries[0].controller==1,"stable deferred ready order");
 auto plain=planMemoryTests(*d.value(),r.test);need(plain&&json(*plain)==json(source(*got)),"original source is unchanged");
 auto rules=r;rules.rules.emplace();for(const auto &a:r.test.planning.assignments){rules.rules->push_back({{"schedule_top",a.instancePath.substr(13)},false,a.clockDomain,a.partition});}rules.test.planning.assignments.clear();auto byRule=scheduleMemoryTests(*d.value(),rules);need(byRule&&byRule->schedule.complete&&std::holds_alternative<MemoryTestRulePlan>(byRule->source)&&json(source(*byRule))==json(source(*got)),"rules compose original source");verify(*byRule);
 auto serial=r;serial.scheduling.policy.maxParallelControllers=1;auto sr=scheduleMemoryTests(*d.value(),serial);need(sr&&sr->schedule.waves.size()==5&&sr->schedule.work==5,"parallel limit yields serial steps");verify(*sr);
 auto blocked=r;blocked.scheduling.policy.maxPowerMicrowatts=199999;auto br=scheduleMemoryTests(*d.value(),blocked);need(br&&!br->schedule.complete&&br->schedule.scheduledInstances==2&&br->schedule.controllers[0].status=="blocked"&&br->schedule.controllers[1].status=="blocked"&&br->schedule.waves.size()==2,"oversized local steps block only their controllers");verify(*br);
 auto none=r;none.scheduling.policy.maxPowerMicrowatts=1;auto nr=scheduleMemoryTests(*d.value(),none);need(nr&&nr->schedule.waves.empty()&&nr->schedule.work==4&&!nr->schedule.complete,"all blocked without empty wave");verify(*nr);
 for(uint64_t cap:{2ULL,3ULL,7ULL}){auto limited=r;limited.scheduling.limits.maxWork=cap;auto lr=scheduleMemoryTests(*d.value(),limited);need(bool(lr),"bounded schedule result");verify(*lr);need(lr->schedule.work==cap&&lr->schedule.waves.size()==(cap==2?0:cap==3?1:3)&&lr->schedule.complete==(cap==7),"atomic candidate discard and exact work cap");}
 for(uint64_t cap:{1ULL,3ULL}){auto limited=r;limited.scheduling.limits.maxWaves=cap;auto lr=scheduleMemoryTests(*d.value(),limited);need(lr&&lr->schedule.waves.size()==cap&&lr->schedule.complete==(cap==3),"wave budget exact boundary");verify(*lr);}
 auto atomic=blocked;atomic.scheduling.limits.maxWork=2;auto ar=scheduleMemoryTests(*d.value(),atomic);need(ar&&ar->schedule.controllers[0].status=="pending"&&ar->schedule.controllers[1].status=="pending"&&ar->schedule.reasons==std::vector<std::string>({"budget_work"}),"uncommitted blocking decisions discarded");
 auto upstream=r;upstream.test.planning.limits.maxWork=2;auto ur=scheduleMemoryTests(*d.value(),upstream);need(ur&&!ur->schedule.complete&&ur->schedule.reasons.front()=="plan_partial"&&ur->schedule.scheduledInstances==2,"upstream prefix remains conditional");verify(*ur);
 auto empty=r;empty.test.investigation.recursive=false;empty.test.planning.assignments.clear();auto er=scheduleMemoryTests(*d.value(),empty);need(er&&er->schedule.complete&&er->schedule.waves.empty()&&er->schedule.work==0,"empty complete plan");
 auto missing=r;missing.test.planning.assignments.clear();auto mr=scheduleMemoryTests(*d.value(),missing);need(mr&&!mr->schedule.complete&&mr->schedule.controllers.empty()&&mr->schedule.reasons==std::vector<std::string>({"plan_partial"}),"zero controllers does not erase upstream blocked rows");
 for(int k=0;k<10;++k){auto bad=r;bad.test.investigation.scope="absent";switch(k){case 0:bad.scheduling.policy.maxPowerMicrowatts=0;break;case 1:bad.scheduling.policy.maxParallelControllers=1025;break;case 2:bad.scheduling.limits.maxWaves=0;break;case 3:bad.scheduling.limits.maxWork=10000001;break;case 4:bad.scheduling.limits.maxMillis=60001;break;case 5:bad.rules.emplace();break;case 6:bad.test.planning.profiles.clear();break;case 7:bad.scheduling.policy.maxPowerMicrowatts=1000000000001ULL;break;case 8:bad.scheduling.policy.maxParallelControllers=0;break;case 9:bad.scheduling.limits.maxWaves=10001;break;}auto v=scheduleMemoryTests(*d.value(),bad);need(!v&&v.error().code==hier::ErrorCode::BadRequest,"full validation before lookup");}
 std::stop_source stop;stop.request_stop();need(scheduleMemoryTests(*d.value(),{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre-cancel before validation");auto expired=detail::scheduleMemoryTestsWithDeadline(*d.value(),r,std::chrono::steady_clock::time_point::min());need(expired&&!expired->schedule.complete&&expired->schedule.work==0&&expired->schedule.waves.empty()&&expired->schedule.reasons==std::vector<std::string>({"budget_time"}),"deterministic expired scheduling deadline");
 need(bool(scheduleMemoryTests(*d.value(),r)),"failed requests preserve design");auto bytes=json(*got);r={};d.value().reset();need(json(*got)==bytes,"owned source and schedule");std::cout<<checks<<" memory test schedule assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
