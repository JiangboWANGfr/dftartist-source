#include "ChainActivityScheduleJson.h"
#include "ChainActivityPlanJson.h"
namespace dft::wrapper {
void writeChainActivitySchedule(hier::protocol::JsonWriter &w,const ChainActivityScheduleReport &report){
    using hier::protocol::write;const auto &s=report.schedule;const auto &p=s.pulse;const auto &l=s.limits;
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-activity-schedule-v1").key("source");writeChainActivityPlan(w,report.source);
    w.key("schedule").beginObject().key("unit").value("tick").key("pulse").beginObject().key("setupTicks").value(p.setupTicks).key("highTicks").value(p.highTicks).key("lowTicks").value(p.lowTicks).key("pulses").value(p.pulses).endObject()
        .key("periodTicks").value(s.periodTicks).key("batchTicks").value(s.batchTicks).key("limits").beginObject().key("maxRows").value(l.maxRows).key("maxTicks").value(l.maxTicks).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject()
        .key("complete").value(s.complete).key("work").value(s.work).key("reasons");write(w,s.reasons);
    w.key("rows").beginArray();for(const auto &r:s.rows){w.beginObject().key("batch").value(uint64_t(r.batch)).key("start").value(r.start).key("end").value(r.end).key("firstEdge").value(r.firstEdge).key("lastEdge").value(r.lastEdge).key("lastReturn").value(r.lastReturn)
        .key("clockGroup").value(uint64_t(r.clockGroup)).key("idleHigh").value(r.idleHigh).key("activeHigh").value(r.activeHigh).key("activeTicks").value(r.activeTicks).key("idleTicks").value(r.idleTicks).key("holds").beginArray();
        for(const auto &h:r.holds)w.beginObject().key("input").value(uint64_t(h.input)).key("high").value(h.high).endObject();w.endArray().endObject();}w.endArray();
    const auto &c=s.counts;w.key("counts").beginObject().key("batches").value(c.batches).key("chains").value(c.chains).key("sharedBits").value(c.sharedBits).key("elapsedTicks").value(c.elapsedTicks).endObject();
    if(s.stop)w.key("stop").beginObject().key("reason").value(s.stop->reason).key("batch").value(uint64_t(s.stop->batch)).endObject();w.endObject().endObject();
}
}
