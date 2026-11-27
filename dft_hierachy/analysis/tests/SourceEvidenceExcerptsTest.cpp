#include "SourceEvidenceExcerptsInternal.h"
#include "RegisterStatisticsInternal.h"
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <random>
#include <stdexcept>
namespace {
unsigned checks=0;void need(bool ok,const char *why) {++checks;if(!ok) throw std::runtime_error(why);}
std::string bytes(const std::filesystem::path &p) {std::ifstream f(p,std::ios::binary);return {std::istreambuf_iterator<char>(f),{}};}
void put(const std::filesystem::path &p,const std::string &text) {std::ofstream f(p,std::ios::binary);f.write(text.data(),std::streamsize(text.size()));if(!f) throw std::runtime_error("temporary fixture write");}
std::string crlf(const std::string &text) {std::string out;for(char c:text) {if(c=='\n') out+='\r';out+=c;}return out;}
struct Temp {
    std::filesystem::path dir;
    Temp() {std::random_device random;for(unsigned i=0;i<10;++i) {const auto p=std::filesystem::temp_directory_path()/("hier-source-excerpt-"+std::to_string(random()));if(std::filesystem::create_directory(p)) {dir=p;return;}}throw std::runtime_error("temporary directory collision");}
    ~Temp() {std::error_code error;std::filesystem::remove_all(dir,error);}
};
size_t count(const dft::sequential::SourceEvidenceExcerpts &r,dft::sequential::SourceExcerptState state) {return size_t(std::count_if(r.rows.begin(),r.rows.end(),[&](const auto &row) {return row.state==state;}));}
}
int main() try {
    using namespace dft::sequential;
    Temp temp;const auto top=temp.dir/"source-evidence-excerpts.sv",leaf=temp.dir/"source-evidence-excerpts-leaf.svh";
    const auto topBytes=crlf(bytes(DFT_EXCERPT_FIXTURE)),leafBytes=crlf(bytes(DFT_EXCERPT_LEAF));put(top,topBytes);put(leaf,leafBytes);
    hier::model::OpenOptions open;open.files={top.string()};open.tops={"excerpt_top"};auto design=hier::Design::open(open);need(bool(design),"open private CRLF multi-file fixture");
    StatisticsRequest sr;sr.scope="excerpt_top";sr.recursive=true;auto stats=registerStatistics(**design,sr);need(bool(stats)&&stats->facts.size()==5,"original five write facts");
    RegisterScenarioRequest request;request.common.resolveLogic=true;request.scenarios={{"BASE",{}},{"REPEAT",{}}};auto ranges=expandRegisterSourceHierarchyRanges(**design,*stats,request);need(bool(ranges)&&ranges->complete,"range producer");auto chosen=selectRegisterSourceHierarchyRanges(*ranges);need(bool(chosen),"selection");auto evidence=explainRegisterSourceSelection(*stats,*ranges,*chosen);need(bool(evidence)&&evidence->complete,"evidence");auto locations=locateSourceEvidence(**design,*evidence);need(bool(locations)&&locations->complete&&locations->locations.size()==8,"eight original locations");
    SourceEvidenceExcerptLimits limits;limits.contextLines=0;auto result=readSourceEvidenceExcerpts(**design,*locations,limits);
    need(bool(result)&&result->complete&&result->rows.size()==8&&result->files.size()==2&&result->snippets.size()==5&&result->queries==3,"two reads, five physical windows, eight occurrence locations");
    uint64_t total=0;
    for(size_t i=0;i<result->rows.size();++i) {
        const auto &row=result->rows[i];need(row.location==i&&row.state==SourceExcerptState::Available&&row.file&&row.snippet,"available original index mapping");const auto &span=*locations->locations[i].span;const auto &snippet=result->snippets[*row.snippet];const auto raw=bytes(span.path);
        need(snippet.file==*row.file&&snippet.startOffset<=span.start.offset&&snippet.endOffset>=span.end.offset&&snippet.text==raw.substr(snippet.startOffset,snippet.endOffset-snippet.startOffset),"exact source bytes surround authoritative span");
        need(snippet.startOffset==0||raw[snippet.startOffset-1]=='\n',"whole starting line");need(snippet.endOffset==raw.size()||raw[snippet.endOffset-1]=='\n',"whole ending line");
        need(snippet.startLine==size_t(std::count(raw.begin(),raw.begin()+std::ptrdiff_t(snippet.startOffset),'\n'))+1,"derived line identity");
        for(size_t n=0;n<snippet.text.size();++n) if(snippet.text[n]=='\n') need(n>0&&snippet.text[n-1]=='\r',"CRLF is not rewritten");
    }
    for(const auto &snippet:result->snippets) total+=snippet.text.size();need(total==result->bytes&&result->cachedBytes==topBytes.size()+leafBytes.size()&&result->readBytes==result->cachedBytes,"unique text and file cache byte counters");
    limits.contextLines=2;auto context=readSourceEvidenceExcerpts(**design,*locations,limits);need(bool(context)&&context->complete&&context->queries==3&&context->rows.size()==8,"bounded extra context lines");
    for(int cap=0;cap<5;++cap) {limits={};limits.contextLines=0;if(cap==0) limits.maxQueries=1;else if(cap==1) limits.maxBytes=1;else if(cap==2) limits.maxSnippetBytes=1;else if(cap==3) limits.maxCachedBytes=1;else limits.maxWork=1;auto cut=readSourceEvidenceExcerpts(**design,*locations,limits);need(bool(cut)&&!cut->complete&&cut->rows.empty()&&cut->files.empty()&&cut->snippets.empty()&&cut->bytes==0&&cut->cachedBytes==0,"whole entry/file/cache/snippet admission");}
    limits={};limits.contextLines=0;limits.maxLocations=1;auto prefix=readSourceEvidenceExcerpts(**design,*locations,limits);need(bool(prefix)&&!prefix->complete&&prefix->rows.size()==1&&prefix->files.size()==1&&prefix->snippets.size()==1,"location prefix");
    limits={};limits.contextLines=0;limits.maxFiles=1;auto oneFile=readSourceEvidenceExcerpts(**design,*locations,limits);need(bool(oneFile)&&!oneFile->complete&&oneFile->files.size()==1&&oneFile->queries==2&&oneFile->rows.size()<8,"no second file on file cap");
    limits={};limits.contextLines=0;limits.maxLocations=8;limits.maxFiles=2;limits.maxQueries=3;limits.maxBytes=result->bytes;limits.maxCachedBytes=result->cachedBytes;limits.maxWork=result->work;need(readSourceEvidenceExcerpts(**design,*locations,limits)->complete,"exact unique byte/cache/work caps with reused windows");
    auto expired=detail::sourceEvidenceExcerptsWithDeadline(**design,*locations,{},{},{});need(bool(expired)&&!expired->complete&&expired->queries==1&&expired->work==0&&expired->rows.empty(),"deterministic own deadline after identity check");
    std::stop_source stop;stop.request_stop();auto cancel=readSourceEvidenceExcerpts(**design,*locations,{},stop.get_token());need(!cancel&&cancel.error().code==hier::ErrorCode::Cancelled,"cancel Error");
    auto bad=*locations;bad.snapshotId+="wrong";need(!readSourceEvidenceExcerpts(**design,bad),"snapshot mismatch");bad=*locations;bad.locations[0].span->end.offset=std::numeric_limits<size_t>::max();need(!readSourceEvidenceExcerpts(**design,bad),"matched-byte invalid span rejected");
    bad=*locations;bad.locations[0].span->contentHash="wrong";need(!readSourceEvidenceExcerpts(**design,bad),"matching snapshot hash mismatch is invalid input");
    // Constructed boundary inputs, not a claim that Core emits split CRLF spans.
    const auto originalBytes=bytes(locations->locations[0].span->path);
    const auto split=originalBytes.find("\r\n")+1;need(split>0&&split<originalBytes.size(),"CRLF boundary fixture");
    bad=*locations;bad.locations[0].span->start.offset=split;bad.locations[0].span->end.offset=originalBytes.size();
    auto splitStart=readSourceEvidenceExcerpts(**design,bad);need(!splitStart&&splitStart.error().code==hier::ErrorCode::BadRequest,"start inside CRLF rejected");
    bad=*locations;bad.locations[0].span->start.offset=0;bad.locations[0].span->end.offset=split;
    auto splitEnd=readSourceEvidenceExcerpts(**design,bad);need(!splitEnd&&splitEnd.error().code==hier::ErrorCode::BadRequest,"end inside CRLF rejected");
    // Constructed boundaries: preserve Core FileRef-only authority and absent-position policy.
    bad=*locations;bad.locations[0].span->file=bad.locations[0].span->path;auto path=readSourceEvidenceExcerpts(**design,bad);need(bool(path)&&path->rows[0].state==SourceExcerptState::FileNotFound&&!path->rows[0].snippet,"path is never a file read permission");
    bad=*locations;bad.complete=false;bad.locations[0].span.reset();auto unavailable=readSourceEvidenceExcerpts(**design,bad);need(bool(unavailable)&&!unavailable->complete&&unavailable->rows[0].state==SourceExcerptState::LocationUnavailable&&!unavailable->rows[0].file,"unavailable original position");
    put(leaf,"changed");auto changed=readSourceEvidenceExcerpts(**design,*locations);need(bool(changed)&&!changed->complete&&count(*changed,SourceExcerptState::Changed)==6&&count(*changed,SourceExcerptState::Available)==2&&changed->queries==3,"real truncate/change suppresses all old-offset excerpts");
    for(const auto &row:changed->rows) if(row.state==SourceExcerptState::Changed) need(!row.snippet,"no stale-offset text");
    put(leaf,std::string(1,char(0xff)));auto unsupported=readSourceEvidenceExcerpts(**design,*locations);need(bool(unsupported)&&!unsupported->complete&&count(*unsupported,SourceExcerptState::Unsupported)==6&&unsupported->queries==3,"real invalid UTF8 shares one unsupported read");
    std::filesystem::remove(leaf);auto deleted=readSourceEvidenceExcerpts(**design,*locations);need(bool(deleted)&&!deleted->complete&&count(*deleted,SourceExcerptState::FileNotFound)==6&&deleted->queries==3,"real deleted file shares one NotFound read");
    put(leaf,leafBytes);auto restored=readSourceEvidenceExcerpts(**design,*locations);need(bool(restored)&&restored->complete,"no cache escapes across calls; restored bytes reusable");
    std::cout<<"{\"changedRows\":"<<count(*changed,SourceExcerptState::Changed)<<",\"unsupportedRows\":"<<count(*unsupported,SourceExcerptState::Unsupported)<<",\"deletedRows\":"<<count(*deleted,SourceExcerptState::FileNotFound)<<",\"restored\":"<<(restored->complete?"true":"false")<<"}\n";
    limits={};limits.contextLines=21;need(!readSourceEvidenceExcerpts(**design,*locations,limits),"context cap");
    for(auto member:{&SourceEvidenceExcerptLimits::maxLocations,&SourceEvidenceExcerptLimits::maxFiles,&SourceEvidenceExcerptLimits::maxQueries,&SourceEvidenceExcerptLimits::maxBytes,&SourceEvidenceExcerptLimits::maxSnippetBytes,&SourceEvidenceExcerptLimits::maxCachedBytes,&SourceEvidenceExcerptLimits::maxWork,&SourceEvidenceExcerptLimits::maxMillis}) {limits={};limits.*member=0;need(!readSourceEvidenceExcerpts(**design,*locations,limits),"positive limits required");}
    auto empty=detail::statisticsWithDeadline(**design,sr,{},{});auto er=expandRegisterSourceHierarchyRanges(**design,*empty,request);auto es=selectRegisterSourceHierarchyRanges(*er);auto ee=explainRegisterSourceSelection(*empty,*er,*es);auto el=locateSourceEvidence(**design,*ee);auto ex=readSourceEvidenceExcerpts(**design,*el);need(bool(ex)&&!ex->complete&&ex->rows.empty()&&ex->files.empty()&&ex->snippets.empty()&&ex->queries==1&&ex->readBytes==0&&ex->work==0&&!er->analysis.analysis.scope,"C08 unchanged upstream zero navigation and no source reads");
    locations=hier::Error{hier::ErrorCode::Internal,"released"};design.value().reset();std::filesystem::remove_all(temp.dir);need(!result->snippets[0].text.empty()&&!result->files[0].snapshotHash.empty(),"returned text/hash/ref values survive all inputs and files");
    std::cout<<checks<<" source evidence excerpt assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
