#include "../common/CliOutput.h"
#include "MemoryResourceUsageComparisonInternal.h"
#include "MemoryResourceUsageComparisonJson.h"
#include "MemoryResourceUsageInternal.h"
#include "MemoryResourceUsageJson.h"
#include "MemoryTestAssessmentComparisonInternal.h"
#include "MemoryTestAssessmentComparisonJson.h"
#include "MemoryTestAssessmentInternal.h"
#include "MemoryTestAssessmentJson.h"
#include "MemoryClockCheckInternal.h"
#include "MemoryClockCheckInput.h"
#include "MemoryClockCheckJson.h"
#include "MemoryTestDomainsInternal.h"
#include "MemoryTestDomainsJson.h"
#include "MemoryClockSourcesInternal.h"
#include "MemoryClockSourcesJson.h"
#include "MacroInterfacesInternal.h"
#include "MacroInterfacesJson.h"
#include "MemoryInvestigationInternal.h"
#include "MemoryMapJson.h"
#include "MemoryTestPlanInternal.h"
#include "MemoryTestPlanJson.h"
#include "PinLibraryJson.h"
#include "MemoryLibraryInput.h"
#include "MemoryTestRulesInput.h"
#include "MemoryTestConfigInput.h"
#include "MemoryScheduleResourcesInput.h"
#include "MemoryScheduleDependenciesInput.h"
#include "MemoryTestComparisonInternal.h"
#include "MemoryTestComparisonJson.h"
#include "MemoryTestCoverageJson.h"
#include "MemoryTestRulesInternal.h"
#include "MemoryTestRulesJson.h"
#include "MemoryTestScheduleInternal.h"
#include "MemoryTestScheduleJson.h"
#include "MemoryTestTimingInternal.h"
#include "MemoryTestTimingJson.h"
#include <map>
#include "hier/protocol/Json.h"
#include <charconv>
#include <iostream>
#include <set>
namespace {
using hier::protocol::JsonWriter;
using hier::protocol::write;
using namespace dft::memory;
struct Failure {std::string code,message;int exit;};
void bad(const char *message) {throw Failure{"invalid_arguments",message,2};}
template<class T> T take(hier::Result<T> r) {
    if(r) return std::move(r.value());
    const auto &e=r.error();
    switch(e.code) {
        case hier::ErrorCode::BadRequest:throw Failure{"invalid_arguments",e.message,2};
        case hier::ErrorCode::NotFound:throw Failure{"not_found",e.message,3};
        case hier::ErrorCode::Cancelled:throw Failure{"cancelled",e.message,130};
        default:throw Failure{"analysis_failed",e.message,5};
    }
}
uint64_t number(const std::string &text) {
    uint64_t value=0;const auto [end,error]=std::from_chars(text.data(),text.data()+text.size(),value);
    if(error!=std::errc{} || end!=text.data()+text.size()) bad("Expected an unsigned decimal integer");
    return value;
}


int run(int argc,char **argv) {
    if(argc==2 && std::string_view(argv[1])=="--version") {std::cout<<"{\"formatVersion\":1,\"algorithm\":\"rtl-macro-interfaces-v1\"}\n";return 0;}
    if(argc==2 && std::string_view(argv[1])=="--help") {
        std::cout<<"dft-memory --top TOP --scope INSTANCE --definition DEF [--clock-pin PIN] FILE...\n"
            "  Repeat --definition/--clock-pin for exact names; no RAM/type/capacity inference\n"
            "  Inputs: FILE... | -f FILELIST | -F FILELIST; -I DIR; -D NAME[=VALUE]\n"
            "  --recursive; --require-complete (partial exit4)\n"
            "  Directory: --max-instances/objects/catalog-queries/catalog-work/catalog-millis; --page-size\n"
            "  Mapping: --model DEF WORDS BITS; --role DEF ROLE PIN SENSE; --mask-lane DEF BITS\n"
            "  Mapping budgets: --map-max-macros/work/millis (requires --model)\n"
            "  Test plan: --plan-tests --test-profile DEF OPERATIONS_PER_WORD POWER_MICROWATTS ...\n"
            "    --test-instance EXACT_PATH DOMAIN PARTITION ... (empty partition allowed)\n"
            "    --test-max-controller-memories/parallel/power; --test-max-controllers/work/millis\n"
            "  --memory-library FILE: versioned JSON models, optional pins and test costs\n"
            "    Replaces static declarations; instance domains/policy/budgets remain CLI options\n"
            "  --test-rules FILE: explicit path-segment domain rules; requires --plan-tests\n"
            "  --test-config FILE: assignments/rules, planning, scheduling and clock timing\n"
            "    Requires --plan-tests; replaces per-run test options, keeps explicit stage flags\n"
            "  --compare-test-config NAME FILE ...: compare 2..8 configs on one investigation\n"
            "    Requires --plan-tests --schedule-tests --time-tests; first config is reference\n"
            "  --clock-sources: model clock pins to RTL primary-input bits/effective edges\n"
            "    --clock-max-work/depth/millis; cannot combine with --plan-tests\n"
            "  --compare-clock-expectations NAME FILE: pair each --compare-test-config with clock requirements\n"
            "  --assess-tests FILE: plan/timing coverage and RTL clock constraints; requires all three stages\n"
            "  --check-test-clocks FILE: explicit RTL source allowlists per test domain; requires --plan-tests\n"
            "    Verdict pass/fail/unknown is separate from --require-complete; not physical signoff\n"
            "  --inspect-test-domains: declared domains and observed RTL sources; requires --plan-tests\n"
            "    Supports --clock-max-work/depth/millis; incompatible with scheduling/timing\n"
            "  --compare-resource-usage: resource matrix for --compare-test-config; same usage limits\n"
            "  --test-resource-usage: shared-resource occupancy; requires all three stages\n"
            "    --usage-max-work/uses/millis; incompatible with other report modes\n"
            "  --test-coverage: per-macro test progress and blocking reasons; requires all three stages\n"
            "  --schedule-tests: global controller batches; requires --plan-tests\n"
            "    --schedule-max-parallel/power/waves/work/millis\n"
            "    --schedule-resources FILE: shared capacities and optional recoveryPicoseconds / maxPowerMicrowatts\n"
            "    --schedule-dependencies FILE: before/after test-domain prerequisites and optional minimumGapPicoseconds\n"
            "  --time-tests: declared clock timing; requires --schedule-tests\n"
            "    --test-clock DOMAIN PERIOD_PS ...; --time-wave-overhead PS\n"
            "    --test-partition-clock DOMAIN PARTITION PERIOD_PS ... (overrides domain default)\n"
            "    --time-max-duration PS; --time-max-work/millis\n"
            "  Library: --library-source LABEL --library-pin DEF PIN in|out|inout|ref|unknown WIDTH ...\n"
            "  Library is an explicit declaration at open; LABEL is not read as a file\n"
            "  Detail: --max-macros/pins/bindings/queries/work/millis/trace-nodes/trace-edges/depth\n";return 0;
    }
    hier::model::OpenOptions open;MacroRequest request;bool requireComplete=false;
    MemoryMapRequest mapping;
    MemoryTestPlanning planning;bool planTests=false,testOption=false;
    MemoryTestScheduling scheduling;bool scheduleTests=false,scheduleOption=false;
    MemoryTestTiming timing;bool timeTests=false,timeOption=false;
    MemoryInvestigationRequest investigation;
    LibraryDeclaration libraryInput;bool libraryOption=false;
    std::vector<std::pair<std::string,RoleBinding>> roles;
    std::map<std::string,uint64_t> lanes;
    bool mapOption=false,clockSources=false,clockOption=false,inspectDomains=false;MemoryClockLimits clockLimits;
    std::optional<std::string> memoryLibraryFile,testRulesFile,testConfigFile,clockCheckFile,assessmentFile,scheduleResourcesFile,scheduleDependenciesFile;
    std::vector<MemoryClockExpectation> clockExpectations;
    bool hasRules=false,planPolicyOption=false,testCoverage=false,resourceUsage=false,resourceComparison=false,usageOption=false;MemoryResourceUsageLimits usageLimits;
    std::vector<MemoryTestRule> testRules;
    std::vector<std::pair<std::string,std::string>> comparisonFiles;MemoryTestComparisonRequest comparison;
    std::vector<std::pair<std::string,std::string>> comparisonClockFiles;MemoryTestAssessmentComparisonRequest assessmentComparison;
    std::set<std::string> seen;
    for(int i=1;i<argc;++i) {
        const std::string arg=argv[i];
        if(!arg.empty()&&arg.front()!='-') {open.files.push_back(arg);continue;}
        auto next=[&]()->std::string {if(i+1>=argc)bad("Option needs a value");return argv[++i];};
        if(arg=="--compare-clock-expectations"){auto name=next();auto file=next();if(comparisonClockFiles.size()>=8)bad("Too many clock expectation configurations");comparisonClockFiles.emplace_back(std::move(name),std::move(file));continue;}
        if(arg=="--compare-test-config"){auto name=next();auto file=next();if(comparisonFiles.size()>=8)bad("Too many memory test configurations");comparisonFiles.emplace_back(std::move(name),std::move(file));testOption=true;continue;}
        if(arg=="--test-partition-clock") {auto domain=next();auto partition=next();auto period=number(next());if(timing.clocks.size()>=10000)bad("Too many memory test clocks");timing.clocks.push_back({std::move(domain),period,{std::move(partition)}});timeOption=true;continue;}
        if(arg=="--test-clock") {auto domain=next();auto period=number(next());if(timing.clocks.size()>=10000)bad("Too many memory test clocks");timing.clocks.push_back({std::move(domain),period});timeOption=true;continue;}
        if(arg=="--test-profile") {auto def=next();auto ops=number(next());auto power=number(next());if(planning.profiles.size()>=256)bad("Too many test profiles");planning.profiles.push_back({std::move(def),ops,power});testOption=true;continue;}
        if(arg=="--test-instance") {auto path=next();auto domain=next();auto partition=next();if(planning.assignments.size()>=10000)bad("Too many test assignments");planning.assignments.push_back({std::move(path),std::move(domain),std::move(partition)});testOption=true;continue;}
        if(arg=="--library-pin") {
            auto def=next();auto pin=next();auto dir=parseLibraryDirection(next());const auto width=number(next());
            if(!dir||width<1||width>65536)bad("Invalid library direction or width");
            if(!libraryInput.cells.contains(def)&&libraryInput.cells.size()>=256)bad("Too many library cells");
            auto &cell=libraryInput.cells[def];if(cell.pins.size()>=256)bad("Too many library cell pins");
            cell.pins.push_back({std::move(pin),*dir,uint32_t(width),{}});libraryOption=true;continue;
        }
        if(arg=="--model") {MemoryModel m;m.definitionName=next();m.words=number(next());m.dataBits=number(next());mapping.models.push_back(std::move(m));continue;}
        if(arg=="--role") {auto def=next();auto role=parseMemoryRole(next());auto pin=next();auto sense=parsePinSense(next());if(!role||!sense)bad("Unknown memory role or sense");roles.emplace_back(std::move(def),RoleBinding{*role,std::move(pin),*sense});mapOption=true;continue;}
        if(arg=="--mask-lane") {auto def=next();auto width=number(next());if(!lanes.emplace(def,width).second)bad("Duplicate mask lane definition");mapOption=true;continue;}
        if(arg!="-f"&&arg!="-F"&&arg!="-I"&&arg!="-D"&&arg!="--definition"&&arg!="--clock-pin"&&!seen.insert(arg).second) bad("Duplicate option");
        if(arg=="--plan-tests") {planTests=true;continue;}
        if(arg=="--schedule-tests") {scheduleTests=true;testOption=true;continue;}
        if(arg=="--inspect-test-domains"){inspectDomains=true;continue;}
        if(arg=="--clock-sources"){clockSources=true;continue;}
        if(arg=="--compare-resource-usage"){resourceComparison=true;continue;}
        if(arg=="--test-resource-usage"){resourceUsage=true;continue;}
        if(arg=="--test-coverage"){testCoverage=true;continue;}
        if(arg=="--time-tests") {timeTests=true;continue;}
        if(arg=="--recursive") {request.recursive=true;continue;}
        if(arg=="--require-complete") {requireComplete=true;continue;}
        if(i+1>=argc) bad("Option needs a value");
        const std::string value=argv[++i];
        if(arg=="--top") open.tops.push_back(value);
        else if(arg=="--memory-library")memoryLibraryFile=value;
        else if(arg=="--check-test-clocks")clockCheckFile=value;
        else if(arg=="--assess-tests")assessmentFile=value;
        else if(arg=="--test-config"){testConfigFile=value;testOption=true;}
        else if(arg=="--test-rules"){testRulesFile=value;testOption=true;}
        else if(arg=="--library-source") {libraryInput.source=value;libraryOption=true;}
        else if(arg=="--scope") request.scope=value;
        else if(arg=="-f") open.filelists.push_back(value);
        else if(arg=="-F") open.filelistsRelativeToFile.push_back(value);
        else if(arg=="-I") open.includeDirs.push_back(value);
        else if(arg=="-D") open.defines.push_back(value);
        else if(arg=="--clock-max-work"){clockLimits.maxWork=number(value);clockOption=true;}
        else if(arg=="--clock-max-depth"){clockLimits.maxDepth=number(value);clockOption=true;}
        else if(arg=="--clock-max-millis"){clockLimits.maxMillis=number(value);clockOption=true;}
        else if(arg=="--usage-max-work"){usageLimits.maxWork=number(value);usageOption=true;}
        else if(arg=="--usage-max-uses"){usageLimits.maxUses=number(value);usageOption=true;}
        else if(arg=="--usage-max-millis"){usageLimits.maxMillis=number(value);usageOption=true;}
        else if(arg=="--time-wave-overhead") {timing.policy.waveOverheadPicoseconds=number(value);timeOption=true;}
        else if(arg=="--time-max-duration") {timing.policy.maxDurationPicoseconds=number(value);timeOption=true;}
        else if(arg=="--time-max-work") {timing.limits.maxWork=number(value);timeOption=true;}
        else if(arg=="--time-max-millis") {timing.limits.maxMillis=number(value);timeOption=true;}
        else if(arg=="--schedule-max-parallel") {scheduling.policy.maxParallelControllers=number(value);scheduleOption=true;}
        else if(arg=="--schedule-resources") {scheduleResourcesFile=value;scheduleOption=true;}
        else if(arg=="--schedule-dependencies") {scheduleDependenciesFile=value;scheduleOption=true;}
        else if(arg=="--schedule-max-power") {scheduling.policy.maxPowerMicrowatts=number(value);scheduleOption=true;}
        else if(arg=="--schedule-max-waves") {scheduling.limits.maxWaves=number(value);scheduleOption=true;}
        else if(arg=="--schedule-max-work") {scheduling.limits.maxWork=number(value);scheduleOption=true;}
        else if(arg=="--schedule-max-millis") {scheduling.limits.maxMillis=number(value);scheduleOption=true;}
        else if(arg=="--test-max-controller-memories") {planning.policy.maxMemoriesPerController=number(value);testOption=true;planPolicyOption=true;}
        else if(arg=="--test-max-parallel") {planning.policy.maxParallelMemories=number(value);testOption=true;planPolicyOption=true;}
        else if(arg=="--test-max-power") {planning.policy.maxPowerMicrowatts=number(value);testOption=true;planPolicyOption=true;}
        else if(arg=="--test-max-controllers") {planning.limits.maxControllers=number(value);testOption=true;planPolicyOption=true;}
        else if(arg=="--test-max-work") {planning.limits.maxWork=number(value);testOption=true;planPolicyOption=true;}
        else if(arg=="--test-max-millis") {planning.limits.maxMillis=number(value);testOption=true;planPolicyOption=true;}
        else if(arg=="--map-max-macros") {mapping.limits.maxMacros=number(value);mapOption=true;}
        else if(arg=="--map-max-work") {mapping.limits.maxWork=number(value);mapOption=true;}
        else if(arg=="--map-max-millis") {mapping.limits.maxMillis=number(value);mapOption=true;}
        else if(arg=="--definition") request.definitionNames.push_back(value);
        else if(arg=="--clock-pin") request.clockPins.push_back(value);
        else if(arg=="--max-macros") request.limits.maxMacros=number(value);
        else if(arg=="--max-pins") request.limits.maxPins=number(value);
        else if(arg=="--max-bindings") request.limits.maxBindings=number(value);
        else if(arg=="--max-queries") request.limits.maxQueries=number(value);
        else if(arg=="--max-work") request.limits.maxWork=number(value);
        else if(arg=="--max-millis") request.limits.maxMillis=number(value);
        else if(arg=="--max-trace-nodes") request.limits.maxTraceNodes=number(value);
        else if(arg=="--max-trace-edges") request.limits.maxTraceEdges=number(value);
        else if(arg=="--max-depth") request.limits.maxDepth=number(value);
        else if(arg=="--max-instances") request.traversal.maxInstances=number(value);
        else if(arg=="--max-objects") request.traversal.maxObjects=number(value);
        else if(arg=="--max-catalog-queries") request.traversal.maxQueries=number(value);
        else if(arg=="--max-catalog-work") request.traversal.maxWork=number(value);
        else if(arg=="--max-catalog-millis") request.traversal.maxMillis=number(value);
        else if(arg=="--page-size") request.traversal.pageSize=number(value);
        else bad("Unknown option");
    }
    if(open.tops.size()!=1 || (open.files.empty()&&open.filelists.empty()&&open.filelistsRelativeToFile.empty())) bad("Provide inputs, one --top and explicit --scope");
    std::shared_ptr<const PinLibrary> library;
    if(memoryLibraryFile) {
        if(!request.definitionNames.empty()||!mapping.models.empty()||!roles.empty()||!lanes.empty()||libraryOption||!planning.profiles.empty())bad("Do not combine --memory-library with static model/library/test-profile declarations");
        auto loaded=take(loadMemoryLibrary(*memoryLibraryFile));mapping.models=std::move(loaded.models);planning.profiles=std::move(loaded.testProfiles);library=std::move(loaded.library);
    }
    if(usageOption&&!resourceUsage&&!resourceComparison)bad("Usage limits require --test-resource-usage");
    if(resourceComparison&&(comparisonFiles.size()<2||resourceUsage||testCoverage||assessmentFile||clockCheckFile||inspectDomains||clockSources||!comparisonClockFiles.empty()))bad("Resource comparison requires test configurations without another report mode");
    if(resourceUsage&&(!planTests||!scheduleTests||!timeTests||testCoverage||assessmentFile||clockCheckFile||inspectDomains||clockSources||!comparisonFiles.empty()||!comparisonClockFiles.empty()))bad("Resource usage requires planning, scheduling and timing, without another report mode");
    if(clockOption&&!clockSources&&!inspectDomains&&!clockCheckFile&&!assessmentFile&&comparisonClockFiles.empty())bad("Clock limits require --clock-sources");
    if(!comparisonClockFiles.empty()&&comparisonFiles.empty())bad("Comparison clock expectations require --compare-test-config");
    if(assessmentFile&&(!planTests||!scheduleTests||!timeTests||clockSources||inspectDomains||clockCheckFile||testCoverage||!comparisonFiles.empty()))bad("Assessment requires planning, scheduling and timing, without another analysis mode");
    if(clockCheckFile&&(!planTests||clockSources||inspectDomains||scheduleTests||timeTests||testCoverage||!comparisonFiles.empty()))bad("Clock checks require --plan-tests and cannot combine with other analysis modes");
    if(inspectDomains&&(!planTests||clockSources||scheduleTests||timeTests||testCoverage||!comparisonFiles.empty()))bad("Test domains require --plan-tests and cannot combine with other analysis stages");
    if(clockSources&&(mapping.models.empty()||planTests))bad("Clock sources require models and cannot combine with --plan-tests");
    if(testCoverage&&(!planTests||!scheduleTests||!timeTests))bad("Test coverage requires --plan-tests --schedule-tests --time-tests");
    if(testCoverage&&!comparisonFiles.empty())bad("Do not combine --test-coverage and --compare-test-config");
    if(!comparisonFiles.empty()&&(!planTests||!scheduleTests||!timeTests))bad("Configuration comparison requires --plan-tests --schedule-tests --time-tests");
    if(!comparisonFiles.empty()&&testConfigFile)bad("Do not combine --compare-test-config and --test-config");
    if((testConfigFile||!comparisonFiles.empty())&&(testRulesFile||!planning.assignments.empty()||planPolicyOption||scheduleOption||timeOption))bad(testConfigFile?"Do not combine --test-config with test assignments/rules or planning/scheduling/timing options":"Do not combine --compare-test-config with test assignments/rules or planning/scheduling/timing options");
    if(scheduleOption&&!scheduleTests)bad("Schedule options require --schedule-tests");
    if(timeTests&&!scheduleTests)bad("Timing requires --schedule-tests");
    if(timeOption&&!timeTests)bad("Timing options require --time-tests");
    if(testOption&&!planTests)bad("Test planning options require --plan-tests");
    if(testRulesFile){if(!planning.assignments.empty())bad("Do not combine --test-rules and --test-instance");testRules=take(loadMemoryTestRules(*testRulesFile));hasRules=true;}
    if(assessmentFile)clockExpectations=take(loadMemoryClockExpectations(*assessmentFile));
    if(clockCheckFile)clockExpectations=take(loadMemoryClockExpectations(*clockCheckFile));
    if(planTests&&mapping.models.empty())bad("Test planning requires --model");
    try {
        if(!mapping.models.empty()) {
            if(!request.definitionNames.empty())bad("Do not combine --model and --definition");
            std::map<std::string,size_t> byName;
            for(size_t i=0;i<mapping.models.size();++i){const auto &name=mapping.models[i].definitionName;if(!byName.emplace(name,i).second)bad("Duplicate memory definition");}
            for(auto &[name,role]:roles){auto at=byName.find(name);if(at==byName.end())bad("Role refers to undefined model");mapping.models[at->second].roles.push_back(std::move(role));}
            for(const auto &[name,width]:lanes){auto at=byName.find(name);if(at==byName.end())bad("Mask lane refers to undefined model");mapping.models[at->second].maskLaneBits=width;}
            investigation={request.scope,request.recursive,request.clockPins,request.traversal,request.limits,mapping};
            request=detail::prepareMemoryInvestigation(investigation);
        } else if(mapOption)bad("Mapping options require --model");
        else detail::validateMacroRequest(request);
        if(clockSources)detail::validateMemoryClockRequest({investigation,clockLimits});
        if(scheduleResourcesFile)scheduling.resources=take(loadMemoryScheduleResources(*scheduleResourcesFile));
        if(scheduleDependenciesFile)scheduling.dependencies=take(loadMemoryScheduleDependencies(*scheduleDependenciesFile));
        if(testConfigFile) {
            auto loaded=take(loadMemoryTestConfig(*testConfigFile,investigation,planning.profiles));
            planning=std::move(loaded.schedule.test.planning);scheduling=std::move(loaded.schedule.scheduling);timing=std::move(loaded.timing);
            hasRules=loaded.schedule.rules.has_value();if(hasRules)testRules=std::move(*loaded.schedule.rules);
        }
        if(!comparisonFiles.empty()) {
            comparison.investigation=investigation;
            for(const auto &[name,file]:comparisonFiles){auto loaded=take(loadMemoryTestConfig(file,investigation,planning.profiles));comparison.configurations.push_back({name,{std::move(loaded.schedule.test.planning),std::move(loaded.schedule.rules),std::move(loaded.schedule.scheduling),std::move(loaded.timing)}});}
            detail::validateMemoryTestComparisonRequest(comparison);
            if(resourceComparison)detail::validateMemoryResourceUsageComparisonRequest({comparison,usageLimits});
            if(!comparisonClockFiles.empty()) {
                std::map<std::string,std::string> files;
                for(const auto &[name,file]:comparisonClockFiles)if(!files.emplace(name,file).second)bad("Duplicate clock expectation configuration");
                if(files.size()!=comparison.configurations.size())bad("Provide clock expectations for every test configuration");
                for(const auto &entry:comparison.configurations) {
                    auto found=files.find(entry.name);if(found==files.end())bad("Clock expectations name does not match test configuration");
                    assessmentComparison.expectations.push_back(take(loadMemoryClockExpectations(found->second)));
                }
                assessmentComparison.tests=std::move(comparison);assessmentComparison.clockLimits=clockLimits;
                detail::validateMemoryTestAssessmentComparisonRequest(assessmentComparison);
            }
        }
        else if(assessmentFile)detail::validateMemoryTestAssessmentRequest({{{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,scheduling},timing},clockLimits,clockExpectations});
        else if(clockCheckFile)detail::validateMemoryClockCheckRequest({{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,clockLimits},clockExpectations});
        else if(inspectDomains)detail::validateMemoryTestDomainRequest({{investigation,planning},hasRules?std::optional(testRules):std::nullopt,clockLimits});
        else if(resourceUsage)detail::validateMemoryResourceUsageRequest({{{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,scheduling},timing},usageLimits});
        else if(timeTests)detail::validateMemoryTestTimingRequest({{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,scheduling},timing});
        else if(scheduleTests)detail::validateMemoryTestScheduleRequest({{investigation,planning},hasRules?std::optional(testRules):std::nullopt,scheduling});
        else if(hasRules)detail::validateMemoryTestRuleRequest({{investigation,planning},testRules});
        else if(planTests)detail::validateMemoryTestRequest({investigation,planning});
    } catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    if(libraryOption)library=take(PinLibrary::create(libraryInput));
    open.library=library;
    auto design=take(hier::Design::open(open));
    if(design->diagnostics(1).errorCount || design->roots().empty()) throw Failure{"design_invalid","Design has compile errors or no top",3};
    JsonWriter writer(true);bool complete=false;
    if(library&&!planTests&&!clockSources) {writer.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-library-memory-v1").key("library");writePinLibrary(writer,*library);writer.key("analysis");}
    if(clockSources){const auto report=take(inspectMemoryClockSources(*design,{investigation,clockLimits}));complete=report.clocks.complete;writeMemoryClockSources(writer,report,library.get());}
    else if(assessmentFile){const auto report=take(assessMemoryTests(*design,{{{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,scheduling},timing},clockLimits,clockExpectations}));complete=report.assessment.complete;writeMemoryTestAssessment(writer,report,library.get());}
    else if(clockCheckFile){const auto report=take(checkMemoryClockSources(*design,{{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,clockLimits},clockExpectations}));complete=report.check.complete;writeMemoryClockCheck(writer,report,library.get());}
    else if(inspectDomains){const auto report=take(inspectMemoryTestDomains(*design,{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,clockLimits}));complete=report.domains.complete;writeMemoryTestDomains(writer,report,library.get());}
    else if(!comparisonClockFiles.empty()){const auto report=take(compareMemoryTestAssessments(*design,assessmentComparison));complete=report.complete;writeMemoryTestAssessmentComparison(writer,report,library.get());}
    else if(resourceComparison){const auto report=take(compareMemoryResourceUsage(*design,{comparison,usageLimits}));complete=report.complete;writeMemoryResourceUsageComparison(writer,report,library.get());}
    else if(!comparisonFiles.empty()){const auto report=take(compareMemoryTestConfigurations(*design,comparison));complete=report.complete;writeMemoryTestComparison(writer,report,library.get());}
    else if(resourceUsage){const auto report=take(inspectMemoryResourceUsage(*design,{{{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,scheduling},timing},usageLimits}));complete=report.usage.complete;writeMemoryResourceUsage(writer,report,library.get());}
    else if(testCoverage) {const auto report=take(inspectMemoryTestCoverage(*design,{{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,scheduling},timing}));complete=report.coverage.complete;writeMemoryTestCoverage(writer,report,library.get());}
    else if(timeTests) {const auto report=take(timeMemoryTests(*design,{{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,scheduling},timing}));complete=report.timeline.complete;writeMemoryTestTiming(writer,report,library.get());}
    else if(scheduleTests) {const auto report=take(scheduleMemoryTests(*design,{{investigation,planning},hasRules?std::optional(testRules):std::nullopt,scheduling}));complete=report.schedule.complete;writeMemoryTestSchedule(writer,report,library.get());}
    else if(hasRules) {const auto report=take(planMemoryTestsByRules(*design,{{investigation,planning},testRules}));complete=report.report.plan.complete;writeMemoryTestRules(writer,report,library.get());}
    else if(planTests) {const auto report=take(planMemoryTests(*design,{investigation,planning}));complete=report.plan.complete;writeMemoryTestPlan(writer,report,library.get());}
    else if(mapping.models.empty()) {const auto report=take(inspectMacroInterfaces(*design,request));complete=report.complete;writeMacroInterfaces(writer,report);}
    else {const auto report=take(investigateMemories(*design,investigation));complete=report.mapping.complete;writeMemoryMap(writer,report.interfaces,report.mapping);}
    if(library&&!planTests&&!clockSources)writer.endObject();
    std::cout<<writer.str()<<'\n';std::cout.flush();
    if(!std::cout) throw Failure{"output_failed","Could not write macro interfaces",5};
    return requireComplete&&!complete?4:0;
}
}
static int mainWithoutOutput(int argc,char **argv) {
    try {return run(argc,argv);}
    catch(const Failure &e) {JsonWriter w;w.beginObject().key("formatVersion").value(1).key("error").beginObject().key("code").value(e.code).key("message").value(e.message).endObject().endObject();std::cout<<w.str()<<'\n';return e.exit;}
    catch(const std::exception &) {std::cout<<"{\"formatVersion\":1,\"error\":{\"code\":\"analysis_failed\",\"message\":\"Macro interface execution failed\"}}\n";return 5;}
}

int main(int argc, char **argv) {
    return dft::cli::withReportOutput(argc, argv, mainWithoutOutput, true);
}
