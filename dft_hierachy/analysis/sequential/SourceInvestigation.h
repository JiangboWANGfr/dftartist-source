#pragma once
#include "SourceEvidenceExcerpts.h"

namespace dft::sequential {
struct SourceInvestigationRequest {
    StatisticsRequest statistics;
    RegisterScenarioRequest scenarios;
    RegisterSourceHierarchyRangeLimits ranges;
    SourceRangeQuery query;
    SourceRangeSelectionLimits selection;
    SourceRangeEvidenceLimits evidence;
    SourceEvidenceLocationLimits locations;
    SourceEvidenceExcerptLimits excerpts;
};
struct SourceInvestigation {
    RegisterStatistics statistics;
    RegisterSourceHierarchyRangeReport ranges;
    SourceRangeSelection selection;
    SourceRangeEvidence evidence;
    SourceEvidenceLocations locations;
    SourceEvidenceExcerpts excerpts;
};
// Borrows an active Design synchronously. Validates every request section before queries;
// requires explicit scope, 2..8 named scenarios and scenarios.common.resolveLogic=true.
// Owns all matching producers: original indices resolve within this bundle after inputs
// and Design are released. Partial budgets preserve upstream quality through excerpts.
// Error/cancellation returns no bundle. Budgets/deadlines remain per-stage, not global;
// source file reads are observations, not a whole-project disk transaction or hard IO cap.
hier::Result<SourceInvestigation> investigateRegisterSources(hier::Design &,
    const SourceInvestigationRequest &, hier::Cancel = {});
}
