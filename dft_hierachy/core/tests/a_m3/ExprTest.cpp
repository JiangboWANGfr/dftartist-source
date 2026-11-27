// Agent A regression checks; B's frozen expression oracle is kept separately.
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <map>
#include <set>
#include <tuple>

using namespace hier;
namespace {
struct OpenLibrary final : model::LibraryProvider {
    uint32_t width;
    mutable size_t calls = 0;
    explicit OpenLibrary(uint32_t value) : width(value) {}
    std::optional<model::CellInfo> cell(std::string_view name) const override {
        ++calls;
        if (name != "absent_open")
            return {};
        return model::CellInfo{{{"A", model::Direction::In, width, {}}}, {}};
    }
};
std::unique_ptr<Design> open(const char *fixture, const char *top, bool per = false) {
    model::OpenOptions options;
    options.files = {std::string(HIER_FIXTURES) + "/../" + fixture};
    options.tops = {top};
    options.forcePerInstanceBodies = per;
    options.connectionCacheBytes = 0;
    auto opened = Design::open(options);
    REQUIRE(opened);
    REQUIRE(opened.value()->diagnostics().errorCount == 0);
    return std::move(opened.value());
}
model::QueryResult<model::ProcessInfo> processFor(Design &d, const std::string &inst,
                                               const std::string &name) {
    auto signals = d.signals(inst);
    REQUIRE(signals);
    auto s = std::find_if(signals->items.begin(), signals->items.end(),
                          [&](auto &item) { return item.name == name; });
    REQUIRE(s != signals->items.end());
    auto processes = d.procs(inst);
    REQUIRE(processes);
    for (auto &summary : processes->items) {
        auto p = d.proc(summary.ref);
        REQUIRE(p);
        for (auto &w : p->result.writes)
            if (w.target.ref == s->ref)
                return *p;
    }
    FAIL("missing fixture process");
    return {};
}
void identityMaps(const model::ProcessInfo &p, uint64_t targetOffset = 0) {
    REQUIRE(p.expr);
    for (auto &w : p.writes) {
        REQUIRE(w.exprMap);
        CHECK(w.exprMap->status == "mapped");
        REQUIRE(w.exprMap->segments.size() == 1);
        auto m = w.exprMap->segments.front();
        CHECK(m.from == w.target.bits.lsb - targetOffset);
        CHECK(m.to == w.target.bits.lsb);
        CHECK(m.width == w.target.bits.width);
    }
}
} // namespace

TEST_CASE("library diagnostics coalesce repeated bodies before the first collection", "[a-m3-expr]") {
    for (bool per : {false, true}) {
        for (uint32_t width : {6U, 8U}) {
            CAPTURE(per, width);
            auto library = std::make_shared<OpenLibrary>(width);
            model::OpenOptions options;
            options.files = {HIER_FIXTURES "/../a_m3/fixtures/library_open.sv"};
            options.tops = {"library_repeated_top"};
            options.library = library;
            options.forcePerInstanceBodies = per;
            options.connectionCacheBytes = 0;
            auto opened = Design::open(options);
            REQUIRE(opened);
            auto &d = **opened;
            const auto initial = d.diagnostics();
            CHECK(initial.errorCount == (width == 6 ? 1 : 0));
            CHECK(d.snapshot().bodyCount == (per ? 5 : 2));
            CHECK(library->calls == 1);
            for (const auto &item : initial.items) {
                if (item.isError) {
                    CHECK(item.file.ends_with("library_open.sv"));
                    CHECK(item.line == 2);
                    CHECK_FALSE(item.message.empty());
                }
            }
            auto children = d.children(d.roots().at(0).ref);
            REQUIRE(children);
            REQUIRE(children->items.size() == 4);
            for (int retry = 0; retry < 3; ++retry) {
                for (const auto &child : children->items)
                    REQUIRE(d.bindings(child.ref));
                CHECK((d.verifyFacts().mismatched != 0) == (width == 6));
                const auto current = d.diagnostics();
                CHECK(current.errorCount == initial.errorCount);
                CHECK(current.warningCount == initial.warningCount);
                REQUIRE(current.items.size() == initial.items.size());
                for (size_t i = 0; i < current.items.size(); ++i) {
                    CHECK(current.items[i].message == initial.items[i].message);
                    CHECK(current.items[i].file == initial.items[i].file);
                    CHECK(current.items[i].line == initial.items[i].line);
                }
                CHECK(library->calls == 1);
            }
        }
    }
}

