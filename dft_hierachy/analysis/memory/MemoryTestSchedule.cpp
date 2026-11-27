#include "MemoryTestScheduleInternal.h"
#include "MemoryTestRulesInternal.h"
#include "MemoryTestPlanInternal.h"
#include "MemoryScheduleResourcesInternal.h"
#include "MemoryScheduleDependenciesInternal.h"
#include <algorithm>
#include <map>
#include <set>
namespace dft::memory {
namespace {
using Time=std::chrono::steady_clock::time_point;
void checkpoint(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory test scheduling cancelled"};}
class Scheduler {
    const MemoryTestReport &source_;
    MemoryTestSchedule out_;
    hier::Cancel cancel_;
    Time deadline_;
    std::set<size_t> active_;
    detail::MemoryResourceIndex resourcesByDomain_;
    detail::MemoryDependencyIndex dependencies_;
    struct Before {size_t total=0,remaining=0,blocked=0;};
    std::vector<Before> before_;
    bool initialized_=false;
    void partial(const std::string &reason){out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),reason)==out_.reasons.end())out_.reasons.push_back(reason);}
    bool time(){checkpoint(cancel_);if(std::chrono::steady_clock::now()>=deadline_){partial("budget_time");return false;}return true;}
    bool work(){if(!time())return false;if(out_.work>=out_.request.limits.maxWork){partial("budget_work");return false;}++out_.work;return true;}
    template<class Visit> bool eachBefore(size_t ci,Visit visit) {
        const auto &ctrl=source_.plan.controllers[ci];const auto found=dependencies_.beforeDomains.find(ctrl.clockDomain);
        if(found!=dependencies_.beforeDomains.end())for(auto di:found->second) {
            if(!time())return false;
            if(dependencies_.matchesBefore(di,ctrl.partition))visit(di);
        }
        return true;
    }
    bool wave() {
        MemoryTestWave candidate;
        struct Blocked {size_t controller;std::string reason;std::optional<size_t> dependency,resource;};
        std::vector<Blocked> blocked;
        std::vector<uint64_t> occupied(out_.request.resources.size(),0);
        std::vector<uint64_t> resourcePower(out_.request.resources.size(),0);
        std::vector<uint64_t> resourceUnits(out_.request.resources.size(),0);
        for(const auto ci:active_) {
            if(candidate.entries.size()>=out_.request.policy.maxParallelControllers)break;
            if(!work())return false;
            bool ready=true;
            const auto &ctrl=source_.plan.controllers[ci];const auto prerequisites=dependencies_.afterDomains.find(ctrl.clockDomain);
            if(prerequisites!=dependencies_.afterDomains.end())for(auto di:prerequisites->second) {
                if(!time())return false;
                if(!dependencies_.matchesAfter(di,ctrl.partition))continue;
                if(!work())return false;
                const auto &before=before_[di];
                if(!before.total||before.blocked) {
                    blocked.push_back({ci,!before.total?"dependency_unavailable":"dependency_blocked",di,{}});ready=false;break;
                }
                if(before.remaining)ready=false;
            }
            if(!ready)continue;
            const auto si=out_.controllers[ci].nextStep;
            const auto &step=source_.plan.controllers[ci].steps[si];
            if(step.powerMicrowatts>out_.request.policy.maxPowerMicrowatts)blocked.push_back({ci,"step_power_exceeded",{}, {}});
            else if(step.powerMicrowatts<=out_.request.policy.maxPowerMicrowatts-candidate.powerMicrowatts) {
                const auto found=resourcesByDomain_.domains.find(source_.plan.controllers[ci].clockDomain);
                bool available=true;
                if(found!=resourcesByDomain_.domains.end())for(const auto &binding:found->second) {
                    const auto ri=binding.resource;
                    if(!time())return false;
                    if(!resourcesByDomain_.matches(ri,source_.plan.controllers[ci].partition))continue;
                    if(!work())return false;
                    const auto &resource=out_.request.resources[ri];const auto ceiling=resource.maxPowerMicrowatts;
                    if(ceiling&&step.powerMicrowatts>ceiling) {
                        blocked.push_back({ci,"resource_power_exceeded",{},ri});available=false;break;
                    }
                    if(resource.maxUnits&&binding.units>resource.maxUnits) {
                        blocked.push_back({ci,"resource_units_exceeded",{},ri});available=false;break;
                    }
                    if(occupied[ri]>=resource.maxParallelControllers||(ceiling&&step.powerMicrowatts>ceiling-resourcePower[ri])||(resource.maxUnits&&binding.units>resource.maxUnits-resourceUnits[ri])){available=false;break;}
                }
                if(!available)continue;
                // Reserve nothing until every matching resource admits this step.
                if(found!=resourcesByDomain_.domains.end())for(const auto &binding:found->second) {
                    const auto ri=binding.resource;
                    if(!time())return false;
                    if(!resourcesByDomain_.matches(ri,source_.plan.controllers[ci].partition))continue;
                    ++occupied[ri];
                    if(out_.request.resources[ri].maxUnits)resourceUnits[ri]+=binding.units;
                    if(out_.request.resources[ri].maxPowerMicrowatts)resourcePower[ri]+=step.powerMicrowatts;
                }
                candidate.entries.push_back({ci,si});candidate.powerMicrowatts+=step.powerMicrowatts;
            }
        }
        // Prepare dependency updates with checkpoints, without a controller/edge
        // cross-product cache or mutating state for an uncommitted candidate.
        std::vector<size_t> newlyBlocked(before_.size(),0),newlyComplete(before_.size(),0);
        for(const auto &b:blocked)if(!eachBefore(b.controller,[&](size_t di){++newlyBlocked[di];}))return false;
        for(const auto &entry:candidate.entries) {
            if(out_.controllers[entry.controller].nextStep+1==source_.plan.controllers[entry.controller].steps.size())
                if(!eachBefore(entry.controller,[&](size_t di){++newlyComplete[di];}))return false;
        }
        // Publish the entire batch and its blocking decisions together. A work
        // or time cutoff above cannot advance a controller without a wave.
        if(!time())return false;
        for(const auto &b:blocked) {
            auto &progress=out_.controllers[b.controller];progress.status="blocked";progress.reason=b.reason;progress.dependency=b.dependency;progress.resource=b.resource;
            active_.erase(b.controller);partial(b.reason);
        }
        for(const auto &entry:candidate.entries) {
            const auto &ctrl=source_.plan.controllers[entry.controller];const auto &step=ctrl.steps[entry.step];
            const auto &model=source_.investigation.mapping.request.models[ctrl.model];
            ++out_.scheduledSteps;out_.scheduledInstances+=step.memories.size();out_.scheduledCapacityBits+=uint64_t(step.memories.size())*model.words*model.dataBits;
            auto &progress=out_.controllers[entry.controller];++progress.nextStep;
            if(progress.nextStep==ctrl.steps.size()) {
                progress.status="complete";active_.erase(entry.controller);
            }
        }
        for(size_t di=0;di<before_.size();++di){before_[di].blocked+=newlyBlocked[di];before_[di].remaining-=newlyComplete[di];}
        if(!candidate.entries.empty())out_.waves.push_back(std::move(candidate));
        return true;
    }
public:
    Scheduler(const MemoryTestReport &source,const MemoryTestScheduling &r,std::optional<Time> end,hier::Cancel c):source_(source),cancel_(c),deadline_(end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(r.limits.maxMillis)))) {
        out_.request=r;if(!source.plan.complete)partial("plan_partial");
        out_.controllers.resize(source.plan.controllers.size());
        for(size_t ci=0;ci<out_.controllers.size();++ci){checkpoint(c);if(source.plan.controllers[ci].steps.empty())out_.controllers[ci].status="complete";else active_.insert(ci);}
        // A bounded reverse index avoids scanning all resource declarations per
        // ready controller. No partially initialized index may reach wave().
        if(!detail::indexMemoryScheduleResources(r.resources,resourcesByDomain_,[&](){return time();}))return;
        if(!detail::indexMemoryScheduleDependencies(r.dependencies,dependencies_,[&](){return time();}))return;
        before_.resize(r.dependencies.size());
        if(!r.dependencies.empty()) {
            for(size_t ci=0;ci<source.plan.controllers.size();++ci) {
                if(!time())return;
                if(!eachBefore(ci,[&](size_t di){++before_[di].total;if(out_.controllers[ci].status!="complete")++before_[di].remaining;}))return;
            }
        }
        initialized_=true;
    }
    MemoryTestSchedule run() {
        if(!initialized_)return std::move(out_);
        while(!active_.empty()) {
            if(!time())break;
            if(out_.waves.size()>=out_.request.limits.maxWaves){partial("budget_waves");break;}
            if(!wave())break;
        }
        (void)time();return std::move(out_);
    }
};
hier::Result<MemoryTestScheduleReport> execute(hier::Design &design,const MemoryTestScheduleRequest &r,std::optional<Time> end,hier::Cancel c)try {
    checkpoint(c);detail::validateMemoryTestScheduleRequest(r);checkpoint(c);MemoryTestScheduleReport out;
    if(r.rules){auto source=planMemoryTestsByRules(design,{r.test,*r.rules},c);if(!source)return source.error();out.source=std::move(source.value());}
    else {auto source=planMemoryTests(design,r.test,c);if(!source)return source.error();out.source=std::move(source.value());}
    const auto *plain=std::get_if<MemoryTestReport>(&out.source);
    const auto &source=plain?*plain:std::get<MemoryTestRulePlan>(out.source).report;
    checkpoint(c);out.schedule=detail::schedulePlannedMemories(source,r.scheduling,c,end);checkpoint(c);return out;
}catch(const hier::Error &e){return e;}
}
MemoryTestSchedule detail::schedulePlannedMemories(const MemoryTestReport &source,const MemoryTestScheduling &r,hier::Cancel c,std::optional<Time> end){return Scheduler(source,r,end,c).run();}
void detail::validateMemoryTestScheduleRequest(const MemoryTestScheduleRequest &r) {
    if(r.rules)validateMemoryTestRuleRequest({r.test,*r.rules});else validateMemoryTestRequest(r.test);
    validateMemoryScheduleResources(r.scheduling.resources);
    validateMemoryScheduleDependencies(r.scheduling.dependencies);
    const auto &p=r.scheduling.policy;const auto &l=r.scheduling.limits;
    if(!p.maxParallelControllers||p.maxParallelControllers>1024||!p.maxPowerMicrowatts||p.maxPowerMicrowatts>1000000000000ULL)
        throw hier::Error{hier::ErrorCode::BadRequest,"Invalid memory schedule policy"};
    if(!l.maxWaves||l.maxWaves>10000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw hier::Error{hier::ErrorCode::BadRequest,"Invalid memory schedule limits"};
}
hier::Result<MemoryTestScheduleReport> scheduleMemoryTests(hier::Design &d,const MemoryTestScheduleRequest &r,hier::Cancel c){return execute(d,r,{},c);}
hier::Result<MemoryTestScheduleReport> detail::scheduleMemoryTestsWithDeadline(hier::Design &d,const MemoryTestScheduleRequest &r,Time end,hier::Cancel c){return execute(d,r,end,c);}
}
