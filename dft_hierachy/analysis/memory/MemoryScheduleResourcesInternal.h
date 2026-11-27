#pragma once
#include "MemoryTestSchedule.h"
#include <map>
#include <set>
namespace dft::memory::detail {
void validateMemoryScheduleResources(const std::vector<MemoryScheduleResource> &,hier::Cancel = {});
struct MemoryResourceBinding { size_t resource; uint64_t units; };
struct MemoryResourceIndex {
    std::map<std::string,std::vector<MemoryResourceBinding>> domains;
    std::vector<std::set<std::string>> partitions;
    bool matches(size_t resource,const std::string &partition) const {
        const auto &allowed=partitions[resource];return allowed.empty()||allowed.contains(partition);
    }
};
// Callers supply their own cancellation/deadline check and only execute after
// successful construction. No work is charged for this bounded reverse index.
template<class Check> bool indexMemoryScheduleResources(const std::vector<MemoryScheduleResource> &resources,MemoryResourceIndex &out,Check check) {
    out.partitions.resize(resources.size());
    for(size_t ri=0;ri<resources.size();++ri) {
        const auto &resource=resources[ri];std::map<std::string,uint64_t> demands;
        for(const auto &partition:resource.partitions){if(!check())return false;out.partitions[ri].insert(partition);}
        for(const auto &d:resource.domainUnits){if(!check())return false;demands.emplace(d.clockDomain,d.units);}
        for(const auto &domain:resource.clockDomains) {
            if(!check())return false;
            const auto demand=demands.find(domain);
            out.domains[domain].push_back({ri,demand==demands.end()?1:demand->second});
        }
    }
    return true;
}
}
