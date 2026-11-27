// Agent A implementation checks, separate from B's frozen acceptance oracle.
#include "hier/Design.h"
#include "hier/frontend/Frontend.h"
#include "hier/protocol/Json.h"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <map>
#include <random>
#include <set>
using namespace hier;

TEST_CASE("dynamic write selectors belong only to their own destination", "[a-m2][a-m7]") {
    using Controls = std::map<std::string, std::set<std::string>>;
    const std::map<std::string, Controls> cases{
        {"dynamic_nested_range", {{"memory", {"address"}}, {"unrelated", {}}}},
        {"dynamic_concat", {{"left_mem", {"a"}}, {"right_mem", {"b"}}, {"unrelated", {}}}},
        {"dynamic_nested_element", {{"matrix", {"row", "col"}}}},
        {"dynamic_element", {{"memory", {"address"}}, {"unrelated", {}}}},
    };
    for (const auto &[top, expected] : cases) {
        for (bool perInstance : {false, true}) {
            for (size_t cache : {size_t(0), size_t(64 * 1024 * 1024)}) {
                CAPTURE(top, perInstance, cache);
                model::OpenOptions options;
                options.files = {HIER_FIXTURES "/../a_m2/fixtures/dynamic_write_selectors.sv"};
                options.tops = {top};
                options.forcePerInstanceBodies = perInstance;
                options.connectionCacheBytes = cache;
                auto opened = Design::open(options);
                REQUIRE(opened);
                auto &design = *opened.value();
                REQUIRE(design.diagnostics().errorCount == 0);
                const auto verified = design.verifyFacts();
                CHECK(verified.mismatched == 0);
                CHECK(verified.slangCompared > 0);
                auto signals = design.signals("i:0");
                REQUIRE(signals);
                std::map<std::string, std::string> names;
                for (const auto &signal : signals->items)
                    names.emplace(signal.ref, signal.name);
                auto processes = design.procs("i:0");
                REQUIRE(processes);
                REQUIRE(processes->items.size() == 1);
                auto process = design.proc(processes->items.front().ref);
                REQUIRE(process);
                Controls actual;
                for (const auto &write : process->result.writes) {
                    const auto &target = names.at(write.target.ref);
                    auto &controls = actual[target];
                    bool data = false;
                    for (const auto &dep : write.deps) {
                        const auto &name = names.at(dep.signal);
                        if (name == "clk")
                            continue;
                        if (name == "data") {
                            CHECK(dep.role == "data");
                            data = true;
                        } else {
                            CHECK(dep.role == "control");
                            CHECK(dep.precision == "conservative");
                            CHECK(dep.align == "all");
                            CHECK(dep.bits.lsb == 0);
                            CHECK(dep.bits.width == 2);
                            controls.insert(name);
                        }
                    }
                    CHECK(data);
                    CHECK(controls == expected.at(target));
                }
                CHECK(actual == expected);
            }
        }
    }
}

