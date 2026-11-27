#include "ChainPlanJson.h"
#include "WrapperJsonInternal.h"
#include "CellPlanJson.h"
namespace dft::wrapper {
using hier::protocol::write;
void writeChainPlan(hier::protocol::JsonWriter &w,const ChainPlanReport &report) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-chain-plan-v1").key("source");writeCellPlan(w,report.source);
    w.key("layout");detail::writeChainLayoutFields(w,report.layout);w.endObject();
}
void detail::writeChainLayoutFields(hier::protocol::JsonWriter &w,const ChainLayout &p) {
    w.beginObject().key("chains").beginArray();
    for(const auto &c:p.chains) {
        w.beginObject().key("name").value(c.name).key("capacity").value(c.capacity).key("length").value(c.length).key("segments").beginArray();
        for(const auto &s:c.segments) {
            w.beginObject().key("kind").value(s.kind).key("offset").value(s.offset).key("length").value(s.length).key("sourceRow").value(uint64_t(s.sourceRow));
            if(s.signal)w.key("signal").value(*s.signal);if(s.bits){w.key("bits");write(w,*s.bits);}w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("assignments").beginArray();
    for(const auto &a:p.assignments) {
        w.beginObject().key("port").value(a.port).key("direction").value(cellDirectionName(a.direction)).key("chain").value(a.chain);
        if(a.bits){w.key("bits");write(w,*a.bits);}w.endObject();
    }
    w.endArray();if(p.defaultChain)w.key("defaultChain").value(*p.defaultChain);
    w.key("limits").beginObject().key("maxRows").value(p.limits.maxRows).key("maxSegments").value(p.limits.maxSegments).key("maxWork").value(p.limits.maxWork).key("maxMillis").value(p.limits.maxMillis).endObject()
        .key("complete").value(p.complete).key("work").value(p.work).key("reasons");write(w,p.reasons);
    w.key("rows").beginArray();
    for(const auto &r:p.rows) {
        w.beginObject().key("sourceRow").value(uint64_t(r.sourceRow));if(r.assignment)w.key("assignment").value(uint64_t(*r.assignment));if(r.chain)w.key("chain").value(uint64_t(*r.chain));
        w.key("status").value(r.status).key("reason").value(r.reason).key("newBits").value(r.newBits).key("reusedBits").value(r.reusedBits).key("uses").beginArray();
        for(const auto &u:r.uses)w.beginObject().key("segment").value(uint64_t(u.segment)).key("offset").value(u.offset).key("width").value(u.width).endObject();
        w.endArray().endObject();
    }
    const auto &c=p.counts;w.endArray().key("counts").beginObject().key("rows").value(c.rows).key("placed").value(c.placed).key("excluded").value(c.excluded).key("blocked").value(c.blocked)
        .key("dedicatedBits").value(c.dedicatedBits).key("sharedBits").value(c.sharedBits).key("reusedBits").value(c.reusedBits).key("totalBits").value(c.totalBits).endObject().key("unusedAssignments").beginArray();
    for(auto i:p.unusedAssignments)w.value(uint64_t(i));w.endArray();
    if(p.stop)w.key("stop").beginObject().key("reason").value(p.stop->reason).key("sourceRow").value(uint64_t(p.stop->sourceRow)).endObject();
    w.endObject();
}
}
