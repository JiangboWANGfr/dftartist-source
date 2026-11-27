#include "ClockUsage.h"
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
        open.files = {DFT_FIXTURE, DFT_USAGE_FIXTURE}; open.tops = {"usage_direct"};
        auto design = hier::Design::open(open);
        require(bool(design), "Open real usage fixture");
        const auto root = (*design)->roots().front();
        const auto registers = (*design)->registers(root.ref);
        require(bool(registers) && registers->result.items.size() == 1, "Find original clock occurrence");
        const auto &clock = registers->result.items.front().clock;
        const hier::model::TracePoint point{{clock.signal, clock.bits}, {}};
        const dft::sequential::Request legacy{"usage_direct", true, 10000, 10000, 1000, 10000, 40000, 64, 30000};
        require(!legacy.resolveLogic && !legacy.analyzeClockUsage, "Legacy aggregate remains structural");
        dft::sequential::Request request; request.scope = root.pathText;
        request.resolveLogic = true; request.analyzeClockUsage = true;
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(30);
        uint64_t work = 0;
        std::stop_source stop; stop.request_stop();
        bool cancelled = false;
        try {
            (void)dft::sequential::detail::clockUsage(**design, point, request, work, deadline, stop.get_token());
        } catch (const hier::Error &error) { cancelled = error.code == hier::ErrorCode::Cancelled; }
        require(cancelled && work == 0, "Pre-cancel without published proof");
        const auto proof = dft::sequential::detail::clockUsage(**design, point, request, work, deadline, {});
        require(proof.complete && proof.witnesses.size() == 1 && work > 0, "Fresh proof after cancellation");
        work = 0;
        const auto expired = dft::sequential::detail::clockUsage(**design, point, request, work,
            std::chrono::steady_clock::now() - std::chrono::seconds(1), {});
        require(!expired.complete && expired.witnesses.empty() && work == 0, "Expired deadline stops deterministically");
        request.resolveLogic = false;
        auto invalid = dft::sequential::analyze(**design, request);
        require(!invalid && invalid.error().code == hier::ErrorCode::BadRequest, "Usage requires logic mode");
        request.resolveLogic = true; request.maxUsageWork = 0;
        invalid = dft::sequential::analyze(**design, request);
        require(!invalid && invalid.error().code == hier::ErrorCode::BadRequest, "Reject zero work budget");
        std::cout << "Clock usage cancellation, deadline, reuse and compatibility passed\n";
        return 0;
    } catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
