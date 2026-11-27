#include "ChainCompatibilityInternal.h"
#include "ChainCompatibilityJson.h"
#include "ChainResetsJson.h"
#include <iostream>
#include <stdexcept>
#include <algorithm>
namespace {
using namespace dft::wrapper;size_t checks=0;
void need(bool b,const char *s){++checks;if(!b)throw std::runtime_error(s);}
template<class T>T take(hier::Result<T> r){if(!r)throw std::runtime_error(r.error().message);return std::move(r.value());}
auto design(const std::string &top="compatibility_top"){hier::model::OpenOptions o;o.tops={top};o.files={DFT_WRAPPER_COMPATIBILITY_FIXTURE};auto d=take(hier::Design::open(o));need(!d->diagnostics(100).errorCount,"RTL valid");return d;}
ChainCompatibilityRequest request(std::vector<std::string> ports={"qa","alias_a"},std::string top="compatibility_top") {
 ChainCompatibilityRequest r;auto &p=r.resets.clock.chains;p.cells.boundary.scope=std::move(top);p.cells.boundary.ports=std::move(ports);p.chains={{"first",100},{"second",100},{"unused",100}};p.defaultChain="first";
 p.assignments={{"qb",CellDirection::Output,{},"second"},{"qp",CellDirection::Output,{},"second"},{"qc",CellDirection::Output,{},"second"},{"b",CellDirection::Output,{},"second"}};std::erase_if(p.assignments,[&](const auto &a){return std::find(p.cells.boundary.ports.begin(),p.cells.boundary.ports.end(),a.port)==p.cells.boundary.ports.end();});return r;
}
std::string wire(const ChainCompatibilityReport &r){hier::protocol::JsonWriter w;writeChainCompatibility(w,r);return w.str();}
std::string wire(const ChainResetReport &r){hier::protocol::JsonWriter w;writeChainResets(w,r);return w.str();}
bool reason(const ChainCompatibilityRow &r,const std::string &s){return std::find(r.reasons.begin(),r.reasons.end(),s)!=r.reasons.end();}
void audit(const ChainCompatibilityReport &x){const auto &c=x.compatibility;need(c.work<=c.limits.maxWork&&c.rows.size()<=c.limits.maxGroups,"limits");need(c.counts.groups==c.rows.size()&&c.counts.groups==c.counts.compatible+c.counts.conflict+c.counts.unresolved+c.counts.empty,"atomic counts");
 for(size_t i=0;i<c.rows.size();++i){const auto &r=c.rows[i];need(r.group==i,"ordered groups");uint64_t shared=0,dedicated=0;for(auto ch:c.groups[i].chains)for(const auto &s:x.source.source.source.layout.chains[ch].segments){if(s.kind=="shared")shared+=s.length;else dedicated+=s.length;}need(r.allocatedSharedBits==shared&&r.allocatedDedicatedBits==dedicated,"inventory per group");
  for(const auto &h:r.heldClocks){const auto &clock=x.source.source.clocks.groups.at(h.clockGroup);const auto &input=x.source.resets.inputs.at(h.input);need(clock.sourceRef==input.sourceRef&&clock.point.slice.bits.lsb==input.point.slice.bits.lsb,"clock hold same input bit");}
  need(r.complete==(!reason(r,"clock_unresolved")&&!reason(r,"reset_unresolved")&&!reason(r,"dedicated_controls_undefined")),"independent completeness");}
 if(!x.source.resets.complete)need(!c.complete,"global source quality");
}
}
int main()try {
 auto d=design();auto r=request();auto good=take(inspectWrapperChainCompatibility(*d,r));audit(good);
 need(good.compatibility.complete&&good.compatibility.rows.size()==3&&good.compatibility.counts.compatible==1&&good.compatibility.counts.empty==2&&good.compatibility.rows[0].allocatedSharedBits==1,"default independent and alias dedup");
 need(wire(good.source)==wire(take(inspectWrapperChainResets(*d,r.resets))),"whole source unchanged");
 r=request({"qa","qb"});r.groups={{"joint",{"first","second"}},{"first_only",{"first"}}};auto joint=take(inspectWrapperChainCompatibility(*d,r));audit(joint);need(joint.compatibility.complete&&joint.compatibility.rows[0].status=="compatible"&&joint.compatibility.rows[0].allocatedSharedBits==2&&joint.compatibility.rows[0].holds.size()==1,"shared clock reset set across chains");
 for(uint64_t n=1;n<=joint.compatibility.work;++n){r.limits.maxWork=n;auto x=take(inspectWrapperChainCompatibility(*d,r));audit(x);need(x.compatibility.complete==(n==joint.compatibility.work),"exact work budget");if(n<joint.compatibility.work)need(x.compatibility.stop->reason=="budget_work","work stop");}
 r.limits={};r.limits.maxGroups=1;auto bounded=take(inspectWrapperChainCompatibility(*d,r));audit(bounded);need(bounded.compatibility.rows.size()==1&&bounded.compatibility.counts.groups==1&&bounded.compatibility.stop->group==1,"whole group cap");
 r=request({"qa","qp"});auto independent=take(inspectWrapperChainCompatibility(*d,r));need(independent.compatibility.counts.compatible==2,"chains not simultaneous by default");r.groups={{"joint",{"second","first"}}};auto levels=take(inspectWrapperChainCompatibility(*d,r));audit(levels);need(levels.compatibility.complete&&levels.compatibility.rows[0].status=="conflict"&&reason(levels.compatibility.rows[0],"conflicting_levels"),"opposite holds across chains");
 r=request({"qa","qc"});r.groups={{"joint",{"first","second"}}};auto mixed=take(inspectWrapperChainCompatibility(*d,r));audit(mixed);need(mixed.compatibility.complete&&reason(mixed.compatibility.rows[0],"mixed_clocks"),"single functional clock policy");
 r=request({"qh"});auto held=take(inspectWrapperChainCompatibility(*d,r));audit(held);need(held.compatibility.complete&&held.compatibility.rows[0].heldClocks.size()==1&&reason(held.compatibility.rows[0],"held_clock"),"clock also held inactive");
 r=request({"qa","qp","qg"});r.groups={{"joint",{"first","second"}}};auto unknown=take(inspectWrapperChainCompatibility(*d,r));audit(unknown);need(!unknown.compatibility.complete&&unknown.compatibility.rows[0].status=="conflict"&&!unknown.compatibility.rows[0].complete&&reason(unknown.compatibility.rows[0],"reset_unresolved"),"known conflict preserves unknown");
 r=request({"qa"});r.resets.clock.chains.cells.rules={{"qa",CellDirection::Output,CellAction::Dedicated,{}}};auto dedicated=take(inspectWrapperChainCompatibility(*d,r));audit(dedicated);need(dedicated.source.resets.complete&&!dedicated.compatibility.complete&&reason(dedicated.compatibility.rows[0],"dedicated_controls_undefined"),"dedicated control missing");
 r.resets.clock.chains.cells.rules[0].action=CellAction::Exclude;need(take(inspectWrapperChainCompatibility(*d,r)).compatibility.counts.empty==3,"excluded empty");
 r=request({"qa","qb"});r.resets.limits.maxWork=1;auto pending=take(inspectWrapperChainCompatibility(*d,r));audit(pending);need(!pending.compatibility.complete&&pending.compatibility.rows[0].holds.empty()&&reason(pending.compatibility.rows[0],"reset_unresolved"),"uncommitted reset observations not constraints");
 r=request({"qa","qb"});r.resets.clock.limits.maxRows=1;auto cp=take(inspectWrapperChainCompatibility(*d,r));audit(cp);need(cp.compatibility.rows[0].complete&&!cp.compatibility.rows[1].complete&&!cp.compatibility.complete,"local complete global partial");
 auto cross=design("compatibility_cross");r=request({"a","b"},"compatibility_cross");r.groups={{"joint",{"first","second"}}};auto cr=take(inspectWrapperChainCompatibility(*cross,r));audit(cr);need(cr.compatibility.rows[0].heldClocks.size()==2&&reason(cr.compatibility.rows[0],"mixed_clocks"),"cross-chain clock held by other chain");
 auto bus=design("compatibility_bus");auto bs=take(inspectWrapperChainCompatibility(*bus,request({"q"},"compatibility_bus")));audit(bs);need(bs.compatibility.complete&&bs.compatibility.rows[0].status=="compatible"&&bs.compatibility.rows[0].heldClocks.empty(),"different bits same input ref");
 auto ambiguous=design("compatibility_ambiguous");auto am=take(inspectWrapperChainCompatibility(*ambiguous,request({"q"},"compatibility_ambiguous")));audit(am);need(!am.compatibility.complete&&reason(am.compatibility.rows[0],"reset_unresolved"),"unknown original event retained");
 auto constant=design("compatibility_constant");auto co=take(inspectWrapperChainCompatibility(*constant,request({"q"},"compatibility_constant")));audit(co);need(co.compatibility.complete&&reason(co.compatibility.rows[0],"constant_asserted"),"constant asserted known conflict");
 auto gated=design("compatibility_unknown_clock");auto gc=take(inspectWrapperChainCompatibility(*gated,request({"q"},"compatibility_unknown_clock")));audit(gc);need(!gc.compatibility.complete&&reason(gc.compatibility.rows[0],"clock_unresolved")&&!reason(gc.compatibility.rows[0],"reset_unresolved"),"clock and reset quality independent");
 r=request();auto expired=take(detail::inspectWrapperChainCompatibilityWithDeadline(*d,r,std::chrono::steady_clock::time_point::min()));audit(expired);need(expired.source.resets.complete&&expired.compatibility.rows.empty()&&expired.compatibility.work==0&&expired.compatibility.stop->reason=="budget_time","new phase expired");
 for(int i=0;i<13;++i){r=request();switch(i){case 0:r.limits.maxGroups=0;break;case 1:r.limits.maxGroups=1025;break;case 2:r.limits.maxWork=0;break;case 3:r.limits.maxWork=10000001;break;case 4:r.limits.maxMillis=0;break;case 5:r.limits.maxMillis=60001;break;case 6:r.groups={{"x",{}}};break;case 7:r.groups={{"x",{"missing"}}};break;case 8:r.groups={{"x",{"first","first"}}};break;case 9:r.groups={{"x",{"first"}},{"x",{"second"}}};break;case 10:r.groups={{std::string(1,char(0xff)),{"first"}}};break;case 11:r.groups={{std::string(4097,'a'),{"first"}}};break;default:r.groups.resize(1025);break;}need(inspectWrapperChainCompatibility(*d,r).error().code==hier::ErrorCode::BadRequest,"all declarations validated");}
 r=request();r.resets.clock.chains.chains.clear();r.resets.clock.chains.assignments.clear();r.resets.clock.chains.defaultChain="c0";
 for(int i=0;i<17;++i)r.resets.clock.chains.chains.push_back({"c"+std::to_string(i),100});
 for(int i=0;i<1024;++i){ChainActivityGroup g{"g"+std::to_string(i),{}};for(int j=0;j<16;++j)g.chains.push_back("c"+std::to_string(j));r.groups.push_back(std::move(g));}
 need(bool(validateChainCompatibilityRequest(r)),"16384 members accepted");r.groups[0].chains.push_back("c16");need(validateChainCompatibilityRequest(r).error().code==hier::ErrorCode::BadRequest,"16385 members rejected");
 r=request();for(int i=0;i<257;++i)r.groups.push_back({std::to_string(i)+std::string(4090,'a'),{"first"}});need(validateChainCompatibilityRequest(r).error().code==hier::ErrorCode::BadRequest,"aggregate name bytes bounded");
 std::stop_source stop;stop.request_stop();need(inspectWrapperChainCompatibility(*d,{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre cancel");
 const auto saved=wire(good);d.reset();r={};need(wire(good)==saved,"owned report");std::cout<<checks<<" wrapper compatibility assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
