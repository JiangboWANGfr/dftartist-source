#include "MemoryTestAssessmentInternal.h"
#include "MemoryTestTimingInternal.h"
#include "MemoryClockSourcesInternal.h"
#include "MemoryTestDomainsInternal.h"
#include "MemoryClockCheckInternal.h"
namespace dft::memory {
namespace {
void checkpoint(hier::Cancel cancel) {
    if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory test assessment cancelled"};
}
}
void detail::validateMemoryTestAssessmentRequest(const MemoryTestAssessmentRequest &r,hier::Cancel cancel) {
    checkpoint(cancel);validateMemoryTestTimingRequest(r.test,cancel);
    validateMemoryClockRequest({r.test.schedule.test.investigation,r.clockLimits});
    validateMemoryClockExpectations(r.expectations,cancel);
}
hier::Result<MemoryTestAssessmentReport> assessMemoryTests(hier::Design &design,const MemoryTestAssessmentRequest &r,hier::Cancel cancel)try {
    detail::validateMemoryTestAssessmentRequest(r,cancel);
    auto source=inspectMemoryTestCoverage(design,r.test,cancel);if(!source)return source.error();
    MemoryTestAssessmentReport out;out.source=std::move(source.value());out.clockLimits=r.clockLimits;
    const auto &variant=out.source.source.source.source;
    const auto *plain=std::get_if<MemoryTestReport>(&variant);
    const auto &plan=plain?*plain:std::get<MemoryTestRulePlan>(variant).report;
    out.clocks=detail::resolveMemoryClocks(design,plan.investigation,r.clockLimits,cancel);
    out.domains=detail::associateMemoryDomains(plan,out.clocks,cancel);
    out.check=detail::evaluateMemoryClockExpectations(out.domains,out.clocks,r.expectations,cancel);
    out.assessment=detail::assessMemoryCoverage(out.source.coverage,plan,out.domains,out.check,cancel);
    checkpoint(cancel);return out;
}catch(const hier::Error &error){return error;}
MemoryTestAssessment detail::assessMemoryCoverage(const MemoryTestCoverage &coverage,const MemoryTestReport &plan,const MemoryTestDomains &domains,const MemoryClockCheck &check,hier::Cancel cancel) {
    std::vector<std::optional<size_t>> checks(coverage.rows.size());
    for(size_t i=0;i<check.rows.size();++i) {
        checkpoint(cancel);const auto memory=domains.rows[check.rows[i].row].memory;
        checks[plan.investigation.mapping.memories[memory].macro]=i;
    }
    MemoryTestAssessment assessment;
    for(size_t i=0;i<coverage.rows.size();++i) {
        checkpoint(cancel);const auto &covered=coverage.rows[i];MemoryTestAssessmentRow row;
        row.macro=i;row.clockCheck=checks[i];bool blocked=covered.status=="blocked",matched=false;
        if(blocked)row.issues.push_back("test_blocked");
        else if(covered.status=="pending")row.issues.push_back("test_pending");
        if(!row.clockCheck)row.issues.push_back("clock_check_not_reached");
        else {
            const auto &checked=check.rows[*row.clockCheck];
            if(checked.status=="mismatch"){blocked=true;row.issues.push_back("clock_mismatch");}
            else if(checked.status=="unresolved")row.issues.push_back("clock_unresolved");
            else if(checked.status=="unconstrained")row.issues.push_back("clock_unconstrained");
            else if(checked.status=="unassigned")row.issues.push_back("domain_missing");
            else matched=true;
        }
        if(blocked){row.status="blocked";++assessment.blockedInstances;}
        else if(covered.status=="timed"&&matched){row.status="satisfied";++assessment.satisfiedInstances;}
        else {row.status="pending";++assessment.pendingInstances;}
        assessment.rows.push_back(std::move(row));
    }
    if(!coverage.complete)assessment.reasons.push_back("coverage_partial");
    if(!check.complete)assessment.reasons.push_back("clock_check_partial");
    assessment.complete=assessment.reasons.empty();
    assessment.verdict=assessment.blockedInstances?"fail":assessment.complete&&!assessment.pendingInstances?"pass":"unknown";
    checkpoint(cancel);return assessment;
}
}