TEST_CASE("library binding preserves external target occurrence isolation", "[a-m3-expr]") {
    for (bool per : {false, true}) {
        model::OpenOptions options;
        options.files = {HIER_FIXTURES "/../a_m3/fixtures/library_open.sv"};
        options.tops = {"library_external_top"};
        options.library = std::make_shared<OpenLibrary>(8);
        options.forcePerInstanceBodies = per;
        options.connectionCacheBytes = 0;
        auto opened = Design::open(options);
        REQUIRE(opened);
        auto &d = **opened;
        REQUIRE(d.diagnostics().errorCount == 0);
        for (const auto *path : {"library_external_top.u[0].s", "library_external_top.u[1].s"}) {
            auto resolved = d.resolvePath(path);
            REQUIRE(resolved);
            REQUIRE(resolved->result.size() == 1);
            auto loads = d.loads(resolved->result[0]);
            REQUIRE(loads);
            const bool referenced = std::string_view(path).find("[1]") != std::string_view::npos;
            CHECK(loads->completeness.status == (referenced ? "partial" : "complete"));
            CHECK(std::any_of(loads->completeness.reasons.begin(), loads->completeness.reasons.end(),
                              [](const auto &r) { return r.code == "hier_ref"; }) == referenced);
        }
        CHECK(d.verifyFacts().mismatched == 0);
        CHECK(d.diagnostics().errorCount == 0);
    }
}

TEST_CASE("expression signed conversion and maps own their occurrence data", "[a-m3-expr]") {
    for (bool per : {false, true}) {
        auto d = open("a_m3/fixtures/expressions.sv", "expression_occurrences", per);
        auto first = processFor(*d, "i:0.0", "extended");
        auto second = processFor(*d, "i:0.1", "extended");
        CHECK(first.completeness.status == "complete");
        CHECK(second.completeness.status == "complete");
        identityMaps(first.result);
        identityMaps(second.result);
        auto &expr = *second.result.expr;
        CHECK(expr.op == "other");
        CHECK(expr.width == 4);
        CHECK(expr.isSigned);
        REQUIRE(expr.uses.size() == 1);
        CHECK(expr.uses[0].bits == model::BitRange{0, 2});
        CHECK(expr.uses[0].align == "all");
        CHECK(expr.uses[0].precision == "conservative");
        CHECK(expr.uses[0].signal.starts_with("s:0.1:"));
        REQUIRE(first.result.expr->uses.size() == 1);
        CHECK(first.result.expr->uses[0].signal.starts_with("s:0.0:"));
        const auto retainedRef = second.result.ref;
        protocol::JsonWriter before;
        protocol::write(before, second);
        second.result.writes[0].exprMap->segments.clear();
        auto fresh = d->proc(retainedRef);
        REQUIRE(fresh);
        protocol::JsonWriter after;
        protocol::write(after, *fresh);
        CHECK(after.str() == before.str());
        d.reset();
        protocol::JsonWriter retained;
        protocol::write(retained, *fresh);
        CHECK(retained.str() == before.str());
    }
}

TEST_CASE("streaming lvalue keeps dependencies and explicitly rejects a guessed value map", "[a-m3-expr]") {
    for (bool per : {false, true}) {
        auto d = open("a_m3/fixtures/expressions.sv", "expression_occurrences", per);
        auto p = processFor(*d, "i:0.0", "selected");
        REQUIRE(p.result.expr);
        CHECK(p.result.expr->width == 2);
        CHECK(p.completeness.status == "partial");
        CHECK(std::any_of(p.completeness.reasons.begin(), p.completeness.reasons.end(),
                          [&](auto &r) { return r.code == "unsupported" && r.at == p.result.ref; }));
        REQUIRE_FALSE(p.result.writes.empty());
        for (auto &w : p.result.writes) {
            REQUIRE(w.exprMap);
            CHECK(w.exprMap->status == "unresolved");
            CHECK(w.exprMap->reason == "unsupported");
            CHECK(w.exprMap->segments.empty());
            CHECK_FALSE(w.deps.empty());
            CHECK(w.deps.front().role == "data");
            CHECK(w.deps.front().precision == "conservative");
        }
        CHECK(d->verifyFacts().mismatched == 0);
    }
}

