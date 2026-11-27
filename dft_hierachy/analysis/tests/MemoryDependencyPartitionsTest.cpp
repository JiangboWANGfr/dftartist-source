#include "MemoryScheduleDependenciesInput.h"
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
    auto lib=loadMemoryLibrary(std::filesystem::path(DFT_MEMORY_DEPENDENCY_PARTITIONS_DIR)/"memory-test-schedule-library.json");need(bool(lib),"library");
    auto &t=r.schedule.test;t.investigation.scope="schedule_top";t.investigation.recursive=true;t.investigation.mapping.models=lib->models;t.planning.profiles=lib->testProfiles;
    t.planning.policy.maxMemoriesPerController=1;
    for(const auto *n:{"a0","a1","a2","a3","b0","b1","c0","d0"})t.planning.assignments.push_back({std::string("schedule_top.")+n,std::string(1,n[0]),std::string("p")+n[1]});
    r.schedule.scheduling.policy={8,1000000};for(const auto *q:{"a","b","c","d"})r.timing.clocks.push_back({q,1000});r.timing.policy.waveOverheadPicoseconds=7;return r;
}
std::vector<std::vector<size_t>> waves(const MemoryTestTimingReport &r){std::vector<std::vector<size_t>> out;for(const auto &w:r.source.schedule.waves){std::vector<size_t> row;for(const auto &e:w.entries)row.push_back(e.controller);out.push_back(std::move(row));}return out;}
std::string json(const MemoryTestTimingReport &r){hier::protocol::JsonWriter w;writeMemoryTestTiming(w,r);return w.str();}
}
int main()try {
    hier::model::OpenOptions o;o.tops={"schedule_top"};o.files={(std::filesystem::path(DFT_MEMORY_DEPENDENCY_PARTITIONS_DIR)/"memory-test-schedule.sv").string()};auto design=hier::Design::open(o);need(design&&design.value()->diagnostics(10).errorCount==0,"open");auto &d=*design.value();auto r=request();
    r.schedule.scheduling.dependencies={{"a","b",20000,{"p0"},{"p0"}}};auto got=timeMemoryTests(d,r);need(got&&got->timeline.complete,"filtered dependency");need(waves(*got)==std::vector<std::vector<size_t>>{{0,1,2,3,5,6,7},{4}},"unmatched after runs immediately");need(got->timeline.durationPicoseconds==52014&&got->timeline.dependencyWaitPicoseconds==20000&&got->timeline.work==9,"filtered gap work");
    auto blocked=r;blocked.schedule.scheduling.resources={{"rail",8,{"a"},0,1,0,{},{},{"p1"}}};auto b=timeMemoryTests(d,blocked);need(b&&!b->timeline.complete&&b->source.schedule.controllers[1].status=="blocked"&&b->source.schedule.controllers[4].status=="complete","unmatched before block not propagated");need(b->source.schedule.controllers[5].status=="complete"&&b->timeline.durationPicoseconds==52014,"unmatched after remains complete");
    blocked.schedule.scheduling.resources[0].partitions={"p0"};b=timeMemoryTests(d,blocked);need(b&&b->source.schedule.controllers[4].reason=="dependency_blocked"&&b->source.schedule.controllers[4].dependency==0&&b->source.schedule.controllers[5].status=="complete","matching before block original edge only");
    auto absent=r;absent.schedule.scheduling.dependencies[0].beforePartitions={"absent"};auto a=timeMemoryTests(d,absent);need(a&&a->source.schedule.controllers[4].reason=="dependency_unavailable"&&a->source.schedule.controllers[5].status=="complete"&&!a->timeline.dependencyWaitPicoseconds,"empty before selection unavailable");
    absent.schedule.scheduling.dependencies[0].afterPartitions={"absent"};a=timeMemoryTests(d,absent);need(a&&a->timeline.complete&&a->timeline.work==8&&a->source.schedule.work==8&&a->timeline.durationPicoseconds==16007,"unmatched after no dependency cost");
    auto empty=r;empty.schedule.scheduling.dependencies[0].beforePartitions={""};a=timeMemoryTests(d,empty);need(a&&!a->timeline.complete,"empty partition not wildcard");empty.schedule.test.planning.assignments[0].partition="";a=timeMemoryTests(d,empty);need(a&&a->timeline.complete,"empty partition exact match");
    auto late=r;late.schedule.scheduling.policy.maxParallelControllers=1;late.schedule.scheduling.dependencies[0].minimumGapPicoseconds=60000;auto l=timeMemoryTests(d,late);need(l&&l->timeline.durationPicoseconds==140035&&l->timeline.dependencyWaitPicoseconds==11979,"unmatched later predecessor does not refresh gap");need(l->timeline.waves[4].startPicoseconds==76007&&l->timeline.work==9,"matching before barrier and work");
    auto multi=request();multi.schedule.scheduling.dependencies={{"a","b",1000,{"p0"},{"p0"}},{"a","b",2000,{"p1"},{"p1"}}};auto m=timeMemoryTests(d,multi);need(m&&m->timeline.complete&&waves(*m)==std::vector<std::vector<size_t>>{{0,1,2,3,6,7},{4,5}},"same domain pair distinct selections");need(m->source.schedule.work==14&&m->timeline.work==10&&m->timeline.durationPicoseconds==34014,"multi edge exact work");need(m->timeline.waves[1].dependencyWait->dependencies==std::vector<size_t>{0,1},"all waiting original indices");
    for(uint64_t cap=1;cap<=14;++cap){auto q=multi;q.schedule.scheduling.limits.maxWork=cap;auto x=timeMemoryTests(d,q);need(x&&x->source.schedule.work==cap&&x->source.schedule.waves.size()==(cap<10?0:cap<14?1:2),"schedule atomic work prefix");need(x->source.schedule.controllers[4].status==(cap==14?"complete":"pending"),"discarded candidate cannot advance before state");}
    for(uint64_t cap=1;cap<=10;++cap){auto q=multi;q.timing.limits.maxWork=cap;auto x=timeMemoryTests(d,q);need(x&&x->timeline.work==cap&&x->timeline.waves.size()==(cap<6?0:cap<10?1:2),"timer atomic work prefix");need(x->timeline.dependencyWaitPicoseconds==(cap==10?2000:0),"discarded wait not published");}
    auto mixed=multi;mixed.schedule.scheduling.resources={{"all",8,{"a","b","c","d"},5000,0,0,{},{{21007,30000}}}};auto x=timeMemoryTests(d,mixed);need(x&&x->timeline.durationPicoseconds==46007&&x->timeline.resourceWaitPicoseconds==5000&&!x->timeline.dependencyWaitPicoseconds&&x->timeline.availabilityWaitPicoseconds==8993,"recovery and calendar absorb dependency wait");
    auto usage=inspectMemoryResourceUsage(d,{mixed,{}});need(usage&&usage->usage.rows[0].occupiedPicoseconds==32014,"usage excludes all waits");auto coverage=inspectMemoryTestCoverage(d,mixed);need(coverage&&coverage->coverage.complete&&coverage->coverage.timedInstances==8,"coverage consumes actual timing");
    mixed.timing.policy.maxDurationPicoseconds=46006;x=timeMemoryTests(d,mixed);need(x&&!x->timeline.complete&&x->timeline.waves.size()==1&&!x->timeline.resourceWaitPicoseconds&&!x->timeline.dependencyWaitPicoseconds&&!x->timeline.availabilityWaitPicoseconds,"duration limit discards every pending wait");
    auto zero=request();zero.schedule.scheduling.dependencies={{"a","b"}};auto z=timeMemoryTests(d,zero);need(z&&json(*z).find("Partitions")==std::string::npos,"empty selectors omitted");
    for(int i=0;i<8;++i){auto q=r;q.schedule.test.investigation.scope="missing";auto &e=q.schedule.scheduling.dependencies[0];switch(i){case 0:e.beforePartitions={"p0","p0"};break;case 1:e.afterPartitions={std::string(4097,'a')};break;case 2:e.beforePartitions={std::string("a\0b",3)};break;case 3:e.afterPartitions={std::string(1,static_cast<char>(0xff))};break;case 4:e.beforePartitions.resize(1025);break;case 5:q.schedule.scheduling.dependencies.push_back(e);break;case 6:e.after=e.before;break;case 7:q.schedule.scheduling.dependencies.push_back({"b","a",0,{"unmatched"},{"unmatched"}});break;}auto bad=timeMemoryTests(d,q);need(!bad&&bad.error().code==hier::ErrorCode::BadRequest,"validate before query even unmatched");}
    auto repeat=multi;repeat.schedule.scheduling.dependencies={{"a","b",0,{"p0","p1"},{"p1","p0"}},{"a","b",42,{"p1","p0"},{"p0","p1"}}};need(timeMemoryTests(d,repeat).error().code==hier::ErrorCode::BadRequest,"duplicate unordered sets ignores gap");
    std::stop_source stop;stop.request_stop();need(timeMemoryTests(d,repeat,stop.get_token()).error().code==hier::ErrorCode::Cancelled,"cancel first");auto expired=detail::scheduleMemoryTestsWithDeadline(d,r.schedule,std::chrono::steady_clock::time_point::min());need(expired&&!expired->schedule.complete&&expired->schedule.waves.empty()&&!expired->schedule.work,"expired index not executed");auto timed=detail::timeMemoryTestsWithDeadline(d,r,std::chrono::steady_clock::time_point::min());need(timed&&!timed->timeline.complete&&!timed->timeline.work&&timed->timeline.waves.empty(),"expired timer index not executed");
    auto parsed=parseMemoryScheduleDependencies(R"({"formatVersion":1,"kind":"memory-schedule-dependencies","dependencies":[{"before":"a","after":"b","beforePartitions":[""],"afterPartitions":["分区"]}]})");need(parsed&&parsed->at(0).beforePartitions==std::vector<std::string>{""}&&parsed->at(0).afterPartitions==std::vector<std::string>{"分区"},"owned strict selection parser");
    std::vector<std::string> names;for(size_t i=0;i<1024;++i){auto name=std::to_string(i);name.resize(4095,'x');names.push_back(std::move(name));}
    std::vector<MemoryScheduleDependency> large={{"a","b",0,names,names},{"c","d",0,names,names}};
    detail::validateMemoryScheduleDependencies(large);need(true,"4096 selectors within total bytes");
    for(auto &e:large){for(auto &n:e.beforePartitions)n.push_back('x');for(auto &n:e.afterPartitions)n.push_back('x');}
    bool rejected=false;try{detail::validateMemoryScheduleDependencies(large);}catch(const hier::Error &e){rejected=e.code==hier::ErrorCode::BadRequest;}need(rejected,"selector bytes share original 16 MiB limit");
    auto saved=json(*got);r={};design.value().reset();need(json(*got)==saved,"result owns selectors and timing after input release");std::cout<<checks<<" dependency partition assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
