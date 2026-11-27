#include "CellPlanJson.h"
#include "WrapperJsonInternal.h"
#include "BoundaryJson.h"
namespace dft::wrapper {
using hier::protocol::write;
namespace {
void indices(hier::protocol::JsonWriter &w,const std::vector<size_t> &values) {w.beginArray();for(auto i:values)w.value(uint64_t(i));w.endArray();}
void ranges(hier::protocol::JsonWriter &w,const std::vector<hier::model::BitRange> &values) {w.beginArray();for(const auto &r:values)write(w,r);w.endArray();}
}
void writeCellPlan(hier::protocol::JsonWriter &w,const CellPlanReport &report) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-cell-plan-v1").key("source");writeBoundary(w,report.source);
    w.key("plan");detail::writeCellPlanFields(w,report.plan);w.endObject();
}
void detail::writeCellPlanFields(hier::protocol::JsonWriter &w,const CellPlan &p) {
    w.beginObject().key("policy").beginObject().key("maxInputCandidates").value(p.policy.maxInputCandidates)
        .key("maxOutputCandidates").value(p.policy.maxOutputCandidates).endObject().key("rules").beginArray();
    for(const auto &r:p.rules) {
        w.beginObject().key("port").value(r.port).key("direction").value(cellDirectionName(r.direction)).key("action").value(cellActionName(r.action));
        if(r.bits){w.key("bits");write(w,*r.bits);}w.endObject();
    }
    w.endArray().key("limits").beginObject().key("maxRows").value(p.limits.maxRows).key("maxWork").value(p.limits.maxWork).key("maxMillis").value(p.limits.maxMillis).endObject()
        .key("complete").value(p.complete).key("work").value(p.work).key("reasons");write(w,p.reasons);
    w.key("rows").beginArray();
    for(const auto &r:p.rows) {
        w.beginObject().key("sourceRow").value(uint64_t(r.sourceRow));if(r.rule)w.key("rule").value(uint64_t(*r.rule));
        w.key("decision").value(r.decision).key("reason").value(r.reason).key("candidateBits").value(r.candidateBits).key("candidates").beginArray();
        for(const auto &c:r.candidates) {
            w.beginObject().key("signal").value(c.signal).key("ranges");ranges(w,c.ranges);w.key("bits").value(c.bits).key("terminals");indices(w,c.terminals);w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("sharedSignals").beginArray();
    for(const auto &s:p.sharedSignals) {
        w.beginObject().key("signal").value(s.signal).key("ranges");ranges(w,s.ranges);w.key("bits").value(s.bits).key("rows");indices(w,s.rows);w.endObject();
    }
    const auto &c=p.counts;
    w.endArray().key("counts").beginObject().key("inputRows").value(c.inputRows).key("outputRows").value(c.outputRows)
        .key("excluded").value(c.excluded).key("dedicated").value(c.dedicated).key("sharedCandidate").value(c.sharedCandidate)
        .key("blocked").value(c.blocked).key("sharedCandidateBits").value(c.sharedCandidateBits).key("uniqueSharedBits").value(c.uniqueSharedBits)
        .key("addedCells").value(c.addedCells).endObject().key("unusedRules");indices(w,p.unusedRules);
    if(p.stop)w.key("stop").beginObject().key("reason").value(p.stop->reason).key("sourceRow").value(uint64_t(p.stop->sourceRow)).endObject();
    w.endObject();
}
}
