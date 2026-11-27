#include "RegisterSourceTransitionsInternal.h"
#include <iostream>
#include <stdexcept>
namespace {unsigned checks=0;void need(bool b,const char *s) {++checks;if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;open.files={DFT_TRANSITION_BASE,DFT_TRANSITION_FIXTURE};open.tops={"sources_move"};
    auto d=hier::Design::open(open);need(bool(d),"open");StatisticsRequest sr;sr.scope="sources_move";
    auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete,"statistics");RegisterScenarioRequest request;request.common.resolveLogic=true;
    request.scenarios={{"BASE",{{{"sources_move.sel",0},false}}},{"OTHER",{{{"sources_move.sel",0},true}}},{"BACK",{{{"sources_move.sel",0},false}}}};
    auto r=compareRegisterSourceTransitions(**d,*s,request);need(bool(r)&&r->complete&&r->comparisons.size()==2,"actual complete pipeline");
    const auto &c=r->comparisons[0];need(c.inputComplete&&c.sourcesComplete&&c.inputCollected&&c.state=="complete","three independent completion facts");
    need(c.cohorts.size()==3&&c.totals.coveredBits==9&&c.totals.changedBits==7&&c.totals.retainedOnlyBits==2,"unique counts preserved");
    need(c.cohorts[0].baselineSources==std::vector<size_t>{0}&&c.cohorts[0].scenarioSources==std::vector<size_t>{0}&&!c.cohorts[0].changed,"lexicographic first retained group");
    need(c.cohorts[1].scenarioSources==std::vector<size_t>{0,1}&&c.cohorts[1].counts.changedBits==4,"source added alongside retained root");
    need(c.cohorts[2].baselineSources==std::vector<size_t>{0}&&c.cohorts[2].scenarioSources==std::vector<size_t>{1}&&c.cohorts[2].counts.changedBits==3,"set transfer group");
    need(c.cohorts[0].members[0].row==0&&c.cohorts[0].members[0].segment==2,"member references original attribution ordering");
    need(r->cohorts==4&&r->members==4&&r->sources==9&&r->inputSegments==4,"global committed counters");
    need(r->comparisons[1].cohorts.size()==1&&!r->comparisons[1].cohorts[0].changed&&r->comparisons[1].totals.retainedOnlyBits==9,"0/1/0 isolated source identities");
    RegisterSourceTransitionLimits l;l.maxCohorts=1;auto p=compareRegisterSourceTransitions(**d,*s,request,l);
    need(bool(p)&&!p->complete&&p->cohorts==1&&p->members==1&&p->sources==2&&p->comparisons[0].totals.coveredBits==2&&p->comparisons[1].state=="not_run","whole cohort prefix across comparisons");
    l={};l.maxMembers=1;p=compareRegisterSourceTransitions(**d,*s,request,l);
    need(bool(p)&&!p->complete&&p->cohorts==1&&p->comparisons[0].cohorts[0].counts.coveredBits==2,"member cap retains earlier complete group");
    for(unsigned flag=0;flag<3;++flag) {
        l={};if(flag==0) l.maxSources=1;else if(flag==1) l.maxInputSegments=1;else l.maxWork=1;
        p=compareRegisterSourceTransitions(**d,*s,request,l);need(bool(p)&&!p->complete&&p->cohorts==0&&p->members==0&&p->sources==0,"atomic output counts");
        if(flag) need(!p->comparisons[0].inputCollected&&p->inputSegments==0,"no half input collection");
    }
    l={};l.attribution.maxRows=1;p=compareRegisterSourceTransitions(**d,*s,request,l);
    need(bool(p)&&!p->complete&&p->comparisons[1].inputComplete==false&&p->comparisons[1].sourcesComplete,"known source proof does not imply output complete");
    l={};l.attribution.deltas.maxRows=1;p=compareRegisterSourceTransitions(**d,*s,request,l);
    need(bool(p)&&!p->complete&&!p->comparisons[0].sourcesComplete&&!p->comparisons[0].cohorts.empty(),"known partial sets preserve positive evidence");
    l={};l.attribution.deltas.scenarios.sources.maxRows=1;p=compareRegisterSourceTransitions(**d,*s,request,l);
    need(bool(p)&&!p->complete&&!p->comparisons[0].sourcesComplete&&p->cohorts==0,"unknown creates no transition proof");
    std::stop_source stop;stop.request_stop();auto cancelled=compareRegisterSourceTransitions(**d,*s,request,{},stop.get_token());
    need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error");
    auto bad=*s;bad.snapshot.snapshotId+="bad";need(!compareRegisterSourceTransitions(**d,bad,request),"shared snapshot validation");
    auto invalid=request;invalid.scenarios[1].name=invalid.scenarios[0].name;need(!compareRegisterSourceTransitions(**d,*s,invalid),"duplicate name");
    invalid=request;invalid.scenarios[1].inputValues.push_back({{"sources_move.sel",0},false});need(!compareRegisterSourceTransitions(**d,*s,invalid),"second context error without half batch");
    l={};l.maxCohorts=0;need(!compareRegisterSourceTransitions(**d,*s,request,l),"outer budgets validate");
    l={};l.attribution.maxRows=0;need(!compareRegisterSourceTransitions(**d,*s,request,l),"nested budgets validate");
    auto expired=detail::sourceTransitionsWithDeadline(**d,*s,request,{},{},{});
    need(bool(expired)&&!expired->complete&&expired->analysis.complete&&expired->work==0&&expired->cohorts==0&&!expired->comparisons[0].inputCollected,"post expiry retains original attribution");
    need(bool(compareRegisterSourceTransitions(**d,*s,request)),"reuse after errors cancel partial");
    open.files={DFT_TRANSITION_FIXTURE};open.tops={"transitions_shared"};auto shared=hier::Design::open(open);need(bool(shared),"open multi signal");sr.scope="transitions_shared";
    auto ss=registerStatistics(**shared,sr);need(bool(ss),"shared statistics");auto two=request;two.scenarios={{"BASE",{{{"transitions_shared.sel",0},false}}},{"OTHER",{{{"transitions_shared.sel",0},true}}}};
    auto group=compareRegisterSourceTransitions(**shared,*ss,two);need(bool(group)&&group->complete&&group->cohorts==1&&group->members==2&&group->comparisons[0].totals.changedBits==8,"multiple signals share one exact source pair");
    l={};l.maxMembers=1;auto capped=compareRegisterSourceTransitions(**shared,*ss,two,l);
    need(bool(capped)&&!capped->complete&&capped->cohorts==0&&capped->members==0&&capped->sources==0&&capped->inputSegments==2,"whole multi-member cohort atomic");
    d.value().reset();s=hier::Error{hier::ErrorCode::Internal,"released"};
    need(c.cohorts[2].counts.coveredBits==3&&r->analysis.comparisons[0].rows[c.cohorts[2].members[0].row].segments[c.cohorts[2].members[0].segment].bits.width==3,"owned cohorts and original evidence after inputs released");
    std::cout<<checks<<" source transition assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
