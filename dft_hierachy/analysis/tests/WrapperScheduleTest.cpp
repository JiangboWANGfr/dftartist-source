#include "ChainActivityScheduleInternal.h"
#include "ChainActivityScheduleJson.h"
#include "ChainActivityPlanJson.h"
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::wrapper;size_t checks=0;constexpr uint64_t Safe=9007199254740991ULL;
void need(bool b,const char *s){++checks;if(!b)throw std::runtime_error(s);}
template<class T>T take(hier::Result<T> r){if(!r)throw std::runtime_error(r.error().message);return std::move(r.value());}
auto design(){hier::model::OpenOptions o;o.tops={"schedule_top"};o.files={DFT_WRAPPER_SCHEDULE_FIXTURE};auto d=take(hier::Design::open(o));need(!d->diagnostics(100).errorCount,"valid fixture");return d;}
ChainActivityScheduleRequest request(std::vector<std::string> ports={"a","b","n","i","p","f"}){
 ChainActivityScheduleRequest r;auto &p=r.activity.resets.clock.chains;p.cells.boundary.scope="schedule_top";p.cells.boundary.ports=ports;
 for(const auto &port:ports){p.chains.push_back({port,100});p.assignments.push_back({port,CellDirection::Output,{},port});}p.chains.push_back({"unused",100});r.pulse={2,3,5,4};return r;
}
std::string wire(const ChainActivityScheduleReport &r){hier::protocol::JsonWriter w;writeChainActivitySchedule(w,r);return w.str();}
std::string wire(const ChainActivityPlanReport &r){hier::protocol::JsonWriter w;writeChainActivityPlan(w,r);return w.str();}
void audit(const ChainActivityScheduleReport &x){const auto &s=x.schedule;uint64_t elapsed=0,bits=0,chains=0;
 need(s.rows.size()<=s.limits.maxRows&&s.work<=s.limits.maxWork&&s.counts.elapsedTicks<=s.limits.maxTicks,"limits");
 for(size_t j=0;j<s.rows.size();++j){const auto &r=s.rows[j];const auto &b=x.source.activity.batches[j];need(r.batch==j&&r.start==elapsed&&r.end-r.start==s.batchTicks,"consecutive rows");need(r.clockGroup==b.clockGroup&&r.idleHigh!=r.activeHigh,"clock identity");
  need(r.firstEdge==r.start+s.pulse.setupTicks&&r.lastEdge==r.firstEdge+(s.pulse.pulses-1)*s.periodTicks&&r.lastReturn==r.lastEdge+r.activeTicks,"pulse times");need(r.end-r.lastReturn==r.idleTicks&&r.activeTicks+r.idleTicks==s.periodTicks,"return idle");
  need(r.holds.size()==b.holds.size(),"all holds");for(size_t k=0;k<r.holds.size();++k)need(r.holds[k].input==b.holds[k].input&&r.holds[k].high==b.holds[k].high,"hold level false retained");
  bits+=b.sharedBits;chains+=b.chains.size();elapsed=r.end;}
 need(s.counts.batches==s.rows.size()&&s.counts.sharedBits==bits&&s.counts.chains==chains&&s.counts.elapsedTicks==elapsed,"atomic counts");
 if(!x.source.activity.complete)need(!s.complete,"source partial");if(s.stop)need(s.stop->batch==s.rows.size(),"next batch");
}
}
int main()try{
 auto d=design();auto r=request();auto full=take(scheduleWrapperChainActivity(*d,r));audit(full);need(full.schedule.complete&&full.schedule.rows.size()==3&&full.schedule.counts.elapsedTicks==102&&full.schedule.counts.chains==6,"full schedule");
 const auto &a=full.schedule.rows[0];const auto &n=full.schedule.rows[1];const auto &p=full.schedule.rows[2];
 need(a.firstEdge==2&&a.lastEdge==26&&a.lastReturn==29&&!a.idleHigh&&a.activeTicks==3,"positive pulse");
 need(n.start==34&&n.firstEdge==36&&n.lastEdge==60&&n.lastReturn==65&&n.idleHigh&&n.activeTicks==5,"negative effective edge including inversion");need(!p.holds[0].high&&a.holds[0].high,"both inactive levels serialized");
 need(wire(full.source)==wire(take(planWrapperChainActivity(*d,r.activity))),"whole original source equality");
 for(uint64_t limit=1;limit<=full.schedule.work;++limit){r.limits.maxWork=limit;auto x=take(scheduleWrapperChainActivity(*d,r));audit(x);need(x.schedule.complete==(limit==full.schedule.work),"work boundary");for(size_t j=0;j<x.schedule.rows.size();++j)need(x.schedule.rows[j].end==full.schedule.rows[j].end,"no speculative time");}
 r=request();for(uint64_t ticks:{1ULL,33ULL,34ULL,35ULL,67ULL,68ULL,101ULL,102ULL}){r.limits.maxTicks=ticks;auto x=take(scheduleWrapperChainActivity(*d,r));audit(x);need(x.schedule.rows.size()==ticks/34&&x.schedule.complete==(ticks>=102),"tick capacity exact");}
 r=request();for(uint64_t rows:{1ULL,2ULL,3ULL}){r.limits.maxRows=rows;auto x=take(scheduleWrapperChainActivity(*d,r));audit(x);need(x.schedule.rows.size()==rows&&x.schedule.complete==(rows==3),"row capacity");}
 r=request();r.limits.maxRows=1;r.limits.maxTicks=34;r.limits.maxWork=1;auto work=take(scheduleWrapperChainActivity(*d,r));need(work.schedule.stop->reason=="budget_work","work priority after capacity");r.limits.maxTicks=1;need(take(scheduleWrapperChainActivity(*d,r)).schedule.stop->reason=="budget_ticks","ticks before work");
 r=request();r.limits.maxRows=1;r.limits.maxTicks=34;need(take(scheduleWrapperChainActivity(*d,r)).schedule.stop->reason=="budget_rows","rows before ticks");
 r=request({"a","g"});auto partial=take(scheduleWrapperChainActivity(*d,r));audit(partial);need(!partial.schedule.complete&&partial.schedule.rows.size()==1,"local known with global partial");r.activity.limits.maxWork=1;auto stopped=take(scheduleWrapperChainActivity(*d,r));audit(stopped);need(stopped.schedule.rows.empty()&&!stopped.schedule.complete,"no pending batch invented");
 r=request({"a"});r.activity.resets.clock.chains.cells.rules={{"a",CellDirection::Output,CellAction::Dedicated,{}}};auto dedicated=take(scheduleWrapperChainActivity(*d,r));audit(dedicated);need(!dedicated.schedule.complete&&dedicated.schedule.rows.empty(),"dedicated unknown");r.activity.resets.clock.chains.cells.rules[0].action=CellAction::Exclude;auto empty=take(scheduleWrapperChainActivity(*d,r));audit(empty);need(empty.schedule.complete&&empty.schedule.counts.elapsedTicks==0,"empty complete");
 r=request({"a"});r.pulse={1,1,1,(Safe-1)/2};auto large=take(scheduleWrapperChainActivity(*d,r));audit(large);need(large.schedule.complete&&large.schedule.counts.elapsedTicks==Safe,"largest safe duration compressed");r=request({"a","n"});r.pulse={1,1,1,(Safe-1)/2};auto sum=take(scheduleWrapperChainActivity(*d,r));audit(sum);need(sum.schedule.rows.size()==1&&sum.schedule.stop->reason=="budget_ticks","cumulative safe guard");
 r=request({"a"});r.pulse.setupTicks=0;r.pulse.pulses=1;auto zero=take(scheduleWrapperChainActivity(*d,r));audit(zero);need(zero.schedule.rows[0].firstEdge==0,"zero setup");
 for(int j=0;j<17;++j){r=request();switch(j){case 0:r.pulse.setupTicks=Safe+1;break;case 1:r.pulse.highTicks=0;break;case 2:r.pulse.lowTicks=0;break;case 3:r.pulse.pulses=0;break;case 4:r.pulse.highTicks=Safe;break;case 5:r.pulse.pulses=Safe;break;case 6:r.pulse.setupTicks=Safe;break;case 7:r.pulse.lowTicks=Safe+1;break;case 8:r.pulse.pulses=UINT64_MAX;break;case 9:r.limits.maxRows=0;break;case 10:r.limits.maxRows=1025;break;case 11:r.limits.maxTicks=0;break;case 12:r.limits.maxTicks=Safe+1;break;case 13:r.limits.maxWork=0;break;case 14:r.limits.maxWork=10000001;break;case 15:r.limits.maxMillis=0;break;default:r.limits.maxMillis=60001;break;}r.activity.resets.clock.chains.cells.boundary.scope="missing";need(scheduleWrapperChainActivity(*d,r).error().code==hier::ErrorCode::BadRequest,"static invalid before lookup");}
 r=request();auto expired=take(detail::scheduleWrapperChainActivityWithDeadline(*d,r,std::chrono::steady_clock::time_point::min()));audit(expired);need(expired.schedule.work==0&&expired.schedule.rows.empty()&&expired.schedule.stop->reason=="budget_time","deterministic deadline");
 std::stop_source stop;stop.request_stop();need(scheduleWrapperChainActivity(*d,{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre cancel");const auto saved=wire(full);d.reset();r={};need(wire(full)==saved,"owned report");std::cout<<checks<<" wrapper schedule assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
