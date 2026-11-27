#include "MemoryResourceUsageInternal.h"
#include "MemoryTestTimingInternal.h"
#include "MemoryScheduleResourcesInternal.h"
#include <algorithm>
#include <map>
namespace dft::memory {
namespace {
using Time=std::chrono::steady_clock::time_point;
void checkpoint(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory resource usage cancelled"};}
class Analyzer {
    const MemoryTestTimingReport &source_;
    MemoryResourceUsage out_;
    hier::Cancel cancel_;
    Time deadline_;
    detail::MemoryResourceIndex resources_;
    bool initialized_=false;
    bool stop(const char *reason,std::optional<size_t> entry={}) {
        out_.complete=false;out_.reasons.push_back(reason);out_.stop=MemoryResourceUsageStop{size_t(out_.processedWaves),entry,reason};return false;
    }
    bool time(std::optional<size_t> entry={}){checkpoint(cancel_);return std::chrono::steady_clock::now()<deadline_||stop("budget_time",entry);}
    bool work(size_t entry) {
        if(!time(entry))return false;
        if(out_.work>=out_.limits.maxWork)return stop("budget_work",entry);
        ++out_.work;return true;
    }
    bool wave(size_t wi) {
        if(!time())return false;
        struct Candidate { std::vector<size_t> entries; uint64_t power=0, units=0; };
        std::map<size_t,Candidate> pending;
        const auto &schedule=source_.source;
        const auto *plain=std::get_if<MemoryTestReport>(&schedule.source);
        const auto &plan=(plain?*plain:std::get<MemoryTestRulePlan>(schedule.source).report).plan;
        const auto &entries=schedule.schedule.waves[wi].entries;
        for(size_t ei=0;ei<entries.size();++ei) {
            if(!work(ei))return false;
            const auto &entry=entries[ei];const auto &controller=plan.controllers[entry.controller];
            const auto found=resources_.domains.find(controller.clockDomain);if(found==resources_.domains.end())continue;
            for(const auto &binding:found->second) {
                const auto ri=binding.resource;
                if(!time(ei))return false;
                if(!resources_.matches(ri,controller.partition))continue;
                if(!work(ei))return false;
                if(!pending.contains(ri)&&out_.uses+pending.size()>=out_.limits.maxUses)return stop("budget_uses",ei);
                auto &use=pending[ri];use.entries.push_back(ei);use.power+=controller.steps[entry.step].powerMicrowatts;use.units+=binding.units;
            }
        }
        if(!time())return false;
        // All counts are bounded by the original scheduler/timer. Publish one
        // entire wave: no partial resource memberships or inflated summaries.
        for(auto &[ri,use]:pending) {
            auto &row=out_.rows[ri];row.occupiedPicoseconds+=source_.timeline.waves[wi].durationPicoseconds;
            row.peakControllers=std::max(row.peakControllers,uint64_t(use.entries.size()));row.peakPowerMicrowatts=std::max(row.peakPowerMicrowatts,use.power);
            if(row.peakUnits)row.peakUnits=std::max(*row.peakUnits,use.units);
            row.uses.push_back({wi,std::move(use.entries)});
        }
        out_.uses+=pending.size();++out_.processedWaves;return true;
    }
public:
    Analyzer(const MemoryTestTimingReport &source,const MemoryResourceUsageLimits &limits,hier::Cancel cancel,std::optional<Time> end):source_(source),cancel_(cancel),deadline_(end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(limits.maxMillis)))) {
        out_.limits=limits;if(!source.timeline.complete){out_.complete=false;out_.reasons.push_back("timing_partial");}
        const auto &rs=source.source.schedule.request.resources;
        for(size_t ri=0;ri<rs.size();++ri){checkpoint(cancel);MemoryResourceUsageRow row;row.resource=ri;if(rs[ri].maxUnits||!rs[ri].domainUnits.empty())row.peakUnits=0;out_.rows.push_back(std::move(row));}
        if(!time())return;
        if(!detail::indexMemoryScheduleResources(rs,resources_,[&](){return time();}))return;
        initialized_=true;
    }
    MemoryResourceUsage run(){if(initialized_)for(size_t wi=0;wi<source_.timeline.waves.size();++wi)if(!wave(wi))break;checkpoint(cancel_);return std::move(out_);}
};
hier::Result<MemoryResourceUsageReport> execute(hier::Design &design,const MemoryResourceUsageRequest &request,hier::Cancel cancel,std::optional<Time> end)try {
    checkpoint(cancel);detail::validateMemoryResourceUsageRequest(request,cancel);checkpoint(cancel);
    auto source=timeMemoryTests(design,request.test,cancel);if(!source)return source.error();
    MemoryResourceUsageReport out;out.source=std::move(source.value());out.usage=detail::deriveMemoryResourceUsage(out.source,request.limits,cancel,end);checkpoint(cancel);return out;
}catch(const hier::Error &e){return e;}
}
void detail::validateMemoryResourceUsageRequest(const MemoryResourceUsageRequest &request,hier::Cancel cancel) {
    validateMemoryTestTimingRequest(request.test,cancel);validateMemoryResourceUsageLimits(request.limits);
}
void detail::validateMemoryResourceUsageLimits(const MemoryResourceUsageLimits &l) {
    if(!l.maxWork||l.maxWork>10000000||!l.maxUses||l.maxUses>1000000||!l.maxMillis||l.maxMillis>60000)throw hier::Error{hier::ErrorCode::BadRequest,"Invalid memory resource usage limits"};
}
MemoryResourceUsage detail::deriveMemoryResourceUsage(const MemoryTestTimingReport &source,const MemoryResourceUsageLimits &limits,hier::Cancel cancel,std::optional<Time> end){return Analyzer(source,limits,cancel,end).run();}
hier::Result<MemoryResourceUsageReport> inspectMemoryResourceUsage(hier::Design &design,const MemoryResourceUsageRequest &request,hier::Cancel cancel){return execute(design,request,cancel,{});}
hier::Result<MemoryResourceUsageReport> detail::inspectMemoryResourceUsageWithDeadline(hier::Design &design,const MemoryResourceUsageRequest &request,Time end,hier::Cancel cancel){return execute(design,request,cancel,end);}
}
