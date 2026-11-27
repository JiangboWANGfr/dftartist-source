#include "RegisterGenerationInternal.h"
#include <iostream>
#include <stdexcept>
namespace {void need(bool b,const char *s) {if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;open.files={DFT_REGISTER_GENERATION_FIXTURE};open.tops={"rg_top"};
    auto d=hier::Design::open(open);need(bool(d),"open");StatisticsRequest sr;sr.scope="rg_top.u";
    auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete&&s->facts.size()==1,"one sink fact");
    RegisterControlOptions options;options.resolveLogic=true;auto p=profileRegisterControls(**d,*s,options);
    need(bool(p)&&p->complete&&p->checks.size()==2,"two generated clock/reset controls");
    auto r=registerControlGeneration(**d,*s,*p);
    need(bool(r)&&r->complete&&r->graph.generators.size()==3&&r->events.size()==2,"three generated registers outside scoped sink");
    need(!r->events[0].asyncIndex&&r->events[1].asyncIndex==0&&r->events[0].node&&r->events[1].node,"original ordered event to seed mapping");
    need(r->graph.registerPages.size()==1&&r->graph.registerFacts==3,"original owner lookup once");
    std::stop_source stop;stop.request_stop();auto cancel=registerControlGeneration(**d,*s,*p,{},stop.get_token());
    need(!cancel&&cancel.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error only");
    auto bad=*p;bad.groupControls[0].clockCheck=99999;need(!registerControlGeneration(**d,*s,bad),"malformed event check");
    bad=*p;bad.checks[0].source->inverted=!bad.checks[0].source->inverted;need(!registerControlGeneration(**d,*s,bad),"source proof mismatch");
    bad=*p;bad.snapshotId+="other";need(!registerControlGeneration(**d,*s,bad),"profile snapshot");
    auto d2=hier::Design::open(open);need(bool(d2)&&!registerControlGeneration(**d2,*s,*p),"different Design snapshot");
    RegisterGenerationLimits l;l.maxEvents=1;auto prefix=registerControlGeneration(**d,*s,*p,l);
    need(bool(prefix)&&!prefix->complete&&!prefix->mappingComplete&&prefix->graph.complete&&prefix->events.size()==1,"mapping prefix keeps complete graph");
    l={};l.generation.maxControls=1;prefix=registerControlGeneration(**d,*s,*p,l);
    need(bool(prefix)&&!prefix->complete&&!prefix->mappingComplete&&prefix->events.size()==2&&prefix->events[0].node&&!prefix->events[1].node,"unvisited seed is not fake node zero");
    l={};l.maxEvents=0;need(!registerControlGeneration(**d,*s,*p,l),"budget validation");
    auto future=std::chrono::steady_clock::now()+std::chrono::seconds(10);
    auto expired=detail::registerGenerationWithDeadlines(**d,*s,*p,{},future,{},{});
    need(bool(expired)&&!expired->complete&&expired->graph.complete&&expired->events.empty()&&expired->work==0,"deterministic mapping deadline");
    expired=detail::registerGenerationWithDeadlines(**d,*s,*p,{},{},future,{});
    need(bool(expired)&&!expired->complete&&expired->graph.work==0&&expired->graph.seeds.empty()&&expired->events.size()==2,"deterministic graph deadline");
    need(bool(registerControlGeneration(**d,*s,*p)),"reuse after error/cancel/partial");
    d.value().reset();p=hier::Error{hier::ErrorCode::Internal,"released"};s=hier::Error{hier::ErrorCode::Internal,"released"};
    need(!r->graph.generators[0].fact.ref.empty()&&!r->graph.nodes[0].source->sourceRef->empty()&&r->events[1].node,"owns returned graph and mappings");
    std::cout<<"Register generation graph, ordered mapping, budgets, validation, cancellation and ownership passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
