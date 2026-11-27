// Agent A step regression checks. B fixtures/oracles remain unchanged.
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <set>

using namespace hier;
namespace {
std::unique_ptr<Design> open(const char *top, bool per = false, size_t cache = 64 * 1024 * 1024,
                             const char *fixture = "m3/flow.sv") {
    model::OpenOptions options;
    options.files = {std::string(HIER_FIXTURES) + "/" + fixture};
    options.tops = {top};
    options.forcePerInstanceBodies = per;
    options.connectionCacheBytes = cache;
    auto result = Design::open(options);
    REQUIRE(result);
    REQUIRE(result.value()->diagnostics().errorCount == 0);
    return std::move(result.value());
}
std::string signal(Design &d, const std::string &inst, const std::string &name) {
    auto signals = d.signals(inst);
    REQUIRE(signals);
    for (const auto &s : signals->items)
        if (s.name == name)
            return s.ref;
    FAIL("missing signal");
    return {};
}
template <typename T> std::string json(const T &v) {
    protocol::JsonWriter w;
    protocol::write(w, v);
    return w.str();
}
std::string child(Design &d, const std::string &name) {
    auto result = d.children("i:0");
    REQUIRE(result);
    for (const auto &inst : result->items)
        if (inst.name == name)
            return inst.ref;
    FAIL("missing child");
    return {};
}
std::string port(Design &d, const std::string &inst, const std::string &name) {
    auto result = d.ports(inst);
    REQUIRE(result);
    for (const auto &p : *result)
        if (p.name == name)
            return p.ref;
    FAIL("missing port");
    return {};
}
std::vector<model::Hop> pages(Design &d, const std::string &ref, bool up,
                             const ConnectionRequest &request = {}, int first = 1) {
    StepLimit limit{first, {}};
    std::vector<model::Hop> result;
    std::set<std::string> seen;
    do {
        auto reply = d.step(ref, up, request, limit);
        REQUIRE(reply);
        for (const auto &h : reply->result.hops) {
            REQUIRE_FALSE(h.fact.empty());
            REQUIRE(h.next.size() <= 1);
            for (const auto &next : h.next) {
                CHECK(next.from == h.from.bits);
                CHECK(json(h.map) == json(next.map));
                if (next.align == "all")
                    CHECK(next.map.empty());
            }
            result.push_back(h);
        }
        limit.cursor = reply->result.next;
        if (!limit.cursor.empty()) {
            REQUIRE(seen.insert(limit.cursor).second);
            REQUIRE(seen.size() < 100);
            CHECK(reply->completeness.status == "partial");
        }
        limit.maxHops = 7;
    } while (!limit.cursor.empty());
    return result;
}
} // namespace

TEST_CASE("step local fanout pagination is independent of cache and body sharing", "[a-m3-step]") {
    std::vector<std::string> baseline;
    for (bool per : {false, true}) {
        for (size_t cache : {size_t{0}, size_t{1024}, size_t{64 * 1024 * 1024}}) {
            auto d = open("fanout", per, cache);
            const auto a = signal(*d, "i:0", "a");
            for (int warm = 0; warm < 2; ++warm) {
                StepLimit limit;
                std::vector<std::string> pageValues;
                std::set<std::string> destinations;
                do {
                    auto reply = d->step(a, false, {}, limit);
                    REQUIRE(reply);
                    REQUIRE(reply->result.hops.size() == 1);
                    const auto &h = reply->result.hops[0];
                    CHECK(h.kind == "binding_down");
                    REQUIRE(h.next.size() == 1);
                    REQUIRE(destinations.insert(h.next[0].slice.ref).second);
                    pageValues.push_back(json(h));
                    limit.cursor = reply->result.next;
                    CHECK(reply->completeness.status == (limit.cursor.empty() ? "complete" : "partial"));
                    REQUIRE(pageValues.size() <= 12);
                } while (!limit.cursor.empty());
                CHECK(pageValues.size() == 12);
                if (baseline.empty())
                    baseline = pageValues;
                CHECK(pageValues == baseline);
            }
        }
    }
}

