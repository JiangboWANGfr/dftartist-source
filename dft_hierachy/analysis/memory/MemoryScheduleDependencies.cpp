#include "MemoryScheduleDependenciesInternal.h"
#include "../common/Utf8.h"
#include <map>
#include <set>
#include <tuple>
namespace dft::memory::detail {
void validateMemoryScheduleDependencies(const std::vector<MemoryScheduleDependency> &edges,hier::Cancel cancel) {
    const auto checkpoint=[&](){if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory schedule dependencies cancelled"};};
    const auto require=[](bool ok,const char *why){if(!ok)throw hier::Error{hier::ErrorCode::BadRequest,why};};
    checkpoint();require(edges.size()<=4096,"Too many memory schedule dependencies");
    size_t bytes=0,partitions=0;
    std::set<std::tuple<std::string,std::string,std::set<std::string>,std::set<std::string>>> seen;
    struct Node {size_t incoming=0;std::vector<size_t> next;};
    std::map<std::string,size_t> ids;std::vector<Node> nodes;
    const auto id=[&](const std::string &s){
        require(!s.empty()&&s.size()<=4096&&s.find('\0')==std::string::npos&&dft::detail::validUtf8(s),"Invalid memory schedule dependency domain");
        bytes+=s.size();require(bytes<=16777216,"Memory schedule dependency strings exceed 16 MiB");
        auto [at,inserted]=ids.emplace(s,nodes.size());if(inserted)nodes.emplace_back();return at->second;
    };
    const auto selection=[&](const std::vector<std::string> &names) {
        require(names.size()<=1024,"Too many dependency partitions");
        partitions+=names.size();require(partitions<=4096,"Too many total dependency partitions");
        std::set<std::string> unique;
        for(const auto &name:names) {
            checkpoint();require(name.size()<=4096&&name.find('\0')==std::string::npos&&dft::detail::validUtf8(name),"Invalid memory dependency partition");
            bytes+=name.size();require(bytes<=16777216,"Memory schedule dependency strings exceed 16 MiB");
            require(unique.insert(name).second,"Duplicate memory dependency partition");
        }
        return unique;
    };
    for(const auto &e:edges) {
        checkpoint();require(e.minimumGapPicoseconds<=1000000000000ULL,"Invalid memory dependency gap");const auto before=id(e.before),after=id(e.after);
        require(before!=after,"Self dependency in memory schedule");
        auto beforePartitions=selection(e.beforePartitions),afterPartitions=selection(e.afterPartitions);
        require(seen.emplace(e.before,e.after,std::move(beforePartitions),std::move(afterPartitions)).second,"Duplicate memory schedule dependency");
        nodes[before].next.push_back(after);++nodes[after].incoming;
    }
    // Iterative topological validation: a long user chain cannot exhaust the stack.
    std::vector<size_t> ready;for(size_t i=0;i<nodes.size();++i)if(!nodes[i].incoming)ready.push_back(i);
    for(size_t at=0;at<ready.size();++at){checkpoint();for(auto next:nodes[ready[at]].next){checkpoint();if(!--nodes[next].incoming)ready.push_back(next);}}
    require(ready.size()==nodes.size(),"Cycle in memory schedule dependencies");checkpoint();
}
}
