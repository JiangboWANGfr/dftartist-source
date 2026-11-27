#include "OccurrencePorts.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <random>

using namespace hier;
namespace {
// The pre-change complete conversion, intentionally independent of ReferenceScope.
// Arbitrary strings retain literal behavior; this reference never parses objects.
namespace reference {
using detail::checkpoint;
inline std::string qualify(std::string ref, const model::InstKey &key) {
    if (ref.empty())
        return ref;
    const auto base = model::formatInstKey(key);
    if (ref.starts_with("i:"))
        return "i:" + base + (ref.size() > 2 ? "." + ref.substr(2) : "");
    const auto colon = ref.find(':', 2);
    if (colon == std::string::npos)
        return ref;
    const auto child = ref.substr(2, colon - 2);
    return ref.substr(0, 2) + base + (child.empty() ? "" : "." + child) + ref.substr(colon);
}
inline void qualify(model::Completeness &c, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    for (auto &r : c.reasons) {
        checkpoint(cancel);
        r.at = qualify(r.at, k);
    }
}
inline void qualify(model::BindTarget &t, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    t.signal = qualify(t.signal, k);
    t.process = qualify(t.process, k);
}
inline void qualify(model::PortInternal &p, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    p.signal = qualify(p.signal, k);
    for (auto &s : p.segments)
        qualify(s.target, k, cancel);
}
inline void qualify(model::PinBinding &b, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    b.inst = qualify(b.inst, k);
    b.pin = qualify(b.pin, k);
    for (auto &s : b.segments)
        qualify(s.target, k, cancel);
    for (auto &s : b.possibleWrites) {
        checkpoint(cancel);
        s.ref = qualify(s.ref, k);
    }
}
inline void qualify(model::Expr &e, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    e.slice.ref = qualify(e.slice.ref, k);
    for (auto &a : e.args)
        qualify(a, k, cancel);
    for (auto &d : e.uses) {
        checkpoint(cancel);
        d.signal = qualify(d.signal, k);
    }
}
inline void qualify(model::ProcessInfo &p, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    p.ref = qualify(p.ref, k);
    p.inst = qualify(p.inst, k);
    if (p.expr)
        qualify(*p.expr, k, cancel);
    for (auto &w : p.writes) {
        checkpoint(cancel);
        w.target.ref = qualify(w.target.ref, k);
        for (auto &d : w.deps) {
            checkpoint(cancel);
            d.signal = qualify(d.signal, k);
        }
    }
}
inline void qualify(model::RegisterInfo &r, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    r.ref = qualify(r.ref, k);
    r.inst = qualify(r.inst, k);
    r.signal = qualify(r.signal, k);
    r.process = qualify(r.process, k);
    r.clock.signal = qualify(r.clock.signal, k);
    for (auto &a : r.async) {
        checkpoint(cancel);
        a.signal = qualify(a.signal, k);
    }
}
} // namespace reference

template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
template<class T> void compare(const T &source, const model::InstKey &key) {
    const auto before = json(source);
    auto expected = source;
    reference::qualify(expected, key);
    auto actual = source;
    detail::ReferenceScope scope(key);
    scope.qualify(actual);
    CHECK(json(actual) == json(expected));
    auto compatible = source;
    detail::qualify(compatible, key);
    CHECK(json(compatible) == json(expected));
    CHECK(json(source) == before);
    std::stop_source stop;
    stop.request_stop();
    auto cancelled = source;
    CHECK_THROWS_AS(scope.qualify(cancelled, stop.get_token()), Error);
    CHECK(json(cancelled) == before);
    CHECK_THROWS_AS(detail::qualify(cancelled, key, stop.get_token()), Error);
    CHECK(json(cancelled) == before);
    scope.qualify(cancelled);
    CHECK(json(cancelled) == json(expected));
}
} // namespace

TEST_CASE("reference scopes preserve literal strings and own their occurrence prefix", "[a-m7]") {
    std::mt19937 random(17391);
    std::vector<std::string> refs{"", "i:", "i:0", "i:00.01", "s::0", "s:00:01",
        "x:1.2:0", "p:2:4", "r::0", "d:0", "odd", "abc:def:ghi", ":::",
        "i::", "s::", std::string("s::0\0tail", 9)};
    for (size_t i = 0; i < 6000; ++i) {
        std::string ref;
        for (size_t n = random() % 64; n > 0; --n)
            ref += std::string_view("ipsxr:0123. odd")[random() % 14];
        refs.push_back(std::move(ref));
    }
    for (const size_t depth : std::array<size_t, 6>{0, 1, 2, 8, 128, 1024}) {
        model::InstKey key(depth);
        for (auto &slot : key)
            slot = random();
        detail::ReferenceScope scope(key);
        const auto original = key;
        key.assign(2, 999); // The scope must not borrow this mutable key.
        for (const auto &ref : refs) {
            const auto expected = reference::qualify(ref, original);
            CHECK(scope.qualify(ref) == expected);
            auto moved = ref;
            CHECK(scope.qualify(std::move(moved)) == expected);
            CHECK(detail::qualify(ref, original) == expected);
        }
    }
    std::string retained;
    {
        model::InstKey key{4, 5, 6};
        detail::ReferenceScope scope(key);
        retained = scope.qualify("s::7");
    }
    CHECK(retained == "s:4.5.6:7");
}

