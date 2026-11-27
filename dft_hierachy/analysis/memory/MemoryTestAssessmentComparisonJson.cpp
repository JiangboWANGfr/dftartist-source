#include "MemoryTestAssessmentComparisonJson.h"
#include "MemoryAnalysisJsonInternal.h"
#include "MemoryClockSourcesJson.h"
namespace dft::memory {
void writeMemoryTestAssessmentComparison(hier::protocol::JsonWriter &w,const MemoryTestAssessmentComparison &r,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-test-assessment-comparison-v1").key("reference").value(0).key("complete").value(r.complete).key("source");writeMemoryTestComparison(w,r.source,library);
    w.key("clockLimits").beginObject().key("maxWork").value(r.clockLimits.maxWork).key("maxDepth").value(r.clockLimits.maxDepth).key("maxMillis").value(r.clockLimits.maxMillis).endObject();
    w.key("clocks");writeMemoryClocks(w,r.clocks);w.key("configurations").beginArray();
    for(const auto &entry:r.configurations) {
        w.beginObject().key("coverage");detail::writeMemoryCoverage(w,entry.coverage);
        w.key("domains");detail::writeMemoryDomains(w,entry.domains);
        w.key("check");detail::writeMemoryClockCheck(w,entry.check);
        w.key("assessment");detail::writeMemoryAssessment(w,entry.assessment);w.endObject();
    }
    w.endArray().key("rows").beginArray();
    for(const auto &row:r.rows) {
        w.beginObject().key("comparable").value(row.comparable);
        if(row.delta){const auto &d=*row.delta;w.key("delta").beginObject().key("satisfiedInstances").value(d.satisfiedInstances).key("blockedInstances").value(d.blockedInstances).key("pendingInstances").value(d.pendingInstances).endObject();}
        w.key("transitions").beginArray();
        for(const auto &v:row.transitions)w.beginObject().key("macro").value(uint64_t(v.macro)).key("referenceStatus").value(v.referenceStatus).key("status").value(v.status).endObject();
        w.endArray().endObject();
    }
    w.endArray().endObject();
}
}
