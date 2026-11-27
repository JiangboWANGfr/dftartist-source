#include "MemoryClockSourcesJson.h"
#include "LogicProofJson.h"
namespace dft::memory {
void writeMemoryClockSources(hier::protocol::JsonWriter &w,const MemoryClockReport &r,const PinLibrary *library) {
    using hier::protocol::write;
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-clock-sources-v1");
    if(library){w.key("library");writePinLibrary(w,*library);}
    w.key("source");writeMemoryMap(w,r.source.interfaces,r.source.mapping);
    w.key("limits").beginObject().key("maxWork").value(r.limits.maxWork).key("maxDepth").value(r.limits.maxDepth).key("maxMillis").value(r.limits.maxMillis).endObject();
    w.key("clocks");writeMemoryClocks(w,r.clocks);w.endObject();
}
void writeMemoryClocks(hier::protocol::JsonWriter &w,const MemoryClocks &c) {
    using hier::protocol::write;
    w.beginObject().key("complete").value(c.complete).key("reasons");write(w,c.reasons);
    w.key("work").value(c.work).key("resolvedInstances").value(c.resolvedInstances).key("rows").beginArray();
    for(const auto &row:c.rows) {
        w.beginObject().key("memory").value(uint64_t(row.memory)).key("macro").value(uint64_t(row.macro)).key("status").value(row.status);
        if(!row.reason.empty())w.key("reason").value(row.reason);
        if(row.pin)w.key("pin").value(uint64_t(*row.pin));
        if(row.group)w.key("group").value(uint64_t(*row.group));
        if(row.proof){w.key("proof");sequential::writeLogicProof(w,*row.proof,false,false);}
        w.endObject();
    }
    w.endArray().key("groups").beginArray();
    for(const auto &g:c.groups) {
        w.beginObject().key("point");write(w,g.point);w.key("path").value(g.path).key("edge").value(g.edge).key("members").beginArray();
        for(const auto row:g.members)w.value(uint64_t(row));
        w.endArray().endObject();
    }
    w.endArray().endObject();
}
}
