#pragma once
#include "RegisterSourceRangeSelection.h"
namespace dft::sequential {
struct SourceRangeEvidenceLimits {
    uint64_t maxRows=10000,maxProofs=100000,maxFacts=200000,maxWork=1000000,maxMillis=60000;
};
struct SourceEvidenceFact {size_t fact=0;hier::model::RegisterInfo info;}; // Original statistics fact and owned raw metadata.
struct SourceEvidenceFactEntry {size_t fact=0;hier::model::BitRange bits;}; // This report's facts dictionary; intersection only.
struct SourceEvidenceContext {size_t scenario=0,group=0;std::vector<SourceEvidenceFactEntry> facts;};
struct SourceEvidenceProof {
    size_t member=0; // Original matrix row.members index retained by selection.value.members.
    SourceHierarchyRole role=SourceHierarchyRole::Retained;
    hier::model::BitRange bits;
    std::vector<SourceEvidenceContext> contexts; // Removed: 0; added: query.scenario; retained: both in that order.
};
struct SourceRangeEvidenceRow {
    size_t selectionRow=0;
    ControlSource source;
    hier::model::InstInfo node,owner;
    hier::model::ObjectInfo signal;
    std::vector<SourceEvidenceProof> proofs;
};
struct SourceRangeEvidence {
    std::string snapshotId,scope;
    SourceRangeQuery query;
    SourceRangeEvidenceLimits limits;
    bool complete=true,inputComplete=false,sourcesComplete=false;
    std::vector<std::string> reasons;
    uint64_t inputRows=0,work=0,proofs=0,contexts=0,factEntries=0;
    std::vector<SourceEvidenceFact> facts; // First-use order, each original fact copied at most once.
    std::vector<SourceRangeEvidenceRow> rows; // Complete original selection-row prefix; dictionary additions atomic with row.
};
// Borrows matching unmodified producer reports synchronously; no Design queries. All returned metadata,
// events, clipped intervals and containers are owned after every input is released. Process refs are not HDL locations.
// Facts may repeat across contexts/proofs/ancestors: incidence widths are not unique physical FF/scan/DFT counts.
hier::Result<SourceRangeEvidence> explainRegisterSourceSelection(const RegisterStatistics &,
    const RegisterSourceHierarchyRangeReport &,const SourceRangeSelection &,const SourceRangeEvidenceLimits & = {},hier::Cancel = {});
}
