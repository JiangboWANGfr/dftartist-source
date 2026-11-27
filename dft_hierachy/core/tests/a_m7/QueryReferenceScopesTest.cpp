#include "ConnectionSnapshot.h"
#include "Step.h"
#include "Observe.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <set>
#include <type_traits>

using namespace hier;
using Row = detail::ReferenceRow;
using Position = std::array<size_t, 3>;
namespace {
Position position(const Row &row) { return {row.outer, row.inner, row.dependency}; }
// Original full string conversion, independent of ReferenceScope/reverse matching.
std::string qualified(std::string ref, const model::InstKey &key) {
    if (ref.empty()) return ref;
    const auto base = model::formatInstKey(key);
    if (ref.starts_with("i:")) return "i:" + base + (ref.size() > 2 ? "." + ref.substr(2) : "");
    const auto colon = ref.find(':', 2);
    if (colon == std::string::npos) return ref;
    const auto child = ref.substr(2, colon - 2);
    return ref.substr(0, 2) + base + (child.empty() ? "" : "." + child) + ref.substr(colon);
}
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer; protocol::write(writer, value); return writer.str();
}
struct Frontend final : frontend::Frontend {
    static constexpr size_t depth = 32;
    model::FrontendInfo metadata;
    std::vector<model::TopInfo> tops_{{"top", 0}};
    std::vector<model::DefInfo> defs_{{"top", model::DefKind::Module, "", 0}};
    std::array<model::BodySkeleton, depth + 2> skeletons;
    std::array<model::BodyConnections, depth + 2> facts;
    mutable std::array<size_t, depth + 2> calls{};
    std::stop_source *stop = nullptr;
    Frontend() {
        for (size_t i = 0; i < depth; ++i) {
            model::ChildSlot slot;
            slot.body = model::BodyId(i + 1);
            skeletons[i].slots.push_back(slot);
            if (i == 0) skeletons[i].slots.push_back(slot);
        }
        model::ChildSlot box;
        box.body = model::kNoBody; box.kind = model::InstKind::Blackbox; box.blackboxPins = {"A"};
        skeletons[0].slots.push_back(box);
        model::PinBinding binding;
        binding.inst = "i:2"; binding.pin = "p:2:0"; binding.width = 1; binding.direction = "in";
        facts[0].bindings.push_back(binding);
        for (auto &body : facts) {
            model::SignalInfo signal;
            signal.ref = "s::0"; signal.width = 1;
            body.signals.push_back(signal); body.estimatedBytes = 128;
        }
        model::PortInfo port;
        port.internal.kind = "direct"; port.internal.signal = "s::0"; port.width = 1;
        skeletons[depth].ports.push_back(port);
    }
    const model::FrontendInfo &info() const override { return metadata; }
    const std::vector<model::TopInfo> &tops() const override { return tops_; }
    const std::vector<model::DefInfo> &definitions() const override { return defs_; }
    size_t bodyCount() const override { return facts.size(); }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId id) const override { return skeletons.at(id); }
    model::BodyConnections connections(model::BodyId id) const override {
        ++calls.at(id);
        if (stop && id == depth) stop->request_stop();
        return facts.at(id);
    }
};
} // namespace

