#include "MemoryTestDomainsJson.h"
#include "MemoryClockSourcesJson.h"
#include "MemoryTestPlanJson.h"
#include "MemoryLibraryInput.h"
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::memory;size_t checks=0;
void need(bool ok,const char *what){++checks;if(!ok)throw std::runtime_error(what);}
std::string json(const MemoryTestDomainReport &r){hier::protocol::JsonWriter w;writeMemoryTestDomains(w,r);return w.str();}
const MemoryTestReport &original(const MemoryTestDomainReport &r){return std::holds_alternative<MemoryTestReport>(r.source)?std::get<MemoryTestReport>(r.source):std::get<MemoryTestRulePlan>(r.source).report;}
void relations(const MemoryTestDomainReport &r) {
 const auto &src=original(r);const auto &ds=r.domains;need(ds.rows.size()==src.investigation.mapping.memories.size(),"one row per observed mapping");
 uint64_t assigned=0,resolved=0;
 for(size_t i=0;i<ds.rows.size();++i){const auto &row=ds.rows[i];need(row.memory==i,"mapping order");need(row.assignment.has_value()==row.domain.has_value(),"assignment/domain linked");if(row.clock)need(r.clocks.rows[*row.clock].memory==i,"clock index");if(row.assignment){++assigned;const auto &g=ds.groups[*row.domain];need(g.clockDomain==src.plan.request.assignments[*row.assignment].clockDomain,"domain label");}}
 for(size_t i=0;i<ds.groups.size();++i){const auto &g=ds.groups[i];resolved+=g.resolvedInstances;for(auto m:g.members)need(ds.rows[m].domain==i,"reverse members");for(auto c:g.controllers)need(src.plan.controllers[c].clockDomain==g.clockDomain,"original controller index");need(g.sourcesComplete==(g.resolvedInstances==g.members.size()),"observed completeness");}
 need(assigned==ds.assignedInstances&&resolved==ds.resolvedInstances,"aggregate counts");
}
}
int main()try {
 const auto dir=std::filesystem::path(DFT_MEMORY_DOMAIN_DIR);auto lib=loadMemoryLibrary(dir/"memory-clock-library.json");need(bool(lib),"library");
 MemoryTestDomainRequest q;q.test.investigation.scope="domain_resolved";q.test.investigation.recursive=true;q.test.investigation.mapping.models=lib->models;
 for(const auto &m:lib->models)q.test.planning.profiles.push_back({m.definitionName,2,10});
 for(const auto *name:{"direct0","direct1","inverted","double_inv","neg_inv","branch.nested"})q.test.planning.assignments.push_back({std::string("domain_resolved.")+name,"D",std::string(name)=="direct0"?"A":"B"});
 hier::model::OpenOptions opts;opts.tops={"domain_resolved"};opts.files={dir/"memory-clock-sources.sv",dir/"memory-test-domains.sv"};auto d=hier::Design::open(opts);need(d&&d.value()->diagnostics(100).errorCount==0,"RTL");
 auto r=inspectMemoryTestDomains(*d.value(),q);need(bool(r),"report");relations(*r);
 need(r->domains.complete&&r->domains.groups.size()==1,"complete mixed observation");const auto &g=r->domains.groups[0];need(g.status=="mixed"&&g.sourcesComplete&&g.clockGroups.size()==3&&g.members.size()==6&&g.controllers.size()==3,"across models and partitions");
 auto plan=planMemoryTests(*d.value(),q.test);hier::protocol::JsonWriter a,b;writeMemoryTestPlan(a,*plan);writeMemoryTestPlan(b,original(*r));need(a.str()==b.str(),"unchanged plan");
 auto clocks=inspectMemoryClockSources(*d.value(),{q.test.investigation,q.limits});hier::protocol::JsonWriter c,e;writeMemoryClocks(c,clocks->clocks);writeMemoryClocks(e,r->clocks);need(c.str()==e.str(),"unchanged clock proof");
 auto split=q;for(auto &as:split.test.planning.assignments){as.clockDomain=as.instancePath.ends_with("direct1")?"bit1":as.instancePath.ends_with("inverted")?"negative":"bit0";}
 auto uniform=inspectMemoryTestDomains(*d.value(),split);need(uniform&&uniform->domains.complete&&uniform->domains.groups.size()==3,"split three domains");for(const auto &v:uniform->domains.groups)need(v.status=="uniform"&&v.sourcesComplete&&v.clockGroups.size()==1,"uniform sources");relations(*uniform);
 auto missing=q;missing.test.planning.assignments.pop_back();auto m=inspectMemoryTestDomains(*d.value(),missing);need(m&&!m->domains.complete&&m->domains.unassignedMemories.size()==1&&m->domains.assignedInstances==5,"missing assignment");relations(*m);
 auto prefix=q;prefix.test.planning.limits.maxWork=1;auto p=inspectMemoryTestDomains(*d.value(),prefix);need(p&&!p->domains.complete&&p->domains.rows.size()==6&&p->domains.assignedInstances==6&&p->domains.groups[0].sourcesComplete,"plan prefix preserves full observed domain");relations(*p);
 prefix=q;prefix.limits.maxWork=1;p=inspectMemoryTestDomains(*d.value(),prefix);need(p&&!p->domains.complete&&p->domains.rows.size()==6&&p->clocks.rows.size()==1&&p->domains.groups[0].status=="unresolved","clock prefix keeps all assigned rows");relations(*p);
 prefix=q;prefix.test.investigation.mapping.limits.maxMacros=2;p=inspectMemoryTestDomains(*d.value(),prefix);need(p&&!p->domains.complete&&p->domains.rows.size()==2,"observed prefix not full design");relations(*p);
 auto mismatch=q;mismatch.test.investigation.mapping.models[0].dataBits=16;m=inspectMemoryTestDomains(*d.value(),mismatch);need(m&&!m->domains.complete&&m->domains.assignedInstances==6&&m->domains.groups[0].status=="unresolved","mismatched members retained");relations(*m);
 auto rules=q;rules.test.planning.assignments.clear();rules.rules=std::vector<MemoryTestRule>{{{"domain_resolved"},true,"D","B"}};auto ruled=inspectMemoryTestDomains(*d.value(),rules);need(ruled&&ruled->domains.complete&&std::holds_alternative<MemoryTestRulePlan>(ruled->source)&&ruled->domains.groups[0].status=="mixed","rule path");relations(*ruled);
 auto empty=q;empty.test.investigation.recursive=false;auto unused=inspectMemoryTestDomains(*d.value(),empty);need(unused&&!unused->domains.complete&&unused->domains.rows.empty()&&unused->domains.reasons==std::vector<std::string>{"plan_partial"},"unused assignments keep original partial");empty.test.planning.assignments.clear();auto none=inspectMemoryTestDomains(*d.value(),empty);need(none&&none->domains.complete&&none->domains.rows.empty()&&none->domains.groups.empty(),"empty observed scope");
 auto bad=q;bad.test.investigation.scope="absent";bad.limits.maxDepth=0;auto error=inspectMemoryTestDomains(*d.value(),bad);need(!error&&error.error().code==hier::ErrorCode::BadRequest,"limits before query");
 bad=q;bad.test.investigation.scope="absent";bad.test.planning.profiles[0].operationsPerWord=0;error=inspectMemoryTestDomains(*d.value(),bad);need(!error&&error.error().code==hier::ErrorCode::BadRequest,"all planning before query");
 std::stop_source stop;stop.request_stop();error=inspectMemoryTestDomains(*d.value(),bad,stop.get_token());need(!error&&error.error().code==hier::ErrorCode::Cancelled,"cancel precedes invalid request");need(bool(inspectMemoryTestDomains(*d.value(),q)),"recovery");
 opts.tops={"domain_top"};auto full=hier::Design::open(opts);need(full&&full.value()->diagnostics(100).errorCount==0,"full RTL");rules.test.investigation.scope="domain_top";rules.rules=std::vector<MemoryTestRule>{{{"domain_top"},true,"D",""}};auto mixed=inspectMemoryTestDomains(*full.value(),rules);need(mixed&&!mixed->domains.complete&&mixed->domains.groups[0].status=="mixed"&&!mixed->domains.groups[0].sourcesComplete&&mixed->domains.groups[0].members.size()==7&&mixed->domains.resolvedInstances==6,"mixed with unresolved member");relations(*mixed);
 auto text=json(*r);d.value().reset();q={};need(json(*r)==text,"owned after release");std::cout<<checks<<" memory test domain assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
