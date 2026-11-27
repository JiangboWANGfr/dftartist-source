#include "RegisterSourceDeltasInternal.h"
#include "SourceCoverage.h"
#include <iostream>
#include <limits>
#include <stdexcept>
namespace {unsigned checks=0;void need(bool b,const char *s) {++checks;if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;using hier::model::BitRange;
    const auto yes=[] {return true;};
    auto parts=detail::partitionSourceIntervals(detail::CanonicalIntervals{{1,9}},detail::CanonicalIntervals{{4,6}},yes,yes);
    need(bool(parts)&&parts->added.empty()&&parts->removed==std::vector<BitRange>{{1,3}}&&parts->retained==std::vector<BitRange>{{4,6}},"one sweep partition");
    parts=detail::partitionSourceIntervals(detail::CanonicalIntervals{{0,2},{5,2}},detail::CanonicalIntervals{{1,5}},yes,yes);
    need(bool(parts)&&parts->removed==std::vector<BitRange>{{0,1},{6,1}}&&parts->added==std::vector<BitRange>{{2,3}}&&parts->retained==std::vector<BitRange>{{1,1},{5,1}},"holes and partial overlaps");
    parts=detail::partitionSourceIntervals(detail::CanonicalIntervals{{0,4}},detail::CanonicalIntervals{{4,4}},yes,yes);
    need(bool(parts)&&parts->retained.empty()&&parts->removed==std::vector<BitRange>{{0,4}}&&parts->added==std::vector<BitRange>{{4,4}},"touching endpoints are disjoint");
    const auto max=std::numeric_limits<uint64_t>::max();unsigned ticks=0;
    parts=detail::partitionSourceIntervals(detail::CanonicalIntervals{{max-64,64}},detail::CanonicalIntervals{{max-32,32}},[&] {++ticks;return true;},yes);
    need(bool(parts)&&ticks<=4&&parts->removed==std::vector<BitRange>{{max-64,32}}&&parts->retained==std::vector<BitRange>{{max-32,32}},"maximum endpoint is a real event, not a sentinel");
    unsigned ranges=0;parts=detail::partitionSourceIntervals(detail::CanonicalIntervals{{1,9}},detail::CanonicalIntervals{{4,6}},yes,[&] {return ++ranges<=1;});
    need(!parts,"no partial partition when range admission fails");
    need(!detail::partitionSourceIntervals(detail::CanonicalIntervals{{0,4}},{},[] {return false;},yes),"partition stops on failed work tick");
    hier::model::OpenOptions open;open.files={DFT_DELTA_FIXTURE};open.tops={"sources_move"};
    auto d=hier::Design::open(open);need(bool(d),"open");StatisticsRequest sr;sr.scope="sources_move";
    auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete,"statistics");RegisterScenarioRequest request;request.common.resolveLogic=true;
    request.scenarios={{"BASE",{{{"sources_move.sel",0},false}}},{"OTHER",{{{"sources_move.sel",0},true}}},{"BACK",{{{"sources_move.sel",0},false}}}};
    auto r=compareRegisterSourceDeltas(**d,*s,request);need(bool(r)&&r->complete&&r->rows.size()==4&&r->inputRows==2,"complete source delta pipeline");
    const auto &lost=*r->rows[0].delta;need(lost.totals.baselineBits==9&&lost.totals.scenarioBits==6&&lost.totals.removedBits==3&&lost.totals.addedBits==0&&lost.totals.retainedBits==6,"source loses exactly three state bits");
    need(lost.signals[0].removed==std::vector<BitRange>{{1,3}}&&lost.signals[0].retained==std::vector<BitRange>{{4,6}},"owned exact ranges");
    need(r->rows[2].delta->totals.addedBits==7&&r->rows[2].delta->totals.removedBits==0,"previously absent source gains seven bits");
    need(r->rows[3].delta->signals.empty()&&r->rows[3].delta->totals.scenarioBits==0,"complete contexts can prove both sides empty for one source");
    std::stop_source stop;stop.request_stop();auto cancelled=compareRegisterSourceDeltas(**d,*s,request,{},stop.get_token());
    need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error");
    auto bad=*s;bad.snapshot.snapshotId+="wrong";need(!compareRegisterSourceDeltas(**d,bad,request),"shared snapshot validation");
    auto invalid=request;invalid.scenarios[1].name=invalid.scenarios[0].name;need(!compareRegisterSourceDeltas(**d,*s,invalid),"duplicate name");
    invalid=request;invalid.scenarios[1].inputValues.push_back({{"sources_move.sel",0},false});need(!compareRegisterSourceDeltas(**d,*s,invalid),"second context error gives no half batch");
    RegisterSourceDeltaLimits l;l.maxRows=1;auto partial=compareRegisterSourceDeltas(**d,*s,request,l);
    need(bool(partial)&&!partial->complete&&partial->rows.size()==1&&partial->rows[0].delta->totals.removedBits==3,"whole row prefix");
    l={};l.maxSignals=1;partial=compareRegisterSourceDeltas(**d,*s,request,l);need(bool(partial)&&!partial->complete&&partial->rows.size()==1&&partial->signals==1,"signal cap is global over committed rows");
    for(const unsigned flag:{0u,1u,2u}) {
        l={};if(flag==0) l.maxRanges=1;else if(flag==1) l.maxIntervals=1;else l.maxWork=1;
        partial=compareRegisterSourceDeltas(**d,*s,request,l);need(bool(partial)&&!partial->complete&&partial->rows.empty()&&partial->signals==0&&partial->ranges==0&&partial->intervals==0,"never publish half delta row/counters");
    }
    l={};l.scenarios.sources.maxRows=1;partial=compareRegisterSourceDeltas(**d,*s,request,l);
    need(bool(partial)&&!partial->complete&&!partial->rows.empty()&&partial->rows[0].status=="unresolved"&&!partial->rows[0].delta,"unresolved has no invented zero delta");
    l={};l.maxMillis=0;need(!compareRegisterSourceDeltas(**d,*s,request,l),"post limits validate");
    auto expired=detail::sourceDeltasWithDeadline(**d,*s,request,{},{},{});
    need(bool(expired)&&!expired->complete&&expired->analysis.complete&&expired->work==0&&expired->rows.empty(),"deterministic post expiry retains matrix");
    need(bool(compareRegisterSourceDeltas(**d,*s,request)),"reuse after errors/cancel/partial");
    d.value().reset();s=hier::Error{hier::ErrorCode::Internal,"released"};
    need(r->rows[0].delta->signals[0].removed[0].width==3&&!r->analysis.rows[0].source.sourceRef->empty(),"owns intervals and original source matrix after release");
    std::cout<<checks<<" source coverage delta assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
