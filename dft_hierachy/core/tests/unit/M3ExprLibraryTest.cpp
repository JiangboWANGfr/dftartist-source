// Agent B: public API only; DESIGN 4.4/5.5.3 assignment context, not A tests.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include <algorithm>
#include <set>
#include <tuple>

using namespace hier;
namespace {
using Relations = std::set<std::tuple<uint64_t, std::string, uint64_t, std::string, std::string>>;
struct InputLibrary final : model::LibraryProvider {
    uint32_t width;
    explicit InputLibrary(uint32_t value) : width(value) {}
    std::optional<model::CellInfo> cell(std::string_view name) const override {
        if (name != "absent_input") return {};
        model::CellInfo result;
        result.pins = {{"A", model::Direction::In, width, {}}};
        return result;
    }
};
std::unique_ptr<Design> open(std::string top, uint32_t width, bool per, size_t cache) {
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/m3/expr_boundaries.sv"};
    options.tops = {std::move(top)};
    options.defines = {"B_PIN_WIDTH=" + std::to_string(width)};
    options.forcePerInstanceBodies = per;
    options.connectionCacheBytes = cache;
    options.library = std::make_shared<InputLibrary>(width);
    auto opened = Design::open(options);
    REQUIRE(opened.ok());
    auto d = std::move(opened.value());
    REQUIRE(d->diagnostics().errorCount == 0);
    return d;
}
std::string root(Design& d) {
    const auto roots = d.roots();
    REQUIRE(roots.size() == 1);
    return roots[0].ref;
}
std::string signal(Design& d, std::string_view name) {
    auto reply = d.signals(root(d));
    REQUIRE(reply.ok());
    for (const auto& s : reply->items) if (s.name == name) return s.ref;
    FAIL("missing independent fixture input");
    return {};
}
std::vector<model::ProcessInfo> inputProcesses(Design& d, uint32_t width) {
    auto netlist = d.bindings(root(d));
    REQUIRE(netlist.ok());
    REQUIRE_FALSE(netlist->bindings.empty());
    std::vector<model::ProcessInfo> result;
    for (const auto& pin : netlist->bindings) {
        CHECK(pin.port == "A");
        CHECK(pin.direction == "in");
        REQUIRE(pin.width == width);
        REQUIRE(pin.segments.size() == 1);
        CHECK(pin.segments[0].pinBits.lsb == 0);
        CHECK(pin.segments[0].pinBits.width == width);
        REQUIRE(pin.segments[0].target.kind == "expr");
        auto reply = d.proc(pin.segments[0].target.process);
        REQUIRE(reply.ok());
        CHECK(reply->completeness.status == "complete");
        CHECK(reply->completeness.reasons.empty());
        auto process = reply->result; // owning copy; no frontend/cached borrows
        CHECK(process.kind == "port_expr");
        REQUIRE(process.expr.has_value());
        CHECK(process.expr->width == width);
        std::set<uint64_t> written;
        for (const auto& write : process.writes) {
            CHECK(write.target.ref == pin.pin);
            REQUIRE(write.exprMap.has_value());
            const auto& mapping = *write.exprMap;
            CHECK(mapping.status == "mapped");
            CHECK(mapping.reason.empty());
            uint64_t previousTo = 0, previousFrom = 0;
            bool first = true;
            std::set<uint64_t> mapped;
            for (const auto& segment : mapping.segments) {
                REQUIRE(segment.width > 0);
                CHECK(segment.from + segment.width <= width);
                CHECK(segment.to >= write.target.bits.lsb);
                CHECK(segment.to + segment.width <= write.target.bits.lsb + write.target.bits.width);
                if (!first) CHECK(std::tie(previousTo, previousFrom) <= std::tie(segment.to, segment.from));
                first = false;
                previousTo = segment.to;
                previousFrom = segment.from;
                for (uint64_t i = 0; i < segment.width; ++i) {
                    CHECK(segment.from + i == segment.to + i); // root-result identity, not source-coordinate identity
                    CHECK(mapped.insert(segment.to + i).second);
                }
            }
            CHECK(mapped.size() == write.target.bits.width);
            for (uint64_t i = 0; i < write.target.bits.width; ++i)
                CHECK(written.insert(write.target.bits.lsb + i).second);
        }
        CHECK(written.size() == width);
        result.push_back(std::move(process));
    }
    return result;
}
Relations relations(const model::ProcessInfo& process) {
    Relations result;
    for (const auto& write : process.writes) for (const auto& dep : write.deps) {
        REQUIRE((dep.align == "bitwise" || dep.align == "all"));
        if (dep.precision == "conservative") CHECK(dep.align == "all");
        if (dep.align == "bitwise") REQUIRE(dep.bits.width == write.target.bits.width);
        for (uint64_t i = 0; i < write.target.bits.width; ++i) {
            const uint64_t count = dep.align == "all" ? dep.bits.width : 1;
            for (uint64_t j = 0; j < count; ++j)
                result.emplace(write.target.bits.lsb + i, dep.signal,
                               dep.bits.lsb + (dep.align == "all" ? j : i), dep.role, dep.precision);
        }
    }
    return result;
}
Relations bitwiseExpected(Design& d, uint32_t width, bool isSigned) {
    Relations expected;
    for (auto name : {"a", "b"}) {
        const auto ref = signal(d, name);
        for (uint64_t i = 0; i < width; ++i) {
            if (i < 4 || isSigned) expected.emplace(i, ref, std::min<uint64_t>(i, 3), "data", "exact");
        }
    }
    return expected;
}
void bitwiseMatrix(bool isSigned) {
    for (uint32_t width : {2u, 4u, 6u}) for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}})
            for (auto connection : {"named", "position"}) {
                DYNAMIC_SECTION("width=" << width << " per=" << per << " cache=" << cache << " " << connection) {
                    const std::string kind = isSigned ? "signed" : "unsigned";
                    auto d = open("lib_" + kind + "_" + connection, width, per, cache);
                    const auto expected = bitwiseExpected(*d, width, isSigned);
                    const auto processes = inputProcesses(*d, width);
                    CHECK(processes.size() == (isSigned ? size_t{1} : size_t{2}));
                    std::set<std::string> refs;
                    for (const auto& p : processes) {
                        CHECK(relations(p) == expected);
                        CHECK(refs.insert(p.ref).second);
                    }
                    const auto repeated = inputProcesses(*d, width);
                    REQUIRE(repeated.size() == processes.size());
                    for (size_t i = 0; i < repeated.size(); ++i) {
                        CHECK(repeated[i].ref == processes[i].ref);
                        CHECK(relations(repeated[i]) == expected);
                    }
                    // True declarations are a second control, not the only oracle.
                    auto declared = open("declared_" + kind + "_named", width, per, cache);
                    const auto controls = inputProcesses(*declared, width);
                    REQUIRE(controls.size() == 1);
                    CHECK(relations(controls[0]) == bitwiseExpected(*declared, width, isSigned));
                    CHECK(processes[0].expr->isSigned == controls[0].expr->isSigned);
                    CHECK(processes[0].expr->op == controls[0].expr->op);
                    CHECK(d->verifyFacts().mismatched == 0);
                    CHECK(declared->verifyFacts().mismatched == 0);
                }
            }
}
}

