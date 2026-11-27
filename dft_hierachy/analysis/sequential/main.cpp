#include "../common/CliOutput.h"
#include "LogicProofJson.h"
#include "Scenarios.h"
#include "InventoryInternal.h"
#include "GenerationInternal.h"
#include "GenerationComparisonInternal.h"
#include "RegisterStatisticsInternal.h"
#include "RegisterEventGroupsInternal.h"
#include "RegisterControlProfileInternal.h"
#include "RegisterResolvedEventsInternal.h"
#include "RegisterScenariosInternal.h"
#include "RegisterGenerationInternal.h"
#include "RegisterGenerationScenariosInternal.h"
#include "RegisterFanoutInternal.h"
#include "RegisterControlSourcesInternal.h"
#include "RegisterSourceScenariosInternal.h"
#include "RegisterSourceDeltasInternal.h"
#include "RegisterSourceAttributionInternal.h"
#include "RegisterSourceTransitionsInternal.h"
#include "RegisterSourceImpactInternal.h"
#include "RegisterSourceHierarchyInternal.h"
#include "RegisterSourceHierarchyMatrixInternal.h"
#include "RegisterSourceHierarchyRangesInternal.h"
#include "RegisterSourceRangeSelectionInternal.h"
#include "SourceRangeEvidenceInternal.h"
#include "SourceEvidenceLocationsInternal.h"
#include "SourceEvidenceExcerptsInternal.h"
#include "SourceInvestigation.h"
#include "hier/protocol/Json.h"
#include <charconv>
#include <algorithm>
#include <iostream>
#include <set>

