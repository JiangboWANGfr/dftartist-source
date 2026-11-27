#include "MemoryTestComparisonInternal.h"
#include "MemoryTestTimingInternal.h"
#include "MemoryTestScheduleInternal.h"
#include "MemoryTestRulesInternal.h"
#include "MemoryTestPlanInternal.h"
#include "../common/Utf8.h"
#include <set>
namespace dft::memory {
namespace {
void checkpoint(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory test comparison cancelled"};}
void require(bool ok,const char *message){if(!ok)throw hier::Error{hier::ErrorCode::BadRequest,message};}
MemoryTestMetrics metrics(const MemoryTestTimingReport &r,hier::Cancel c) {
    const auto &source=r.source.source;const auto *plain=std::get_if<MemoryTestReport>(&source);const auto &plan=(plain?*plain:std::get<MemoryTestRulePlan>(source).report).plan;
    MemoryTestMetrics out;out.controllers=plan.controllers.size();
    for(const auto &ctrl:plan.controllers){checkpoint(c);out.plannedSteps+=ctrl.steps.size();}
    out.scheduledWaves=r.source.schedule.waves.size();out.timedWaves=r.timeline.waves.size();
    out.timedInstances=r.timeline.timedInstances;out.timedCapacityBits=r.timeline.timedCapacityBits;out.durationPicoseconds=r.timeline.durationPicoseconds;out.resourceWaitPicoseconds=r.timeline.resourceWaitPicoseconds;out.dependencyWaitPicoseconds=r.timeline.dependencyWaitPicoseconds;out.availabilityWaitPicoseconds=r.timeline.availabilityWaitPicoseconds;return out;
}
// Counts and published duration are bounded by their original validated limits
// (duration <= 2^53-1), so both conversions and subtraction fit int64_t.
int64_t delta(uint64_t value,uint64_t reference){return int64_t(value)-int64_t(reference);}
}
void detail::validateMemoryTestComparisonRequest(const MemoryTestComparisonRequest &r,hier::Cancel c) {
    checkpoint(c);require(r.configurations.size()>=2&&r.configurations.size()<=8,"Provide 2..8 memory test configurations");std::set<std::string> names;
    for(const auto &entry:r.configurations) {
        const auto &name=entry.name;require(!name.empty()&&name.size()<=128&&name.find('\0')==std::string::npos&&dft::detail::validUtf8(name),"Invalid memory test configuration name");
        require(names.insert(name).second,"Duplicate memory test configuration name");const auto &v=entry.configuration;
        validateMemoryTestTimingRequest({{{r.investigation,v.planning},v.rules,v.scheduling},v.timing},c);
    }
}
hier::Result<MemoryTestComparison> compareMemoryTestConfigurations(hier::Design &design,const MemoryTestComparisonRequest &r,hier::Cancel c)try {
    checkpoint(c);detail::validateMemoryTestComparisonRequest(r,c);checkpoint(c);
    auto facts=investigateMemories(design,r.investigation,c);if(!facts)return facts.error();MemoryTestComparison out;
    for(const auto &entry:r.configurations) {
        checkpoint(c);const auto &v=entry.configuration;MemoryTestTimingReport report;
        if(v.rules)report.source.source=detail::planInvestigatedMemoriesByRules(*facts,v.planning,*v.rules,c);
        else {
            MemoryTestReport plain;plain.investigation=*facts;plain.plan=detail::planInvestigatedMemories(*facts,v.planning,c);report.source.source=std::move(plain);
        }
        const auto *plain=std::get_if<MemoryTestReport>(&report.source.source);const auto &plan=plain?*plain:std::get<MemoryTestRulePlan>(report.source.source).report;
        checkpoint(c);report.source.schedule=detail::schedulePlannedMemories(plan,v.scheduling,c);
        checkpoint(c);report.timeline=detail::timeScheduledMemories(report.source,v.timing,c);
        MemoryTestComparisonRow row;row.metrics=metrics(report,c);
        row.comparable=report.timeline.complete&&(out.configurations.empty()||out.configurations.front().report.timeline.complete);
        if(row.comparable){const auto &reference=out.rows.empty()?row.metrics:out.rows.front().metrics;row.delta=MemoryTestDelta{delta(row.metrics.controllers,reference.controllers),delta(row.metrics.plannedSteps,reference.plannedSteps),delta(row.metrics.scheduledWaves,reference.scheduledWaves),delta(row.metrics.durationPicoseconds,reference.durationPicoseconds),delta(row.metrics.resourceWaitPicoseconds,reference.resourceWaitPicoseconds),delta(row.metrics.dependencyWaitPicoseconds,reference.dependencyWaitPicoseconds),delta(row.metrics.availabilityWaitPicoseconds,reference.availabilityWaitPicoseconds)};}
        out.complete=out.complete&&report.timeline.complete;out.configurations.push_back({entry.name,std::move(report)});out.rows.push_back(std::move(row));
    }
    checkpoint(c);return out;
}catch(const hier::Error &e){return e;}
}
