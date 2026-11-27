#include "MemoryClockCheckInternal.h"
#include "MemoryTestDomainsInternal.h"
#include "../common/Utf8.h"
#include <map>
#include <set>
#include <tuple>
namespace dft::memory {
namespace {
using Key=std::tuple<std::string,uint64_t,std::string>;
void checkpoint(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory clock check cancelled"};}
void require(bool ok,const char *why){if(!ok)throw hier::Error{hier::ErrorCode::BadRequest,why};}
}
void detail::validateMemoryClockExpectations(const std::vector<MemoryClockExpectation> &values,hier::Cancel cancel) {
    checkpoint(cancel);require(values.size()<=10000,"Too many memory clock expectations");
    std::set<std::string> domains;size_t bytes=0,count=0;
    const auto text=[&](const std::string &s){require(!s.empty()&&s.size()<=4096&&s.find('\0')==std::string::npos&&dft::detail::validUtf8(s),"Invalid memory clock expectation name");bytes+=s.size();require(bytes<=16777216,"Clock expectation strings exceed 16 MiB");};
    for(const auto &v:values) {
        checkpoint(cancel);text(v.clockDomain);require(domains.insert(v.clockDomain).second,"Duplicate memory clock expectation domain");
        require(!v.sources.empty()&&v.sources.size()<=256,"Invalid number of allowed clock sources");count+=v.sources.size();require(count<=10000,"Too many total allowed clock sources");std::set<Key> sources;
        for(const auto &s:v.sources){checkpoint(cancel);text(s.path);require(s.bit<=9007199254740991ULL,"Invalid clock source bit offset");require(s.edge=="posedge"||s.edge=="negedge","Invalid clock source edge");require(sources.emplace(s.path,s.bit,s.edge).second,"Duplicate allowed clock source");}
    }
}
void detail::validateMemoryClockCheckRequest(const MemoryClockCheckRequest &r,hier::Cancel cancel) {
    checkpoint(cancel);validateMemoryTestDomainRequest(r.domains);validateMemoryClockExpectations(r.expectations,cancel);
}
MemoryClockCheck detail::evaluateMemoryClockExpectations(const MemoryTestDomains &observedDomains,const MemoryClocks &clocks,const std::vector<MemoryClockExpectation> &expectations,hier::Cancel cancel) {
    MemoryClockCheck check;check.request=expectations;
    std::map<std::string,size_t> domains;std::vector<std::map<Key,size_t>> allowed;std::vector<bool> used(expectations.size(),false);
    for(size_t i=0;i<expectations.size();++i){checkpoint(cancel);const auto &e=expectations[i];domains.emplace(e.clockDomain,i);allowed.emplace_back();for(size_t j=0;j<e.sources.size();++j){checkpoint(cancel);const auto &s=e.sources[j];allowed.back().emplace(Key{s.path,s.bit,s.edge},j);}}
    for(size_t i=0;i<observedDomains.rows.size();++i) {
        checkpoint(cancel);const auto &original=observedDomains.rows[i];MemoryClockCheckRow row;row.row=i;
        if(!original.domain){row.status="unassigned";++check.unassignedInstances;}
        else if(const auto at=domains.find(observedDomains.groups[*original.domain].clockDomain);at==domains.end()){row.status="unconstrained";++check.unconstrainedInstances;}
        else {
            row.expectation=at->second;used[at->second]=true;
            if(!original.clock){row.status="unresolved";row.reason="clock_not_reached";++check.unresolvedInstances;}
            else if(const auto &clock=clocks.rows[*original.clock];!clock.group){row.status="unresolved";row.reason="source_unresolved";++check.unresolvedInstances;}
            else {
                const auto &group=clocks.groups[*clock.group];const auto found=allowed[at->second].find(Key{group.path,group.point.slice.bits.lsb,group.edge});
                if(found==allowed[at->second].end()){row.status="mismatch";++check.mismatchedInstances;}
                else {row.status="match";row.source=found->second;++check.matchedInstances;}
            }
        }
        check.rows.push_back(std::move(row));
    }
    for(size_t i=0;i<used.size();++i){checkpoint(cancel);if(!used[i])check.unusedExpectations.push_back(i);}
    if(!observedDomains.complete)check.reasons.push_back("source_partial");
    if(check.unassignedInstances)check.reasons.push_back("domain_missing");
    if(check.unconstrainedInstances)check.reasons.push_back("expectation_missing");
    if(check.unresolvedInstances)check.reasons.push_back("source_unresolved");
    if(!check.unusedExpectations.empty())check.reasons.push_back("unused_expectations");
    check.complete=check.reasons.empty();check.verdict=check.mismatchedInstances?"fail":check.complete?"pass":"unknown";checkpoint(cancel);return check;
}
hier::Result<MemoryClockCheckReport> checkMemoryClockSources(hier::Design &design,const MemoryClockCheckRequest &r,hier::Cancel cancel)try {
    detail::validateMemoryClockCheckRequest(r,cancel);
    auto source=inspectMemoryTestDomains(design,r.domains,cancel);if(!source)return source.error();
    MemoryClockCheckReport out;out.source=std::move(source.value());auto &check=out.check;
    check=detail::evaluateMemoryClockExpectations(out.source.domains,out.source.clocks,r.expectations,cancel);return out;
}catch(const hier::Error &e){return e;}
}