namespace {
using hier::protocol::JsonWriter;
using hier::protocol::write;
struct Failure { std::string code, message; int exit = 5; };
template<class T> T take(hier::Result<T> value) {
    if (!value) {
        const auto &error = value.error();
        if (error.code == hier::ErrorCode::Cancelled) throw Failure{"cancelled", error.message, 130};
        if (error.code == hier::ErrorCode::BadRequest) throw Failure{"invalid_arguments", error.message, 2};
        if (error.code == hier::ErrorCode::NotFound) throw Failure{"not_found", error.message, 3};
        throw Failure{"analysis_failed", error.message, 5};
    }
    return std::move(value.value());
}
uint64_t number(const std::string &text) {
    uint64_t n = 0;
    const auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), n);
    if (error != std::errc{} || end != text.data() + text.size())
        throw Failure{"invalid_arguments", "Expected an unsigned decimal integer", 2};
    return n;
}
void index(JsonWriter &w, std::optional<size_t> value) {
    if (value) w.value(*value);
    else w.null();
}
void limitsJson(JsonWriter &w, const dft::sequential::Request &r) {
    w.beginObject();
    w.key("maxFacts").value(r.maxFacts).key("maxInstances").value(r.maxInstances);
    w.key("maxChecks").value(r.maxChecks).key("maxTraceNodes").value(r.maxTraceNodes);
    w.key("maxTraceEdges").value(r.maxTraceEdges).key("maxDepth").value(r.maxDepth);
    w.key("maxMillis").value(r.maxMillis);
    if (r.resolveLogic) w.key("maxLogicWork").value(r.maxLogicWork);
    if (r.analyzeClockUsage) w.key("maxUsageWork").value(r.maxUsageWork);
    w.endObject();
}
void controlJson(JsonWriter &w, const dft::sequential::Control &control, bool rooted, bool conditional) {
    w.beginObject().key("point"); write(w, control.point);
    w.key("path").value(control.path).key("verdict").value(control.verdict);
    w.key("reasons"); write(w, control.reasons);
    if (control.trace) { w.key("trace"); write(w, *control.trace); }
    if (control.logic) {
        w.key("logic");dft::sequential::writeLogicProof(w,*control.logic,rooted,conditional);
    }
    w.endObject();
}
void reportJson(JsonWriter &w, const dft::sequential::Report &r) {
    const bool rooted = !r.clockRoots.empty();
    const bool conditional = !r.inputValues.empty();
    w.beginObject().key("formatVersion").value(conditional ? 5 : rooted ? 4 : r.request.analyzeClockUsage ? 3 : r.request.resolveLogic ? 2 : 1).key("algorithm")
        .value(conditional ? "rtl-input-values-v1" : rooted ? "rtl-rooted-gates-v1" : r.request.analyzeClockUsage ? "rtl-control-usage-v1" :
               r.request.resolveLogic ? "rtl-control-sources-v1" : "rtl-structural-control-v1");
    w.key("snapshot"); write(w, r.snapshot);
    w.key("scope").value(r.scope).key("recursive").value(r.request.recursive);
    if (rooted || conditional) {
        w.key("clockRoots").beginArray();
        for (const auto &root : r.clockRoots) {
            w.beginObject().key("path").value(root.path).key("point"); write(w, root.point); w.endObject();
        }
        w.endArray();
    }
    if (conditional) {
        w.key("interpretation").value("under_input_values").key("inputValues").beginArray();
        for (const auto &input : r.inputValues) {
            w.beginObject().key("path").value(input.input.path).key("point"); write(w, input.input.point);
            w.key("value").value(input.high ? "1" : "0").endObject();
        }
        w.endArray();
    }
    w.key("limits"); limitsJson(w, r.request);
    w.key("quality").beginObject().key("completeness").value(r.complete ? "complete" : "partial");
    w.key("reasons"); write(w, r.reasons); w.endObject();
    w.key("visitedInstances").value(r.visitedInstances);
    w.key("registers").beginArray();
    for (const auto &record : r.registers) {
        w.beginObject().key("fact"); write(w, record.fact);
        w.key("instancePath").value(record.instancePath).key("signalPath").value(record.signalPath);
        if (record.source) { w.key("source"); write(w, *record.source); }
        if (record.sourceUnavailable) w.key("sourceUnavailable").value(*record.sourceUnavailable);
        w.key("clockCheck"); index(w, record.clockCheck);
        w.key("asyncChecks").beginArray();
        for (const auto check : record.asyncChecks) index(w, check);
        w.endArray().endObject();
    }
    w.endArray().key("checks").beginArray();
    for (const auto &control : r.checks) controlJson(w, control, rooted, conditional);
    w.endArray().key("findings").beginArray();
    for (const auto &finding : r.findings)
        w.beginObject().key("rule").value(finding.rule).key("severity").value(finding.severity)
            .key("check").value(finding.check).endObject();
    w.endArray();
    if (r.request.analyzeClockUsage) {
        w.key("clockUsage").beginArray();
        for (const auto &proof : r.clockUsage) {
            w.beginObject().key("check").value(proof.check).key("complete").value(proof.complete);
            w.key("work").value(proof.work).key("reasons"); write(w, proof.reasons);
            w.key("steps").beginArray();
            for (const auto &step : proof.steps) {
                w.beginObject().key("point"); write(w, step.point);
                w.key("direction").value(step.upstream ? "back" : "forward");
                w.key("response"); write(w, step.response); w.endObject();
            }
            w.endArray().key("witnesses").beginArray();
            for (const auto &witness : proof.witnesses)
                w.beginObject().key("step").value(witness.step).key("hop").value(witness.hop)
                    .key("continuation").value(witness.continuation).key("role").value(witness.role).endObject();
            w.endArray().endObject();
        }
        w.endArray();
    }
    w.endObject();
}
std::string json(const dft::sequential::Report &r) {
    JsonWriter w;
    reportJson(w, r);
    return w.str();
}
void sourceJson(JsonWriter &w, const dft::sequential::ScenarioSource &source) {
    w.beginObject().key("kind").value(source.kind).key("inverted").value(source.inverted);
    if (source.point) { w.key("point"); write(w, *source.point); }
    if (source.sourceRef) w.key("sourceRef").value(*source.sourceRef);
    if (source.value) w.key("value").value(*source.value);
    w.endObject();
}
void scenarioJson(JsonWriter &w, const dft::sequential::ScenarioReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-scenario-sources-v1");
    w.key("snapshot"); write(w, r.snapshot);
    w.key("common").beginObject().key("scopeRequested").value(r.request.common.scope);
    w.key("recursive").value(r.request.common.recursive).key("analyzeClockUsage").value(r.request.common.analyzeClockUsage);
    w.key("limits"); limitsJson(w, r.request.common);
    w.key("clockRootsRequested").beginArray();
    for (const auto &root : r.request.common.clockRoots)
        w.beginObject().key("path").value(root.path).key("bit").value(root.bit).endObject();
    w.endArray().endObject();
    w.key("scope").value(r.scope).key("limits").beginObject().key("maxScenarios").value(8);
    w.key("maxMillis").value(r.request.maxMillis).key("maxComparisons").value(r.request.maxComparisons).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete ? "complete" : "partial").key("reasons");
    write(w, r.reasons); w.endObject();
    uint64_t reported = 0, changed = 0, unchanged = 0, unresolved = 0;
    w.key("scenarios").beginArray();
    for (const auto &item : r.scenarios) {
        w.beginObject().key("name").value(item.name).key("inputValuesRequested").beginArray();
        for (const auto &input : item.inputValuesRequested)
            w.beginObject().key("path").value(input.input.path).key("bit").value(input.input.bit)
                .key("value").value(input.high ? "1" : "0").endObject();
        w.endArray().key("status").value(item.report ? "reported" : "not_run");
        if (item.report) { ++reported; w.key("report"); reportJson(w, *item.report); }
        else w.key("reason").value("budget_time");
        w.endObject();
    }
    w.endArray().key("comparisons").beginArray();
    for (const auto &comparison : r.comparisons) {
        w.beginObject().key("baseline").value(comparison.baseline).key("scenario").value(comparison.scenario);
        w.key("controls").beginArray();
        for (const auto &row : comparison.controls) {
            if (row.status == "changed") ++changed;
            else if (row.status == "unchanged") ++unchanged;
            else ++unresolved;
            w.beginObject().key("point"); write(w, row.point);
            w.key("baselineCheck"); index(w, row.baselineCheck);
            w.key("scenarioCheck"); index(w, row.scenarioCheck);
            w.key("status").value(row.status).key("reasons"); write(w, row.reasons);
            if (row.baselineSource) { w.key("baselineSource"); sourceJson(w, *row.baselineSource); }
            if (row.scenarioSource) { w.key("scenarioSource"); sourceJson(w, *row.scenarioSource); }
            w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("summary").beginObject().key("reportedScenarios").value(reported);
    w.key("notRunScenarios").value(r.scenarios.size() - reported).key("changed").value(changed);
    w.key("unchanged").value(unchanged).key("unresolved").value(unresolved).endObject().endObject();
}
std::string json(const dft::sequential::ScenarioReport &r) {
    JsonWriter w; scenarioJson(w, r); return w.str();
}
using InventoryEntry = std::pair<std::optional<size_t>, dft::sequential::SourceInventory>;
void inventoryLimitsJson(JsonWriter &w, const dft::sequential::InventoryLimits &r) {
    w.beginObject().key("maxGroups").value(r.maxGroups).key("maxMembers").value(r.maxMembers);
    w.key("maxWork").value(r.maxWork).key("maxMillis").value(r.maxMillis).endObject();
}
template<class AnalysisWriter> void writeInventory(JsonWriter &w, const std::vector<InventoryEntry> &entries,
    bool analysisComplete, const dft::sequential::InventoryLimits &limits, AnalysisWriter analysis) {
    bool complete = analysisComplete;
    for (const auto &entry : entries) complete = complete && entry.second.complete;
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-control-inventory-v1");
    w.key("limits"); inventoryLimitsJson(w, limits);
    w.key("quality").beginObject().key("completeness").value(complete ? "complete" : "partial");
    w.key("reasons").beginArray();
    if (!analysisComplete) w.value("analysis_incomplete");
    if (std::any_of(entries.begin(), entries.end(), [](const auto &entry) { return !entry.second.complete; }))
        w.value("inventory_incomplete");
    w.endArray().endObject().key("analysis"); analysis(w);
    uint64_t groups = 0, members = 0, unresolved = 0;
    w.key("inventories").beginArray();
    for (const auto &[scenario, r] : entries) {
        w.beginObject().key("scenario"); index(w, scenario);
        w.key("snapshotId").value(r.snapshotId).key("scope").value(r.scope);
        w.key("quality").beginObject().key("completeness").value(r.complete ? "complete" : "partial").key("reasons");
        write(w, r.reasons); w.endObject();
        w.key("work").value(r.work).key("inputChecks").value(r.inputChecks).key("inputFacts").value(r.inputFacts);
        w.key("inputEvents").value(r.inputEvents).key("processedChecks").value(r.processedChecks);
        w.key("visitedEvents").value(r.visitedEvents).key("groups").beginArray();
        groups += r.groups.size(); unresolved += r.unresolved.size();
        for (const auto &group : r.groups) {
            w.beginObject().key("source"); sourceJson(w, group.source);
            w.key("checks").beginArray(); for (const auto check : group.checks) w.value(check);
            w.endArray().key("members").beginArray(); members += group.members.size();
            for (const auto &member : group.members) {
                w.beginObject().key("record").value(member.record).key("check").value(member.check);
                w.key("role").value(member.asyncIndex ? "async" : "clock").key("asyncIndex"); index(w, member.asyncIndex);
                w.endObject();
            }
            w.endArray().endObject();
        }
        w.endArray().key("unresolved").beginArray();
        for (const auto &item : r.unresolved) {
            w.beginObject().key("check").value(item.check).key("reasons"); write(w, item.reasons); w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("summary").beginObject().key("inventories").value(entries.size());
    w.key("groupEntries").value(groups).key("memberEntries").value(members).key("unresolvedChecks").value(unresolved);
    w.endObject().endObject();
}
template<class AnalysisWriter> std::string inventoryJson(const std::vector<InventoryEntry> &entries,
    bool complete, const dft::sequential::InventoryLimits &limits, AnalysisWriter analysis) {
    JsonWriter w; writeInventory(w, entries, complete, limits, analysis); return w.str();
}
struct GenerationEntry {
    std::optional<size_t> scenario;
    dft::sequential::ControlGeneration graph;
    bool rooted = false, conditional = false;
};
void generationLimitsJson(JsonWriter &w, const dft::sequential::GenerationLimits &r) {
    w.beginObject().key("maxControls").value(r.maxControls).key("maxGenerators").value(r.maxGenerators);
    w.key("maxRegisterFacts").value(r.maxRegisterFacts).key("maxWork").value(r.maxWork);
    w.key("maxDepth").value(r.maxDepth).key("maxCycles").value(r.maxCycles).key("maxMillis").value(r.maxMillis);
    w.key("maxTraceNodes").value(r.maxTraceNodes).key("maxTraceEdges").value(r.maxTraceEdges);
    w.key("maxLogicWork").value(r.maxLogicWork).endObject();
}
void writeGenerationGraph(JsonWriter &w,const dft::sequential::ControlGeneration &g,std::optional<size_t> scenario,bool rooted,bool conditional) {
        w.beginObject().key("scenario"); index(w, scenario);
        w.key("snapshotId").value(g.snapshotId).key("scope").value(g.scope);
        w.key("quality").beginObject().key("completeness").value(g.complete ? "complete" : "partial").key("reasons");
        write(w, g.reasons); w.endObject();
        w.key("inputChecks").value(g.inputChecks).key("work").value(g.work).key("registerFacts").value(g.registerFacts);
        w.key("traceNodes").value(g.traceNodes).key("traceEdges").value(g.traceEdges).key("logicWork").value(g.logicWork);
        w.key("seeds").beginArray();
        for (const auto &seed : g.seeds) w.beginObject().key("check").value(seed.check).key("node").value(seed.node).endObject();
        w.endArray().key("nodes").beginArray();
        for (const auto &node : g.nodes) {
            w.beginObject().key("point"); write(w, node.point);
            w.key("path").value(node.path).key("depth").value(node.depth).key("originalCheck"); index(w, node.originalCheck);
            w.key("generator"); index(w, node.generator);
            w.key("reasons"); write(w, node.reasons);
            if (node.source) { w.key("source"); sourceJson(w, *node.source); }
            if (node.control) { w.key("control"); controlJson(w, *node.control, rooted, conditional); }
            w.endObject();
        }
        w.endArray().key("generators").beginArray();
        for (const auto &generator : g.generators) {
            w.beginObject().key("fact"); write(w, generator.fact);
            w.key("instancePath").value(generator.instancePath).key("signalPath").value(generator.signalPath);
            w.key("lookup").beginObject().key("page").value(generator.page).key("item").value(generator.item).endObject();
            w.key("clockNode"); index(w, generator.clockNode);
            w.key("asyncNodes").beginArray(); for (const auto n : generator.asyncNodes) index(w, n);
            w.endArray().key("expanded").value(generator.expanded).endObject();
        }
        w.endArray().key("registerPages").beginArray();
        for (const auto &page : g.registerPages) {
            w.beginObject().key("instance").value(page.instance).key("cursor").value(page.cursor).key("response");
            write(w, page.response); w.endObject();
        }
        w.endArray().key("cycles").beginArray();
        for (const auto &cycle : g.cycles) {
            w.beginObject().key("generators").beginArray(); for (const auto id : cycle.generators) w.value(id);
            w.endArray().key("controls").beginArray(); for (const auto id : cycle.controls) w.value(id);
            w.endArray().endObject();
        }
        w.endArray().endObject();
}
template<class AnalysisWriter> void writeGeneration(JsonWriter &w, const std::vector<GenerationEntry> &entries,
    bool analysisComplete, const dft::sequential::GenerationLimits &limits, AnalysisWriter analysis) {
    const bool complete = analysisComplete && std::all_of(entries.begin(), entries.end(), [](const auto &e) { return e.graph.complete; });
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-control-generation-v1");
    w.key("limits"); generationLimitsJson(w, limits);
    w.key("quality").beginObject().key("completeness").value(complete ? "complete" : "partial").key("reasons").beginArray();
    if (!analysisComplete) w.value("analysis_incomplete");
    if (std::any_of(entries.begin(), entries.end(), [](const auto &e) { return !e.graph.complete; })) w.value("generation_incomplete");
    w.endArray().endObject().key("analysis"); analysis(w);
    uint64_t nodes = 0, generators = 0, cycles = 0;
    w.key("graphs").beginArray();
    for (const auto &entry : entries) {
        const auto &g = entry.graph;
        nodes += g.nodes.size(); generators += g.generators.size(); cycles += g.cycles.size();
        writeGenerationGraph(w,entry.graph,entry.scenario,entry.rooted,entry.conditional);
    }
    w.endArray().key("summary").beginObject().key("graphs").value(entries.size());
    w.key("nodeEntries").value(nodes).key("generatorEntries").value(generators).key("cycleEntries").value(cycles).endObject().endObject();
}template<class AnalysisWriter> std::string generationJson(const std::vector<GenerationEntry> &entries,
    bool complete, const dft::sequential::GenerationLimits &limits, AnalysisWriter analysis) {
    JsonWriter w; writeGeneration(w, entries, complete, limits, analysis); return w.str();
}

void generationComparisonLimitsJson(JsonWriter &w,const dft::sequential::GenerationComparisonLimits &l) {
    w.beginObject().key("maxCones").value(l.maxCones).key("maxMembers").value(l.maxMembers);
    w.key("maxRows").value(l.maxRows).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
}
template<class AnalysisWriter> void writeGenerationComparison(JsonWriter &w,const dft::sequential::GenerationComparisonReport &r,
    bool analysisComplete, AnalysisWriter analysis,bool includeAnalysis=true) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-generation-comparison-v1");
    w.key("snapshotId").value(r.snapshotId).key("scope").value(r.scope);
    w.key("limits");generationComparisonLimitsJson(w,r.limits);
    auto reasons = r.reasons;
    if (!analysisComplete && std::find(reasons.begin(), reasons.end(), "analysis_incomplete") == reasons.end()) reasons.push_back("analysis_incomplete");
    w.key("quality").beginObject().key("completeness").value(r.complete && analysisComplete ? "complete" : "partial");
    w.key("reasons"); write(w, reasons); w.endObject();
    w.key("inputCones").value(r.inputCones).key("processedCones").value(r.processedCones);
    w.key("memberEntries").value(r.memberEntries).key("work").value(r.work);
    if(includeAnalysis) {w.key("analysis");analysis(w);}
    w.key("contexts").beginArray();
    for (const auto &context : r.contexts) {
        w.beginObject().key("scenario").value(context.scenario).key("cones").beginArray();
        for (const auto &cone : context.cones) {
            w.beginObject().key("check").value(cone.check).key("node"); index(w, cone.node);
            w.key("quality").beginObject().key("completeness").value(cone.complete ? "complete" : "partial");
            w.key("reasons"); write(w, cone.reasons); w.endObject().key("nodes").beginArray();
            for (const auto n : cone.nodes) w.value(n);
            w.endArray().endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("comparisons").beginArray();
    uint64_t rows = 0, changed = 0, unchanged = 0, unresolved = 0;
    for (const auto &comparison : r.comparisons) {
        w.beginObject().key("baseline").value(comparison.baseline).key("scenario").value(comparison.scenario);
        w.key("reasons"); write(w, comparison.reasons); w.key("controls").beginArray();
        for (const auto &row : comparison.controls) {
            ++rows;
            if (row.status == "changed") ++changed;
            else if (row.status == "unchanged") ++unchanged;
            else ++unresolved;
            w.beginObject().key("point"); write(w, row.point);
            w.key("baselineCone"); index(w, row.baselineCone); w.key("scenarioCone"); index(w, row.scenarioCone);
            w.key("status").value(row.status).key("reasons"); write(w, row.reasons); w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("summary").beginObject().key("contexts").value(r.contexts.size());
    w.key("cones").value(r.processedCones).key("members").value(r.memberEntries).key("rows").value(rows);
    w.key("changed").value(changed).key("unchanged").value(unchanged).key("unresolved").value(unresolved).endObject().endObject();
 }
template<class AnalysisWriter> std::string generationComparisonJson(const dft::sequential::GenerationComparisonReport &r,
    bool complete,AnalysisWriter analysis) {JsonWriter w;writeGenerationComparison(w,r,complete,analysis);return w.str();}


void statisticsTotals(JsonWriter &w, const dft::sequential::StatisticsTotals &t) {
    w.beginObject().key("facts").value(t.facts).key("signals").value(t.signals).key("factBits").value(t.factBits);
    w.key("summarizedFacts").value(t.summarizedFacts).key("summarizedSignals").value(t.summarizedSignals);
    w.key("coveredBits").value(t.coveredBits).key("overlapBits").value(t.overlapBits).key("maxMultiplicity").value(t.maxMultiplicity).endObject();
}
void coverageJson(JsonWriter &w, const dft::sequential::RegisterCoverage &c) {
    w.beginObject().key("coveredBits").value(c.coveredBits).key("overlapBits").value(c.overlapBits);
    w.key("maxMultiplicity").value(c.maxMultiplicity).key("segments").beginArray();
    for (const auto &segment : c.segments) {
        w.beginObject().key("bits"); write(w, segment.bits); w.key("factCount").value(segment.factCount).endObject();
    }
    w.endArray().endObject();
}
void writeStatistics(JsonWriter &w, const dft::sequential::RegisterStatistics &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-statistics-v1");
    w.key("snapshot"); write(w, r.snapshot); w.key("scope").value(r.scope).key("recursive").value(r.request.recursive);
    w.key("limits").beginObject().key("maxFacts").value(r.request.maxFacts).key("maxInstances").value(r.request.maxInstances);
    w.key("maxSignals").value(r.request.maxSignals).key("maxSegments").value(r.request.maxSegments);
    w.key("maxWork").value(r.request.maxWork).key("maxMillis").value(r.request.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete ? "complete" : "partial").key("reasons");
    write(w, r.reasons); w.endObject();
    w.key("returnedFacts").value(r.returnedFacts).key("work").value(r.work).key("segmentCount").value(r.segmentCount);
    w.key("totals"); statisticsTotals(w, r.totals);
    w.key("pages").beginArray();
    for (const auto &p : r.pages) {
        w.beginObject().key("instance").value(p.instance).key("cursor").value(p.cursor).key("response");
        write(w, p.response); w.endObject();
    }
    w.endArray().key("facts").beginArray();
    for (const auto &f : r.facts) w.beginObject().key("page").value(f.page).key("item").value(f.item).key("signal").value(f.signal).endObject();
    w.endArray().key("signals").beginArray();
    for (const auto &s : r.signals) {
        w.beginObject().key("object"); write(w, s.object); w.key("instance").value(s.instance).key("facts").beginArray();
        for (const auto f : s.facts) w.value(f);
        w.endArray();
        if (s.coverage) { w.key("coverage"); coverageJson(w, *s.coverage); }
        w.endObject();
    }
    w.endArray().key("instances").beginArray();
    for (const auto &i : r.instances) {
        w.beginObject().key("info"); write(w, i.info); w.key("definition").value(i.definition).key("enumerated").value(i.enumerated);
        w.key("totals"); statisticsTotals(w, i.totals); w.endObject();
    }
    w.endArray().key("definitions").beginArray();
    for (const auto &d : r.definitions) {
        w.beginObject().key("ref").value(d.ref).key("name").value(d.name).key("instances").beginArray();
        for (const auto i : d.instances) w.value(i);
        w.endArray().key("totals"); statisticsTotals(w, d.totals); w.endObject();
    }
    w.endArray().endObject();
}
std::string statisticsJson(const dft::sequential::RegisterStatistics &r) {
    JsonWriter w; writeStatistics(w, r); return w.str();
}

void writeEventGroups(JsonWriter &w, const dft::sequential::RegisterStatistics &statistics, const dft::sequential::RegisterEventGroups &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-event-groups-v1");
    w.key("snapshotId").value(r.snapshotId).key("scope").value(r.scope);
    w.key("limits").beginObject().key("maxGroups").value(r.limits.maxGroups).key("maxMembers").value(r.limits.maxMembers);
    w.key("maxSegments").value(r.limits.maxSegments).key("maxOverlapMembers").value(r.limits.maxOverlapMembers);
    w.key("maxWork").value(r.limits.maxWork).key("maxMillis").value(r.limits.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete ? "complete" : "partial").key("reasons");
    write(w, r.reasons); w.endObject();
    w.key("inputFacts").value(r.inputFacts).key("inputSignals").value(r.inputSignals).key("processedFacts").value(r.processedFacts);
    w.key("work").value(r.work).key("segmentCount").value(r.segmentCount).key("overlapMembers").value(r.overlapMembers);
    w.key("checkedSignals").value(r.checkedSignals).key("crossGroupBits").value(r.crossGroupBits).key("analysis"); writeStatistics(w, statistics);
    w.key("groups").beginArray();
    uint64_t unresolved = 0, covered = 0, summarized = 0;
    for (const auto &g : r.groups) {
        unresolved += !g.identityComplete; covered = dft::sequential::detail::checkedCountAdd(covered, g.totals.coveredBits);
        summarized += g.totals.summarizedSignals;
        w.beginObject().key("clock"); write(w, g.clock); w.key("async").beginArray();
        for (const auto &event : g.async) write(w, event);
        w.endArray().key("identityComplete").value(g.identityComplete).key("signals").beginArray();
        for (const auto i : g.signals) w.value(i);
        w.endArray().key("totals"); statisticsTotals(w, g.totals); w.endObject();
    }
    w.endArray().key("signals").beginArray();
    for (const auto &s : r.signals) {
        w.beginObject().key("signal").value(s.signal).key("group").value(s.group).key("facts").beginArray();
        for (const auto i : s.facts) w.value(i);
        w.endArray();
        if (s.coverage) { w.key("coverage"); coverageJson(w, *s.coverage); }
        w.endObject();
    }
    w.endArray().key("attributions").beginArray();
    for (const auto &a : r.attributions) {
        w.beginObject().key("signal").value(a.signal).key("groups").beginArray(); for (const auto g : a.groups) w.value(g);
        w.endArray().key("crossGroupBits").value(a.crossGroupBits).key("segments").beginArray();
        for (const auto &segment : a.segments) {
            w.beginObject().key("bits"); write(w, segment.bits); w.key("groups").beginArray();
            for (const auto g : segment.groups) w.value(g);
            w.endArray().endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("summary").beginObject().key("groups").value(r.groups.size()).key("unresolvedGroups").value(unresolved);
    w.key("members").value(r.processedFacts).key("groupSignals").value(r.signals.size()).key("summarizedGroupSignals").value(summarized);
    w.key("groupCoveredBits").value(covered).key("crossGroupBits").value(r.crossGroupBits).key("checkedSignals").value(r.checkedSignals);
    w.key("attributions").value(r.attributions.size()).endObject().endObject();
}
std::string eventGroupsJson(const dft::sequential::RegisterStatistics &statistics, const dft::sequential::RegisterEventGroups &r) {
    JsonWriter w; writeEventGroups(w, statistics, r); return w.str();
}

void profileOptionsJson(JsonWriter &w,const dft::sequential::RegisterControlOptions &o) {
    w.beginObject().key("resolveLogic").value(o.resolveLogic);
    w.key("maxChecks").value(o.maxChecks).key("maxTraceNodes").value(o.maxTraceNodes).key("maxTraceEdges").value(o.maxTraceEdges);
    w.key("maxDepth").value(o.maxDepth).key("maxLogicWork").value(o.maxLogicWork).key("maxMillis").value(o.maxMillis);
    w.key("maxWork").value(o.maxWork).key("maxMembers").value(o.maxMembers).key("maxSegments").value(o.maxSegments);
    w.key("clockRootsRequested").beginArray();
    for (const auto &root : o.clockRoots) w.beginObject().key("path").value(root.path).key("bit").value(root.bit).endObject();
    w.endArray().key("inputValuesRequested").beginArray();
    for (const auto &v : o.inputValues) w.beginObject().key("path").value(v.input.path).key("bit").value(v.input.bit).key("high").value(v.high).endObject();
    w.endArray().endObject();
}
void writeProfile(JsonWriter &w, const dft::sequential::RegisterStatistics &statistics, const dft::sequential::RegisterControlProfile &r, bool includeAnalysis = true) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-control-profile-v1");
    w.key("snapshotId").value(r.snapshotId).key("scope").value(r.scope);
    w.key("options"); profileOptionsJson(w,r.options);w.key("clockRoots").beginArray();
    for (const auto &root : r.clockRoots) { w.beginObject().key("point"); write(w, root.point); w.key("path").value(root.path).endObject(); }
    w.endArray().key("inputValues").beginArray();
    for (const auto &v : r.inputValues) { w.beginObject().key("point"); write(w, v.input.point); w.key("path").value(v.input.path).key("high").value(v.high).endObject(); }
    w.endArray().key("quality").beginObject().key("completeness").value(r.complete ? "complete" : "partial").key("reasons");
    write(w, r.reasons); w.endObject();
    if (includeAnalysis) { w.key("analysis"); writeEventGroups(w, statistics, r.events); }
    w.key("processedGroups").value(r.processedGroups).key("visitedEvents").value(r.visitedEvents).key("attributedFacts").value(r.attributedFacts);
    w.key("traceNodes").value(r.traceNodes).key("traceEdges").value(r.traceEdges).key("logicWork").value(r.logicWork);
    w.key("work").value(r.work).key("segmentCount").value(r.segmentCount).key("checks").beginArray();
    for (const auto &c : r.checks) {
        w.beginObject().key("control"); controlJson(w, c.control, !r.clockRoots.empty(), !r.inputValues.empty());
        if (c.source) { w.key("source"); sourceJson(w, *c.source); }
        w.endObject();
    }
    w.endArray().key("groupControls").beginArray();
    for (const auto &row : r.groupControls) {
        w.beginObject().key("group").value(row.group).key("clockCheck"); index(w, row.clockCheck); w.key("asyncChecks").beginArray();
        for (const auto c : row.asyncChecks) index(w, c);
        w.endArray().key("eventsComplete").value(row.eventsComplete).key("cohort"); index(w, row.cohort); w.endObject();
    }
    uint64_t covered = 0, unresolved = 0, summarized = 0;
    for (const auto &c : r.checks) unresolved += !c.source;
    w.endArray().key("cohorts").beginArray();
    for (const auto &c : r.cohorts) {
        covered = dft::sequential::detail::checkedCountAdd(covered, c.totals.coveredBits); summarized += c.totals.summarizedSignals;
        w.beginObject().key("source"); sourceJson(w, c.source); w.key("edge").value(c.edge).key("groups").beginArray();
        for (const auto g : c.groups) w.value(g);
        w.endArray().key("signals").beginArray(); for (const auto s : c.signals) w.value(s);
        w.endArray().key("totals"); statisticsTotals(w, c.totals); w.endObject();
    }
    w.endArray().key("signals").beginArray();
    for (const auto &s : r.signals) {
        w.beginObject().key("cohort").value(s.cohort).key("signal").value(s.signal).key("facts").beginArray();
        for (const auto f : s.facts) w.value(f);
        w.endArray();
        if (s.coverage) { w.key("coverage"); coverageJson(w, *s.coverage); }
        w.endObject();
    }
    w.endArray().key("summary").beginObject().key("inputGroups").value(r.events.groups.size()).key("processedGroups").value(r.processedGroups);
    w.key("checks").value(r.checks.size()).key("unresolvedChecks").value(unresolved).key("cohorts").value(r.cohorts.size());
    w.key("attributedFacts").value(r.attributedFacts).key("cohortSignals").value(r.signals.size());
    w.key("summarizedCohortSignals").value(summarized).key("cohortCoveredBits").value(covered).endObject().endObject();
}
std::string profileJson(const dft::sequential::RegisterStatistics &statistics, const dft::sequential::RegisterControlProfile &r) {
    JsonWriter w; writeProfile(w, statistics, r); return w.str();
}

void resolvedLimitsJson(JsonWriter &w,const dft::sequential::ResolvedEventLimits &l) {
    w.beginObject();
    w.key("maxRows").value(l.maxRows).key("maxGroups").value(l.maxGroups).key("maxMembers").value(l.maxMembers);
    w.key("maxSegments").value(l.maxSegments).key("maxOverlapMembers").value(l.maxOverlapMembers);
    w.key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
}
void writeResolved(JsonWriter &w, const dft::sequential::RegisterStatistics &statistics, const dft::sequential::RegisterControlProfile &profile,
    const dft::sequential::RegisterResolvedEvents &r, bool includeAnalysis = true) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-resolved-events-v1");
    w.key("snapshotId").value(r.snapshotId).key("scope").value(r.scope).key("limits");
    resolvedLimitsJson(w,r.limits);
    w.key("quality").beginObject().key("completeness").value(r.complete ? "complete" : "partial").key("reasons");
    write(w,r.reasons);w.endObject();
    if (includeAnalysis) { w.key("analysis");writeProfile(w,statistics,profile); }
    w.key("inputRawGroups").value(r.inputRawGroups).key("inputFacts").value(r.inputFacts).key("processedRawGroups").value(r.processedRawGroups);
    w.key("resolvedRows").value(r.resolvedRows).key("visitedEvents").value(r.visitedEvents).key("assignedFacts").value(r.assignedFacts);
    w.key("work").value(r.work).key("segmentCount").value(r.segmentCount).key("checkedSignals").value(r.checkedSignals);
    w.key("crossGroupBits").value(r.crossGroupBits).key("overlapMembers").value(r.overlapMembers).key("rows").beginArray();
    for (const auto &row:r.rows) {
        w.beginObject().key("rawGroup").value(row.rawGroup).key("resolvedGroup");index(w,row.resolvedGroup);
        w.key("membersComplete").value(row.membersComplete).key("reasons");write(w,row.reasons);w.endObject();
    }
    uint64_t covered=0,summarized=0;
    const auto event=[&](const dft::sequential::ResolvedControlEvent &e,bool clock) {
        w.beginObject().key("source");sourceJson(w,e.source);w.key("edge").value(e.edge);
        if (!clock) w.key("type").value(e.type);
        w.endObject();
    };
    w.endArray().key("groups").beginArray();
    for (const auto &g:r.groups) {
        covered=dft::sequential::detail::checkedCountAdd(covered,g.totals.coveredBits);summarized+=g.totals.summarizedSignals;
        w.beginObject().key("clock");event(g.clock,true);w.key("async").beginArray();for (const auto &a:g.async) event(a,false);
        w.endArray().key("rawGroups").beginArray();for (const auto i:g.rawGroups) w.value(i);
        w.endArray().key("signals").beginArray();for (const auto i:g.signals) w.value(i);
        w.endArray().key("totals");statisticsTotals(w,g.totals);w.endObject();
    }
    w.endArray().key("signals").beginArray();
    for (const auto &s:r.signals) {
        w.beginObject().key("signal").value(s.signal).key("group").value(s.group).key("facts").beginArray();
        for (const auto i:s.facts) w.value(i);
        w.endArray();if (s.coverage) {w.key("coverage");coverageJson(w,*s.coverage);}w.endObject();
    }
    w.endArray().key("attributions").beginArray();
    for (const auto &a:r.attributions) {
        w.beginObject().key("signal").value(a.signal).key("groups").beginArray();for (const auto i:a.groups) w.value(i);
        w.endArray().key("crossGroupBits").value(a.crossGroupBits).key("segments").beginArray();
        for (const auto &segment:a.segments) {
            w.beginObject().key("bits");write(w,segment.bits);w.key("groups").beginArray();for (const auto i:segment.groups) w.value(i);
            w.endArray().endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("summary").beginObject().key("inputRawGroups").value(r.inputRawGroups).key("processedRawGroups").value(r.processedRawGroups);
    w.key("resolvedRows").value(r.resolvedRows).key("unresolvedRows").value(r.processedRawGroups-r.resolvedRows).key("groups").value(r.groups.size());
    w.key("assignedFacts").value(r.assignedFacts).key("groupSignals").value(r.signals.size()).key("summarizedGroupSignals").value(summarized);
    w.key("groupCoveredBits").value(covered).key("checkedSignals").value(r.checkedSignals).key("crossGroupBits").value(r.crossGroupBits).endObject().endObject();
}
std::string resolvedJson(const dft::sequential::RegisterStatistics &statistics, const dft::sequential::RegisterControlProfile &profile,
    const dft::sequential::RegisterResolvedEvents &r) {
    JsonWriter w; writeResolved(w,statistics,profile,r); return w.str();
}

void writeRegisterScenarios(JsonWriter &w,const dft::sequential::RegisterStatistics &statistics,const dft::sequential::RegisterScenarioReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-scenarios-v1");
    w.key("snapshotId").value(r.snapshotId).key("scope").value(r.scope).key("commonOptions");profileOptionsJson(w,r.request.common);
    w.key("resolvedLimits");resolvedLimitsJson(w,r.request.resolved);
    w.key("limits").beginObject().key("maxScenarios").value(8).key("maxMillis").value(r.request.maxMillis);
    w.key("maxComparisons").value(r.request.maxComparisons).key("maxWork").value(r.request.maxWork);
    w.key("maxMembers").value(r.request.maxMembers).key("maxSegments").value(r.request.maxSegments).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("analysis");writeEventGroups(w,statistics,r.events);
    w.key("work").value(r.work).key("comparisonRows").value(r.comparisonRows).key("memberFacts").value(r.memberFacts).key("segmentCount").value(r.segmentCount);
    w.key("scenarios").beginArray();uint64_t profiled=0,resolved=0,notRun=0;
    for (const auto &context:r.scenarios) {
        w.beginObject().key("name").value(context.name).key("inputValuesRequested").beginArray();
        for (const auto &v:context.inputValuesRequested) w.beginObject().key("path").value(v.input.path).key("bit").value(v.input.bit).key("high").value(v.high).endObject();
        const auto status=!context.profile?"not_run":!context.resolved?"profile_only":context.profile->complete&&context.resolved->complete?"complete":"partial";
        w.endArray().key("status").value(status).key("reasons");write(w,context.reasons);
        if (context.profile) {++profiled;w.key("profile");writeProfile(w,statistics,*context.profile,false);} else ++notRun;
        if (context.resolved) {++resolved;w.key("resolved");writeResolved(w,statistics,*context.profile,*context.resolved,false);}
        w.endObject();
    }
    uint64_t changed=0,unchanged=0,unresolved=0;
    w.endArray().key("comparisons").beginArray();
    for (const auto &c:r.comparisons) {
        w.beginObject().key("baseline").value(c.baseline).key("scenario").value(c.scenario).key("inputGroups").value(c.inputGroups);
        w.key("processedGroups").value(c.rows.size()).key("quality").beginObject().key("completeness").value(c.complete?"complete":"partial").key("reasons");
        write(w,c.reasons);w.endObject().key("rows").beginArray();
        for (const auto &row:c.rows) {
            if (row.status=="changed") ++changed;else if (row.status=="unchanged") ++unchanged;else ++unresolved;
            w.beginObject().key("rawGroup").value(row.rawGroup).key("baselineGroup");index(w,row.baselineGroup);w.key("scenarioGroup");index(w,row.scenarioGroup);
            w.key("status").value(row.status).key("reasons");write(w,row.reasons);w.endObject();
        }
        w.endArray().key("changedSignals").beginArray();
        for (const auto &s:c.changedSignals) {
            w.beginObject().key("signal").value(s.signal).key("facts").beginArray();for (const auto f:s.facts) w.value(f);
            w.endArray();if (s.coverage) {w.key("coverage");coverageJson(w,*s.coverage);}w.endObject();
        }
        w.endArray().key("changedTotals");statisticsTotals(w,c.changedTotals);w.endObject();
    }
    w.endArray().key("summary").beginObject().key("scenarios").value(r.scenarios.size()).key("profiled").value(profiled).key("resolved").value(resolved);
    w.key("notRun").value(notRun).key("comparisons").value(r.comparisons.size()).key("rows").value(r.comparisonRows);
    w.key("changed").value(changed).key("unchanged").value(unchanged).key("unresolved").value(unresolved).endObject().endObject();
}

std::string registerScenariosJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterScenarioReport &r) {JsonWriter w;writeRegisterScenarios(w,s,r);return w.str();}

void registerGenerationLimitsJson(JsonWriter &w,const dft::sequential::RegisterGenerationLimits &l) {
    w.beginObject().key("generation");generationLimitsJson(w,l.generation);
    w.key("maxEvents").value(l.maxEvents).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
}
void writeRegisterGeneration(JsonWriter &w,const dft::sequential::RegisterStatistics &statistics,const dft::sequential::RegisterControlProfile &profile,
    const dft::sequential::RegisterGeneration &r,bool includeAnalysis=true) {w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-control-generation-v1");
    w.key("limits");registerGenerationLimitsJson(w,r.limits);
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    if(includeAnalysis) {w.key("analysis");writeProfile(w,statistics,profile);}w.key("graph");
    writeGenerationGraph(w,r.graph,{},!profile.clockRoots.empty(),!profile.inputValues.empty());
    w.key("mappingComplete").value(r.mappingComplete).key("inputEvents").value(r.inputEvents).key("work").value(r.work);
    w.key("events").beginArray();uint64_t mapped=0;
    for (const auto &row:r.events) {
        mapped+=bool(row.node);w.beginObject().key("rawGroup").value(row.rawGroup).key("role").value(row.asyncIndex?"async":"clock");
        w.key("asyncIndex");index(w,row.asyncIndex);w.key("check");index(w,row.check);w.key("node");index(w,row.node);
        w.key("reasons");write(w,row.reasons);w.endObject();
    }
    w.endArray().key("summary").beginObject().key("inputEvents").value(r.inputEvents).key("eventRows").value(r.events.size());
    w.key("mappedEvents").value(mapped).key("unmappedEvents").value(r.events.size()-mapped).key("nodes").value(r.graph.nodes.size());
    w.key("generators").value(r.graph.generators.size()).key("cycles").value(r.graph.cycles.size()).endObject().endObject();
}

std::string registerGenerationJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterControlProfile &p,const dft::sequential::RegisterGeneration &r) {JsonWriter w;writeRegisterGeneration(w,s,p,r);return w.str();}

void registerGenerationScenarioLimitsJson(JsonWriter &w,const dft::sequential::RegisterGenerationScenarioLimits &l) {
    w.beginObject().key("generation");registerGenerationLimitsJson(w,l.generation);
    w.key("comparison");generationComparisonLimitsJson(w,l.comparison);
    w.key("maxMillis").value(l.maxMillis).key("maxRows").value(l.maxRows).key("maxEvents").value(l.maxEvents);
    w.key("maxWork").value(l.maxWork).key("maxMembers").value(l.maxMembers).key("maxSegments").value(l.maxSegments).endObject();
}

void writeRegisterGenerationScenarios(JsonWriter &w,const dft::sequential::RegisterStatistics &statistics,const dft::sequential::RegisterGenerationScenarioReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-generation-scenarios-v1");
    w.key("limits");registerGenerationScenarioLimitsJson(w,r.limits);
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("analysis");writeRegisterScenarios(w,statistics,r.analysis);w.key("scenarios").beginArray();uint64_t notRun=0;
    for(size_t i=0;i<r.scenarios.size();++i) {
        const auto &v=r.scenarios[i];w.beginObject().key("scenario").value(i).key("name").value(r.analysis.scenarios[i].name);
        w.key("status").value(!v.generation?"not_run":v.generation->complete?"complete":"partial").key("reasons");write(w,v.reasons);
        if(v.generation) {w.key("generation");writeRegisterGeneration(w,statistics,*r.analysis.scenarios[i].profile,*v.generation,false);} else ++notRun;
        w.endObject();
    }
    w.endArray().key("structure");writeGenerationComparison(w,r.structure,r.analysis.complete,[](JsonWriter &) {},false);
    w.key("rows").value(r.rows).key("eventEntries").value(r.eventEntries).key("work").value(r.work);
    w.key("memberFacts").value(r.memberFacts).key("segmentCount").value(r.segmentCount).key("impacts").beginArray();
    uint64_t changed=0,unchanged=0,unresolved=0;
    for(const auto &c:r.impacts) {
        w.beginObject().key("baseline").value(c.baseline).key("scenario").value(c.scenario).key("inputGroups").value(c.inputGroups);
        w.key("quality").beginObject().key("completeness").value(c.complete?"complete":"partial").key("reasons");write(w,c.reasons);w.endObject();
        w.key("rows").beginArray();
        for(const auto &row:c.rows) {
            if(row.status=="changed") ++changed;else if(row.status=="unchanged") ++unchanged;else ++unresolved;
            w.beginObject().key("rawGroup").value(row.rawGroup).key("status").value(row.status).key("events").beginArray();
            for(const auto i:row.events) index(w,i);
            w.endArray().key("reasons");write(w,row.reasons);w.endObject();
        }
        w.endArray().key("changedSignals").beginArray();
        for(const auto &v:c.changedSignals) {
            w.beginObject().key("signal").value(v.signal).key("facts").beginArray();for(const auto f:v.facts) w.value(f);
            w.endArray();if(v.coverage) {w.key("coverage");coverageJson(w,*v.coverage);}w.endObject();
        }
        w.endArray().key("changedTotals");statisticsTotals(w,c.changedTotals);w.endObject();
    }
    w.endArray().key("summary").beginObject().key("scenarios").value(r.scenarios.size()).key("notRun").value(notRun);
    w.key("comparisons").value(r.impacts.size()).key("rows").value(r.rows).key("changed").value(changed);
    w.key("unchanged").value(unchanged).key("unresolved").value(unresolved).endObject().endObject();
}

std::string registerGenerationScenariosJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterGenerationScenarioReport &r) {
    JsonWriter w;writeRegisterGenerationScenarios(w,s,r);return w.str();
}

void writeRegisterFanout(JsonWriter &w,const dft::sequential::RegisterStatistics &statistics,const dft::sequential::RegisterControlProfile &profile,
    const dft::sequential::RegisterGeneration &generation,const dft::sequential::RegisterFanout &r,bool includeAnalysis=true) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-control-fanout-v1");
    w.key("snapshotId").value(r.snapshotId).key("scope").value(r.scope).key("limits").beginObject();
    const auto &l=r.limits;w.key("maxOrigins").value(l.maxOrigins).key("maxSeeds").value(l.maxSeeds).key("maxNodes").value(l.maxNodes).key("maxLinks").value(l.maxLinks);
    w.key("maxMembers").value(l.maxMembers).key("maxSegments").value(l.maxSegments).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    if(includeAnalysis) {w.key("analysis");writeRegisterGeneration(w,statistics,profile,generation);}
    w.key("inputOrigins").value(r.inputOrigins).key("inputSeeds").value(r.inputSeeds).key("inputNodes").value(r.inputNodes).key("relevantSeeds").value(r.relevantSeeds);
    w.key("work").value(r.work).key("links").value(r.links).key("memberFacts").value(r.memberFacts).key("segmentCount").value(r.segmentCount);
    w.key("origins").beginArray();uint64_t unassigned=0,partialSeeds=0,partialNodes=0,nodeSignals=0,summarized=0;
    for(const auto &o:r.origins) {unassigned+=!o.seed;w.beginObject().key("event").value(o.event).key("seed");index(w,o.seed);w.endObject();}
    w.endArray().key("seeds").beginArray();
    for(const auto &seed:r.seeds) {
        partialSeeds+=!seed.traversalComplete;w.beginObject().key("check").value(seed.check).key("node").value(seed.node);
        w.key("traversalComplete").value(seed.traversalComplete).key("reasons");write(w,seed.reasons);w.key("origins").beginArray();for(const auto o:seed.origins) w.value(o);
        w.endArray().key("steps").beginArray();
        for(const auto &step:seed.steps) {
            w.beginObject().key("node").value(step.node).key("parent");index(w,step.parent);w.key("generator");index(w,step.generator);
            w.key("asyncIndex");index(w,step.asyncIndex);w.key("role").value(!step.parent?"root":step.asyncIndex?"async":"clock").endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("nodes").beginArray();
    for(const auto &node:r.nodes) {
        partialNodes+=!node.membersComplete;nodeSignals+=node.signals.size();summarized+=node.totals.summarizedSignals;
        w.beginObject().key("node").value(node.node).key("membersComplete").value(node.membersComplete).key("reasons");write(w,node.reasons);
        w.key("reaches").beginArray();for(const auto &reach:node.reaches) w.beginObject().key("seed").value(reach.seed).key("step").value(reach.step).endObject();
        w.endArray().key("rawGroups").beginArray();for(const auto g:node.rawGroups) w.value(g);
        w.endArray().key("signals").beginArray();
        for(const auto &signal:node.signals) {
            w.beginObject().key("signal").value(signal.signal).key("facts").beginArray();for(const auto f:signal.facts) w.value(f);
            w.endArray();if(signal.coverage) {w.key("coverage");coverageJson(w,*signal.coverage);}w.endObject();
        }
        w.endArray().key("totals");statisticsTotals(w,node.totals);w.endObject();
    }
    w.endArray().key("summary").beginObject().key("origins").value(r.origins.size()).key("unassignedOrigins").value(unassigned);
    w.key("seeds").value(r.seeds.size()).key("partialSeeds").value(partialSeeds).key("nodes").value(r.nodes.size()).key("partialNodes").value(partialNodes);
    w.key("links").value(r.links).key("nodeSignals").value(nodeSignals).key("summarizedNodeSignals").value(summarized).endObject().endObject();
}

std::string registerFanoutJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterControlProfile &p,
    const dft::sequential::RegisterGeneration &g,const dft::sequential::RegisterFanout &r) {
    JsonWriter w;writeRegisterFanout(w,s,p,g,r);return w.str();
}

void writeRegisterSources(JsonWriter &w,const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterControlProfile &p,
    const dft::sequential::RegisterGeneration &g,const dft::sequential::RegisterControlSources &r,bool includeAnalysis=true) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-control-sources-v1");
    w.key("snapshotId").value(r.snapshotId).key("scope").value(r.scope).key("limits").beginObject();const auto &l=r.limits;
    w.key("maxRows").value(l.maxRows).key("maxSources").value(l.maxSources).key("maxMembers").value(l.maxMembers).key("maxSegments").value(l.maxSegments);
    w.key("maxOverlapMembers").value(l.maxOverlapMembers).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    if(includeAnalysis) {w.key("analysis");writeRegisterFanout(w,s,p,g,r.fanout);}
    w.key("inputNodes").value(r.inputNodes).key("work").value(r.work).key("memberFacts").value(r.memberFacts).key("segmentCount").value(r.segmentCount);
    w.key("overlapMembers").value(r.overlapMembers).key("attributionSignals").value(r.attributionSignals).key("checkedSignals").value(r.checkedSignals);
    w.key("crossGroupBits").value(r.crossGroupBits).key("attributionsComplete").value(r.attributionsComplete).key("rows").beginArray();
    uint64_t terminal=0,generated=0,unknown=0,incomplete=0,signals=0,summarized=0;
    for(const auto &row:r.rows) {
        terminal+=bool(row.group);generated+=row.kind=="generated";unknown+=row.kind=="unresolved";
        w.beginObject().key("node").value(row.node).key("kind").value(row.kind).key("group");index(w,row.group);w.endObject();
    }
    w.endArray().key("groups").beginArray();
    for(const auto &group:r.groups) {
        incomplete+=!group.membersComplete;signals+=group.signals.size();summarized+=group.totals.summarizedSignals;
        w.beginObject().key("source");sourceJson(w,group.source);w.key("nodes").beginArray();for(const auto n:group.nodes) w.value(n);
        w.endArray().key("rawGroups").beginArray();for(const auto n:group.rawGroups) w.value(n);w.endArray();
        w.key("membersComplete").value(group.membersComplete).key("reasons");write(w,group.reasons);w.key("signals").beginArray();
        for(const auto &signal:group.signals) {
            w.beginObject().key("signal").value(signal.signal).key("facts").beginArray();for(const auto f:signal.facts) w.value(f);
            w.endArray();if(signal.coverage) {w.key("coverage");coverageJson(w,*signal.coverage);}w.endObject();
        }
        w.endArray().key("totals");statisticsTotals(w,group.totals);w.endObject();
    }
    w.endArray().key("attributions").beginArray();
    for(const auto &a:r.attributions) {
        w.beginObject().key("signal").value(a.signal).key("groups").beginArray();for(const auto n:a.groups) w.value(n);
        w.endArray().key("crossGroupBits").value(a.crossGroupBits).key("segments").beginArray();
        for(const auto &v:a.segments) {
            w.beginObject().key("bits");write(w,v.bits);w.key("groups").beginArray();for(const auto n:v.groups) w.value(n);w.endArray().endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().key("summary").beginObject().key("rows").value(r.rows.size()).key("terminalNodes").value(terminal);
    w.key("generatedNodes").value(generated).key("unresolvedNodes").value(unknown).key("sources").value(r.groups.size());
    w.key("partialSources").value(incomplete).key("sourceSignals").value(signals).key("summarizedSourceSignals").value(summarized);
    w.key("attributions").value(r.attributions.size()).endObject().endObject();
}

std::string registerSourcesJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterControlProfile &p,
    const dft::sequential::RegisterGeneration &g,const dft::sequential::RegisterControlSources &r) {
    JsonWriter w;writeRegisterSources(w,s,p,g,r);return w.str();
}

void registerSourceScenarioLimitsJson(JsonWriter &w,const dft::sequential::RegisterSourceScenarioLimits &l) {
    w.beginObject().key("generation");registerGenerationScenarioLimitsJson(w,l.generation);
    w.key("sources").beginObject().key("maxRows").value(l.sources.maxRows).key("maxSources").value(l.sources.maxSources);
    w.key("maxMembers").value(l.sources.maxMembers).key("maxSegments").value(l.sources.maxSegments).key("maxOverlapMembers").value(l.sources.maxOverlapMembers);
    w.key("maxWork").value(l.sources.maxWork).key("maxMillis").value(l.sources.maxMillis).endObject();
    const auto &f=l.sources.fanout;w.key("fanout").beginObject().key("maxOrigins").value(f.maxOrigins).key("maxSeeds").value(f.maxSeeds);
    w.key("maxNodes").value(f.maxNodes).key("maxLinks").value(f.maxLinks).key("maxMembers").value(f.maxMembers).key("maxSegments").value(f.maxSegments);
    w.key("maxWork").value(f.maxWork).key("maxMillis").value(f.maxMillis).endObject();
    w.key("maxRows").value(l.maxRows).key("maxCells").value(l.maxCells).key("maxIntervals").value(l.maxIntervals).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
}

void writeRegisterSourceScenarios(JsonWriter &w,const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceScenarioReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-source-scenarios-v1");
    w.key("limits");registerSourceScenarioLimitsJson(w,r.limits);
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("analysis");writeRegisterGenerationScenarios(w,s,r.analysis);
    w.key("scenarios").beginArray();uint64_t notRun=0,changed=0,unchanged=0,unresolved=0;
    for(size_t i=0;i<r.scenarios.size();++i) {
        const auto &v=r.scenarios[i];w.beginObject().key("scenario").value(i).key("name").value(r.analysis.analysis.scenarios[i].name);
        w.key("status").value(!v.sources?"not_run":v.sources->complete?"complete":"partial").key("reasons");write(w,v.reasons);
        if(v.sources) {
            const auto &p=*r.analysis.analysis.scenarios[i].profile;const auto &g=*r.analysis.scenarios[i].generation;
            w.key("sources");writeRegisterSources(w,s,p,g,*v.sources,false);w.key("fanout");writeRegisterFanout(w,s,p,g,v.sources->fanout,false);
        } else ++notRun;
        w.endObject();
    }
    w.endArray().key("indexComplete").value(r.indexComplete).key("inputSources").value(r.inputSources).key("indexedGroups").value(r.indexedGroups);
    w.key("work").value(r.work).key("cells").value(r.cells).key("intervals").value(r.intervals).key("rows").beginArray();
    for(const auto &row:r.rows) {
        w.beginObject().key("source");sourceJson(w,row.source);w.key("groups").beginArray();for(const auto g:row.groups) index(w,g);
        w.endArray().key("status").beginArray();for(const auto &status:row.status) {
            changed+=status=="changed";unchanged+=status=="unchanged";unresolved+=status=="unresolved";w.value(status);
        }
        w.endArray().endObject();
    }
    w.endArray().key("summary").beginObject().key("scenarios").value(r.scenarios.size()).key("notRun").value(notRun).key("rows").value(r.rows.size());
    w.key("comparisons").value(changed+unchanged+unresolved).key("changed").value(changed).key("unchanged").value(unchanged).key("unresolved").value(unresolved).endObject().endObject();
}

std::string registerSourceScenariosJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceScenarioReport &r) {
    JsonWriter w;writeRegisterSourceScenarios(w,s,r);return w.str();
}

void sourceDeltaCountsJson(JsonWriter &w,const dft::sequential::SourceDeltaCounts &v) {
    w.beginObject().key("baselineBits").value(v.baselineBits).key("scenarioBits").value(v.scenarioBits);
    w.key("addedBits").value(v.addedBits).key("removedBits").value(v.removedBits).key("retainedBits").value(v.retainedBits).endObject();
}
void writeSourceDeltas(JsonWriter &w,const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceDeltaReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-source-deltas-v1");
    const auto &l=r.limits;w.key("limits").beginObject().key("scenarios");registerSourceScenarioLimitsJson(w,l.scenarios);
    w.key("maxRows").value(l.maxRows).key("maxSignals").value(l.maxSignals).key("maxRanges").value(l.maxRanges).key("maxIntervals").value(l.maxIntervals);
    w.key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("analysis");writeRegisterSourceScenarios(w,s,r.analysis);
    w.key("inputRows").value(r.inputRows).key("inputComparisons").value(r.inputComparisons).key("work").value(r.work);
    w.key("signals").value(r.signals).key("ranges").value(r.ranges).key("intervals").value(r.intervals).key("rows").beginArray();uint64_t changed=0,unchanged=0,unresolved=0;
    for(const auto &row:r.rows) {
        changed+=row.status=="changed";unchanged+=row.status=="unchanged";unresolved+=row.status=="unresolved";
        w.beginObject().key("matrixRow").value(row.matrixRow).key("scenario").value(row.scenario).key("status").value(row.status);
        if(row.delta) {
            w.key("delta").beginObject().key("signals").beginArray();
            for(const auto &signal:row.delta->signals) {
                w.beginObject().key("signal").value(signal.signal);
                const auto ranges=[&](const char *name,const auto &values) {w.key(name).beginArray();for(const auto &v:values) write(w,v);w.endArray();};
                ranges("added",signal.added);ranges("removed",signal.removed);ranges("retained",signal.retained);
                w.key("counts");sourceDeltaCountsJson(w,signal.counts);w.endObject();
            }
            w.endArray().key("totals");sourceDeltaCountsJson(w,row.delta->totals);w.endObject();
        }
        w.endObject();
    }
    w.endArray().key("summary").beginObject().key("rows").value(r.rows.size()).key("changed").value(changed).key("unchanged").value(unchanged);
    w.key("unresolved").value(unresolved).endObject().endObject();
}
std::string sourceDeltasJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceDeltaReport &r) {
    JsonWriter w;writeSourceDeltas(w,s,r);return w.str();
}

void sourceAttributionCountsJson(JsonWriter &w,const dft::sequential::SourceAttributionCounts &v) {
    w.beginObject().key("coveredBits").value(v.coveredBits).key("changedBits").value(v.changedBits);
    w.key("retainedOnlyBits").value(v.retainedOnlyBits).endObject();
}
void writeSourceAttribution(JsonWriter &w,const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceAttributionReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-source-attribution-v1");
    const auto &l=r.limits;w.key("limits").beginObject().key("maxRows").value(l.maxRows).key("maxIntervals").value(l.maxIntervals);
    w.key("maxSegments").value(l.maxSegments).key("maxMembers").value(l.maxMembers).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("analysis");writeSourceDeltas(w,s,r.analysis);
    w.key("work").value(r.work).key("intervals").value(r.intervals).key("rows").value(r.rows).key("segments").value(r.segments).key("members").value(r.members);
    w.key("comparisons").beginArray();
    for(const auto &v:r.comparisons) {
        w.beginObject().key("scenario").value(v.scenario).key("state").value(v.state).key("inputCollected").value(v.inputCollected);
        w.key("sourcesComplete").value(v.sourcesComplete).key("resolvedRows").value(v.resolvedRows).key("unresolvedRows").value(v.unresolvedRows).key("missingRows").value(v.missingRows);
        w.key("rows").beginArray();
        for(const auto &row:v.rows) {
            w.beginObject().key("signal").value(row.signal).key("segments").beginArray();
            for(const auto &segment:row.segments) {
                w.beginObject().key("bits");write(w,segment.bits);
                const auto refs=[&](const char *name,const auto &values) {w.key(name).beginArray();for(const auto id:values) w.value(id);w.endArray();};
                refs("addedRows",segment.addedRows);refs("removedRows",segment.removedRows);refs("retainedRows",segment.retainedRows);w.endObject();
            }
            w.endArray().key("counts");sourceAttributionCountsJson(w,row.counts);w.endObject();
        }
        w.endArray().key("totals");sourceAttributionCountsJson(w,v.totals);w.endObject();
    }
    w.endArray().endObject();
}
std::string sourceAttributionJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceAttributionReport &r) {
    JsonWriter w;writeSourceAttribution(w,s,r);return w.str();
}

void writeSourceTransitions(JsonWriter &w,const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceTransitionReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-source-transitions-v1");
    const auto &l=r.limits;w.key("limits").beginObject().key("maxCohorts").value(l.maxCohorts).key("maxMembers").value(l.maxMembers);
    w.key("maxSources").value(l.maxSources).key("maxInputSegments").value(l.maxInputSegments).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("analysis");writeSourceAttribution(w,s,r.analysis);
    w.key("work").value(r.work).key("inputSegments").value(r.inputSegments).key("cohorts").value(r.cohorts).key("members").value(r.members).key("sources").value(r.sources);
    w.key("comparisons").beginArray();
    for(const auto &v:r.comparisons) {
        w.beginObject().key("scenario").value(v.scenario).key("state").value(v.state).key("inputCollected").value(v.inputCollected);
        w.key("inputComplete").value(v.inputComplete).key("sourcesComplete").value(v.sourcesComplete).key("inputRows").value(v.inputRows).key("inputSegments").value(v.inputSegments);
        w.key("cohorts").beginArray();
        for(const auto &cohort:v.cohorts) {
            w.beginObject();const auto refs=[&](const char *name,const auto &values) {w.key(name).beginArray();for(const auto id:values) w.value(id);w.endArray();};
            refs("baselineSources",cohort.baselineSources);refs("scenarioSources",cohort.scenarioSources);w.key("changed").value(cohort.changed).key("members").beginArray();
            for(const auto &m:cohort.members) w.beginObject().key("row").value(m.row).key("segment").value(m.segment).endObject();
            w.endArray().key("counts");sourceAttributionCountsJson(w,cohort.counts);w.endObject();
        }
        w.endArray().key("totals");sourceAttributionCountsJson(w,v.totals);w.endObject();
    }
    w.endArray().endObject();
}
std::string sourceTransitionsJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceTransitionReport &r) {
    JsonWriter w;writeSourceTransitions(w,s,r);return w.str();
}

void writeSourceImpact(JsonWriter &w,const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceImpactReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-source-impact-v1");
    const auto &l=r.limits;w.key("limits").beginObject().key("maxInstances").value(l.maxInstances).key("maxDefinitions").value(l.maxDefinitions);
    w.key("maxMembers").value(l.maxMembers).key("maxInputMembers").value(l.maxInputMembers).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("analysis");writeSourceTransitions(w,s,r.analysis);
    w.key("work").value(r.work).key("inputMembers").value(r.inputMembers).key("instanceRows").value(r.instanceRows).key("definitionRows").value(r.definitionRows).key("members").value(r.members);
    w.key("comparisons").beginArray();
    for(const auto &v:r.comparisons) {
        w.beginObject().key("scenario").value(v.scenario).key("state").value(v.state).key("inputCollected").value(v.inputCollected);
        w.key("inputComplete").value(v.inputComplete).key("sourcesComplete").value(v.sourcesComplete).key("inputCohorts").value(v.inputCohorts).key("inputMembers").value(v.inputMembers);
        w.key("instances").beginArray();
        for(const auto &row:v.instances) {
            w.beginObject().key("instance").value(row.instance).key("definition").value(row.definition).key("members").beginArray();
            for(const auto &m:row.members) w.beginObject().key("cohort").value(m.cohort).key("member").value(m.member).endObject();
            w.endArray().key("counts");sourceAttributionCountsJson(w,row.counts);w.endObject();
        }
        w.endArray().key("definitions").beginArray();
        for(const auto &def:v.definitions) {
            w.beginObject().key("definition").value(def.definition).key("instances").beginArray();for(const auto instance:def.instances) w.value(instance);
            w.endArray().key("counts");sourceAttributionCountsJson(w,def.counts);w.endObject();
        }
        w.endArray().key("totals");sourceAttributionCountsJson(w,v.totals);w.endObject();
    }
    w.endArray().endObject();
}
std::string sourceImpactJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceImpactReport &r) {
    JsonWriter w;writeSourceImpact(w,s,r);return w.str();
}


