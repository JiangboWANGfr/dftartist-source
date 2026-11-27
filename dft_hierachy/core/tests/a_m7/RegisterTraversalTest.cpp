// A compatibility reference: original recursive query, not a B oracle.
#include "Registers.h"
#include "ConnectionRefs.h"
#include "OffsetPage.h"
#include <functional>

namespace original {
using namespace hier;
using namespace hier::detail;
Result<model::QueryResult<Page<model::RegisterInfo>>>
registers(const db::DesignDb &db, std::string_view ref, const PageRequest &page,
          bool recursive, Cancel cancel) try {
    checkpoint(cancel);
    auto key = model::parseInstRef(ref);
    if (!key)
        return Error{ErrorCode::BadRequest, "not an instance reference: " + std::string(ref)};
    auto located = db.locate(*key, cancel);
    if (!located)
        return located.error();
    const auto binding = "registers|" + std::string(ref) + (recursive ? "|recursive" : "");
    // Retain page errors until the original full traversal has finished: a later
    // extraction failure/cancellation still takes precedence over an invalid page.
    const auto window = OffsetPage::read(page, binding);
    size_t total = 0;
    std::vector<model::RegisterInfo> selected;
    model::Completeness completeness;
    std::function<void(const model::InstKey &, model::BodyId)> walk =
        [&](const model::InstKey &occurrence, model::BodyId body) {
        if (body == model::kNoBody)
            return;
        auto facts = checked(db.connections(body, cancel));
        for (const auto &source : facts->registers) {
            checkpoint(cancel);
            if (window && window->contains(total)) {
                auto reg = source;
                qualify(reg, occurrence, cancel);
                selected.push_back(std::move(reg));
            }
            ++total;
        }
        if (facts->completeness.status != "complete") {
            completeness.status = "partial";
            for (auto reason : facts->completeness.reasons) {
                checkpoint(cancel);
                reason.at = qualify(reason.at, occurrence);
                completeness.reasons.push_back(std::move(reason));
            }
        }
        if (recursive) {
            const auto &slots = checked(db.skeleton(body, cancel))->slots;
            for (size_t i = 0; i < slots.size(); ++i) {
                checkpoint(cancel);
                auto child = occurrence;
                child.push_back(uint32_t(i));
                walk(child, slots[i].body);
            }
        }
    };
    walk(*key, located->body);
    checkpoint(cancel);
    if (!window)
        return window.error();
    auto result = window->materialize<model::RegisterInfo>(total, binding,
        [&](size_t i) { return std::move(selected[i - window->offset]); }, cancel);
    if (!result)
        return result.error();
    return model::QueryResult<Page<model::RegisterInfo>>{std::move(*result),std::move(completeness)};
} catch (const Error &error) {
    return error;
}
} // namespace original

#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>

using namespace hier;
namespace {
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
struct State {
    std::vector<model::BodySkeleton> skeletons;
    std::vector<model::BodyConnections> facts;
    std::vector<model::BodyId> calls;
    std::optional<model::BodyId> fail;
    size_t stopAt = 0;
    std::stop_source *stop = nullptr; // Test-owned control at the existing Frontend boundary.
};
struct Frontend final : frontend::Frontend {
    std::shared_ptr<State> data;
    model::FrontendInfo identity;
    std::vector<model::TopInfo> roots{{"top", 0}};
    std::vector<model::DefInfo> defs{{"top", model::DefKind::Module, "", 0}};
    explicit Frontend(std::shared_ptr<State> state) : data(std::move(state)) {}
    const model::FrontendInfo &info() const override { return identity; }
    const std::vector<model::TopInfo> &tops() const override { return roots; }
    const std::vector<model::DefInfo> &definitions() const override { return defs; }
    size_t bodyCount() const override { return data->facts.size(); }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId body) const override { return data->skeletons.at(body); }
    model::BodyConnections connections(model::BodyId body) const override {
        data->calls.push_back(body);
        if (data->fail == body) throw Error{ErrorCode::Internal, "A late register extraction failure"};
        if (data->stop && data->stopAt == data->calls.size()) data->stop->request_stop();
        return data->facts.at(body);
    }
};
void child(State &state, size_t parent, model::BodyId body) {
    model::ChildSlot slot;
    slot.body = body;
    slot.kind = body == model::kNoBody ? model::InstKind::Blackbox : model::InstKind::Module;
    slot.name = "child";
    state.skeletons[parent].slots.push_back(std::move(slot));
}
State tree() {
    State state;
    state.skeletons.resize(5);
    state.facts.resize(5);
    for (auto body : {model::BodyId(1), model::kNoBody, model::BodyId(2), model::BodyId(1)}) child(state, 0, body);
    child(state, 1, 3); child(state, 1, 4); child(state, 2, 4);
    for (size_t body = 0; body < state.facts.size(); ++body) {
        auto &facts = state.facts[body];
        facts.estimatedBytes = 128;
        for (size_t i = 0; i < body % 4; ++i) {
            model::RegisterInfo reg;
            reg.ref = "r::" + std::to_string(i); reg.inst = "i:";
            reg.signal = "s::" + std::to_string(i); reg.process = "x::" + std::to_string(i);
            reg.bits = {i * 3, 2}; reg.clock = {"s::99", {1, 1}, "posedge", ""};
            reg.async = {{"s::98", {0, 1}, "negedge", "reset"}, {"s::97", {2, 1}, "posedge", "set"}};
            facts.registers.push_back(std::move(reg));
        }
        if (body % 2) facts.completeness = {"partial", {{"hier_ref", "x::0", "original"},
            {"hier_ref", "x::0", "duplicate"}, {"unsupported", "raw", std::string("a\0b", 3)}}};
    }
    state.facts[4].completeness.status = "partial"; // Empty reasons still changes status.
    return state;
}
using Reply = Result<model::QueryResult<Page<model::RegisterInfo>>>;
struct Run { Reply reply; std::vector<model::BodyId> calls; bool stopped; };
Run run(const State &input, size_t cache, std::string_view ref, const PageRequest &page, bool recursive, bool prior) {
    auto state = std::make_shared<State>(input);
    std::stop_source stop;
    state->stop = &stop;
    db::DesignDb database(std::make_unique<Frontend>(state), cache);
    auto value = prior ? original::registers(database, ref, page, recursive, stop.get_token())
                       : detail::registers(database, ref, page, recursive, stop.get_token());
    return {std::move(value), state->calls, stop.stop_requested()};
}
void same(const Run &a, const Run &b) {
    REQUIRE(bool(a.reply) == bool(b.reply));
    if (a.reply) CHECK(json(*a.reply) == json(*b.reply));
    else {
        CHECK(a.reply.error().code == b.reply.error().code);
        CHECK(a.reply.error().message == b.reply.error().message);
    }
    CHECK(a.calls == b.calls);
    CHECK(a.stopped == b.stopped);
}
}

