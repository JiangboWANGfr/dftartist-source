#include "MemoryTestTimingJson.h"
#include "MemoryTestScheduleJson.h"
namespace dft::memory {
void writeMemoryTestTiming(hier::protocol::JsonWriter &w,const MemoryTestTimingReport &r,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-test-timing-v1").key("source");writeMemoryTestSchedule(w,r.source,library);
    const auto &t=r.timeline;const auto &p=t.request.policy;const auto &l=t.request.limits;
    w.key("timeline").beginObject().key("request").beginObject().key("clocks").beginArray();
    for(const auto &clock:t.request.clocks) {
        w.beginObject().key("clockDomain").value(clock.clockDomain).key("periodPicoseconds").value(clock.periodPicoseconds);
        if(!clock.partitions.empty()){w.key("partitions");hier::protocol::write(w,clock.partitions);}
        w.endObject();
    }
    w.endArray().key("policy").beginObject().key("waveOverheadPicoseconds").value(p.waveOverheadPicoseconds).key("maxDurationPicoseconds").value(p.maxDurationPicoseconds).endObject();
    w.key("limits").beginObject().key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject().endObject();
    w.key("complete").value(t.complete).key("reasons");hier::protocol::write(w,t.reasons);
    w.key("work").value(t.work).key("durationPicoseconds").value(t.durationPicoseconds).key("timedSteps").value(t.timedSteps).key("timedInstances").value(t.timedInstances).key("timedCapacityBits").value(t.timedCapacityBits);
    if(t.resourceWaitPicoseconds)w.key("resourceWaitPicoseconds").value(t.resourceWaitPicoseconds);
    if(t.availabilityWaitPicoseconds)w.key("availabilityWaitPicoseconds").value(t.availabilityWaitPicoseconds);
    if(t.dependencyWaitPicoseconds)w.key("dependencyWaitPicoseconds").value(t.dependencyWaitPicoseconds);
    w.key("waves").beginArray();for(const auto &wave:t.waves) {
        w.beginObject().key("startPicoseconds").value(wave.startPicoseconds).key("durationPicoseconds").value(wave.durationPicoseconds).key("endPicoseconds").value(wave.endPicoseconds).key("entries").beginArray();
        for(const auto &entry:wave.entries)w.beginObject().key("clock").value(uint64_t(entry.clock)).key("durationPicoseconds").value(entry.durationPicoseconds).endObject();
        w.endArray();
        if(wave.resourceWait){w.key("resourceWait").beginObject().key("durationPicoseconds").value(wave.resourceWait->durationPicoseconds).key("resources").beginArray();for(auto ri:wave.resourceWait->resources)w.value(uint64_t(ri));w.endArray().endObject();}
        if(wave.availabilityWait){w.key("availabilityWait").beginObject().key("durationPicoseconds").value(wave.availabilityWait->durationPicoseconds).key("intervals").beginArray();for(const auto &v:wave.availabilityWait->intervals)w.beginObject().key("resource").value(uint64_t(v.resource)).key("interval").value(uint64_t(v.interval)).endObject();w.endArray().endObject();}
        if(wave.dependencyWait){w.key("dependencyWait").beginObject().key("durationPicoseconds").value(wave.dependencyWait->durationPicoseconds).key("dependencies").beginArray();for(auto di:wave.dependencyWait->dependencies)w.value(uint64_t(di));w.endArray().endObject();}
        w.endObject();
    }
    w.endArray().key("unusedClocks").beginArray();for(auto i:t.unusedClocks)w.value(uint64_t(i));w.endArray();
    if(t.stop){w.key("stop").beginObject().key("wave").value(uint64_t(t.stop->wave)).key("reason").value(t.stop->reason);if(t.stop->entry)w.key("entry").value(uint64_t(*t.stop->entry));w.endObject();}
    w.endObject().endObject();
}
}