void writeSourceHierarchy(JsonWriter &w,const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-source-hierarchy-v1");
    const auto &l=r.limits;w.key("limits").beginObject().key("maxQueries").value(l.maxQueries).key("maxAncestors").value(l.maxAncestors);
    w.key("maxNodes").value(l.maxNodes).key("maxMembers").value(l.maxMembers).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    if(r.scope) {w.key("scope");write(w,*r.scope);}
    w.key("analysis");writeSourceImpact(w,s,r.analysis);
    w.key("queries").value(r.queries).key("ancestorEntries").value(r.ancestorEntries).key("work").value(r.work).key("nodeRows").value(r.nodeRows).key("members").value(r.members);
    w.key("comparisons").beginArray();
    for(const auto &v:r.comparisons) {
        w.beginObject().key("scenario").value(v.scenario).key("state").value(v.state).key("inputCollected").value(v.inputCollected);
        w.key("inputComplete").value(v.inputComplete).key("sourcesComplete").value(v.sourcesComplete).key("inputRows").value(v.inputRows).key("nodes").beginArray();
        for(const auto &row:v.nodes) {
            w.beginObject().key("info");write(w,row.info);w.key("parent");if(row.parent) w.value(*row.parent);else w.null();
            w.key("depth").value(row.depth).key("local");index(w,row.local);w.key("members").beginArray();for(const auto m:row.members) w.value(m);
            w.endArray().key("counts");sourceAttributionCountsJson(w,row.counts);w.endObject();
        }
        w.endArray().key("totals");sourceAttributionCountsJson(w,v.totals);w.endObject();
    }
    w.endArray().endObject();
}
std::string sourceHierarchyJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyReport &r) {
    JsonWriter w;writeSourceHierarchy(w,s,r);return w.str();
}


