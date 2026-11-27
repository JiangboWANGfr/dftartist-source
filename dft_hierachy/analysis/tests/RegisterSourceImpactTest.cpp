#include "RegisterSourceImpactInternal.h"
#include <iostream>
#include <limits>
#include <stdexcept>
namespace {unsigned checks=0;void need(bool b,const char *s) {++checks;if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;open.files={DFT_IMPACT_FIXTURE,DFT_IMPACT_BASE};open.tops={"impact_top"};auto d=hier::Design::open(open);need(bool(d),"open");
    StatisticsRequest sr;sr.scope="impact_top";sr.recursive=true;auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete,"statistics");
    RegisterScenarioRequest request;request.common.resolveLogic=true;request.scenarios={{"ZERO",{{{"impact_top.mode",0},false}}},{"ONE",{{{"impact_top.mode",0},true}}},{"BACK",{{{"impact_top.mode",0},false}}}};
    auto r=compareRegisterSourceImpact(**d,*s,request);need(bool(r)&&r->complete&&r->comparisons.size()==2,"complete actual pipeline");const auto &c=r->comparisons[0];
    need(c.inputComplete&&c.sourcesComplete&&c.inputCollected&&c.instances.size()==3&&c.definitions.size()==2,"instance and definition domains");
    need(c.totals.coveredBits==10&&c.totals.changedBits==8&&c.totals.retainedOnlyBits==2,"unique hierarchical bits");
    size_t leafInstances=0;
    for(const auto &v:c.definitions) {
        need(v.instances.size()>=1,"published definition has instances");
        if(s->definitions[v.definition].name=="impact_leaf") {leafInstances=v.instances.size();need(v.counts.coveredBits==8&&v.counts.changedBits==8,"same definition does not deduplicate two instances");}
    }
    need(leafInstances==2&&r->comparisons[1].totals.changedBits==0&&r->comparisons[1].totals.retainedOnlyBits==10,"two instances and 0/1/0 isolation");
    uint64_t members=0;
    for(const auto &v:c.instances) {need(v.definition==s->instances[v.instance].definition,"original instance definition mapping");members+=v.members.size();}
    need(members==3&&r->members==6&&r->instanceRows==6&&r->definitionRows==4,"committed counters");
    const auto &ref=c.instances[0].members[0];need(ref.cohort<r->analysis.comparisons[0].cohorts.size(),"original cohort/member reference");
    RegisterSourceImpactLimits l;l.maxInstances=1;auto p=compareRegisterSourceImpact(**d,*s,request,l);
    need(bool(p)&&!p->complete&&p->instanceRows==1&&p->definitionRows==1&&p->comparisons[0].instances.size()==1&&p->comparisons[0].definitions[0].instances.size()==1,"instance and definition commit together");
    need(p->comparisons[1].state=="not_run","later comparison not run after cap");
    l={};l.maxDefinitions=1;p=compareRegisterSourceImpact(**d,*s,request,l);need(bool(p)&&!p->complete&&p->definitionRows==1&&!p->comparisons[0].instances.empty(),"definition admission keeps instance prefix");
    for(const bool work:{false,true}) {
        l={};if(work) l.maxWork=1;else l.maxInputMembers=1;p=compareRegisterSourceImpact(**d,*s,request,l);
        need(bool(p)&&!p->complete&&!p->comparisons[0].inputCollected&&p->inputMembers==0&&p->instanceRows==0&&p->definitionRows==0&&p->members==0,"no half collection or counters");
    }
    l={};l.transitions.maxCohorts=1;p=compareRegisterSourceImpact(**d,*s,request,l);
    need(bool(p)&&!p->complete&&!p->comparisons[0].inputComplete&&p->comparisons[0].sourcesComplete&&!p->comparisons[0].instances.empty(),"partial known-source evidence not upgraded");
    auto bad=*s;const auto ii=bad.signals[0].instance;const auto di=bad.instances[ii].definition;bad.instances[ii].definition=std::numeric_limits<size_t>::max();
    auto invalid=compareRegisterSourceImpact(**d,bad,request);need(!invalid&&invalid.error().code==hier::ErrorCode::BadRequest,"used definition index validated");
    bad=*s;bad.definitions[di].instances.clear();need(!compareRegisterSourceImpact(**d,bad,request),"missing definition membership rejected");
    bad=*s;bad.definitions[di].instances.push_back(ii);need(!compareRegisterSourceImpact(**d,bad,request),"duplicate definition membership rejected");
    bad=*s;bad.definitions[di].ref+="bad";need(!compareRegisterSourceImpact(**d,bad,request),"definition identity mismatch rejected");
    bad=*s;bad.snapshot.snapshotId+="bad";need(!compareRegisterSourceImpact(**d,bad,request),"shared snapshot validator");
    std::stop_source stop;stop.request_stop();auto cancelled=compareRegisterSourceImpact(**d,*s,request,{},stop.get_token());need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error");
    auto br=request;br.scenarios[1].name=br.scenarios[0].name;need(!compareRegisterSourceImpact(**d,*s,br),"duplicate names");br=request;br.scenarios[1].inputValues.push_back({{"impact_top.mode",0},false});need(!compareRegisterSourceImpact(**d,*s,br),"second context no half batch");
    l={};l.maxInstances=0;need(!compareRegisterSourceImpact(**d,*s,request,l),"post budgets validate");l={};l.transitions.maxSources=0;need(!compareRegisterSourceImpact(**d,*s,request,l),"nested budgets validate");
    auto expired=detail::sourceImpactWithDeadline(**d,*s,request,{},{},{});need(bool(expired)&&!expired->complete&&expired->analysis.complete&&expired->work==0&&expired->instanceRows==0&&!expired->comparisons[0].inputCollected,"post deadline preserves full transition report");
    need(bool(compareRegisterSourceImpact(**d,*s,request)),"reuse after errors and cancellation");
    sr.scope="impact_top.u1";sr.recursive=false;auto scoped=registerStatistics(**d,sr);need(bool(scoped),"scoped statistics");auto one=compareRegisterSourceImpact(**d,*scoped,request);need(bool(one)&&one->complete&&one->comparisons[0].instances.size()==1&&one->comparisons[0].totals.changedBits==4,"explicit scope original indices");
    open.tops={"sources_move"};auto local=hier::Design::open(open);need(bool(local),"open one multi-member instance");sr.scope="sources_move";auto ms=registerStatistics(**local,sr);need(bool(ms),"multi-member statistics");auto mr=request;mr.scenarios={{"ZERO",{{{"sources_move.sel",0},false}}},{"ONE",{{{"sources_move.sel",0},true}}}};
    l={};l.maxMembers=1;auto capped=compareRegisterSourceImpact(**local,*ms,mr,l);need(bool(capped)&&!capped->complete&&capped->instanceRows==0&&capped->definitionRows==0&&capped->members==0&&capped->comparisons[0].inputCollected,"whole instance members and definition atomic");
    d.value().reset();s=hier::Error{hier::ErrorCode::Internal,"released"};need(c.instances.size()==3&&c.definitions.size()==2&&c.totals.changedBits==8&&r->analysis.comparisons[0].cohorts[ref.cohort].members.size()>=1,"owned result after input release");
    std::cout<<checks<<" source impact assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
