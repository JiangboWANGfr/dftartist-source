#pragma once
#include "MemoryTestSchedule.h"
#include <map>
#include <set>
namespace dft::memory::detail {
void validateMemoryScheduleDependencies(const std::vector<MemoryScheduleDependency> &,hier::Cancel = {});
struct MemoryDependencyIndex {
    std::map<std::string,std::vector<size_t>> beforeDomains, afterDomains;
    struct Partitions { std::set<std::string> before, after; };
    std::vector<Partitions> partitions;
    bool matchesBefore(size_t edge,const std::string &partition) const {
        const auto &allowed=partitions[edge].before;return allowed.empty()||allowed.contains(partition);
    }
    bool matchesAfter(size_t edge,const std::string &partition) const {
        const auto &allowed=partitions[edge].after;return allowed.empty()||allowed.contains(partition);
    }
};
// The shared index stays proportional to declarations, not controller/edge pairs.
// Build privately; callers supply cancellation/deadline checks, without work charges.
template<class Check> bool indexMemoryScheduleDependencies(const std::vector<MemoryScheduleDependency> &edges,MemoryDependencyIndex &out,Check check,bool gapsOnly=false) {
    MemoryDependencyIndex candidate;candidate.partitions.resize(edges.size());
    for(size_t di=0;di<edges.size();++di) {
        if(!check())return false;
        const auto &edge=edges[di];if(gapsOnly&&!edge.minimumGapPicoseconds)continue;
        for(const auto &p:edge.beforePartitions){if(!check())return false;candidate.partitions[di].before.insert(p);}
        for(const auto &p:edge.afterPartitions){if(!check())return false;candidate.partitions[di].after.insert(p);}
        candidate.beforeDomains[edge.before].push_back(di);candidate.afterDomains[edge.after].push_back(di);
    }
    out=std::move(candidate);return true;
}
}
