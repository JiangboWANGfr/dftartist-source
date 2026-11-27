#include "MemoryAnalysisJsonInternal.h"
#include "MemoryClockSourcesJson.h"
#include "MemoryTestPlanJson.h"
#include "MemoryTestRulesJson.h"
namespace dft::memory {
void detail::writeMemoryDomains(hier::protocol::JsonWriter &w,const MemoryTestDomains &d) {
    const auto indices=[&](const auto &values){w.beginArray();for(const auto v:values)w.value(uint64_t(v));w.endArray();};
    w.beginObject().key("complete").value(d.complete).key("reasons");hier::protocol::write(w,d.reasons);
    w.key("assignedInstances").value(d.assignedInstances).key("resolvedInstances").value(d.resolvedInstances).key("unassignedMemories");indices(d.unassignedMemories);
    w.key("rows").beginArray();
    for(const auto &row:d.rows) {
        w.beginObject().key("memory").value(uint64_t(row.memory));
        if(row.assignment)w.key("assignment").value(uint64_t(*row.assignment));
        if(row.domain)w.key("domain").value(uint64_t(*row.domain));
        if(row.clock)w.key("clock").value(uint64_t(*row.clock));
        w.endObject();
    }
    w.endArray().key("groups").beginArray();
    for(const auto &g:d.groups) {
        w.beginObject().key("clockDomain").value(g.clockDomain).key("status").value(g.status).key("sourcesComplete").value(g.sourcesComplete).key("resolvedInstances").value(g.resolvedInstances);
        w.key("members");indices(g.members);w.key("clockGroups");indices(g.clockGroups);w.key("controllers");indices(g.controllers);w.endObject();
    }
    w.endArray().endObject();
}
void writeMemoryTestDomains(hier::protocol::JsonWriter &w,const MemoryTestDomainReport &r,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-test-domains-v1").key("source");
    if(const auto *plain=std::get_if<MemoryTestReport>(&r.source))writeMemoryTestPlan(w,*plain,library);else writeMemoryTestRules(w,std::get<MemoryTestRulePlan>(r.source),library);
    w.key("limits").beginObject().key("maxWork").value(r.limits.maxWork).key("maxDepth").value(r.limits.maxDepth).key("maxMillis").value(r.limits.maxMillis).endObject();
    w.key("clocks");writeMemoryClocks(w,r.clocks);
    w.key("domains");detail::writeMemoryDomains(w,r.domains);w.endObject();
}
}