void writeSourceHierarchyMatrix(JsonWriter &w,const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyMatrixReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-source-hierarchy-matrix-v1");
    const auto &l=r.limits;w.key("limits").beginObject().key("maxRows").value(l.maxRows).key("maxMembers").value(l.maxMembers);
    w.key("maxInputNodes").value(l.maxInputNodes).key("maxInputMembers").value(l.maxInputMembers).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("analysis");writeSourceHierarchy(w,s,r.analysis);
    w.key("work").value(r.work).key("inputNodes").value(r.inputNodes).key("inputMembers").value(r.inputMembers).key("rows").value(r.rows).key("members").value(r.members);
    w.key("comparisons").beginArray();
    for(const auto &v:r.comparisons) {
        w.beginObject().key("scenario").value(v.scenario).key("state").value(v.state).key("inputCollected").value(v.inputCollected);
        w.key("inputComplete").value(v.inputComplete).key("sourcesComplete").value(v.sourcesComplete).key("inputNodes").value(v.inputNodes).key("inputMembers").value(v.inputMembers);
        w.key("rows").beginArray();
        for(const auto &row:v.rows) {
            w.beginObject().key("source").value(row.source).key("node").value(row.node).key("members").beginArray();
            for(const auto &m:row.members) w.beginObject().key("row").value(m.row).key("segment").value(m.segment).key("role").value(dft::sequential::sourceHierarchyRoleName(m.role)).endObject();
            w.endArray().key("counts");sourceDeltaCountsJson(w,row.counts);w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().endObject();
}
std::string sourceHierarchyMatrixJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyMatrixReport &r) {
    JsonWriter w;writeSourceHierarchyMatrix(w,s,r);return w.str();
}


void writeSourceHierarchySignal(JsonWriter &w,const dft::sequential::SourceHierarchySignalRanges &signal) {
    w.beginObject().key("signal").value(signal.signal);
    const auto ranges=[&](const char *name,const auto &values) {w.key(name).beginArray();for(const auto &bits:values) write(w,bits);w.endArray();};
    ranges("added",signal.added);ranges("removed",signal.removed);ranges("retained",signal.retained);
    w.key("counts");sourceDeltaCountsJson(w,signal.counts);w.key("members").beginArray();for(const auto member:signal.members) w.value(member);
    w.endArray().endObject();
}
void writeSourceHierarchyRanges(JsonWriter &w,const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyRangeReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-source-hierarchy-ranges-v1");
    const auto &l=r.limits;w.key("limits").beginObject().key("maxRows").value(l.maxRows).key("maxSignals").value(l.maxSignals).key("maxRanges").value(l.maxRanges);
    w.key("maxMembers").value(l.maxMembers).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("analysis");writeSourceHierarchyMatrix(w,s,r.analysis);
    w.key("work").value(r.work).key("rows").value(r.rows).key("signals").value(r.signals).key("ranges").value(r.ranges).key("members").value(r.members);
    w.key("comparisons").beginArray();
    for(const auto &v:r.comparisons) {
        w.beginObject().key("scenario").value(v.scenario).key("state").value(v.state).key("inputComplete").value(v.inputComplete).key("sourcesComplete").value(v.sourcesComplete);
        w.key("inputRows").value(v.inputRows).key("rows").beginArray();
        for(const auto &row:v.rows) {
            w.beginObject().key("matrixRow").value(row.matrixRow).key("signals").beginArray();
            for(const auto &signal:row.signals) writeSourceHierarchySignal(w,signal);
            w.endArray().endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().endObject();
}
std::string sourceHierarchyRangesJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyRangeReport &r) {
    JsonWriter w;writeSourceHierarchyRanges(w,s,r);return w.str();
}

void writeSourceRangeQuery(JsonWriter &w,const dft::sequential::SourceRangeQuery &q) {
    w.beginObject().key("scenario").value(q.scenario);
    if(q.source) w.key("source").value(*q.source);if(q.node) w.key("node").value(*q.node);if(q.signal) w.key("signal").value(*q.signal);
    if(q.role) w.key("role").value(dft::sequential::sourceHierarchyRoleName(*q.role));if(q.bits) {w.key("bits");write(w,*q.bits);}w.endObject();
}
void writeSourceRangeSelection(JsonWriter &w,const dft::sequential::RegisterStatistics &statistics,const dft::sequential::RegisterSourceHierarchyRangeReport &input,const dft::sequential::SourceRangeSelection &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-source-range-selection-v1");
    w.key("analysis");writeSourceHierarchyRanges(w,statistics,input);
    w.key("query");writeSourceRangeQuery(w,r.query);
    const auto &l=r.limits;w.key("limits").beginObject().key("maxRows").value(l.maxRows).key("maxRanges").value(l.maxRanges).key("maxMembers").value(l.maxMembers).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("inputComplete").value(r.inputComplete).key("sourcesComplete").value(r.sourcesComplete).key("inputRows").value(r.inputRows).key("visitedRows").value(r.visitedRows);
    w.key("work").value(r.work).key("ranges").value(r.ranges).key("members").value(r.members).key("rows").beginArray();
    for(const auto &row:r.rows) {w.beginObject().key("rangeRow").value(row.rangeRow).key("rangeSignal").value(row.rangeSignal).key("value");writeSourceHierarchySignal(w,row.value);w.endObject();}
    w.endArray().endObject();
}
std::string sourceRangeSelectionJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyRangeReport &r,const dft::sequential::SourceRangeSelection &v) {
    JsonWriter w;writeSourceRangeSelection(w,s,r,v);return w.str();
}

void writeSourceRangeEvidence(JsonWriter &w,const dft::sequential::RegisterStatistics &statistics,const dft::sequential::RegisterSourceHierarchyRangeReport &ranges,const dft::sequential::SourceRangeSelection &selection,const dft::sequential::SourceRangeEvidence &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-register-source-range-evidence-v1");
    w.key("analysis");writeSourceRangeSelection(w,statistics,ranges,selection);
    w.key("snapshotId").value(r.snapshotId).key("scope").value(r.scope).key("query");writeSourceRangeQuery(w,r.query);
    const auto &l=r.limits;w.key("limits").beginObject().key("maxRows").value(l.maxRows).key("maxProofs").value(l.maxProofs).key("maxFacts").value(l.maxFacts).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(r.complete?"complete":"partial").key("reasons");write(w,r.reasons);w.endObject();
    w.key("inputComplete").value(r.inputComplete).key("sourcesComplete").value(r.sourcesComplete).key("inputRows").value(r.inputRows).key("work").value(r.work).key("proofs").value(r.proofs).key("contexts").value(r.contexts).key("factEntries").value(r.factEntries);
    w.key("facts").beginArray();for(const auto &fact:r.facts) {w.beginObject().key("fact").value(fact.fact).key("info");write(w,fact.info);w.endObject();}w.endArray();
    w.key("rows").beginArray();for(const auto &row:r.rows) {
        w.beginObject().key("selectionRow").value(row.selectionRow).key("source");sourceJson(w,row.source);w.key("node");write(w,row.node);w.key("owner");write(w,row.owner);w.key("signal");write(w,row.signal);
        w.key("proofs").beginArray();for(const auto &proof:row.proofs) {
            w.beginObject().key("member").value(proof.member).key("role").value(dft::sequential::sourceHierarchyRoleName(proof.role)).key("bits");write(w,proof.bits);
            w.key("contexts").beginArray();for(const auto &context:proof.contexts) {
                w.beginObject().key("scenario").value(context.scenario).key("group").value(context.group).key("facts").beginArray();
                for(const auto &fact:context.facts) {w.beginObject().key("fact").value(fact.fact).key("bits");write(w,fact.bits);w.endObject();}
                w.endArray().endObject();
            }w.endArray().endObject();
        }w.endArray().endObject();
    }w.endArray().endObject();
}
std::string sourceRangeEvidenceJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyRangeReport &r,const dft::sequential::SourceRangeSelection &v,const dft::sequential::SourceRangeEvidence &e) {
    JsonWriter w;writeSourceRangeEvidence(w,s,r,v,e);return w.str();
}

