#include "../common/CliOutput.h"
#include "BoundaryJson.h"
#include "CellPlanJson.h"
#include "ChainPlanJson.h"
#include "WrapperConfigInput.h"
#include "ChainComparisonJson.h"
#include "ChainCoverageJson.h"
#include "ChainClocksJson.h"
#include "ChainResetsJson.h"
#include "ChainCompatibilityJson.h"
#include "ChainActivityPlanJson.h"
#include "ChainActivityScheduleJson.h"
#include "ChainExplanationJson.h"
#include <algorithm>
#include "hier/protocol/Json.h"
#include <charconv>
#include <iostream>
#include <set>
namespace {
using hier::protocol::JsonWriter;
using hier::protocol::write;
using namespace dft::wrapper;
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
    if(argc==2 && std::string_view(argv[1])=="--version") {std::cout<<"{\"formatVersion\":1,\"algorithm\":\"rtl-wrapper-boundary-v1\"}\n";return 0;}
    if(argc==2 && std::string_view(argv[1])=="--help") {
        std::cout<<"dft-wrapper --top TOP --scope INSTANCE [--port NAME] FILE...\n"
            "  Inputs: FILE... | -f FILELIST | -F FILELIST; -I DIR; -D NAME[=VALUE]\n"
            "  --compare-chains NAME FILE: compare 2..8 chain configurations (repeatable)\n"
            "  --reference NAME --max-comparison-chains 10000 --max-comparison-work 1000000 --max-comparison-millis 30000\n"
            "  --explain-chains --format json|text: existing control findings and RTL declaration locations\n"
            "  --max-explain-chains 1024 --max-explain-segments 10000 --max-explain-locations 10000\n"
            "  --max-explain-work 1000000 --max-explain-millis 30000; upstream compatibility/clock/reset limits apply\n"
            "  --schedule-activity: explicit functional clock pulse schedule in abstract ticks\n"
            "  --pulse-setup 1 --pulse-high 1 --pulse-low 1 --pulse-count 1\n"
            "  --max-schedule-rows 1024 --max-schedule-ticks 9007199254740991 --max-schedule-work 1000000 --max-schedule-millis 30000\n"
            "  --plan-activity: first-fit functional activity batches (not a test schedule)\n"
            "  --max-activity-batches 1024 --max-activity-chains 1024 --max-activity-bits 9007199254740991\n"
            "  --max-activity-work 1000000 --max-activity-millis 30000; upstream compatibility/clock/reset limits apply\n"
            "  --chain-compatibility: compare functional clocks and inactive controls (single-clock policy)\n"
            "  --compatibility-group NAME CHAIN (repeat for each member); default: one group per chain\n"
            "  --max-compatibility-groups 1024 --max-compatibility-work 1000000 --max-compatibility-millis 30000\n"
            "  --chain-resets: derive inactive async reset/set input constraints for shared state\n"
            "  --max-reset-rows 10000 --max-reset-events 100000 --max-reset-work 1000000\n"
            "  --max-reset-depth 64 --max-reset-millis 30000; clock limits also apply upstream\n"
            "  --chain-clocks: inspect functional clocks of allocated shared register bits\n"
            "  --max-clock-rows 10000 --max-clock-registers 10000 --max-clock-work 1000000\n"
            "  --max-clock-depth 64 --max-clock-millis 30000 --clock-page-size 64\n"
            "  --chain-coverage: explain a --plan-chains or chains --config result per boundary bit\n"
            "  --max-coverage-rows 10000 --max-coverage-positions 10000 --max-coverage-work 1000000 --max-coverage-millis 30000\n"
            "  --config FILE: wrapper-config v1 replaces all manual analysis options\n"
            "  --port NAME: exact port name (repeatable; default all ports)\n"
            "  --max-ports 10000 --max-bits 10000 --max-work 1000000\n"
            "  --max-depth 64 --max-millis 30000 --page-size 64\n"
            "  --plan-cells: wrapper proposals with register-bit deduplication\n"
            "  --cell-rule PORT input|output|both exclude|dedicated|share\n"
            "  --cell-bit-rule PORT LSB WIDTH input|output|both exclude|dedicated|share\n"
            "  --max-input-candidates 4 --max-output-candidates 1\n"
            "  --max-plan-rows 10000 --max-plan-work 1000000 --max-plan-millis 30000\n"
            "  --plan-chains: organize explicit logical chains (exclusive with --plan-cells)\n"
            "  --chain NAME CAPACITY --chain-default NAME\n"
            "  --chain-port PORT input|output|both CHAIN\n"
            "  --chain-bits PORT LSB WIDTH input|output|both CHAIN\n"
            "  --max-chain-rows 10000 --max-chain-segments 10000 --max-chain-work 1000000 --max-chain-millis 30000\n"
            "  --require-complete: partial exit4; structural evidence, not scan insertion\n";return 0;
    }
    hier::model::OpenOptions open;BoundaryRequest request;CellPlanRequest plan;ChainPlanRequest chains;bool requireComplete=false,planning=false,planOptions=false,chaining=false,chainOptions=false;
    std::optional<std::string> configPath;bool manualAnalysis=false;
    ChainComparisonRequest comparison;std::vector<std::pair<std::string,std::string>> comparisonFiles;
    std::optional<std::string> referenceName;bool comparisonOptions=false;
    ChainExplanationRequest explanation;bool explaining=false,explanationOptions=false,formatOptions=false;std::string format="json";
    ChainActivityScheduleRequest schedule;bool scheduling=false,scheduleOptions=false;
    ChainActivityPlanRequest activity;bool batching=false,activityOptions=false;
    ChainCompatibilityRequest compatibility;bool checking=false,compatibilityOptions=false;
    ChainResetRequest resets;bool resetting=false,resetOptions=false;
    ChainClockRequest clocks;bool clocking=false,clockOptions=false;
    ChainCoverageRequest coverage;bool covering=false,coverageOptions=false;
    std::set<std::string> seen;
    for(int i=1;i<argc;++i) {
        const std::string arg=argv[i];
        if(!arg.empty()&&arg.front()!='-') {open.files.push_back(arg);continue;}
        if(arg!="-f"&&arg!="-F"&&arg!="-I"&&arg!="-D"&&arg!="--port"&&arg!="--cell-rule"&&arg!="--cell-bit-rule"&&arg!="--chain"&&arg!="--chain-port"&&arg!="--chain-bits"&&arg!="--compare-chains"&&arg!="--compatibility-group"&&!seen.insert(arg).second) bad("Duplicate option");
        if(arg=="--explain-chains"){explaining=true;continue;}
        if(arg=="--schedule-activity"){scheduling=true;continue;}
        if(arg=="--plan-activity"){batching=true;continue;}
        if(arg=="--chain-compatibility"){checking=true;continue;}
        if(arg=="--compatibility-group"){
            if(i+2>=argc)bad("--compatibility-group needs NAME CHAIN");
            const std::string name=argv[++i],chain=argv[++i];
            auto g=std::find_if(compatibility.groups.begin(),compatibility.groups.end(),[&](const auto &v){return v.name==name;});
            if(g==compatibility.groups.end())compatibility.groups.push_back({name,{chain}});else g->chains.push_back(chain);
            compatibilityOptions=true;continue;
        }
        if(arg=="--chain-resets"){resetting=true;continue;}
        if(arg=="--chain-clocks"){clocking=true;continue;}
        if(arg=="--chain-coverage"){covering=true;continue;}
        if(arg=="--require-complete") {requireComplete=true;continue;}
        if(arg=="--compare-chains") {
            if(i+2>=argc)bad("--compare-chains needs NAME FILE");
            const std::string name=argv[++i],file=argv[++i];comparisonFiles.emplace_back(name,file);continue;
        }
        if(arg!="--config"&&arg!="--top"&&arg!="-f"&&arg!="-F"&&arg!="-I"&&arg!="-D"&&arg!="--reference"&&arg!="--max-comparison-chains"&&arg!="--max-comparison-work"&&arg!="--max-comparison-millis"&&arg!="--max-coverage-rows"&&arg!="--max-coverage-positions"&&arg!="--max-coverage-work"&&arg!="--max-coverage-millis"&&arg!="--max-clock-rows"&&arg!="--max-clock-registers"&&arg!="--max-clock-work"&&arg!="--max-clock-depth"&&arg!="--max-clock-millis"&&arg!="--clock-page-size"&&arg!="--max-reset-rows"&&arg!="--max-reset-events"&&arg!="--max-reset-work"&&arg!="--max-reset-depth"&&arg!="--max-reset-millis"&&arg!="--max-compatibility-groups"&&arg!="--max-compatibility-work"&&arg!="--max-compatibility-millis"&&arg!="--max-activity-batches"&&arg!="--max-activity-chains"&&arg!="--max-activity-bits"&&arg!="--max-activity-work"&&arg!="--max-activity-millis"&&arg!="--pulse-setup"&&arg!="--pulse-high"&&arg!="--pulse-low"&&arg!="--pulse-count"&&arg!="--max-schedule-rows"&&arg!="--max-schedule-ticks"&&arg!="--max-schedule-work"&&arg!="--max-schedule-millis"&&arg!="--format"&&arg!="--max-explain-chains"&&arg!="--max-explain-segments"&&arg!="--max-explain-locations"&&arg!="--max-explain-work"&&arg!="--max-explain-millis")manualAnalysis=true;
        if(arg=="--plan-cells") {planning=true;continue;}
        if(arg=="--plan-chains") {chaining=true;continue;}
        if(arg=="--chain" || arg=="--chain-port" || arg=="--chain-bits") {
            chainOptions=true;const auto next=[&]() {if(i+1>=argc)bad("Option needs a value");return std::string(argv[++i]);};
            if(arg=="--chain") {const auto name=next();const auto capacity=number(next());chains.chains.push_back({name,capacity});continue;}
            ChainAssignment a;a.port=next();
            if(arg=="--chain-bits") {const auto lsb=number(next()),width=number(next());a.bits=hier::model::BitRange{lsb,width};}
            const auto direction=next();
            if(direction=="input")a.direction=CellDirection::Input;else if(direction=="output")a.direction=CellDirection::Output;
            else if(direction!="both")bad("Rule direction must be input, output or both");
            a.chain=next();chains.assignments.push_back(std::move(a));continue;
        }
        if(arg=="--cell-rule" || arg=="--cell-bit-rule") {
            planOptions=true;
            const auto next=[&]() {if(i+1>=argc)bad("Option needs a value");return std::string(argv[++i]);};
            CellRule rule;rule.port=next();
            if(arg=="--cell-bit-rule") {const auto lsb=number(next()),width=number(next());rule.bits=hier::model::BitRange{lsb,width};}
            const auto direction=next(),action=next();
            if(direction=="input")rule.direction=CellDirection::Input;else if(direction=="output")rule.direction=CellDirection::Output;
            else if(direction!="both")bad("Rule direction must be input, output or both");
            if(action=="dedicated")rule.action=CellAction::Dedicated;else if(action=="share")rule.action=CellAction::Share;
            else if(action!="exclude")bad("Rule action must be exclude, dedicated or share");
            plan.rules.push_back(std::move(rule));continue;
        }
        if(i+1>=argc) bad("Option needs a value");
        const std::string value=argv[++i];
        if(arg=="--config") configPath=value;
        else if(arg=="--format"){format=value;formatOptions=true;}
        else if(arg=="--max-explain-chains") {explanation.limits.maxChains=number(value);explanationOptions=true;}
        else if(arg=="--max-explain-segments") {explanation.limits.maxSegments=number(value);explanationOptions=true;}
        else if(arg=="--max-explain-locations") {explanation.limits.maxLocations=number(value);explanationOptions=true;}
        else if(arg=="--max-explain-work") {explanation.limits.maxWork=number(value);explanationOptions=true;}
        else if(arg=="--max-explain-millis") {explanation.limits.maxMillis=number(value);explanationOptions=true;}
        else if(arg=="--pulse-setup") {schedule.pulse.setupTicks=number(value);scheduleOptions=true;}
        else if(arg=="--pulse-high") {schedule.pulse.highTicks=number(value);scheduleOptions=true;}
        else if(arg=="--pulse-low") {schedule.pulse.lowTicks=number(value);scheduleOptions=true;}
        else if(arg=="--pulse-count") {schedule.pulse.pulses=number(value);scheduleOptions=true;}
        else if(arg=="--max-schedule-rows") {schedule.limits.maxRows=number(value);scheduleOptions=true;}
        else if(arg=="--max-schedule-ticks") {schedule.limits.maxTicks=number(value);scheduleOptions=true;}
        else if(arg=="--max-schedule-work") {schedule.limits.maxWork=number(value);scheduleOptions=true;}
        else if(arg=="--max-schedule-millis") {schedule.limits.maxMillis=number(value);scheduleOptions=true;}
        else if(arg=="--max-activity-batches"){activity.limits.maxBatches=number(value);activityOptions=true;}
        else if(arg=="--max-activity-chains"){activity.limits.maxChainsPerBatch=number(value);activityOptions=true;}
        else if(arg=="--max-activity-bits"){activity.limits.maxSharedBitsPerBatch=number(value);activityOptions=true;}
        else if(arg=="--max-activity-work"){activity.limits.maxWork=number(value);activityOptions=true;}
        else if(arg=="--max-activity-millis"){activity.limits.maxMillis=number(value);activityOptions=true;}
        else if(arg=="--max-compatibility-groups"){compatibility.limits.maxGroups=number(value);compatibilityOptions=true;}
        else if(arg=="--max-compatibility-work"){compatibility.limits.maxWork=number(value);compatibilityOptions=true;}
        else if(arg=="--max-compatibility-millis"){compatibility.limits.maxMillis=number(value);compatibilityOptions=true;}
        else if(arg=="--max-reset-rows"){resets.limits.maxRows=number(value);resetOptions=true;}
        else if(arg=="--max-reset-events"){resets.limits.maxEvents=number(value);resetOptions=true;}
        else if(arg=="--max-reset-work"){resets.limits.maxWork=number(value);resetOptions=true;}
        else if(arg=="--max-reset-depth"){resets.limits.maxDepth=number(value);resetOptions=true;}
        else if(arg=="--max-reset-millis"){resets.limits.maxMillis=number(value);resetOptions=true;}
        else if(arg=="--max-clock-rows"){clocks.limits.maxRows=number(value);clockOptions=true;}
        else if(arg=="--max-clock-registers"){clocks.limits.maxRegisters=number(value);clockOptions=true;}
        else if(arg=="--max-clock-work"){clocks.limits.maxWork=number(value);clockOptions=true;}
        else if(arg=="--max-clock-depth"){clocks.limits.maxDepth=number(value);clockOptions=true;}
        else if(arg=="--max-clock-millis"){clocks.limits.maxMillis=number(value);clockOptions=true;}
        else if(arg=="--clock-page-size"){clocks.limits.pageSize=number(value);clockOptions=true;}
        else if(arg=="--max-coverage-rows"){coverage.limits.maxRows=number(value);coverageOptions=true;}
        else if(arg=="--max-coverage-positions"){coverage.limits.maxPositions=number(value);coverageOptions=true;}
        else if(arg=="--max-coverage-work"){coverage.limits.maxWork=number(value);coverageOptions=true;}
        else if(arg=="--max-coverage-millis"){coverage.limits.maxMillis=number(value);coverageOptions=true;}
        else if(arg=="--reference") {referenceName=value;comparisonOptions=true;}
        else if(arg=="--max-comparison-chains") {comparison.limits.maxChains=number(value);comparisonOptions=true;}
        else if(arg=="--max-comparison-work") {comparison.limits.maxWork=number(value);comparisonOptions=true;}
        else if(arg=="--max-comparison-millis") {comparison.limits.maxMillis=number(value);comparisonOptions=true;}
        else if(arg=="--top") open.tops.push_back(value);
        else if(arg=="--scope") request.scope=value;
        else if(arg=="-f") open.filelists.push_back(value);
        else if(arg=="-F") open.filelistsRelativeToFile.push_back(value);
        else if(arg=="-I") open.includeDirs.push_back(value);
        else if(arg=="-D") open.defines.push_back(value);
        else if(arg=="--port") request.ports.push_back(value);
        else if(arg=="--max-ports") request.limits.maxPorts=number(value);
        else if(arg=="--max-bits") request.limits.maxBits=number(value);
        else if(arg=="--max-depth") request.limits.maxDepth=number(value);
        else if(arg=="--max-work") request.limits.maxWork=number(value);
        else if(arg=="--max-millis") request.limits.maxMillis=number(value);
        else if(arg=="--page-size") request.limits.pageSize=number(value);
        else if(arg=="--max-input-candidates") {planOptions=true;plan.policy.maxInputCandidates=number(value);}
        else if(arg=="--max-output-candidates") {planOptions=true;plan.policy.maxOutputCandidates=number(value);}
        else if(arg=="--max-plan-rows") {planOptions=true;plan.limits.maxRows=number(value);}
        else if(arg=="--max-plan-work") {planOptions=true;plan.limits.maxWork=number(value);}
        else if(arg=="--max-plan-millis") {planOptions=true;plan.limits.maxMillis=number(value);}
        else if(arg=="--chain-default") {chainOptions=true;chains.defaultChain=value;}
        else if(arg=="--max-chain-rows") {chainOptions=true;chains.limits.maxRows=number(value);}
        else if(arg=="--max-chain-segments") {chainOptions=true;chains.limits.maxSegments=number(value);}
        else if(arg=="--max-chain-work") {chainOptions=true;chains.limits.maxWork=number(value);}
        else if(arg=="--max-chain-millis") {chainOptions=true;chains.limits.maxMillis=number(value);}
        else bad("Unknown option");
    }
    if(open.tops.size()!=1 || (open.files.empty()&&open.filelists.empty()&&open.filelistsRelativeToFile.empty())) bad("Provide inputs, one --top and explicit --scope");
    const bool comparing=!comparisonFiles.empty();
    if((explanationOptions||formatOptions)&&!explaining)bad("Explanation options require --explain-chains");
    if(format!="json"&&format!="text")bad("Format must be json or text");
    if(explaining&&(scheduling||batching||checking||resetting||clocking||covering||comparing||!compatibility.groups.empty()))bad("--explain-chains conflicts with explicit report modes/groups");
    if(scheduleOptions&&!scheduling)bad("Schedule options require --schedule-activity");
    if(scheduling&&(batching||checking||resetting||clocking||covering||comparing||!compatibility.groups.empty()))bad("--schedule-activity conflicts with explicit report modes/groups");
    if(activityOptions&&!batching&&!scheduling)bad("Activity options require --plan-activity");
    if(batching&&(checking||resetting||clocking||covering||comparing||!compatibility.groups.empty()))bad("--plan-activity conflicts with explicit report modes/groups");
    if(compatibilityOptions&&!checking&&!batching&&!scheduling&&!explaining)bad("Compatibility options require --chain-compatibility");
    if(checking&&(resetting||clocking||covering||comparing))bad("--chain-compatibility conflicts with resets/clocks/coverage/comparison");
    if(resetOptions&&!resetting&&!checking&&!batching&&!scheduling&&!explaining)bad("Reset options require --chain-resets");
    if(resetting&&(clocking||covering||comparing))bad("--chain-resets conflicts with clocks/coverage/comparison");
    if(clockOptions&&!clocking&&!resetting&&!checking&&!batching&&!scheduling&&!explaining)bad("Clock options require --chain-clocks");
    if(clocking&&(covering||comparing))bad("--chain-clocks conflicts with coverage/comparison");
    if(coverageOptions&&!covering)bad("Coverage options require --chain-coverage");
    if(covering&&comparing)bad("--chain-coverage conflicts with --compare-chains");
    if(comparisonOptions&&!comparing)bad("Comparison options require --compare-chains");
    if(comparing) {
        if(configPath||manualAnalysis)bad("--compare-chains conflicts with other analysis modes/options");
        if(comparisonFiles.size()<2||comparisonFiles.size()>8)bad("Compare 2..8 wrapper chain configurations");
        for(const auto &[name,file]:comparisonFiles) {
            auto config=take(loadWrapperConfig(file));auto *chain=std::get_if<ChainPlanRequest>(&config);
            if(!chain)bad("Comparison requires chains-mode configurations");
            comparison.configurations.push_back({name,std::move(*chain)});
        }
        if(referenceName) {
            size_t i=0;for(;i<comparison.configurations.size();++i)if(comparison.configurations[i].name==*referenceName)break;
            if(i==comparison.configurations.size())bad("Unknown reference configuration");comparison.reference=i;
        }
    }
    if(planOptions && !planning && !chaining)bad("Cell planning options require --plan-cells");
    if(planning && chaining)bad("Choose --plan-cells or --plan-chains");
    if(chainOptions && !chaining)bad("Chain options require --plan-chains");
    plan.boundary=request;chains.cells=plan;
    if(configPath) {
        if(manualAnalysis)bad("--config conflicts with manual analysis options");
        auto config=take(loadWrapperConfig(*configPath));
        if(auto *b=std::get_if<BoundaryRequest>(&config))request=std::move(*b);
        else if(auto *p=std::get_if<CellPlanRequest>(&config)){planning=true;plan=std::move(*p);}
        else {chaining=true;chains=std::move(std::get<ChainPlanRequest>(config));}
    }
    if(explaining&&!chaining)bad("--explain-chains requires --plan-chains or chains configuration");
    if(scheduling&&!chaining)bad("--schedule-activity requires --plan-chains or chains configuration");
    if(batching&&!chaining)bad("--plan-activity requires --plan-chains or chains configuration");
    if(checking&&!chaining)bad("--chain-compatibility requires --plan-chains or chains configuration");
    if(resetting&&!chaining)bad("--chain-resets requires --plan-chains or chains configuration");
    if(clocking&&!chaining)bad("--chain-clocks requires --plan-chains or chains configuration");
    if(covering&&!chaining)bad("--chain-coverage requires --plan-chains or chains configuration");
    if(explaining){clocks.chains=std::move(chains);resets.clock=std::move(clocks);explanation.resets=std::move(resets);explanation.inspection=compatibility.limits;take(validateChainExplanationRequest(explanation));}
    else if(scheduling){clocks.chains=std::move(chains);resets.clock=std::move(clocks);activity.resets=std::move(resets);activity.inspection=compatibility.limits;schedule.activity=std::move(activity);take(validateChainActivityScheduleRequest(schedule));}
    else if(batching){clocks.chains=std::move(chains);resets.clock=std::move(clocks);activity.resets=std::move(resets);activity.inspection=compatibility.limits;take(validateChainActivityPlanRequest(activity));}
    else if(checking){clocks.chains=std::move(chains);resets.clock=std::move(clocks);compatibility.resets=std::move(resets);take(validateChainCompatibilityRequest(compatibility));}
    else if(resetting){clocks.chains=std::move(chains);resets.clock=std::move(clocks);take(validateChainResetRequest(resets));}
    else if(clocking){clocks.chains=std::move(chains);take(validateChainClockRequest(clocks));}
    else if(covering){coverage.chains=std::move(chains);take(validateChainCoverageRequest(coverage));}
    else if(comparing)take(validateChainComparisonRequest(comparison));else if(chaining)take(validateChainPlanRequest(chains));else if(planning)take(validateCellPlanRequest(plan));else take(validateBoundaryRequest(request));
    auto design=take(hier::Design::open(open));
    if(design->diagnostics(1).errorCount || design->roots().empty()) throw Failure{"design_invalid","Design has compile errors or no top",3};
    JsonWriter writer(true);bool complete=false;std::optional<std::string> textReport;
    if(explaining){const auto report=take(explainWrapperChains(*design,explanation));if(format=="text")textReport=formatChainExplanation(report);else writeChainExplanation(writer,report);complete=report.explanation.complete;}
    else if(scheduling){const auto report=take(scheduleWrapperChainActivity(*design,schedule));writeChainActivitySchedule(writer,report);complete=report.schedule.complete;}
    else if(batching){const auto report=take(planWrapperChainActivity(*design,activity));writeChainActivityPlan(writer,report);complete=report.activity.complete;}
    else if(checking){const auto report=take(inspectWrapperChainCompatibility(*design,compatibility));writeChainCompatibility(writer,report);complete=report.compatibility.complete;}
    else if(resetting){const auto report=take(inspectWrapperChainResets(*design,resets));writeChainResets(writer,report);complete=report.resets.complete;}
    else if(clocking){const auto report=take(inspectWrapperChainClocks(*design,clocks));writeChainClocks(writer,report);complete=report.clocks.complete;}
    else if(covering){const auto report=take(inspectWrapperCoverage(*design,coverage));writeChainCoverage(writer,report);complete=report.coverage.complete;}
    else if(comparing) {const auto report=take(compareWrapperChains(*design,comparison));writeChainComparison(writer,report);complete=report.complete;}
    else if(chaining) {const auto report=take(planWrapperChains(*design,chains));writeChainPlan(writer,report);complete=report.layout.complete;}
    else if(planning) {const auto report=take(planWrapperCells(*design,plan));writeCellPlan(writer,report);complete=report.plan.complete;}
    else {const auto report=take(investigateBoundary(*design,request));writeBoundary(writer,report);complete=report.complete;}
    std::cout<<(textReport?*textReport:writer.str())<<'\n';std::cout.flush();
    if(!std::cout) throw Failure{"output_failed","Could not write boundary report",5};
    return requireComplete&&!complete?4:0;
}
}
static int mainWithoutOutput(int argc,char **argv) {
    try {return run(argc,argv);}
    catch(const Failure &e) {JsonWriter w;w.beginObject().key("formatVersion").value(1).key("error").beginObject().key("code").value(e.code).key("message").value(e.message).endObject().endObject();std::cout<<w.str()<<'\n';return e.exit;}
    catch(const std::exception &) {std::cout<<"{\"formatVersion\":1,\"error\":{\"code\":\"analysis_failed\",\"message\":\"Boundary investigation failed\"}}\n";return 5;}
}

int main(int argc, char **argv) {
    return dft::cli::withReportOutput(argc, argv, mainWithoutOutput, true);
}
