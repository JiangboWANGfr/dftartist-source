#include "GenerationComparisonInternal.h"
#include <algorithm>
#include <iostream>
#include <stdexcept>
namespace { void need(bool value, const char *message) { if (!value) throw std::runtime_error(message); } }
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open; open.files = {DFT_FIXTURE, DFT_GENERATION_FIXTURE}; open.tops = {"generation_mode"};
    auto design = hier::Design::open(open); need(bool(design), "open Core");
    ScenarioRequest request; request.common.scope = "generation_mode.u"; request.common.resolveLogic = true;
    request.scenarios = {{"DERIVED", {{{"generation_mode.sel", 0}, false}}}, {"BYPASS", {{{"generation_mode.sel", 0}, true}}}};
    auto batch = compareScenarios(**design, request); need(bool(batch) && batch->complete, "scenario batch");
    std::vector<ControlGeneration> graphs;
    for (const auto &s : batch->scenarios) {
        auto graph = controlGeneration(**design, *s.report); need(bool(graph) && graph->complete, "graph");
        graphs.push_back(std::move(*graph));
    }
    std::vector<GenerationContext> contexts{{0, std::cref(graphs[0])}, {1, std::cref(graphs[1])}};
    auto report = compareGenerationScenarios(*batch, contexts);
    need(bool(report) && report->complete, "complete structure comparison");
    size_t changes = 0; for (const auto &row : report->comparisons[0].controls) changes += row.status == "changed";
    need(changes == 1 && batch->comparisons[0].controls[0].status == "unchanged", "find hidden upstream change without altering direct comparison");
    std::stop_source stop; stop.request_stop();
    auto cancelled = compareGenerationScenarios(*batch, contexts, {}, stop.get_token());
    need(!cancelled && cancelled.error().code == hier::ErrorCode::Cancelled, "pre-cancel Error only");
    auto expired = detail::compareGenerationWithDeadline(*batch, contexts, {}, {}, {});
    need(bool(expired) && !expired->complete && expired->work == 0 && expired->processedCones == 0, "expired deterministic seam");
    GenerationComparisonLimits limits; limits.maxMillis = 0;
    need(!compareGenerationScenarios(*batch, contexts, limits), "invalid limits");
    auto bad = graphs[1]; bad.snapshotId = "other";
    auto inputs = contexts; inputs[1].graph = std::cref(bad);
    need(!compareGenerationScenarios(*batch, inputs), "snapshot mismatch rejected");
    bad = graphs[1]; bad.seeds[0].node = 10000;
    need(!compareGenerationScenarios(*batch, inputs), "seed out of range rejected");
    bad = graphs[1]; bad.generators[0].page = 100000;
    need(!compareGenerationScenarios(*batch, inputs), "lookup out of range rejected");
    bad = graphs[1]; bad.nodes[0].source->sourceRef.reset();
    need(!compareGenerationScenarios(*batch, inputs), "malformed source rejected before dereference");
    auto equalBatch = *batch; equalBatch.scenarios[1] = equalBatch.scenarios[0];
    auto reordered = graphs[0]; const auto size = reordered.nodes.size();
    std::reverse(reordered.nodes.begin(), reordered.nodes.end());
    const auto remap = [&](size_t n) { return size - n - 1; };
    for (auto &s : reordered.seeds) s.node = remap(s.node);
    for (auto &g : reordered.generators) {
        if (g.clockNode) g.clockNode = remap(*g.clockNode);
        for (auto &n : g.asyncNodes) if (n) n = remap(*n);
    }
    for (auto &cycle : reordered.cycles) for (auto &n : cycle.controls) n = remap(n);
    inputs[1].graph = std::cref(reordered);
    auto equal = compareGenerationScenarios(equalBatch, inputs);
    need(bool(equal) && equal->complete && std::all_of(equal->comparisons[0].controls.begin(), equal->comparisons[0].controls.end(),
        [](const auto &r) { return r.status == "unchanged"; }), "node numbering not structural identity");
    auto notRun = *batch; notRun.scenarios[0].report.reset(); notRun.complete = false;
    std::vector<GenerationContext> one{{1, std::cref(graphs[1])}};
    auto missing = compareGenerationScenarios(notRun, one);
    need(bool(missing) && !missing->complete && missing->comparisons[0].reasons[0] == "baseline_not_run" &&
        std::all_of(missing->comparisons[0].controls.begin(), missing->comparisons[0].controls.end(),
            [](const auto &r) { return r.status == "unresolved"; }), "not-run is never unchanged");
    auto again = compareGenerationScenarios(*batch, contexts); need(bool(again) && again->complete, "reuse after errors");
    design.value().reset(); batch = hier::Error{hier::ErrorCode::Internal, "release"}; graphs.clear();
    need(!report->snapshotId.empty() && !report->contexts[0].cones[0].nodes.empty() &&
        !report->comparisons[0].controls[0].point.slice.ref.empty(), "result owns point and witness index containers");
    std::cout << "Generation comparison real source change, numbering, input errors, cancellation, reuse and ownership passed\n";
    return 0;
} catch (const std::exception &e) { std::cerr << e.what() << '\n'; return 1; }
