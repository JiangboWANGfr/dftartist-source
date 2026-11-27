#include "MemoryResourceUsageComparisonInternal.h"
#include "MemoryResourceUsageInternal.h"
#include "MemoryTestComparisonInternal.h"
#include <map>
#include <set>
namespace dft::memory {
namespace {
using Time=std::chrono::steady_clock::time_point;
void checkpoint(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory resource comparison cancelled"};}
struct Declaration { size_t resource; std::set<std::string> domains, partitions; };
void align(MemoryResourceUsageComparison &out,hier::Cancel cancel) {
    std::vector<std::map<std::string,Declaration>> indices(out.configurations.size());
    std::set<std::string> seen;
    for(size_t ci=0;ci<indices.size();++ci) {
        const auto &resources=out.source.configurations[ci].report.source.schedule.request.resources;
        for(size_t ri=0;ri<resources.size();++ri) {
            checkpoint(cancel);const auto &resource=resources[ri];Declaration declaration{ri,{},{}};
            for(const auto &domain:resource.clockDomains){checkpoint(cancel);declaration.domains.insert(domain);}
            for(const auto &partition:resource.partitions){checkpoint(cancel);declaration.partitions.insert(partition);}
            indices[ci].emplace(resource.name,std::move(declaration));
            if(seen.insert(resource.name).second)out.rows.push_back({resource.name,{}});
        }
    }
    for(auto &row:out.rows) {
        checkpoint(cancel);const auto ref=indices.front().find(row.name);
        for(size_t ci=0;ci<indices.size();++ci) {
            checkpoint(cancel);MemoryResourceUsageComparisonCell cell;
            const auto current=indices[ci].find(row.name);
            if(current!=indices[ci].end()) {
                cell.resource=current->second.resource;
                if(ref==indices.front().end())cell.status=MemoryResourceComparisonStatus::ReferenceMissing;
                else if(current->second.domains!=ref->second.domains)cell.status=MemoryResourceComparisonStatus::DomainMismatch;
                else if(current->second.partitions!=ref->second.partitions)cell.status=MemoryResourceComparisonStatus::PartitionMismatch;
                else if(!out.configurations[ci].complete||!out.configurations.front().complete)cell.status=MemoryResourceComparisonStatus::Partial;
                else {
                    cell.status=MemoryResourceComparisonStatus::Compared;
                    const auto &a=out.configurations.front().rows[ref->second.resource];
                    const auto &b=out.configurations[ci].rows[*cell.resource];
                    // Original usage bounds (duration <= 2^53-1, power <= 10^12)
                    // permit signed subtraction without overflow or saturation.
                    cell.delta=MemoryResourceUsageDelta{int64_t(b.occupiedPicoseconds)-int64_t(a.occupiedPicoseconds),int64_t(b.peakControllers)-int64_t(a.peakControllers),int64_t(b.peakPowerMicrowatts)-int64_t(a.peakPowerMicrowatts),{}};
                    if(a.peakUnits||b.peakUnits)cell.delta->peakUnits=int64_t(b.peakUnits.value_or(b.peakControllers))-int64_t(a.peakUnits.value_or(a.peakControllers));
                }
            }
            row.cells.push_back(std::move(cell));
        }
    }
}
hier::Result<MemoryResourceUsageComparison> execute(hier::Design &design,const MemoryResourceUsageComparisonRequest &r,hier::Cancel cancel,std::optional<Time> end)try {
    detail::validateMemoryResourceUsageComparisonRequest(r,cancel);
    auto source=compareMemoryTestConfigurations(design,r.tests,cancel);if(!source)return source.error();
    MemoryResourceUsageComparison out;out.source=std::move(source.value());
    for(const auto &configuration:out.source.configurations) {
        checkpoint(cancel);
        auto usage=detail::deriveMemoryResourceUsage(configuration.report,r.limits,cancel,end);
        out.complete=out.complete&&usage.complete;out.configurations.push_back(std::move(usage));
    }
    align(out,cancel);checkpoint(cancel);return out;
}catch(const hier::Error &e){return e;}
}
void detail::validateMemoryResourceUsageComparisonRequest(const MemoryResourceUsageComparisonRequest &r,hier::Cancel cancel) {
    checkpoint(cancel);validateMemoryTestComparisonRequest(r.tests,cancel);validateMemoryResourceUsageLimits(r.limits);checkpoint(cancel);
}
hier::Result<MemoryResourceUsageComparison> compareMemoryResourceUsage(hier::Design &design,const MemoryResourceUsageComparisonRequest &r,hier::Cancel cancel){return execute(design,r,cancel,{});}
hier::Result<MemoryResourceUsageComparison> detail::compareMemoryResourceUsageWithDeadline(hier::Design &design,const MemoryResourceUsageComparisonRequest &r,Time end,hier::Cancel cancel){return execute(design,r,cancel,end);}
}
