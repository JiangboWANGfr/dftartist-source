#include "MemoryTestConfigInput.h"
#include "MemoryScheduleDependenciesInternal.h"
#include "MemoryTestTimingInternal.h"
#include "MemoryTestScheduleInternal.h"
#include "MemoryTestTimingJson.h"
#include "MemoryTestCoverage.h"
#include "MemoryResourceUsage.h"
#include "MemoryLibraryInput.h"
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::memory;
size_t checks=0;
void need(bool value,const char *why){++checks;if(!value)throw std::runtime_error(why);}
MemoryTestTimingRequest request() {
    MemoryTestTimingRequest r;
    auto lib=loadMemoryLibrary(std::filesystem::path(DFT_MEMORY_CLOCK_PARTITIONS_DIR)/"memory-test-schedule-library.json");need(bool(lib),"library");
    auto &t=r.schedule.test;t.investigation.scope="schedule_top";t.investigation.recursive=true;t.investigation.mapping.models=lib->models;t.planning.profiles=lib->testProfiles;
    t.planning.policy.maxMemoriesPerController=1;
    for(const auto *n:{"a0","a1","a2","a3","b0","b1","c0","d0"})t.planning.assignments.push_back({std::string("schedule_top.")+n,std::string(1,n[0]),std::string("p")+n[1]});
    r.schedule.scheduling.policy={8,1000000};for(const auto *q:{"a","b","c","d"})r.timing.clocks.push_back({q,1000});r.timing.policy.waveOverheadPicoseconds=7;return r;
}
std::string json(const MemoryTestTimingReport &r){hier::protocol::JsonWriter w;writeMemoryTestTiming(w,r);return w.str();}
}
int main()try {
    hier::model::OpenOptions o;o.tops={"schedule_top"};o.files={(std::filesystem::path(DFT_MEMORY_CLOCK_PARTITIONS_DIR)/"memory-test-schedule.sv").string()};auto design=hier::Design::open(o);need(design&&design.value()->diagnostics(10).errorCount==0,"open");auto &d=*design.value();auto r=request();
    auto old=timeMemoryTests(d,r);need(old&&old->timeline.complete&&old->timeline.durationPicoseconds==16007&&old->timeline.work==8,"domain defaults");need(json(*old).find("partitions")==std::string::npos,"default omitted");
    r.timing.clocks.push_back({"a",2000,{"p0"}});auto got=timeMemoryTests(d,r);need(got&&got->timeline.complete&&got->timeline.durationPicoseconds==32007&&got->timeline.work==8,"partition period");need(got->timeline.waves[0].entries[0].clock==4&&got->timeline.waves[0].entries[1].clock==0&&got->timeline.unusedClocks.empty(),"exact and fallback original index");
    auto reversed=r;std::swap(reversed.timing.clocks[0],reversed.timing.clocks[4]);auto rev=timeMemoryTests(d,reversed);need(rev&&rev->timeline.durationPicoseconds==32007&&rev->timeline.waves[0].entries[0].clock==0&&rev->timeline.waves[0].entries[1].clock==4,"fallback order independent");
    auto multi=r;multi.timing.clocks.push_back({"a",3000,{"p1","p2"}});multi.timing.clocks.push_back({"b",4000,{"p0"}});auto m=timeMemoryTests(d,multi);need(m&&m->timeline.durationPicoseconds==64007&&m->timeline.waves[0].entries[1].clock==5&&m->timeline.waves[0].entries[4].clock==6,"disjoint multiple partition sets and repeated names across domains");
    auto shadow=r;shadow.timing.clocks[4].partitions={"p0","p1","p2","p3"};auto sh=timeMemoryTests(d,shadow);need(sh&&sh->timeline.unusedClocks==std::vector<size_t>{0},"shadowed fallback unused");
    auto missing=r;missing.timing.clocks.erase(missing.timing.clocks.begin());auto miss=timeMemoryTests(d,missing);need(miss&&!miss->timeline.complete&&miss->timeline.stop->reason=="clock_missing"&&miss->timeline.stop->entry==1&&miss->timeline.work==2,"missing selector no fallback");need(miss->timeline.waves.empty()&&!miss->timeline.timedSteps&&!miss->timeline.durationPicoseconds&&miss->timeline.unusedClocks==std::vector<size_t>{0,1,2,3},"missing whole wave atomically discarded");
    auto exact=r;exact.timing.clocks[4].partitions={""};auto e=timeMemoryTests(d,exact);need(e&&e->timeline.durationPicoseconds==16007&&e->timeline.unusedClocks==std::vector<size_t>{4},"empty string is not wildcard");exact.schedule.test.planning.assignments[0].partition="";e=timeMemoryTests(d,exact);need(e&&e->timeline.durationPicoseconds==32007,"empty partition exact match");
    for(uint64_t cap=1;cap<=8;++cap){auto q=r;q.timing.limits.maxWork=cap;auto x=timeMemoryTests(d,q);need(x&&x->timeline.work==cap&&x->timeline.waves.size()==(cap==8?1:0),"work whole wave");need(x->timeline.unusedClocks.size()==(cap==8?0:5),"unused clocks reflect only committed waves");}
    auto prefix=r;prefix.schedule.scheduling.policy.maxParallelControllers=4;prefix.timing.limits.maxWork=7;auto p=timeMemoryTests(d,prefix);need(p&&p->timeline.waves.size()==1&&p->timeline.durationPicoseconds==32007&&p->timeline.unusedClocks==std::vector<size_t>{1,2,3},"later work truncation keeps exact prefix");
    prefix.timing.limits.maxWork=8;prefix.timing.policy.maxDurationPicoseconds=48013;p=timeMemoryTests(d,prefix);need(p&&p->timeline.stop->reason=="duration_limit"&&p->timeline.waves.size()==1&&p->timeline.durationPicoseconds==32007,"duration prefix");prefix.timing.policy.maxDurationPicoseconds=48014;p=timeMemoryTests(d,prefix);need(p&&p->timeline.complete&&p->timeline.durationPicoseconds==48014,"exact duration cap");
    auto mixed=r;mixed.schedule.scheduling.dependencies={{"a","b",20000,{"p0"},{"p0"}}};mixed.schedule.scheduling.resources={{"all",8,{"a","b","c","d"},5000,0,0,{},{{52007,60000}}}};auto x=timeMemoryTests(d,mixed);need(x&&x->timeline.durationPicoseconds==76007&&x->timeline.resourceWaitPicoseconds==5000&&x->timeline.dependencyWaitPicoseconds==15000&&x->timeline.availabilityWaitPicoseconds==7993,"selected cycle duration feeds waits and calendar");
    auto usage=inspectMemoryResourceUsage(d,{mixed,{}});need(usage&&usage->usage.rows[0].occupiedPicoseconds==48014,"usage counts changed duration not waits");auto coverage=inspectMemoryTestCoverage(d,mixed);need(coverage&&coverage->coverage.complete&&coverage->coverage.timedInstances==8,"coverage consumes same timing");
    mixed.timing.policy.maxDurationPicoseconds=76006;x=timeMemoryTests(d,mixed);need(x&&x->timeline.waves.size()==1&&!x->timeline.resourceWaitPicoseconds&&!x->timeline.dependencyWaitPicoseconds&&!x->timeline.availabilityWaitPicoseconds&&x->timeline.unusedClocks==std::vector<size_t>{},"calendar candidate discarded without wait state");
    for(int i=0;i<10;++i){auto q=r;q.schedule.test.investigation.scope="missing";auto &clock=q.timing.clocks[4];switch(i){case 0:clock.partitions={"p0","p0"};break;case 1:clock.partitions={std::string(4097,'a')};break;case 2:clock.partitions={std::string("a\0b",3)};break;case 3:clock.partitions={std::string(1,static_cast<char>(0xff))};break;case 4:clock.partitions.resize(1025);break;case 5:q.timing.clocks.push_back({"a",2000,{"p0"}});break;case 6:clock.partitions.clear();break;case 7:clock.periodPicoseconds=0;break;case 8:clock.periodPicoseconds=1000000000001ULL;break;case 9:clock.clockDomain.clear();break;}auto bad=timeMemoryTests(d,q);need(!bad&&bad.error().code==hier::ErrorCode::BadRequest,"all declarations validate before query");}
    auto invalid=r;invalid.timing.clocks.push_back({"a",2000,{"p0"}});std::stop_source stop;stop.request_stop();need(timeMemoryTests(d,invalid,stop.get_token()).error().code==hier::ErrorCode::Cancelled,"cancel before invalid request");auto timed=detail::timeMemoryTestsWithDeadline(d,r,std::chrono::steady_clock::time_point::min());need(timed&&!timed->timeline.complete&&!timed->timeline.work&&timed->timeline.waves.empty()&&timed->timeline.unusedClocks.size()==5,"expired index not executed");
    auto parsed=parseMemoryTestConfig(R"({"formatVersion":1,"kind":"memory-test-config","assignments":[],"timing":{"clocks":[{"clockDomain":"a","periodPicoseconds":12,"partitions":["","分区"]}]}})",r.schedule.test.investigation,r.schedule.test.planning.profiles);need(parsed&&parsed->timing.clocks[0].partitions==std::vector<std::string>{"","分区"},"owned parser");
    auto large=request();large.timing.clocks.clear();for(size_t i=0;i<4;++i){MemoryTestClock clock{std::to_string(i),1};for(size_t j=0;j<1024;++j){auto name=std::to_string(j);name.resize(4095,'x');clock.partitions.push_back(std::move(name));}large.timing.clocks.push_back(std::move(clock));}detail::validateMemoryTestTimingRequest(large);need(true,"4096 selectors within byte limit");
    auto tooMany=large;tooMany.timing.clocks.push_back({"extra",1,{"x"}});bool rejected=false;try{detail::validateMemoryTestTimingRequest(tooMany);}catch(const hier::Error &err){rejected=err.code==hier::ErrorCode::BadRequest;}need(rejected,"global selector count");
    for(auto &clock:large.timing.clocks)for(auto &name:clock.partitions)name.push_back('x');rejected=false;try{detail::validateMemoryTestTimingRequest(large);}catch(const hier::Error &err){rejected=err.code==hier::ErrorCode::BadRequest;}need(rejected,"names share 16MiB budget");
    auto saved=json(*got);r={};design.value().reset();need(json(*got)==saved,"owns declarations after request and Design destruction");std::cout<<checks<<" clock partition assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
