#include "MemoryScheduleResourcesInputInternal.h"
#include "MemoryScheduleResourcesInternal.h"
namespace dft::memory {
using namespace detail::input;
std::vector<MemoryScheduleResource> detail::input::readMemoryScheduleResources(const Value &value,hier::Cancel cancel) {
    const auto &rows=array(value,"resources",0,1024);std::vector<MemoryScheduleResource> out;size_t count=0;
    for(size_t i=0;i<rows.size();++i) {
        if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory schedule resources loading cancelled"};
        const auto where=at("resources",i);const auto &r=object(rows[i],where);fields(r,where,{"name","maxParallelControllers","clockDomains"},{"recoveryPicoseconds","maxPowerMicrowatts","maxUnits","domainUnits","unavailableIntervals","partitions"});
        MemoryScheduleResource resource;resource.name=text(r.at("name"),where+".name");resource.maxParallelControllers=number(r.at("maxParallelControllers"),where+".maxParallelControllers",1,1024);
        if(r.contains("recoveryPicoseconds"))resource.recoveryPicoseconds=number(r.at("recoveryPicoseconds"),where+".recoveryPicoseconds",0,1000000000000ULL);
        if(r.contains("maxPowerMicrowatts"))resource.maxPowerMicrowatts=number(r.at("maxPowerMicrowatts"),where+".maxPowerMicrowatts",0,1000000000000ULL);
        const auto &domains=array(r.at("clockDomains"),where+".clockDomains",1,1024);count+=domains.size();if(count>4096)bad(where,"too many total resource domains");
        for(const auto &d:domains)resource.clockDomains.push_back(text(d,where+".clockDomains"));
        if(r.contains("maxUnits"))resource.maxUnits=number(r.at("maxUnits"),where+".maxUnits",0,1000000000000ULL);
        if(r.contains("domainUnits")) {
            const auto &demands=array(r.at("domainUnits"),where+".domainUnits",0,1024);
            for(size_t j=0;j<demands.size();++j) {
                if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory schedule resources loading cancelled"};
                const auto atDemand=at(where+".domainUnits",j);const auto &d=object(demands[j],atDemand);fields(d,atDemand,{"clockDomain","units"});
                resource.domainUnits.push_back({text(d.at("clockDomain"),atDemand+".clockDomain"),number(d.at("units"),atDemand+".units",1,1000000000000ULL)});
            }
        }
        if(r.contains("unavailableIntervals")) {
            const auto &intervals=array(r.at("unavailableIntervals"),where+".unavailableIntervals",0,1024);
            for(size_t j=0;j<intervals.size();++j) {
                if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory schedule resources loading cancelled"};
                const auto atInterval=at(where+".unavailableIntervals",j);const auto &v=object(intervals[j],atInterval);fields(v,atInterval,{"startPicoseconds","endPicoseconds"});
                resource.unavailableIntervals.push_back({number(v.at("startPicoseconds"),atInterval+".startPicoseconds",0,9007199254740991ULL),number(v.at("endPicoseconds"),atInterval+".endPicoseconds",1,9007199254740991ULL)});
            }
        }
        if(r.contains("partitions")) {
            const auto &partitions=array(r.at("partitions"),where+".partitions",0,1024);
            for(const auto &partition:partitions) {
                if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory schedule resources loading cancelled"};
                resource.partitions.push_back(text(partition,where+".partitions"));
            }
        }
        out.push_back(std::move(resource));
    }
    detail::validateMemoryScheduleResources(out,cancel);return out;
}
hier::Result<std::vector<MemoryScheduleResource>> parseMemoryScheduleResources(std::string_view input,hier::Cancel cancel)try {
    auto o=decode(input,"memory schedule resources",cancel);fields(o,"memory schedule resources",{"formatVersion","kind","resources"});
    (void)number(o.at("formatVersion"),"formatVersion",1,1);if(text(o.at("kind"),"kind")!="memory-schedule-resources")bad("kind","expected memory-schedule-resources");
    return readMemoryScheduleResources(o.at("resources"),cancel);
}catch(const hier::Error &e){return e;}
hier::Result<std::vector<MemoryScheduleResource>> loadMemoryScheduleResources(const std::filesystem::path &path,hier::Cancel cancel)try {
    return parseMemoryScheduleResources(readFile(path,"memory schedule resources",cancel),cancel);
}catch(const hier::Error &e){return e;}
}
