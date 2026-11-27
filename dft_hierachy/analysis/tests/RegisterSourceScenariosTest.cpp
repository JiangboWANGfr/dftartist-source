#include "RegisterSourceScenariosInternal.h"
#include <iostream>
#include <stdexcept>
namespace {unsigned checks=0;void need(bool b,const char *s) {++checks;if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;open.files={DFT_SOURCE_SCENARIOS_FIXTURE};open.tops={"sources_move"};
    auto d=hier::Design::open(open);need(bool(d),"open");StatisticsRequest sr;sr.scope="sources_move";
    auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete&&s->facts.size()==2,"two original state facts");
    RegisterScenarioRequest request;request.common.resolveLogic=true;
    request.scenarios={{"BASE",{{{"sources_move.sel",0},false}}},{"OTHER",{{{"sources_move.sel",0},true}}},{"BACK",{{{"sources_move.sel",0},false}}}};
    auto r=compareRegisterSourceScenarios(**d,*s,request);
    need(bool(r)&&r->complete&&r->rows.size()==2&&r->scenarios.size()==3,"complete three-context source coverage matrix");
    for(const auto &row:r->rows) need(row.groups.size()==3&&row.status==std::vector<std::string>{"changed","unchanged"},"source appearance and coverage changes, 0/1/0 isolation");
    need(r->scenarios[0].sources->groups[0].totals.coveredBits==9&&r->scenarios[1].sources->groups[0].totals.coveredBits==6&&r->scenarios[2].sources->groups[0].totals.coveredBits==9,"same root loses and regains bits");
    need(r->scenarios[1].sources->crossGroupBits==4,"overlap evidence retained");
    std::stop_source stop;stop.request_stop();auto cancelled=compareRegisterSourceScenarios(**d,*s,request,{},stop.get_token());
    need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error only");
    auto bad=*s;bad.snapshot.snapshotId+="wrong";need(!compareRegisterSourceScenarios(**d,bad,request),"snapshot validation");
    auto invalid=request;invalid.scenarios[1].name=invalid.scenarios[0].name;need(!compareRegisterSourceScenarios(**d,*s,invalid),"duplicate names");
    invalid=request;invalid.scenarios[1].inputValues.push_back({{"sources_move.sel",0},false});
    need(!compareRegisterSourceScenarios(**d,*s,invalid),"contradictory second scenario returns Error, no half batch");
    RegisterSourceScenarioLimits l;l.maxRows=1;auto partial=compareRegisterSourceScenarios(**d,*s,request,l);
    need(bool(partial)&&!partial->complete&&partial->rows.size()==1&&partial->cells==3,"whole source row prefix");
    l={};l.maxCells=2;partial=compareRegisterSourceScenarios(**d,*s,request,l);
    need(bool(partial)&&!partial->complete&&partial->rows.empty()&&partial->cells==0,"never publish a half context row");
    l={};l.maxIntervals=1;partial=compareRegisterSourceScenarios(**d,*s,request,l);
    need(bool(partial)&&!partial->complete&&partial->rows.empty()&&partial->intervals==0,"canonical interval admission and row commit atomic");
    l={};l.maxWork=1;partial=compareRegisterSourceScenarios(**d,*s,request,l);
    need(bool(partial)&&!partial->complete&&!partial->indexComplete&&partial->work==1&&partial->rows.empty(),"unfinished index cannot establish absence");
    l={};l.sources.maxRows=1;partial=compareRegisterSourceScenarios(**d,*s,request,l);
    need(bool(partial)&&!partial->complete&&partial->rows[0].status[0]=="unresolved","partial source context never proves zero/missing coverage");
    l={};l.maxMillis=0;need(!compareRegisterSourceScenarios(**d,*s,request,l),"post limit validation");
    l={};l.sources.fanout.maxLinks=0;need(!compareRegisterSourceScenarios(**d,*s,request,l),"nested limit validation");
    auto expired=detail::sourceScenariosWithDeadline(**d,*s,request,{},{},{});
    need(bool(expired)&&!expired->complete&&expired->analysis.complete&&expired->rows.empty()&&!expired->scenarios[0].sources,"deterministic post not_run, original deep report retained");
    need(bool(compareRegisterSourceScenarios(**d,*s,request)),"reuse after error/cancel/budget");
    d.value().reset();s=hier::Error{hier::ErrorCode::Internal,"released"};
    need(r->scenarios[0].sources->groups[0].totals.coveredBits==9&&!r->rows[0].source.sourceRef->empty()&&r->rows[0].status[0]=="changed","owned source/coverage/matrix after Design and statistics release");
    std::cout<<checks<<" source scenario coverage assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
