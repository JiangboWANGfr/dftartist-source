#include "SourceEvidenceLocationsInternal.h"
#include "RegisterStatisticsInternal.h"
#include <iostream>
#include <map>
#include <stdexcept>
namespace {unsigned checks=0;void need(bool ok,const char *why) {++checks;if(!ok) throw std::runtime_error(why);}}
int main() try {
    using namespace dft::sequential;using namespace hier;
    model::OpenOptions open;open.files={DFT_LOCATIONS_FIXTURE};open.tops={"locations_top"};auto design=Design::open(open);need(bool(design),"open");
    StatisticsRequest sr;sr.scope="locations_top";sr.recursive=true;auto stats=registerStatistics(**design,sr);need(bool(stats)&&stats->facts.size()==4,"four original write facts");
    RegisterScenarioRequest request;request.common.resolveLogic=true;request.scenarios={{"BASE",{}},{"REPEAT",{}}};
    auto ranges=expandRegisterSourceHierarchyRanges(**design,*stats,request);need(bool(ranges)&&ranges->complete,"original ranges");auto chosen=selectRegisterSourceHierarchyRanges(*ranges);need(bool(chosen),"selection");auto input=explainRegisterSourceSelection(*stats,*ranges,*chosen);need(bool(input)&&input->complete&&input->facts.size()==4,"evidence producer");
    auto result=locateSourceEvidence(**design,*input);need(bool(result)&&result->complete&&result->inputComplete&&result->sourcesComplete&&result->inputFacts==4&&result->rows.size()==4&&result->locations.size()==6&&result->queries==7&&result->work==12&&result->missing==0,"one snapshot, six unique ref/kind queries, two process entries");
    std::map<std::string,size_t> processIds;
    for(size_t i=0;i<result->rows.size();++i) {
        const auto &r=result->rows[i];const auto &f=input->facts[i];need(r.fact==i&&r.statisticsFact==f.fact&&r.ref==f.info.ref&&r.inst==f.info.inst,"fact mapping preserved");
        const auto &s=result->locations[r.signalLocation],&p=result->locations[r.processLocation];need(s.ref==f.info.signal&&p.ref==f.info.process&&s.kind==model::SourceKind::Definition&&p.kind==model::SourceKind::Statement&&s.span&&p.span,"original refs and kinds");
        auto original=(**design).source(p.ref,p.kind);need(bool(original)&&original->start.offset==p.span->start.offset&&original->end.offset==p.span->end.offset&&original->contentHash==p.span->contentHash,"original Core physical span");
        auto text=(**design).readSource(p.span->file);need(bool(text)&&text->matchesSnapshot,"read immutable snapshot file for oracle");need(text->text.substr(p.span->start.offset,p.span->end.offset-p.span->start.offset)=="always @(posedge clk) begin q0<=d;q1<=d;end","expected process tokens");
        const auto old=processIds.find(p.ref);if(old!=processIds.end()) need(old->second==r.processLocation,"shared process dictionary");else processIds[p.ref]=r.processLocation;
    }
    need(processIds.size()==2,"shared definition still two instance-qualified processes");
    const auto p0=result->locations[processIds.begin()->second].span,p1=result->locations[processIds.rbegin()->second].span;need(p0->start.offset==p1->start.offset&&p0->end.offset==p1->end.offset,"same physical declaration, distinct occurrence identity");
    SourceEvidenceLocationLimits limits;limits.maxFacts=1;auto prefix=locateSourceEvidence(**design,*input,limits);need(bool(prefix)&&!prefix->complete&&prefix->rows.size()==1&&prefix->locations.size()==2,"whole fact prefix");
    for(int cap=0;cap<3;++cap) {limits={};if(cap==0) limits.maxLocations=1;else if(cap==1) limits.maxQueries=2;else limits.maxWork=2;auto cut=locateSourceEvidence(**design,*input,limits);need(bool(cut)&&!cut->complete&&cut->rows.empty()&&cut->locations.empty()&&cut->missing==0,"no half fact or orphan location on cap");}
    limits={};limits.maxFacts=4;limits.maxLocations=6;limits.maxQueries=7;limits.maxWork=12;need(locateSourceEvidence(**design,*input,limits)->complete,"exact published caps");
    limits={};limits.maxLocations=3;auto mid=locateSourceEvidence(**design,*input,limits);need(bool(mid)&&!mid->complete&&mid->rows.size()==2&&mid->locations.size()==3&&mid->queries==4,"second fact reuses process at dictionary cap");
    auto expired=detail::sourceEvidenceLocationsWithDeadline(**design,*input,{},{},{});need(bool(expired)&&!expired->complete&&expired->rows.empty()&&expired->queries==1&&expired->work==0,"deterministic post deadline after snapshot identity");
    std::stop_source stop;stop.request_stop();auto cancel=locateSourceEvidence(**design,*input,{},stop.get_token());need(!cancel&&cancel.error().code==ErrorCode::Cancelled,"cancel Error");
    auto bad=*input;bad.snapshotId+="wrong";need(!locateSourceEvidence(**design,bad),"snapshot mismatch");bad=*input;bad.query.scenario=0;need(!locateSourceEvidence(**design,bad),"invalid query");
    bad=*input;bad.facts[0].info.process="invalid";auto error=locateSourceEvidence(**design,bad);need(!error&&error.error().code==ErrorCode::BadRequest,"malformed Core reference is not missing source");
    bad=*input;bad.facts[1].fact=bad.facts[0].fact;need(!locateSourceEvidence(**design,bad),"duplicate used statistics fact");bad=*input;bad.facts[0].info.signal.clear();need(!locateSourceEvidence(**design,bad),"empty used reference");
    // Constructed API-boundary input: a valid root reference has no Statement source.
    // This tests exact NotFound handling, not a claim that the unmodified RTL producer emits it.
    bad=*input;bad.facts[0].info.process=stats->instances[0].info.ref;auto missing=locateSourceEvidence(**design,bad);need(bool(missing)&&!missing->complete&&missing->rows.size()==4&&missing->missing==1&&missing->locations.size()==7,"NotFound location retained with partial");need(!missing->locations[missing->rows[0].processLocation].span,"missing span omitted");
    bad=*input;bad.complete=false;need(!locateSourceEvidence(**design,bad)->complete,"input partial retained despite complete locations");
    for(int which=0;which<5;++which) {limits={};if(which==0) limits.maxFacts=0;else if(which==1) limits.maxLocations=400001;else if(which==2) limits.maxQueries=400002;else if(which==3) limits.maxWork=10000001;else limits.maxMillis=0;need(!locateSourceEvidence(**design,*input,limits),"invalid limits");}
    auto empty=detail::statisticsWithDeadline(**design,sr,{},{});need(bool(empty)&&empty->instances.empty(),"C08 producer");auto er=expandRegisterSourceHierarchyRanges(**design,*empty,request);auto es=selectRegisterSourceHierarchyRanges(*er);auto ee=explainRegisterSourceSelection(*empty,*er,*es);auto el=locateSourceEvidence(**design,*ee);need(bool(el)&&!el->complete&&!el->inputComplete&&el->rows.empty()&&el->locations.empty()&&el->queries==1&&el->work==0&&!er->analysis.analysis.scope&&er->analysis.analysis.queries==0,"C08 preserves original zero navigation and new snapshot check only");
    need(locateSourceEvidence(**design,*input)->complete,"reusable after error/cancel");
    design.value().reset();input=Error{ErrorCode::Internal,"released"};stats=Error{ErrorCode::Internal,"released"};ranges=Error{ErrorCode::Internal,"released"};chosen=Error{ErrorCode::Internal,"released"};need(result->locations[0].span&&!result->locations[0].span->contentHash.empty()&&!result->rows[0].ref.empty(),"all source metadata owned after release");
    std::cout<<checks<<" source evidence location assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
