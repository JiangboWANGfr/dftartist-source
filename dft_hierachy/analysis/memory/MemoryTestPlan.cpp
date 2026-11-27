#include "MemoryTestPlanInternal.h"
#include "MemoryInvestigationInternal.h"
#include "../common/Utf8.h"
#include <algorithm>
#include <map>
#include <set>
#include <tuple>
namespace dft::memory {
namespace {
using Time=std::chrono::steady_clock::time_point;
void checkpoint(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory test planning cancelled"};}
void require(bool ok,const char *message){if(!ok)throw hier::Error{hier::ErrorCode::BadRequest,message};}
class Planner {
    const MemoryInvestigation &input_;
    MemoryTestPlan out_;
    hier::Cancel cancel_;
    Time deadline_;
    std::map<std::string,size_t> profiles_,assignments_;
    using Key=std::tuple<size_t,std::string,std::string>;
    struct Active {size_t controller=0;uint64_t count=0;};
    std::map<Key,Active> active_;
    std::vector<bool> used_;
    void partial(const std::string &reason){out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),reason)==out_.reasons.end())out_.reasons.push_back(reason);}
    bool time(){checkpoint(cancel_);if(std::chrono::steady_clock::now()>=deadline_){partial("budget_time");return false;}return true;}
    bool row(size_t index) {
        const auto &mapped=input_.mapping.memories[index];
        const auto &macro=input_.interfaces.macros[mapped.macro];
        const auto &inst=input_.interfaces.catalog.instances[macro.instance].info;
        PlannedMemory row;row.memory=index;row.status="blocked";
        if(auto a=assignments_.find(inst.pathText);a!=assignments_.end())row.assignment=a->second;
        if(mapped.status!="matched")row.reason="interface_unmatched";
        else if(!row.assignment)row.reason="domain_missing";
        else if(out_.request.profiles[profiles_.at(inst.defName)].powerMicrowatts>out_.request.policy.maxPowerMicrowatts)row.reason="power_exceeded";
        if(!row.reason.empty()) {
            if(!time())return false;
            partial(row.reason);if(row.assignment)used_[*row.assignment]=true;
            out_.memories.push_back(std::move(row));return true;
        }
        const size_t model=*mapped.model,profile=profiles_.at(inst.defName);
        const auto &assignment=out_.request.assignments[*row.assignment];
        const auto &cost=out_.request.profiles[profile];const auto &geometry=input_.mapping.request.models[model];
        const auto &policy=out_.request.policy;Key key{model,assignment.clockDomain,assignment.partition};
        auto active=active_.find(key);
        const bool newController=active==active_.end()||active->second.count>=policy.maxMemoriesPerController;
        if(newController&&out_.controllers.size()>=out_.request.limits.maxControllers){partial("budget_controllers");return false;}
        const size_t ci=newController?out_.controllers.size():active->second.controller;
        std::vector<std::string> reasons;
        bool newStep=newController;
        if(newController)reasons={"initial"};
        else {
            const auto &step=out_.controllers[ci].steps.back();
            if(step.memories.size()>=policy.maxParallelMemories)reasons.push_back("parallel_limit");
            if(cost.powerMicrowatts>policy.maxPowerMicrowatts-step.powerMicrowatts)reasons.push_back("power_limit");
            newStep=!reasons.empty();
        }
        // All budget/cancellation checks precede publication of this complete row.
        if(!time())return false;
        if(newController) {
            MemoryTestController ctrl;ctrl.model=model;ctrl.profile=profile;
            ctrl.clockDomain=assignment.clockDomain;ctrl.partition=assignment.partition;
            ctrl.reason=active==active_.end()?"compatibility_group":"controller_capacity";
            out_.controllers.push_back(std::move(ctrl));active=active_.insert_or_assign(std::move(key),Active{ci,0}).first;
        }
        auto &ctrl=out_.controllers[ci];
        if(newStep) {
            MemoryTestStep step;step.cycles=geometry.words*cost.operationsPerWord;step.reasons=std::move(reasons);
            ctrl.cycles+=step.cycles;ctrl.steps.push_back(std::move(step));
        }
        auto &step=ctrl.steps.back();step.memories.push_back(out_.memories.size());step.powerMicrowatts+=cost.powerMicrowatts;
        ctrl.peakPowerMicrowatts=std::max(ctrl.peakPowerMicrowatts,step.powerMicrowatts);
        ++active->second.count;row.controller=ci;row.step=ctrl.steps.size()-1;row.status="scheduled";
        used_[*row.assignment]=true;++out_.scheduledInstances;out_.scheduledCapacityBits+=geometry.words*geometry.dataBits;
        out_.memories.push_back(std::move(row));return true;
    }
public:
    Planner(const MemoryInvestigation &input,const MemoryTestPlanning &r,std::optional<Time> end,hier::Cancel c):input_(input),cancel_(c),deadline_(end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(r.limits.maxMillis)))),used_(r.assignments.size(),false) {
        out_.request=r;if(!input.mapping.complete)partial("mapping_partial");
        for(size_t i=0;i<r.profiles.size();++i){checkpoint(c);profiles_.emplace(r.profiles[i].definitionName,i);}
        for(size_t i=0;i<r.assignments.size();++i){checkpoint(c);assignments_.emplace(r.assignments[i].instancePath,i);}
    }
    MemoryTestPlan run() {
        for(size_t i=0;i<input_.mapping.memories.size();++i) {
            if(!time())break;
            if(out_.work>=out_.request.limits.maxWork){partial("budget_work");break;}
            ++out_.work;++out_.visitedMemories;if(!row(i))break;
        }
        for(size_t i=0;i<used_.size();++i){checkpoint(cancel_);if(!used_[i])out_.unusedAssignments.push_back(i);}
        if(!out_.unusedAssignments.empty())partial("unused_assignments");
        (void)time();return std::move(out_);
    }
};
hier::Result<MemoryTestReport> execute(hier::Design &design,const MemoryTestRequest &r,std::optional<Time> end,hier::Cancel c)try {
    checkpoint(c);detail::validateMemoryTestRequest(r);checkpoint(c);
    auto input=investigateMemories(design,r.investigation,c);if(!input)return input.error();
    checkpoint(c);MemoryTestReport out;out.investigation=std::move(input.value());
    out.plan=Planner(out.investigation,r.planning,end,c).run();checkpoint(c);return out;
}catch(const hier::Error &e){return e;}
}
void detail::validateMemoryTestRequest(const MemoryTestRequest &r) {
    (void)prepareMemoryInvestigation(r.investigation);
    validateMemoryTestPlanning(r.investigation.mapping.models,r.planning);
}
void detail::validateMemoryTestPlanning(const std::vector<MemoryModel> &models,const MemoryTestPlanning &p) {
    std::set<std::string> definitions,profiles,paths;
    for(const auto &m:models)definitions.insert(m.definitionName);
    require(p.profiles.size()==definitions.size(),"Provide one test profile for every model");
    require(p.assignments.size()<=10000,"Too many test assignments");uint64_t bytes=0;
    auto name=[&](const std::string &s,bool empty=false){
        require((empty||!s.empty())&&s.size()<=4096&&s.find('\0')==std::string::npos&&dft::detail::validUtf8(s),"Invalid test planning name");
        bytes+=s.size();require(bytes<=16777216,"Test planning strings exceed 16 MiB");
    };
    for(const auto &v:p.profiles){name(v.definitionName);require(definitions.contains(v.definitionName)&&profiles.insert(v.definitionName).second,"Unknown or duplicate test profile");require(v.operationsPerWord&&v.operationsPerWord<=1024&&v.powerMicrowatts&&v.powerMicrowatts<=1000000000000ULL,"Invalid test profile cost");}
    for(const auto &v:p.assignments){name(v.instancePath);name(v.clockDomain);name(v.partition,true);require(paths.insert(v.instancePath).second,"Duplicate test instance assignment");}
    const auto &policy=p.policy;require(policy.maxMemoriesPerController&&policy.maxMemoriesPerController<=1024&&policy.maxParallelMemories&&policy.maxParallelMemories<=1024&&policy.maxPowerMicrowatts&&policy.maxPowerMicrowatts<=1000000000000ULL,"Invalid test planning policy");
    const auto &l=p.limits;require(l.maxControllers&&l.maxControllers<=10000&&l.maxWork&&l.maxWork<=10000000&&l.maxMillis&&l.maxMillis<=60000,"Invalid test planning limits");
}
MemoryTestPlan detail::planInvestigatedMemories(const MemoryInvestigation &input,const MemoryTestPlanning &p,hier::Cancel c) {
    checkpoint(c);validateMemoryTestPlanning(input.mapping.request.models,p);
    auto result=Planner(input,p,{},c).run();checkpoint(c);return result;
}
hier::Result<MemoryTestReport> planMemoryTests(hier::Design &d,const MemoryTestRequest &r,hier::Cancel c){return execute(d,r,{},c);}
hier::Result<MemoryTestReport> detail::planMemoryTestsWithDeadline(hier::Design &d,const MemoryTestRequest &r,Time end,hier::Cancel c){return execute(d,r,end,c);}
}
