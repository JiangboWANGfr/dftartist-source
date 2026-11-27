#include "ConnectionSnapshot.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <type_traits>

using namespace hier;
namespace {
// A-owned fixtures through the existing Frontend API; no production test hooks.
struct Frontend final : frontend::Frontend {
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_{{"top", 0}};
    std::vector<model::DefInfo> definitions_{{"top", model::DefKind::Module, "", 0}};
    std::array<model::BodySkeleton, 3> skeletons;
    std::array<model::BodyConnections, 3> facts;
    mutable std::array<size_t, 3> extractions{};
    std::stop_source *interrupt = nullptr; // Borrowed test control, never owns a resource.
    Frontend() {
        for (auto &body : facts) {
            model::SignalInfo signal;
            signal.ref = "s::0";
            signal.width = 8;
            body.signals.push_back(signal);
            body.estimatedBytes = 128; // Deliberate cache control, not a memory measurement.
        }
        model::ProcessInfo process;
        process.ref = "x::0";
        process.inst = "i:";
        facts[1].processes.push_back({process, {}});
        model::PortInfo port;
        port.name = "a";
        port.width = 8;
        port.direction = model::Direction::In;
        port.internal.kind = "direct";
        port.internal.signal = "s::0";
        port.internal.bits = {0, 8};
        skeletons[1].ports.push_back(port);
        for (uint32_t i = 0; i < 4; ++i) {
            model::ChildSlot slot;
            slot.body = i < 2 ? 1 : model::kNoBody;
            slot.kind = i < 2 ? model::InstKind::Module
                             : i == 2 ? model::InstKind::Blackbox : model::InstKind::Primitive;
            slot.blackboxPins = {"A", "Y"};
            skeletons[0].slots.push_back(slot);
            for (size_t pin = 0; pin < 2; ++pin) {
                model::PinBinding binding;
                binding.inst = "i:" + std::to_string(i);
                binding.pin = "p:" + std::to_string(i) + ":" + std::to_string(pin);
                binding.width = 8;
                binding.direction = pin ? "out" : "ref";
                binding.attrs = {{"slot", std::to_string(i)}};
                facts[0].bindings.push_back(std::move(binding));
            }
        }
    }
    const model::FrontendInfo &info() const override { return info_; }
    const std::vector<model::TopInfo> &tops() const override { return tops_; }
    const std::vector<model::DefInfo> &definitions() const override { return definitions_; }
    size_t bodyCount() const override { return facts.size(); }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId id) const override { return skeletons.at(id); }
    model::BodyConnections connections(model::BodyId id) const override {
        ++extractions.at(id);
        if (interrupt && id == 1)
            interrupt->request_stop();
        return facts.at(id);
    }
};
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
} // namespace

TEST_CASE("query snapshot pins shared bodies across L2 eviction without qualifying canonical facts", "[a-m7]") {
    for (size_t budget : {size_t{0}, size_t{1}, size_t{128}}) {
        CAPTURE(budget);
        auto frontend = std::make_unique<Frontend>();
        auto &counts = frontend->extractions;
        db::DesignDb db(std::move(frontend), budget);
        std::weak_ptr<const model::BodyConnections> borrowed;
        {
            detail::ConnectionSnapshot snapshot(db, {});
            auto root = snapshot.load("i:0");
            auto first = snapshot.load("i:0.0"), second = snapshot.load("i:0.1");
            CHECK(root.inserted);
            CHECK(first.inserted);
            CHECK(second.inserted);
            CHECK(first.occurrence.facts == second.occurrence.facts);
            CHECK(first.occurrence.ref("x::0") == "x:0.0:0");
            CHECK(second.occurrence.ref("x::0") == "x:0.1:0");
            CHECK(first.occurrence.facts->processes[0].result.ref == "x::0");
            CHECK(first.occurrence.ref(first.occurrence.ports()[0].internal.signal) == "s:0.0:0");
            CHECK(second.occurrence.ref(second.occurrence.ports()[0].internal.signal) == "s:0.1:0");
            REQUIRE(db.connections(2, {})); // Force eviction with a one-entry cache.
            CHECK_FALSE(snapshot.load("i:0.0").inserted);
            CHECK_FALSE(snapshot.load("i:000").inserted);
            const auto &blackbox = snapshot.load("i:0.2").occurrence;
            const auto &primitive = snapshot.load("i:0.3").occurrence;
            REQUIRE(blackbox.ports().size() == 2);
            CHECK(blackbox.ports()[0].ref == "p:0.2:0");
            CHECK(blackbox.ports()[0].width == 8);
            CHECK(blackbox.ports()[0].direction == model::Direction::Unknown); // Existing ref rule.
            CHECK(blackbox.ports()[1].direction == model::Direction::Out);
            CHECK(blackbox.ports()[1].attrs.at("slot") == "2");
            CHECK(blackbox.ports()[0].internal.reason == "blackbox");
            CHECK(primitive.ports()[0].internal.reason == "unsupported");
            CHECK(blackbox.facts->signals.empty());
            CHECK(blackbox.facts == primitive.facts);
            CHECK(counts == std::array<size_t, 3>{1, 1, 1});
            borrowed = first.occurrence.facts;
            CHECK_FALSE(borrowed.expired());
        }
        CHECK(borrowed.expired());
        detail::ConnectionSnapshot next(db, {});
        CHECK(next.load("i:0.0").occurrence.facts->signals[0].ref == "s::0");
        CHECK(counts[1] == 2); // Query ownership does not become a global cache.
    }
    static_assert(!std::is_copy_constructible_v<detail::ConnectionSnapshot>);
    static_assert(!std::is_move_constructible_v<detail::ConnectionSnapshot>);
}

