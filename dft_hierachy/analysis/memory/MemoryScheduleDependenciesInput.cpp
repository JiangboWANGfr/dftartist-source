#include "MemoryScheduleDependenciesInputInternal.h"
#include "MemoryScheduleDependenciesInternal.h"
namespace dft::memory {
using namespace detail::input;
std::vector<MemoryScheduleDependency> detail::input::readMemoryScheduleDependencies(const Value &value,hier::Cancel cancel) {
    const auto &rows=array(value,"dependencies",0,4096);std::vector<MemoryScheduleDependency> out;
    for(size_t i=0;i<rows.size();++i) {
        if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory schedule dependencies loading cancelled"};
        const auto where=at("dependencies",i);const auto &row=object(rows[i],where);fields(row,where,{"before","after"},{"minimumGapPicoseconds","beforePartitions","afterPartitions"});
        MemoryScheduleDependency edge{text(row.at("before"),where+".before"),text(row.at("after"),where+".after")};
        if(row.contains("minimumGapPicoseconds"))edge.minimumGapPicoseconds=number(row.at("minimumGapPicoseconds"),where+".minimumGapPicoseconds",0,1000000000000ULL);
        const auto read=[&](const char *key,std::vector<std::string> &outNames) {
            if(!row.contains(key))return;
            for(const auto &name:array(row.at(key),where+"."+key,0,1024)) {
                if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory dependency partitions loading cancelled"};
                outNames.push_back(text(name,where+"."+key));
            }
        };
        read("beforePartitions",edge.beforePartitions);read("afterPartitions",edge.afterPartitions);
        out.push_back(std::move(edge));
    }
    detail::validateMemoryScheduleDependencies(out,cancel);return out;
}
hier::Result<std::vector<MemoryScheduleDependency>> parseMemoryScheduleDependencies(std::string_view input,hier::Cancel cancel)try {
    auto o=decode(input,"memory schedule dependencies",cancel);fields(o,"memory schedule dependencies",{"formatVersion","kind","dependencies"});
    (void)number(o.at("formatVersion"),"formatVersion",1,1);if(text(o.at("kind"),"kind")!="memory-schedule-dependencies")bad("kind","expected memory-schedule-dependencies");
    return readMemoryScheduleDependencies(o.at("dependencies"),cancel);
}catch(const hier::Error &e){return e;}
hier::Result<std::vector<MemoryScheduleDependency>> loadMemoryScheduleDependencies(const std::filesystem::path &path,hier::Cancel cancel)try {
    return parseMemoryScheduleDependencies(readFile(path,"memory schedule dependencies",cancel),cancel);
}catch(const hier::Error &e){return e;}
}
