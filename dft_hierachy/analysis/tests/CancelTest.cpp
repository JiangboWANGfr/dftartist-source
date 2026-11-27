#include "Check.h"
#include <iostream>
#include <stdexcept>

namespace {
void require(bool value, const char *message) {
    if (!value) throw std::runtime_error(message);
}
void cancellation() {
    hier::model::OpenOptions options;
    options.files = {DFT_FIXTURE}; options.tops = {"clean"};
    auto opened = hier::Design::open(options);
    require(bool(opened), "Open clean fixture");
    dft::sequential::Request request; request.scope = "clean"; request.recursive = true;
    std::stop_source source; source.request_stop();
    const auto result = dft::sequential::analyze(**opened, request, source.get_token());
    require(!result, "Cancelled call must not return a report");
    require(result.error().code == hier::ErrorCode::Cancelled, "Cancellation cause");
    const auto next = dft::sequential::analyze(**opened, request);
    require(bool(next), "Next analysis remains usable");
    require(next->registers.size() == 2, "Both occurrences of register facts");
    require(next->findings.empty(), "No spurious violations");
}

void budgets() {
    hier::model::OpenOptions options;
    options.files = {DFT_FIXTURE}; options.tops = {"empty"};
    auto opened = hier::Design::open(options); require(bool(opened), "Open empty fixture");
    dft::sequential::Request request; request.scope = "empty"; request.maxChecks = 0;
    const auto result = dft::sequential::analyze(**opened, request);
    require(!result, "Invalid budget must not return a report");
    require(result.error().code == hier::ErrorCode::BadRequest, "Invalid argument cause");
}
} // namespace
int main() {
    try { cancellation(); budgets(); std::cout << "Cancellation and budget validation passed\n"; return 0; }
    catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
