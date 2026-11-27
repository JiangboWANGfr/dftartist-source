#include "RegisterSourceAttributionInternal.h"
#include "GroupIntervalAttribution.h"
#include <iostream>
#include <limits>
#include <stdexcept>
namespace {unsigned checks=0;void need(bool b,const char *s) {++checks;if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;using hier::model::BitRange;using detail::GroupBitInterval;
    std::vector<GroupBitInterval> input={{{1,9},0},{{1,7},1}};
    auto tick=[] {return true;};auto get=[&](size_t i) {return input[i];};
    auto partition=detail::partitionGroupIntervals(input.size(),get,1,10,10,tick);
    need(bool(partition.value)&&partition.value->coveredBits==9&&partition.value->segments.size()==2,"shared partition includes single membership");
    need(partition.value->segments[0].groups==std::vector<size_t>{0,1}&&partition.value->segments[1].groups==std::vector<size_t>{0},"exact sorted membership");
    auto overlap=detail::attributeGroupIntervals(input.size(),get,10,10,tick);
    need(bool(overlap.value)&&overlap.value->crossGroupBits==7&&overlap.value->segments.size()==1,"old overlap domain unchanged");
    const auto max=std::numeric_limits<uint64_t>::max();input={{{max-10,5},0},{{max-5,5},0}};
    partition=detail::partitionGroupIntervals(input.size(),get,1,1,1,tick);
    need(bool(partition.value)&&partition.value->coveredBits==10&&partition.value->segments[0].bits==BitRange{max-10,10},"touching same member coalesces at maximum endpoint");
    input={{{0,4},0},{{1,2},1}};partition=detail::partitionGroupIntervals(input.size(),get,1,10,1,tick);
    need(!partition.value&&partition.reason=="budget_overlap_members","member cap discards local partition");
    need(!detail::partitionGroupIntervals(input.size(),get,1,10,10,[] {return false;}).value,"work callback abort");
    hier::model::OpenOptions open;open.files={DFT_ATTRIBUTION_FIXTURE};open.tops={"sources_move"};auto d=hier::Design::open(open);need(bool(d),"open");
    StatisticsRequest sr;sr.scope="sources_move";auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete,"statistics");
    RegisterScenarioRequest request;request.common.resolveLogic=true;
    request.scenarios={{"BASE",{{{"sources_move.sel",0},false}}},{"OTHER",{{{"sources_move.sel",0},true}}},{"BACK",{{{"sources_move.sel",0},false}}}};
    auto r=compareRegisterSourceAttribution(**d,*s,request);need(bool(r)&&r->complete&&r->comparisons.size()==2,"complete actual pipeline");
    const auto &c=r->comparisons[0];need(c.sourcesComplete&&c.inputCollected&&c.resolvedRows==2&&!c.unresolvedRows&&!c.missingRows,"complete input witnesses");
    need(c.rows.size()==1&&c.totals.coveredBits==9&&c.totals.changedBits==7&&c.totals.retainedOnlyBits==2,"source transfer counted once");
    need(c.rows[0].segments.size()==3&&c.rows[0].segments[0].addedRows==std::vector<size_t>{2}&&c.rows[0].segments[0].removedRows==std::vector<size_t>{0},"original delta row references");
    need(r->comparisons[1].totals.changedBits==0&&r->comparisons[1].totals.retainedOnlyBits==9,"0/1/0 contexts isolated");
    RegisterSourceAttributionLimits l;l.maxRows=1;auto p=compareRegisterSourceAttribution(**d,*s,request,l);
    need(bool(p)&&!p->complete&&p->rows==1&&p->comparisons[0].state=="complete"&&p->comparisons[1].state=="partial","whole signal prefix across comparisons");
    for(unsigned flag=0;flag<4;++flag) {
        l={};if(flag==0) l.maxIntervals=1;else if(flag==1) l.maxSegments=1;else if(flag==2) l.maxMembers=1;else l.maxWork=1;
        p=compareRegisterSourceAttribution(**d,*s,request,l);need(bool(p)&&!p->complete&&p->rows==0&&p->segments==0&&p->members==0,"no half row or counters");
        if(flag==0||flag==3) need(!p->comparisons[0].inputCollected&&p->intervals==0&&p->comparisons[1].state=="not_run","no half input collection");
    }
    l={};l.deltas.maxRows=1;p=compareRegisterSourceAttribution(**d,*s,request,l);
    need(bool(p)&&!p->complete&&!p->comparisons[0].sourcesComplete&&p->comparisons[0].missingRows==1&&p->comparisons[0].totals.changedBits==3,"partial input positive evidence not upgraded");
    l={};l.deltas.scenarios.sources.maxRows=1;p=compareRegisterSourceAttribution(**d,*s,request,l);
    need(bool(p)&&!p->complete&&!p->comparisons[0].sourcesComplete&&p->comparisons[0].rows.empty(),"unknown never creates zero proof");
    std::stop_source stop;stop.request_stop();auto cancelled=compareRegisterSourceAttribution(**d,*s,request,{},stop.get_token());need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error");
    auto bad=*s;bad.snapshot.snapshotId+="bad";need(!compareRegisterSourceAttribution(**d,bad,request),"shared snapshot validator");
    auto invalid=request;invalid.scenarios[1].name=invalid.scenarios[0].name;need(!compareRegisterSourceAttribution(**d,*s,invalid),"duplicate names");
    invalid=request;invalid.scenarios[1].inputValues.push_back({{"sources_move.sel",0},false});need(!compareRegisterSourceAttribution(**d,*s,invalid),"second context error no half batch");
    l={};l.maxWork=0;need(!compareRegisterSourceAttribution(**d,*s,request,l),"limits validated");
    auto expired=detail::sourceAttributionWithDeadline(**d,*s,request,{},{},{});
    need(bool(expired)&&!expired->complete&&expired->analysis.complete&&expired->work==0&&expired->rows==0&&!expired->comparisons[0].inputCollected,"post expiry preserves entire original delta report");
    need(bool(compareRegisterSourceAttribution(**d,*s,request)),"reuse after error cancel partial");
    d.value().reset();s=hier::Error{hier::ErrorCode::Internal,"released"};need(c.rows[0].segments[0].bits==BitRange{1,3}&&r->analysis.rows[2].delta->totals.addedBits==7,"owned results after inputs released");
    std::cout<<checks<<" source attribution assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
