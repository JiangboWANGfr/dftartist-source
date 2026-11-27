#include "ChainCompatibilityJson.h"
#include "ChainResetsJson.h"
namespace dft::wrapper {
void writeChainCompatibility(hier::protocol::JsonWriter &w,const ChainCompatibilityReport &report) {
    using hier::protocol::write;const auto &r=report.compatibility;
    const auto indices=[&](const auto &v){w.beginArray();for(auto x:v)w.value(uint64_t(x));w.endArray();};
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-chain-compatibility-v1").key("source");writeChainResets(w,report.source);
    w.key("compatibility").beginObject().key("policy").value("single_functional_clock").key("limits").beginObject()
        .key("maxGroups").value(r.limits.maxGroups).key("maxWork").value(r.limits.maxWork).key("maxMillis").value(r.limits.maxMillis).endObject()
        .key("complete").value(r.complete).key("work").value(r.work).key("reasons");write(w,r.reasons);
    w.key("groups").beginArray();for(const auto &g:r.groups){w.beginObject().key("name").value(g.name).key("chains");indices(g.chains);w.endObject();}w.endArray();
    w.key("rows").beginArray();for(const auto &x:r.rows){w.beginObject().key("group").value(uint64_t(x.group)).key("complete").value(x.complete).key("status").value(x.status)
        .key("allocatedSharedBits").value(x.allocatedSharedBits).key("allocatedDedicatedBits").value(x.allocatedDedicatedBits).key("clockGroups");indices(x.clockGroups);
        w.key("holds").beginArray();for(const auto &h:x.holds)w.beginObject().key("input").value(uint64_t(h.input)).key("low").value(h.low).key("high").value(h.high).endObject();w.endArray();
        w.key("heldClocks").beginArray();for(const auto &h:x.heldClocks)w.beginObject().key("clockGroup").value(uint64_t(h.clockGroup)).key("input").value(uint64_t(h.input)).endObject();w.endArray();
        w.key("reasons");write(w,x.reasons);w.endObject();}w.endArray();
    const auto &c=r.counts;w.key("counts").beginObject().key("groups").value(c.groups).key("compatible").value(c.compatible).key("conflict").value(c.conflict).key("unresolved").value(c.unresolved).key("empty").value(c.empty).endObject();
    if(r.stop)w.key("stop").beginObject().key("reason").value(r.stop->reason).key("group").value(uint64_t(r.stop->group)).endObject();
    w.endObject().endObject();
}
}