TEST_CASE("external library access follows declared direction", "[a-m2][a-rereview]") {
    struct Library final : model::LibraryProvider {
        model::Direction direction;
        explicit Library(model::Direction d) : direction(d) {}
        std::optional<model::CellInfo> cell(std::string_view name) const override {
            if (name != "absent_cell")
                return {};
            return model::CellInfo{{{"Y", direction, 1, {}}}, {}};
        }
    };
    for (bool per : {false, true}) {
        for (auto direction : {model::Direction::In, model::Direction::Out,
                               model::Direction::InOut, model::Direction::Ref}) {
            CAPTURE(per, int(direction));
            model::OpenOptions options;
            options.files = {HIER_FIXTURES "/../a_m2/fixtures/rereview.sv"};
            options.tops = {"external_library_output"};
            options.library = std::make_shared<Library>(direction);
            options.forcePerInstanceBodies = per;
            auto opened = Design::open(options);
            REQUIRE(opened);
            auto &design = *opened.value();
            CHECK(design.diagnostics().errorCount == 0);
            auto processes = design.procs("i:0");
            REQUIRE(processes);
            unsigned accesses = 0;
            for (auto &summary : processes->items) {
                auto process = design.proc(summary.ref);
                REQUIRE(process);
                for (auto &external : process->result.externalRefs)
                    accesses |= external.access == "read" ? 1U : 2U;
            }
            CHECK(accesses == (direction == model::Direction::In ? 1U
                               : direction == model::Direction::Out ? 2U : 3U));
            for (const auto *reach : {"local", "hier"}) {
                ConnectionRequest request;
                request.reach = reach;
                for (bool load : {false, true}) {
                    const bool external = load ? direction != model::Direction::Out
                                               : direction != model::Direction::In;
                    auto result = load ? design.loads("s:0.0:0", request)
                                       : design.drivers("s:0.0:0", request);
                    REQUIRE(result);
                    CHECK(result->completeness.status == (external ? "partial" : "complete"));
                    CHECK(std::any_of(result->completeness.reasons.begin(),
                                      result->completeness.reasons.end(), [](auto &r) {
                                          return r.code == "hier_ref" && r.at == "s:0.0:0";
                                      }) == external);
                }
            }
            CHECK(design.verifyFacts().mismatched == 0);
        }
    }
}
namespace {
std::unique_ptr<Design> open(size_t cache, const char *top = "occ") {
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/m2/conn.sv"};
    options.tops = {top};
    options.connectionCacheBytes = cache;
    auto d = Design::open(options);
    REQUIRE(d);
    return std::move(d.value());
}
template <class T> std::string json(const Result<T> &r) {
    REQUIRE(r);
    protocol::JsonWriter w;
    protocol::write(w, *r);
    return w.str();
}
std::vector<std::string> facts(const Design &d, const std::string &inst) {
    PageRequest all;
    all.limit = 100000;
    std::vector<std::string> values{json(d.ports(inst)), json(d.signals(inst, all)),
                                    json(d.bindings(inst)), json(d.registers(inst, all)),
                                    json(d.procs(inst, all))};
    auto sources = d.procs(inst, all);
    REQUIRE(sources);
    for (auto &p : sources->items)
        values.push_back(json(d.proc(p.ref)));
    auto signals = d.signals(inst, all);
    REQUIRE(signals);
    for (auto &s : signals->items) {
        ConnectionRequest r;
        r.reach = "hier";
        values.push_back(json(d.drivers(s.ref, r)));
        values.push_back(json(d.loads(s.ref, r)));
    }
    return values;
}
} // namespace
TEST_CASE("connection facts survive eviction, reordered queries, and owner destruction", "[a-m2]") {
    model::OpenOptions opts;
    opts.files = {HIER_FIXTURES "/m2/conn.sv"};
    opts.tops = {"occ"};
    auto fe = frontend::openDesign(opts);
    REQUIRE(fe);
    size_t budget = 0, total = 0;
    for (model::BodyId i = 0; i < fe.value()->bodyCount(); ++i) {
        auto n = fe.value()->connections(i).estimatedBytes;
        budget = std::max(budget, n);
        total += n;
    }
    REQUIRE(budget < total); // Each body fits, their union does not: this exercises LRU eviction.
    auto baseline = open(64 * 1024 * 1024);
    auto uncached = open(0);
    auto tiny = open(budget);
    std::vector<std::string> order{"i:0", "i:0.0", "i:0.1", "i:0.2", "i:0.3"};
    std::mt19937 random(20261010);
    for (int pass = 0; pass < 3; ++pass) {
        std::shuffle(order.begin(), order.end(), random);
        for (auto &inst : order) {
            auto expected = facts(*baseline, inst);
            CHECK(facts(*uncached, inst) == expected);
            CHECK(facts(*tiny, inst) == expected);
        }
    }
    auto retained = uncached->proc("x:0.1:0");
    REQUIRE(retained);
    auto before = json(retained);
    uncached.reset();
    CHECK(json(retained) == before);
    auto edited = baseline->proc("x:0.1:0");
    REQUIRE(edited);
    edited.value().result.writes.clear();
    CHECK(json(baseline->proc("x:0.1:0")) == before);
}
TEST_CASE("step crosses only one structural boundary and binds its cursor", "[a-m2]") {
    auto d = open(1024, "xhier");
    auto signals = d->signals("i:0");
    REQUIRE(signals);
    auto mid = std::find_if(signals->items.begin(), signals->items.end(),
                            [](auto &s) { return s.name == "mid"; });
    REQUIRE(mid != signals->items.end());
    ConnectionRequest r;
    r.bits = model::BitRange{0, 1};
    auto up = d->step(mid->ref, true, r);
    REQUIRE(up);
    REQUIRE(up->result.hops.size() == 1);
    auto &h = up->result.hops[0];
    CHECK(h.kind == "binding_down");
    REQUIRE(h.next.size() == 1);
    CHECK(d->object(h.next[0].slice.ref)->inst == "i:0.0");
    auto down = d->step(mid->ref, false, r, StepLimit{1, {}});
    REQUIRE(down);
    CHECK(down->result.hops.size() == 1);
    CHECK(down->completeness.status == "partial");
    CHECK_FALSE(down->result.next.empty());
    auto next = d->step(mid->ref, false, r, StepLimit{8, down->result.next});
    REQUIRE(next);
    // M3 bounds every page to the current context plus one adjacent occurrence,
    // even when several occurrences share a physical body. The two remaining
    // child destinations therefore occupy two pages, independent of maxHops.
    CHECK(next->result.hops.size() == 1);
    CHECK(next->completeness.status == "partial");
    REQUIRE_FALSE(next->result.next.empty());
    auto last = d->step(mid->ref, false, r, StepLimit{8, next->result.next});
    REQUIRE(last);
    REQUIRE(last->result.hops.size() == 1);
    CHECK(last->completeness.status == "complete");
    CHECK(last->result.next.empty());
    CHECK(down->result.hops[0].fact != next->result.hops[0].fact);
    CHECK(next->result.hops[0].fact != last->result.hops[0].fact);
    auto bad = d->step(mid->ref, true, r, StepLimit{8, down->result.next});
    CHECK_FALSE(bad);
}