TEST_CASE("scoped reverse lookup equals original full qualification for all relation rows", "[a-m7]") {
    const std::vector<std::string> refs{"s::0", "s::00", "s:2:3", "s:02:3", "p:4:0", "x:2..:0",
        "r::1", "", "odd", "i:", "i:2", "p:00:1", std::string("s::0\0x", 6)};
    for (size_t count : {size_t{0}, size_t{1}, size_t{8}, size_t{9}, size_t{64}}) {
        model::BodyConnections facts;
        std::array<std::vector<Row>, size_t(detail::FactReference::Count)> rows;
        std::vector<model::PortInfo> ports;
        std::vector<Row> portRows;
        auto record = [&](auto kind, const std::string &ref, size_t a, size_t b = 0, size_t c = 0) {
            rows[size_t(kind)].push_back({ref, a, b, c});
        };
        for (size_t i = 0; i < count; ++i) {
            const auto &ref = refs[i % refs.size()];
            model::SignalInfo signal; signal.ref = ref; facts.signals.push_back(signal);
            record(detail::FactReference::Signal, ref, i);
            model::QueryResult<model::ProcessInfo> proc;
            model::Write write; write.target.ref = ref;
            record(detail::FactReference::Write, ref, i);
            for (size_t j = 0; j < 2; ++j) {
                const auto &dep = refs[(i + j) % refs.size()];
                write.deps.push_back({dep, {0, 1}});
                record(detail::FactReference::Read, dep, i, 0, j);
            }
            proc.result.writes.push_back(write); facts.processes.push_back(proc);
            model::PinBinding binding; binding.pin = ref;
            record(detail::FactReference::Pin, ref, i);
            model::BindSegment segment; segment.target.kind = "signal"; segment.target.signal = ref;
            binding.segments.push_back(segment); binding.possibleWrites.push_back({ref, {0, 1}});
            record(detail::FactReference::Segment, ref, i);
            record(detail::FactReference::PossibleWrite, ref, i);
            facts.bindings.push_back(binding);
            model::PortInfo port;
            if (i % 2) {
                port.internal.kind = "mapped"; port.internal.segments.push_back(segment);
            } else {
                port.internal.kind = "direct"; port.internal.signal = ref;
            }
            ports.push_back(port); portRows.push_back({ref, i});
        }
        std::vector<model::InstKey> keys{{}, {0}, {0, 1}, model::InstKey(64, 12), model::InstKey(256, 7)};
        for (const auto &key : keys) {
            detail::ReferenceScope scope(key);
            CHECK(scope.keyText() == model::formatInstKey(key));
            detail::FactReferenceIndex scoped(facts), legacy(facts);
            detail::PortReferenceIndex scopedPorts(ports), legacyPorts(ports);
            std::vector<std::string> targets = refs;
            for (const auto &ref : refs) targets.push_back(qualified(ref, key));
            for (const auto extra : {"s:000.1:0", "s:0.10:0", "p:0.1:000", "s:99:1"}) targets.emplace_back(extra);
            for (const auto &target : targets) {
                for (size_t k = 0; k < rows.size(); ++k) {
                    std::vector<Position> expected, actual, compatible;
                    for (const auto &row : rows[k])
                        if (qualified(std::string(row.ref), key) == target) expected.push_back(position(row));
                    REQUIRE(scoped.visit(detail::FactReference(k), scope, target, [&](const Row &row) {
                        actual.push_back(position(row)); return true;
                    }, {}));
                    REQUIRE(legacy.visit(detail::FactReference(k), key, target, [&](const Row &row) {
                        compatible.push_back(position(row)); return true;
                    }, {}));
                    CHECK(actual == expected); CHECK(compatible == expected);
                }
                std::vector<Position> expected, actual, compatible;
                for (const auto &row : portRows)
                    if (qualified(std::string(row.ref), key) == target) expected.push_back(position(row));
                REQUIRE(scopedPorts.visit(scope, target, [&](const Row &row) { actual.push_back(position(row)); return true; }, {}));
                REQUIRE(legacyPorts.visit(key, target, [&](const Row &row) { compatible.push_back(position(row)); return true; }, {}));
                CHECK(actual == expected); CHECK(compatible == expected);
            }
        }
    }
}

TEST_CASE("shared scoped indexes remain stable during recursive promotion and cancellation", "[a-m7]") {
    model::BodyConnections facts;
    for (size_t i = 0; i < 64; ++i) {
        model::SignalInfo signal; signal.ref = i % 2 ? "s::1" : "s::0";
        facts.signals.push_back(signal);
    }
    detail::FactReferenceIndex index(facts);
    detail::ReferenceScope first(model::InstKey{0, 1}), second(model::InstKey{0, 2});
    std::vector<size_t> outer, inner, even, odd;
    for (size_t i = 0; i < 64; ++i) (i % 2 ? odd : even).push_back(i);
    REQUIRE(index.visit(detail::FactReference::Signal, first, "s:0.1:0", [&](const Row &row) {
        outer.push_back(row.outer);
        if (row.outer == 14)
            REQUIRE(index.visit(detail::FactReference::Signal, second, "s:0.2:1", [&](const Row &nested) {
                inner.push_back(nested.outer); return true;
            }, {}));
        return true;
    }, {}));
    CHECK(outer == even); CHECK(inner == odd);
    std::stop_source stop;
    CHECK_THROWS_AS(index.visit(detail::FactReference::Signal, first, "s:0.1:0", [&](const Row &) {
        stop.request_stop(); return true;
    }, stop.get_token()), Error);
    outer.clear();
    REQUIRE(index.visit(detail::FactReference::Signal, first, "s:0.1:0", [&](const Row &row) {
        outer.push_back(row.outer); return true;
    }, {}));
    CHECK(outer == even);
    CHECK(first.keyText() == "0.1"); CHECK(second.keyText() == "0.2");
}

