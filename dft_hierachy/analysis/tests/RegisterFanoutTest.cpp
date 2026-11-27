#include "RegisterFanoutInternal.h"
#include <iostream>
#include <stdexcept>
#include <type_traits>
namespace {void need(bool b,const char *s) {if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    static_assert(std::is_same_v<RegisterFactCoverage,struct RegisterChangedSignal>);
    hier::model::OpenOptions open;open.files={DFT_FANOUT_FIXTURE};open.tops={"fanout_overlap"};
    auto d=hier::Design::open(open);need(bool(d),"open");StatisticsRequest sr;sr.scope="fanout_overlap.u";
    auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete&&s->facts.size()==2,"two sliced sink facts");
    RegisterControlOptions options;options.resolveLogic=true;auto p=profileRegisterControls(**d,*s,options);need(bool(p)&&p->complete,"profile");
    auto g=registerControlGeneration(**d,*s,*p);need(bool(g)&&g->complete,"generation");d.value().reset();
    auto r=registerGenerationFanout(*s,*p,*g);need(bool(r)&&r->complete&&r->origins.size()==2&&r->seeds.size()==1&&r->nodes.size()==2,"pure postprocess after Design release");
    need(r->links==2&&r->seeds[0].steps.size()==2&&r->seeds[0].steps[1].parent==0&&r->seeds[0].steps[1].generator==0,"shortest original generator-clock path");
    for(const auto &node:r->nodes) need(node.rawGroups.size()==2&&node.totals.factBits==13&&node.totals.coveredBits==9&&node.totals.overlapBits==4,"per-node union, not duplicated group bits");
    std::stop_source stop;stop.request_stop();auto cancelled=registerGenerationFanout(*s,*p,*g,{},stop.get_token());
    need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error");
    auto bad=*g;bad.graph.seeds[0].node=99999;need(!registerGenerationFanout(*s,*p,bad),"invalid seed graph index");
    bad=*g;bad.events[0].node=99999;need(!registerGenerationFanout(*s,*p,bad),"event/seed association mismatch");
    bad=*g;bad.graph.snapshotId+="wrong";need(!registerGenerationFanout(*s,*p,bad),"wrong graph snapshot");
    bad=*g;bad.graph.cycles.push_back({{0,0},{99999}});need(!registerGenerationFanout(*s,*p,bad),"malformed cycle proof");
    auto invalid=*p;invalid.checks[0].source->inverted=!invalid.checks[0].source->inverted;need(!registerGenerationFanout(*s,invalid,*g),"profile source proof mismatch");
    RegisterFanoutLimits l;l.maxOrigins=1;auto prefix=registerGenerationFanout(*s,*p,*g,l);
    need(bool(prefix)&&!prefix->complete&&prefix->origins.size()==1&&prefix->nodes[0].totals.coveredBits==6,"captured origin domain lower bound");
    l={};l.maxNodes=1;prefix=registerGenerationFanout(*s,*p,*g,l);
    need(bool(prefix)&&!prefix->complete&&prefix->nodes.size()==1&&!prefix->seeds[0].traversalComplete&&prefix->nodes[0].totals.coveredBits==9,"node prefix retains complete positive interval evidence");
    l={};l.maxMembers=1;prefix=registerGenerationFanout(*s,*p,*g,l);
    need(bool(prefix)&&!prefix->complete&&prefix->memberFacts==1&&prefix->nodes[0].totals.coveredBits==6&&!prefix->nodes[0].membersComplete,"member prefix and per-node completeness");
    l={};l.maxSegments=1;prefix=registerGenerationFanout(*s,*p,*g,l);
    need(bool(prefix)&&!prefix->complete&&!prefix->nodes[0].signals[0].coverage,"whole-signal coverage atomic");
    l={};l.maxWork=0;need(!registerGenerationFanout(*s,*p,*g,l),"budget validation");
    auto expired=detail::fanoutWithDeadline(*s,*p,*g,{},{},{});
    need(bool(expired)&&!expired->complete&&expired->work==0&&expired->origins.empty()&&expired->nodes.empty(),"deterministic expired deadline, no fake zero-fanout nodes");
    need(bool(registerGenerationFanout(*s,*p,*g)),"reuse after error/cancel/partial");
    s=hier::Error{hier::ErrorCode::Internal,"released"};p=hier::Error{hier::ErrorCode::Internal,"released"};g=hier::Error{hier::ErrorCode::Internal,"released"};
    need(r->seeds[0].steps[1].parent==0&&r->nodes[0].signals[0].coverage->coveredBits==9,"owns path/index/coverage containers after all inputs release");
    std::cout<<"Register fanout graph paths, interval attribution, budgets, validation and ownership passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