TEST_CASE("library structural input is frozen and attributes remain opaque", "[a-m2]") {
    struct Library final : model::LibraryProvider {
        mutable int calls = 0;
        uint32_t width = 2;
        std::optional<model::CellInfo> cell(std::string_view) const override {
            ++calls;
            return model::CellInfo{{{"A", model::Direction::In, width, {{"role", "uninterpreted"}}},
                                    {"Y", model::Direction::Out, width, {}}},
                                   {{"arbitrary", "preserved"}}};
        }
    };
    auto library = std::make_shared<Library>();
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/m2/ports_edge.sv"};
    options.tops = {"unknown_blackbox"};
    options.library = library;
    auto opened = Design::open(options);
    REQUIRE(opened);
    auto &design = *opened.value();
    library->width = 20; // Future cache misses must not call the provider again.
    auto b = design.bindings("i:0");
    REQUIRE(b);
    REQUIRE(b->bindings.size() == 2);
    CHECK(b->bindings[0].width == 2);
    CHECK(b->bindings[0].direction == "in");
    REQUIRE(b->bindings[0].segments.size() == 2);
    CHECK(b->bindings[0].segments[1].target.value == "1'b0");
    auto p = design.ports("i:0.0");
    REQUIRE(p);
    CHECK(p->at(0).attrs.at("role") == "uninterpreted");
    auto signal = b->bindings[0].segments[0].target.signal;
    auto step = design.step(signal, false);
    REQUIRE(step);
    REQUIRE(step->result.hops.size() == 2); // assign y=a plus the library input.
    auto pin = std::find_if(step->result.hops.begin(), step->result.hops.end(),
                            [](auto &hop) { return hop.kind == "blackbox_pin"; });
    REQUIRE(pin != step->result.hops.end());
    REQUIRE(pin->cell);
    CHECK(pin->cell->attrs.at("arbitrary") == "preserved");
    CHECK(step->completeness.status == "complete");
    CHECK(library->calls == 1);
}

