// B independent occurrence/diagnostic oracle; public API only, DESIGN 4.1/4.8.
#include "hier/Design.h"
#include <catch2/catch_test_macros.hpp>
#include <filesystem>
#include <set>
#include <tuple>

using namespace hier;
namespace {
struct Library final : model::LibraryProvider {
    uint32_t width;
    explicit Library(uint32_t w) : width(w) {}
    std::optional<model::CellInfo> cell(std::string_view name) const override {
        if (name != "absent_c52") return {};
        model::CellInfo c;
        c.pins = {{"A", model::Direction::In, width, {}}};
        return c;
    }
};
std::unique_ptr<Design> open(std::string top, uint32_t width, bool per, size_t cache) {
    model::OpenOptions o;
    o.files = {HIER_FIXTURES "/m3/library_occurrences.sv"};
    o.tops = {std::move(top)};
    o.library = std::make_shared<Library>(width);
    o.forcePerInstanceBodies = per;
    o.connectionCacheBytes = cache;
    auto r = Design::open(o);
    REQUIRE(r.ok());
    return std::move(r.value());
}
using Rows = std::vector<std::tuple<bool, std::string, std::string, uint32_t>>;
Rows rows(const model::Diagnostics& d) {
    Rows r;
    for (const auto& x : d.items) r.emplace_back(x.isError, x.message, x.file, x.line);
    return r;
}
std::vector<model::InstInfo> children(Design& d) {
    REQUIRE(d.roots().size() == 1);
    auto r = d.children(d.roots()[0].ref);
    REQUIRE(r.ok());
    return r->items;
}
}

TEST_CASE("B C52: four erroneous library occurrences retain source errors and verify gate", "[b-c52-occurrence]") {
    for (bool per : {false, true}) for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}})
        for (bool array : {false, true}) {
            DYNAMIC_SECTION("per=" << per << " cache=" << cache << " array=" << array) {
                auto d = open(array ? "c52_array_top" : "c52_stream_top", 6, per, cache);
                const auto initial = d->diagnostics(1000);
                CHECK(initial.errorCount > 0);
                CHECK_FALSE(initial.truncated);
                size_t errorRows = 0;
                for (const auto& x : initial.items) if (x.isError) {
                    ++errorRows;
                    CHECK_FALSE(x.message.empty());
                    CHECK(std::filesystem::path(x.file).filename() == "library_occurrences.sv");
                    CHECK(x.line == (array ? 2u : 11u));
                }
                CHECK(errorRows == initial.errorCount);
                const auto occurrences = children(*d);
                REQUIRE(occurrences.size() == 4);
                std::set<std::string> refs;
                for (const auto& x : occurrences) REQUIRE(refs.insert(x.ref).second);
                for (int repeat = 0; repeat < 3; ++repeat) {
                    for (const auto& x : occurrences) {
                        (void)d->bindings(x.ref);
                        auto procs = d->procs(x.ref);
                        if (procs.ok()) for (const auto& p : procs->items) (void)d->proc(p.ref);
                    }
                    CHECK(d->verifyFacts().mismatched > 0);
                    const auto now = d->diagnostics(1000);
                    CHECK(now.errorCount == initial.errorCount);
                    CHECK(now.warningCount == initial.warningCount);
                    CHECK(rows(now) == rows(initial));
                }
            }
        }
}