TEST_CASE("B C49: library unsigned input width 2/4/6 applies context before bitwise extraction", "[b-m3-expr-library]") {
    bitwiseMatrix(false);
}
TEST_CASE("B C49: signed operands preserve sign-bit deps in unsigned library pins", "[b-m3-expr-library]") {
    bitwiseMatrix(true);
}
TEST_CASE("B C49: context-dependent arithmetic retains full conservative inputs", "[b-m3-expr-library]") {
    for (uint32_t width : {2u, 4u, 6u}) for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
            DYNAMIC_SECTION("width=" << width << " per=" << per << " cache=" << cache) {
                for (auto top : {"lib_arithmetic", "declared_arithmetic"}) {
                    auto d = open(top, width, per, cache);
                    const auto processes = inputProcesses(*d, width);
                    REQUIRE(processes.size() == 1);
                    Relations expected;
                    // Width 2 truncates the four-bit arithmetic result; the V1
                    // conservative arithmetic rule still includes all operand bits.
                    const uint64_t sourceWidth = 4;
                    for (auto name : {"a", "b"}) for (uint64_t i = 0; i < width; ++i)
                        for (uint64_t j = 0; j < sourceWidth; ++j)
                            expected.emplace(i, signal(*d, name), j, "data", "conservative");
                    CHECK(relations(processes[0]) == expected);
                    CHECK(processes[0].expr->op == "other");
                    CHECK(d->verifyFacts().mismatched == 0);
                }
            }
        }
}
TEST_CASE("B C49: constant complement is evaluated in target width, not extended afterward", "[b-m3-expr-library]") {
    for (uint32_t width : {2u, 4u, 6u}) for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
            DYNAMIC_SECTION("width=" << width << " per=" << per << " cache=" << cache) {
                const std::string bits = width == 2 ? "01" : width == 4 ? "0101" : "110101";
                for (auto top : {"lib_constant", "declared_constant"}) {
                    auto d = open(top, width, per, cache);
                    auto netlist = d->bindings(root(*d));
                    REQUIRE(netlist.ok());
                    REQUIRE(netlist->bindings.size() == 1);
                    const auto& pin = netlist->bindings[0];
                    CHECK(pin.width == width);
                    REQUIRE_FALSE(pin.segments.empty());
                    if (pin.segments[0].target.kind == "expr") {
                        const auto processes = inputProcesses(*d, width);
                        REQUIRE(processes.size() == 1);
                        CHECK(processes[0].expr->op == "const");
                        CHECK(processes[0].expr->value == std::to_string(width) + "'b" + bits);
                        CHECK(relations(processes[0]).empty());
                    } else {
                        // DESIGN 4.4 allows a compile-time constant as a trivial
                        // binding. Check its actual context-evaluated digits too.
                        std::set<uint64_t> covered;
                        for (const auto& segment : pin.segments) {
                            REQUIRE(segment.target.kind == "const");
                            REQUIRE(segment.pinBits.width > 0);
                            REQUIRE(segment.pinBits.lsb + segment.pinBits.width <= width);
                            const auto marker = segment.target.value.find("'b");
                            REQUIRE(marker != std::string::npos);
                            const auto digits = segment.target.value.substr(marker + 2);
                            REQUIRE(digits.size() == segment.pinBits.width);
                            CHECK(segment.target.value == std::to_string(segment.pinBits.width) + "'b" + digits);
                            for (uint64_t i = 0; i < segment.pinBits.width; ++i) {
                                const auto bit = segment.pinBits.lsb + i;
                                CHECK(covered.insert(bit).second);
                                CHECK(digits[digits.size() - 1 - i] == bits[bits.size() - 1 - bit]);
                            }
                        }
                        CHECK(covered.size() == width);
                    }
                    CHECK(d->verifyFacts().mismatched == 0);
                }
            }
        }
}
TEST_CASE("B C49: owned library expression survives zero-cache requery and Design destruction", "[b-m3-expr-library]") {
    for (bool per : {false, true}) DYNAMIC_SECTION("per=" << per) {
        auto d = open("lib_unsigned_named", 6, per, 0);
        const auto expected = bitwiseExpected(*d, 6, false);
        const auto saved = inputProcesses(*d, 6);
        REQUIRE(saved.size() == 2);
        CHECK(inputProcesses(*d, 6).size() == 2);
        d.reset();
        for (const auto& process : saved) {
            CHECK(process.expr->width == 6);
            CHECK(relations(process) == expected);
            REQUIRE_FALSE(process.writes.empty());
            CHECK(process.writes[0].exprMap->status == "mapped");
        }
    }
}