TEST_CASE("snapshot scopes own fixed deep keys across sharing eviction and query destruction", "[a-m7]") {
    std::string retained, retainedKey;
    for (size_t budget : {size_t{0}, size_t{1}, size_t{128}}) {
        auto source = std::make_unique<Frontend>(); auto &control = *source;
        db::DesignDb db(std::move(source), budget);
        std::weak_ptr<const model::BodyConnections> borrowed;
        {
            detail::ConnectionSnapshot snapshot(db, {});
            model::InstKey a(Frontend::depth + 1, 0), b = a; b[1] = 1;
            const auto &first = snapshot.load(model::instRef(a)).occurrence;
            const auto &second = snapshot.load(model::instRef(b)).occurrence;
            REQUIRE(first.facts == second.facts);
            CHECK(first.scope().keyText() == model::formatInstKey(a));
            CHECK(second.scope().keyText() == model::formatInstKey(b));
            const auto *scopeAddress = &first.scope();
            retained = first.ref("s::0"); retainedKey = first.scope().keyText();
            const auto &box = snapshot.load("i:0.2").occurrence;
            CHECK(box.scope().keyText() == "0.2"); CHECK(box.portRef(0) == "p:0.2:0");
            REQUIRE(db.connections(Frontend::depth + 1, {}));
            CHECK(&snapshot.load(model::instRef(a)).occurrence.scope() == scopeAddress);
            CHECK(first.ref("s::0") == qualified("s::0", a));
            CHECK(second.ref("s::0") == qualified("s::0", b));
            CHECK(control.calls[Frontend::depth] == 1);
            borrowed = first.facts; CHECK_FALSE(borrowed.expired());
        }
        CHECK(borrowed.expired());
    }
    CHECK(retained == "s:" + retainedKey + ":0");
    static_assert(std::is_const_v<decltype(detail::ConnectionSnapshot::Occurrence::key)>);
}

TEST_CASE("step keeps the original two occurrence budget fact identities and owning continuations", "[a-m7]") {
    std::string retained;
    for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{1}, size_t{128}, size_t{64 * 1024 * 1024}}) {
            model::OpenOptions options; options.files = {HIER_QUERY_REFERENCE_SCOPES_FIXTURE};
            options.tops = {"query_scope_top"}; options.forcePerInstanceBodies = per; options.connectionCacheBytes = cache;
            auto design = Design::open(options); REQUIRE(design); REQUIRE((*design)->diagnostics().errorCount == 0);
            for (const int limit : {1, 8192}) {
                StepLimit page; page.maxHops = limit;
                std::vector<model::Hop> all; std::set<std::string> facts;
                size_t pages = 0;
                do {
                    auto reply = (*design)->step("s:0:0", false, {}, page); REQUIRE(reply);
                    REQUIRE(reply->result.hops.size() == 1);
                    const auto &hop = reply->result.hops.front();
                    CHECK(hop.kind == "binding_down"); CHECK(hop.from.ref == "s:0:0");
                    REQUIRE(hop.next.size() == 1);
                    CHECK(hop.next[0].slice.ref == "s:0." + std::to_string(pages) + ":0");
                    CHECK_FALSE(hop.fact.empty()); facts.insert(hop.fact); all.push_back(hop);
                    if (!reply->result.next.empty()) {
                        CHECK(reply->result.next != page.cursor);
                        CHECK(reply->completeness.status == "partial");
                    }
                    page.cursor = reply->result.next; REQUIRE(++pages <= 3);
                } while (!page.cursor.empty());
                CHECK(pages == 3); CHECK(facts.size() == 3);
                const auto actual = json(all);
                if (retained.empty()) retained = actual;
                CHECK(actual == retained);
            }
            design.value().reset();
        }
    CHECK_FALSE(retained.empty());
}

#ifdef HIER_TEST_OBSERVER
TEST_CASE("scope construction adds no body admission and cancelled pages publish no anchors", "[a-m7]") {
    struct Events {
        std::vector<model::InstKey> keys;
        std::stop_source *stop = nullptr;
        bool failed = false;
        static void event(void *context, const observation::Event &value) noexcept {
            auto &self = *static_cast<Events *>(context);
            if (value.kind != observation::Kind::StepBodyAdmitted) return;
            try { self.keys.emplace_back(value.occurrence.begin(), value.occurrence.end()); }
            catch (...) { self.failed = true; }
            if (self.stop && self.keys.size() == 2) self.stop->request_stop();
        }
    };
    model::OpenOptions options; options.files = {HIER_QUERY_REFERENCE_SCOPES_FIXTURE}; options.tops = {"query_scope_top"};
    auto frontend = frontend::openDesign(options); REQUIRE(frontend);
    db::DesignDb db(std::move(frontend.value()), 0);
    StepLimit limit; limit.maxHops = 8192;
    Events events;
    observation::Sink sink{&events, Events::event}; observation::Scope observe(sink);
    auto page = detail::step(db, "s:0:0", false, {}, limit, {}); REQUIRE(page);
    CHECK_FALSE(events.failed);
    CHECK(events.keys == std::vector<model::InstKey>{{0}, {0, 0}});
    std::stop_source stop; events.keys.clear(); events.stop = &stop;
    std::vector<std::optional<detail::StepAnchor>> anchors(1);
    auto cancelled = detail::step(db, "s:0:0", false, {}, limit, stop.get_token(), false, &anchors);
    REQUIRE_FALSE(cancelled); CHECK(cancelled.error().code == ErrorCode::Cancelled);
    CHECK(cancelled.error().message == "step cancelled"); CHECK(anchors.empty());
    CHECK(events.keys == std::vector<model::InstKey>{{0}, {0, 0}});
    events.stop = nullptr; events.keys.clear();
    REQUIRE(detail::step(db, "s:0:0", false, {}, limit, {}));
    CHECK(events.keys == std::vector<model::InstKey>{{0}, {0, 0}});
}
#endif