TEST_CASE("fixed unpacked structs retain member offsets and the whole bit space", "[a-m2]") {
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/bits/bits.sv"};
    options.tops = {"top"};
    auto d = Design::open(options);
    REQUIRE(d);
    auto signals = d.value()->signals("i:0");
    REQUIRE(signals);
    auto un = std::find_if(signals->items.begin(), signals->items.end(),
                           [](auto &s) { return s.name == "un"; });
    REQUIRE(un != signals->items.end());
    CHECK(un->width == 12);
    CHECK_FALSE(un->opaque);
    REQUIRE(un->members.size() == 2);
    CHECK(un->members[0].bits == model::BitRange{0, 4});
    CHECK(un->members[1].bits == model::BitRange{4, 8});
    auto checked = d.value()->verifyFacts();
    CHECK(checked.mismatched == 0);
    CHECK(checked.skippedExternal == 2);
}

TEST_CASE("analysis follows representatives through repeated parent bodies", "[a-m2]") {
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/../a_m2/fixtures/canonical.sv"};
    options.tops = {"repeated"};
    auto shared = Design::open(options);
    REQUIRE(shared);
    options.forcePerInstanceBodies = true;
    auto separate = Design::open(options);
    REQUIRE(separate);
    CHECK(shared.value()->verifyFacts().mismatched == 0);
    CHECK(separate.value()->verifyFacts().mismatched == 0);
    std::vector<std::string> work{"i:0"};
    while (!work.empty()) {
        auto inst = work.back();
        work.pop_back();
        CHECK(facts(*shared.value(), inst) == facts(*separate.value(), inst));
        auto children = shared.value()->children(inst);
        REQUIRE(children);
        for (auto &child : children->items)
            work.push_back(child.ref);
    }
}

TEST_CASE("register events use leading conditions and whole constant values", "[a-m2]") {
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/../a_m2/fixtures/events.sv"};
    options.tops = {"event_classification"};
    auto d = Design::open(options);
    REQUIRE(d);
    auto regs = d.value()->registers("i:0");
    REQUIRE(regs);
    REQUIRE_FALSE(regs->result.items.empty());
    for (auto &r : regs->result.items) {
        CHECK(d.value()->object(r.clock.signal)->name == "clk");
        CHECK(r.clock.edge == "posedge");
        REQUIRE(r.async.size() == 1);
        CHECK(d.value()->object(r.async[0].signal)->name == "rst_n");
        CHECK(r.async[0].edge == "negedge");
        CHECK(r.async[0].type == "set");
    }
    CHECK(d.value()->verifyFacts().mismatched == 0);
}

TEST_CASE("library declarations retain positional holes and output conversions", "[a-m2]") {
    struct Library final : model::LibraryProvider {
        std::optional<model::CellInfo> cell(std::string_view) const override {
            return model::CellInfo{{{"A", model::Direction::In, 1, {}},
                                    {"unused", model::Direction::In, 1, {}},
                                    {"Y", model::Direction::Out, 2, {}}},
                                   {}};
        }
    };
    model::OpenOptions options;
    options.files = {HIER_FIXTURES "/../a_m2/fixtures/review.sv"};
    options.library = std::make_shared<Library>();
    for (const char *top : {"positional_empty", "library_output"}) {
        options.tops = {top};
        auto d = Design::open(options);
        REQUIRE(d);
        auto b = d.value()->bindings("i:0");
        REQUIRE(b);
        REQUIRE(b->bindings.size() == 3);
        CHECK(b->bindings[0].port == "A");
        CHECK(b->bindings[1].port == "unused");
        CHECK(b->bindings[1].segments[0].target.kind == "unconnected");
        CHECK(b->bindings[2].port == "Y");
        CHECK(b->bindings[2].direction == "out");
        REQUIRE(b->bindings[2].segments[0].target.kind == "expr");
        auto p = d.value()->proc(b->bindings[2].segments[0].target.process);
        REQUIRE(p);
        auto signals = d.value()->signals("i:0");
        REQUIRE(signals);
        auto y = std::find_if(signals->items.begin(), signals->items.end(),
                              [](auto &s) { return s.name == "y"; });
        REQUIRE(y != signals->items.end());
        ConnectionRequest query;
        query.bits = model::BitRange{y->width - 1, 1};
        auto drivers = d.value()->drivers(y->ref, query);
        REQUIRE(drivers);
        REQUIRE(drivers->result.size() == 1);
        CHECK(drivers->result[0].kind == "process");
        CHECK(drivers->completeness.status == "complete");
        CHECK(d.value()->verifyFacts().mismatched == 0);
    }
}
