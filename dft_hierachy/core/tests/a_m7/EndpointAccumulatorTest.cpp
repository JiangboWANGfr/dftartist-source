#include "EndpointAccumulator.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <limits>
#include <type_traits>

// Test-only original ca479f2 algorithm; production has only one implementation.
namespace hier::detail {
// Borrows the query-owned result vector until collection/coalescing completes.
// The caller must not otherwise change or move that vector during this lifetime.
class LinearEndpointAccumulator {
    using Endpoint = model::Endpoint;
  public:
    LinearEndpointAccumulator(std::vector<Endpoint> &values, Cancel cancel)
        : values_(values), cancel_(cancel) {}
    LinearEndpointAccumulator(const LinearEndpointAccumulator &) = delete;
    LinearEndpointAccumulator &operator=(const LinearEndpointAccumulator &) = delete;
    LinearEndpointAccumulator(LinearEndpointAccumulator &&) = delete;
    LinearEndpointAccumulator &operator=(LinearEndpointAccumulator &&) = delete;

    void append(Endpoint e, bool deduplicate) {
        if (deduplicate)
            for (const auto &old : values_) {
                checkpoint(cancel_);
                if (old.kind == e.kind && old.ref == e.ref && old.at == e.at &&
                    old.bits == e.bits && old.queried == e.queried)
                    return;
            }
        values_.push_back(std::move(e));
    }
    void coalesce() {
        checkpoint(cancel_);
        // Deduplicate/coalesce after the walk. Constants are sliced in query coordinates;
        // they never claim an endpoint bit space.
        std::vector<Endpoint> merged;
        for (auto &e : values_) {
            checkpoint(cancel_);
            bool done = false;
            for (auto &p : merged) {
                checkpoint(cancel_);
                if (p.kind != e.kind || p.ref != e.ref || p.inst != e.inst ||
                    p.reason != e.reason || p.queried.lsb + p.queried.width != e.queried.lsb ||
                    p.via.size() != e.via.size())
                    continue;
                bool sameRoute = true;
                for (size_t i = 0; i < p.via.size(); ++i) {
                    checkpoint(cancel_);
                    auto &a = p.via[i];
                    auto &b = e.via[i];
                    if (a.kind != b.kind || a.via != b.via || a.next.size() != b.next.size())
                        sameRoute = false;
                    else
                        for (size_t j = 0; j < a.next.size(); ++j)
                            if (a.next[j].slice.ref != b.next[j].slice.ref)
                                sameRoute = false;
                }
                if (!sameRoute)
                    continue;
                if (bool(p.bits) != bool(e.bits) || bool(p.at) != bool(e.at))
                    continue;
                if (p.bits && p.bits->lsb + p.bits->width != e.bits->lsb)
                    continue;
                if (p.at &&
                    (p.at->ref != e.at->ref || p.at->bits.lsb + p.at->bits.width != e.at->bits.lsb))
                    continue;
                if (p.kind == "const")
                    p.value = std::to_string(p.queried.width + e.queried.width) + "'b" +
                              e.value.substr(e.value.find('b') + 1) +
                              p.value.substr(p.value.find('b') + 1);
                p.queried.width += e.queried.width;
                if (p.bits)
                    p.bits->width += e.bits->width;
                if (p.at)
                    p.at->bits.width += e.at->bits.width;
                for (size_t i = 0; i < p.via.size(); ++i) {
                    checkpoint(cancel_);
                    p.via[i].from.bits.width += e.queried.width;
                    for (auto &m : p.via[i].map)
                        m.width += e.queried.width;
                    for (auto &n : p.via[i].next)
                        n.slice.bits.width += e.queried.width;
                }
                done = true;
                break;
            }
            if (!done)
                merged.push_back(std::move(e));
        }
        values_ = std::move(merged);
    }

  private:
    std::vector<Endpoint> &values_;
    Cancel cancel_;
};
} // namespace hier::detail