void writeSourceEvidenceLocations(JsonWriter &w,const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyRangeReport &r,const dft::sequential::SourceRangeSelection &v,const dft::sequential::SourceRangeEvidence &e,const dft::sequential::SourceEvidenceLocations &locations) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-source-evidence-locations-v1").key("analysis");writeSourceRangeEvidence(w,s,r,v,e);
    w.key("snapshotId").value(locations.snapshotId).key("scope").value(locations.scope).key("query");writeSourceRangeQuery(w,locations.query);
    const auto &l=locations.limits;w.key("limits").beginObject().key("maxFacts").value(l.maxFacts).key("maxLocations").value(l.maxLocations).key("maxQueries").value(l.maxQueries).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(locations.complete?"complete":"partial").key("reasons");write(w,locations.reasons);w.endObject();
    w.key("inputComplete").value(locations.inputComplete).key("sourcesComplete").value(locations.sourcesComplete).key("inputFacts").value(locations.inputFacts).key("work").value(locations.work).key("queries").value(locations.queries).key("missing").value(locations.missing);
    w.key("locations").beginArray();for(const auto &location:locations.locations) {
        w.beginObject().key("ref").value(location.ref).key("kind").value(location.kind==hier::model::SourceKind::Definition?"definition":"statement").key("status").value(location.span?"located":"not_found");
        if(location.span) {w.key("span");write(w,*location.span);}w.endObject();
    }w.endArray().key("rows").beginArray();for(const auto &row:locations.rows) {
        w.beginObject().key("fact").value(row.fact).key("statisticsFact").value(row.statisticsFact).key("ref").value(row.ref).key("inst").value(row.inst).key("signalLocation").value(row.signalLocation).key("processLocation").value(row.processLocation).endObject();
    }w.endArray().endObject();
}
std::string sourceEvidenceLocationsJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyRangeReport &r,const dft::sequential::SourceRangeSelection &v,const dft::sequential::SourceRangeEvidence &e,const dft::sequential::SourceEvidenceLocations &l) {
    JsonWriter w;writeSourceEvidenceLocations(w,s,r,v,e,l);return w.str();
}

std::string sourceEvidenceExcerptsJson(const dft::sequential::RegisterStatistics &s,const dft::sequential::RegisterSourceHierarchyRangeReport &r,const dft::sequential::SourceRangeSelection &v,const dft::sequential::SourceRangeEvidence &e,const dft::sequential::SourceEvidenceLocations &l,const dft::sequential::SourceEvidenceExcerpts &x) {
    JsonWriter w;w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-source-evidence-excerpts-v1").key("analysis");writeSourceEvidenceLocations(w,s,r,v,e,l);
    w.key("snapshotId").value(x.snapshotId).key("scope").value(x.scope).key("query");writeSourceRangeQuery(w,x.query);
    const auto &b=x.limits;w.key("limits").beginObject().key("contextLines").value(b.contextLines).key("maxLocations").value(b.maxLocations).key("maxFiles").value(b.maxFiles).key("maxQueries").value(b.maxQueries).key("maxBytes").value(b.maxBytes).key("maxSnippetBytes").value(b.maxSnippetBytes).key("maxCachedBytes").value(b.maxCachedBytes).key("maxWork").value(b.maxWork).key("maxMillis").value(b.maxMillis).endObject();
    w.key("quality").beginObject().key("completeness").value(x.complete?"complete":"partial").key("reasons");write(w,x.reasons);w.endObject();
    w.key("inputComplete").value(x.inputComplete).key("sourcesComplete").value(x.sourcesComplete).key("inputLocations").value(x.inputLocations).key("work").value(x.work).key("queries").value(x.queries).key("readBytes").value(x.readBytes).key("cachedBytes").value(x.cachedBytes).key("bytes").value(x.bytes);
    w.key("files").beginArray();for(const auto &file:x.files) {
        w.beginObject().key("file").value(file.file).key("path").value(file.path).key("snapshotHash").value(file.snapshotHash).key("state").value(dft::sequential::sourceExcerptFileStateName(file.state));
        if(file.contentHash) w.key("contentHash").value(*file.contentHash).key("matchesSnapshot").value(file.matchesSnapshot);w.endObject();
    }w.endArray().key("snippets").beginArray();for(const auto &snippet:x.snippets) {
        w.beginObject().key("file").value(snippet.file).key("startOffset").value(snippet.startOffset).key("endOffset").value(snippet.endOffset).key("startLine").value(snippet.startLine).key("text").value(snippet.text).endObject();
    }w.endArray().key("rows").beginArray();for(const auto &row:x.rows) {
        w.beginObject().key("location").value(row.location).key("state").value(dft::sequential::sourceExcerptStateName(row.state));if(row.file) w.key("file").value(*row.file);if(row.snippet) w.key("snippet").value(*row.snippet);w.endObject();
    }w.endArray().endObject();return w.str();
}

