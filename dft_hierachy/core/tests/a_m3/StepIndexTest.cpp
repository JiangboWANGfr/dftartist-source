#include "../../query/src/Step.h"
#include <array>
#include <catch2/catch_test_macros.hpp>

using namespace hier;
namespace {
// Existing Frontend interface, with explicitly owned synthetic facts. These are
// A's internal lifecycle checks, not B's public cost/cancellation adapter.
struct Frontend final : frontend::Frontend {
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_{{"top", 0}};
    std::vector<model::DefInfo> defs_{{"top", model::DefKind::Module, "", 0}};
    std::array<model::BodySkeleton, 3> skeletons;
    std::array<model::BodyConnections, 3> facts;
    mutable std::array<unsigned, 3> extractions{};
    std::stop_source *interrupt = nullptr;
    Frontend() {
        model::SignalInfo a;
        a.ref = "s::0";
        a.width = 8;
        for (auto &body : facts) {
            body.signals.push_back(a);
            body.estimatedBytes = 128;
        }
        for (uint32_t child = 0; child < 2; ++child) {
            model::ChildSlot slot;
            slot.body = child + 1;
            skeletons[0].slots.push_back(slot);
            model::PortInfo port;
            port.direction = model::Direction::In;
            port.width = 8;
            skeletons[child + 1].ports.push_back(port);
            model::PortInternal internal;
            internal.kind = "direct";
            internal.signal = "s::0";
            internal.bits = {0, 8};
            facts[child + 1].internals.push_back(internal);
            model::PinBinding binding;
            binding.inst = "i:" + std::to_string(child);
            binding.pin = "p:" + std::to_string(child) + ":0";
            binding.direction = "in";
            binding.width = 8;
            model::BindTarget target;
            target.kind = "signal";
            target.signal = "s::0";
            target.bits = {0, 8};
            binding.segments.push_back({{0, 8}, target});
            facts[0].bindings.push_back(binding);
        }
    }
    const model::FrontendInfo &info() const override { return info_; }
    const std::vector<model::TopInfo> &tops() const override { return tops_; }
    const std::vector<model::DefInfo> &definitions() const override { return defs_; }
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
}

TEST_CASE("step never extracts a third logical context and warm pages stay bounded", "[a-m3-step-index]") {
    for (size_t cache : {size_t{0}, size_t{64 * 1024 * 1024}}) {
        auto frontend = std::make_unique<Frontend>();
        auto &counts = frontend->extractions;
        db::DesignDb db(std::move(frontend), cache);
        auto first = detail::step(db, "s:0:0", false, {}, {}, {});
        REQUIRE(first);
        REQUIRE(first->result.hops.size() == 1);
        REQUIRE_FALSE(first->result.next.empty());
        CHECK(counts == std::array<unsigned, 3>{1, 1, 0});
        REQUIRE(first->result.hops[0].next.size() == 1);
        CHECK(first->result.hops[0].next[0].slice.ref == "s:0.0:0");
        auto last = detail::step(db, "s:0:0", false, {}, {1000, first->result.next}, {});
        REQUIRE(last);
        REQUIRE(last->result.hops.size() == 1);
        CHECK(last->result.next.empty());
        CHECK(last->completeness.status == "complete");
        REQUIRE(last->result.hops[0].next.size() == 1);
        CHECK(last->result.hops[0].next[0].slice.ref == "s:0.1:0");
        CHECK(counts[1] == 1); // Cursor resumed without opening the earlier child.
        CHECK(counts[2] == 1);
        auto warm = detail::step(db, "s:0:0", false, {}, {}, {});
        REQUIRE(warm);
        CHECK(warm->result.hops.size() == 1);
        CHECK(warm->result.next == first->result.next);
        CHECK(counts[2] == 1);
    }
}

TEST_CASE("cancellation during adjacent extraction publishes no partial child state", "[a-m3-step-index]") {
    auto frontend = std::make_unique<Frontend>();
    auto &view = *frontend;
    std::stop_source stop;
    view.interrupt = &stop;
    db::DesignDb db(std::move(frontend));
    auto cancelled = detail::step(db, "s:0:0", false, {}, {}, stop.get_token());
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    CHECK(view.extractions == std::array<unsigned, 3>{1, 1, 0});
    view.interrupt = nullptr;
    auto retried = detail::step(db, "s:0:0", false, {}, {}, {});
    REQUIRE(retried);
    CHECK(retried->result.hops.size() == 1);
    CHECK(view.extractions == std::array<unsigned, 3>{1, 2, 0});
}

TEST_CASE("dependency index locates disjoint intervals without expanding their bit space", "[a-m3-step-index]") {
    model::BodyConnections facts;
    model::BodySkeleton skeleton;
    model::QueryResult<model::ProcessInfo> proc;
    proc.result.ref = "x::0";
    constexpr size_t count = 4096;
    for (size_t i = 0; i < count; ++i) {
        model::Write write;
        write.target = {"s::1", {uint64_t(i * 2), 1}};
        write.deps.push_back({"s::0", write.target.bits, "data", "exact", "bitwise"});
        proc.result.writes.push_back(std::move(write));
    }
    facts.processes.push_back(proc);
    auto index = db::indexConnections(facts, skeleton, {});
    REQUIRE(index);
    auto list = (*index)->find("s::0", false);
    REQUIRE(list);
    CHECK(list->entries.size() == count);
    CHECK(*list->next(0, {8190, 1}) == count - 1);
    CHECK(*list->next(0, {8189, 1}) == db::noEntry);
    CHECK(*list->next(count, {0, 8192}) == db::noEntry);
    CHECK(*list->next(count - 3, {0, 8192}) == count - 3);
    std::stop_source stop;
    stop.request_stop();
    auto cancelled = list->next(0, {0, 8192}, stop.get_token());
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    facts.processes[0].result.writes.resize(1);
    auto &wide = facts.processes[0].result.writes[0];
    wide.target.bits = {0, uint64_t{1} << 40};
    wide.deps[0].bits = wide.target.bits;
    auto wideIndex = db::indexConnections(facts, skeleton, {});
    REQUIRE(wideIndex);
    CHECK((*wideIndex)->find("s::1", true)->entries.size() == 1);
}

TEST_CASE("register intersection splits only the covered portion in both directions", "[a-m3-step-index]") {
    auto frontend = std::make_unique<Frontend>();
    auto &facts = frontend->facts[0];
    facts.bindings.clear();
    auto output = facts.signals[0];
    output.ref = "s::1";
    facts.signals.push_back(output);
    model::QueryResult<model::ProcessInfo> proc;
    proc.result.ref = "x::0";
    model::Write write;
    write.target = {"s::1", {0, 8}};
    write.deps.push_back({"s::0", {0, 8}, "data", "exact", "bitwise"});
    proc.result.writes.push_back(write);
    facts.processes.push_back(proc);
    model::RegisterInfo reg;
    reg.ref = "r::0";
    reg.process = "x::0";
    reg.signal = "s::1";
    reg.bits = {2, 3};
    facts.registers.push_back(reg);
    db::DesignDb db(std::move(frontend));
    std::string registerFact;
    for (bool up : {false, true}) {
        auto result = detail::step(db, up ? "s:0:1" : "s:0:0", up, {}, {}, {});
        REQUIRE(result);
        REQUIRE(result->result.hops.size() == 3);
        const auto &hops = result->result.hops;
        CHECK(hops[0].kind == "process");
        CHECK(hops[0].from.bits == model::BitRange{0, 2});
        CHECK(hops[1].kind == "process");
        CHECK(hops[1].from.bits == model::BitRange{5, 3});
        CHECK(hops[0].fact == hops[1].fact);
        CHECK(hops[2].kind == "register");
        CHECK(hops[2].via == "r:0:0");
        CHECK(hops[2].from.bits == model::BitRange{2, 3});
        if (registerFact.empty())
            registerFact = hops[2].fact;
        CHECK(hops[2].fact == registerFact);
    }
}

TEST_CASE("connection index is charged to the LRU and retained query data survives eviction", "[a-m3-step-index]") {
    auto sizing = std::make_unique<Frontend>();
    auto index = db::indexConnections(sizing->facts[0], sizing->skeletons[0], {});
    REQUIRE(index);
    const auto budget = (*index)->estimatedBytes + sizing->facts[0].estimatedBytes;
    auto &view = *sizing;
    db::DesignDb db(std::move(sizing), budget);
    auto first = db.indexedConnections(0);
    REQUIRE(first);
    CHECK(db.indexedConnections(0)->index == first->index);
    CHECK(view.extractions[0] == 1);
    REQUIRE(db.connections(1)); // Complete root entry filled the budget, so it is evicted.
    auto rebuilt = db.indexedConnections(0);
    REQUIRE(rebuilt);
    CHECK(view.extractions[0] == 2);
    CHECK(rebuilt->index != first->index);
    CHECK(first->facts->bindings.size() == 2);
    CHECK(first->index->find("s::0", false)->entries.size() == 2);
}
