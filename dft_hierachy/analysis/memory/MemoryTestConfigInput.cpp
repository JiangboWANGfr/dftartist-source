#include "MemoryTestConfigInput.h"
#include "MemoryTestRulesInputInternal.h"
#include "MemoryTestTimingInternal.h"
#include "MemoryScheduleResourcesInputInternal.h"
#include "MemoryScheduleDependenciesInputInternal.h"
namespace dft::memory {
namespace {
using namespace detail::input;
void checkpoint(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory test config loading cancelled"};}
using Numbers=std::initializer_list<std::pair<std::string_view,uint64_t *>>;
// Only convert exact nonnegative JSON integers here; the existing full request
// validator owns policy/limit ranges and all cross-field/domain relationships.
void numbers(const Object &o,const std::string &where,Numbers destinations) {
    for(const auto &[key,value]:o) {
        uint64_t *destination=nullptr;
        for(const auto &[name,address]:destinations)if(name==key){destination=address;break;}
        if(!destination)bad(where,"unknown field "+key);
        *destination=number(value,where+"."+key,0,9007199254740991ULL);
    }
}
void groups(const Object &o,const std::string &where,Numbers policy,Numbers limits) {
    if(o.contains("policy"))numbers(object(o.at("policy"),where+".policy"),where+".policy",policy);
    if(o.contains("limits"))numbers(object(o.at("limits"),where+".limits"),where+".limits",limits);
}
MemoryTestTimingRequest read(const Object &o,const MemoryInvestigationRequest &investigation,const std::vector<MemoryTestProfile> &profiles,hier::Cancel c) {
    fields(o,"memory test config",{"formatVersion","kind"},{"assignments","rules","planning","scheduling","timing"});
    (void)number(o.at("formatVersion"),"formatVersion",1,1);if(text(o.at("kind"),"kind")!="memory-test-config")bad("kind","expected memory-test-config");
    if(o.contains("assignments")==o.contains("rules"))bad("memory test config","provide exactly one of assignments or rules");
    MemoryTestTimingRequest result;result.schedule.test.investigation=investigation;auto &planning=result.schedule.test.planning;planning.profiles=profiles;
    if(o.contains("rules"))result.schedule.rules=readMemoryTestRules(o.at("rules"),c);
    else {
        const auto &rows=array(o.at("assignments"),"assignments",0,10000);
        for(size_t i=0;i<rows.size();++i){checkpoint(c);const auto w=at("assignments",i);const auto &row=object(rows[i],w);fields(row,w,{"instancePath","clockDomain","partition"});planning.assignments.push_back({text(row.at("instancePath"),w+".instancePath"),text(row.at("clockDomain"),w+".clockDomain"),text(row.at("partition"),w+".partition")});}
    }
    if(o.contains("planning")) {
        const auto &block=object(o.at("planning"),"planning");fields(block,"planning",{},{"policy","limits"});auto &p=planning.policy;auto &l=planning.limits;
        groups(block,"planning",{{"maxMemoriesPerController",&p.maxMemoriesPerController},{"maxParallelMemories",&p.maxParallelMemories},{"maxPowerMicrowatts",&p.maxPowerMicrowatts}},{{"maxControllers",&l.maxControllers},{"maxWork",&l.maxWork},{"maxMillis",&l.maxMillis}});
    }
    if(o.contains("scheduling")) {
        const auto &block=object(o.at("scheduling"),"scheduling");fields(block,"scheduling",{},{"policy","limits","resources","dependencies"});auto &p=result.schedule.scheduling.policy;auto &l=result.schedule.scheduling.limits;
        groups(block,"scheduling",{{"maxParallelControllers",&p.maxParallelControllers},{"maxPowerMicrowatts",&p.maxPowerMicrowatts}},{{"maxWaves",&l.maxWaves},{"maxWork",&l.maxWork},{"maxMillis",&l.maxMillis}});
        if(block.contains("resources"))result.schedule.scheduling.resources=readMemoryScheduleResources(block.at("resources"),c);
        if(block.contains("dependencies"))result.schedule.scheduling.dependencies=readMemoryScheduleDependencies(block.at("dependencies"),c);
    }
    if(o.contains("timing")) {
        const auto &block=object(o.at("timing"),"timing");fields(block,"timing",{"clocks"},{"policy","limits"});auto &t=result.timing;
        const auto &clocks=array(block.at("clocks"),"timing.clocks",0,10000);
        for(size_t i=0;i<clocks.size();++i) {
            checkpoint(c);const auto w=at("timing.clocks",i);const auto &clock=object(clocks[i],w);
            fields(clock,w,{"clockDomain","periodPicoseconds"},{"partitions"});
            MemoryTestClock declaration{text(clock.at("clockDomain"),w+".clockDomain"),number(clock.at("periodPicoseconds"),w+".periodPicoseconds",0,9007199254740991ULL)};
            if(clock.contains("partitions")) {
                const auto &partitions=array(clock.at("partitions"),w+".partitions",0,1024);
                for(size_t j=0;j<partitions.size();++j){checkpoint(c);declaration.partitions.push_back(text(partitions[j],at(w+".partitions",j)));}
            }
            t.clocks.push_back(std::move(declaration));
        }
        groups(block,"timing",{{"waveOverheadPicoseconds",&t.policy.waveOverheadPicoseconds},{"maxDurationPicoseconds",&t.policy.maxDurationPicoseconds}},{{"maxWork",&t.limits.maxWork},{"maxMillis",&t.limits.maxMillis}});
    }
    checkpoint(c);detail::validateMemoryTestTimingRequest(result,c);checkpoint(c);return result;
}
}
hier::Result<MemoryTestTimingRequest> parseMemoryTestConfig(std::string_view input,const MemoryInvestigationRequest &i,const std::vector<MemoryTestProfile> &p,hier::Cancel c)try {
    checkpoint(c);return read(detail::input::decode(input,"memory test config",c),i,p,c);
}catch(const hier::Error &e){return e;}
hier::Result<MemoryTestTimingRequest> loadMemoryTestConfig(const std::filesystem::path &path,const MemoryInvestigationRequest &i,const std::vector<MemoryTestProfile> &p,hier::Cancel c)try {
    checkpoint(c);return parseMemoryTestConfig(detail::input::readFile(path,"memory test config",c),i,p,c);
}catch(const hier::Error &e){return e;}
}
