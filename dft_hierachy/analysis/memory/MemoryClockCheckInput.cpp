#include "MemoryClockCheckInput.h"
#include "MemoryClockCheckInternal.h"
#include "MemoryInputInternal.h"
namespace dft::memory {
using namespace detail::input;
hier::Result<std::vector<MemoryClockExpectation>> parseMemoryClockExpectations(std::string_view input,hier::Cancel cancel)try {
    auto o=decode(input,"memory clock expectations",cancel);fields(o,"memory clock expectations",{"formatVersion","kind","domains"});
    (void)number(o.at("formatVersion"),"formatVersion",1,1);if(text(o.at("kind"),"kind")!="memory-clock-expectations")bad("kind","expected memory-clock-expectations");
    std::vector<MemoryClockExpectation> result;const auto &domains=array(o.at("domains"),"domains",0,10000);size_t count=0;
    for(size_t i=0;i<domains.size();++i) {
        if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory clock expectations loading cancelled"};
        const auto where=at("domains",i);const auto &row=object(domains[i],where);fields(row,where,{"clockDomain","sources"});MemoryClockExpectation e;e.clockDomain=text(row.at("clockDomain"),where+".clockDomain");
        const auto &sources=array(row.at("sources"),where+".sources",1,256);count+=sources.size();if(count>10000)bad("sources","too many total allowed sources");
        for(const auto &v:sources){const auto &s=object(v,where+".sources");fields(s,where+".sources",{"path","bit","edge"});e.sources.push_back({text(s.at("path"),where+".path"),number(s.at("bit"),where+".bit",0,9007199254740991ULL),text(s.at("edge"),where+".edge")});}
        result.push_back(std::move(e));
    }
    detail::validateMemoryClockExpectations(result,cancel);return result;
}catch(const hier::Error &e){return e;}
hier::Result<std::vector<MemoryClockExpectation>> loadMemoryClockExpectations(const std::filesystem::path &path,hier::Cancel cancel)try {
    return parseMemoryClockExpectations(readFile(path,"memory clock expectations",cancel),cancel);
}catch(const hier::Error &e){return e;}
}