TEST_CASE("port expressions map component offsets and output conversion result bits", "[a-m3-expr]") {
    for (bool per : {false, true}) {
        auto d = open("a_m2/fixtures/review.sv", "composite_expr", per);
        auto binding = d->bindings("i:0");
        REQUIRE(binding);
        REQUIRE(binding->bindings.size() == 1);
        const auto &b = binding->bindings.front();
        REQUIRE(b.segments.size() == 2);
        for (auto &s : b.segments) {
            auto p = d->proc(s.target.process);
            REQUIRE(p);
            CHECK(p->completeness.status == "complete");
            REQUIRE(p->result.expr);
            CHECK(p->result.expr->width == 2);
            REQUIRE_FALSE(p->result.writes.empty());
            CHECK(p->result.writes.front().target.ref == b.pin);
            identityMaps(p->result, s.pinBits.lsb);
        }
        auto output = open("a_m2/fixtures/review.sv", "output_extend", per);
        auto p = processFor(*output, "i:0", "y");
        CHECK(p.completeness.status == "complete");
        identityMaps(p.result);
        CHECK(p.result.expr->op == "other");
        CHECK(p.result.expr->width == 4);
        REQUIRE(p.result.expr->uses.size() == 1);
        CHECK(p.result.expr->uses[0].signal.starts_with("p:0.0:"));
        CHECK(p.result.expr->uses[0].bits == model::BitRange{0, 2});
    }
}

TEST_CASE("library inputs use the same assignment context as HDL declared inputs", "[a-m3-expr]") {
    struct Library final : model::LibraryProvider {
        uint64_t width;
        explicit Library(uint64_t value) : width(value) {}
        std::optional<model::CellInfo> cell(std::string_view name) const override {
            if (name != "absent_cell")
                return {};
            return model::CellInfo{{{"A", model::Direction::In, width, {}}}, {}};
        }
    };
    for (bool per : {false, true})
        for (bool sign : {false, true})
            for (uint64_t width : {2U, 4U, 6U}) {
                CAPTURE(per, sign, width);
                model::OpenOptions options;
                options.files = {HIER_FIXTURES "/../a_m3/fixtures/expression_review.sv"};
                options.tops = {"library_context"};
                options.defines = {"PIN_WIDTH=" + std::to_string(width),
                                   sign ? "SIGNED_INPUT=signed" : "SIGNED_INPUT="};
                options.library = std::make_shared<Library>(width);
                options.forcePerInstanceBodies = per;
                options.connectionCacheBytes = 0;
                auto opened = Design::open(options);
                REQUIRE(opened);
                auto &d = *opened.value();
                CHECK(d.diagnostics().errorCount == 0);
                auto bindings = d.bindings("i:0");
                REQUIRE(bindings);
                REQUIRE(bindings->bindings.size() == 9);
                auto procAt = [&](size_t index) {
                    auto &b = bindings->bindings[index];
                    REQUIRE(b.width == width);
                    REQUIRE(b.segments.size() == 1);
                    REQUIRE(b.segments[0].target.kind == "expr");
                    auto p = d.proc(b.segments[0].target.process);
                    REQUIRE(p);
                    CHECK(p->completeness.status == "complete");
                    REQUIRE(p->result.expr);
                    CHECK(p->result.expr->width == width);
                    identityMaps(p->result);
                    return p->result;
                };
                using Key = std::tuple<std::string, uint64_t, std::string, std::string>;
                auto projected = [](const model::ProcessInfo &p) {
                    std::map<uint64_t, std::set<Key>> result;
                    for (auto &w : p.writes)
                        for (uint64_t i = 0; i < w.target.bits.width; ++i) {
                            auto &bits = result[w.target.bits.lsb + i];
                            for (auto &dep : w.deps) {
                                auto lo = dep.bits.lsb + (dep.align == "bitwise" ? i : 0);
                                auto n = dep.align == "bitwise" ? 1 : dep.bits.width;
                                for (uint64_t j = 0; j < n; ++j)
                                    bits.emplace(dep.signal, lo + j, dep.role, dep.precision);
                            }
                        }
                    return result;
                };
                auto named = procAt(0), positional = procAt(1), reference = procAt(2);
                CHECK(projected(named) == projected(reference));
                CHECK(projected(positional) == projected(reference));
                auto signals = d.signals("i:0");
                REQUIRE(signals);
                std::map<uint64_t, std::set<Key>> expected;
                for (uint64_t i = 0; i < width; ++i) {
                    auto &bits = expected[i];
                    if (i < 4 || sign)
                        for (auto &s : signals->items)
                            if (s.name == "a" || s.name == "b")
                                bits.emplace(s.ref, std::min(i, uint64_t(3)), "data", "exact");
                }
                CHECK(projected(named) == expected);
                for (auto pair : {std::pair{3U, 4U}, std::pair{5U, 6U}}) {
                    auto actual = procAt(pair.first), declared = procAt(pair.second);
                    CHECK(projected(actual) == projected(declared));
                    protocol::JsonWriter a, b;
                    protocol::write(a, *actual.expr);
                    protocol::write(b, *declared.expr);
                    CHECK(a.str() == b.str());
                }
                // Context propagates through ~ before evaluating the constant;
                // extending the old four-bit result would produce 001111 instead.
                for (auto index : {7U, 8U}) {
                    auto &segments = bindings->bindings[index].segments;
                    REQUIRE(segments.size() == 1);
                    CHECK(segments[0].target.kind == "const");
                    CHECK(segments[0].target.value == std::to_string(width) + "'b" +
                                                           std::string(size_t(width), '1'));
                }
                auto before = d.diagnostics().errorCount;
                CHECK(d.verifyFacts().mismatched == 0);
                CHECK(d.verifyFacts().mismatched == 0); // cache disabled: repeat extraction
                CHECK(d.diagnostics().errorCount == before);
            }
}

