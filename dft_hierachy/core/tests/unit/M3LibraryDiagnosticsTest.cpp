// Agent B independent diagnostic gate. No frontend, Slang or C/A probe includes.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include <filesystem>
#include <tuple>

using namespace hier;
namespace {
struct DiagnosticLibrary final : model::LibraryProvider {
    uint32_t width;
    explicit DiagnosticLibrary(uint32_t bits) : width(bits) {}
    std::optional<model::CellInfo> cell(std::string_view name) const override {
        if (name != "absent_diag") return {};
        model::CellInfo result;
        result.pins = {{"A", model::Direction::In, width, {}}};
        return result;
    }
};
std::unique_ptr<Design> openDiagnostic(std::string top, uint32_t width, bool per, size_t cache) {
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/m3/library_diagnostics.sv"};
    options.tops = {std::move(top)};
    options.defines = {"B_DIAG_WIDTH=" + std::to_string(width)};
    options.library = std::make_shared<DiagnosticLibrary>(width);
    options.forcePerInstanceBodies = per;
    options.connectionCacheBytes = cache;
    auto result = Design::open(options);
    REQUIRE(result.ok()); // An erroneous design remains browseable; errors are diagnostics.
    return std::move(result.value());
}
using DiagnosticRows = std::vector<std::tuple<bool, std::string, std::string, uint32_t>>;
DiagnosticRows rows(const model::Diagnostics& diagnostics) {
    DiagnosticRows result;
    for (const auto& item : diagnostics.items)
        result.emplace_back(item.isError, item.message, item.file, item.line);
    return result;
}
void checkError(std::string top, uint32_t connectionLine, bool per, size_t cache) {
    auto d = openDiagnostic(top, 6, per, cache);
    const auto initial = d->diagnostics();
    CHECK(initial.errorCount == 1);
    CHECK_FALSE(initial.truncated);
    size_t errors = 0;
    for (const auto& item : initial.items) if (item.isError) {
        ++errors;
        CHECK_FALSE(item.message.empty());
        CHECK(std::filesystem::path(item.file).filename() == "library_diagnostics.sv");
        CHECK(item.line == connectionLine);
    }
    CHECK(errors == 1);
    REQUIRE(d->roots().size() == 1);
    const auto owner = d->roots()[0].ref;
    for (int iteration = 0; iteration < 3; ++iteration) {
        // Querying bad connections may fail or be partial; it must not crash,
        // erase/duplicate diagnostics, or make verifyFacts silently succeed.
        (void)d->bindings(owner);
        auto processes = d->procs(owner);
        if (processes.ok()) for (const auto& p : processes->items) (void)d->proc(p.ref);
        const auto check = d->verifyFacts();
        CHECK(check.mismatched > 0);
        CHECK_FALSE(check.issues.empty());
        const auto now = d->diagnostics();
        CHECK(now.errorCount == initial.errorCount);
        CHECK(now.warningCount == initial.warningCount);
        CHECK(rows(now) == rows(initial));
    }
}
}
TEST_CASE("B C51: library unpacked input type error is visible with location and stable counts", "[b-m3-library-diagnostics]") {
    for (bool per : {false, true}) for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
        DYNAMIC_SECTION("per=" << per << " cache=" << cache) {
            checkError("diagnostic_lib_array", 8, per, cache);
            checkError("diagnostic_decl_array", 14, per, cache);
        }
    }
}
TEST_CASE("B C51: undersized streaming input reports a compilation error, not just unsupported", "[b-m3-library-diagnostics]") {
    for (bool per : {false, true}) for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
        DYNAMIC_SECTION("per=" << per << " cache=" << cache) {
            checkError("diagnostic_lib_stream", 11, per, cache);
            checkError("diagnostic_decl_stream", 17, per, cache);
        }
    }
}
TEST_CASE("B C51: legal eight-bit streaming library input is complete with full deps", "[b-m3-library-diagnostics]") {
    for (bool per : {false, true}) for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}})
        for (auto top : {"diagnostic_lib_stream", "diagnostic_decl_stream"}) {
            DYNAMIC_SECTION(top << " per=" << per << " cache=" << cache) {
                auto d = openDiagnostic(top, 8, per, cache);
                CHECK(d->diagnostics().errorCount == 0);
                REQUIRE(d->roots().size() == 1);
                const auto owner = d->roots()[0].ref;
                auto signals = d->signals(owner);
                REQUIRE(signals.ok());
                std::string a;
                for (const auto& s : signals->items) if (s.name == "a") a = s.ref;
                REQUIRE_FALSE(a.empty());
                auto netlist = d->bindings(owner);
                REQUIRE(netlist.ok());
                REQUIRE(netlist->bindings.size() == 1);
                const auto& pin = netlist->bindings[0];
                CHECK(pin.width == 8);
                REQUIRE(pin.segments.size() == 1);
                REQUIRE(pin.segments[0].target.kind == "expr");
                auto reply = d->proc(pin.segments[0].target.process);
                REQUIRE(reply.ok());
                CHECK(reply->completeness.status == "complete");
                CHECK(reply->completeness.reasons.empty());
                const auto& p = reply->result;
                REQUIRE(p.expr.has_value());
                CHECK(p.expr->width == 8);
                CHECK(p.expr->op == "other");
                const std::vector<model::Dep> expected = {{a, {0, 8}, "data", "conservative", "all"}};
                CHECK(p.expr->uses == expected);
                REQUIRE(p.writes.size() == 1);
                CHECK(p.writes[0].deps == expected);
                CHECK(p.writes[0].target.ref == pin.pin);
                CHECK(p.writes[0].target.bits.lsb == 0);
                CHECK(p.writes[0].target.bits.width == 8);
                REQUIRE(p.writes[0].exprMap.has_value());
                CHECK(p.writes[0].exprMap->status == "mapped");
                REQUIRE(p.writes[0].exprMap->segments.size() == 1);
                CHECK(p.writes[0].exprMap->segments[0].from == 0);
                CHECK(p.writes[0].exprMap->segments[0].to == 0);
                CHECK(p.writes[0].exprMap->segments[0].width == 8);
                CHECK(d->verifyFacts().mismatched == 0);
                CHECK(d->diagnostics().errorCount == 0);
            }
        }
}
