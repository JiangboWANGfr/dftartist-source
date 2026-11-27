#include "ChainResetsJson.h"
#include "ChainClocksJson.h"
#include "LogicProofJson.h"
namespace dft::wrapper {
void writeChainResets(hier::protocol::JsonWriter &w,const ChainResetReport &report) {
    using hier::protocol::write;const auto &r=report.resets;
    const auto holds=[&](const auto &v){w.beginArray();for(const auto &h:v)w.beginObject().key("input").value(uint64_t(h.input)).key("low").value(h.low).key("high").value(h.high).endObject();w.endArray();};
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-chain-resets-v1").key("source");writeChainClocks(w,report.source);
    w.key("resets").beginObject().key("limits").beginObject().key("maxRows").value(r.limits.maxRows).key("maxEvents").value(r.limits.maxEvents)
        .key("maxWork").value(r.limits.maxWork).key("maxDepth").value(r.limits.maxDepth).key("maxMillis").value(r.limits.maxMillis).endObject()
        .key("complete").value(r.complete).key("work").value(r.work).key("events").value(r.events).key("reasons");write(w,r.reasons);
    w.key("inputs").beginArray();for(const auto &x:r.inputs){w.beginObject().key("point");write(w,x.point);w.key("sourceRef").value(x.sourceRef).endObject();}w.endArray();
    w.key("checks").beginArray();for(const auto &x:r.checks){w.beginObject().key("event");write(w,x.event);w.key("status").value(x.status).key("reason").value(x.reason);
        if(x.proof){w.key("proof");sequential::writeLogicProof(w,*x.proof,false,false);}if(x.input)w.key("input").value(uint64_t(*x.input));if(x.high)w.key("high").value(*x.high);w.endObject();}w.endArray();
    w.key("rows").beginArray();for(const auto &x:r.rows){w.beginObject().key("chain").value(uint64_t(x.chain)).key("segment").value(uint64_t(x.segment));
        if(x.sourceRow)w.key("sourceRow").value(uint64_t(*x.sourceRow));w.key("complete").value(x.complete).key("status").value(x.status).key("reason").value(x.reason).key("events").beginArray();
        for(const auto &e:x.events)w.beginObject().key("match").value(uint64_t(e.match)).key("event").value(uint64_t(e.event)).key("check").value(uint64_t(e.check)).endObject();w.endArray().key("holds");holds(x.holds);w.endObject();}w.endArray();
    w.key("chains").beginArray();for(const auto &s:r.chains){w.beginObject().key("chain").value(uint64_t(s.chain)).key("processedSegments").value(s.processedSegments)
        .key("complete").value(s.complete).key("clearBits").value(s.clearBits).key("holdBits").value(s.holdBits).key("conflictBits").value(s.conflictBits).key("assertedBits").value(s.assertedBits)
        .key("unresolvedBits").value(s.unresolvedBits).key("pendingBits").value(s.pendingBits).key("dedicatedBits").value(s.dedicatedBits).key("holds");holds(s.holds);w.key("status").value(s.status).endObject();}w.endArray();
    if(r.stop)w.key("stop").beginObject().key("reason").value(r.stop->reason).key("chain").value(uint64_t(r.stop->chain)).key("segment").value(uint64_t(r.stop->segment)).endObject();
    w.endObject().endObject();
}
}
