#pragma once
#include "SourceRangeEvidence.h"
namespace dft::sequential {
struct SourceEvidenceLocationLimits {
    uint64_t maxFacts=10000,maxLocations=20000,maxQueries=20001,maxWork=1000000,maxMillis=60000;
};
struct EvidenceSourceLocation {
    std::string ref;
    hier::model::SourceKind kind=hier::model::SourceKind::Definition;
    std::optional<hier::model::SourceSpan> span; // Absent only for a Core source NotFound result.
};
struct SourceEvidenceLocationRow {
    size_t fact=0,statisticsFact=0; // Input evidence dictionary index and original statistics fact index.
    std::string ref,inst;
    size_t signalLocation=0,processLocation=0; // This report's locations dictionary.
};
struct SourceEvidenceLocations {
    std::string snapshotId,scope;
    SourceRangeQuery query;
    SourceEvidenceLocationLimits limits;
    bool complete=true,inputComplete=false,sourcesComplete=false;
    std::vector<std::string> reasons;
    uint64_t inputFacts=0,work=0,queries=0,missing=0;
    std::vector<EvidenceSourceLocation> locations;
    std::vector<SourceEvidenceLocationRow> rows; // Whole input-fact prefix; dictionary additions commit with row.
};
// Synchronously borrows an active Design and its matching, unmodified evidence producer.
// Core source spans and references are owned after both inputs are released. Snapshot spans/hashes
// are not a check of current disk contents, and are not synthesized FF/scan/DFT evidence.
hier::Result<SourceEvidenceLocations> locateSourceEvidence(hier::Design &,const SourceRangeEvidence &,
    const SourceEvidenceLocationLimits & = {},hier::Cancel = {});
}