TEST_CASE("step cursors bind normalized object range side direction and snapshot", "[a-m3-step]") {
    auto d = open("flow");
    const auto gate = signal(*d, "i:0", "gate");
    const auto a = signal(*d, "i:0", "a");
    auto full = d->step(gate, true);
    REQUIRE(full);
    CHECK(full->result.hops.size() == 2);
    CHECK(json(pages(*d, gate, true)) == json(full->result.hops));
    auto first = d->step(gate, true, {}, {1, {}});
    REQUIRE(first);
    REQUIRE_FALSE(first->result.next.empty());
    StepLimit limit{9, first->result.next};
    ConnectionRequest whole;
    whole.bits = model::BitRange{0, 4};
    auto continued = d->step(gate, true, whole, limit);
    REQUIRE(continued);
    REQUIRE(continued->result.hops.size() == 1);
    CHECK(continued->result.hops[0].fact == full->result.hops[1].fact);
    auto wrongDirection = d->step(gate, false, {}, limit);
    REQUIRE_FALSE(wrongDirection);
    CHECK(wrongDirection.error().code == ErrorCode::BadRequest);
    auto wrongObject = d->step(a, true, {}, limit);
    REQUIRE_FALSE(wrongObject);
    CHECK(wrongObject.error().code == ErrorCode::BadRequest);
    whole.bits = model::BitRange{1, 1};
    auto wrongBits = d->step(gate, true, whole, limit);
    REQUIRE_FALSE(wrongBits);
    CHECK(wrongBits.error().code == ErrorCode::BadRequest);
    auto other = open("flow");
    auto stale = other->step(gate, true, {}, limit);
    REQUIRE_FALSE(stale);
    CHECK(stale.error().code == ErrorCode::StaleCursor);
    auto retained = *full;
    const auto before = json(retained);
    d.reset();
    CHECK(json(retained) == before);
}

TEST_CASE("step clips forward all relations and keeps constants as process facts", "[a-m3-step]") {
    for (bool per : {false, true}) {
        auto d = open("flow", per, 0);
        const auto a = signal(*d, "i:0", "a");
        const auto total = signal(*d, "i:0", "total");
        auto forward = pages(*d, a, false, {model::BitRange{2, 1}, "local", ""});
        auto toTotal = std::find_if(forward.begin(), forward.end(), [&](const auto &h) {
            return !h.next.empty() && h.next[0].slice.ref == total;
        });
        REQUIRE(toTotal != forward.end());
        CHECK(toTotal->from.bits == model::BitRange{2, 1});
        CHECK(toTotal->next[0].slice.bits == model::BitRange{0, 4});
        CHECK(toTotal->next[0].align == "all");
        CHECK(toTotal->next[0].precision == "conservative");
        CHECK(toTotal->map.empty());
        auto constant = d->step(signal(*d, "i:0", "constant_value"), true);
        REQUIRE(constant);
        REQUIRE(constant->result.hops.size() == 1);
        CHECK(constant->result.hops[0].kind == "process");
        CHECK(constant->result.hops[0].next.empty());
    }
}

TEST_CASE("step expression port continuation keeps side and the dependency fact", "[a-m3-step]") {
    auto d = open("flow", false, 0);
    const auto childSignal = signal(*d, "i:0.0", "d");
    auto first = d->step(childSignal, true);
    REQUIRE(first);
    REQUIRE(first->result.hops.size() == 1);
    const auto &h = first->result.hops[0];
    CHECK(h.kind == "binding_up");
    REQUIRE(h.next.size() == 1);
    const auto &next = h.next[0];
    REQUIRE(next.side);
    CHECK(*next.side == "outside");
    ConnectionRequest req;
    req.bits = next.slice.bits;
    req.side = *next.side;
    auto dependencies = d->step(next.slice.ref, true, req);
    REQUIRE(dependencies);
    REQUIRE(dependencies->result.hops.size() == 2);
    std::set<std::string> wanted{signal(*d, "i:0", "a"), signal(*d, "i:0", "b")};
    for (const auto &dep : dependencies->result.hops) {
        CHECK(dep.kind == "process");
        REQUIRE(dep.next.size() == 1);
        CHECK(wanted.erase(dep.next[0].slice.ref) == 1);
        auto forward = pages(*d, dep.next[0].slice.ref, false);
        auto original = std::find_if(forward.begin(), forward.end(), [&](const auto &v) {
            return v.fact == dep.fact;
        });
        REQUIRE(original != forward.end());
        REQUIRE(original->next.size() == 1);
        CHECK(original->next[0].side == std::optional<std::string>{"inside"});
    }
    CHECK(wanted.empty());
}

