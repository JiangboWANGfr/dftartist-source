#include "RegisterSourceHierarchyInternal.h"
#include "RegisterStatisticsInternal.h"
#include <iostream>
#include <stdexcept>
namespace {unsigned checks=0;void need(bool b,const char *s) {++checks;if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;open.files={DFT_HIERARCHY_FIXTURE,DFT_HIERARCHY_BASE};open.tops={"hierarchy_root"};auto d=hier::Design::open(open);need(bool(d),"open");
    StatisticsRequest sr;sr.scope="hierarchy_root";sr.recursive=true;auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete,"statistics");
    RegisterScenarioRequest request;request.common.resolveLogic=true;request.scenarios={{"ZERO",{{{"hierarchy_root.mode",0},false}}},{"ONE",{{{"hierarchy_root.mode",0},true}}},{"BACK",{{{"hierarchy_root.mode",0},false}}}};
    auto r=compareRegisterSourceHierarchy(**d,*s,request);need(bool(r)&&r->complete&&r->comparisons.size()==2,"complete actual pipeline");const auto &c=r->comparisons[0];
    need(c.inputComplete&&c.sourcesComplete&&c.inputCollected&&c.nodes.size()==7,"subtree domains");
    need(c.totals.coveredBits==18&&c.totals.changedBits==16&&c.totals.retainedOnlyBits==2,"root totals count original rows once");
    need(r->queries==9&&r->ancestorEntries==13&&r->nodeRows==14&&r->members==26,"cached topology and published counters");
    need(r->scope&&r->scope->pathText=="hierarchy_root"&&c.nodes.front().info.ref==r->scope->ref&&!c.nodes.front().parent&&c.nodes.front().local&&c.nodes.front().members.size()==5,"direct root and subtree members");
    size_t generated=0,escaped=0;
    for(const auto &v:c.nodes) {
        if(v.info.path.back()=="u0") {++generated;need(v.depth==2&&v.info.path.size()==4&&v.info.path[2]=="g","generate is not an instance parent");}
        if(v.info.path.back()=="unit.with.dot") {++escaped;need(v.depth==2&&v.info.path.size()==3,"escaped name is one component");}
        need(!v.members.empty(),"no empty fake nodes");
    }
    need(generated==2&&escaped==2&&r->comparisons[1].totals.retainedOnlyBits==18,"back context isolated");
    RegisterSourceHierarchyLimits l;l.maxNodes=1;auto p=compareRegisterSourceHierarchy(**d,*s,request,l);
    need(bool(p)&&!p->complete&&p->nodeRows==1&&p->members==5&&p->comparisons[0].nodes[0].counts.coveredBits==18&&p->comparisons[0].totals.changedBits==16,"whole root despite detail prefix");
    need(p->comparisons[1].state=="not_run","later not run");
    l={};l.maxMembers=1;p=compareRegisterSourceHierarchy(**d,*s,request,l);need(bool(p)&&!p->complete&&p->nodeRows==0&&p->members==0&&p->comparisons[0].inputCollected,"whole node admission");
    for(uint64_t q:{uint64_t(1),uint64_t(2)}) {l={};l.maxQueries=q;p=compareRegisterSourceHierarchy(**d,*s,request,l);need(bool(p)&&!p->complete&&p->queries==q&&!p->comparisons[0].inputCollected&&p->nodeRows==0,"actual navigation count, no half collection");}
    l={};l.maxAncestors=1;p=compareRegisterSourceHierarchy(**d,*s,request,l);need(bool(p)&&!p->complete&&p->ancestorEntries==1&&p->nodeRows==0,"only complete chain admission");
    l={};l.maxWork=1;p=compareRegisterSourceHierarchy(**d,*s,request,l);need(bool(p)&&!p->complete&&p->queries==1&&p->work==1&&p->nodeRows==0,"work budget");
    l={};l.impact.maxInstances=1;p=compareRegisterSourceHierarchy(**d,*s,request,l);need(bool(p)&&!p->complete&&!p->comparisons[0].inputComplete&&p->comparisons[0].totals.coveredBits==2,"prior partial not upgraded");
    auto bad=*s;bad.snapshot.snapshotId+="bad";need(!compareRegisterSourceHierarchy(**d,bad,request),"shared snapshot validation");
    bad=*s;bad.instances.front().info.pathText+="bad";need(!compareRegisterSourceHierarchy(**d,bad,request),"Core canonical scope identity");
    bad=*s;for(auto &v:bad.instances) if(v.info.path.back()=="u0") {v.info.path.back()="changed";break;}need(!compareRegisterSourceHierarchy(**d,bad,request),"used instance identity checked against Core");
    std::stop_source stop;stop.request_stop();auto cancelled=compareRegisterSourceHierarchy(**d,*s,request,{},stop.get_token());need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error");
    auto br=request;br.scenarios[1].name=br.scenarios[0].name;need(!compareRegisterSourceHierarchy(**d,*s,br),"duplicate names");br=request;br.scenarios[1].inputValues.push_back({{"hierarchy_root.mode",0},false});need(!compareRegisterSourceHierarchy(**d,*s,br),"second context no half batch");
    l={};l.maxQueries=0;need(!compareRegisterSourceHierarchy(**d,*s,request,l),"post budget validation");l={};l.impact.transitions.maxSources=0;need(!compareRegisterSourceHierarchy(**d,*s,request,l),"nested budget validation");
    auto expired=detail::sourceHierarchyWithDeadline(**d,*s,request,{},{},{});need(bool(expired)&&!expired->complete&&expired->analysis.complete&&expired->queries==0&&!expired->scope&&expired->nodeRows==0&&!expired->comparisons[0].inputCollected,"deterministic post deadline");
    need(bool(compareRegisterSourceHierarchy(**d,*s,request)),"reuse after errors and cancellation");
    sr.scope="hierarchy_root.left";auto scoped=registerStatistics(**d,sr);need(bool(scoped),"scoped statistics");auto one=compareRegisterSourceHierarchy(**d,*scoped,request);need(bool(one)&&one->complete&&one->queries==5&&one->ancestorEntries==4&&one->comparisons[0].nodes.size()==3&&one->comparisons[0].nodes[0].depth==0&&!one->comparisons[0].nodes[0].parent&&one->comparisons[0].totals.changedBits==8,"scope stops before outside ancestors");
    sr.scope="hierarchy_root.left.g.u0";scoped=registerStatistics(**d,sr);need(bool(scoped),"leaf scope");one=compareRegisterSourceHierarchy(**d,*scoped,request);need(bool(one)&&one->complete&&one->queries==1&&one->ancestorEntries==1&&one->comparisons[0].nodes[0].depth==0,"generate scope uses real instance");
    StatisticsRequest er;er.scope="hierarchy_root";er.recursive=true;
    auto empty=detail::statisticsWithDeadline(**d,er,{},{});need(bool(empty)&&!empty->complete&&empty->instances.empty()&&empty->scope==er.scope,"real producer expired before first instance");
    auto emptyReport=compareRegisterSourceHierarchy(**d,*empty,request);
    need(bool(emptyReport)&&!emptyReport->complete&&!emptyReport->scope&&emptyReport->queries==0&&emptyReport->ancestorEntries==0&&emptyReport->work==0&&emptyReport->nodeRows==0&&emptyReport->members==0,"unvisited prefix preserved without fake scope/navigation");
    for(const auto &v:emptyReport->comparisons) need(v.state=="partial"&&v.inputCollected&&!v.inputComplete&&!v.sourcesComplete&&v.nodes.empty()&&v.totals.coveredBits==0,"all empty comparisons partial and no fake root");
    need(!emptyReport->analysis.complete&&emptyReport->analysis.comparisons[0].instances.empty(),"original partial impact retained");
    auto emptyDeadline=detail::sourceHierarchyWithDeadline(**d,*empty,request,{},{},{});
    need(bool(emptyDeadline)&&!emptyDeadline->complete&&!emptyDeadline->scope&&emptyDeadline->queries==0&&emptyDeadline->comparisons[0].state=="not_run","own deadline still stops empty-prefix post");
    auto emptyCancelled=compareRegisterSourceHierarchy(**d,*empty,request,{},stop.get_token());need(!emptyCancelled&&emptyCancelled.error().code==hier::ErrorCode::Cancelled,"empty prefix still pre-cancels");
    bad=*empty;bad.complete=true;auto forged=compareRegisterSourceHierarchy(**d,bad,request);need(!forged&&forged.error().code==hier::ErrorCode::BadRequest,"empty complete statistics still invalid");
    bad=*empty;bad.snapshot.snapshotId+="bad";need(!compareRegisterSourceHierarchy(**d,bad,request),"empty prefix does not bypass snapshot validation");
    er.scope="hierarchy_root.missing";auto missing=detail::statisticsWithDeadline(**d,er,{},{});need(!missing&&missing.error().code==hier::ErrorCode::NotFound,"invalid scope still fails producer before deadline");
    er.scope="hierarchy_root.left";er.recursive=false;auto noLocal=registerStatistics(**d,er);need(bool(noLocal)&&noLocal->complete&&noLocal->instances.size()==1&&noLocal->facts.empty(),"complete empty local state still visits scope");
    auto known=compareRegisterSourceHierarchy(**d,*noLocal,request);need(bool(known)&&known->complete&&known->scope&&known->scope->pathText==er.scope&&known->queries==1&&known->nodeRows==0,"visited empty complete scope keeps authoritative metadata");
    need(bool(compareRegisterSourceHierarchy(**d,*s,request)),"normal reuse after empty/malformed producer inputs");
    d.value().reset();s=hier::Error{hier::ErrorCode::Internal,"released"};need(c.nodes.size()==7&&c.nodes[2].info.path.size()>=3&&c.nodes[0].members.size()==5&&r->scope->pathText=="hierarchy_root","owned metadata and members after inputs release");
    need(!emptyReport->scope&&!emptyReport->analysis.complete&&emptyReport->comparisons.size()==2,"owned empty partial after Design release");
    std::cout<<checks<<" source hierarchy assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
