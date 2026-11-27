#pragma once
#include "SourceEvidenceLocations.h"
namespace dft::sequential {
struct SourceEvidenceExcerptLimits {
    uint64_t contextLines=2,maxLocations=10000,maxFiles=1000,maxQueries=1001;
    uint64_t maxBytes=1024*1024,maxSnippetBytes=65536,maxCachedBytes=8*1024*1024;
    uint64_t maxWork=1000000,maxMillis=60000;
};
enum class SourceExcerptFileState { Read,NotFound,Unsupported };
enum class SourceExcerptState { Available,LocationUnavailable,FileNotFound,Unsupported,Changed };
std::string_view sourceExcerptFileStateName(SourceExcerptFileState);
std::string_view sourceExcerptStateName(SourceExcerptState);
struct SourceExcerptFile {
    std::string file,path,snapshotHash;
    SourceExcerptFileState state=SourceExcerptFileState::Read;
    std::optional<std::string> contentHash;
    bool matchesSnapshot=false; // Serialized only for a successful Core SourceRead.
};
struct SourceExcerptSnippet {
    size_t file=0,startOffset=0,endOffset=0,startLine=1;
    std::string text; // Exact UTF8 bytes of the derived whole-line window; no newline rewriting.
};
struct SourceEvidenceExcerptRow {
    size_t location=0;
    SourceExcerptState state=SourceExcerptState::LocationUnavailable;
    std::optional<size_t> file,snippet;
};
struct SourceEvidenceExcerpts {
    std::string snapshotId,scope;
    SourceRangeQuery query;
    SourceEvidenceExcerptLimits limits;
    bool complete=true,inputComplete=false,sourcesComplete=false;
    std::vector<std::string> reasons;
    uint64_t inputLocations=0,work=0,queries=0,readBytes=0,cachedBytes=0,bytes=0;
    std::vector<SourceExcerptFile> files;
    std::vector<SourceExcerptSnippet> snippets;
    std::vector<SourceEvidenceExcerptRow> rows;
};
// Borrows an active Design and its unmodified location producer synchronously. Only original FileRefs
// authorize reads. Apply offsets only to matching snapshot bytes. Each read is a current-file observation,
// not a promise that disk contents stay unchanged; all returned metadata and snippets are owned.
// Core reads a whole file per call: cache/output budgets are not hard allocation/IO/deadline limits.
hier::Result<SourceEvidenceExcerpts> readSourceEvidenceExcerpts(hier::Design &,const SourceEvidenceLocations &,
    const SourceEvidenceExcerptLimits & = {},hier::Cancel = {});
}
