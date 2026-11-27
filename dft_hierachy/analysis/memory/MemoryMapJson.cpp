#include "MemoryMapJson.h"
namespace dft::memory {
using hier::protocol::JsonWriter;
using hier::protocol::write;
void writeMemoryMap(JsonWriter &w,const MacroInterfaces &interfaces,const MemoryMap &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-map-v1").key("interfaces");writeMacroInterfaces(w,interfaces);
    w.key("mapping").beginObject().key("snapshotId").value(r.snapshotId).key("request").beginObject().key("models").beginArray();
    for(const auto &m:r.request.models) {
        w.beginObject().key("definitionName").value(m.definitionName).key("words").value(m.words).key("dataBits").value(m.dataBits).key("maskLaneBits").value(m.maskLaneBits).key("roles").beginArray();
        for(const auto &b:m.roles)w.beginObject().key("role").value(roleName(b.role)).key("pin").value(b.pin).key("sense").value(senseName(b.sense)).endObject();
        w.endArray().endObject();
    }
    w.endArray().key("limits").beginObject().key("maxMacros").value(r.request.limits.maxMacros).key("maxWork").value(r.request.limits.maxWork).key("maxMillis").value(r.request.limits.maxMillis).endObject().endObject();
    w.key("complete").value(r.complete).key("reasons");write(w,r.reasons);
    w.key("work").value(r.work).key("visitedMacros").value(r.visitedMacros).key("matchedInstances").value(r.matchedInstances).key("matchedCapacityBits").value(r.matchedCapacityBits).key("memories").beginArray();
    for(const auto &m:r.memories) {
        w.beginObject().key("macro").value(uint64_t(m.macro));if(m.model)w.key("model").value(uint64_t(*m.model));w.key("status").value(m.status).key("roles").beginArray();
        for(const auto &b:m.roles){w.beginObject().key("role").value(uint64_t(b.role));if(b.pin)w.key("pin").value(uint64_t(*b.pin));w.key("compatible").value(b.compatible).endObject();}
        w.endArray().key("issues").beginArray();
        for(const auto &i:m.issues)w.beginObject().key("code").value(i.code).key("role").value(i.role).key("pin").value(i.pin).key("expected").value(i.expected).key("actual").value(i.actual).endObject();
        w.endArray().endObject();
    }
    w.endArray().endObject().endObject();
}
}
