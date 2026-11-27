// A regression for C-53/C-54; independent B freeze remains separate.
#include "hier/Design.h"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
using namespace hier;
namespace {
struct Library final : model::LibraryProvider {
    model::Direction direction;
    size_t unknownPins;
    explicit Library(model::Direction value, size_t unknown = 0)
        : direction(value), unknownPins(unknown) {}
    std::optional<model::CellInfo> cell(std::string_view name) const override {
        if (name != "missing_cell")
            return {};
        model::CellInfo cell;
        cell.pins = {{"P", direction, 4, {}}};
        for (size_t i = 0; i < unknownPins; ++i)
            cell.pins.push_back({"U" + std::to_string(i), model::Direction::Unknown, 4, {}});
        return cell;
    }
};
std::unique_ptr<Design> open(const char *top, bool per,
                             std::shared_ptr<const model::LibraryProvider> library = {},
                             const char *fixture = A_OPAQUE_FIXTURE) {
    model::OpenOptions options;
    options.files = {fixture};
    options.tops = {top};
    options.forcePerInstanceBodies = per;
    options.library = std::move(library);
    auto d = Design::open(options);
    REQUIRE(d);
    REQUIRE(d.value()->diagnostics().errorCount == 0);
    const auto check = d.value()->verifyFacts();
    if (check.slangCompared + check.selfChecked > 0)
        CHECK(check.mismatched == 0); // A pin-only fixture has no procedure oracle.
    return std::move(d.value());
}
std::string signal(Design &d, const char *name) {
    auto s = d.signals("i:0");
    REQUIRE(s);
    for (const auto &value : s->items)
        if (value.name == name)
            return value.ref;
    FAIL("missing signal");
    return {};
}
template<class T> void missing(const T &reply, const std::string &reason, const std::string &pin) {
    REQUIRE(reply);
    CHECK(reply->completeness.status == "partial");
    CHECK(std::any_of(reply->completeness.reasons.begin(), reply->completeness.reasons.end(),
                      [&](const auto &r) { return r.code == reason && r.at == pin; }));
}
} // namespace
TEST_CASE("C53 unknown pin width takes precedence on both port sides", "[a-m3-opaque-binding]") {
    for (bool per : {false, true}) {
        auto d = open("box_boundary", per, {}, HIER_FIXTURES "/m3/flow.sv");
        auto ports = d->ports("i:0.0");
        REQUIRE(ports);
        for (const auto &port : *ports)
            for (const char *side : {"inside", "outside"})
                for (bool back : {false, true}) {
                    auto expected = port.name == "EMPTY" ? "unknown_pin_width" : "blackbox";
                    auto reply = d->step(port.ref, back, {{}, "local", side});
                    missing(reply, expected, port.ref);
                    REQUIRE(reply->result.hops.size() == 1);
                    CHECK(reply->result.hops[0].reason == expected);
                    CHECK_FALSE(reply->result.hops[0].at);
                    if (port.name == "EMPTY") {
                        CHECK(reply->result.hops[0].from.bits == model::BitRange{0, 0});
                        auto invalid = d->step(port.ref, back, {model::BitRange{0, 1}, "local", side});
                        REQUIRE_FALSE(invalid);
                        CHECK(invalid.error().code == ErrorCode::BadRequest);
                    }
                }
    }
}
TEST_CASE("C54 unknown streaming destinations retain possible drivers and trace frontier", "[a-m3-opaque-binding]") {
    for (bool per : {false, true}) {
        auto d = open("unknown_stream", per);
        const auto ref = signal(*d, "data");
        auto ports = d->ports("i:0.0");
        REQUIRE(ports);
        REQUIRE(ports->size() == 1);
        const auto pin = ports->front().ref;
        for (auto bits : {model::BitRange{0, 4}, model::BitRange{2, 1}}) {
            ConnectionRequest request{bits, "local", ""};
            auto step = d->step(ref, true, request);
            missing(step, "blackbox", pin);
            REQUIRE(step->result.hops.size() == 1);
            CHECK(step->result.hops[0].kind == "unresolved");
            CHECK(step->result.hops[0].next.empty());
            auto drivers = d->drivers(ref, request);
            missing(drivers, "blackbox", pin);
            REQUIRE(drivers->result.size() == 1);
            CHECK(drivers->result[0].kind == "blackbox_pin");
            CHECK(drivers->result[0].queried == bits);
            CHECK(drivers->result[0].via.empty());
            auto trace = d->cone(ref, model::TraceDirection::Back, model::TracePolicy::Full, request);
            missing(trace, "blackbox", pin);
            REQUIRE_FALSE(trace->result.frontier.empty());
        }
        auto spare = d->step(signal(*d, "spare"), true);
        REQUIRE(spare);
        CHECK(spare->completeness.status == "complete");
        CHECK(spare->result.hops.empty());
        auto loads = d->step(ref, false);
        REQUIRE(loads);
        CHECK_FALSE(loads->result.hops.empty());
    }
}
TEST_CASE("C54 selectors and pure rvalue operands are never possible write destinations", "[a-m3-opaque-binding]") {
    for (bool per : {false, true}) {
        auto selected = open("unknown_selected", per);
        auto data = selected->step(signal(*selected, "data"), true);
        REQUIRE(data);
        CHECK(data->completeness.status == "partial");
        auto selector = selected->step(signal(*selected, "selector"), true);
        REQUIRE(selector);
        CHECK(selector->completeness.status == "complete");
        CHECK(std::none_of(selector->result.hops.begin(), selector->result.hops.end(), [](const auto &h) {
            return h.reason == "blackbox";
        }));
        auto rvalue = open("unknown_rvalue", per);
        for (const char *name : {"a", "b"}) {
            auto step = rvalue->step(signal(*rvalue, name), true);
            REQUIRE(step);
            CHECK(step->completeness.status == "complete");
            CHECK(step->result.hops.empty());
        }
    }
}
TEST_CASE("C54 declared and library pin directions retain their input output distinction", "[a-m3-opaque-binding]") {
    for (bool per : {false, true})
        for (bool library : {false, true})
            for (auto direction : {model::Direction::In, model::Direction::Out}) {
                const bool output = direction == model::Direction::Out;
                auto d = open(library ? "unknown_stream" : output ? "known_stream" : "input_stream", per,
                              library ? std::make_shared<Library>(direction) : nullptr);
                const auto ref = signal(*d, "data");
                auto drivers = d->step(ref, true);
                REQUIRE(drivers);
                if (output)
                    CHECK_FALSE(drivers->result.hops.empty());
                else
                    CHECK(drivers->result.hops.empty());
                CHECK(std::none_of(drivers->completeness.reasons.begin(), drivers->completeness.reasons.end(),
                                    [](const auto &r) { return r.code == "blackbox"; }));
            }
}