TEST_CASE("step cancellation and invalid parameters leave the same cursor reusable", "[a-m3-step]") {
    auto d = open("flow", false, 0);
    const auto gate = signal(*d, "i:0", "gate");
    auto first = d->step(gate, true, {}, {1, {}});
    REQUIRE(first);
    StepLimit limit{1, first->result.next};
    std::stop_source stop;
    stop.request_stop();
    auto cancelled = d->step(gate, true, {}, limit, stop.get_token());
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    auto a = d->step(gate, true, {}, limit);
    auto b = d->step(gate, true, {}, limit);
    REQUIRE(a);
    REQUIRE(b);
    CHECK(json(*a) == json(*b));
    for (const auto &request : {ConnectionRequest{{}, "local", "inside"},
                                ConnectionRequest{model::BitRange{0, 0}, "local", ""},
                                ConnectionRequest{model::BitRange{UINT64_MAX, 1}, "local", ""},
                                ConnectionRequest{model::BitRange{3, 2}, "local", ""}}) {
        auto bad = d->step(gate, true, request);
        REQUIRE_FALSE(bad);
        CHECK(bad.error().code == ErrorCode::BadRequest);
    }
    auto absent = d->step("s:0:9999", true);
    REQUIRE_FALSE(absent);
    CHECK(absent.error().code == ErrorCode::NotFound);
}

TEST_CASE("step port sides preserve constant bits unconnected pins and reversed bindings", "[a-m3-step]") {
    for (bool per : {false, true}) {
        auto d = open("pins", per, 0, "m2/conn.sv");
        const auto constant = child(*d, "u_const");
        ConnectionRequest outside{model::BitRange{1, 2}, "local", "outside"};
        auto value = d->step(port(*d, constant, "d"), true, outside);
        REQUIRE(value);
        REQUIRE(value->result.hops.size() == 1);
        const auto &h = value->result.hops[0];
        CHECK(h.kind == "const");
        CHECK(h.value == std::optional<std::string>{"2'b0x"});
        CHECK(h.from.bits == model::BitRange{1, 2});
        CHECK(h.map.empty());
        CHECK(h.next.empty());
        CHECK_FALSE(h.at);
        auto inward = d->step(port(*d, constant, "d"), true,
                               {model::BitRange{1, 2}, "local", "inside"});
        REQUIRE(inward);
        REQUIRE(inward->result.hops.size() == 1);
        REQUIRE(inward->result.hops[0].next.size() == 1);
        CHECK(inward->result.hops[0].next[0].slice ==
              model::Slice{signal(*d, constant, "d"), {1, 2}});
        auto unconnected = d->step(port(*d, child(*d, "u_open"), "d"), true, outside);
        REQUIRE(unconnected);
        REQUIRE(unconnected->result.hops.size() == 1);
        CHECK(unconnected->result.hops[0].kind == "unconnected");
        CHECK(unconnected->completeness.status == "complete");

        const auto reversed = child(*d, "u_rev");
        const auto a = signal(*d, "i:0", "a");
        auto back = pages(*d, signal(*d, reversed, "d"), true);
        REQUIRE(back.size() == 4);
        for (size_t bit = 0; bit < 4; ++bit) {
            const auto &binding = back[bit];
            CHECK(binding.kind == "binding_up");
            CHECK(binding.from.bits == model::BitRange{bit, 1});
            REQUIRE(binding.next.size() == 1);
            CHECK(binding.next[0].slice == model::Slice{a, {3 - bit, 1}});
            auto forward = pages(*d, a, false, {model::BitRange{3 - bit, 1}, "local", ""});
            auto reverse = std::find_if(forward.begin(), forward.end(), [&](const auto &other) {
                return other.fact == binding.fact;
            });
            REQUIRE(reverse != forward.end());
            CHECK(reverse->from.bits == binding.next[0].slice.bits);
            REQUIRE(reverse->next.size() == 1);
            CHECK(reverse->next[0].slice == binding.from);
        }
        const auto p = port(*d, reversed, "d");
        auto first = d->step(p, true, {{}, "local", "outside"}, {1, {}});
        REQUIRE(first);
        REQUIRE_FALSE(first->result.next.empty());
        auto wrongSide = d->step(p, true, {{}, "local", "inside"}, {1, first->result.next});
        REQUIRE_FALSE(wrongSide);
        CHECK(wrongSide.error().code == ErrorCode::BadRequest);
    }
}