TEST_CASE("cancelled snapshot loading publishes no incomplete occurrence or lease", "[a-m7]") {
    auto frontend = std::make_unique<Frontend>();
    auto &source = *frontend;
    std::stop_source stop;
    source.interrupt = &stop;
    db::DesignDb db(std::move(frontend), 1024);
    detail::ConnectionSnapshot snapshot(db, stop.get_token());
    try {
        snapshot.load("i:0.0");
        FAIL("expected cancellation");
    } catch (const Error &error) {
        CHECK(error.code == ErrorCode::Cancelled);
        CHECK(error.message == "query cancelled");
    }
    CHECK(source.extractions[1] == 1);
    source.interrupt = nullptr;
    detail::ConnectionSnapshot retry(db, {});
    CHECK(retry.load("i:0.0").occurrence.facts->processes[0].result.ref == "x::0");
    CHECK(source.extractions[1] == 2);
    CHECK_THROWS_AS(retry.load("bad"), Error);
    CHECK_THROWS_AS(retry.load("i:0.99"), Error);
}

TEST_CASE("shared port projection retains repeated binding widths attrs and direction precedence", "[a-m7]") {
    model::ChildSlot slot;
    slot.kind = model::InstKind::Blackbox;
    slot.blackboxPins = {"A"};
    model::PinBinding first, last;
    first.pin = last.pin = "p:2:0";
    first.direction = "in";
    first.width = 8;
    first.attrs = {{"entry", "first"}};
    last.direction = "ref";
    last.attrs = {{"entry", "last"}};
    const std::vector<model::PinBinding> bindings{first, last};
    auto ports = detail::occurrencePorts(slot, {0, 2}, bindings, {});
    REQUIRE(ports.size() == 1);
    CHECK(ports[0].width == 8);
    CHECK(ports[0].direction == model::Direction::In);
    CHECK(ports[0].attrs.at("entry") == "last");
    CHECK(ports[0].internal.reason == "blackbox");
}

TEST_CASE("public endpoint queries remain identical with disabled small and normal caches", "[a-m7]") {
    std::vector<std::string> baseline;
    for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{1}, size_t{128}, size_t{64 * 1024 * 1024}}) {
            model::OpenOptions options;
            options.files = {HIER_SNAPSHOT_FIXTURE};
            options.tops = {"endpoint_top"};
            options.forcePerInstanceBodies = per;
            options.connectionCacheBytes = cache;
            auto opened = Design::open(options);
            REQUIRE(opened);
            auto &design = **opened;
            REQUIRE(design.diagnostics().errorCount == 0);
            std::vector<std::string> replies;
            for (bool upstream : {false, true})
                for (const auto &reach : {"local", "hier"}) {
                    ConnectionRequest request;
                    request.reach = reach;
                    auto reply = upstream ? design.drivers("s:0:1", request)
                                          : design.loads("s:0:0", request);
                    REQUIRE(reply);
                    REQUIRE(reply->completeness.status == "complete");
                    REQUIRE(reply->result.size() == 64);
                    replies.push_back(json(*reply));
                }
            if (baseline.empty()) baseline = replies;
            CHECK(replies == baseline);
            std::stop_source stop;
            stop.request_stop();
            auto cancelled = design.loads("s:0:0", {}, stop.get_token());
            REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == ErrorCode::Cancelled);
        }
}
