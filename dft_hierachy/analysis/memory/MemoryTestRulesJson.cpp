#include "MemoryTestRulesJson.h"
#include "MemoryTestPlanJson.h"
namespace dft::memory {
void writeMemoryTestRules(hier::protocol::JsonWriter &w,const MemoryTestRulePlan &p,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-test-rules-v1").key("rules").beginArray();
    for(const auto &r:p.rules){w.beginObject().key("path");hier::protocol::write(w,r.path);w.key("recursive").value(r.recursive).key("clockDomain").value(r.clockDomain).key("partition").value(r.partition).endObject();}
    w.endArray().key("choices").beginArray();for(const auto &v:p.choices){w.beginObject().key("memory").value(uint64_t(v.memory));if(v.rule)w.key("rule").value(uint64_t(*v.rule));if(v.assignment)w.key("assignment").value(uint64_t(*v.assignment));w.endObject();}
    w.endArray().key("unusedRules").beginArray();for(auto i:p.unusedRules)w.value(uint64_t(i));
    w.endArray().key("visitedSegments").value(p.visitedSegments).key("report");writeMemoryTestPlan(w,p.report,library);w.endObject();
}
}
