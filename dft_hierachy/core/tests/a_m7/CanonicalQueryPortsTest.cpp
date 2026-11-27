#include "ConnectionSnapshot.h"
#include <catch2/catch_test_macros.hpp>
#include <array>

using namespace hier;
namespace {
struct Frontend final : frontend::Frontend {
    model::FrontendInfo metadata;
    std::vector<model::TopInfo> topList{{"top", 0}};
    std::vector<model::DefInfo> definitionsList{{"top", model::DefKind::Module, "", 0}};
    std::array<model::BodySkeleton, 3> skeletons;
    std::array<model::BodyConnections, 3> facts;
    mutable std::array<size_t, 3> skeletonCalls{}, connectionCalls{};
    std::stop_source *interrupt = nullptr;
    Frontend() {
        for (size_t i = 0; i < 64; ++i) {
            model::PortInfo port;
            port.ref = "not-an-occurrence-ref"; // Public projection assigns refs by position.
            port.name = "p" + std::to_string(i);
            port.width = 1;
            port.direction = model::Direction::In;
            port.attrs = {{"large", std::string(4096, 'a')}};
            port.internal.kind = "direct";
            port.internal.signal = "s::" + std::to_string(i % 2);
            port.internal.bits = {0, 1};
            skeletons[1].ports.push_back(std::move(port));
        }
        for (uint32_t i = 0; i < 130; ++i) {
            model::ChildSlot slot;
            slot.body = i < 128 ? 1 : model::kNoBody;
            slot.kind = i < 128 ? model::InstKind::Module : model::InstKind::Blackbox;
            slot.blackboxPins = {"A"};
            skeletons[0].slots.push_back(slot);
            if (i >= 128) {
                model::PinBinding binding;
                binding.inst = "i:" + std::to_string(i);
                binding.pin = "p:" + std::to_string(i) + ":0";
                binding.width = i;
                binding.direction = i == 128 ? "in" : "out";
                facts[0].bindings.push_back(binding);
            }
        }
        for (auto &body : facts)
            body.estimatedBytes = 128; // Cache test control, not a memory measurement.
    }
    const model::FrontendInfo &info() const override { return metadata; }
    const std::vector<model::TopInfo> &tops() const override { return topList; }
    const std::vector<model::DefInfo> &definitions() const override { return definitionsList; }
    size_t bodyCount() const override { return facts.size(); }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId id) const override {
        ++skeletonCalls.at(id);
        if (interrupt && id == 1)
            interrupt->request_stop();
        return skeletons.at(id);
    }
    model::BodyConnections connections(model::BodyId id) const override {
        ++connectionCalls.at(id);
        return facts.at(id);
    }
};
} // namespace

TEST_CASE("query occurrences borrow one immutable body port vector across cache eviction", "[a-m7]") {
    for (size_t budget : {size_t{0}, size_t{1}, size_t{128}, size_t{1 << 20}}) {
        auto source = std::make_unique<Frontend>();
        auto &control = *source;
        db::DesignDb database(std::move(source), budget);
        detail::ConnectionSnapshot snapshot(database, {});
        const auto &first = snapshot.load("i:0.0").occurrence;
        const auto &canonical = database.skeleton(1).ports;
        REQUIRE(&first.ports() == &canonical);
        REQUIRE(first.synthesizedPorts.empty());
        const auto *index = &snapshot.portReferences(first);
        for (size_t i = 0; i < 128; ++i) {
            const auto &next = snapshot.load("i:0." + std::to_string(i)).occurrence;
            CHECK(&next.ports() == &canonical);
            CHECK(next.synthesizedPorts.empty());
            CHECK(&snapshot.portReferences(next) == index);
            CHECK(next.portRef(7) == "p:0." + std::to_string(i) + ":7");
            CHECK(next.ports()[0].internal.signal == "s::0");
            CHECK(next.ports()[0].attrs.at("large") == std::string(4096, 'a'));
            REQUIRE(database.connections(2, {}));
        }
        CHECK(control.skeletonCalls[1] == 1);
        CHECK(control.connectionCalls[1] == 1);
        CHECK(first.ports()[0].ref == "not-an-occurrence-ref");
        CHECK(first.ref(first.ports()[1].internal.signal) == "s:0.0:1");
    }
}