TEST_CASE("structured projections retain all fields duplicates and cancellation", "[a-m7]") {
    model::BindTarget target;
    target.kind = "signal"; target.signal = "s::00"; target.process = "x:02:1";
    target.bits = {2, 3}; target.value = "10xz"; target.reason = "unconnected";
    model::PortInternal internal;
    internal.kind = "mapped"; internal.signal = "s::0"; internal.reason = "preserve";
    internal.status = "partial"; internal.expr = "do not qualify s::0";
    for (size_t i = 0; i < 513; ++i)
        internal.segments.push_back({{i, 1}, target});
    model::PinBinding binding;
    binding.inst = "i:00"; binding.pin = "p:00:9"; binding.port = "s::literal";
    binding.direction = "inout"; binding.width = 513; binding.attrs = {{"s::0", "i:"}};
    binding.segments = internal.segments;
    binding.possibleWrites = {{"s::00", {3, 4}}, {"s:2:1", {0, 1}}, {"", {0, 0}}};
    model::Completeness completeness{"partial", {{"unsupported", "x::0", "s::keep"},
        {"unsupported", "x::0", "duplicate"}, {"hier_ref", "i:2.00", "keep"}}};
    model::Expr expression;
    expression.op = "concat"; expression.text = "s::literal"; expression.slice = {"s::7", {0, 3}};
    for (size_t i = 0; i < 513; ++i) {
        model::Expr child;
        child.op = "ref"; child.slice = {"s::" + std::to_string(i), {1, 1}};
        child.uses = {{"s:2:00", {0, 1}}, {"s::3", {2, 3}}};
        expression.args.push_back(std::move(child));
    }
    for (size_t depth = 0; depth < 8; ++depth) {
        model::Expr parent;
        parent.args.push_back(std::move(expression));
        parent.uses = {{"s::0", {0, 1}}};
        expression = std::move(parent);
    }
    model::ProcessInfo process;
    process.ref = "x::0"; process.inst = "i:"; process.kind = "comb";
    process.expr = expression;
    for (size_t i = 0; i < 513; ++i)
        process.writes.push_back({{"s::1", {i, 1}}, {{"s::2", {i, 1}}, {"s::2", {i, 1}}}});
    model::RegisterInfo reg;
    reg.ref = "r::0"; reg.inst = "i:"; reg.signal = "s::1"; reg.process = "x::0";
    reg.bits = {0, 513}; reg.clock = {"s::2", {0, 1}, "posedge", ""};
    reg.async = {{"s::3", {0, 1}, "negedge", "reset"}, {"s:00:4", {0, 1}, "posedge", "set"}};
    for (size_t depth : {size_t{1}, size_t{3}, size_t{128}}) {
        model::InstKey key(depth, 123);
        compare(target, key); compare(internal, key); compare(binding, key);
        compare(completeness, key); compare(expression, key); compare(process, key); compare(reg, key);
        auto expected = binding, actual = binding;
        reference::qualify(expected, key);
        detail::ReferenceScope(key).qualify(actual);
        REQUIRE(actual.possibleWrites.size() == expected.possibleWrites.size());
        for (size_t i = 0; i < actual.possibleWrites.size(); ++i)
            CHECK(actual.possibleWrites[i] == expected.possibleWrites[i]);
    }
}

TEST_CASE("wide body port projection shares a scope without borrowing its source", "[a-m7]") {
    for (size_t count : {size_t{0}, size_t{1}, size_t{8}, size_t{9}, size_t{512}}) {
        model::BodySkeleton body;
        for (size_t i = 0; i < count; ++i) {
            model::PortInfo p;
            p.ref = "discard"; p.name = "pin" + std::to_string(i); p.width = 4;
            p.internal.kind = "mapped"; p.internal.signal = "";
            model::BindTarget target;
            target.kind = "signal"; target.signal = "s::" + std::to_string(i);
            target.process = "x:00:4"; target.bits = {1, 4};
            p.internal.segments.push_back({{0, 4}, target});
            body.ports.push_back(std::move(p));
        }
        model::InstKey key(128, 19);
        const auto original = json(body.ports);
        auto expected = body.ports;
        for (size_t i = 0; i < expected.size(); ++i) {
            expected[i].ref = "p:" + model::formatInstKey(key) + ":" + std::to_string(i);
            reference::qualify(expected[i].internal, key);
        }
        auto actual = detail::occurrencePorts(body, key, {});
        CHECK(json(actual) == json(expected));
        CHECK(json(body.ports) == original);
        body = {}; key.clear(); // Returned data remains owning after both inputs die.
        CHECK(json(actual) == json(expected));
    }
}
