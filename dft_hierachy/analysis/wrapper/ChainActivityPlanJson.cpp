#include "ChainActivityPlanJson.h"
#include "ChainCompatibilityJson.h"
namespace dft::wrapper {
void writeChainActivityPlan(hier::protocol::JsonWriter &w,const ChainActivityPlanReport &report){
    using hier::protocol::write;const auto &r=report.activity;const auto &l=r.limits;
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-chain-activity-v1").key("source");writeChainCompatibility(w,report.source);
    w.key("activity").beginObject().key("policy").value("first_fit_single_functional_clock").key("limits").beginObject()
        .key("maxBatches").value(l.maxBatches).key("maxChainsPerBatch").value(l.maxChainsPerBatch).key("maxSharedBitsPerBatch").value(l.maxSharedBitsPerBatch)
        .key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject().key("complete").value(r.complete).key("work").value(r.work).key("reasons");write(w,r.reasons);
    w.key("rows").beginArray();for(const auto &x:r.rows){w.beginObject().key("chain").value(uint64_t(x.chain)).key("status").value(x.status);
        if(x.sourceRow)w.key("sourceRow").value(uint64_t(*x.sourceRow));if(x.batch)w.key("batch").value(uint64_t(*x.batch));w.endObject();}w.endArray();
    w.key("batches").beginArray();for(const auto &b:r.batches){w.beginObject().key("chains").beginArray();for(auto ch:b.chains)w.value(uint64_t(ch));w.endArray()
        .key("sharedBits").value(b.sharedBits).key("clockGroup").value(uint64_t(b.clockGroup)).key("holds").beginArray();
        for(const auto &h:b.holds)w.beginObject().key("input").value(uint64_t(h.input)).key("low").value(h.low).key("high").value(h.high).endObject();w.endArray().endObject();}w.endArray();
    const auto &c=r.counts;w.key("counts").beginObject().key("chains").value(c.chains).key("assigned").value(c.assigned).key("conflict").value(c.conflict)
        .key("unresolved").value(c.unresolved).key("empty").value(c.empty).key("oversized").value(c.oversized).key("pending").value(c.pending).key("assignedSharedBits").value(c.assignedSharedBits).endObject();
    if(r.stop)w.key("stop").beginObject().key("reason").value(r.stop->reason).key("chain").value(uint64_t(r.stop->chain)).endObject();w.endObject().endObject();
}
}