TEST_CASE("step mapped internal ports clip each side in absolute coordinates", "[a-m3-step]") {
    auto d = open("complex_ports", false, 0, "m2/ports_edge.sv");
    const auto inst = child(*d, "u_split");
    auto result = pages(*d, port(*d, inst, "joined"), true,
                         {model::BitRange{1, 2}, "local", "inside"});
    REQUIRE(result.size() == 2);
    REQUIRE(result[0].next.size() == 1);
    REQUIRE(result[1].next.size() == 1);
    CHECK(result[0].from.bits == model::BitRange{1, 1});
    CHECK(result[0].next[0].slice == model::Slice{signal(*d, inst, "lo"), {1, 1}});
    CHECK(result[1].from.bits == model::BitRange{2, 1});
    CHECK(result[1].next[0].slice == model::Slice{signal(*d, inst, "hi"), {0, 1}});
    auto down = pages(*d, signal(*d, "i:0", "data"), false,
                       {model::BitRange{1, 2}, "local", ""});
    REQUIRE(down.size() == 2);
    for (size_t i = 0; i < 2; ++i) {
        CHECK(down[i].kind == "binding_down");
        CHECK(down[i].from.bits == result[i].from.bits);
        REQUIRE(down[i].next.size() == 1);
        CHECK(down[i].next[0].slice == result[i].next[0].slice);
    }
}

TEST_CASE("M2 endpoint routes keep their existing wire fields", "[a-m3-step]") {
    auto d = open("hierarchy");
    auto endpoint = d->drivers(signal(*d, "i:0", "y"), {{}, "hier", ""});
    REQUIRE(endpoint);
    REQUIRE(endpoint->result.size() == 1);
    REQUIRE_FALSE(endpoint->result[0].via.empty());
    const auto encoded = json(*endpoint);
    CHECK(encoded.find("\"kind\":\"boundary\"") != std::string::npos);
    CHECK(encoded.find("\"fact\"") == std::string::npos);
    CHECK(encoded.find("\"align\"") == std::string::npos);
}

TEST_CASE("known cell and top boundaries carry an exact endpoint bit space", "[a-m3-step]") {
    struct Library final : model::LibraryProvider {
        std::optional<model::CellInfo> cell(std::string_view name) const override {
            if (name != "absent_m3")
                return {};
            return model::CellInfo{{{"A", model::Direction::In, 1, {}},
                                     {"Y", model::Direction::Out, 1, {}},
                                     {"EMPTY", model::Direction::In, 1, {}}},
                                    {{"sequential", "true"}}};
        }
    };
    model::OpenOptions options;
    options.files = {std::string(HIER_FIXTURES) + "/m3/flow.sv"};
    options.tops = {"box_boundary"};
    options.library = std::make_shared<Library>();
    auto opened = Design::open(options);
    REQUIRE(opened);
    auto &d = **opened;
    for (bool up : {false, true}) {
        auto reply = d.step(signal(d, "i:0", up ? "y" : "a"), up);
        REQUIRE(reply);
        CHECK(reply->completeness.status == "complete");
        REQUIRE(reply->result.hops.size() == 1);
        const auto &h = reply->result.hops[0];
        CHECK(h.kind == "blackbox_pin");
        CHECK(h.next.empty());
        REQUIRE(h.at);
        CHECK(h.at->side == std::optional<std::string>{"outside"});
        CHECK(h.at->slice.bits == model::BitRange{0, 1});
        REQUIRE(h.cell);
        CHECK(h.cell->attrs.at("sequential") == "true");
        REQUIRE(h.map.size() == 1);
        CHECK(h.map[0].width == 1);
    }
    auto primitive = open("primitive_boundary");
    const auto a = signal(*primitive, "i:0", "a");
    for (bool up : {false, true}) {
        auto reply = primitive->step(a, up);
        REQUIRE(reply);
        REQUIRE(reply->result.hops.size() == 1);
        const auto &h = reply->result.hops[0];
        CHECK(h.kind == (up ? "top_port" : "primitive_pin"));
        REQUIRE(h.at);
        CHECK(h.at->side == std::optional<std::string>{up ? "inside" : "outside"});
        CHECK(h.at->slice.bits == model::BitRange{0, 1});
        CHECK(h.next.empty());
    }
}
