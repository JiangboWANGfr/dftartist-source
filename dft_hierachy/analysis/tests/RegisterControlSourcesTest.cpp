#include "RegisterControlSourcesInternal.h"
#include <iostream>
#include <stdexcept>
namespace {unsigned checks=0;void need(bool b,const char *s) {++checks;if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;open.files={DFT_SOURCES_FIXTURE};open.tops={"sources_alias"};
    auto d=hier::Design::open(open);need(bool(d),"open");StatisticsRequest request;request.scope="sources_alias";
    auto s=registerStatistics(**d,request);need(bool(s)&&s->complete&&s->facts.size()==2,"two bus slice facts");
    RegisterControlOptions options;options.resolveLogic=true;auto p=profileRegisterControls(**d,*s,options);need(bool(p)&&p->complete,"profile");
    auto g=registerControlGeneration(**d,*s,*p);need(bool(g)&&g->complete,"graph");d.value().reset();
    auto r=summarizeRegisterControlSources(*s,*p,*g);need(bool(r)&&r->complete&&r->groups.size()==1,"pure source summary after Design release");
    const auto &v=r->groups[0];need(v.nodes.size()==2&&v.rawGroups.size()==2&&v.signals.size()==1,"merge aliases, preserve raw events and nodes");
    need(v.totals.facts==2&&v.totals.factBits==13&&v.totals.coveredBits==9&&v.totals.overlapBits==4,"union aliases once");
    need(r->attributionsComplete&&r->checkedSignals==1&&r->crossGroupBits==0&&r->attributions.empty(),"one proven identity, no fabricated cross-source overlap");
    std::stop_source cancel;cancel.request_stop();auto stopped=summarizeRegisterControlSources(*s,*p,*g,{},cancel.get_token());
    need(!stopped&&stopped.error().code==hier::ErrorCode::Cancelled,"pre-cancel error");
    auto bad=*g;bad.graph.seeds[0].node=99999;need(!summarizeRegisterControlSources(*s,*p,bad),"shared graph validation");
    bad=*g;bad.graph.scope+="wrong";need(!summarizeRegisterControlSources(*s,*p,bad),"scope mismatch");
    auto bp=*p;bp.snapshotId+="wrong";need(!summarizeRegisterControlSources(*s,bp,*g),"snapshot mismatch");
    RegisterSourceLimits l;l.maxMembers=1;auto partial=summarizeRegisterControlSources(*s,*p,*g,l);
    need(bool(partial)&&!partial->complete&&partial->memberFacts==1&&partial->groups[0].totals.coveredBits==6&&!partial->groups[0].membersComplete&&!partial->attributionsComplete,"member prefix retains six proven bits");
    l={};l.maxSegments=1;partial=summarizeRegisterControlSources(*s,*p,*g,l);
    need(bool(partial)&&!partial->complete&&!partial->groups[0].signals[0].coverage,"atomic group signal coverage");
    l={};l.maxRows=1;partial=summarizeRegisterControlSources(*s,*p,*g,l);
    need(bool(partial)&&!partial->complete&&partial->rows.size()==1&&partial->groups[0].nodes.size()==1,"atomic row and reverse membership prefix");
    l={};l.fanout.maxMembers=1;partial=summarizeRegisterControlSources(*s,*p,*g,l);
    need(bool(partial)&&!partial->complete&&!partial->groups[0].membersComplete,"never upgrade incomplete input node membership");
    l={};l.maxWork=0;need(!summarizeRegisterControlSources(*s,*p,*g,l),"post budget validation");
    l={};l.fanout.maxLinks=0;need(!summarizeRegisterControlSources(*s,*p,*g,l),"nested fanout budget validation");
    auto expired=detail::sourcesWithDeadline(*s,*p,*g,{},{},{});
    need(bool(expired)&&!expired->complete&&expired->work==0&&expired->rows.empty()&&expired->groups.empty()&&expired->fanout.complete,"deterministic post expiry retains successful input evidence");
    need(bool(summarizeRegisterControlSources(*s,*p,*g)),"reuse after error/cancel/partial");
    s=hier::Error{hier::ErrorCode::Internal,"released"};p=hier::Error{hier::ErrorCode::Internal,"released"};g=hier::Error{hier::ErrorCode::Internal,"released"};
    need(r->groups[0].source.kind=="primary_input"&&r->groups[0].signals[0].coverage->coveredBits==9&&r->fanout.origins.size()==2,"owns source/fanout/coverage after input release");
    std::cout<<checks<<" register control sources assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
