#include "MemoryTestComparisonJson.h"
namespace dft::memory {
void writeMemoryTestComparison(hier::protocol::JsonWriter &w,const MemoryTestComparison &r,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-test-comparison-v1").key("reference").value(0).key("complete").value(r.complete);
    w.key("configurations").beginArray();for(const auto &v:r.configurations){w.beginObject().key("name").value(v.name).key("report");writeMemoryTestTiming(w,v.report,library);w.endObject();}w.endArray();
    w.key("rows").beginArray();for(const auto &row:r.rows){const auto &m=row.metrics;
        w.beginObject().key("metrics").beginObject().key("controllers").value(m.controllers).key("plannedSteps").value(m.plannedSteps).key("scheduledWaves").value(m.scheduledWaves).key("timedWaves").value(m.timedWaves).key("timedInstances").value(m.timedInstances).key("timedCapacityBits").value(m.timedCapacityBits).key("durationPicoseconds").value(m.durationPicoseconds);
        if(m.resourceWaitPicoseconds)w.key("resourceWaitPicoseconds").value(m.resourceWaitPicoseconds);
        if(m.availabilityWaitPicoseconds)w.key("availabilityWaitPicoseconds").value(m.availabilityWaitPicoseconds);
        if(m.dependencyWaitPicoseconds)w.key("dependencyWaitPicoseconds").value(m.dependencyWaitPicoseconds);
        w.endObject().key("comparable").value(row.comparable);
        if(row.delta){const auto &d=*row.delta;w.key("delta").beginObject().key("controllers").value(d.controllers).key("plannedSteps").value(d.plannedSteps).key("scheduledWaves").value(d.scheduledWaves).key("durationPicoseconds").value(d.durationPicoseconds);if(m.resourceWaitPicoseconds||r.rows.front().metrics.resourceWaitPicoseconds)w.key("resourceWaitPicoseconds").value(d.resourceWaitPicoseconds);if(m.dependencyWaitPicoseconds||r.rows.front().metrics.dependencyWaitPicoseconds)w.key("dependencyWaitPicoseconds").value(d.dependencyWaitPicoseconds);if(m.availabilityWaitPicoseconds||r.rows.front().metrics.availabilityWaitPicoseconds)w.key("availabilityWaitPicoseconds").value(d.availabilityWaitPicoseconds);w.endObject();}w.endObject();
    }w.endArray().endObject();
}
}
