#include "MemoryTestCoverageJson.h"
#include "MemoryAnalysisJsonInternal.h"
namespace dft::memory {
void writeMemoryTestCoverage(hier::protocol::JsonWriter &w,const MemoryTestCoverageReport &r,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-test-coverage-v1").key("source");writeMemoryTestTiming(w,r.source,library);
    w.key("coverage");detail::writeMemoryCoverage(w,r.coverage);w.endObject();
}
void detail::writeMemoryCoverage(hier::protocol::JsonWriter &w,const MemoryTestCoverage &v) {
    w.beginObject().key("complete").value(v.complete)
        .key("observedMacros").value(v.observedMacros).key("matchedInstances").value(v.matchedInstances)
        .key("plannedInstances").value(v.plannedInstances).key("scheduledInstances").value(v.scheduledInstances)
        .key("timedInstances").value(v.timedInstances).key("blockedInstances").value(v.blockedInstances).key("pendingInstances").value(v.pendingInstances);
    w.key("rows").beginArray();for(const auto &row:v.rows) {
        w.beginObject().key("macro").value(uint64_t(row.macro)).key("stage").value(row.stage).key("status").value(row.status);
        if(!row.reason.empty())w.key("reason").value(row.reason);
        auto index=[&](const char *name,std::optional<size_t> value){if(value)w.key(name).value(uint64_t(*value));};
        index("memory",row.memory);index("plannedMemory",row.plannedMemory);index("controller",row.controller);index("step",row.step);index("wave",row.wave);index("entry",row.entry);
        if(row.timing){const auto &t=*row.timing;w.key("timing").beginObject().key("startPicoseconds").value(t.startPicoseconds).key("durationPicoseconds").value(t.durationPicoseconds).key("endPicoseconds").value(t.endPicoseconds).key("barrierEndPicoseconds").value(t.barrierEndPicoseconds).endObject();}
        w.endObject();
    }w.endArray().endObject();
}
}