TEST_CASE("shared port lookup can promote during recursion into another occurrence", "[a-m7]") {
    auto source = std::make_unique<Frontend>();
    db::DesignDb database(std::move(source), 0);
    detail::ConnectionSnapshot snapshot(database, {});
    const auto &first = snapshot.load("i:0.0").occurrence;
    const auto &second = snapshot.load("i:0.1").occurrence;
    auto &index = snapshot.portReferences(first);
    REQUIRE(&index == &snapshot.portReferences(second));
    std::vector<size_t> outer, inner, expectedEven, expectedOdd;
    for (size_t i = 0; i < 64; ++i)
        (i % 2 ? expectedOdd : expectedEven).push_back(i);
    REQUIRE(index.visit(first.key, "s:0.0:0", [&](const auto &row) {
        outer.push_back(row.outer);
        if (row.outer == 14)
            REQUIRE(index.visit(second.key, "s:0.1:1", [&](const auto &nested) {
                inner.push_back(nested.outer);
                return true;
            }, {}));
        return true;
    }, {}));
    CHECK(outer == expectedEven);
    CHECK(inner == expectedOdd);
    inner.clear();
    REQUIRE(index.visit(second.key, "s:0.10:1", [&](const auto &row) {
        inner.push_back(row.outer);
        return true;
    }, {}));
    CHECK(inner.empty()); // Complete occurrence prefix, not textual partial match.
    std::stop_source stop;
    stop.request_stop();
    CHECK_THROWS_AS(index.visit(first.key, "s:0.0:0", [](auto) { return true; }, stop.get_token()), Error);
    outer.clear();
    REQUIRE(index.visit(first.key, "s:0.0:0", [&](const auto &row) {
        outer.push_back(row.outer);
        return true;
    }, {}));
    CHECK(outer == expectedEven);
}

TEST_CASE("body-less port descriptions remain owned and occurrence-specific", "[a-m7]") {
    db::DesignDb database(std::make_unique<Frontend>(), 0);
    detail::ConnectionSnapshot snapshot(database, {});
    const auto &a = snapshot.load("i:0.128").occurrence;
    const auto &b = snapshot.load("i:0.129").occurrence;
    CHECK(a.bodyPorts == nullptr);
    CHECK(b.bodyPorts == nullptr);
    CHECK(&a.ports() == &a.synthesizedPorts);
    CHECK(&a.ports() != &b.ports());
    CHECK(&snapshot.portReferences(a) != &snapshot.portReferences(b));
    REQUIRE(a.ports().size() == 1);
    REQUIRE(b.ports().size() == 1);
    CHECK(a.ports()[0].width == 128);
    CHECK(b.ports()[0].width == 129);
    CHECK(a.ports()[0].direction == model::Direction::In);
    CHECK(b.ports()[0].direction == model::Direction::Out);
    CHECK(a.portRef(0) == "p:0.128:0");
    CHECK(b.portRef(0) == "p:0.129:0");
}

TEST_CASE("canonical port indexes retain literal qualification and every matching row", "[a-m7]") {
    const std::vector<std::string> refs{"s::0", "s::1", "s::00", "s:2:0", "s:00:0", "", "odd"};
    for (size_t count : {size_t{0}, size_t{1}, size_t{8}, size_t{9}, size_t{64}}) {
        std::vector<model::PortInfo> ports;
        std::vector<detail::ReferenceRow> rows;
        for (size_t i = 0; i < count; ++i) {
            model::PortInfo port;
            if (i % 2 == 0) {
                port.internal.kind = "direct";
                port.internal.signal = refs[i % refs.size()];
            } else {
                port.internal.kind = "mapped";
                for (size_t j = 0; j < 3; ++j) {
                    model::BindTarget target;
                    target.kind = j == 1 ? "const" : "signal";
                    target.signal = refs[(i + j) % refs.size()];
                    port.internal.segments.push_back({{j, 1}, target});
                }
            }
            ports.push_back(std::move(port));
        }
        // Independent ordered enumeration, matching the original qualified
        // vector path. Views borrow the completed input, never moved ports.
        for (size_t p = 0; p < ports.size(); ++p) {
            const auto &internal = ports[p].internal;
            if (internal.kind == "direct")
                rows.push_back({internal.signal, p});
            else
                for (size_t s = 0; s < internal.segments.size(); ++s)
                    rows.push_back({internal.segments[s].target.signal, p, s});
        }
        detail::PortReferenceIndex index(ports);
        for (const model::InstKey &key : {model::InstKey{0}, model::InstKey{0, 1}, model::InstKey{0, 10, 3}})
            for (size_t pass = 0; pass < 2; ++pass)
                for (const auto &local : refs) {
                    auto query = detail::qualify(local, key);
                    std::vector<std::array<size_t, 2>> expected, actual;
                    for (const auto &row : rows)
                        if (detail::qualify(std::string(row.ref), key) == query)
                            expected.push_back({row.outer, row.inner});
                    REQUIRE(index.visit(key, query, [&](const auto &row) {
                        actual.push_back({row.outer, row.inner});
                        return true;
                    }, {}));
                    CHECK(actual == expected);
                }
    }
}

TEST_CASE("cancelled skeleton extraction publishes no borrowed port view", "[a-m7]") {
    auto source = std::make_unique<Frontend>();
    auto &control = *source;
    std::stop_source stop;
    control.interrupt = &stop;
    db::DesignDb database(std::move(source), 0);
    detail::ConnectionSnapshot cancelled(database, stop.get_token());
    CHECK_THROWS_AS(cancelled.load("i:0.0"), Error);
    CHECK(control.skeletonCalls[1] == 1);
    control.interrupt = nullptr;
    detail::ConnectionSnapshot retried(database, {});
    const auto &result = retried.load("i:0.0").occurrence;
    CHECK(control.skeletonCalls[1] == 2);
    CHECK(&result.ports() == &database.skeleton(1).ports);
    CHECK_FALSE(retried.load("i:0.0").inserted);
}
