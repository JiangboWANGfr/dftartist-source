#include "SourceInvestigation.h"
#include "RegisterStatisticsInternal.h"
#include "RegisterScenariosInternal.h"
#include "RegisterSourceHierarchyRangesInternal.h"
#include "RegisterSourceRangeSelectionInternal.h"
#include "SourceRangeEvidenceInternal.h"
#include "SourceEvidenceLocationsInternal.h"
#include "SourceEvidenceExcerptsInternal.h"
#include <utility>

namespace dft::sequential {
namespace {
void checkpoint(hier::Cancel cancel) {
    if (cancel.stop_requested())
        throw hier::Error{hier::ErrorCode::Cancelled, "Register source investigation cancelled"};
}
template<class T> T take(hier::Result<T> result) {
    if (!result) throw result.error();
    return std::move(result.value());
}
void validate(const SourceInvestigationRequest &r) {
    detail::validateStatisticsRequest(r.statistics);
    detail::validateRegisterScenarioRequest(r.scenarios);
    detail::validateRegisterSourceHierarchyRangeLimits(r.ranges);
    detail::validateSourceRangeQuery(r.query);
    detail::validateSourceRangeSelectionLimits(r.selection);
    detail::validateSourceRangeEvidenceLimits(r.evidence);
    detail::validateSourceEvidenceLocationLimits(r.locations);
    detail::validateSourceEvidenceExcerptLimits(r.excerpts);
    if (r.query.scenario >= r.scenarios.scenarios.size())
        throw hier::Error{hier::ErrorCode::BadRequest, "Selected scenario must belong to this investigation"};
}
}
hier::Result<SourceInvestigation> investigateRegisterSources(hier::Design &design,
    const SourceInvestigationRequest &request, hier::Cancel cancel) {
    try {
        checkpoint(cancel);
        validate(request);
        checkpoint(cancel);
        SourceInvestigation out;
        out.statistics = take(registerStatistics(design, request.statistics, cancel));
        checkpoint(cancel);
        out.ranges = take(expandRegisterSourceHierarchyRanges(design, out.statistics, request.scenarios, request.ranges, cancel));
        checkpoint(cancel);
        out.selection = take(selectRegisterSourceHierarchyRanges(out.ranges, request.query, request.selection, cancel));
        checkpoint(cancel);
        out.evidence = take(explainRegisterSourceSelection(out.statistics, out.ranges, out.selection, request.evidence, cancel));
        checkpoint(cancel);
        out.locations = take(locateSourceEvidence(design, out.evidence, request.locations, cancel));
        checkpoint(cancel);
        out.excerpts = take(readSourceEvidenceExcerpts(design, out.locations, request.excerpts, cancel));
        checkpoint(cancel);
        return out;
    } catch (const hier::Error &error) { return error; }
}
}