TEST_CASE("other summary precision includes coverage of every result bit", "[a-m3-expr]") {
    for (bool per : {false, true}) {
        auto d = open("a_m3/fixtures/expression_review.sv", "summary_coverage", per);
        for (auto name : {"reduced", "compared", "mixed", "controlled", "full_control", "signed_reduce",
                          "repeated", "equal_bit"}) {
            CAPTURE(per, name);
            auto p = processFor(*d, "i:0", name);
            REQUIRE(p.result.expr);
            auto &e = *p.result.expr;
            CHECK(e.op == "other");
            REQUIRE_FALSE(e.uses.empty());
            const bool exact = std::string_view(name) == "signed_reduce" ||
                               std::string_view(name) == "repeated" ||
                               std::string_view(name) == "equal_bit";
            for (auto &dep : e.uses) {
                CHECK(dep.align == "all");
                const bool wholeControl = std::string_view(name) == "full_control" &&
                                          dep.role == "control";
                CHECK(dep.precision == (exact || wholeControl ? "exact" : "conservative"));
            }
            if (std::string_view(name) == "controlled")
                CHECK(std::any_of(e.uses.begin(), e.uses.end(),
                                  [](auto &dep) { return dep.role == "control"; }));
            if (std::string_view(name) == "reduced") {
                REQUIRE(p.result.writes.size() == 2);
                REQUIRE(p.result.writes[0].deps.size() == 1);
                CHECK(p.result.writes[0].deps[0].precision == "exact");
                CHECK(p.result.writes[1].deps.empty());
            }
            CHECK(p.completeness.status == "complete");
        }
        CHECK(d->verifyFacts().mismatched == 0);
    }
}

TEST_CASE("nested and chunked streaming RHS retain complete conservative inputs", "[a-m3-expr]") {
    for (bool per : {false, true}) {
        auto d = open("a_m3/fixtures/expression_review.sv", "streaming_inputs", per);
        for (auto name : {"selected", "nested"}) {
            auto p = processFor(*d, "i:0", name);
            CHECK(p.completeness.status == "complete");
            identityMaps(p.result);
            const size_t count = std::string_view(name) == "selected" ? 1 : 2;
            REQUIRE(p.result.expr->uses.size() == count);
            REQUIRE(p.result.writes.size() == 1);
            CHECK(p.result.writes[0].deps == p.result.expr->uses);
            for (auto &dep : p.result.expr->uses) {
                CHECK(dep.bits == model::BitRange{0, 8});
                CHECK(dep.precision == "conservative");
                CHECK(dep.align == "all");
            }
        }
        CHECK(d->verifyFacts().mismatched == 0);
    }
}
