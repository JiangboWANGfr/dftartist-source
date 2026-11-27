#include "RegisterGenerationScenariosInternal.h"
#include <iostream>
#include <stdexcept>
namespace {void need(bool b,const char *s) {if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;open.files={DFT_DEEP_FIXTURE};open.tops={"deep_top"};
    auto d=hier::Design::open(open);need(bool(d),"open");StatisticsRequest sr;sr.scope="deep_top.u";
    auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete&&s->facts.size()==1,"sink statistics");
    RegisterScenarioRequest request;request.common.resolveLogic=true;
    request.scenarios={{"BASE",{{{"deep_top.sel",0},false}}},{"OTHER",{{{"deep_top.sel",0},true}}},{"BACK",{{{"deep_top.sel",0},false}}}};
    auto r=compareRegisterGenerationScenarios(**d,*s,request);
    need(bool(r)&&r->complete&&r->impacts.size()==2,"complete three-context pipeline");
    need(r->analysis.comparisons[0].rows[0].status=="unchanged"&&r->impacts[0].rows[0].status=="changed"&&
        r->impacts[0].changedTotals.coveredBits==4,"same immediate generated source, different upstream clock");
    need(r->impacts[1].rows[0].status=="unchanged"&&r->impacts[1].changedTotals.coveredBits==0,"0-1-0 no context leakage");
    need(r->impacts[0].rows[0].events.size()==2&&r->scenarios[0].generation->graph.generators.size()==1,"clock/async complete tuple and owned graph");
    std::stop_source stop;stop.request_stop();auto cancelled=compareRegisterGenerationScenarios(**d,*s,request,{},stop.get_token());
    need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error only");
    auto bad=*s;bad.snapshot.snapshotId+="wrong";need(!compareRegisterGenerationScenarios(**d,bad,request),"different snapshot rejected");
    auto invalid=request;invalid.scenarios[1].name=invalid.scenarios[0].name;need(!compareRegisterGenerationScenarios(**d,*s,invalid),"shared duplicate-name validation");
    invalid=request;invalid.scenarios[1].inputValues.push_back({{"deep_top.sel",0},false});
    need(!compareRegisterGenerationScenarios(**d,*s,invalid),"semantic context error after baseline gives Error only");
    RegisterGenerationScenarioLimits l;l.maxEvents=1;auto prefix=compareRegisterGenerationScenarios(**d,*s,request,l);
    need(bool(prefix)&&!prefix->complete&&prefix->rows==0&&prefix->eventEntries==0,"full clock/async impact row is atomic");
    l={};l.maxWork=1;prefix=compareRegisterGenerationScenarios(**d,*s,request,l);
    need(bool(prefix)&&!prefix->complete&&prefix->rows==0&&prefix->work==1,"global impact work prefix");
    l={};l.comparison.maxCones=1;prefix=compareRegisterGenerationScenarios(**d,*s,request,l);
    need(bool(prefix)&&!prefix->complete&&prefix->structure.processedCones==1&&prefix->impacts[0].rows[0].status=="unresolved","no cone proof means unresolved");
    l={};l.maxMillis=0;need(!compareRegisterGenerationScenarios(**d,*s,request,l),"budget validation before queries");
    auto expired=detail::registerGenerationScenariosWithDeadline(**d,*s,request,{},{},{});
    need(bool(expired)&&!expired->complete&&expired->analysis.complete&&!expired->scenarios[0].generation&&
        expired->structure.work==0&&expired->rows==0,"deterministic post deadline keeps original analysis, explicit not_run");
    need(bool(compareRegisterGenerationScenarios(**d,*s,request)),"Design reusable after error/cancel/budget");
    d.value().reset();s=hier::Error{hier::ErrorCode::Internal,"released"};
    need(!r->scenarios[0].generation->graph.generators[0].fact.ref.empty()&&r->impacts[0].changedSignals[0].coverage->coveredBits==4&&
        !r->analysis.scenarios[0].profile->checks[0].control.trace->result.nodes.empty(),"owns proofs/graphs/coverage after Design/statistics release");
    std::cout<<"Deep register generation scenarios, complete events, atomic impact, deadlines and ownership passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
