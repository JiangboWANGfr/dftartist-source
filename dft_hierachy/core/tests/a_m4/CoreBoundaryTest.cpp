#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include "WireSchema.h"
#include "SchemaPrimitives.h"
#include "Observe.h"
#include <catch2/catch_test_macros.hpp>
#include <limits>

using namespace hier;
using namespace hier::protocol::session;
namespace {
std::unique_ptr<Design> open() {
    model::OpenOptions options;
    options.files = {std::string(HIER_FIXTURES) + "/nav/nav.sv"};
    options.tops = {"top_b"};
    auto result = Design::open(options);
    REQUIRE(result);
    return std::move(result.value());
}
template <class T> void cancelled(const Result<T> &result) {
    REQUIRE_FALSE(result);
    CHECK(result.error().code == ErrorCode::Cancelled);
}
} // namespace
TEST_CASE("A strict decoder rejects malformed Unicode escapes numbers and controls", "[a-m4]") {
    for (const std::string &text : std::vector<std::string>{
             R"({"x":01})", R"({"x":1.})", R"({"x":1e})", R"({"x":+1})", R"({"x":"\uD800"})",
             R"({"x":"\uDC00"})", R"({"x":"\uD800\u0041"})", R"({"x":"\v"})", R"({"x":false,})",
             R"({"x":[1,]})", std::string("{\"x\":\"\t\"}")})
        CHECK(std::holds_alternative<DecodeFault>(decodeFrame(text)));
    for (const std::string &invalid :
         std::vector<std::string>{std::string("\xc0\xaf"), std::string("\xed\xa0\x80"),
                                  std::string("\xf4\x90\x80\x80"), std::string("\xe4\xb8")})
        CHECK(std::get<DecodeFault>(decodeFrame("{\"x\":\"" + invalid + "\"}")).code ==
              DecodeFaultCode::invalid_utf8);
    CHECK(std::holds_alternative<JsonValue::Object>(decodeFrame(R"({"x":"\uD835\uDC9F\u0000"})")));
}
TEST_CASE("A wire integer checks use decimal value without rounding", "[a-m4]") {
    for (const auto *token : {"1", "1.00", "1e0", "100e-2", "9007199254740991.0"})
        REQUIRE(schema::integer(JsonValue{JsonNumber{token}}));
    for (const auto *token : {"9007199254740991.1", "9007199254740992", "1e-99999", "1e99999"})
        CHECK_FALSE(schema::integer(JsonValue{JsonNumber{token}}));
    CHECK(schema::integer(JsonValue{JsonNumber{"-0e999999"}}) == 0);
    CHECK_FALSE(schema::integer(JsonValue{true}));
    protocol::JsonWriter cli;
    CHECK_NOTHROW(cli.value(std::numeric_limits<uint64_t>::max()));
    protocol::JsonWriter wire(true);
    CHECK_THROWS_AS(wire.value(std::numeric_limits<uint64_t>::max()), std::range_error);
}
TEST_CASE("A generated patterns preserve exact strings and accept long four-state values",
          "[a-m4]") {
    CHECK(validateDefinition("Hash", JsonValue{std::string(64, 'a')}));
    for (const auto &text : {std::string(63, 'a'), std::string(65, 'a'), std::string(64, 'A')})
        CHECK_FALSE(validateDefinition("Hash", JsonValue{text}));
    CHECK(validateDefinition("UtcTimestamp", JsonValue{std::string("2024-02-29T00:00:00.000Z")}));
    CHECK_FALSE(
        validateDefinition("UtcTimestamp", JsonValue{std::string("2023-02-29T00:00:00.000Z")}));
    CHECK(validateDefinition("FourStateValue", JsonValue{std::string("1'b1")}));
    CHECK(validateDefinition("FourStateValue", JsonValue{std::string("4'b01xz")}));
    CHECK(validateDefinition("FourStateValue",
                             JsonValue{std::string("100000'b") + std::string(100000, 'x')}));
    for (const auto *text : {"0'b0", "01'b1", "1'b", "1'b2", "1'B1", "1'bX", " 1'b1"})
        CHECK_FALSE(validateDefinition("FourStateValue", JsonValue{std::string(text)}));
    for (const auto &suffix : {std::string("\n"), std::string("\r\n"), std::string(1, '\0'),
                               std::string("\xe2\x80\xa8")}) {
        CHECK_FALSE(validateDefinition("Hash", JsonValue{std::string(64, 'a') + suffix}));
        CHECK_FALSE(validateDefinition(
            "UtcTimestamp", JsonValue{std::string("2024-02-29T00:00:00.000Z") + suffix}));
        CHECK_FALSE(validateDefinition("FourStateValue", JsonValue{std::string("1'b1") + suffix}));
    }
}
TEST_CASE(
    "A old Core entry points agree with explicit uncancelled overloads and filters bind cursors",
    "[a-m4]") {
    auto d = open();
    CHECK(d->roots().size() == d->roots({})->size());
    CHECK(d->snapshot().snapshotId == d->snapshot({})->snapshotId);
    const auto inst = d->roots().front().ref;
    const auto all = d->signals(inst);
    REQUIRE(all);
    const auto same = d->signals(inst, {}, "", {});
    REQUIRE(same);
    CHECK(same->items.size() == all->items.size());
    const auto filtered = d->signals(inst, {"", 1}, "q", {});
    REQUIRE(filtered);
    REQUIRE(filtered->items.size() == 1);
    CHECK(filtered->items.front().name.find("q") != std::string::npos);
    // A fixture with multiple matches tests a real cursor, not only filter output.
    auto page = d->signals(inst, {"", 1}, "", {});
    REQUIRE(page);
    REQUIRE_FALSE(page->next.empty());
    const auto wrong = d->signals(inst, {page->next, 2}, "q", {});
    REQUIRE_FALSE(wrong);
    CHECK(wrong.error().code == ErrorCode::BadRequest);
}
TEST_CASE("A legacy long-query cancellation overloads reject pre-cancel without fabricated partial",
          "[a-m4]") {
    auto d = open();
    const auto inst = d->roots().front().ref;
    std::stop_source stop;
    stop.request_stop();
    const auto c = stop.get_token();
    cancelled(d->snapshot(c));
    cancelled(d->diagnostics(0, c));
    cancelled(d->roots(c));
    cancelled(d->instance(inst, c));
    cancelled(d->children(inst, {}, c));
    cancelled(d->ancestors(inst, c));
    cancelled(d->definitions({}, c));
    cancelled(d->ports(inst, c));
    cancelled(d->params(inst, c));
    cancelled(d->signals(inst, {}, "", c));
    cancelled(d->bindings(inst, c));
    cancelled(d->procs(inst, {}, c));
    cancelled(d->proc("x:0:0", c));
    cancelled(d->object(inst, c));
    cancelled(d->registers(inst, {}, true, c));
    cancelled(d->source(inst, model::SourceKind::Definition, c));
    cancelled(d->drivers("s:0:0", {}, c));
    cancelled(d->loads("s:0:0", {}, c));
    CHECK(d->roots().size() == 1);
}
#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
TEST_CASE("A old queries propagate cancellation during actual Core cache publication and retry",
          "[a-m4]") {
    for (int method = 0; method < 5; ++method) {
        auto d = open();
        std::stop_source stop;
        size_t reached = 0;
        struct Context {
            std::stop_source &stop;
            size_t &reached;
        } context{stop, reached};
        observation::Sink sink{&context,
                               [](void *raw, const observation::Event &event) noexcept {
                                   auto &ctx = *static_cast<Context *>(raw);
                                   if (event.kind == observation::Kind::CachePublish) {
                                       ++ctx.reached;
                                       ctx.stop.request_stop();
                                   }
                               },
                               nullptr};
        {
            observation::Scope scope(sink);
            const auto token = stop.get_token();
            if (method == 0)
                cancelled(d->bindings("i:0", token));
            if (method == 1)
                cancelled(d->signals("i:0", {}, "", token));
            if (method == 2)
                cancelled(d->procs("i:0", {}, token));
            if (method == 3)
                cancelled(d->registers("i:0", {}, true, token));
            if (method == 4)
                cancelled(d->drivers("s:0:0", {}, token));
        }
        CHECK(reached == 1);
        REQUIRE(d->bindings("i:0"));
        REQUIRE(d->signals("i:0"));
    }
}
#endif