TEST_CASE("register traversal preserves original DFS full fields pages reasons and extraction order", "[a-m7]") {
    const auto state = tree();
    for (size_t cache : {size_t(0), size_t(1), size_t(128), size_t(64 * 1024 * 1024)})
        for (const auto &ref : {"i:0", "i:00", "i:0.0", "i:0.1", "i:0.2", "i:99", "bad"})
            for (bool recursive : {false, true})
                for (int limit : {0, 1, 2, 7, 200}) {
                    same(run(state, cache, ref, {"", limit}, recursive, false),
                         run(state, cache, ref, {"", limit}, recursive, true));
                    same(run(state, cache, ref, {"broken", limit}, recursive, false),
                         run(state, cache, ref, {"broken", limit}, recursive, true));
                }
    for (size_t offset = 0; offset < 24; ++offset) {
        const auto cursor = "registers|i:0|recursive@" + std::to_string(offset);
        same(run(state, 0, "i:0", {cursor, 3}, true, false), run(state, 0, "i:0", {cursor, 3}, true, true));
    }
}

TEST_CASE("register traversal retains off-page failure cancellation priority and retry", "[a-m7]") {
    for (const PageRequest &page : std::array<PageRequest, 3>{{{"", 1}, {"", 0}, {"broken", 1}}}) {
        auto state = tree(); state.fail = 4;
        const auto failure = run(state, 0, "i:0", page, true, false);
        same(failure, run(state, 0, "i:0", page, true, true));
        REQUIRE_FALSE(failure.reply);
        CHECK(failure.reply.error().message == "A late register extraction failure");
        state.fail.reset(); state.stopAt = 5;
        const auto cancelled = run(state, 0, "i:0", page, true, false);
        same(cancelled, run(state, 0, "i:0", page, true, true));
        REQUIRE_FALSE(cancelled.reply);
        CHECK(cancelled.reply.error().code == ErrorCode::Cancelled);
    }
    auto state = std::make_shared<State>(tree());
    std::stop_source stop; state->stop = &stop; state->stopAt = 5;
    db::DesignDb database(std::make_unique<Frontend>(state), 0);
    const auto failed = detail::registers(database, "i:0", {"", 1}, true, stop.get_token());
    REQUIRE_FALSE(failed);
    state->stop = nullptr;
    const auto retry = detail::registers(database, "i:0", {"", 1}, true, {});
    REQUIRE(retry);
    CHECK(retry->completeness.status == "partial");
    CHECK(retry->completeness.reasons.size() == 12); // Two occurrences, each with two groups of three.
}

TEST_CASE("register traversal uses an explicit stack for deep metadata and owning output", "[a-m7]") {
    constexpr size_t depth = 32768;
    auto state = std::make_shared<State>();
    state->skeletons.resize(depth); state->facts.resize(depth);
    for (size_t i = 0; i + 1 < depth; ++i) child(*state, i, model::BodyId(i + 1));
    model::RegisterInfo reg; reg.ref = "r::0"; reg.inst = "i:"; reg.signal = "s::0";
    reg.process = "x::0"; reg.bits = {0, 1}; reg.clock = {"s::1", {0, 1}, "posedge", ""};
    state->facts.back().registers.push_back(reg);
    model::QueryResult<Page<model::RegisterInfo>> retained;
    {
        db::DesignDb database(std::make_unique<Frontend>(state), 0);
        auto result = detail::registers(database, "i:0", {"", 1}, true, {});
        REQUIRE(result);
        REQUIRE(result->result.items.size() == 1);
        CHECK(result->result.next.empty());
        CHECK(state->calls.size() == depth);
        retained = std::move(result.value());
    }
    model::InstKey key(depth, 0);
    CHECK(retained.result.items[0].inst == model::instRef(key));
    CHECK(retained.result.items[0].signal == "s:" + model::formatInstKey(key) + ":0");
    CHECK(retained.result.items[0].clock.signal == "s:" + model::formatInstKey(key) + ":1");
}
