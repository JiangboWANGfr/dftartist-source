#include "MemoryAnalysisJsonInternal.h"
namespace dft::memory {
void detail::writeMemoryClockCheck(hier::protocol::JsonWriter &w,const MemoryClockCheck &c) {
    w.beginObject().key("request").beginArray();
    for(const auto &e:c.request){w.beginObject().key("clockDomain").value(e.clockDomain).key("sources").beginArray();for(const auto &s:e.sources)w.beginObject().key("path").value(s.path).key("bit").value(s.bit).key("edge").value(s.edge).endObject();w.endArray().endObject();}
    w.endArray().key("complete").value(c.complete).key("verdict").value(c.verdict).key("reasons");hier::protocol::write(w,c.reasons);
    w.key("matchedInstances").value(c.matchedInstances).key("mismatchedInstances").value(c.mismatchedInstances).key("unresolvedInstances").value(c.unresolvedInstances).key("unconstrainedInstances").value(c.unconstrainedInstances).key("unassignedInstances").value(c.unassignedInstances).key("rows").beginArray();
    for(const auto &row:c.rows){w.beginObject().key("row").value(uint64_t(row.row)).key("status").value(row.status);if(row.expectation)w.key("expectation").value(uint64_t(*row.expectation));if(row.source)w.key("source").value(uint64_t(*row.source));if(!row.reason.empty())w.key("reason").value(row.reason);w.endObject();}
    w.endArray().key("unusedExpectations").beginArray();for(auto i:c.unusedExpectations)w.value(uint64_t(i));w.endArray().endObject();
}
void writeMemoryClockCheck(hier::protocol::JsonWriter &w,const MemoryClockCheckReport &r,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-clock-check-v1").key("source");writeMemoryTestDomains(w,r.source,library);
    w.key("check");detail::writeMemoryClockCheck(w,r.check);w.endObject();
}
}
