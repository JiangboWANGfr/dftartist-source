#include "MemoryTestScheduleJson.h"
#include "MemoryTestRulesJson.h"
#include "MemoryTestPlanJson.h"
namespace dft::memory {
void writeMemoryTestSchedule(hier::protocol::JsonWriter &w,const MemoryTestScheduleReport &r,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-test-schedule-v1").key("source");
    if(const auto *plain=std::get_if<MemoryTestReport>(&r.source))writeMemoryTestPlan(w,*plain,library);else writeMemoryTestRules(w,std::get<MemoryTestRulePlan>(r.source),library);
    const auto &s=r.schedule;const auto &p=s.request.policy;const auto &l=s.request.limits;
    w.key("schedule").beginObject().key("request").beginObject().key("policy").beginObject().key("maxParallelControllers").value(p.maxParallelControllers).key("maxPowerMicrowatts").value(p.maxPowerMicrowatts).endObject();
    w.key("limits").beginObject().key("maxWaves").value(l.maxWaves).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    if(!s.request.resources.empty()) {
        w.key("resources").beginArray();
        for(const auto &resource:s.request.resources){w.beginObject().key("name").value(resource.name).key("maxParallelControllers").value(resource.maxParallelControllers).key("clockDomains");hier::protocol::write(w,resource.clockDomains);if(resource.recoveryPicoseconds)w.key("recoveryPicoseconds").value(resource.recoveryPicoseconds);if(resource.maxPowerMicrowatts)w.key("maxPowerMicrowatts").value(resource.maxPowerMicrowatts);
            if(resource.maxUnits)w.key("maxUnits").value(resource.maxUnits);
            if(!resource.unavailableIntervals.empty()){w.key("unavailableIntervals").beginArray();for(const auto &v:resource.unavailableIntervals)w.beginObject().key("startPicoseconds").value(v.startPicoseconds).key("endPicoseconds").value(v.endPicoseconds).endObject();w.endArray();}
            if(!resource.partitions.empty()){w.key("partitions");hier::protocol::write(w,resource.partitions);}
            if(!resource.domainUnits.empty()){w.key("domainUnits").beginArray();for(const auto &d:resource.domainUnits)w.beginObject().key("clockDomain").value(d.clockDomain).key("units").value(d.units).endObject();w.endArray();}
            w.endObject();}
        w.endArray();
    }
    if(!s.request.dependencies.empty()) {
        w.key("dependencies").beginArray();
        for(const auto &edge:s.request.dependencies) {
            w.beginObject().key("before").value(edge.before).key("after").value(edge.after);
            if(edge.minimumGapPicoseconds)w.key("minimumGapPicoseconds").value(edge.minimumGapPicoseconds);
            const auto selection=[&](const char *key,const std::vector<std::string> &names) {
                if(names.empty())return;
                w.key(key).beginArray();for(const auto &name:names)w.value(name);w.endArray();
            };
            selection("beforePartitions",edge.beforePartitions);selection("afterPartitions",edge.afterPartitions);
            w.endObject();
        }
        w.endArray();
    }
    w.endObject();
    w.key("complete").value(s.complete).key("reasons");hier::protocol::write(w,s.reasons);
    w.key("work").value(s.work).key("scheduledSteps").value(s.scheduledSteps).key("scheduledInstances").value(s.scheduledInstances).key("scheduledCapacityBits").value(s.scheduledCapacityBits).key("controllers").beginArray();
    for(const auto &c:s.controllers){w.beginObject().key("nextStep").value(uint64_t(c.nextStep)).key("status").value(c.status);if(!c.reason.empty())w.key("reason").value(c.reason);if(c.dependency)w.key("dependency").value(uint64_t(*c.dependency));if(c.resource)w.key("resource").value(uint64_t(*c.resource));w.endObject();}
    w.endArray().key("waves").beginArray();
    for(const auto &wave:s.waves){w.beginObject().key("powerMicrowatts").value(wave.powerMicrowatts).key("entries").beginArray();for(const auto &e:wave.entries)w.beginObject().key("controller").value(uint64_t(e.controller)).key("step").value(uint64_t(e.step)).endObject();w.endArray().endObject();}
    w.endArray().endObject().endObject();
}
}
