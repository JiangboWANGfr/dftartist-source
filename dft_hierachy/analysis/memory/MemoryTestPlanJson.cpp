#include "MemoryTestPlanJson.h"
#include "MemoryMapJson.h"
#include "PinLibraryJson.h"
namespace dft::memory {
using hier::protocol::write;
void writeMemoryTestPlan(hier::protocol::JsonWriter &w,const MemoryTestReport &report,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-test-plan-v1").key("investigation");writeMemoryMap(w,report.investigation.interfaces,report.investigation.mapping);
    if(library){w.key("library");writePinLibrary(w,*library);}
    const auto &p=report.plan;w.key("plan").beginObject().key("request").beginObject().key("profiles").beginArray();
    for(const auto &v:p.request.profiles)w.beginObject().key("definitionName").value(v.definitionName).key("operationsPerWord").value(v.operationsPerWord).key("powerMicrowatts").value(v.powerMicrowatts).endObject();
    w.endArray().key("assignments").beginArray();
    for(const auto &v:p.request.assignments)w.beginObject().key("instancePath").value(v.instancePath).key("clockDomain").value(v.clockDomain).key("partition").value(v.partition).endObject();
    const auto &policy=p.request.policy;const auto &l=p.request.limits;
    w.endArray().key("policy").beginObject().key("maxMemoriesPerController").value(policy.maxMemoriesPerController).key("maxParallelMemories").value(policy.maxParallelMemories).key("maxPowerMicrowatts").value(policy.maxPowerMicrowatts).endObject();
    w.key("limits").beginObject().key("maxControllers").value(l.maxControllers).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject().endObject();
    w.key("complete").value(p.complete).key("reasons");write(w,p.reasons);
    w.key("work").value(p.work).key("visitedMemories").value(p.visitedMemories).key("scheduledInstances").value(p.scheduledInstances).key("scheduledCapacityBits").value(p.scheduledCapacityBits).key("unusedAssignments").beginArray();
    for(auto i:p.unusedAssignments)w.value(uint64_t(i));
    w.endArray().key("memories").beginArray();
    for(const auto &v:p.memories){w.beginObject().key("memory").value(uint64_t(v.memory));if(v.assignment)w.key("assignment").value(uint64_t(*v.assignment));if(v.controller)w.key("controller").value(uint64_t(*v.controller));if(v.step)w.key("step").value(uint64_t(*v.step));w.key("status").value(v.status).key("reason").value(v.reason).endObject();}
    w.endArray().key("controllers").beginArray();
    for(const auto &v:p.controllers){w.beginObject().key("model").value(uint64_t(v.model)).key("profile").value(uint64_t(v.profile)).key("clockDomain").value(v.clockDomain).key("partition").value(v.partition).key("reason").value(v.reason).key("cycles").value(v.cycles).key("peakPowerMicrowatts").value(v.peakPowerMicrowatts).key("steps").beginArray();
        for(const auto &s:v.steps){w.beginObject().key("memories").beginArray();for(auto i:s.memories)w.value(uint64_t(i));w.endArray().key("reasons");write(w,s.reasons);w.key("cycles").value(s.cycles).key("powerMicrowatts").value(s.powerMicrowatts).endObject();}
        w.endArray().endObject();
    }
    w.endArray().endObject().endObject();
}
}
