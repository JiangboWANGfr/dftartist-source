#include "MemoryTestAssessmentComparisonInternal.h"
#include "MemoryTestComparisonInternal.h"
#include "MemoryTestCoverageInternal.h"
#include "MemoryTestAssessmentInternal.h"
#include "MemoryClockSourcesInternal.h"
#include "MemoryTestDomainsInternal.h"
#include "MemoryClockCheckInternal.h"
namespace dft::memory {
namespace {
void checkpoint(hier::Cancel cancel) {
    if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory test assessment comparison cancelled"};
}
const MemoryTestReport &planOf(const MemoryTestTimingReport &report) {
    const auto &source=report.source.source;
    const auto *plain=std::get_if<MemoryTestReport>(&source);
    return plain?*plain:std::get<MemoryTestRulePlan>(source).report;
}
}
void detail::validateMemoryTestAssessmentComparisonRequest(const MemoryTestAssessmentComparisonRequest &r,hier::Cancel cancel) {
    checkpoint(cancel);validateMemoryTestComparisonRequest(r.tests,cancel);
    validateMemoryClockRequest({r.tests.investigation,r.clockLimits});
    if(r.expectations.size()!=r.tests.configurations.size())
        throw hier::Error{hier::ErrorCode::BadRequest,"Provide clock expectations for every test configuration"};
    for(const auto &expectations:r.expectations)validateMemoryClockExpectations(expectations,cancel);
    checkpoint(cancel);
}
hier::Result<MemoryTestAssessmentComparison> compareMemoryTestAssessments(hier::Design &design,const MemoryTestAssessmentComparisonRequest &r,hier::Cancel cancel)try {
    detail::validateMemoryTestAssessmentComparisonRequest(r,cancel);
    auto source=compareMemoryTestConfigurations(design,r.tests,cancel);if(!source)return source.error();
    MemoryTestAssessmentComparison out;out.source=std::move(source.value());out.clockLimits=r.clockLimits;
    out.clocks=detail::resolveMemoryClocks(design,planOf(out.source.configurations.front().report).investigation,r.clockLimits,cancel);
    for(size_t i=0;i<out.source.configurations.size();++i) {
        checkpoint(cancel);const auto &timing=out.source.configurations[i].report;const auto &plan=planOf(timing);
        MemoryTestAssessmentCase entry;
        entry.coverage=detail::deriveMemoryTestCoverage(timing,cancel);
        entry.domains=detail::associateMemoryDomains(plan,out.clocks,cancel);
        entry.check=detail::evaluateMemoryClockExpectations(entry.domains,out.clocks,r.expectations[i],cancel);
        entry.assessment=detail::assessMemoryCoverage(entry.coverage,plan,entry.domains,entry.check,cancel);
        // Read the reference before appending to the owning vector.
        const auto &current=entry.assessment;
        const auto &reference=out.configurations.empty()?current:out.configurations.front().assessment;
        MemoryTestAssessmentComparisonRow row;row.comparable=current.complete&&reference.complete;
        if(row.comparable)row.delta=MemoryTestAssessmentDelta{
            int64_t(current.satisfiedInstances)-int64_t(reference.satisfiedInstances),
            int64_t(current.blockedInstances)-int64_t(reference.blockedInstances),
            int64_t(current.pendingInstances)-int64_t(reference.pendingInstances)};
        // Both arrays come from the same private investigation, in macro order.
        for(size_t macro=0;macro<current.rows.size();++macro) {
            checkpoint(cancel);row.transitions.push_back({macro,reference.rows[macro].status,current.rows[macro].status});
        }
        out.complete=out.complete&&current.complete;
        out.configurations.push_back(std::move(entry));out.rows.push_back(std::move(row));
    }
    checkpoint(cancel);return out;
}catch(const hier::Error &error){return error;}
}