TEST_CASE("B C52: four legal streaming occurrences own distinct full-width facts", "[b-c52-occurrence]") {
    for (bool per : {false, true}) for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
        DYNAMIC_SECTION("per=" << per << " cache=" << cache) {
            auto d = open("c52_stream_top", 8, per, cache);
            REQUIRE(d->diagnostics().errorCount == 0);
            const auto occurrences = children(*d);
            REQUIRE(occurrences.size() == 4);
            std::set<std::string> processes, pins;
            std::vector<model::ProcessInfo> saved;
            for (int repeat = 0; repeat < 3; ++repeat) for (const auto& x : occurrences) {
                auto sigs = d->signals(x.ref);
                REQUIRE(sigs.ok());
                std::string a;
                for (const auto& s : sigs->items) if (s.name == "a") a = s.ref;
                REQUIRE_FALSE(a.empty());
                auto bindings = d->bindings(x.ref);
                REQUIRE(bindings.ok());
                REQUIRE(bindings->bindings.size() == 1);
                const auto& binding = bindings->bindings[0];
                CHECK(binding.width == 8);
                REQUIRE(binding.segments.size() == 1);
                REQUIRE(binding.segments[0].target.kind == "expr");
                auto p = d->proc(binding.segments[0].target.process);
                REQUIRE(p.ok());
                CHECK(p->completeness.status == "complete");
                CHECK(p->completeness.reasons.empty());
                REQUIRE(p->result.expr.has_value());
                CHECK(p->result.expr->width == 8);
                const std::vector<model::Dep> deps = {{a, {0, 8}, "data", "conservative", "all"}};
                CHECK(p->result.expr->uses == deps);
                REQUIRE(p->result.writes.size() == 1);
                const auto& w = p->result.writes[0];
                CHECK(w.deps == deps);
                CHECK(w.target.ref == binding.pin);
                CHECK(w.target.bits == model::BitRange{0, 8});
                REQUIRE(w.exprMap.has_value());
                CHECK(w.exprMap->status == "mapped");
                REQUIRE(w.exprMap->segments.size() == 1);
                CHECK(w.exprMap->segments[0].from == 0);
                CHECK(w.exprMap->segments[0].to == 0);
                CHECK(w.exprMap->segments[0].width == 8);
                if (repeat == 0) {
                    REQUIRE(processes.insert(binding.segments[0].target.process).second);
                    REQUIRE(pins.insert(binding.pin).second);
                    saved.push_back(p->result);
                } else CHECK(processes.contains(binding.segments[0].target.process));
            }
            CHECK(d->verifyFacts().mismatched == 0);
            CHECK(d->diagnostics().errorCount == 0);
            d.reset();
            REQUIRE(saved.size() == 4);
            for (const auto& p : saved) CHECK(p.expr->width == 8);
        }
    }
}

TEST_CASE("B C52: library hierarchy read marks only named target not same-definition siblings", "[b-c52-occurrence]") {
    for (bool per : {false, true}) for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
        DYNAMIC_SECTION("per=" << per << " cache=" << cache) {
            auto d = open("c52_hier_top", 8, per, cache);
            CHECK(d->diagnostics().errorCount == 0);
            const auto occurrences = children(*d);
            REQUIRE(occurrences.size() == 5);
            std::set<std::string> refs;
            for (const auto& x : occurrences) {
                if (x.name == "reader") continue;
                auto sigs = d->signals(x.ref);
                REQUIRE(sigs.ok());
                REQUIRE(sigs->items.size() == 1);
                const auto ref = sigs->items[0].ref;
                CHECK(sigs->items[0].name == "s");
                REQUIRE(refs.insert(ref).second);
                for (const auto& reach : {"local", "hier"}) {
                    ConnectionRequest request;
                    request.reach = reach;
                    auto loads = d->loads(ref, request);
                    auto drivers = d->drivers(ref, request);
                    REQUIRE(loads.ok()); REQUIRE(drivers.ok());
                    CHECK(drivers->completeness.status == "complete");
                    CHECK(drivers->completeness.reasons.empty());
                    CHECK(drivers->result.empty());
                    if (x.name == "n2") {
                        CHECK(loads->completeness.status == "partial");
                        bool found = false;
                        for (const auto& reason : loads->completeness.reasons)
                            found |= reason.code == "hier_ref" && reason.at == ref;
                        CHECK(found);
                    } else {
                        CHECK(loads->completeness.status == "complete");
                        CHECK(loads->completeness.reasons.empty());
                        CHECK(loads->result.empty());
                    }
                }
            }
            CHECK(refs.size() == 4);
            const auto check = d->verifyFacts();
            CHECK(check.mismatched == 0);
            CHECK(check.skippedExternal > 0);
        }
    }
}
