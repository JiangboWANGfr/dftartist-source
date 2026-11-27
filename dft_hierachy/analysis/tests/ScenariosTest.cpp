#include "ScenariosInternal.h"
#include "ConstantValue.h"
#include <iostream>
#include <stdexcept>

namespace {
void require(bool value, const char *message) {
    if (!value) throw std::runtime_error(message);
}
}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;
    open.files = {DFT_FIXTURE, DFT_GATES_FIXTURE}; open.tops = {"gates_primary"};
    auto design = hier::Design::open(open); require(bool(design), "Open real Core fixture");
    ScenarioRequest request;
    request.common.scope = "gates_primary"; request.common.recursive = true; request.common.resolveLogic = true;
    request.scenarios = {{"off", {{{"gates_primary.en", 0}, false}}}, {"on", {{{"gates_primary.en", 0}, true}}}};
    std::stop_source stop; stop.request_stop();
    auto cancelled = compareScenarios(**design, request, stop.get_token());
    require(!cancelled && cancelled.error().code == hier::ErrorCode::Cancelled, "Precancel publishes no batch");
    auto expired = detail::compareScenariosWithDeadline(**design, request, std::chrono::steady_clock::time_point{}, {});
    require(bool(expired) && !expired->complete && expired->scenarios.size() == 2 &&
        !expired->scenarios[0].report && !expired->scenarios[1].report &&
        expired->scenarios[1].inputValuesRequested[0].high, "Expired shared deadline preserves unexecuted requests");
    request.common.scope = "absent";
    auto absent = detail::compareScenariosWithDeadline(**design, request, std::chrono::steady_clock::time_point{}, {});
    require(!absent && absent.error().code == hier::ErrorCode::NotFound, "Expired deadline cannot hide missing scope");
    request.common.scope = "gates_primary"; request.common.maxMillis = 0;
    auto invalid = compareScenarios(**design, request);
    require(!invalid && invalid.error().code == hier::ErrorCode::BadRequest, "Validate original time before clamp");
    request.common.maxMillis = 30000;
    auto report = compareScenarios(**design, request);
    require(bool(report) && report->complete && report->scenarios.size() == 2 &&
        report->comparisons[0].controls.size() == 2, "Execute two complete cases on one Design");
    size_t changed = 0;
    for (const auto &row : report->comparisons[0].controls) changed += row.status == "changed" ? 1u : 0u;
    require(changed == 1 && report->scenarios[0].report->findings.size() == 1 &&
        report->scenarios[1].report->findings.empty(), "Opposite static gate states compare without discarding errors");
    request.scenarios[1].inputValues[0].input.path = "gates_primary.q";
    auto error = compareScenarios(**design, request);
    require(!error && error.error().code == hier::ErrorCode::BadRequest, "Bad second case returns only error");
    request.scenarios[1].inputValues[0].input.path = "gates_primary.en";
    auto again = compareScenarios(**design, request);
    require(bool(again) && again->complete && again->scenarios[1].report->findings.empty(), "Reuse after error and previous opposite contexts");
    request.common.inputValues = {{{"gates_primary.en", 0}, true}};
    require(!compareScenarios(**design, request), "No implicit common input overrides");
    request.common.inputValues.clear(); request.scenarios[1].inputValues.assign(65, {{"gates_primary.en", 0}, true});
    require(!compareScenarios(**design, request), "Per-case input budget validates before execution");
    Request old{"gates_primary", true, 10000, 10000, 1000, 10000, 40000, 64, 30000};
    auto legacy = analyze(**design, old);
    require(bool(legacy) && !legacy->request.resolveLogic && legacy->inputValues.empty(), "Original analyze API remains source-compatible");
    require(detail::constantBit("1'bx", 1, 0) == 'x' && detail::constantBit("4'b10z1", 4, 1) == 'z' &&
        !detail::constantBit("4'hf", 4, 0) && !detail::constantBit("1'b2", 1, 0) &&
        !detail::constantBit("1'b0", 1, 1) && !detail::constantBit("2'b0", 1, 0), "Shared structured constants retain strict grammar");
    design.value().reset();
    require(!report->snapshot.snapshotId.empty() && report->scenarios[1].report->inputValues[0].high &&
        !report->comparisons[0].controls[0].point.slice.ref.empty(), "All reports and comparisons survive Design release");
    std::cout << "Scenarios: deadline, validation, cancellation, isolation, compatibility and ownership passed\n";
    return 0;
} catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
