#include "MemoryTestTimingInternal.h"
#include "MemoryTestScheduleInternal.h"
#include "MemoryScheduleResourcesInternal.h"
#include "MemoryScheduleDependenciesInternal.h"
#include "../common/Utf8.h"
#include <algorithm>
#include <limits>
#include <map>
#include <set>
#include <queue>
#include <tuple>
namespace dft::memory {
namespace {
using Time=std::chrono::steady_clock::time_point;
void checkpoint(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory test timing cancelled"};}
void require(bool ok,const char *message){if(!ok)throw hier::Error{hier::ErrorCode::BadRequest,message};}
const MemoryTestReport &plan(const MemoryTestScheduleReport &s) {
    const auto *plain=std::get_if<MemoryTestReport>(&s.source);
    return plain?*plain:std::get<MemoryTestRulePlan>(s.source).report;
}
// Shared declaration index: insertion rejects ambiguity; lookup prefers an exact
// partition over the domain fallback. No controller/declaration cross product.
struct ClockDomain {
    std::optional<size_t> fallback;
    std::map<std::string,size_t> partitions;
};
struct ClockIndex {
    std::map<std::string,ClockDomain> domains;
    std::optional<size_t> find(const std::string &domain,const std::string &partition) const {
        const auto d=domains.find(domain);if(d==domains.end())return {};
        const auto p=d->second.partitions.find(partition);
        return p==d->second.partitions.end()?d->second.fallback:std::optional(p->second);
    }
};
template<class Check> bool indexClocks(const std::vector<MemoryTestClock> &clocks,ClockIndex &out,Check check) {
    require(clocks.size()<=10000,"Too many memory test clocks");
    ClockIndex candidate;size_t bytes=0,partitions=0;
    for(size_t i=0;i<clocks.size();++i) {
        if(!check())return false;
        const auto &clock=clocks[i];const auto &name=clock.clockDomain;
        require(!name.empty()&&name.size()<=4096&&name.find('\0')==std::string::npos&&dft::detail::validUtf8(name),"Invalid memory test clock domain");
        bytes+=name.size();require(bytes<=16777216,"Memory test clock names exceed 16 MiB");
        require(clock.partitions.size()<=1024,"Too many partitions in memory test clock");
        partitions+=clock.partitions.size();require(partitions<=4096,"Too many memory test clock partitions");
        auto &domain=candidate.domains[name];
        if(clock.partitions.empty()) {
            require(!domain.fallback,"Duplicate memory test clock domain");domain.fallback=i;
        }
        require(clock.periodPicoseconds&&clock.periodPicoseconds<=1000000000000ULL,"Invalid memory test clock period");
        for(const auto &partition:clock.partitions) {
            if(!check())return false;
            require(partition.size()<=4096&&partition.find('\0')==std::string::npos&&dft::detail::validUtf8(partition),"Invalid memory test clock partition");
            bytes+=partition.size();require(bytes<=16777216,"Memory test clock names exceed 16 MiB");
            require(domain.partitions.emplace(partition,i).second,"Overlapping memory test clock partitions");
        }
    }
    out=std::move(candidate);return true;
}
class Timer {
    const MemoryTestScheduleReport &source_;
    MemoryTestTimeline out_;
    hier::Cancel cancel_;
    Time deadline_;
    ClockIndex clocks_;
    std::vector<bool> used_;
    detail::MemoryResourceIndex resources_;
    std::vector<std::optional<uint64_t>> resourceEnds_;
    detail::MemoryDependencyIndex dependencies_;
    std::vector<uint64_t> dependencyEnds_;
    bool initialized_=false;
    void partial(const std::string &reason){out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),reason)==out_.reasons.end())out_.reasons.push_back(reason);}
    bool stop(const std::string &reason,std::optional<size_t> entry={}) {
        partial(reason);out_.stop=MemoryTimingStop{out_.waves.size(),entry,reason};return false;
    }
    bool time(std::optional<size_t> entry={}) {
        checkpoint(cancel_);return std::chrono::steady_clock::now()<deadline_||stop("budget_time",entry);
    }
    bool work(std::optional<size_t> entry={}) {
        if(!time(entry))return false;
        if(out_.work>=out_.request.limits.maxWork)return stop("budget_work",entry);
        ++out_.work;return true;
    }
    bool avoidUnavailable(MemoryTimedWave &candidate,const std::set<size_t> &resources) {
        using Item=std::tuple<uint64_t,size_t,size_t>; // start, resource, interval
        std::priority_queue<Item,std::vector<Item>,std::greater<Item>> intervals;
        for(auto ri:resources) {
            if(!time())return false;
            intervals.emplace(source_.schedule.request.resources[ri].unavailableIntervals[0].startPicoseconds,ri,0);
        }
        const auto baseline=candidate.startPicoseconds;
        MemoryAvailabilityWait wait;
        for(;;) {
            if(!time())return false;
            if(candidate.startPicoseconds>std::numeric_limits<uint64_t>::max()-candidate.durationPicoseconds)return stop("duration_overflow");
            candidate.endPicoseconds=candidate.startPicoseconds+candidate.durationPicoseconds;
            if(intervals.empty()||std::get<0>(intervals.top())>=candidate.endPicoseconds)break;
            if(!work())return false;
            const auto [start,ri,ii]=intervals.top();intervals.pop();
            (void)start;
            const auto &list=source_.schedule.request.resources[ri].unavailableIntervals;
            if(list[ii].endPicoseconds>candidate.startPicoseconds) {
                candidate.startPicoseconds=list[ii].endPicoseconds;
                wait.intervals.push_back({ri,ii});
            }
            if(ii+1<list.size())intervals.emplace(list[ii+1].startPicoseconds,ri,ii+1);
        }
        if(candidate.startPicoseconds>baseline) {
            wait.durationPicoseconds=candidate.startPicoseconds-baseline;candidate.availabilityWait=std::move(wait);
        }
        return true;
    }
    bool wave(const MemoryTestWave &input) {
        if(!time())return false;
        MemoryTimedWave candidate;candidate.startPicoseconds=out_.durationPicoseconds;
        uint64_t longest=0,instances=0,bits=0;
        std::set<size_t> usedResources,waitingResources,availabilityResources;
        std::map<size_t,uint64_t> dependencyReady;
        std::set<size_t> usedDependencies;
        const auto &p=plan(source_);
        for(size_t ei=0;ei<input.entries.size();++ei) {
            if(!work(ei))return false;
            const auto &entry=input.entries[ei];const auto &ctrl=p.plan.controllers[entry.controller];const auto &step=ctrl.steps[entry.step];
            auto found=clocks_.find(ctrl.clockDomain,ctrl.partition);if(!found)return stop("clock_missing",ei);
            const auto clock=*found;const auto period=out_.request.clocks[clock].periodPicoseconds;
            if(step.cycles>std::numeric_limits<uint64_t>::max()/period)return stop("duration_overflow",ei);
            const auto duration=step.cycles*period;candidate.entries.push_back({clock,duration});longest=std::max(longest,duration);
            const auto &model=p.investigation.mapping.request.models[ctrl.model];instances+=step.memories.size();bits+=uint64_t(step.memories.size())*model.words*model.dataBits;
            const auto resources=resources_.domains.find(ctrl.clockDomain);
            if(resources!=resources_.domains.end())for(const auto &binding:resources->second) {
                if(!time(ei))return false;
                const auto ri=binding.resource;
                if(!source_.schedule.request.resources[ri].recoveryPicoseconds||!resources_.matches(ri,ctrl.partition))continue;
                if(!usedResources.insert(ri).second)continue;
                if(!work(ei))return false;
                if(!resourceEnds_[ri])continue; // First use has no recovery delay.
                const auto recovery=source_.schedule.request.resources[ri].recoveryPicoseconds;
                if(*resourceEnds_[ri]>std::numeric_limits<uint64_t>::max()-recovery)return stop("duration_overflow",ei);
                const auto ready=*resourceEnds_[ri]+recovery;
                if(ready>out_.durationPicoseconds)waitingResources.insert(ri);
                candidate.startPicoseconds=std::max(candidate.startPicoseconds,ready);
            }
            const auto dependencies=dependencies_.afterDomains.find(ctrl.clockDomain);
            if(dependencies!=dependencies_.afterDomains.end())for(auto di:dependencies->second) {
                if(!time(ei))return false;
                if(!dependencies_.matchesAfter(di,ctrl.partition)||dependencyReady.contains(di))continue;
                if(!work(ei))return false;
                const auto &edge=source_.schedule.request.dependencies[di];
                const auto end=dependencyEnds_[di];
                if(end>std::numeric_limits<uint64_t>::max()-edge.minimumGapPicoseconds)return stop("duration_overflow",ei);
                dependencyReady.emplace(di,end+edge.minimumGapPicoseconds);
            }
            const auto before=dependencies_.beforeDomains.find(ctrl.clockDomain);
            if(before!=dependencies_.beforeDomains.end())for(auto di:before->second) {
                if(!time(ei))return false;
                if(dependencies_.matchesBefore(di,ctrl.partition))usedDependencies.insert(di);
            }
            if(resources!=resources_.domains.end())for(const auto &binding:resources->second) {
                if(!time(ei))return false;
                const auto ri=binding.resource;
                if(source_.schedule.request.resources[ri].unavailableIntervals.empty()||!resources_.matches(ri,ctrl.partition))continue;
                if(availabilityResources.insert(ri).second&&!work(ei))return false;
            }
        }
        const auto resourceStart=candidate.startPicoseconds;
        std::vector<size_t> waitingDependencies;
        for(const auto &[di,ready]:dependencyReady) {
            if(!time())return false;
            if(ready>resourceStart)waitingDependencies.push_back(di);
            candidate.startPicoseconds=std::max(candidate.startPicoseconds,ready);
        }
        const auto dependencyStart=candidate.startPicoseconds;
        const auto overhead=out_.request.policy.waveOverheadPicoseconds;
        if(longest>std::numeric_limits<uint64_t>::max()-overhead)return stop("duration_overflow");
        candidate.durationPicoseconds=longest+overhead;
        if(!avoidUnavailable(candidate,availabilityResources))return false;
        if(candidate.endPicoseconds>out_.request.policy.maxDurationPicoseconds)return stop("duration_limit");
        const auto wait=resourceStart-out_.durationPicoseconds;
        const auto dependencyWait=dependencyStart-resourceStart;
        if(wait)candidate.resourceWait=MemoryResourceWait{wait,{waitingResources.begin(),waitingResources.end()}};
        if(dependencyWait)candidate.dependencyWait=MemoryDependencyWait{dependencyWait,std::move(waitingDependencies)};
        if(!time())return false;
        // No partial wave may publish waits or advance resource recovery state.
        for(auto ri:usedResources)resourceEnds_[ri]=candidate.endPicoseconds;
        // The original scheduler guarantees all prerequisite steps precede the
        // dependent wave; its published prefix is the only timing authority.
        for(auto di:usedDependencies)dependencyEnds_[di]=candidate.endPicoseconds;
        for(const auto &entry:candidate.entries)used_[entry.clock]=true;
        if(candidate.availabilityWait)out_.availabilityWaitPicoseconds+=candidate.availabilityWait->durationPicoseconds;
        out_.dependencyWaitPicoseconds+=dependencyWait;
        out_.resourceWaitPicoseconds+=wait; // Bounded by the checked final end.
        out_.durationPicoseconds=candidate.endPicoseconds;out_.timedSteps+=candidate.entries.size();out_.timedInstances+=instances;out_.timedCapacityBits+=bits;
        out_.waves.push_back(std::move(candidate));return true;
    }
public:
    Timer(const MemoryTestScheduleReport &s,const MemoryTestTiming &r,std::optional<Time> end,hier::Cancel c):source_(s),cancel_(c),deadline_(end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(r.limits.maxMillis)))),used_(r.clocks.size(),false),resourceEnds_(s.schedule.request.resources.size()) {
        out_.request=r;if(!s.schedule.complete)partial("schedule_partial");
        if(!indexClocks(r.clocks,clocks_,[&](){return time();}))return;
        if(!detail::indexMemoryScheduleResources(s.schedule.request.resources,resources_,[&](){return time();}))return;
        if(!detail::indexMemoryScheduleDependencies(s.schedule.request.dependencies,dependencies_,[&](){return time();},true))return;
        dependencyEnds_.resize(s.schedule.request.dependencies.size(),0);
        initialized_=true;
    }
    MemoryTestTimeline run() {
        if(initialized_)for(const auto &input:source_.schedule.waves)if(!wave(input))break;
        for(size_t i=0;i<used_.size();++i){checkpoint(cancel_);if(!used_[i])out_.unusedClocks.push_back(i);}
        checkpoint(cancel_);return std::move(out_);
    }
};
hier::Result<MemoryTestTimingReport> execute(hier::Design &design,const MemoryTestTimingRequest &r,std::optional<Time> end,hier::Cancel c)try {
    checkpoint(c);detail::validateMemoryTestTimingRequest(r,c);checkpoint(c);
    auto source=scheduleMemoryTests(design,r.schedule,c);if(!source)return source.error();
    MemoryTestTimingReport out;out.source=std::move(source.value());checkpoint(c);out.timeline=detail::timeScheduledMemories(out.source,r.timing,c,end);checkpoint(c);return out;
}catch(const hier::Error &e){return e;}
}
MemoryTestTimeline detail::timeScheduledMemories(const MemoryTestScheduleReport &source,const MemoryTestTiming &r,hier::Cancel c,std::optional<Time> end){return Timer(source,r,end,c).run();}
void detail::validateMemoryTestTimingRequest(const MemoryTestTimingRequest &r,hier::Cancel c) {
    checkpoint(c);validateMemoryTestScheduleRequest(r.schedule);const auto &t=r.timing;
    ClockIndex clocks;indexClocks(t.clocks,clocks,[&](){checkpoint(c);return true;});
    require(t.policy.waveOverheadPicoseconds<=1000000000000ULL&&t.policy.maxDurationPicoseconds&&t.policy.maxDurationPicoseconds<=9007199254740991ULL,"Invalid memory timing policy");
    require(t.limits.maxWork&&t.limits.maxWork<=10000000&&t.limits.maxMillis&&t.limits.maxMillis<=60000,"Invalid memory timing limits");
}
hier::Result<MemoryTestTimingReport> timeMemoryTests(hier::Design &d,const MemoryTestTimingRequest &r,hier::Cancel c){return execute(d,r,{},c);}
hier::Result<MemoryTestTimingReport> detail::timeMemoryTestsWithDeadline(hier::Design &d,const MemoryTestTimingRequest &r,Time end,hier::Cancel c){return execute(d,r,end,c);}
}
