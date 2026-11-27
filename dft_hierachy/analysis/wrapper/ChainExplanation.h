#pragma once
#include "ChainCompatibility.h"
namespace dft::wrapper {
struct ChainExplanationLimits {uint64_t maxChains=1024,maxSegments=10000,maxLocations=10000,maxWork=1000000,maxMillis=30000;};
struct ChainExplanationRequest {ChainResetRequest resets;ChainCompatibilityLimits inspection;ChainExplanationLimits limits;};
struct ChainExplanationLocation {std::string ref;std::optional<hier::model::SourceSpan> span;std::optional<hier::Error> error;};
struct ChainExplanationSegment {size_t segment=0,boundaryRow=0,portLocation=0;std::optional<size_t> stateLocation,clockRow,resetRow;};
struct ChainExplanationRow {
    size_t chain=0;std::string status;bool controlsComplete=false;std::vector<std::string> reasons;
    std::optional<size_t> compatibilityRow;std::vector<ChainExplanationSegment> segments;
};
struct ChainExplanationCounts {uint64_t chains=0,segments=0,compatible=0,conflict=0,unresolved=0,empty=0,pending=0;};
struct ChainExplanationStop {std::string reason;size_t chain=0;};
struct ChainExplanation {
    ChainExplanationLimits limits;bool complete=true;uint64_t work=0;std::vector<std::string> reasons;
    std::vector<ChainExplanationLocation> locations;std::vector<ChainExplanationRow> rows;ChainExplanationCounts counts;
    std::optional<ChainExplanationStop> stop;
};
struct ChainExplanationReport {ChainCompatibilityReport source;ChainExplanation explanation;};
// Synchronous Design borrow; owns original facts and declaration locations. Does not infer new domain decisions.
hier::Result<bool> validateChainExplanationRequest(const ChainExplanationRequest &,hier::Cancel = {});
hier::Result<ChainExplanationReport> explainWrapperChains(hier::Design &,const ChainExplanationRequest &,hier::Cancel = {});
}
