#include "Check.h"
#include <iostream>
#include <stdexcept>

namespace {
void require(bool value, const char *message) {
    if (!value) throw std::runtime_error(message);
}
}
int main() {
    try {
        hier::model::OpenOptions open;
        open.files = {DFT_FIXTURE, DFT_GATES_FIXTURE}; open.tops = {"gates_primary"};
        auto design = hier::Design::open(open); require(bool(design), "Open real conditional gate fixture");
        const auto snapshot = (*design)->snapshot();
        const dft::sequential::Request legacy{"gates_primary", true, 10000, 10000, 1000, 10000, 40000, 64, 30000};
        require(legacy.inputValues.empty() && !legacy.resolveLogic, "Original aggregate call remains structural");
        std::vector<dft::sequential::ClockRootInput> oldRoots{{"gates_primary.clk", 0}};
        dft::sequential::Request request; request.scope = "gates_primary"; request.recursive = true;
        request.resolveLogic = true; request.clockRoots = oldRoots;
        request.inputValues = {{{"gates_primary.en", 0}, true}};
        std::stop_source stop; stop.request_stop();
        const auto cancelled = dft::sequential::analyze(**design, request, stop.get_token());
        require(!cancelled && cancelled.error().code == hier::ErrorCode::Cancelled, "Pre-cancel publishes no conditional report");
        auto opened = dft::sequential::analyze(**design, request);
        require(bool(opened) && opened->complete && opened->findings.empty(), "Enable one opens clock under context");
        const auto index = *opened->registers[0].clockCheck;
        require(opened->checks[index].verdict == "primary_input", "Chosen clock source is primary");
        require(opened->checks[index].logic->appliedInputs == std::vector<size_t>{0}, "Record actual input read");
        request.inputValues[0].high = false;
        const auto closed = dft::sequential::analyze(**design, request);
        require(bool(closed) && closed->complete && closed->findings.size() == 1 &&
                closed->findings[0].rule == "CLK-UNCTRL", "Opposite context has independent closed gate result");
        request.inputValues.clear();
        const auto noContext = dft::sequential::analyze(**design, request);
        require(bool(noContext) && !noContext->complete && noContext->inputValues.empty() && noContext->findings.empty(),
                "Clear context returns original gated/partial mode with no stale value");
        request.inputValues = {{{"gates_primary.en", 0}, true}, {{"en", 0}, false}};
        const auto duplicate = dft::sequential::analyze(**design, request);
        require(!duplicate && duplicate.error().code == hier::ErrorCode::BadRequest, "Reject duplicate semantic input bit");
        request.inputValues.assign(65, {{"gates_primary.en", 0}, true});
        const auto excessive = dft::sequential::analyze(**design, request);
        require(!excessive && excessive.error().code == hier::ErrorCode::BadRequest, "Reject oversized input context");
        require((*design)->snapshot().snapshotId == snapshot.snapshotId && (*design)->snapshot().inputHash == snapshot.inputHash,
                "Conditional analysis does not alter the Core snapshot");
        auto resolved = (*design)->resolvePath("gates_primary.en"); require(bool(resolved), "Resolve original en objects");
        std::string signal;
        for (const auto &ref : resolved->result) {
            auto object = (*design)->object(ref);
            if (object && object->kind == "signal") signal = ref;
        }
        hier::ConnectionRequest connection; connection.reach = "hier"; connection.bits = hier::model::BitRange{0, 1};
        const auto original = (*design)->step(signal, true, connection);
        require(bool(original) && original->result.hops.size() == 1 && original->result.hops[0].kind == "top_port" &&
                !original->result.hops[0].value, "Core driver remains an original port, not a forced constant");
        const dft::sequential::ClockRoot oldRootName = opened->clockRoots[0];
        design.value().reset();
        require(opened->inputValues[0].input.path == "gates_primary.en" && opened->inputValues[0].high &&
                !oldRootName.point.slice.ref.empty() && opened->checks[index].logic->appliedInputs[0] == 0,
                "Owned context and proof survive Design release; old root type name remains source-compatible");
        std::cout << "Input values cancellation, context isolation, ownership and Core immutability passed\n";
        return 0;
    } catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