TEST_CASE("a blackbox with no known opposite pin keeps a stable terminal fact", "[a-m3-opaque-binding]") {
    auto d = open("unknown_stream", false, std::make_shared<Library>(model::Direction::In));
    auto ports = d->ports("i:0.0");
    REQUIRE(ports);
    const auto pin = ports->front().ref;
    std::string fact;
    for (uint64_t bit : {uint64_t{0}, uint64_t{1}}) {
        auto reply = d->cone(pin, model::TraceDirection::Forward, model::TracePolicy::Full,
                             {model::BitRange{bit, 1}, "local", "outside"});
        REQUIRE(reply);
        CHECK(reply->completeness.status == "complete");
        CHECK(reply->result.frontier.empty());
        REQUIRE(reply->result.edges.size() == 1);
        CHECK(reply->result.edges[0].kind == "boundary");
        if (fact.empty())
            fact = reply->result.edges[0].fact;
        CHECK(reply->result.edges[0].fact == fact);
    }
}

TEST_CASE("unknown blackbox counterparts consume the working graph budget", "[a-m3-opaque-binding]") {
    auto d = open("unknown_stream", false, std::make_shared<Library>(model::Direction::In, 20));
    auto ports = d->ports("i:0.0");
    REQUIRE(ports);
    auto reply = d->cone(ports->front().ref, model::TraceDirection::Forward, model::TracePolicy::Full,
                         {model::BitRange{0, 1}, "local", "outside"}, {2, 1, 64, {}});
    REQUIRE(reply);
    CHECK(reply->completeness.status == "partial");
    CHECK(reply->result.nodes.size() == 2);
    CHECK(reply->result.edges.size() == 1);
    CHECK(reply->result.frontier.size() == 2);
    CHECK(std::count_if(reply->result.frontier.begin(), reply->result.frontier.end(), [](const auto &f) {
        return f.reason == "blackbox";
    }) == 1);
    CHECK(std::count_if(reply->result.frontier.begin(), reply->result.frontier.end(), [](const auto &f) {
        return f.reason == "budget_nodes";
    }) == 1);
    for (const auto &f : reply->result.frontier)
        CHECK(f.depth == 0); // No known relation to an unknown counterpart was consumed.
}

TEST_CASE("semantic stops on selected unknown pins preserve the starting side range and depth", "[a-m3-opaque-binding]") {
    for (bool per : {false, true}) {
        auto d = open("unknown_stream", per);
        auto ports = d->ports("i:0.0");
        REQUIRE(ports);
        for (const auto *side : {"inside", "outside"})
            for (auto direction : {model::TraceDirection::Forward, model::TraceDirection::Back}) {
                auto reply = d->cone(ports->front().ref, direction, model::TracePolicy::Full,
                                     {model::BitRange{2, 1}, "local", side});
                missing(reply, "blackbox", ports->front().ref);
                REQUIRE(reply->result.frontier.size() == 1);
                const auto &f = reply->result.frontier[0];
                CHECK(f.point.slice.bits == model::BitRange{2, 1});
                CHECK(f.point.side == side);
                CHECK(f.depth == 0);
            }
    }
}
