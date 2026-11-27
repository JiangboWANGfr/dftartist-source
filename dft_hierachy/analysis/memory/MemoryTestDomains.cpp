#include "MemoryTestDomainsInternal.h"
#include "MemoryClockSourcesInternal.h"
#include "MemoryTestPlanInternal.h"
#include "MemoryTestRulesInternal.h"
#include <map>
#include <set>
namespace dft::memory {
namespace {
template<class T> T take(hier::Result<T> r) { if(!r)throw r.error();return std::move(r.value()); }
void checkpoint(hier::Cancel cancel) { if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory domain inspection cancelled"}; }
}
void detail::validateMemoryTestDomainRequest(const MemoryTestDomainRequest &r) {
    if(r.rules)validateMemoryTestRuleRequest({r.test,*r.rules});else validateMemoryTestRequest(r.test);
    validateMemoryClockRequest({r.test.investigation,r.limits});
}
MemoryTestDomains detail::associateMemoryDomains(const MemoryTestReport &original,const MemoryClocks &clocks,hier::Cancel cancel) {
        const auto &investigation=original.investigation;const auto &plan=original.plan;
        MemoryTestDomains domains;
        std::map<std::string,size_t> assignments,byDomain;
        for(size_t i=0;i<plan.request.assignments.size();++i){checkpoint(cancel);assignments.emplace(plan.request.assignments[i].instancePath,i);}
        std::vector<std::optional<size_t>> clockRows(investigation.mapping.memories.size());
        for(size_t i=0;i<clocks.rows.size();++i){checkpoint(cancel);clockRows[clocks.rows[i].memory]=i;}
        std::vector<std::set<size_t>> seenGroups;
        for(size_t i=0;i<investigation.mapping.memories.size();++i) {
            checkpoint(cancel);
            MemoryTestDomainRow row;row.memory=i;row.clock=clockRows[i];
            const auto &macro=investigation.interfaces.macros[investigation.mapping.memories[i].macro];
            const auto &path=investigation.interfaces.catalog.instances[macro.instance].info.pathText;
            if(const auto at=assignments.find(path);at!=assignments.end()) {
                row.assignment=at->second;++domains.assignedInstances;
                const auto &label=plan.request.assignments[*row.assignment].clockDomain;
                const auto [it,inserted]=byDomain.emplace(label,domains.groups.size());
                if(inserted){MemoryTestDomainGroup group;group.clockDomain=label;domains.groups.push_back(std::move(group));seenGroups.emplace_back();}
                row.domain=it->second;auto &group=domains.groups[*row.domain];group.members.push_back(domains.rows.size());
                if(row.clock&&clocks.rows[*row.clock].group) {
                    const auto clock=*clocks.rows[*row.clock].group;
                    if(seenGroups[*row.domain].insert(clock).second)group.clockGroups.push_back(clock);
                    ++group.resolvedInstances;++domains.resolvedInstances;
                }
            } else domains.unassignedMemories.push_back(i);
            domains.rows.push_back(std::move(row));
        }
        for(size_t i=0;i<plan.controllers.size();++i) {
            checkpoint(cancel);const auto at=byDomain.find(plan.controllers[i].clockDomain);
            if(at!=byDomain.end())domains.groups[at->second].controllers.push_back(i);
        }
        for(auto &group:domains.groups) {
            checkpoint(cancel);group.sourcesComplete=group.resolvedInstances==group.members.size();
            group.status=group.clockGroups.size()>1?"mixed":group.sourcesComplete?"uniform":"unresolved";
        }
        if(!plan.complete)domains.reasons.push_back("plan_partial");
        if(!clocks.complete)domains.reasons.push_back("clocks_partial");
        if(!domains.unassignedMemories.empty())domains.reasons.push_back("domain_missing");
        domains.complete=domains.reasons.empty();checkpoint(cancel);return domains;
}
hier::Result<MemoryTestDomainReport> inspectMemoryTestDomains(hier::Design &design,const MemoryTestDomainRequest &request,hier::Cancel cancel) {
    try {
        checkpoint(cancel);detail::validateMemoryTestDomainRequest(request);
        MemoryTestDomainReport out;out.limits=request.limits;
        if(request.rules)out.source=take(planMemoryTestsByRules(design,{request.test,*request.rules},cancel));
        else out.source=take(planMemoryTests(design,request.test,cancel));
        const auto &original=std::holds_alternative<MemoryTestReport>(out.source)?std::get<MemoryTestReport>(out.source):std::get<MemoryTestRulePlan>(out.source).report;
        out.clocks=detail::resolveMemoryClocks(design,original.investigation,request.limits,cancel);
        out.domains=detail::associateMemoryDomains(original,out.clocks,cancel);return out;
    } catch(const hier::Error &e) { return e; }
}
}
