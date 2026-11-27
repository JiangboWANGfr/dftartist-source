#include "RegisterScenariosInternal.h"
#include <iostream>
#include <stdexcept>
namespace {void need(bool b,const char *s) {if (!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;open.files={DFT_REGISTER_SCENARIOS_FIXTURE};open.tops={"scenarios_reindex"};
    auto d=hier::Design::open(open);need(bool(d),"open RTL");StatisticsRequest sr;sr.scope="scenarios_reindex";
    auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete,"statistics once");
    RegisterScenarioRequest r;r.common.resolveLogic=true;
    r.scenarios={{"OFF",{{{"scenarios_reindex.sel",0},false}}},{"ON",{{{"scenarios_reindex.sel",0},true}}},{"BACK",{{{"scenarios_reindex.sel",0},false}}}};
    auto value=compareRegisterScenarios(**d,*s,r);need(bool(value)&&value->complete&&value->comparisons.size()==2,"batch");
    const auto &c=value->comparisons[0];need(c.rows.size()==3&&c.rows[0].status=="changed"&&c.rows[1].status=="unchanged"&&
        c.rows[1].baselineGroup!=c.rows[1].scenarioGroup&&c.changedTotals.coveredBits==4,"identities, not per-context group numbers");
    need(value->comparisons[1].changedTotals.coveredBits==0&&value->comparisons[1].rows[0].status=="unchanged","same Design 0-1-0");
    need(value->events.groups.size()==value->scenarios[0].profile->events.groups.size(),"one shared raw grouping");
    std::stop_source stop;stop.request_stop();auto cancelled=compareRegisterScenarios(**d,*s,r,stop.get_token());
    need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel");
    auto expired=detail::registerScenariosWithDeadline(**d,*s,r,{},{});
    need(bool(expired)&&!expired->complete&&expired->work==0&&!expired->scenarios[0].profile&&!expired->scenarios[1].resolved&&
        expired->events.groups.size()==3&&expired->comparisons[0].rows.empty(),"not_run retains shared facts, no fake empty success");
    auto bad=*s;bad.snapshot.snapshotId+="wrong";need(!compareRegisterScenarios(**d,bad,r),"wrong snapshot");
    auto invalid=r;invalid.scenarios[1].name=invalid.scenarios[0].name;need(!compareRegisterScenarios(**d,*s,invalid),"duplicate names");
    invalid=r;invalid.scenarios[1].name=std::string("bad")+char(0xff);auto utf8=compareRegisterScenarios(**d,*s,invalid);
    need(!utf8&&utf8.error().code==hier::ErrorCode::BadRequest&&utf8.error().message.find(char(0xff))==std::string::npos,"shared UTF8 validation");
    invalid=r;invalid.scenarios[1].inputValues={{{"scenarios_reindex.sel",0},true},{{"scenarios_reindex.sel",0},false}};
    need(!compareRegisterScenarios(**d,*s,invalid),"semantic input duplicate after prior context, Error only");
    invalid=r;invalid.maxComparisons=1;auto capped=compareRegisterScenarios(**d,*s,invalid);
    need(bool(capped)&&!capped->complete&&capped->comparisonRows==1,"global comparison rows");
    invalid=r;invalid.maxMembers=1;auto member=compareRegisterScenarios(**d,*s,invalid);
    need(bool(member)&&member->complete,"one changed fact succeeds at member capacity; unchanged context does not consume it");
    need(bool(compareRegisterScenarios(**d,*s,r)),"reuse after invalid/cancel/truncation");
    d.value().reset();s=hier::Error{hier::ErrorCode::Internal,"released"};
    need(!value->scenarios[0].profile->checks[0].control.trace->result.nodes.empty()&&
        !value->scenarios[1].resolved->groups[0].clock.source.point->slice.ref.empty()&&
        value->comparisons[0].changedSignals[0].facts.size()==1,"owns evidence, sources and index containers after input/Design release");
    std::cout<<"Register scenarios source identity, bit union, UTF8, budgets, states, cancellation and ownership passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
