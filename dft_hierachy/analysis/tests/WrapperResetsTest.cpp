#include "ChainResetsInternal.h"
#include "ChainResetsJson.h"
#include "ChainClocksJson.h"
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::wrapper;size_t checks=0;
void need(bool b,const char *m){++checks;if(!b)throw std::runtime_error(m);}
template<class T>T take(hier::Result<T> r){if(!r)throw std::runtime_error(r.error().message);return std::move(r.value());}
ChainResetRequest request(std::vector<std::string> ports={"qn","alias_n"},std::string top="reset_top") {
 ChainResetRequest r;r.clock.chains.cells.boundary.scope=std::move(top);r.clock.chains.cells.boundary.ports=std::move(ports);r.clock.chains.chains={{"scan",100}};r.clock.chains.defaultChain="scan";return r;
}
auto design(const std::string &top){hier::model::OpenOptions o;o.tops={top};o.files={DFT_WRAPPER_RESETS_FIXTURE};auto d=take(hier::Design::open(o));need(d->diagnostics(100).errorCount==0,"RTL open");return d;}
std::string wire(const ChainResetReport &r){hier::protocol::JsonWriter w;writeChainResets(w,r);return w.str();}
std::string wire(const ChainClockReport &r){hier::protocol::JsonWriter w;writeChainClocks(w,r);return w.str();}
void audit(const ChainResetReport &x) {
 const auto &r=x.resets;const auto &clock=x.source.clocks;uint64_t events=0;
 for(const auto &row:r.rows){events+=row.events.size();if(row.sourceRow){const auto &src=clock.rows[*row.sourceRow];need(src.chain==row.chain&&src.segment==row.segment,"source clock row link");
   for(const auto &e:row.events){const auto &m=src.matches.at(e.match);const auto &fact=clock.pages.at(m.page).response.result.items.at(m.fact);const auto &event=fact.async.at(e.event);const auto &c=r.checks.at(e.check);need(c.event.signal==event.signal&&c.event.edge==event.edge&&c.event.type==event.type,"raw async witness");}}
  else need(row.status=="pending"&&row.events.empty()&&row.holds.empty()&&!row.complete,"pending no inferred control");
  for(const auto &h:row.holds)need(h.input<r.inputs.size()&&(h.low||h.high),"nonempty hold");
 }
 need(events<=r.events&&r.events<=r.limits.maxEvents&&r.work<=r.limits.maxWork,"observed counters may include discarded row");
 for(const auto &s:r.chains){uint64_t n=0,bits=0;bool complete=true;for(const auto &row:r.rows)if(row.chain==s.chain){++n;bits+=x.source.source.layout.chains[s.chain].segments[row.segment].length;complete=complete&&row.complete;}
  need(s.processedSegments==n&&bits==s.clearBits+s.holdBits+s.conflictBits+s.assertedBits+s.unresolvedBits+s.pendingBits+s.dedicatedBits,"atomic summary counters");
  need(s.complete==(complete&&n==x.source.source.layout.chains[s.chain].segments.size()),"summary completeness");}
 if(!clock.complete)need(!r.complete,"source quality retained");
}
}
int main()try {
 auto d=design("reset_top");auto r=request();auto good=take(inspectWrapperChainResets(*d,r));audit(good);
 need(good.resets.complete&&good.resets.rows.size()==2&&good.resets.checks.size()==1&&good.resets.inputs.size()==1&&good.resets.events==2,"aliases and event cache");
 need(good.resets.chains[0].status=="hold"&&good.resets.chains[0].holdBits==2&&good.resets.chains[0].holds[0].high&&!good.resets.chains[0].holds[0].low,"active low requires high");
 need(wire(good.source)==wire(take(inspectWrapperChainClocks(*d,r.clock))),"upstream full report unchanged");
 for(uint64_t n=1;n<=good.resets.work;++n){r.limits.maxWork=n;auto x=take(inspectWrapperChainResets(*d,r));audit(x);need(x.resets.complete==(n==good.resets.work),"work boundary");if(n<good.resets.work)need(x.resets.stop->reason=="budget_work","work prefix");}
 r=request();r.limits.maxEvents=1;auto events=take(inspectWrapperChainResets(*d,r));audit(events);need(events.resets.rows.size()==1&&events.resets.events==1&&events.resets.stop->reason=="budget_events","event cap");
 r=request();r.limits.maxRows=1;auto rows=take(inspectWrapperChainResets(*d,r));audit(rows);need(rows.resets.rows.size()==1&&!rows.resets.chains[0].complete,"row cap");
 r=request({"qn","qi","qs"});auto same=take(inspectWrapperChainResets(*d,r));audit(same);need(same.resets.complete&&same.resets.inputs.size()==1&&same.resets.chains[0].holds[0].high&&!same.resets.chains[0].holds[0].low&&same.resets.checks.size()==3,"inversion reset and set equivalent inactive level");
 r=request({"qn","qp"});auto opposite=take(inspectWrapperChainResets(*d,r));audit(opposite);need(opposite.resets.complete&&opposite.resets.chains[0].status=="conflict"&&opposite.resets.chains[0].conflictBits==0,"cross segment conflict retains complete evidence");
 r.clock.chains.chains.push_back({"separate",10});r.clock.chains.assignments={{"qp",CellDirection::Output,{},"separate"}};auto separated=take(inspectWrapperChainResets(*d,r));audit(separated);need(separated.resets.chains[0].status=="hold"&&separated.resets.chains[1].status=="hold","independent chains not forced simultaneous");
 r=request({"qfree"});auto clear=take(inspectWrapperChainResets(*d,r));audit(clear);need(clear.resets.complete&&clear.resets.rows[0].reason=="no_async_controls"&&clear.resets.checks.empty(),"no async");
 r=request({"qg"});auto unknown=take(inspectWrapperChainResets(*d,r));audit(unknown);need(!unknown.resets.complete&&unknown.resets.inputs.empty()&&unknown.resets.chains[0].status=="unresolved","generated control not controllable PI");
 r=request({"qn"});r.clock.limits.maxRows=1;auto pending=take(inspectWrapperChainResets(*d,r));audit(pending);need(pending.resets.rows.size()==2&&pending.resets.rows[1].status=="pending","upstream unvisited explicit");
 r=request({"qn"});r.clock.chains.cells.rules={{"qn",CellDirection::Output,CellAction::Dedicated,{}}};auto dedicated=take(inspectWrapperChainResets(*d,r));audit(dedicated);need(dedicated.resets.complete&&dedicated.resets.chains[0].status=="dedicated_only"&&dedicated.resets.checks.empty(),"dedicated no fabricated controls");
 r=request({"qn"});r.clock.chains.cells.rules={{"qn",CellDirection::Output,CellAction::Exclude,{}}};need(take(inspectWrapperChainResets(*d,r)).resets.chains[0].status=="empty","empty");
 auto vector=design("reset_vector");r=request({"d"},"reset_vector");auto v=take(inspectWrapperChainResets(*vector,r));audit(v);need(v.resets.complete&&v.resets.rows.size()==1&&v.resets.rows[0].status=="conflict"&&v.resets.chains[0].conflictBits==4,"intra segment conflict");
 r.limits.maxEvents=3;auto rollback=take(inspectWrapperChainResets(*vector,r));audit(rollback);need(rollback.resets.events==3&&rollback.resets.rows.empty()&&rollback.resets.chains[0].holds.empty()&&rollback.resets.chains[0].processedSegments==0,"partial event row cannot leak holds");
 auto mixed=design("reset_unknown");auto mx=take(inspectWrapperChainResets(*mixed,request({"d"},"reset_unknown")));audit(mx);need(!mx.resets.complete&&mx.resets.rows[0].status=="conflict"&&!mx.resets.rows[0].complete,"known conflict does not hide unknown");
 auto child=design("reset_hierarchy");r=request({"q"},"reset_hierarchy");auto h=take(inspectWrapperChainResets(*child,r));audit(h);need(h.resets.complete&&h.resets.chains[0].holds[0].low&&!h.resets.chains[0].holds[0].high,"hierarchical inversion inactive low");
 r.limits.maxDepth=1;auto depth=take(inspectWrapperChainResets(*child,r));audit(depth);need(!depth.resets.complete&&depth.resets.inputs.empty(),"depth unknown");
 auto bus=design("reset_bus");auto b=take(inspectWrapperChainResets(*bus,request({"q"},"reset_bus")));audit(b);need(b.resets.complete&&b.resets.inputs.size()==2&&b.resets.inputs[0].sourceRef==b.resets.inputs[1].sourceRef&&b.resets.chains[0].status=="hold","separate source bus bits");
 auto unsupported=design("reset_unsupported");auto u=take(inspectWrapperChainResets(*unsupported,request({"q"},"reset_unsupported")));audit(u);need(!u.resets.complete&&u.resets.checks[0].event.type=="unknown"&&u.resets.checks[0].reason=="unsupported_event","unknown raw event type not promoted");
 auto gated=design("reset_unknown_clock");auto gc=take(inspectWrapperChainResets(*gated,request({"q"},"reset_unknown_clock")));audit(gc);need(!gc.resets.complete&&gc.resets.rows[0].complete&&gc.resets.chains[0].complete&&gc.resets.chains[0].status=="hold","clock unresolved still reset evidence");
 auto constants=design("reset_constant");auto ci=take(inspectWrapperChainResets(*constants,request({"qi"},"reset_constant")));audit(ci);need(ci.resets.complete&&ci.resets.rows[0].reason=="constant_inactive","constant inactive");
 auto ca=take(inspectWrapperChainResets(*constants,request({"qa"},"reset_constant")));audit(ca);need(ca.resets.complete&&ca.resets.rows[0].status=="asserted","constant asserted complete but blocking");
 auto cx=take(inspectWrapperChainResets(*constants,request({"qx"},"reset_constant")));audit(cx);need(!cx.resets.complete&&cx.resets.rows[0].status=="unresolved","four state constant unknown");
 r=request();auto expired=take(detail::inspectWrapperChainResetsWithDeadline(*d,r,std::chrono::steady_clock::time_point::min()));audit(expired);need(expired.source.clocks.complete&&expired.resets.rows.empty()&&expired.resets.work==0&&expired.resets.stop->reason=="budget_time","own phase deadline");
 for(int i=0;i<10;++i){r=request();switch(i){case 0:r.limits.maxRows=0;break;case 1:r.limits.maxRows=100001;break;case 2:r.limits.maxEvents=0;break;case 3:r.limits.maxEvents=1000001;break;case 4:r.limits.maxWork=0;break;case 5:r.limits.maxWork=10000001;break;case 6:r.limits.maxDepth=0;break;case 7:r.limits.maxDepth=257;break;case 8:r.limits.maxMillis=0;break;default:r.limits.maxMillis=60001;break;}need(inspectWrapperChainResets(*d,r).error().code==hier::ErrorCode::BadRequest,"bad limit");}
 std::stop_source stop;stop.request_stop();need(inspectWrapperChainResets(*d,{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"cancel before validation");
 const auto saved=wire(good);d.reset();r={};need(wire(good)==saved,"owned after release");std::cout<<checks<<" wrapper resets assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