using hier::detail::EndpointAccumulator;
using hier::detail::LinearEndpointAccumulator;
using hier::model::Endpoint;
using Endpoints = std::vector<Endpoint>;
namespace {
template <class T> std::string json(const T &value) {
    hier::protocol::JsonWriter writer;
    hier::protocol::write(writer, value);
    return writer.str();
}
void check(const Endpoints &actual, const Endpoints &expected) {
    REQUIRE(json(actual) == json(expected));
    CHECK(actual.capacity() == expected.capacity());
}
Endpoint point(size_t route, uint64_t position) {
    Endpoint e;
    e.kind = "process";
    e.ref = "x:" + std::to_string(route);
    e.inst = "i:0";
    e.queried = {position, 1};
    e.bits = {position + 3, 1};
    e.at = hier::model::Slice{"s:0:0", *e.bits};
    hier::model::Hop hop;
    hop.kind = "boundary";
    hop.via = "p:0:0";
    hop.from = {"s:0:0", {position, 1}};
    hop.map.push_back({position, position + 3, 1});
    hop.next.push_back({{"s:0:1", {position + 3, 1}}, "data", "exact"});
    hop.fact = "first-route";
    e.via.push_back(std::move(hop));
    return e;
}
struct Random {
    uint64_t state = 436859;
    uint64_t next() {
        state = state * 6364136223846793005ULL + 1442695040888963407ULL;
        return state >> 32;
    }
    Endpoint endpoint() {
        auto e = point(next() % 12, next() % 15);
        e.queried.width = 1 + next() % 4;
        if (next() % 3 == 0) {
            e.kind = "const";
            e.bits.reset();
            e.at.reset();
            std::string digits;
            for (uint64_t i = 0; i < e.queried.width; ++i)
                digits += "01xz"[next() % 4];
            e.value = std::to_string(digits.size()) + "'b" + digits;
        }
        if (next() % 3 == 0)
            e.via.clear();
        if (next() % 4 == 0)
            e.reason = "unsupported";
        if (next() % 4 == 0)
            e.inst = "i:1";
        if (next() % 5 == 0)
            e.at.reset();
        if (next() % 5 == 0)
            e.bits.reset();
        return e;
    }
};
} // namespace

TEST_CASE("endpoint identity and first-match coalescing retain every original field", "[a-m7]") {
    Random random;
    for (size_t scenario = 0; scenario < 500; ++scenario) {
        CAPTURE(scenario);
        Endpoints actual, expected;
        EndpointAccumulator accumulator(actual, {});
        LinearEndpointAccumulator reference(expected, {});
        for (size_t i = 0; i < 180; ++i) {
            auto e = random.endpoint();
            if (!expected.empty() && i % 4 == 0) {
                e = expected[random.next() % expected.size()];
                e.inst += "-ignored-by-identity";
                e.reason += "-ignored-by-identity";
                for (auto &hop : e.via) {
                    hop.fact += "-ignored";
                    hop.reason += "-ignored";
                    hop.from.ref += "-ignored";
                    hop.next.front().role = "control";
                    hop.next.front().precision = "conservative";
                }
            }
            const bool deduplicate = i % 3 != 0;
            reference.append(e, deduplicate);
            accumulator.append(e, deduplicate);
            if (i % 23 == 0)
                check(actual, expected);
        }
        check(actual, expected);
        reference.coalesce();
        accumulator.coalesce();
        check(actual, expected);
        // Successful reuse rebuilds identities from the coalesced vector.
        auto suffix = random.endpoint();
        reference.append(suffix, true);
        accumulator.append(suffix, true);
        reference.coalesce();
        accumulator.coalesce();
        check(actual, expected);
    }
}

TEST_CASE("matching ending coordinates always select the first original route", "[a-m7]") {
    Endpoints actual, expected;
    EndpointAccumulator accumulator(actual, {});
    LinearEndpointAccumulator reference(expected, {});
    auto push = [&](Endpoint e) {
        accumulator.append(e, false);
        reference.append(e, false);
    };
    auto first = point(0, 0), second = first;
    first.via[0].fact = "first";
    second.via[0].fact = "second";
    push(first);
    push(second);
    for (size_t i = 1; i < 100; ++i)
        push(point(i, 0));
    push(point(0, 1));
    push(point(0, 1));
    push(point(0, 2));
    reference.coalesce();
    accumulator.coalesce();
    check(actual, expected);
    REQUIRE(actual.size() == 101);
    CHECK(actual[0].queried == hier::model::BitRange{0, 3});
    CHECK(actual[1].queried == hier::model::BitRange{0, 2});
    CHECK(actual[0].via[0].fact == "first");
    CHECK(actual[1].via[0].fact == "second");
}

