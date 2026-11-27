#include "ChainActivityPlanInternal.h"
#include "ChainActivityPlanJson.h"
#include "ChainCompatibilityJson.h"
#include <iostream>
#include <stdexcept>
#include <set>
namespace {
using namespace dft::wrapper;size_t checks=0;
void need(bool b,const char *s){++checks;if(!b)throw std::runtime_error(s);}
template<class T>T take(hier::Result<T> r){if(!r)throw std::runtime_error(r.error().message);return std::move(r.value());}
auto design(const std::string &top="compatibility_top"){hier::model::OpenOptions o;o.tops={top};o.files={DFT_WRAPPER_ACTIVITY_FIXTURE};auto d=take(hier::Design::open(o));need(!d->diagnostics(100).errorCount,"valid fixture");return d;}
ChainActivityPlanRequest request(std::vector<std::string> ports={"qa","qb","qp","qc","qfree","qh","qg"},std::string top="compatibility_top"){
 ChainActivityPlanRequest r;auto &p=r.resets.clock.chains;p.cells.boundary.scope=std::move(top);p.cells.boundary.ports=ports;
 for(const auto &port:ports){p.chains.push_back({port,100});p.assignments.push_back({port,CellDirection::Output,{},port});}p.chains.push_back({"unused",100});return r;
}
std::string wire(const ChainActivityPlanReport &r){hier::protocol::JsonWriter w;writeChainActivityPlan(w,r);return w.str();}
std::string wire(const ChainCompatibilityReport &r){hier::protocol::JsonWriter w;writeChainCompatibility(w,r);return w.str();}
void audit(const ChainActivityPlanReport &r){const auto &a=r.activity;std::set<size_t> seen;uint64_t bits=0,assigned=0;
 need(a.counts.chains==a.rows.size()&&a.counts.chains==a.counts.assigned+a.counts.conflict+a.counts.unresolved+a.counts.empty+a.counts.oversized+a.counts.pending,"counts");
 need(a.work<=a.limits.maxWork&&a.batches.size()<=a.limits.maxBatches,"budget");
 for(size_t i=0;i<a.batches.size();++i){const auto &b=a.batches[i];need(!b.chains.empty()&&b.chains.size()<=a.limits.maxChainsPerBatch&&b.sharedBits<=a.limits.maxSharedBitsPerBatch,"capacity");uint64_t n=0;
  for(auto ch:b.chains){need(ch<a.rows.size()&&seen.insert(ch).second&&a.rows[ch].status=="assigned"&&a.rows[ch].batch==i,"unique membership");n+=r.source.compatibility.rows[ch].allocatedSharedBits;++assigned;}need(n==b.sharedBits,"batch inventory");bits+=n;
  for(const auto &h:b.holds)need(h.low!=h.high,"no contradictory hold");}
 need(bits==a.counts.assignedSharedBits&&assigned==a.counts.assigned,"committed bits");
 for(size_t i=0;i<a.rows.size();++i){const auto &x=a.rows[i];need(x.chain==i,"prefix");need(x.sourceRow.has_value()==(x.status!="pending"),"source index");if(x.sourceRow)need(*x.sourceRow==i,"singleton index");}
 if(!r.source.compatibility.complete)need(!a.complete,"source partial");
}
}
int main()try{
 auto d=design();auto r=request();auto all=take(planWrapperChainActivity(*d,r));audit(all);
 need(!all.activity.complete&&all.activity.batches.size()==3,"mixed controls create batches and unknown kept");
 need(all.activity.batches[0].chains==std::vector<size_t>({0,1,4})&&all.activity.batches[1].chains==std::vector<size_t>({2})&&all.activity.batches[2].chains==std::vector<size_t>({3}),"first fit order");
 need(all.activity.rows[5].status=="conflict"&&all.activity.rows[6].status=="unresolved"&&all.activity.rows[7].status=="empty","nonparticipants");
 need(wire(all.source)==wire(take(inspectWrapperChainCompatibility(*d,{r.resets,{},r.inspection}))),"original singleton source identical");
 for(const auto &b:all.activity.batches){ChainCompatibilityRequest cr{r.resets,{},r.inspection};ChainActivityGroup g{"check",{}};for(auto ch:b.chains)g.chains.push_back(r.resets.clock.chains.chains[ch].name);cr.groups.push_back(g);auto c=take(inspectWrapperChainCompatibility(*d,cr));const auto &x=c.compatibility.rows[0];need(x.complete&&x.status=="compatible"&&x.allocatedSharedBits==b.sharedBits&&x.clockGroups[0]==b.clockGroup,"original evaluator agrees");}
 r=request({"qa","qb","qfree"});auto full=take(planWrapperChainActivity(*d,r));audit(full);need(full.activity.complete&&full.activity.batches.size()==1,"fully planned");
 for(uint64_t n=1;n<=full.activity.work;++n){r.limits.maxWork=n;auto part=take(planWrapperChainActivity(*d,r));audit(part);need(part.activity.complete==(n==full.activity.work),"exact work boundary");need(part.activity.rows.size()<=full.activity.rows.size(),"work prefix");if(part.activity.stop)need(part.activity.stop->chain==part.activity.rows.size(),"next uncommitted chain");}
 r=request({"qa","qb","qfree"});r.limits.maxChainsPerBatch=2;auto cap=take(planWrapperChainActivity(*d,r));audit(cap);need(cap.activity.batches.size()==2&&cap.activity.batches[0].chains==std::vector<size_t>({0,1}),"chain capacity");
 r.limits.maxChainsPerBatch=1024;r.limits.maxSharedBitsPerBatch=2;auto cap2=take(planWrapperChainActivity(*d,r));audit(cap2);need(cap2.activity.batches.size()==2,"bit capacity");
 r.limits.maxBatches=1;auto stopped=take(planWrapperChainActivity(*d,r));audit(stopped);need(stopped.activity.rows.size()==2&&stopped.activity.stop->reason=="budget_batches","batch cap transaction");
 r=request({"qa","qb"});r.limits.maxBatches=1;need(take(planWrapperChainActivity(*d,r)).activity.complete,"full batch count can accept later chain and empty tail");
 r.resets.clock.chains.assignments[1].chain="qa";r.limits.maxSharedBitsPerBatch=1;auto oversize=take(planWrapperChainActivity(*d,r));audit(oversize);need(oversize.activity.complete&&oversize.activity.rows[0].status=="oversized"&&oversize.activity.batches.empty(),"oversized evidence complete");
 r=request({"qa","qb"});r.inspection.maxGroups=1;auto pending=take(planWrapperChainActivity(*d,r));audit(pending);need(pending.activity.rows[0].status=="assigned"&&pending.activity.counts.pending==2&&!pending.activity.complete,"published source only");
 r=request({"qa"});r.resets.clock.chains.cells.rules={{"qa",CellDirection::Output,CellAction::Dedicated,{}}};auto ded=take(planWrapperChainActivity(*d,r));audit(ded);need(ded.activity.counts.unresolved==1,"dedicated controls unresolved");
 r.resets.clock.chains.cells.rules[0].action=CellAction::Exclude;auto empty=take(planWrapperChainActivity(*d,r));audit(empty);need(empty.activity.complete&&empty.activity.counts.empty==2,"excluded empty");
 auto constant=design("compatibility_constant");auto known=take(planWrapperChainActivity(*constant,request({"q"},"compatibility_constant")));audit(known);need(known.activity.complete&&known.activity.counts.conflict==1,"complete does not certify usable");
 r=request();auto expired=take(detail::planWrapperChainActivityWithDeadline(*d,r,std::chrono::steady_clock::time_point::min()));audit(expired);need(expired.activity.rows.empty()&&expired.activity.work==0&&expired.activity.stop->reason=="budget_time","deterministic deadline");
 for(int i=0;i<10;++i){r=request();auto &l=r.limits;switch(i){case 0:l.maxBatches=0;break;case 1:l.maxBatches=1025;break;case 2:l.maxChainsPerBatch=0;break;case 3:l.maxChainsPerBatch=1025;break;case 4:l.maxSharedBitsPerBatch=0;break;case 5:l.maxSharedBitsPerBatch=9007199254740992ULL;break;case 6:l.maxWork=0;break;case 7:l.maxWork=10000001;break;case 8:l.maxMillis=0;break;default:l.maxMillis=60001;break;}r.resets.clock.chains.cells.boundary.scope="missing";need(planWrapperChainActivity(*d,r).error().code==hier::ErrorCode::BadRequest,"static before lookup");}
 std::stop_source stop;stop.request_stop();need(planWrapperChainActivity(*d,{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre cancel priority");
 auto saved=wire(all);d.reset();r={};need(wire(all)==saved,"report owns evidence");std::cout<<checks<<" wrapper activity assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
