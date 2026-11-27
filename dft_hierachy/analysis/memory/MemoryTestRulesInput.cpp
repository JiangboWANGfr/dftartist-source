#include "MemoryTestRulesInput.h"
#include "MemoryTestRulesInternal.h"
#include "MemoryTestRulesInputInternal.h"
namespace dft::memory {
using namespace detail::input;
std::vector<MemoryTestRule> detail::input::readMemoryTestRules(const Value &value,hier::Cancel c) {
    auto checkpoint=[&]{if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory test rules loading cancelled"};};
    const auto &rows=array(value,"rules",1,1024);std::vector<MemoryTestRule> result;
    for(size_t i=0;i<rows.size();++i){checkpoint();const auto w=at("rules",i);const auto &row=object(rows[i],w);fields(row,w,{"path","recursive","clockDomain","partition"});MemoryTestRule rule;
        const auto &segments=array(row.at("path"),w+".path",1,256);for(const auto &segment:segments){checkpoint();rule.path.push_back(text(segment,w+".path"));}
        const auto *recursive=std::get_if<bool>(&row.at("recursive").value);if(!recursive)bad(w+".recursive","expected boolean");rule.recursive=*recursive;
        rule.clockDomain=text(row.at("clockDomain"),w+".clockDomain");rule.partition=text(row.at("partition"),w+".partition");result.push_back(std::move(rule));
    }
    detail::validateMemoryTestRules(result);checkpoint();return result;
}
hier::Result<std::vector<MemoryTestRule>> parseMemoryTestRules(std::string_view input,hier::Cancel c)try {
    auto o=decode(input,"memory test rules",c);fields(o,"memory test rules",{"formatVersion","kind","rules"});
    (void)number(o.at("formatVersion"),"formatVersion",1,1);if(text(o.at("kind"),"kind")!="memory-test-rules")bad("kind","expected memory-test-rules");
    return readMemoryTestRules(o.at("rules"),c);
}catch(const hier::Error &e){return e;}
hier::Result<std::vector<MemoryTestRule>> loadMemoryTestRules(const std::filesystem::path &path,hier::Cancel c)try {
    return parseMemoryTestRules(readFile(path,"memory test rules",c),c);
}catch(const hier::Error &e){return e;}
}