TEST_CASE("large endpoint results preserve discovery order and vector ownership", "[a-m7]") {
    Endpoints actual, expected;
    EndpointAccumulator accumulator(actual, {});
    for (size_t i = 0; i < 32768; ++i) {
        auto e = point(i, 0);
        expected.push_back(e);
        accumulator.append(std::move(e), true);
    }
    for (auto e : expected) {
        e.inst = "ignored";
        e.via.clear();
        accumulator.append(std::move(e), true);
    }
    accumulator.coalesce();
    check(actual, expected);
    for (size_t i = 0; i < actual.size(); ++i)
        CHECK(actual[i].ref == "x:" + std::to_string(i));
    static_assert(!std::is_copy_constructible_v<EndpointAccumulator>);
    static_assert(!std::is_move_constructible_v<EndpointAccumulator>);
}

TEST_CASE("endpoint cancellation uses the stable query cancellation error", "[a-m7]") {
    std::stop_source stop;
    Endpoints actual;
    EndpointAccumulator accumulator(actual, stop.get_token());
    accumulator.append(point(0, 0), true);
    stop.request_stop();
    try {
        accumulator.coalesce();
        FAIL("expected query cancellation");
    } catch (const hier::Error &error) {
        CHECK(error.code == hier::ErrorCode::Cancelled);
        CHECK(error.message == "query cancelled");
    }
    CHECK(actual.size() == 1);
    CHECK_THROWS_AS(accumulator.append(point(1, 0), true), hier::Error);
}

TEST_CASE("public drivers and loads keep complete fanout endpoints across cache and sharing modes", "[a-m7]") {
    std::vector<std::string> baseline;
    for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{1024}, size_t{64 * 1024 * 1024}}) {
            hier::model::OpenOptions options;
            options.files = {std::string(HIER_ENDPOINT_FIXTURE)};
            options.tops = {"endpoint_top"};
            options.forcePerInstanceBodies = per;
            options.connectionCacheBytes = cache;
            auto opened = hier::Design::open(options);
            REQUIRE(opened);
            auto &design = **opened;
            REQUIRE(design.diagnostics().errorCount == 0);
            auto signals = design.signals("i:0");
            REQUIRE(signals);
            std::string input, output;
            for (const auto &s : signals->items) {
                if (s.name == "a") input = s.ref;
                if (s.name == "y") output = s.ref;
            }
            REQUIRE_FALSE(input.empty());
            REQUIRE_FALSE(output.empty());
            std::vector<std::string> replies;
            for (bool upstream : {false, true})
                for (const auto &reach : {"local", "hier"}) {
                    hier::ConnectionRequest request;
                    request.reach = reach;
                    const auto reply = upstream ? design.drivers(output, request)
                                                : design.loads(input, request);
                    REQUIRE(reply);
                    REQUIRE(reply->completeness.status == "complete");
                    REQUIRE(reply->result.size() == 64);
                    for (size_t i = 0; i < reply->result.size(); ++i) {
                        const auto &endpoint = reply->result[i];
                        CHECK(endpoint.queried == hier::model::BitRange{upstream ? i : 0, 1});
                        CHECK(endpoint.kind == (request.reach == "local" ? "module_pin" : "process"));
                        CHECK(endpoint.bits == hier::model::BitRange{0, 1});
                        CHECK(endpoint.via.size() == (request.reach == "local" ? 0 : 1));
                    }
                    replies.push_back(json(*reply));
                }
            if (baseline.empty())
                baseline = replies;
            CHECK(replies == baseline);
            std::stop_source stop;
            stop.request_stop();
            auto cancelled = design.loads(input, {}, stop.get_token());
            REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == hier::ErrorCode::Cancelled);
        }
}
