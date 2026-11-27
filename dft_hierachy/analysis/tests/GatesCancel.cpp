#include "Check.h"
#include <iostream>
#include <stdexcept>
namespace {
void require(bool condition, const char *message) {
    if (!condition) throw std::runtime_error(message);
}
}
int main() {
    try {
        hier::model::OpenOptions open;
        open.files = {DFT_FIXTURE, DFT_GATES_FIXTURE}; open.tops = {"gates_generated"};
        auto design = hier::Design::open(open); require(bool(design), "Open real rooted gate fixture");
        const dft::sequential::Request legacy{"gates_generated", true, 10000, 10000, 1000, 10000, 40000, 64, 30000};
        require(legacy.clockRoots.empty() && !legacy.resolveLogic, "Original aggregate source call remains structural");
        dft::sequential::Request request; request.scope = "gates_generated";
        request.recursive = true; request.resolveLogic = true;
        request.clockRoots.push_back({"gates_generated.clk", 0});
        std::stop_source stop; stop.request_stop();
        auto cancelled = dft::sequential::analyze(**design, request, stop.get_token());
        require(!cancelled && cancelled.error().code == hier::ErrorCode::Cancelled, "Pre-cancel returns no report");
        auto report = dft::sequential::analyze(**design, request);
        require(bool(report) && report->clockRoots.size() == 1, "Root resolution after cancellation");
        require(report->findings.size() == 1 && report->findings[0].rule == "CLK-GATED", "Actual rooted gate finding");
        request.clockRoots.clear();
        auto plain = dft::sequential::analyze(**design, request);
        require(bool(plain) && plain->clockRoots.empty() && plain->findings.empty(), "No root history in next query");
        request.clockRoots = {{"gates_generated.clk", 0}, {"clk", 0}};
        const auto duplicate = dft::sequential::analyze(**design, request);
        require(!duplicate && duplicate.error().code == hier::ErrorCode::BadRequest, "Reject duplicate resolved bit");
        request.clockRoots.clear(); request.scope = "absent";
        const auto missing = dft::sequential::analyze(**design, request);
        require(!missing && missing.error().code == hier::ErrorCode::NotFound, "Library missing scope policy");
        design.value().reset();
        const auto &control = report->checks[report->findings[0].check];
        require(control.logic && control.logic->result.gate.has_value(), "Report owns gate index after Design release");
        const auto &gate = control.logic->gates[*control.logic->result.gate];
        require(gate.clock.sourceRef == report->clockRoots[0].point.slice.ref && gate.enable.verdict == "generated",
                "Report owns source/gate/root values after Design release");
        std::cout << "Rooted gates cancellation, reuse, errors and owned report passed\n";
        return 0;
    } catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
