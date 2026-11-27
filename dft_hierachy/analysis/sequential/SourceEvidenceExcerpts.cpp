#include "SourceEvidenceExcerptsInternal.h"
#include "RegisterSourceRangeSelectionInternal.h"
#include <algorithm>
#include <limits>
#include <map>
#include <tuple>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
using Window=std::tuple<size_t,size_t,size_t>;
void require(bool ok) {if(!ok) throw Error{ErrorCode::BadRequest,"Source excerpts require matching snapshot and unmodified location references"};}
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Source evidence excerpt cancelled"};}
void add(uint64_t &value,uint64_t n) {if(n>std::numeric_limits<uint64_t>::max()-value) throw Error{ErrorCode::Internal,"Source excerpt counter overflow"};value+=n;}
bool boundary(const std::string &text,size_t offset) {
    return offset==text.size()||((static_cast<unsigned char>(text[offset])&0xc0U)!=0x80U&&
        !(offset>0&&text[offset-1]=='\r'&&text[offset]=='\n'));
}
// Same physical newline rule as Core SourcePos: CRLF is one break, CR and LF
// are each one break. No private Core index or whole-file line table is needed.
bool lineStart(const std::string &text,size_t offset) {
    return offset==0||text[offset-1]=='\n'||
        (text[offset-1]=='\r'&&(offset==text.size()||text[offset]!='\n'));
}
struct PendingFile {SourceExcerptFile value;std::string text;};
class Read {
    Design &design_;
    const SourceEvidenceLocations &input_;
    SourceEvidenceExcerpts out_;
    Time deadline_;
    Cancel cancel_;
    std::map<std::string,size_t> files_;
    std::vector<std::string> texts_;
    std::map<Window,size_t> snippets_,windows_;
    void partial(const std::string &reason) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),reason)==out_.reasons.end()) out_.reasons.push_back(reason);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<deadline_) return true;partial("budget_source_excerpt_time");return false;}
    bool spend(uint64_t n=1) {if(!time()) return false;if(n>out_.limits.maxWork-out_.work) {partial("budget_source_excerpt_work");return false;}out_.work+=n;return true;}
    std::optional<size_t> file(const model::SourceSpan &span,PendingFile &pending,bool &fresh) {
        if(!spend()) return {};
        require(!span.file.empty()&&!span.path.empty()&&!span.contentHash.empty());
        const auto old=files_.find(span.file);
        if(old!=files_.end()) {const auto &v=out_.files[old->second];require(v.path==span.path&&v.snapshotHash==span.contentHash);return old->second;}
        if(out_.files.size()>=out_.limits.maxFiles) {partial("budget_source_excerpt_files");return {};}
        if(out_.queries>=out_.limits.maxQueries) {partial("budget_source_excerpt_queries");return {};}
        ++out_.queries;auto read=design_.readSource(span.file,cancel_);
        if(!read&&read.error().code!=ErrorCode::NotFound&&read.error().code!=ErrorCode::Unsupported) throw read.error();
        if(read) add(out_.readBytes,read->text.size());
        if(!time()) return {};
        pending.value.file=span.file;pending.value.path=span.path;pending.value.snapshotHash=span.contentHash;
        if(read) {
            pending.value.contentHash=read->contentHash;pending.value.matchesSnapshot=read->matchesSnapshot;
            if(read->matchesSnapshot) {
                require(read->contentHash==span.contentHash);
                if(read->text.size()>out_.limits.maxCachedBytes-out_.cachedBytes) {partial("budget_source_excerpt_cached_bytes");return {};}
                pending.text=std::move(read->text);
            }
        } else pending.value.state=read.error().code==ErrorCode::NotFound?SourceExcerptFileState::NotFound:SourceExcerptFileState::Unsupported;
        fresh=true;return out_.files.size();
    }
    bool window(const model::SourceSpan &span,const std::string &text,size_t &begin,size_t &end,size_t &line) {
        require(span.start.offset<span.end.offset&&span.end.offset<=text.size()&&span.start.line>0);
        require(boundary(text,span.start.offset)&&boundary(text,span.end.offset));
        begin=span.start.offset;end=span.end.offset;line=span.start.line;
        if(end-begin>out_.limits.maxSnippetBytes) {partial("budget_source_excerpt_snippet_bytes");return false;}
        auto left=[&]() {while(!lineStart(text,begin)) {if(!spend()) return false;--begin;}return true;};
        auto right=[&]() {
            while(end<text.size()) {
                const char c=text[end];if(!spend()) return false;++end;
                if(c=='\r') {
                    if(end<text.size()&&text[end]=='\n') {if(!spend()) return false;++end;}
                    break;
                }
                if(c=='\n') break;
            }
            return true;
        };
        if(!left()) return false;
        // The source span is half-open: an end already at the next line's
        // start must not include that line until context explicitly asks for it.
        if(!lineStart(text,end)&&!right()) return false;
        for(uint64_t i=0;i<out_.limits.contextLines;++i) {
            if(begin>0) {
                if(!spend()) return false;--begin;
                if(begin>0&&text[begin]=='\n'&&text[begin-1]=='\r') {if(!spend()) return false;--begin;}
                require(line>1);--line;if(!left()) return false;
            }
            if(!right()) return false;
        }
        return true;
    }
    bool row(size_t index) {
        if(out_.rows.size()>=out_.limits.maxLocations) {partial("budget_source_excerpt_locations");return false;}
        if(!spend()) return false;
        const auto &location=input_.locations[index];require(!location.ref.empty()&&(location.kind==model::SourceKind::Definition||location.kind==model::SourceKind::Statement));
        SourceEvidenceExcerptRow dest;dest.location=index;PendingFile pendingFile;bool fresh=false;
        SourceExcerptSnippet pendingSnippet;bool newSnippet=false;std::optional<Window> originalWindow,derivedWindow;
        if(location.span) {
            const auto &span=*location.span;dest.file=file(span,pendingFile,fresh);if(!dest.file) return false;
            const auto &meta=fresh?pendingFile.value:out_.files[*dest.file];
            if(meta.state==SourceExcerptFileState::NotFound) dest.state=SourceExcerptState::FileNotFound;
            else if(meta.state==SourceExcerptFileState::Unsupported) dest.state=SourceExcerptState::Unsupported;
            else if(!meta.matchesSnapshot) dest.state=SourceExcerptState::Changed;
            else {
                dest.state=SourceExcerptState::Available;if(!spend()) return false;
                originalWindow=Window{*dest.file,span.start.offset,span.end.offset};const auto old=windows_.find(*originalWindow);
                if(old!=windows_.end()) dest.snippet=old->second;
                else {
                    size_t begin=0,end=0,line=1;const auto &text=fresh?pendingFile.text:texts_[*dest.file];
                    if(!window(span,text,begin,end,line)) return false;
                    derivedWindow=Window{*dest.file,begin,end};const auto shared=snippets_.find(*derivedWindow);
                    if(shared!=snippets_.end()) dest.snippet=shared->second;
                    else {
                        const auto bytes=end-begin;
                        if(bytes>out_.limits.maxSnippetBytes) {partial("budget_source_excerpt_snippet_bytes");return false;}
                        if(bytes>out_.limits.maxBytes-out_.bytes) {partial("budget_source_excerpt_bytes");return false;}
                        if(!spend(bytes)) return false;
                        pendingSnippet={*dest.file,begin,end,line,text.substr(begin,bytes)};dest.snippet=out_.snippets.size();newSnippet=true;
                    }
                }
            }
        }
        if(!time()) return false;
        if(fresh) {files_.emplace(pendingFile.value.file,out_.files.size());add(out_.cachedBytes,pendingFile.text.size());texts_.push_back(std::move(pendingFile.text));out_.files.push_back(std::move(pendingFile.value));}
        if(newSnippet) {add(out_.bytes,pendingSnippet.text.size());snippets_.emplace(*derivedWindow,out_.snippets.size());out_.snippets.push_back(std::move(pendingSnippet));}
        if(originalWindow) windows_.emplace(*originalWindow,*dest.snippet);
        if(dest.state!=SourceExcerptState::Available) partial("source_excerpt_"+std::string(sourceExcerptStateName(dest.state)));
        out_.rows.push_back(std::move(dest));return true;
    }
  public:
    Read(Design &d,const SourceEvidenceLocations &l,const SourceEvidenceExcerptLimits &limits,Time deadline,Cancel c):design_(d),input_(l),deadline_(deadline),cancel_(c) {
        out_.snapshotId=l.snapshotId;out_.scope=l.scope;out_.query=l.query;out_.limits=limits;out_.inputComplete=l.complete;out_.sourcesComplete=l.sourcesComplete;out_.inputLocations=l.locations.size();if(!l.complete) partial("input_partial");
    }
    SourceEvidenceExcerpts run() {
        checkpoint(cancel_);++out_.queries;const auto snapshot=design_.snapshot(cancel_);if(!snapshot) throw snapshot.error();require(!out_.scope.empty()&&out_.snapshotId==snapshot->snapshotId);
        if(time()) for(size_t i=0;i<input_.locations.size();++i) if(!row(i)) break;
        return std::move(out_);
    }
};
Result<SourceEvidenceExcerpts> execute(Design &d,const SourceEvidenceLocations &l,const SourceEvidenceExcerptLimits &limits,std::optional<Time> deadline,Cancel c) try {
    detail::validateSourceEvidenceExcerptLimits(limits);detail::validateSourceRangeQuery(l.query);checkpoint(c);
    return Read(d,l,limits,deadline.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(limits.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
std::string_view sourceExcerptFileStateName(SourceExcerptFileState state) {switch(state) {case SourceExcerptFileState::Read:return "read";case SourceExcerptFileState::NotFound:return "not_found";case SourceExcerptFileState::Unsupported:return "unsupported";}throw hier::Error{hier::ErrorCode::BadRequest,"Invalid source excerpt file state"};}
std::string_view sourceExcerptStateName(SourceExcerptState state) {switch(state) {case SourceExcerptState::Available:return "available";case SourceExcerptState::LocationUnavailable:return "location_unavailable";case SourceExcerptState::FileNotFound:return "file_not_found";case SourceExcerptState::Unsupported:return "unsupported";case SourceExcerptState::Changed:return "changed";}throw hier::Error{hier::ErrorCode::BadRequest,"Invalid source excerpt state"};}
void detail::validateSourceEvidenceExcerptLimits(const SourceEvidenceExcerptLimits &l) {
    require(l.contextLines<=20&&l.maxLocations&&l.maxLocations<=400000&&l.maxFiles&&l.maxFiles<=10000&&l.maxQueries&&l.maxQueries<=10001&&l.maxBytes&&l.maxBytes<=16*1024*1024&&l.maxSnippetBytes&&l.maxSnippetBytes<=1024*1024&&l.maxCachedBytes&&l.maxCachedBytes<=64*1024*1024&&l.maxWork&&l.maxWork<=10000000&&l.maxMillis&&l.maxMillis<=60000);
}
hier::Result<SourceEvidenceExcerpts> detail::sourceEvidenceExcerptsWithDeadline(Design &d,const SourceEvidenceLocations &l,const SourceEvidenceExcerptLimits &limits,Time deadline,Cancel c) {return execute(d,l,limits,deadline,c);}
hier::Result<SourceEvidenceExcerpts> readSourceEvidenceExcerpts(Design &d,const SourceEvidenceLocations &l,const SourceEvidenceExcerptLimits &limits,Cancel c) {return execute(d,l,limits,{},c);}
}
