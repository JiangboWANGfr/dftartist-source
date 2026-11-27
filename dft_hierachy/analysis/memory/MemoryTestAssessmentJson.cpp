#include "MemoryTestAssessmentJson.h"
#include "MemoryAnalysisJsonInternal.h"
#include "MemoryClockSourcesJson.h"
namespace dft::memory {
void writeMemoryTestAssessment(hier::protocol::JsonWriter &w,const MemoryTestAssessmentReport &r,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-test-assessment-v1").key("source");writeMemoryTestCoverage(w,r.source,library);
    w.key("clockLimits").beginObject().key("maxWork").value(r.clockLimits.maxWork).key("maxDepth").value(r.clockLimits.maxDepth).key("maxMillis").value(r.clockLimits.maxMillis).endObject();
    w.key("clocks");writeMemoryClocks(w,r.clocks);w.key("domains");detail::writeMemoryDomains(w,r.domains);w.key("check");detail::writeMemoryClockCheck(w,r.check);
    w.key("assessment");detail::writeMemoryAssessment(w,r.assessment);w.endObject();
}
void detail::writeMemoryAssessment(hier::protocol::JsonWriter &w,const MemoryTestAssessment &a) {
    w.beginObject().key("complete").value(a.complete).key("verdict").value(a.verdict).key("reasons");hier::protocol::write(w,a.reasons);
    w.key("satisfiedInstances").value(a.satisfiedInstances).key("blockedInstances").value(a.blockedInstances).key("pendingInstances").value(a.pendingInstances).key("rows").beginArray();
    for(const auto &row:a.rows){w.beginObject().key("macro").value(uint64_t(row.macro));if(row.clockCheck)w.key("clockCheck").value(uint64_t(*row.clockCheck));w.key("status").value(row.status).key("issues");hier::protocol::write(w,row.issues);w.endObject();}
    w.endArray().endObject();
}
}
