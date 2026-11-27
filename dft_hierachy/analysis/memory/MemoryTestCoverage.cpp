#include "MemoryTestCoverageInternal.h"
namespace dft::memory {
namespace {
void checkpoint(hier::Cancel c) {
    if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory test coverage cancelled"};
}
void state(MemoryTestCoverageRow &row,const char *stage,const char *status,const std::string &reason) {
    row.stage=stage;row.status=status;row.reason=reason;
}
}
MemoryTestCoverage detail::deriveMemoryTestCoverage(const MemoryTestTimingReport &source,hier::Cancel cancel) {
    const auto *plain=std::get_if<MemoryTestReport>(&source.source.source);
    const auto &report=plain?*plain:std::get<MemoryTestRulePlan>(source.source.source).report;
    const auto &mapping=report.investigation.mapping;const auto &plan=report.plan;
    const auto &schedule=source.source.schedule;const auto &timeline=source.timeline;
    MemoryTestCoverage out;out.complete=timeline.complete;
    out.observedMacros=report.investigation.interfaces.macros.size();out.matchedInstances=mapping.matchedInstances;
    out.plannedInstances=plan.scheduledInstances;out.scheduledInstances=schedule.scheduledInstances;out.timedInstances=timeline.timedInstances;
    out.rows.resize(out.observedMacros);
    for(size_t i=0;i<out.rows.size();++i){checkpoint(cancel);auto &row=out.rows[i];row.macro=i;state(row,"mapping","pending","mapping_not_reached");}
    for(size_t mi=0;mi<mapping.memories.size();++mi) {
        checkpoint(cancel);const auto &m=mapping.memories[mi];auto &row=out.rows[m.macro];row.memory=mi;
        if(m.status=="matched")state(row,"planning","pending","planning_not_reached");
        else state(row,"mapping","blocked","interface_unmatched");
    }
    for(size_t pi=0;pi<plan.memories.size();++pi) {
        checkpoint(cancel);const auto &m=plan.memories[pi];auto &row=out.rows[mapping.memories[m.memory].macro];row.plannedMemory=pi;
        if(row.stage=="mapping")continue; // Preserve the earliest known defect, including its issues.
        if(m.status=="blocked")state(row,"planning","blocked",m.reason);
        else {row.controller=m.controller;row.step=m.step;state(row,"scheduling","pending","schedule_not_reached");}
    }
    // Traverse original membership once. No rescheduling, repeated per-macro scans,
    // or duplicated controller/step authority; these indices refer to source.
    for(size_t wi=0;wi<schedule.waves.size();++wi) {
        checkpoint(cancel);const auto &wave=schedule.waves[wi];
        for(size_t ei=0;ei<wave.entries.size();++ei) {
            checkpoint(cancel);const auto &entry=wave.entries[ei];const auto &step=plan.controllers[entry.controller].steps[entry.step];
            for(auto pi:step.memories) {
                checkpoint(cancel);auto &row=out.rows[mapping.memories[plan.memories[pi].memory].macro];row.wave=wi;row.entry=ei;
                if(wi<timeline.waves.size()) {
                    const auto &w=timeline.waves[wi];const auto duration=w.entries[ei].durationPicoseconds;
                    // Original Timer checked the entire published batch's additions.
                    const auto start=w.startPicoseconds+timeline.request.policy.waveOverheadPicoseconds;
                    row.timing=MemoryTestInterval{start,duration,start+duration,w.endPicoseconds};state(row,"timing","timed","");
                } else {
                    state(row,"timing","pending","timing_not_reached");
                    if(timeline.stop&&timeline.stop->wave==wi) {
                        const auto &stop=*timeline.stop;
                        if(stop.reason=="clock_missing"||stop.reason=="duration_overflow") {
                            if(stop.entry&&*stop.entry==ei)state(row,"timing","blocked",stop.reason);
                            else row.reason="wave_not_committed";
                        } else row.reason=stop.reason;
                    }
                }
            }
        }
    }
    for(auto &row:out.rows) {
        checkpoint(cancel);
        if(row.stage=="scheduling") {
            const auto &progress=schedule.controllers[*row.controller];
            if(progress.status=="blocked")state(row,"scheduling","blocked",*row.step==progress.nextStep?progress.reason:"prior_step_blocked");
        }
        if(row.status=="blocked")++out.blockedInstances;
        else if(row.status=="pending")++out.pendingInstances;
    }
    checkpoint(cancel);return out;
}
hier::Result<MemoryTestCoverageReport> inspectMemoryTestCoverage(hier::Design &design,const MemoryTestTimingRequest &request,hier::Cancel cancel)try {
    checkpoint(cancel);auto source=timeMemoryTests(design,request,cancel);if(!source)return source.error();
    MemoryTestCoverageReport out;out.source=std::move(source.value());out.coverage=detail::deriveMemoryTestCoverage(out.source,cancel);checkpoint(cancel);return out;
}catch(const hier::Error &error){return error;}
}
