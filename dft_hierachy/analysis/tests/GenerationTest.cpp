#include "GenerationInternal.h"
#include <iostream>
#include <stdexcept>
namespace { void need(bool value, const char *message) { if (!value) throw std::runtime_error(message); } }
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open; open.files = {DFT_FIXTURE, DFT_GENERATION_FIXTURE}; open.tops = {"generation_chain"};
    auto d = hier::Design::open(open); need(bool(d), "open real Core");
    Request request; request.scope = "generation_chain.u"; request.resolveLogic = true;
    auto r = analyze(**d, request); need(bool(r) && r->complete && r->registers.size() == 1, "one scoped seed fact");
    auto graph = controlGeneration(**d, *r);
    need(bool(graph) && graph->complete && graph->generators.size() == 2 && graph->nodes.size() == 5, "expand two generating stages outside scope");
    need(graph->generators[0].signalPath == "generation_chain.second" && graph->generators[1].signalPath == "generation_chain.first", "preserve true generator order");
    need(graph->registerFacts == 2 && graph->registerPages.size() == 1, "cache original owner pages within call");
    std::stop_source stop; stop.request_stop();
    auto cancelled = controlGeneration(**d, *r, {}, stop.get_token());
    need(!cancelled && cancelled.error().code == hier::ErrorCode::Cancelled, "pre-cancel returns error only");
    auto expired = detail::generationWithDeadline(**d, *r, {}, {}, {});
    need(bool(expired) && !expired->complete && expired->work == 0 && expired->seeds.empty(), "deterministic expired deadline");
    auto bad = *r; bad.snapshot.snapshotId = "not-this-snapshot";
    auto mismatch = controlGeneration(**d, bad);
    need(!mismatch && mismatch.error().code == hier::ErrorCode::BadRequest, "reject a different snapshot before following refs");
    bad = *r; bad.registers[0].clockCheck = 9999;
    need(!controlGeneration(**d, bad), "reject malformed report event reference");
    bad = *r; bad.request.resolveLogic = false;
    need(!controlGeneration(**d, bad), "no implicit logic mode upgrade");
    GenerationLimits limits; limits.maxMillis = 0;
    need(!controlGeneration(**d, *r, limits), "validate budget before chrono cast");
    limits = {}; limits.maxDepth = 0;
    auto zero = controlGeneration(**d, *r, limits);
    need(bool(zero) && !zero->complete && zero->generators.empty(), "zero depth retains seed proof without expansion");
    limits = {}; limits.maxWork = 1;
    auto work = controlGeneration(**d, *r, limits); need(bool(work) && !work->complete && work->work == 1, "shared work cap");
    auto again = controlGeneration(**d, *r); need(bool(again) && again->complete, "reuse after invalid/cancelled/truncated requests");
    d.value().reset(); r = hier::Error{hier::ErrorCode::Internal, "discard source report"};
    const auto &g = graph->generators[0];
    need(graph->registerPages[g.page].response.result.items[g.item].ref == g.fact.ref &&
         !graph->nodes[*g.clockNode].control->logic->steps.empty(), "raw pages and new control evidence survive Design/report release");
    std::cout << "Generation graph snapshot, scoped expansion, budgets, cancellation, reuse and ownership passed\n";
    return 0;
} catch (const std::exception &e) { std::cerr << e.what() << '\n'; return 1; }
