#include "ChainClocksInternal.h"
#include "ChainClocksJson.h"
#include "ChainPlanJson.h"
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::wrapper;size_t checks=0;
void need(bool b,const char *m){++checks;if(!b)throw std::runtime_error(m);}
template<class T>T take(hier::Result<T> r){if(!r)throw std::runtime_error(r.error().message);return std::move(r.value());}
ChainClockRequest request(std::vector<std::string> ports={"qa","alias_a"},std::string scope="clock_top") {
 ChainClockRequest r;r.chains.cells.boundary.scope=std::move(scope);r.chains.cells.boundary.ports=std::move(ports);r.chains.chains={{"scan",100}};r.chains.defaultChain="scan";return r;
}
auto design(const std::string &top){hier::model::OpenOptions o;o.tops={top};o.files={DFT_WRAPPER_CLOCKS_FIXTURE};auto d=take(hier::Design::open(o));need(d->diagnostics(100).errorCount==0,"RTL open");return d;}
std::string wire(const ChainClockReport &r){hier::protocol::JsonWriter w;writeChainClocks(w,r);return w.str();}
std::string wire(const ChainPlanReport &r){hier::protocol::JsonWriter w;writeChainPlan(w,r);return w.str();}
void audit(const ChainClockReport &x) {
 const auto &c=x.clocks;size_t rows=0;uint64_t facts=0;
 for(const auto &p:c.pages)facts+=p.response.result.items.size();need(facts==c.registers,"actual raw facts");
 for(size_t i=0;i<c.chains.size();++i){const auto &s=c.chains[i];uint64_t resolved=0,unresolved=0,dedicated=0;size_t index=0;
  for(const auto &r:c.rows)if(r.chain==i){need(r.segment==index++,"per-chain ordered prefix");const auto &segment=x.source.layout.chains[i].segments[r.segment];
   if(r.status=="dedicated")dedicated+=segment.length;else if(r.status=="unresolved")unresolved+=segment.length;else resolved+=segment.length;
   for(const auto &m:r.matches){const auto &f=c.pages.at(m.page).response.result.items.at(m.fact);need(f.signal==segment.signal,"actual state identity");need(m.bits.lsb>=f.bits.lsb&&m.bits.lsb+m.bits.width<=f.bits.lsb+f.bits.width,"register intersection");
    if(m.check){need(c.checks[*m.check].event.signal==f.clock.signal,"clock fact link");need(m.group==c.checks[*m.check].group,"source group link");}}
  }
  rows+=index;need(s.processedSegments==index&&s.resolvedBits==resolved&&s.unresolvedBits==unresolved&&s.dedicatedBits==dedicated,"no partial row counters");
 }
 need(rows==c.rows.size(),"all rows counted");if(!x.source.layout.complete)need(!c.complete,"source partial retained");
}
}
int main()try {
 auto d=design("clock_top");auto r=request();auto x=take(inspectWrapperChainClocks(*d,r));audit(x);
 need(x.clocks.complete&&x.clocks.rows.size()==2&&x.clocks.checks.size()==1&&x.clocks.groups.size()==1,"deduplicated alias and clock");
 need(x.clocks.chains[0].resolvedBits==2&&x.clocks.chains[0].status=="single_clock"&&x.clocks.groups[0].edge=="posedge","single clock");
 need(wire(x.source)==wire(take(planWrapperChains(*d,r.chains))),"original source unchanged");const auto work=x.clocks.work;
 for(uint64_t n=1;n<=work;++n){r.limits.maxWork=n;auto limited=take(inspectWrapperChainClocks(*d,r));audit(limited);need(limited.clocks.work<=n,"work cap");need(limited.clocks.complete==(n==work),"exact work bound");if(n<work)need(limited.clocks.stop&&limited.clocks.stop->reason=="budget_work","work stop");}
 r=request();r.limits.maxRows=1;auto capped=take(inspectWrapperChainClocks(*d,r));audit(capped);need(capped.clocks.rows.size()==1&&capped.clocks.chains[0].status=="unresolved","unseen segment not single clock");
 r=request();r.limits.maxRegisters=1;auto facts=take(inspectWrapperChainClocks(*d,r));audit(facts);need(facts.clocks.registers==1&&facts.clocks.rows.empty()&&facts.clocks.stop->reason=="budget_registers","fact prefix cannot prove uniqueness");
 r=request();r.limits.pageSize=1;auto paged=take(inspectWrapperChainClocks(*d,r));audit(paged);need(paged.clocks.pages.size()==8&&paged.clocks.complete,"all pages read once per instance");
 r.limits.maxRegisters=8;need(take(inspectWrapperChainClocks(*d,r)).clocks.complete,"exact final fact limit");
 r=request({"qb","qc"});auto inv=take(inspectWrapperChainClocks(*d,r));audit(inv);need(inv.clocks.complete&&inv.clocks.groups.size()==1&&inv.clocks.groups[0].edge=="negedge"&&inv.clocks.checks.size()==2,"inversion normalized edge");
 r=request({"qa","qb","qd"});auto mixed=take(inspectWrapperChainClocks(*d,r));audit(mixed);need(mixed.clocks.complete&&mixed.clocks.chains[0].status=="mixed_clock"&&mixed.clocks.groups.size()==3,"mixed sources and edges complete analysis");
 r.chains.chains.push_back({"other",10});r.chains.assignments={{"qb",CellDirection::Output,{},"other"},{"qd",CellDirection::Output,{},"other"}};auto split=take(inspectWrapperChainClocks(*d,r));audit(split);need(split.clocks.chains[0].status=="single_clock"&&split.clocks.chains[1].status=="mixed_clock","separate chain summaries");
 r=request({"qg","qs","qu"});auto unknown=take(inspectWrapperChainClocks(*d,r));audit(unknown);need(!unknown.clocks.complete&&unknown.clocks.rows.size()==3&&unknown.clocks.groups.empty()&&unknown.clocks.chains[0].unresolvedBits==3,"gated constant floating are not known clocks");
 r=request();r.chains.cells.rules={{"qa",CellDirection::Output,CellAction::Dedicated,{}},{"alias_a",CellDirection::Output,CellAction::Exclude,{}}};auto dedicated=take(inspectWrapperChainClocks(*d,r));audit(dedicated);need(dedicated.clocks.complete&&dedicated.clocks.pages.empty()&&dedicated.clocks.chains[0].status=="dedicated_only","dedicated no fabricated clocks");
 r=request({"qa"});r.chains.cells.rules={{"qa",CellDirection::Output,CellAction::Exclude,{}}};auto empty=take(inspectWrapperChainClocks(*d,r));need(empty.clocks.complete&&empty.clocks.chains[0].status=="empty","empty chain");
 r=request();r.chains.limits.maxRows=1;auto partial=take(inspectWrapperChainClocks(*d,r));audit(partial);need(!partial.clocks.complete&&partial.clocks.rows.size()==1,"source partial");
 auto child=design("clock_hierarchy");auto h=take(inspectWrapperChainClocks(*child,request({"q"},"clock_hierarchy")));audit(h);need(h.clocks.complete&&h.clocks.groups.size()==1&&h.clocks.groups[0].edge=="posedge","child port inside and parent inversion");
 auto vector=design("clock_split");auto v=take(inspectWrapperChainClocks(*vector,request({"d"},"clock_split")));audit(v);need(v.clocks.complete&&v.clocks.rows.size()==1&&v.clocks.rows[0].status=="mixed"&&v.clocks.rows[0].matches.size()==4&&v.clocks.chains[0].resolvedBits==4,"mixed clocks within one range without expansion");
 auto overlap=design("clock_overlap");auto ov=take(inspectWrapperChainClocks(*overlap,request({"q"},"clock_overlap")));audit(ov);need(!ov.clocks.complete&&ov.source.layout.complete&&ov.clocks.rows[0].reason=="register_overlap"&&ov.clocks.checks.empty(),"multiple writers cannot establish unique clock");
 auto depth=request({"q"},"clock_hierarchy");depth.limits.maxDepth=1;auto dep=take(inspectWrapperChainClocks(*child,depth));audit(dep);need(!dep.clocks.complete&&dep.clocks.rows.size()==1&&dep.clocks.groups.empty()&&dep.clocks.checks[0].proof->reasons[0]=="budget_logic_depth","depth preserves unresolved proof");
 r=request();auto expired=take(detail::inspectWrapperChainClocksWithDeadline(*d,r,std::chrono::steady_clock::time_point::min()));audit(expired);need(expired.source.layout.complete&&expired.clocks.rows.empty()&&expired.clocks.work==0&&expired.clocks.stop->reason=="budget_time","independent expired deadline");
 for(int i=0;i<12;++i){r=request();switch(i){case 0:r.limits.maxRows=0;break;case 1:r.limits.maxRows=100001;break;case 2:r.limits.maxRegisters=0;break;case 3:r.limits.maxRegisters=100001;break;case 4:r.limits.maxWork=0;break;case 5:r.limits.maxWork=10000001;break;case 6:r.limits.maxDepth=0;break;case 7:r.limits.maxDepth=257;break;case 8:r.limits.maxMillis=0;break;case 9:r.limits.maxMillis=60001;break;case 10:r.limits.pageSize=0;break;default:r.limits.pageSize=1001;break;}auto bad=inspectWrapperChainClocks(*d,r);need(!bad&&bad.error().code==hier::ErrorCode::BadRequest,"limit validation");}
 std::stop_source stop;stop.request_stop();need(inspectWrapperChainClocks(*d,{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"cancel wins validation");
 const auto saved=wire(x);d.reset();need(wire(x)==saved,"owned evidence");std::cout<<checks<<" wrapper clocks assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
