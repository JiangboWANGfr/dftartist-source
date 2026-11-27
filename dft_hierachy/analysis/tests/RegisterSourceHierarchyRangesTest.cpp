#include "RegisterSourceHierarchyRangesInternal.h"
#include "RegisterStatisticsInternal.h"
#include "SourceCoverage.h"
#include <iostream>
#include <limits>
#include <stdexcept>
namespace {unsigned checks=0;void need(bool b,const char *s) {++checks;if(!b) throw std::runtime_error(s);}}
int main() try {
    using namespace dft::sequential;
    std::vector<hier::model::BitRange> edge;unsigned admissions=0;const auto max=std::numeric_limits<uint64_t>::max();
    need(detail::appendCanonicalRange(edge,{max-8,4},[&] {++admissions;return true;}),"first maximum-endpoint range");
    need(detail::appendCanonicalRange(edge,{max-4,4},[&] {++admissions;return false;})&&admissions==1&&edge.size()==1&&edge[0].width==8,"adjacency coalesces without a second admission or endpoint overflow");
    std::vector<hier::model::BitRange> hole{{0,2}};need(!detail::appendCanonicalRange(hole,{4,2},[] {return false;})&&hole.size()==1&&hole[0].width==2,"failed range admission leaves existing value intact");
    hier::model::OpenOptions open;open.files={DFT_RANGE_FIXTURE,DFT_HIERARCHY_FIXTURE};open.tops={"hierarchy_root"};auto d=hier::Design::open(open);need(bool(d),"open hierarchy");
    StatisticsRequest sr;sr.scope="hierarchy_root";sr.recursive=true;auto s=registerStatistics(**d,sr);need(bool(s)&&s->complete,"statistics");
    RegisterScenarioRequest request;request.common.resolveLogic=true;request.scenarios={{"ZERO",{{{"hierarchy_root.mode",0},false}}},{"ONE",{{{"hierarchy_root.mode",0},true}}},{"BACK",{{{"hierarchy_root.mode",0},false}}}};
    auto r=expandRegisterSourceHierarchyRanges(**d,*s,request);need(bool(r)&&r->complete&&r->comparisons.size()==2,"complete original pipeline");const auto &c=r->comparisons[0];
    need(r->rows==21&&r->signals==38&&r->ranges==38&&r->members==38&&r->analysis.analysis.queries==9,"full hierarchy incidence counters and no extra Core query");
    for(const auto &row:c.rows) {
        const auto &original=r->analysis.comparisons[0].rows[row.matrixRow];uint64_t baseline=0,scenario=0,members=0;
        for(const auto &signal:row.signals) {
            need(signal.signal<s->signals.size()&&!signal.members.empty(),"original signal and evidence");baseline+=signal.counts.baselineBits;scenario+=signal.counts.scenarioBits;members+=signal.members.size();
        }
        need(baseline==original.counts.baselineBits&&scenario==original.counts.scenarioBits&&members==original.members.size(),"pair ranges conserve original counts and every member");
    }
    RegisterSourceHierarchyRangeLimits l;l.maxRows=1;auto p=expandRegisterSourceHierarchyRanges(**d,*s,request,l);
    need(bool(p)&&!p->complete&&p->rows==1&&p->comparisons[0].rows[0].signals.size()==c.rows[0].signals.size()&&p->comparisons[1].state=="not_run","complete pair prefix");
    for(int cap=0;cap<4;++cap) {
        l={};if(cap==0) l.maxSignals=1;else if(cap==1) l.maxRanges=1;else if(cap==2) l.maxMembers=1;else l.maxWork=1;
        p=expandRegisterSourceHierarchyRanges(**d,*s,request,l);need(bool(p)&&!p->complete&&p->rows==0&&p->signals==0&&p->ranges==0&&p->members==0,"no partial pair/signal/range/reference counters");
    }
    l={};l.matrix.maxRows=1;p=expandRegisterSourceHierarchyRanges(**d,*s,request,l);need(bool(p)&&!p->complete&&!p->comparisons[0].inputComplete&&p->rows==1,"upstream prefix is preserved, not reconstructed or upgraded");
    auto expired=detail::sourceHierarchyRangesWithDeadline(**d,*s,request,{},{},{});need(bool(expired)&&!expired->complete&&expired->analysis.complete&&expired->work==0&&expired->rows==0,"deterministic independent post deadline");
    std::stop_source stop;stop.request_stop();auto cancelled=expandRegisterSourceHierarchyRanges(**d,*s,request,{},stop.get_token());need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Result Error");
    auto bad=*s;bad.snapshot.snapshotId+="bad";need(!expandRegisterSourceHierarchyRanges(**d,bad,request),"snapshot mismatch");bad=*s;bad.instances[0].info.pathText+="bad";need(!expandRegisterSourceHierarchyRanges(**d,bad,request),"Core metadata mismatch");
    auto br=request;br.scenarios[1].name=br.scenarios[0].name;need(!expandRegisterSourceHierarchyRanges(**d,*s,br),"duplicate names");br=request;br.scenarios[1].inputValues.push_back({{"hierarchy_root.mode",0},false});need(!expandRegisterSourceHierarchyRanges(**d,*s,br),"second context error has no half result");
    l={};l.maxSignals=0;need(!expandRegisterSourceHierarchyRanges(**d,*s,request,l),"new limits");l={};l.matrix.hierarchy.maxQueries=0;need(!expandRegisterSourceHierarchyRanges(**d,*s,request,l),"nested limits");
    auto empty=detail::statisticsWithDeadline(**d,sr,{},{});need(bool(empty)&&!empty->complete&&empty->instances.empty(),"real C-S2-08-01 producer");
    auto emptyReport=expandRegisterSourceHierarchyRanges(**d,*empty,request);need(bool(emptyReport)&&!emptyReport->complete&&emptyReport->rows==0&&emptyReport->signals==0&&emptyReport->ranges==0&&emptyReport->members==0&&emptyReport->work==0&&!emptyReport->analysis.analysis.scope&&emptyReport->analysis.analysis.queries==0,"unvisited partial preserved without fake root or range");
    bad=*empty;bad.complete=true;need(!expandRegisterSourceHierarchyRanges(**d,bad,request),"forged empty complete stats remain invalid");
    sr.scope="hierarchy_root.left";auto scoped=registerStatistics(**d,sr);need(bool(scoped),"scoped statistics");auto one=expandRegisterSourceHierarchyRanges(**d,*scoped,request);need(bool(one)&&one->complete&&one->comparisons[0].rows.size()==6&&one->analysis.analysis.queries==5,"real local scope through original matrix");
    open.tops={"ranges_adjacent"};auto adjacent=hier::Design::open(open);need(bool(adjacent),"adjacency fixture");sr.scope="ranges_adjacent";auto as=registerStatistics(**adjacent,sr);need(bool(as),"adjacency statistics");auto ar=request;ar.scenarios={{"ZERO",{{{"ranges_adjacent.sel",0},false}}},{"ONE",{{{"ranges_adjacent.sel",0},true}}},{"BACK",{{{"ranges_adjacent.sel",0},false}}}};
    auto joined=expandRegisterSourceHierarchyRanges(**adjacent,*as,ar);need(bool(joined)&&joined->complete&&joined->rows==5&&joined->signals==5&&joined->ranges==5&&joined->members==7,"canonical range count differs from proof count");bool merged=false;
    for(const auto &row:joined->comparisons[0].rows) for(const auto &signal:row.signals) if(signal.counts.retainedBits==8) {merged=true;need(signal.retained.size()==1&&signal.retained[0].lsb==0&&signal.retained[0].width==8&&signal.members.size()==2,"merge same role despite other-source transition boundary, preserve both proofs");}
    need(merged,"retained source exists");l={};l.maxRanges=1;auto cap=expandRegisterSourceHierarchyRanges(**adjacent,*as,ar,l);need(bool(cap)&&!cap->complete&&cap->rows==1&&cap->ranges==1&&cap->members==2,"merged range admission, complete pair only");
    need(bool(expandRegisterSourceHierarchyRanges(**d,*s,request)),"normal reuse after errors and cancellation");
    d.value().reset();s=hier::Error{hier::ErrorCode::Internal,"released"};need(r->rows==21&&c.rows[0].signals[0].members.size()>=1&&r->analysis.comparisons[0].rows.size()==14&&emptyReport->rows==0,"owned new ranges and original evidence after inputs release");
    std::cout<<checks<<" source hierarchy range assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
