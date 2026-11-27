#include "MemoryResourceUsageJsonInternal.h"
namespace dft::memory {
void writeMemoryResourceUsage(hier::protocol::JsonWriter &w,const MemoryResourceUsageReport &r,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-resource-usage-v1").key("source");writeMemoryTestTiming(w,r.source,library);
    w.key("usage");detail::writeMemoryResourceUsageBody(w,r.usage);w.endObject();
}
void detail::writeMemoryResourceUsageBody(hier::protocol::JsonWriter &w,const MemoryResourceUsage &u) {
    w.beginObject().key("limits").beginObject().key("maxWork").value(u.limits.maxWork).key("maxUses").value(u.limits.maxUses).key("maxMillis").value(u.limits.maxMillis).endObject();
    w.key("complete").value(u.complete).key("reasons");hier::protocol::write(w,u.reasons);
    w.key("work").value(u.work).key("processedWaves").value(u.processedWaves).key("uses").value(u.uses).key("rows").beginArray();
    for(const auto &row:u.rows) {
        w.beginObject().key("resource").value(uint64_t(row.resource)).key("occupiedPicoseconds").value(row.occupiedPicoseconds).key("peakControllers").value(row.peakControllers).key("peakPowerMicrowatts").value(row.peakPowerMicrowatts).key("uses").beginArray();
        for(const auto &use:row.uses){w.beginObject().key("wave").value(uint64_t(use.wave)).key("entries").beginArray();for(auto ei:use.entries)w.value(uint64_t(ei));w.endArray().endObject();}
        w.endArray();if(row.peakUnits)w.key("peakUnits").value(*row.peakUnits);w.endObject();
    }
    w.endArray();if(u.stop){w.key("stop").beginObject().key("wave").value(uint64_t(u.stop->wave));if(u.stop->entry)w.key("entry").value(uint64_t(*u.stop->entry));w.key("reason").value(u.stop->reason).endObject();}w.endObject();
}
}
