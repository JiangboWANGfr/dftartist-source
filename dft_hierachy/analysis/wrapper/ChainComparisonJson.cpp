#include "ChainComparisonJson.h"
#include "BoundaryJson.h"
#include "WrapperJsonInternal.h"
namespace dft::wrapper {
void writeChainComparison(hier::protocol::JsonWriter &w,const ChainComparisonReport &r) {
    using hier::protocol::write;
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-chain-comparison-v1").key("source");writeBoundary(w,r.source);
    w.key("configurations").beginArray();
    for(const auto &config:r.configurations) {
        w.beginObject().key("name").value(config.name).key("plan");detail::writeCellPlanFields(w,config.plan);
        w.key("layout");detail::writeChainLayoutFields(w,config.layout);w.endObject();
    }
    w.endArray().key("reference").value(uint64_t(r.reference)).key("limits").beginObject().key("maxChains").value(r.limits.maxChains)
        .key("maxWork").value(r.limits.maxWork).key("maxMillis").value(r.limits.maxMillis).endObject().key("complete").value(r.complete)
        .key("work").value(r.work).key("reasons");write(w,r.reasons);
    w.key("summaries").beginArray();
    for(const auto &s:r.summaries) {
        w.beginObject().key("configuration").value(uint64_t(s.configuration)).key("comparable").value(s.comparable);
        if(s.delta) {
            const auto &v=*s.delta;w.key("delta").beginObject().key("rows").value(v.rows).key("placed").value(v.placed).key("excluded").value(v.excluded).key("blocked").value(v.blocked)
                .key("dedicatedBits").value(v.dedicatedBits).key("sharedBits").value(v.sharedBits).key("reusedBits").value(v.reusedBits).key("totalBits").value(v.totalBits).endObject();
        }
        w.endObject();
    }
    w.endArray().key("chains").beginArray();
    for(const auto &chain:r.chains) {
        w.beginObject().key("name").value(chain.name);if(chain.referenceChain)w.key("referenceChain").value(uint64_t(*chain.referenceChain));
        w.key("entries").beginArray();
        for(const auto &entry:chain.entries) {
            w.beginObject().key("configuration").value(uint64_t(entry.configuration));if(entry.chain)w.key("chain").value(uint64_t(*entry.chain));
            w.key("presence").value(entry.presence).key("comparable").value(entry.comparable);
            if(entry.delta)w.key("delta").beginObject().key("capacity").value(entry.delta->capacity).key("length").value(entry.delta->length).endObject();
            w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray();if(r.stop)w.key("stop").beginObject().key("reason").value(r.stop->reason).key("chain").value(uint64_t(r.stop->chain)).endObject();
    w.endObject();
}
}
