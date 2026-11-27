#include "SourceLogic.h"
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
        open.files = {DFT_FIXTURE, DFT_LOGIC_FIXTURE}; open.tops = {"logic_buffer"};
        auto design = hier::Design::open(open);
        require(bool(design), "Open real logic fixture");
        const auto root = (*design)->roots().front();
        const auto signals = (*design)->signals(root.ref);
        require(bool(signals), "Read actual signals");
        std::string signal;
        for (const auto &s : signals->items) if (s.name == "buffered") signal = s.ref;
        require(!signal.empty(), "Find original buffered signal");
        // Existing aggregate source callers keep their original field positions.
        const dft::sequential::Request legacy{"logic_buffer", true, 10000, 10000, 1000, 10000, 40000, 64, 30000};
        require(!legacy.resolveLogic && legacy.maxMillis == 30000, "Legacy aggregate request stays structural");
        const hier::model::TracePoint point{{signal, {0, 1}}, {}};
        dft::sequential::Request request; request.scope = root.pathText; request.resolveLogic = true;
        uint64_t work = 0;
        std::stop_source stop; stop.request_stop();
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(30);
        bool cancelled = false;
        try {
            (void)dft::sequential::detail::resolveSource(**design, point, request, {root.ref}, work, deadline, stop.get_token());
        } catch (const hier::Error &error) { cancelled = error.code == hier::ErrorCode::Cancelled; }
        require(cancelled && work == 0, "Cancelled proof must stop without work/publication");
        const auto result = dft::sequential::detail::resolveSource(**design, point, request, {root.ref}, work, deadline, {});
        require(result.result.verdict == "primary_input" && work > 0, "Fresh proof after cancellation");
        request.maxLogicWork = 0;
        const auto invalid = dft::sequential::analyze(**design, request);
        require(!invalid && invalid.error().code == hier::ErrorCode::BadRequest, "Reject invalid logic budget");
        std::cout << "Logic cancellation, reuse and argument validation passed\n";
        return 0;
    } catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
