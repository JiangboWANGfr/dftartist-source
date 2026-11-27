#include "ChainClocksJson.h"
#include "ChainPlanJson.h"
#include "LogicProofJson.h"
namespace dft::wrapper {
void writeChainClocks(hier::protocol::JsonWriter &w,const ChainClockReport &report) {
    using hier::protocol::write;const auto &c=report.clocks;
    const auto indices=[&](const std::vector<size_t> &v){w.beginArray();for(auto i:v)w.value(uint64_t(i));w.endArray();};
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-chain-clocks-v1").key("source");writeChainPlan(w,report.source);
    w.key("clocks").beginObject().key("limits").beginObject().key("maxRows").value(c.limits.maxRows).key("maxRegisters").value(c.limits.maxRegisters)
        .key("maxWork").value(c.limits.maxWork).key("maxDepth").value(c.limits.maxDepth).key("maxMillis").value(c.limits.maxMillis).key("pageSize").value(c.limits.pageSize)
        .endObject().key("complete").value(c.complete).key("work").value(c.work).key("registers").value(c.registers).key("reasons");write(w,c.reasons);
    w.key("pages").beginArray();for(const auto &p:c.pages){w.beginObject().key("inst").value(p.inst).key("response");write(w,p.response);w.endObject();}w.endArray();
    w.key("checks").beginArray();for(const auto &x:c.checks){w.beginObject().key("event");w.beginObject().key("signal").value(x.event.signal).key("bits");write(w,x.event.bits);w.key("edge").value(x.event.edge).endObject();w.key("status").value(x.status).key("reason").value(x.reason);
        if(x.proof){w.key("proof");sequential::writeLogicProof(w,*x.proof,false,false);}if(x.group)w.key("group").value(uint64_t(*x.group));w.endObject();}w.endArray();
    w.key("groups").beginArray();for(const auto &g:c.groups){w.beginObject().key("point");write(w,g.point);w.key("sourceRef").value(g.sourceRef).key("edge").value(g.edge).endObject();}w.endArray();
    w.key("rows").beginArray();for(const auto &r:c.rows){w.beginObject().key("chain").value(uint64_t(r.chain)).key("segment").value(uint64_t(r.segment))
        .key("status").value(r.status).key("reason").value(r.reason).key("matches").beginArray();
        for(const auto &m:r.matches){w.beginObject().key("page").value(uint64_t(m.page)).key("fact").value(uint64_t(m.fact)).key("bits");write(w,m.bits);
            if(m.check)w.key("check").value(uint64_t(*m.check));if(m.group)w.key("group").value(uint64_t(*m.group));w.endObject();}
        w.endArray().key("groups");indices(r.groups);w.endObject();}w.endArray();
    w.key("chains").beginArray();for(const auto &x:c.chains){w.beginObject().key("chain").value(uint64_t(x.chain)).key("processedSegments").value(x.processedSegments)
        .key("resolvedBits").value(x.resolvedBits).key("unresolvedBits").value(x.unresolvedBits).key("dedicatedBits").value(x.dedicatedBits).key("groups");indices(x.groups);w.key("status").value(x.status).endObject();}w.endArray();
    if(c.stop)w.key("stop").beginObject().key("reason").value(c.stop->reason).key("chain").value(uint64_t(c.stop->chain)).key("segment").value(uint64_t(c.stop->segment)).endObject();
    w.endObject().endObject();
}
}