int run(int argc, char **argv) {
    hier::model::OpenOptions open;
    dft::sequential::Request request;
    dft::sequential::ScenarioRequest scenarios;
    bool failOnError = false, requireComplete = false, includeInventory = false, includeGeneration = false, compareGeneration = false, statistics = false, eventGroups = false, includeProfile = false, includeResolved = false, registerScenarios = false, registerGeneration = false, compareRegisterGeneration = false, registerFanout = false, registerSources = false, compareRegisterSources = false, sourceDeltas = false, sourceAttribution = false, sourceTransitions = false, sourceImpact = false, sourceHierarchy = false, sourceHierarchyMatrix = false, sourceHierarchyRanges = false, sourceRangeSelection = false, sourceRangeEvidence = false, sourceEvidenceLocations = false, sourceEvidenceExcerpts = false, inspectRegisterSources = false;
    dft::sequential::InventoryLimits inventoryLimits;
    dft::sequential::GenerationLimits generationLimits;
    dft::sequential::RegisterGenerationLimits registerGenerationLimits;
    dft::sequential::RegisterFanoutLimits fanoutLimits;
    dft::sequential::RegisterSourceLimits sourceLimits;
    dft::sequential::RegisterSourceScenarioLimits sourceScenarioLimits;
    dft::sequential::RegisterSourceDeltaLimits deltaLimits;
    dft::sequential::RegisterSourceAttributionLimits attributionLimits;
    dft::sequential::RegisterSourceTransitionLimits transitionLimits;
    dft::sequential::RegisterSourceImpactLimits impactLimits;
    dft::sequential::RegisterSourceHierarchyLimits hierarchyLimits;
    dft::sequential::RegisterSourceHierarchyMatrixLimits hierarchyMatrixLimits;
    dft::sequential::RegisterSourceHierarchyRangeLimits hierarchyRangeLimits;
    dft::sequential::SourceRangeQuery sourceRangeQuery;
    dft::sequential::SourceRangeSelectionLimits sourceSelectionLimits;
    dft::sequential::SourceRangeEvidenceLimits sourceEvidenceLimits;
    dft::sequential::SourceEvidenceLocationLimits sourceLocationLimits;
    dft::sequential::SourceEvidenceExcerptLimits sourceExcerptLimits;
    std::optional<uint64_t> selectionLsb,selectionWidth;
    dft::sequential::RegisterGenerationScenarioLimits registerGenerationScenarioLimits;
    dft::sequential::GenerationComparisonLimits comparisonLimits;
    dft::sequential::StatisticsRequest statisticsRequest;
    dft::sequential::EventGroupLimits eventGroupLimits;
    dft::sequential::RegisterControlOptions profileOptions;
    dft::sequential::ResolvedEventLimits resolvedLimits;
    dft::sequential::RegisterScenarioRequest registerScenarioRequest;
    std::set<std::string> seen;
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--version" && argc == 2) {
            std::cout << "{\"formatVersion\":1,\"algorithm\":\"rtl-structural-control-v1\"}\n";
            return 0;
        }
        if (arg == "--help" && argc == 2) {
            std::cout << "dft-seqcheck --top TOP --scope INSTANCE [--recursive] FILE.sv\n"
                "  Inputs: FILE... | -f FILELIST | -F FILELIST; -I DIR; -D NAME[=VALUE]\n"
                "  Limits: --max-facts 10000 --max-instances 10000 --max-checks 1000\n"
                "          --max-trace-nodes 10000 --max-trace-edges 40000 --max-depth 64 --max-millis 30000\n"
                "  Policy: --fail-on-error (exit1); --require-complete (partial exit4)\n"
                "  --logic: opt-in v2 source analysis; --max-logic-work 10000\n"
                "  --clock-usage (requires --logic): v3 sequential use warnings; --max-usage-work 10000\n"
                "  --clock-root PATH BIT (repeatable, requires --logic): v4 rooted AND/OR gates\n"
                "  --input-value PATH BIT 0|1 (repeatable, requires --logic): v5 conditional sources\n"
                "  --scenario NAME (repeat 2..8, requires --logic): subsequent input values belong to this case\n"
                "  Shared scenario limits: --max-scenario-millis 60000 --max-comparisons 10000\n"
                "  --source-inventory: proven source/polarity groups and original control-event references\n"
                "  Inventory limits per report: --max-inventory-groups 10000 --max-inventory-members 100000\n"
                "    --max-inventory-work 1000000 --max-inventory-millis 1000\n"
                "  --control-generation (requires --logic): explain generating registers and their controls\n"
                "  Generation limits: --max-generation-controls 1000 --max-generation-generators 1000\n"
                "    --max-generation-facts 10000 --max-generation-work 1000000 --max-generation-depth 16\n"
                "    --max-generation-cycles 64 --max-generation-millis 1000 --max-generation-trace-nodes 10000\n"
                "    --max-generation-trace-edges 40000 --max-generation-logic-work 10000\n"
                "  --compare-generation (requires --control-generation and scenarios): compare generating controls\n"
                "  Batch limits: --max-generation-comparison-cones 10000 --max-generation-comparison-members 100000\n"
                "    --max-generation-comparison-rows 10000 --max-generation-comparison-work 1000000\n"
                "    --max-generation-comparison-millis 1000\n"
                "  --register-statistics: separate RTL register bit coverage mode, no control tracing\n"
                "    --max-statistics-facts 100000 --max-statistics-instances 100000 --max-statistics-signals 100000\n"
                "    --max-statistics-segments 200000 --max-statistics-work 1000000 --max-statistics-millis 30000\n"
                "  --register-event-groups (requires --register-statistics): literal clock/async groups and cross-group bits\n"
                "    --max-event-groups 100000 --max-event-group-members 100000 --max-event-group-segments 200000\n"
                "    --max-event-group-overlap-members 100000 --max-event-group-work 1000000 --max-event-group-millis 30000\n"
                "  --register-control-profile (requires both register flags): proven clock source/edge bit coverage\n"
                "    accepts --logic/--clock-root/--input-value and --max-checks/trace-nodes/trace-edges/depth/logic-work/millis\n"
                "    --max-register-control-work 1000000 --max-register-control-members 100000 --max-register-control-segments 200000\n"
                "  --register-resolved-events (requires register-control-profile): proven full clock/async event tuples\n"
                "    --max-resolved-event-rows 10000 --max-resolved-event-groups 10000 --max-resolved-event-members 100000\n"
                "    --max-resolved-event-segments 200000 --max-resolved-event-overlap-members 100000\n"
                "    --max-resolved-event-work 1000000 --max-resolved-event-millis 30000\n"
                "  --compare-register-generation (requires --compare-register-scenarios): deep structure impact\n"
                "    --max-register-impact-rows 10000/events 100000/work 1000000/members 100000/segments 200000/millis 60000\n"
                "  --source-coverage-deltas (requires --compare-register-sources): added/removed/retained state-bit ranges\n"
                "    --max-source-delta-rows 10000/signals 100000/ranges 200000/intervals 200000/work 1000000/millis 60000\n"
                "  --explain-source-ranges (requires --select-source-ranges): original contextual write-fact evidence\n"
                "  --locate-source-evidence (requires --explain-source-ranges): Core declaration and statement locations\n"
                "  --max-source-location-facts/locations/queries/work/millis: bounded location queries\n"
                "  --inspect-register-sources: full source investigation (implies --logic); requires scope and 2..8 scenarios\n"
                "  --source-evidence-excerpts (requires --locate-source-evidence): snapshot-checked text windows\n"
                "  --source-excerpt-context-lines 2; --max-source-excerpt-locations/files/queries/bytes/snippet-bytes/cached-bytes/work/millis\n"
                "    --max-source-evidence-rows 10000/proofs 100000/facts 200000/work 1000000/millis 60000\n"
                "  --select-source-ranges (requires --source-hierarchy-ranges): filter published signal ranges\n"
                "    --select-scenario N/source-index N/node CANONICAL_PATH/signal-index N/role added|removed|retained\n"
                "    --select-lsb N --select-width N; --max-source-selection-rows 10000/ranges 200000/members 200000/work 1000000/millis 60000\n"
                "  --source-hierarchy-ranges (requires --source-hierarchy-matrix)\n"
                "    --max-source-hierarchy-range-rows 10000/signals 100000/ranges 200000/members 200000/work 1000000/millis 60000\n"
                "  --source-hierarchy-matrix (requires --source-hierarchy-summary)\n"
                "    --max-source-hierarchy-matrix-rows 10000/members 200000/input-nodes 10000/input-members 200000/work 1000000/millis 60000\n"
                "  --source-hierarchy-summary (requires --source-impact-summary)\n"
                "    --max-source-hierarchy-queries 10000/ancestors 200000/nodes 10000/members 200000/work 1000000/millis 60000\n"
                "  --source-impact-summary (requires --source-transition-cohorts)\n"
                "    --max-source-impact-instances 10000/definitions 10000/members 200000/input-members 200000/work 1000000/millis 60000\n"
                "  --source-transition-cohorts (requires --source-bit-attribution)\n"
                "    --max-source-transition-cohorts 1000/members 100000/sources 100000/input-segments 200000/work 1000000/millis 60000\n"
                "  --source-bit-attribution (requires --source-coverage-deltas)\n"
                "    --max-source-attribution-rows 10000/intervals 200000/segments 200000/members 1000000/work 1000000/millis 60000\n"
                "  --compare-register-sources (requires --compare-register-generation): terminal source coverage matrix\n"
                "    --max-register-source-scenario-rows 10000/cells 100000/intervals 200000/work 1000000/millis 60000\n"
                "  --register-control-sources (requires --register-control-fanout): terminal source coverage and overlaps\n"
                "    --max-register-source-rows 10000/sources 1000/members 100000/segments 200000/overlap-members 100000/work 1000000/millis 30000\n"
                "  --register-control-fanout (requires --register-control-generation): per-node RTL state-bit dependence\n"
                "    --max-register-fanout-origins 100000/seeds 1000/nodes 10000/links 100000/members 100000/segments 200000/work 1000000/millis 30000\n"
                "  --register-control-generation (requires statistics/event-groups/profile and --logic)\n"
                "    --max-generation-* and --max-register-generation-events 100000/work 1000000/millis 30000\n"
                "  --compare-register-scenarios (requires four register flags, --logic and 2..8 --scenario names)\n"
                "    shares raw facts, compares complete event sources and reports changed RTL bit unions\n"
                "    --max-scenario-millis 60000 --max-comparisons 10000\n"
                "    --max-register-scenario-work 1000000 --max-register-scenario-members 100000 --max-register-scenario-segments 200000\n"
                "  Structural RTL checks only; logic/blackbox/unsupported results remain partial.\n";
            return 0;
        }
        if (!arg.empty() && arg.front() != '-') { open.files.push_back(arg); continue; }
        if (arg != "-f" && arg != "-F" && arg != "-I" && arg != "-D" && arg != "--clock-root" &&
            arg != "--input-value" && arg != "--scenario" && !seen.insert(arg).second)
            throw Failure{"invalid_arguments", "Duplicate option: " + arg, 2};
        if (arg == "--source-coverage-deltas") {sourceDeltas=true;continue;}
        if (arg == "--source-bit-attribution") {sourceAttribution=true;continue;}
        if (arg == "--source-transition-cohorts") {sourceTransitions=true;continue;}
        if (arg == "--explain-source-ranges") {sourceRangeEvidence=true;continue;}
        if (arg == "--locate-source-evidence") {sourceEvidenceLocations=true;continue;}
        if (arg == "--inspect-register-sources") {inspectRegisterSources=true;continue;}
        if (arg == "--source-evidence-excerpts") {sourceEvidenceExcerpts=true;continue;}
        if (arg == "--select-source-ranges") {sourceRangeSelection=true;continue;}
        if (arg == "--source-hierarchy-ranges") {sourceHierarchyRanges=true;continue;}
        if (arg == "--source-hierarchy-matrix") {sourceHierarchyMatrix=true;continue;}
        if (arg == "--source-hierarchy-summary") {sourceHierarchy=true;continue;}
        if (arg == "--source-impact-summary") {sourceImpact=true;continue;}
        if (arg == "--compare-register-sources") {compareRegisterSources=true;continue;}
        if (arg == "--register-control-sources") {registerSources=true;continue;}
        if (arg == "--register-control-fanout") {registerFanout=true;continue;}
        if (arg == "--compare-register-generation") {compareRegisterGeneration=true;continue;}
        if (arg == "--register-control-generation") { registerGeneration=true;continue; }
        if (arg == "--compare-register-scenarios") { registerScenarios = true; continue; }
        if (arg == "--register-resolved-events") { includeResolved = true; continue; }
        if (arg == "--register-control-profile") { includeProfile = true; continue; }
        if (arg == "--register-event-groups") { eventGroups = true; continue; }
        if (arg == "--register-statistics") { statistics = true; continue; }
        if (arg == "--compare-generation") { compareGeneration = true; continue; }
        if (arg == "--control-generation") { includeGeneration = true; continue; }
        if (arg == "--source-inventory") { includeInventory = true; continue; }
        if (arg == "--recursive") { request.recursive = true; continue; }
        if (arg == "--logic") { request.resolveLogic = true; continue; }
        if (arg == "--clock-usage") { request.analyzeClockUsage = true; continue; }
        if (arg == "--fail-on-error") { failOnError = true; continue; }
        if (arg == "--require-complete") { requireComplete = true; continue; }
        if (++i >= argc) throw Failure{"invalid_arguments", "Missing option value: " + arg, 2};
        const std::string value = argv[i];
        if (arg == "--top") open.tops.push_back(value);
        else if (arg == "--scope") request.scope = value;
        else if (arg == "-f") open.filelists.push_back(value);
        else if (arg == "-F") open.filelistsRelativeToFile.push_back(value);
        else if (arg == "-I") open.includeDirs.push_back(value);
        else if (arg == "-D") open.defines.push_back(value);
        else if (arg == "--max-source-delta-rows") deltaLimits.maxRows=number(value);
        else if (arg == "--max-source-delta-signals") deltaLimits.maxSignals=number(value);
        else if (arg == "--max-source-delta-ranges") deltaLimits.maxRanges=number(value);
        else if (arg == "--max-source-delta-intervals") deltaLimits.maxIntervals=number(value);
        else if (arg == "--max-source-delta-work") deltaLimits.maxWork=number(value);
        else if (arg == "--max-source-delta-millis") deltaLimits.maxMillis=number(value);
        else if (arg == "--max-source-attribution-rows") attributionLimits.maxRows=number(value);
        else if (arg == "--max-source-attribution-intervals") attributionLimits.maxIntervals=number(value);
        else if (arg == "--max-source-attribution-segments") attributionLimits.maxSegments=number(value);
        else if (arg == "--max-source-attribution-members") attributionLimits.maxMembers=number(value);
        else if (arg == "--max-source-attribution-work") attributionLimits.maxWork=number(value);
        else if (arg == "--max-source-attribution-millis") attributionLimits.maxMillis=number(value);
        else if (arg == "--max-source-transition-cohorts") transitionLimits.maxCohorts=number(value);
        else if (arg == "--max-source-transition-members") transitionLimits.maxMembers=number(value);
        else if (arg == "--max-source-transition-sources") transitionLimits.maxSources=number(value);
        else if (arg == "--max-source-transition-input-segments") transitionLimits.maxInputSegments=number(value);
        else if (arg == "--max-source-transition-work") transitionLimits.maxWork=number(value);
        else if (arg == "--max-source-transition-millis") transitionLimits.maxMillis=number(value);
        else if (arg == "--source-excerpt-context-lines") sourceExcerptLimits.contextLines=number(value);
        else if (arg == "--max-source-excerpt-locations") sourceExcerptLimits.maxLocations=number(value);
        else if (arg == "--max-source-excerpt-files") sourceExcerptLimits.maxFiles=number(value);
        else if (arg == "--max-source-excerpt-queries") sourceExcerptLimits.maxQueries=number(value);
        else if (arg == "--max-source-excerpt-bytes") sourceExcerptLimits.maxBytes=number(value);
        else if (arg == "--max-source-excerpt-snippet-bytes") sourceExcerptLimits.maxSnippetBytes=number(value);
        else if (arg == "--max-source-excerpt-cached-bytes") sourceExcerptLimits.maxCachedBytes=number(value);
        else if (arg == "--max-source-excerpt-work") sourceExcerptLimits.maxWork=number(value);
        else if (arg == "--max-source-excerpt-millis") sourceExcerptLimits.maxMillis=number(value);
        else if (arg == "--max-source-location-facts") sourceLocationLimits.maxFacts=number(value);
        else if (arg == "--max-source-location-locations") sourceLocationLimits.maxLocations=number(value);
        else if (arg == "--max-source-location-queries") sourceLocationLimits.maxQueries=number(value);
        else if (arg == "--max-source-location-work") sourceLocationLimits.maxWork=number(value);
        else if (arg == "--max-source-location-millis") sourceLocationLimits.maxMillis=number(value);
        else if (arg == "--max-source-evidence-rows") sourceEvidenceLimits.maxRows=number(value);
        else if (arg == "--max-source-evidence-proofs") sourceEvidenceLimits.maxProofs=number(value);
        else if (arg == "--max-source-evidence-facts") sourceEvidenceLimits.maxFacts=number(value);
        else if (arg == "--max-source-evidence-work") sourceEvidenceLimits.maxWork=number(value);
        else if (arg == "--max-source-evidence-millis") sourceEvidenceLimits.maxMillis=number(value);
        else if (arg == "--select-scenario") sourceRangeQuery.scenario=number(value);
        else if (arg == "--select-source-index") sourceRangeQuery.source=number(value);
        else if (arg == "--select-node") sourceRangeQuery.node=value;
        else if (arg == "--select-signal-index") sourceRangeQuery.signal=number(value);
        else if (arg == "--select-role") {
            if(value=="added") sourceRangeQuery.role=dft::sequential::SourceHierarchyRole::Added;
            else if(value=="removed") sourceRangeQuery.role=dft::sequential::SourceHierarchyRole::Removed;
            else if(value=="retained") sourceRangeQuery.role=dft::sequential::SourceHierarchyRole::Retained;
            else throw Failure{"invalid_arguments","Selection role must be added, removed or retained",2};
        }
        else if (arg == "--select-lsb") selectionLsb=number(value);
        else if (arg == "--select-width") selectionWidth=number(value);
        else if (arg == "--max-source-selection-rows") sourceSelectionLimits.maxRows=number(value);
        else if (arg == "--max-source-selection-ranges") sourceSelectionLimits.maxRanges=number(value);
        else if (arg == "--max-source-selection-members") sourceSelectionLimits.maxMembers=number(value);
        else if (arg == "--max-source-selection-work") sourceSelectionLimits.maxWork=number(value);
        else if (arg == "--max-source-selection-millis") sourceSelectionLimits.maxMillis=number(value);
        else if (arg == "--max-source-hierarchy-range-rows") hierarchyRangeLimits.maxRows=number(value);
        else if (arg == "--max-source-hierarchy-range-signals") hierarchyRangeLimits.maxSignals=number(value);
        else if (arg == "--max-source-hierarchy-range-ranges") hierarchyRangeLimits.maxRanges=number(value);
        else if (arg == "--max-source-hierarchy-range-members") hierarchyRangeLimits.maxMembers=number(value);
        else if (arg == "--max-source-hierarchy-range-work") hierarchyRangeLimits.maxWork=number(value);
        else if (arg == "--max-source-hierarchy-range-millis") hierarchyRangeLimits.maxMillis=number(value);
        else if (arg == "--max-source-hierarchy-matrix-rows") hierarchyMatrixLimits.maxRows=number(value);
        else if (arg == "--max-source-hierarchy-matrix-members") hierarchyMatrixLimits.maxMembers=number(value);
        else if (arg == "--max-source-hierarchy-matrix-input-nodes") hierarchyMatrixLimits.maxInputNodes=number(value);
        else if (arg == "--max-source-hierarchy-matrix-input-members") hierarchyMatrixLimits.maxInputMembers=number(value);
        else if (arg == "--max-source-hierarchy-matrix-work") hierarchyMatrixLimits.maxWork=number(value);
        else if (arg == "--max-source-hierarchy-matrix-millis") hierarchyMatrixLimits.maxMillis=number(value);
        else if (arg == "--max-source-hierarchy-queries") hierarchyLimits.maxQueries=number(value);
        else if (arg == "--max-source-hierarchy-ancestors") hierarchyLimits.maxAncestors=number(value);
        else if (arg == "--max-source-hierarchy-nodes") hierarchyLimits.maxNodes=number(value);
        else if (arg == "--max-source-hierarchy-members") hierarchyLimits.maxMembers=number(value);
        else if (arg == "--max-source-hierarchy-work") hierarchyLimits.maxWork=number(value);
        else if (arg == "--max-source-hierarchy-millis") hierarchyLimits.maxMillis=number(value);
        else if (arg == "--max-source-impact-instances") impactLimits.maxInstances=number(value);
        else if (arg == "--max-source-impact-definitions") impactLimits.maxDefinitions=number(value);
        else if (arg == "--max-source-impact-members") impactLimits.maxMembers=number(value);
        else if (arg == "--max-source-impact-input-members") impactLimits.maxInputMembers=number(value);
        else if (arg == "--max-source-impact-work") impactLimits.maxWork=number(value);
        else if (arg == "--max-source-impact-millis") impactLimits.maxMillis=number(value);
        else if (arg == "--max-register-source-scenario-rows") sourceScenarioLimits.maxRows=number(value);
        else if (arg == "--max-register-source-scenario-cells") sourceScenarioLimits.maxCells=number(value);
        else if (arg == "--max-register-source-scenario-intervals") sourceScenarioLimits.maxIntervals=number(value);
        else if (arg == "--max-register-source-scenario-work") sourceScenarioLimits.maxWork=number(value);
        else if (arg == "--max-register-source-scenario-millis") sourceScenarioLimits.maxMillis=number(value);
        else if (arg == "--max-register-source-rows") sourceLimits.maxRows=number(value);
        else if (arg == "--max-register-source-sources") sourceLimits.maxSources=number(value);
        else if (arg == "--max-register-source-members") sourceLimits.maxMembers=number(value);
        else if (arg == "--max-register-source-segments") sourceLimits.maxSegments=number(value);
        else if (arg == "--max-register-source-overlap-members") sourceLimits.maxOverlapMembers=number(value);
        else if (arg == "--max-register-source-work") sourceLimits.maxWork=number(value);
        else if (arg == "--max-register-source-millis") sourceLimits.maxMillis=number(value);
        else if (arg == "--max-register-fanout-origins") fanoutLimits.maxOrigins=number(value);
        else if (arg == "--max-register-fanout-seeds") fanoutLimits.maxSeeds=number(value);
        else if (arg == "--max-register-fanout-nodes") fanoutLimits.maxNodes=number(value);
        else if (arg == "--max-register-fanout-links") fanoutLimits.maxLinks=number(value);
        else if (arg == "--max-register-fanout-members") fanoutLimits.maxMembers=number(value);
        else if (arg == "--max-register-fanout-segments") fanoutLimits.maxSegments=number(value);
        else if (arg == "--max-register-fanout-work") fanoutLimits.maxWork=number(value);
        else if (arg == "--max-register-fanout-millis") fanoutLimits.maxMillis=number(value);
        else if (arg == "--max-register-impact-rows") registerGenerationScenarioLimits.maxRows=number(value);
        else if (arg == "--max-register-impact-events") registerGenerationScenarioLimits.maxEvents=number(value);
        else if (arg == "--max-register-impact-work") registerGenerationScenarioLimits.maxWork=number(value);
        else if (arg == "--max-register-impact-members") registerGenerationScenarioLimits.maxMembers=number(value);
        else if (arg == "--max-register-impact-segments") registerGenerationScenarioLimits.maxSegments=number(value);
        else if (arg == "--max-register-impact-millis") registerGenerationScenarioLimits.maxMillis=number(value);
        else if (arg == "--max-register-generation-events") registerGenerationLimits.maxEvents=number(value);
        else if (arg == "--max-register-generation-work") registerGenerationLimits.maxWork=number(value);
        else if (arg == "--max-register-generation-millis") registerGenerationLimits.maxMillis=number(value);
        else if (arg == "--max-register-scenario-work") registerScenarioRequest.maxWork = number(value);
        else if (arg == "--max-register-scenario-members") registerScenarioRequest.maxMembers = number(value);
        else if (arg == "--max-register-scenario-segments") registerScenarioRequest.maxSegments = number(value);
        else if (arg == "--max-resolved-event-rows") resolvedLimits.maxRows = number(value);
        else if (arg == "--max-resolved-event-groups") resolvedLimits.maxGroups = number(value);
        else if (arg == "--max-resolved-event-members") resolvedLimits.maxMembers = number(value);
        else if (arg == "--max-resolved-event-segments") resolvedLimits.maxSegments = number(value);
        else if (arg == "--max-resolved-event-overlap-members") resolvedLimits.maxOverlapMembers = number(value);
        else if (arg == "--max-resolved-event-work") resolvedLimits.maxWork = number(value);
        else if (arg == "--max-resolved-event-millis") resolvedLimits.maxMillis = number(value);
        else if (arg == "--max-register-control-work") profileOptions.maxWork = number(value);
        else if (arg == "--max-register-control-members") profileOptions.maxMembers = number(value);
        else if (arg == "--max-register-control-segments") profileOptions.maxSegments = number(value);
        else if (arg == "--max-event-groups") eventGroupLimits.maxGroups = number(value);
        else if (arg == "--max-event-group-members") eventGroupLimits.maxMembers = number(value);
        else if (arg == "--max-event-group-segments") eventGroupLimits.maxSegments = number(value);
        else if (arg == "--max-event-group-overlap-members") eventGroupLimits.maxOverlapMembers = number(value);
        else if (arg == "--max-event-group-work") eventGroupLimits.maxWork = number(value);
        else if (arg == "--max-event-group-millis") eventGroupLimits.maxMillis = number(value);
        else if (arg == "--max-statistics-facts") statisticsRequest.maxFacts = number(value);
        else if (arg == "--max-statistics-instances") statisticsRequest.maxInstances = number(value);
        else if (arg == "--max-statistics-signals") statisticsRequest.maxSignals = number(value);
        else if (arg == "--max-statistics-segments") statisticsRequest.maxSegments = number(value);
        else if (arg == "--max-statistics-work") statisticsRequest.maxWork = number(value);
        else if (arg == "--max-statistics-millis") statisticsRequest.maxMillis = number(value);
        else if (arg == "--max-facts") request.maxFacts = number(value);
        else if (arg == "--max-instances") request.maxInstances = number(value);
        else if (arg == "--max-checks") request.maxChecks = number(value);
        else if (arg == "--max-trace-nodes") request.maxTraceNodes = number(value);
        else if (arg == "--max-trace-edges") request.maxTraceEdges = number(value);
        else if (arg == "--max-depth") request.maxDepth = number(value);
        else if (arg == "--max-millis") request.maxMillis = number(value);
        else if (arg == "--max-logic-work") request.maxLogicWork = number(value);
        else if (arg == "--max-usage-work") request.maxUsageWork = number(value);
        else if (arg == "--max-generation-comparison-cones") comparisonLimits.maxCones = number(value);
        else if (arg == "--max-generation-comparison-members") comparisonLimits.maxMembers = number(value);
        else if (arg == "--max-generation-comparison-rows") comparisonLimits.maxRows = number(value);
        else if (arg == "--max-generation-comparison-work") comparisonLimits.maxWork = number(value);
        else if (arg == "--max-generation-comparison-millis") comparisonLimits.maxMillis = number(value);
        else if (arg == "--max-generation-controls") generationLimits.maxControls = number(value);
        else if (arg == "--max-generation-generators") generationLimits.maxGenerators = number(value);
        else if (arg == "--max-generation-facts") generationLimits.maxRegisterFacts = number(value);
        else if (arg == "--max-generation-work") generationLimits.maxWork = number(value);
        else if (arg == "--max-generation-depth") generationLimits.maxDepth = number(value);
        else if (arg == "--max-generation-cycles") generationLimits.maxCycles = number(value);
        else if (arg == "--max-generation-millis") generationLimits.maxMillis = number(value);
        else if (arg == "--max-generation-trace-nodes") generationLimits.maxTraceNodes = number(value);
        else if (arg == "--max-generation-trace-edges") generationLimits.maxTraceEdges = number(value);
        else if (arg == "--max-generation-logic-work") generationLimits.maxLogicWork = number(value);
        else if (arg == "--max-inventory-groups") inventoryLimits.maxGroups = number(value);
        else if (arg == "--max-inventory-members") inventoryLimits.maxMembers = number(value);
        else if (arg == "--max-inventory-work") inventoryLimits.maxWork = number(value);
        else if (arg == "--max-inventory-millis") inventoryLimits.maxMillis = number(value);
        else if (arg == "--max-scenario-millis") scenarios.maxMillis = number(value);
        else if (arg == "--max-comparisons") scenarios.maxComparisons = number(value);
        else if (arg == "--scenario") {
            if (scenarios.scenarios.size() >= 8) throw Failure{"invalid_arguments", "At most 8 scenarios", 2};
            scenarios.scenarios.push_back({value, {}});
        }
        else if (arg == "--clock-root") {
            if (++i >= argc) throw Failure{"invalid_arguments", "Missing clock root bit", 2};
            if (request.clockRoots.size() >= 64) throw Failure{"invalid_arguments", "At most 64 clock root bits", 2};
            request.clockRoots.push_back({value, number(argv[i])});
        }
        else if (arg == "--input-value") {
            if (i + 2 >= argc) throw Failure{"invalid_arguments", "Missing input bit or value", 2};
            const auto bit = number(argv[++i]);
            const std::string level = argv[++i];
            if (level != "0" && level != "1") throw Failure{"invalid_arguments", "Input value must be 0 or 1", 2};
            auto &inputs = scenarios.scenarios.empty() ? request.inputValues : scenarios.scenarios.back().inputValues;
            if (inputs.size() >= 64) throw Failure{"invalid_arguments", "At most 64 input values", 2};
            inputs.push_back({{value, bit}, level == "1"});
        }
        else throw Failure{"invalid_arguments", "Unknown option: " + arg, 2};
    }
    if (inspectRegisterSources) {
        statistics = eventGroups = includeProfile = includeResolved = registerScenarios =
            compareRegisterGeneration = compareRegisterSources = sourceDeltas = sourceAttribution =
            sourceTransitions = sourceImpact = sourceHierarchy = sourceHierarchyMatrix =
            sourceHierarchyRanges = sourceRangeSelection = sourceRangeEvidence =
            sourceEvidenceLocations = sourceEvidenceExcerpts = true;
        request.resolveLogic = true;
    }
    if (open.tops.size() != 1 || request.scope.empty() ||
        (open.files.empty() && open.filelists.empty() && open.filelistsRelativeToFile.empty()))
        throw Failure{"invalid_arguments", "Provide inputs, one --top and explicit --scope", 2};
    if (!statistics && std::any_of(seen.begin(), seen.end(), [](const auto &flag) { return flag.starts_with("--max-statistics-"); }))
        throw Failure{"invalid_arguments", "Statistics limits require --register-statistics", 2};
    if (statistics) {
        std::set<std::string> allowed{"--register-statistics", "--register-event-groups", "--top", "--scope", "--recursive", "--fail-on-error", "--require-complete"};
        if (inspectRegisterSources) allowed.insert("--inspect-register-sources");
        if (includeProfile) allowed.insert({"--register-control-profile", "--logic", "--clock-root", "--input-value",
            "--max-checks", "--max-trace-nodes", "--max-trace-edges", "--max-depth", "--max-logic-work", "--max-millis",
            "--max-register-control-work", "--max-register-control-members", "--max-register-control-segments"});
        if (includeResolved) allowed.insert({"--register-resolved-events", "--max-resolved-event-rows", "--max-resolved-event-groups",
            "--max-resolved-event-members", "--max-resolved-event-segments", "--max-resolved-event-overlap-members", "--max-resolved-event-work", "--max-resolved-event-millis"});
        if(sourceDeltas) allowed.insert({"--source-coverage-deltas","--max-source-delta-rows","--max-source-delta-signals","--max-source-delta-ranges","--max-source-delta-intervals","--max-source-delta-work","--max-source-delta-millis"});
        if(sourceAttribution) allowed.insert({"--source-bit-attribution","--max-source-attribution-rows","--max-source-attribution-intervals","--max-source-attribution-segments","--max-source-attribution-members","--max-source-attribution-work","--max-source-attribution-millis"});
        if(sourceTransitions) allowed.insert({"--source-transition-cohorts","--max-source-transition-cohorts","--max-source-transition-members","--max-source-transition-sources","--max-source-transition-input-segments","--max-source-transition-work","--max-source-transition-millis"});
        if(sourceEvidenceExcerpts) allowed.insert({"--source-evidence-excerpts","--source-excerpt-context-lines","--max-source-excerpt-locations","--max-source-excerpt-files","--max-source-excerpt-queries","--max-source-excerpt-bytes","--max-source-excerpt-snippet-bytes","--max-source-excerpt-cached-bytes","--max-source-excerpt-work","--max-source-excerpt-millis"});
        if(sourceEvidenceLocations) allowed.insert({"--locate-source-evidence","--max-source-location-facts","--max-source-location-locations","--max-source-location-queries","--max-source-location-work","--max-source-location-millis"});
        if(sourceRangeEvidence) allowed.insert({"--explain-source-ranges","--max-source-evidence-rows","--max-source-evidence-proofs","--max-source-evidence-facts","--max-source-evidence-work","--max-source-evidence-millis"});
        if(sourceRangeSelection) allowed.insert({"--select-source-ranges","--select-scenario","--select-source-index","--select-node","--select-signal-index","--select-role","--select-lsb","--select-width","--max-source-selection-rows","--max-source-selection-ranges","--max-source-selection-members","--max-source-selection-work","--max-source-selection-millis"});
        if(sourceHierarchyRanges) allowed.insert({"--source-hierarchy-ranges","--max-source-hierarchy-range-rows","--max-source-hierarchy-range-signals","--max-source-hierarchy-range-ranges","--max-source-hierarchy-range-members","--max-source-hierarchy-range-work","--max-source-hierarchy-range-millis"});
        if(sourceHierarchyMatrix) allowed.insert({"--source-hierarchy-matrix","--max-source-hierarchy-matrix-rows","--max-source-hierarchy-matrix-members","--max-source-hierarchy-matrix-input-nodes","--max-source-hierarchy-matrix-input-members","--max-source-hierarchy-matrix-work","--max-source-hierarchy-matrix-millis"});
        if(sourceHierarchy) allowed.insert({"--source-hierarchy-summary","--max-source-hierarchy-queries","--max-source-hierarchy-ancestors","--max-source-hierarchy-nodes","--max-source-hierarchy-members","--max-source-hierarchy-work","--max-source-hierarchy-millis"});
        if(sourceImpact) allowed.insert({"--source-impact-summary","--max-source-impact-instances","--max-source-impact-definitions","--max-source-impact-members","--max-source-impact-input-members","--max-source-impact-work","--max-source-impact-millis"});
        if(compareRegisterSources) allowed.insert({"--compare-register-sources","--max-register-source-scenario-rows","--max-register-source-scenario-cells","--max-register-source-scenario-intervals","--max-register-source-scenario-work","--max-register-source-scenario-millis"});
        if (registerSources||compareRegisterSources) allowed.insert({"--register-control-sources","--max-register-source-rows","--max-register-source-sources","--max-register-source-members","--max-register-source-segments","--max-register-source-overlap-members","--max-register-source-work","--max-register-source-millis"});
        if (registerFanout||compareRegisterSources) allowed.insert({"--register-control-fanout","--max-register-fanout-origins","--max-register-fanout-seeds","--max-register-fanout-nodes","--max-register-fanout-links","--max-register-fanout-members","--max-register-fanout-segments","--max-register-fanout-work","--max-register-fanout-millis"});
        if (compareRegisterGeneration) allowed.insert({"--compare-register-generation","--max-register-generation-events","--max-register-generation-work","--max-register-generation-millis","--max-register-impact-rows","--max-register-impact-events","--max-register-impact-work","--max-register-impact-members","--max-register-impact-segments","--max-register-impact-millis"});
        if (registerGeneration) allowed.insert({"--register-control-generation","--max-register-generation-events","--max-register-generation-work","--max-register-generation-millis"});
        if (registerScenarios) allowed.insert({"--compare-register-scenarios", "--scenario", "--max-scenario-millis", "--max-comparisons",
            "--max-register-scenario-work", "--max-register-scenario-members", "--max-register-scenario-segments"});
        for (const auto &flag : seen) if (!allowed.contains(flag) && !flag.starts_with("--max-statistics-") && !flag.starts_with("--max-event-group") && !((registerGeneration||compareRegisterGeneration) && flag.starts_with("--max-generation-")))
            throw Failure{"invalid_arguments", "Register statistics cannot combine with analysis options", 2};
        if ((!includeProfile && (!request.clockRoots.empty() || !request.inputValues.empty())) || (!registerScenarios && !scenarios.scenarios.empty()))
            throw Failure{"invalid_arguments", "Register statistics cannot combine with analysis contexts", 2};
        statisticsRequest.scope = request.scope; statisticsRequest.recursive = request.recursive;
        try { dft::sequential::detail::validateStatisticsRequest(statisticsRequest); }
        catch (const hier::Error &error) { throw Failure{"invalid_arguments", error.message, 2}; }
    }
    if (!eventGroups && std::any_of(seen.begin(), seen.end(), [](const auto &flag) { return flag.starts_with("--max-event-group"); }))
        throw Failure{"invalid_arguments", "Event group limits require --register-event-groups", 2};
    if (eventGroups) {
        if (!statistics) throw Failure{"invalid_arguments", "--register-event-groups requires --register-statistics", 2};
        try { dft::sequential::detail::validateEventGroupLimits(eventGroupLimits); }
        catch (const hier::Error &error) { throw Failure{"invalid_arguments", error.message, 2}; }
    }
    if (!includeProfile && std::any_of(seen.begin(), seen.end(), [](const auto &flag) { return flag.starts_with("--max-register-control-"); }))
        throw Failure{"invalid_arguments", "Register control limits require --register-control-profile", 2};
    if (includeProfile) {
        if (!statistics || !eventGroups) throw Failure{"invalid_arguments", "--register-control-profile requires --register-statistics --register-event-groups", 2};
        profileOptions.eventGroups = eventGroupLimits; profileOptions.resolveLogic = request.resolveLogic;
        profileOptions.clockRoots = request.clockRoots; profileOptions.inputValues = request.inputValues;
        profileOptions.maxChecks = request.maxChecks; profileOptions.maxTraceNodes = request.maxTraceNodes; profileOptions.maxTraceEdges = request.maxTraceEdges;
        profileOptions.maxDepth = request.maxDepth; profileOptions.maxLogicWork = request.maxLogicWork; profileOptions.maxMillis = request.maxMillis;
        try { dft::sequential::detail::validateRegisterControlOptions(profileOptions); }
        catch (const hier::Error &error) { throw Failure{"invalid_arguments", error.message, 2}; }
    }
    if (!includeResolved && std::any_of(seen.begin(),seen.end(),[](const auto &flag) { return flag.starts_with("--max-resolved-event-"); }))
        throw Failure{"invalid_arguments", "Resolved event limits require --register-resolved-events", 2};
    if (includeResolved) {
        if (!includeProfile) throw Failure{"invalid_arguments", "--register-resolved-events requires --register-control-profile", 2};
        try { dft::sequential::detail::validateResolvedEventLimits(resolvedLimits); }
        catch (const hier::Error &error) { throw Failure{"invalid_arguments", error.message, 2}; }
    }
    if (!request.resolveLogic && seen.contains("--max-logic-work"))
        throw Failure{"invalid_arguments", "--max-logic-work requires --logic", 2};
    if (request.analyzeClockUsage && !request.resolveLogic)
        throw Failure{"invalid_arguments", "--clock-usage requires --logic", 2};
    if (!request.clockRoots.empty() && !request.resolveLogic)
        throw Failure{"invalid_arguments", "--clock-root requires --logic", 2};
    if (!request.inputValues.empty() && !request.resolveLogic)
        throw Failure{"invalid_arguments", "--input-value requires --logic", 2};
    if (!request.analyzeClockUsage && seen.contains("--max-usage-work"))
        throw Failure{"invalid_arguments", "--max-usage-work requires --clock-usage", 2};
    if (!scenarios.scenarios.empty() && (!request.resolveLogic || !request.inputValues.empty()))
        throw Failure{"invalid_arguments", "Scenarios require --logic and no input values before the first --scenario", 2};
    if (scenarios.scenarios.empty() && (seen.contains("--max-scenario-millis") || seen.contains("--max-comparisons")))
        throw Failure{"invalid_arguments", "Scenario limits require --scenario", 2};
    if (!includeInventory && (seen.contains("--max-inventory-groups") || seen.contains("--max-inventory-members") ||
        seen.contains("--max-inventory-work") || seen.contains("--max-inventory-millis")))
        throw Failure{"invalid_arguments", "Inventory limits require --source-inventory", 2};
    if (includeInventory) {
        try { dft::sequential::detail::validateInventoryLimits(inventoryLimits); }
        catch (const hier::Error &error) { throw Failure{"invalid_arguments", error.message, 2}; }
    }
    if (!includeGeneration && !registerGeneration && !compareRegisterGeneration && std::any_of(seen.begin(), seen.end(), [](const auto &flag) { return flag.starts_with("--max-generation-"); }))
        throw Failure{"invalid_arguments", "Generation limits require --control-generation", 2};
    if (includeGeneration || registerGeneration || compareRegisterGeneration) {
        if (!request.resolveLogic) throw Failure{"invalid_arguments", "--control-generation requires --logic", 2};
        try { dft::sequential::detail::validateGenerationLimits(generationLimits); }
        catch (const hier::Error &error) { throw Failure{"invalid_arguments", error.message, 2}; }
    }
    if (!compareGeneration && !compareRegisterGeneration && std::any_of(seen.begin(), seen.end(), [](const auto &flag) { return flag.starts_with("--max-generation-comparison-"); }))
        throw Failure{"invalid_arguments", "Generation comparison limits require --compare-generation", 2};
    if (compareGeneration) {
        if (!includeGeneration || scenarios.scenarios.size() < 2)
            throw Failure{"invalid_arguments", "--compare-generation requires --control-generation and at least two scenarios", 2};
        try { dft::sequential::detail::validateGenerationComparisonLimits(comparisonLimits); }
        catch (const hier::Error &error) { throw Failure{"invalid_arguments", error.message, 2}; }
    }
    if (!registerScenarios && std::any_of(seen.begin(),seen.end(),[](const auto &flag) {return flag.starts_with("--max-register-scenario-");}))
        throw Failure{"invalid_arguments", "Register scenario limits require --compare-register-scenarios", 2};
    if (registerScenarios) {
        if (!statistics || !eventGroups || !includeProfile || !includeResolved)
            throw Failure{"invalid_arguments", "--compare-register-scenarios requires all four register flags", 2};
        registerScenarioRequest.common=profileOptions;registerScenarioRequest.resolved=resolvedLimits;
        registerScenarioRequest.scenarios=scenarios.scenarios;registerScenarioRequest.maxMillis=scenarios.maxMillis;
        registerScenarioRequest.maxComparisons=scenarios.maxComparisons;
        try { dft::sequential::detail::validateRegisterScenarioRequest(registerScenarioRequest); }
        catch (const hier::Error &error) {throw Failure{"invalid_arguments",error.message,2};}
    }
    if (!registerGeneration && !compareRegisterGeneration && std::any_of(seen.begin(),seen.end(),[](const auto &flag) {return flag.starts_with("--max-register-generation-");}))
        throw Failure{"invalid_arguments","Register generation limits require --register-control-generation",2};
    if (registerGeneration) {
        if (!statistics||!eventGroups||!includeProfile||!request.resolveLogic||includeResolved||registerScenarios||includeGeneration)
            throw Failure{"invalid_arguments","Register generation requires statistics/event-groups/profile/logic and cannot combine with resolved/scenario/old generation",2};
        registerGenerationLimits.generation=generationLimits;
        try {dft::sequential::detail::validateRegisterGenerationLimits(registerGenerationLimits);}
        catch(const hier::Error &error) {throw Failure{"invalid_arguments",error.message,2};}
    }
    if (!compareRegisterGeneration && std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-register-impact-");}))
        throw Failure{"invalid_arguments","Register impact limits require --compare-register-generation",2};
    if (compareRegisterGeneration) {
        if(!registerScenarios||registerGeneration||includeGeneration||compareGeneration)
            throw Failure{"invalid_arguments","--compare-register-generation requires --compare-register-scenarios and excludes single/old generation",2};
        registerGenerationLimits.generation=generationLimits;registerGenerationScenarioLimits.generation=registerGenerationLimits;
        registerGenerationScenarioLimits.comparison=comparisonLimits;
        try {dft::sequential::detail::validateRegisterGenerationScenarioLimits(registerGenerationScenarioLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!registerFanout&&!compareRegisterSources&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-register-fanout-");}))
        throw Failure{"invalid_arguments","Fanout limits require --register-control-fanout",2};
    if(registerFanout) {
        if(!registerGeneration||compareRegisterGeneration) throw Failure{"invalid_arguments","--register-control-fanout requires --register-control-generation",2};
        try {dft::sequential::detail::validateRegisterFanoutLimits(fanoutLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!registerSources&&!compareRegisterSources&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-register-source-");}))
        throw Failure{"invalid_arguments","Source limits require --register-control-sources",2};
    if(registerSources) {
        if(!registerFanout) throw Failure{"invalid_arguments","--register-control-sources requires --register-control-fanout",2};
        sourceLimits.fanout=fanoutLimits;
        try {dft::sequential::detail::validateRegisterSourceLimits(sourceLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!compareRegisterSources&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-register-source-scenario-");}))
        throw Failure{"invalid_arguments","Source scenario limits require --compare-register-sources",2};
    if(compareRegisterSources) {
        if(!compareRegisterGeneration||registerFanout||registerSources) throw Failure{"invalid_arguments","--compare-register-sources requires --compare-register-generation and no single source/fanout mode",2};
        sourceLimits.fanout=fanoutLimits;sourceScenarioLimits.sources=sourceLimits;sourceScenarioLimits.generation=registerGenerationScenarioLimits;
        try {dft::sequential::detail::validateRegisterSourceScenarioLimits(sourceScenarioLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceDeltas&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-source-delta-");}))
        throw Failure{"invalid_arguments","Delta limits require --source-coverage-deltas",2};
    if(sourceDeltas) {
        if(!compareRegisterSources) throw Failure{"invalid_arguments","--source-coverage-deltas requires --compare-register-sources",2};
        deltaLimits.scenarios=sourceScenarioLimits;
        try {dft::sequential::detail::validateRegisterSourceDeltaLimits(deltaLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceAttribution&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-source-attribution-");}))
        throw Failure{"invalid_arguments","Attribution limits require --source-bit-attribution",2};
    if(sourceAttribution) {
        if(!sourceDeltas) throw Failure{"invalid_arguments","--source-bit-attribution requires --source-coverage-deltas",2};
        attributionLimits.deltas=deltaLimits;
        try {dft::sequential::detail::validateRegisterSourceAttributionLimits(attributionLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceTransitions&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-source-transition-");}))
        throw Failure{"invalid_arguments","Transition limits require --source-transition-cohorts",2};
    if(sourceTransitions) {
        if(!sourceAttribution) throw Failure{"invalid_arguments","--source-transition-cohorts requires --source-bit-attribution",2};
        transitionLimits.attribution=attributionLimits;
        try {dft::sequential::detail::validateRegisterSourceTransitionLimits(transitionLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceImpact&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-source-impact-");}))
        throw Failure{"invalid_arguments","Impact limits require --source-impact-summary",2};
    if(sourceImpact) {
        if(!sourceTransitions) throw Failure{"invalid_arguments","--source-impact-summary requires --source-transition-cohorts",2};
        impactLimits.transitions=transitionLimits;
        try {dft::sequential::detail::validateRegisterSourceImpactLimits(impactLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceHierarchy&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-source-hierarchy-");}))
        throw Failure{"invalid_arguments","Hierarchy limits require --source-hierarchy-summary",2};
    if(sourceHierarchy) {
        if(!sourceImpact) throw Failure{"invalid_arguments","--source-hierarchy-summary requires --source-impact-summary",2};
        hierarchyLimits.impact=impactLimits;
        try {dft::sequential::detail::validateRegisterSourceHierarchyLimits(hierarchyLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceHierarchyMatrix&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-source-hierarchy-matrix-");}))
        throw Failure{"invalid_arguments","Hierarchy matrix limits require --source-hierarchy-matrix",2};
    if(sourceHierarchyMatrix) {
        if(!sourceHierarchy) throw Failure{"invalid_arguments","--source-hierarchy-matrix requires --source-hierarchy-summary",2};
        hierarchyMatrixLimits.hierarchy=hierarchyLimits;
        try {dft::sequential::detail::validateRegisterSourceHierarchyMatrixLimits(hierarchyMatrixLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceHierarchyRanges&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-source-hierarchy-range-");}))
        throw Failure{"invalid_arguments","Hierarchy range limits require --source-hierarchy-ranges",2};
    if(sourceHierarchyRanges) {
        if(!sourceHierarchyMatrix) throw Failure{"invalid_arguments","--source-hierarchy-ranges requires --source-hierarchy-matrix",2};
        hierarchyRangeLimits.matrix=hierarchyMatrixLimits;
        try {dft::sequential::detail::validateRegisterSourceHierarchyRangeLimits(hierarchyRangeLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceRangeSelection&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--select-")||v.starts_with("--max-source-selection-");}))
        throw Failure{"invalid_arguments","Selection options require --select-source-ranges",2};
    if(sourceRangeSelection) {
        if(!sourceHierarchyRanges) throw Failure{"invalid_arguments","--select-source-ranges requires --source-hierarchy-ranges",2};
        if(bool(selectionLsb)!=bool(selectionWidth)) throw Failure{"invalid_arguments","Selection window requires both --select-lsb and --select-width",2};
        if(selectionLsb) sourceRangeQuery.bits=hier::model::BitRange{*selectionLsb,*selectionWidth};
        try {dft::sequential::detail::validateSourceRangeQuery(sourceRangeQuery);dft::sequential::detail::validateSourceRangeSelectionLimits(sourceSelectionLimits);}
        catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceRangeEvidence&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-source-evidence-");}))
        throw Failure{"invalid_arguments","Evidence limits require --explain-source-ranges",2};
    if(sourceRangeEvidence) {
        if(!sourceRangeSelection) throw Failure{"invalid_arguments","--explain-source-ranges requires --select-source-ranges",2};
        try {dft::sequential::detail::validateSourceRangeEvidenceLimits(sourceEvidenceLimits);}catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceEvidenceLocations&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v.starts_with("--max-source-location-");}))
        throw Failure{"invalid_arguments","Location limits require --locate-source-evidence",2};
    if(sourceEvidenceLocations) {
        if(!sourceRangeEvidence) throw Failure{"invalid_arguments","--locate-source-evidence requires --explain-source-ranges",2};
        try {dft::sequential::detail::validateSourceEvidenceLocationLimits(sourceLocationLimits);}catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    if(!sourceEvidenceExcerpts&&std::any_of(seen.begin(),seen.end(),[](const auto &v) {return v=="--source-excerpt-context-lines"||v.starts_with("--max-source-excerpt-");}))
        throw Failure{"invalid_arguments","Excerpt options require --source-evidence-excerpts",2};
    if(sourceEvidenceExcerpts) {
        if(!sourceEvidenceLocations) throw Failure{"invalid_arguments","--source-evidence-excerpts requires --locate-source-evidence",2};
        try {dft::sequential::detail::validateSourceEvidenceExcerptLimits(sourceExcerptLimits);}catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    }
    auto design = take(hier::Design::open(open));
    if (design->diagnostics(1).errorCount || design->roots().empty())
        throw Failure{"design_invalid", "Design has compile errors or no top; run hier diags for details", 3};
    if (sourceEvidenceExcerpts) {
        const dft::sequential::SourceInvestigationRequest investigation{
            statisticsRequest, registerScenarioRequest, hierarchyRangeLimits, sourceRangeQuery,
            sourceSelectionLimits, sourceEvidenceLimits, sourceLocationLimits, sourceExcerptLimits};
        const auto result = take(dft::sequential::investigateRegisterSources(*design, investigation));
        std::cout << sourceEvidenceExcerptsJson(result.statistics, result.ranges, result.selection,
            result.evidence, result.locations, result.excerpts) << '\n';
        std::cout.flush();
        if (!std::cout) throw Failure{"output_failed", "Could not write source evidence excerpts", 5};
        return requireComplete && !result.excerpts.complete ? 4 : 0;
    }
    if (statistics) {
        const auto report = take(dft::sequential::registerStatistics(*design, statisticsRequest));
        if(sourceHierarchyRanges) {
            const auto ranges=take(dft::sequential::expandRegisterSourceHierarchyRanges(*design,report,registerScenarioRequest,hierarchyRangeLimits));
            if(sourceRangeSelection) {
                const auto selection=take(dft::sequential::selectRegisterSourceHierarchyRanges(ranges,sourceRangeQuery,sourceSelectionLimits));
                if(sourceRangeEvidence) {
                    const auto evidence=take(dft::sequential::explainRegisterSourceSelection(report,ranges,selection,sourceEvidenceLimits));
                    if(sourceEvidenceLocations) {
                        const auto locations=take(dft::sequential::locateSourceEvidence(*design,evidence,sourceLocationLimits));
                        std::cout<<sourceEvidenceLocationsJson(report,ranges,selection,evidence,locations)<<'\n';std::cout.flush();
                        if(!std::cout) throw Failure{"output_failed","Could not write source evidence locations",5};
                        return requireComplete&&!locations.complete?4:0;
                    }
                    std::cout<<sourceRangeEvidenceJson(report,ranges,selection,evidence)<<'\n';std::cout.flush();
                    if(!std::cout) throw Failure{"output_failed","Could not write source range evidence",5};
                    return requireComplete&&!evidence.complete?4:0;
                }
                std::cout<<sourceRangeSelectionJson(report,ranges,selection)<<'\n';std::cout.flush();
                if(!std::cout) throw Failure{"output_failed","Could not write source range selection",5};
                return requireComplete&&!selection.complete?4:0;
            }
            std::cout<<sourceHierarchyRangesJson(report,ranges)<<'\n';std::cout.flush();
            if(!std::cout) throw Failure{"output_failed","Could not write source hierarchy ranges",5};
            return requireComplete&&!ranges.complete?4:0;
        }
        if(sourceHierarchyMatrix) {
            const auto matrix=take(dft::sequential::compareRegisterSourceHierarchyMatrix(*design,report,registerScenarioRequest,hierarchyMatrixLimits));
            std::cout<<sourceHierarchyMatrixJson(report,matrix)<<'\n';std::cout.flush();
            if(!std::cout) throw Failure{"output_failed","Could not write source hierarchy matrix",5};
            return requireComplete&&!matrix.complete?4:0;
        }
        if(sourceHierarchy) {
            const auto hierarchy=take(dft::sequential::compareRegisterSourceHierarchy(*design,report,registerScenarioRequest,hierarchyLimits));
            std::cout<<sourceHierarchyJson(report,hierarchy)<<'\n';std::cout.flush();
            if(!std::cout) throw Failure{"output_failed","Could not write source hierarchy summary",5};
            return requireComplete&&!hierarchy.complete?4:0;
        }
        if(sourceImpact) {
            const auto impact=take(dft::sequential::compareRegisterSourceImpact(*design,report,registerScenarioRequest,impactLimits));
            std::cout<<sourceImpactJson(report,impact)<<'\n';std::cout.flush();
            if(!std::cout) throw Failure{"output_failed","Could not write source impact summary",5};
            return requireComplete&&!impact.complete?4:0;
        }
        if(sourceTransitions) {
            const auto transitions=take(dft::sequential::compareRegisterSourceTransitions(*design,report,registerScenarioRequest,transitionLimits));
            std::cout<<sourceTransitionsJson(report,transitions)<<'\n';std::cout.flush();
            if(!std::cout) throw Failure{"output_failed","Could not write source transition cohorts",5};
            return requireComplete&&!transitions.complete?4:0;
        }
        if(sourceAttribution) {
            const auto attribution=take(dft::sequential::compareRegisterSourceAttribution(*design,report,registerScenarioRequest,attributionLimits));
            std::cout<<sourceAttributionJson(report,attribution)<<'\n';std::cout.flush();
            if(!std::cout) throw Failure{"output_failed","Could not write source bit attribution",5};
            return requireComplete&&!attribution.complete?4:0;
        }
        if(sourceDeltas) {
            const auto deltas=take(dft::sequential::compareRegisterSourceDeltas(*design,report,registerScenarioRequest,deltaLimits));
            std::cout<<sourceDeltasJson(report,deltas)<<'\n';std::cout.flush();
            if(!std::cout) throw Failure{"output_failed","Could not write source coverage deltas",5};
            return requireComplete&&!deltas.complete?4:0;
        }
        if(compareRegisterSources) {
            const auto batch=take(dft::sequential::compareRegisterSourceScenarios(*design,report,registerScenarioRequest,sourceScenarioLimits));
            std::cout<<registerSourceScenariosJson(report,batch)<<'\n';std::cout.flush();
            if(!std::cout) throw Failure{"output_failed","Could not write source scenario matrix",5};
            return requireComplete&&!batch.complete?4:0;
        }
        if (registerScenarios && compareRegisterGeneration) {
            const auto batch=take(dft::sequential::compareRegisterGenerationScenarios(*design,report,registerScenarioRequest,registerGenerationScenarioLimits));
            std::cout<<registerGenerationScenariosJson(report,batch)<<'\n';std::cout.flush();
            if(!std::cout) throw Failure{"output_failed","Could not write register generation scenarios",5};
            return requireComplete&&!batch.complete?4:0;
        }
        if (registerScenarios) {
            const auto batch=take(dft::sequential::compareRegisterScenarios(*design,report,registerScenarioRequest));
            std::cout<<registerScenariosJson(report,batch)<<'\n';std::cout.flush();
            if (!std::cout) throw Failure{"output_failed","Could not write register scenario report",5};
            return requireComplete && !batch.complete ? 4 : 0;
        }
        if (includeProfile) {
            const auto profiled = take(dft::sequential::profileRegisterControls(*design, report, profileOptions));
            if (registerGeneration) {
                const auto generated=take(dft::sequential::registerControlGeneration(*design,report,profiled,registerGenerationLimits));
                if(registerSources) {
                    const auto sources=take(dft::sequential::summarizeRegisterControlSources(report,profiled,generated,sourceLimits));
                    std::cout<<registerSourcesJson(report,profiled,generated,sources)<<'\n';std::cout.flush();
                    if(!std::cout) throw Failure{"output_failed","Could not write register control sources",5};
                    return requireComplete&&!sources.complete?4:0;
                }
                if(registerFanout) {
                    const auto fanout=take(dft::sequential::registerGenerationFanout(report,profiled,generated,fanoutLimits));
                    std::cout<<registerFanoutJson(report,profiled,generated,fanout)<<'\n';std::cout.flush();
                    if(!std::cout) throw Failure{"output_failed","Could not write register fanout",5};
                    return requireComplete&&!fanout.complete?4:0;
                }
                std::cout<<registerGenerationJson(report,profiled,generated)<<'\n';std::cout.flush();
                if (!std::cout) throw Failure{"output_failed","Could not write register control generation",5};
                return requireComplete && !generated.complete?4:0;
            }
            if (includeResolved) {
                const auto grouped = take(dft::sequential::groupResolvedRegisterEvents(report,profiled,resolvedLimits));
                std::cout << resolvedJson(report,profiled,grouped) << '\n';std::cout.flush();
                if (!std::cout) throw Failure{"output_failed", "Could not write resolved register events", 5};
                return requireComplete && !grouped.complete ? 4 : 0;
            }
            std::cout << profileJson(report, profiled) << '\n'; std::cout.flush();
            if (!std::cout) throw Failure{"output_failed", "Could not write register control profile", 5};
            return requireComplete && !profiled.complete ? 4 : 0;
        }
        std::optional<dft::sequential::RegisterEventGroups> grouped;
        if (eventGroups) grouped = take(dft::sequential::groupRegisterEvents(report, eventGroupLimits));
        std::cout << (grouped ? eventGroupsJson(report, *grouped) : statisticsJson(report)) << '\n'; std::cout.flush();
        if (!std::cout) throw Failure{"output_failed", "Could not write register statistics", 5};
        return requireComplete && (!report.complete || (grouped && !grouped->complete)) ? 4 : 0;
    }
    if (!scenarios.scenarios.empty()) {
        scenarios.common = request;
        const auto batch = take(dft::sequential::compareScenarios(*design, scenarios));
        std::vector<InventoryEntry> inventories;
        bool complete = batch.complete;
        if (includeInventory) for (size_t i = 0; i < batch.scenarios.size(); ++i) {
            if (!batch.scenarios[i].report) continue;
            auto inventory = take(dft::sequential::inventorySources(*batch.scenarios[i].report, inventoryLimits));
            complete = complete && inventory.complete;
            inventories.emplace_back(i, std::move(inventory));
        }
        const bool baseComplete = complete;
        std::vector<GenerationEntry> graphs;
        if (includeGeneration) for (size_t i = 0; i < batch.scenarios.size(); ++i) {
            if (!batch.scenarios[i].report) continue;
            const auto &r = *batch.scenarios[i].report;
            auto graph = take(dft::sequential::controlGeneration(*design, r, generationLimits));
            complete = complete && graph.complete;
            graphs.push_back({i, std::move(graph), !r.clockRoots.empty(), !r.inputValues.empty()});
        }
        const auto base = [&](JsonWriter &w) {
            if (includeInventory) writeInventory(w, inventories, batch.complete, inventoryLimits,
                [&](JsonWriter &writer) { scenarioJson(writer, batch); });
            else scenarioJson(w, batch);
        };
        const bool generationComplete = complete;
        std::optional<dft::sequential::GenerationComparisonReport> comparison;
        if (compareGeneration) {
            std::vector<dft::sequential::GenerationContext> contexts;
            for (const auto &entry : graphs) contexts.push_back({*entry.scenario, std::cref(entry.graph)});
            comparison = take(dft::sequential::compareGenerationScenarios(batch, contexts, comparisonLimits));
            complete = complete && comparison->complete;
        }
        const auto output = comparison ? generationComparisonJson(*comparison, generationComplete,
            [&](JsonWriter &w) { writeGeneration(w, graphs, baseComplete, generationLimits, base); }) :
            includeGeneration ? generationJson(graphs, baseComplete, generationLimits, base) :
            includeInventory ? inventoryJson(inventories, batch.complete, inventoryLimits,
                [&](JsonWriter &w) { scenarioJson(w, batch); }) : json(batch);
        std::cout << output << '\n'; std::cout.flush();
        if (!std::cout) throw Failure{"output_failed", "Could not write scenario report", 5};
        if (requireComplete && !complete) return 4;
        const auto errors = [](const auto &item) {
            return item.report && std::any_of(item.report->findings.begin(), item.report->findings.end(),
                [](const auto &finding) { return finding.severity == "error"; });
        };
        return failOnError && std::any_of(batch.scenarios.begin(), batch.scenarios.end(), errors) ? 1 : 0;
    }
    const auto report = take(dft::sequential::analyze(*design, request));
    // Serialize before writing: failures never publish half a successful report.
    std::vector<InventoryEntry> inventories;
    bool complete = report.complete;
    if (includeInventory) {
        auto inventory = take(dft::sequential::inventorySources(report, inventoryLimits));
        complete = complete && inventory.complete;
        inventories.emplace_back(std::nullopt, std::move(inventory));
    }
    const bool baseComplete = complete;
    std::vector<GenerationEntry> graphs;
    if (includeGeneration) {
        auto graph = take(dft::sequential::controlGeneration(*design, report, generationLimits));
        complete = complete && graph.complete;
        graphs.push_back({{}, std::move(graph), !report.clockRoots.empty(), !report.inputValues.empty()});
    }
    const auto base = [&](JsonWriter &w) {
        if (includeInventory) writeInventory(w, inventories, report.complete, inventoryLimits,
            [&](JsonWriter &writer) { reportJson(writer, report); });
        else reportJson(w, report);
    };
    const auto output = includeGeneration ? generationJson(graphs, baseComplete, generationLimits, base) :
        includeInventory ? inventoryJson(inventories, report.complete, inventoryLimits,
            [&](JsonWriter &w) { reportJson(w, report); }) : json(report);
    std::cout << output << '\n';
    std::cout.flush();
    if (!std::cout) throw Failure{"output_failed", "Could not write analysis report", 5};
    if (requireComplete && !complete) return 4;
    return failOnError && std::any_of(report.findings.begin(), report.findings.end(),
        [](const auto &finding) { return finding.severity == "error"; }) ? 1 : 0;
}
} // namespace
static int mainWithoutOutput(int argc, char **argv) {
    try { return run(argc, argv); }
    catch (const Failure &error) {
        JsonWriter w;
        w.beginObject().key("error").beginObject().key("code").value(error.code)
            .key("message").value(error.message).endObject().endObject();
        std::cout << w.str() << '\n'; return error.exit;
    } catch (const std::exception &error) {
        JsonWriter w;
        w.beginObject().key("error").beginObject().key("code").value("analysis_failed")
            .key("message").value(error.what()).endObject().endObject();
        std::cout << w.str() << '\n'; return 5;
    }
}

int main(int argc, char **argv) {
    return dft::cli::withReportOutput(argc, argv, mainWithoutOutput, false);
}
