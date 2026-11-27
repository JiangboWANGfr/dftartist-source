#include "ChainCoverageJson.h"
#include "ChainPlanJson.h"
namespace dft::wrapper {
namespace {
void counts(hier::protocol::JsonWriter &w,const ChainCoverageCounts &c) {
    w.beginObject().key("rows").value(c.rows).key("placed").value(c.placed).key("excluded").value(c.excluded)
        .key("blocked").value(c.blocked).key("pending").value(c.pending).key("positions").value(c.positions).endObject();
}
}
void writeChainCoverage(hier::protocol::JsonWriter &w,const ChainCoverageReport &report) {
    using hier::protocol::write;const auto &c=report.coverage;
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-chain-coverage-v1").key("source");writeChainPlan(w,report.source);
    w.key("coverage").beginObject().key("limits").beginObject().key("maxRows").value(c.limits.maxRows).key("maxPositions").value(c.limits.maxPositions)
        .key("maxWork").value(c.limits.maxWork).key("maxMillis").value(c.limits.maxMillis).endObject().key("complete").value(c.complete)
        .key("work").value(c.work).key("reasons");write(w,c.reasons);w.key("rows").beginArray();
    for(const auto &r:c.rows) {
        w.beginObject().key("sourceRow").value(uint64_t(r.sourceRow));if(r.cellRow)w.key("cellRow").value(uint64_t(*r.cellRow));if(r.chainRow)w.key("chainRow").value(uint64_t(*r.chainRow));
        w.key("stage").value(r.stage).key("status").value(r.status).key("reason").value(r.reason).key("positions").beginArray();
        for(const auto &p:r.positions) {
            w.beginObject().key("use").value(uint64_t(p.use)).key("chain").value(uint64_t(p.chain)).key("segment").value(uint64_t(p.segment))
                .key("kind").value(p.kind).key("chainOffset").value(p.chainOffset).key("width").value(p.width);
            if(p.signal)w.key("signal").value(*p.signal);if(p.bits){w.key("bits");write(w,*p.bits);}w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("counts");counts(w,c.counts);w.key("ports").beginArray();
    for(const auto &p:c.ports){w.beginObject().key("port").value(uint64_t(p.port)).key("upstream").value(p.upstream).key("counts");counts(w,p.counts);w.endObject();}
    w.endArray();if(c.stop)w.key("stop").beginObject().key("reason").value(c.stop->reason).key("sourceRow").value(uint64_t(c.stop->sourceRow)).endObject();
    w.endObject().endObject();
}
}
