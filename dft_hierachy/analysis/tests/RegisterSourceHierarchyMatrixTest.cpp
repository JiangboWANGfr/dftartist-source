#include "RegisterSourceHierarchyMatrixInternal.h"
#include "RegisterStatisticsInternal.h"
#include <iostream>
#include <stdexcept>
namespace {unsigned checks=0;void need(bool b,const char *s) {++checks;if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;open.files={DFT_HIERARCHY_FIXTURE,DFT_HIERARCHY_BASE,DFT_MATRIX_MULTI};open.tops={"hierarchy_root"};auto d=hier::Design::open(open);need(bool(d),"open");
    StatisticsRequest sr;sr.scope="hierarchy_root";sr.recursive=true;auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete,"statistics");
    RegisterScenarioRequest request;request.common.resolveLogic=true;request.scenarios={{"ZERO",{{{"hierarchy_root.mode",0},false}}},{"ONE",{{{"hierarchy_root.mode",0},true}}},{"BACK",{{{"hierarchy_root.mode",0},false}}}};
    auto r=compareRegisterSourceHierarchyMatrix(**d,*s,request);need(bool(r)&&r->complete&&r->comparisons.size()==2,"complete pipeline");const auto &c=r->comparisons[0];
    need(c.inputCollected&&c.inputComplete&&c.sourcesComplete&&c.inputNodes==7&&c.inputMembers==25&&c.rows.size()==14,"role incidence domain");
    need(r->rows==21&&r->members==38&&r->inputMembers==38&&r->inputNodes==14&&r->analysis.queries==9,"published and complete collection counters, no added Core query");
    size_t removed=0,added=0;
    for(const auto &row:c.rows) {
        need(row.counts.baselineBits==row.counts.removedBits+row.counts.retainedBits&&row.counts.scenarioBits==row.counts.addedBits+row.counts.retainedBits,"source-specific set identities");
        if(row.node==0&&row.counts.removedBits==16) {++removed;need(row.counts.baselineBits==18&&row.counts.scenarioBits==2&&row.counts.retainedBits==2&&row.members.size()==5,"root source retains local two, removes descendant sixteen");}
        if(row.node==0&&row.counts.addedBits==16) {++added;need(row.counts.baselineBits==0&&row.counts.scenarioBits==16&&row.members.size()==4,"root new source");}
        need(!row.members.empty(),"no invented empty source-node row");
    }
    need(removed==1&&added==1&&r->comparisons[1].rows.size()==7,"two source roots and independent BACK");
    RegisterSourceHierarchyMatrixLimits l;l.maxRows=1;auto p=compareRegisterSourceHierarchyMatrix(**d,*s,request,l);
    need(bool(p)&&!p->complete&&p->rows==1&&p->comparisons[0].rows[0].counts.baselineBits==c.rows[0].counts.baselineBits&&p->comparisons[0].rows[0].members.size()==c.rows[0].members.size(),"complete source-node pair prefix");
    need(p->comparisons[1].state=="not_run","later comparison not run");
    l={};l.maxMembers=1;p=compareRegisterSourceHierarchyMatrix(**d,*s,request,l);need(bool(p)&&!p->complete&&p->rows==0&&p->members==0&&p->comparisons[0].inputCollected,"no half pair member admission");
    for(int budget=0;budget<3;++budget) {
        l={};if(budget==0) l.maxInputNodes=1;else if(budget==1) l.maxInputMembers=1;else l.maxWork=1;
        p=compareRegisterSourceHierarchyMatrix(**d,*s,request,l);need(bool(p)&&!p->complete&&p->rows==0&&p->inputNodes==0&&p->inputMembers==0&&!p->comparisons[0].inputCollected&&p->comparisons[0].inputNodes==7,"no partial collection/counters; input metadata remains");
    }
    l={};l.hierarchy.maxNodes=1;p=compareRegisterSourceHierarchyMatrix(**d,*s,request,l);need(bool(p)&&!p->complete&&!p->comparisons[0].inputComplete&&p->comparisons[0].rows.size()==2,"prior partial retains root positive source evidence");
    auto expired=detail::sourceHierarchyMatrixWithDeadline(**d,*s,request,{},{},{});need(bool(expired)&&!expired->complete&&expired->analysis.complete&&expired->work==0&&expired->rows==0&&!expired->comparisons[0].inputCollected&&expired->comparisons[0].inputComplete,"deterministic post expiry retains hierarchy");
    auto bad=*s;bad.snapshot.snapshotId+="bad";need(!compareRegisterSourceHierarchyMatrix(**d,bad,request),"old snapshot validation");
    bad=*s;bad.instances[0].info.pathText+="bad";need(!compareRegisterSourceHierarchyMatrix(**d,bad,request),"old Core identity validation");
    auto br=request;br.scenarios[1].name=br.scenarios[0].name;need(!compareRegisterSourceHierarchyMatrix(**d,*s,br),"duplicate names");br=request;br.scenarios[1].inputValues.push_back({{"hierarchy_root.mode",0},false});need(!compareRegisterSourceHierarchyMatrix(**d,*s,br),"second context error no half batch");
    std::stop_source stop;stop.request_stop();auto cancelled=compareRegisterSourceHierarchyMatrix(**d,*s,request,{},stop.get_token());need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error");
    l={};l.maxRows=0;need(!compareRegisterSourceHierarchyMatrix(**d,*s,request,l),"post limits");l={};l.hierarchy.maxQueries=0;need(!compareRegisterSourceHierarchyMatrix(**d,*s,request,l),"nested limits");need(bool(compareRegisterSourceHierarchyMatrix(**d,*s,request)),"reuse after errors/cancellation");
    sr.scope="hierarchy_root.left";auto scoped=registerStatistics(**d,sr);need(bool(scoped),"scope stats");auto one=compareRegisterSourceHierarchyMatrix(**d,*scoped,request);need(bool(one)&&one->complete&&one->comparisons[0].rows.size()==6&&one->analysis.queries==5,"actual in-scope nodes only");
    open.tops={"transitions_multi_sources"};auto multi=hier::Design::open(open);need(bool(multi),"multi-source open");sr.scope="transitions_multi_sources";auto ms=registerStatistics(**multi,sr);need(bool(ms),"multi-source stats");auto mr=request;mr.scenarios={{"ZERO",{{{"transitions_multi_sources.sel",0},false}}},{"ONE",{{{"transitions_multi_sources.sel",0},true}}}};
    auto mix=compareRegisterSourceHierarchyMatrix(**multi,*ms,mr);need(bool(mix)&&mix->complete&&mix->comparisons[0].rows.size()==3,"multi-source set transition");size_t add=0,remove=0,retain=0;
    for(const auto &row:mix->comparisons[0].rows) {add+=row.counts.addedBits==4;remove+=row.counts.removedBits==4;retain+=row.counts.retainedBits==4;need(row.members.size()==1,"one state segment per source, not one guessed transfer");}
    need(add==1&&remove==1&&retain==1,"a removed/b retained/c added despite globally changed segment");
    need(std::string(sourceHierarchyRoleName(SourceHierarchyRole::Retained))=="retained","one role serialization mapping");
    StatisticsRequest er;er.scope="hierarchy_root";er.recursive=true;auto empty=detail::statisticsWithDeadline(**d,er,{},{});
    need(bool(empty)&&!empty->complete&&empty->instances.empty(),"real empty producer without DTO changes");
    auto emptyReport=compareRegisterSourceHierarchyMatrix(**d,*empty,request);
    need(bool(emptyReport)&&!emptyReport->complete&&!emptyReport->analysis.scope&&emptyReport->analysis.queries==0&&emptyReport->rows==0&&emptyReport->members==0&&emptyReport->inputNodes==0&&emptyReport->inputMembers==0&&emptyReport->work==0,"matrix inherits omitted scope and zero work without rejecting valid resource truncation");
    for(const auto &v:emptyReport->comparisons) need(v.state=="partial"&&v.inputCollected&&!v.inputComplete&&!v.sourcesComplete&&v.rows.empty()&&v.inputNodes==0,"matrix empty comparisons remain partial");
    auto emptyDeadline=detail::sourceHierarchyMatrixWithDeadline(**d,*empty,request,{},{},{});need(bool(emptyDeadline)&&!emptyDeadline->complete&&emptyDeadline->work==0&&emptyDeadline->rows==0&&!emptyDeadline->comparisons[0].inputCollected,"own matrix deadline remains independent");
    auto emptyCancelled=compareRegisterSourceHierarchyMatrix(**d,*empty,request,{},stop.get_token());need(!emptyCancelled&&emptyCancelled.error().code==hier::ErrorCode::Cancelled,"empty matrix pre-cancel Error");
    bad=*empty;bad.complete=true;auto forged=compareRegisterSourceHierarchyMatrix(**d,bad,request);need(!forged&&forged.error().code==hier::ErrorCode::BadRequest,"matrix still rejects forged complete empty stats");
    bad=*empty;bad.snapshot.snapshotId+="bad";need(!compareRegisterSourceHierarchyMatrix(**d,bad,request),"empty matrix snapshot validation");
    er.scope="hierarchy_root.left";er.recursive=false;auto noLocal=registerStatistics(**d,er);need(bool(noLocal)&&noLocal->complete&&noLocal->facts.empty(),"visited complete scope without local registers");
    auto known=compareRegisterSourceHierarchyMatrix(**d,*noLocal,request);need(bool(known)&&known->complete&&known->analysis.scope&&known->analysis.queries==1&&known->rows==0,"empty local state differs from unvisited partial scope");
    need(bool(compareRegisterSourceHierarchyMatrix(**d,*s,request)),"ordinary matrix reuse after partial/invalid inputs");
    d.value().reset();s=hier::Error{hier::ErrorCode::Internal,"released"};need(c.rows.size()==14&&c.rows[0].members.size()>=1&&r->analysis.scope->pathText=="hierarchy_root"&&r->analysis.analysis.analysis.comparisons[0].cohorts.size()>=1,"owned new rows and original proofs after input release");
    need(!emptyReport->complete&&!emptyReport->analysis.scope&&emptyReport->comparisons.size()==2,"owned empty matrix evidence after release");
    std::cout<<checks<<" source hierarchy matrix assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
