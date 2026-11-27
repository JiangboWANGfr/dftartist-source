#include "MemoryScheduleResourcesInternal.h"
#include "../common/Utf8.h"
#include <set>
namespace dft::memory::detail {
void validateMemoryScheduleResources(const std::vector<MemoryScheduleResource> &resources,hier::Cancel cancel) {
    const auto checkpoint=[&](){if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory schedule resources cancelled"};};
    const auto require=[](bool ok,const char *why){if(!ok)throw hier::Error{hier::ErrorCode::BadRequest,why};};
    checkpoint();require(resources.size()<=1024,"Too many memory schedule resources");
    size_t bytes=0,domains=0,intervals=0,partitions=0;std::set<std::string> names;
    const auto text=[&](const std::string &s,bool empty=false){require((empty||!s.empty())&&s.size()<=4096&&s.find('\0')==std::string::npos&&dft::detail::validUtf8(s),"Invalid memory schedule resource name/domain");bytes+=s.size();require(bytes<=16777216,"Memory schedule resource strings exceed 16 MiB");};
    for(const auto &r:resources) {
        checkpoint();text(r.name);require(names.insert(r.name).second,"Duplicate memory schedule resource name");
        require(r.maxParallelControllers>=1&&r.maxParallelControllers<=1024,"Invalid memory schedule resource capacity");
        require(r.recoveryPicoseconds<=1000000000000ULL,"Invalid memory schedule resource recovery time");
        require(r.maxPowerMicrowatts<=1000000000000ULL,"Invalid memory schedule resource power ceiling");
        require(r.maxUnits<=1000000000000ULL,"Invalid memory schedule resource unit ceiling");
        require(!r.clockDomains.empty()&&r.clockDomains.size()<=1024,"Invalid memory schedule resource domains");
        domains+=r.clockDomains.size();require(domains<=4096,"Too many total memory schedule resource domains");
        std::set<std::string> seen;
        for(const auto &domain:r.clockDomains){checkpoint();text(domain);require(seen.insert(domain).second,"Duplicate domain in memory schedule resource");}
        require(r.partitions.size()<=1024,"Too many resource partitions");
        partitions+=r.partitions.size();require(partitions<=4096,"Too many total resource partitions");
        std::set<std::string> partitionNames;
        for(const auto &partition:r.partitions) {
            checkpoint();text(partition,true);require(partitionNames.insert(partition).second,"Duplicate resource partition");
        }
        require(r.unavailableIntervals.size()<=1024,"Too many resource unavailable intervals");
        intervals+=r.unavailableIntervals.size();require(intervals<=4096,"Too many total resource unavailable intervals");
        uint64_t previousEnd=0;
        for(const auto &interval:r.unavailableIntervals) {
            checkpoint();
            require(interval.startPicoseconds<interval.endPicoseconds&&interval.endPicoseconds<=9007199254740991ULL,"Invalid resource unavailable interval");
            require(interval.startPicoseconds>=previousEnd,"Resource unavailable intervals must be ordered and disjoint");
            previousEnd=interval.endPicoseconds;
        }
        require(r.domainUnits.size()<=1024,"Too many memory schedule resource unit declarations");
        std::set<std::string> demands;
        for(const auto &d:r.domainUnits) {
            checkpoint();text(d.clockDomain);
            require(seen.contains(d.clockDomain),"Resource unit domain is not in resource clockDomains");
            require(demands.insert(d.clockDomain).second,"Duplicate resource unit domain");
            require(d.units>=1&&d.units<=1000000000000ULL,"Invalid memory schedule resource unit demand");
        }
    }
}
}
