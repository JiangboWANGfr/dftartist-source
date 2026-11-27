#include "ConnectionReferenceIndex.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <functional>
#include <random>

using namespace hier;
using detail::ReferenceRow;
using Id = std::array<size_t, 3>;
namespace {
Id id(const ReferenceRow &row) { return {row.outer, row.inner, row.dependency}; }
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
template <class F> bool each(const std::vector<ReferenceRow> &rows, F emit) {
    for (const auto &row : rows)
        if (!emit(row))
            return false;
    return true;
}
} // namespace

TEST_CASE("reference tables retain original row order duplicates early return and reentry", "[a-m7]") {
    std::mt19937 random(127);
    const std::vector<std::string> keys{"A", "B", "C", "", std::string("A\0B", 3)};
    for (const size_t count : {size_t{0}, size_t{1}, size_t{8}, size_t{9}, size_t{64}, size_t{257}}) {
        std::vector<ReferenceRow> rows;
        for (size_t i = 0; i < count; ++i)
            rows.push_back({keys[random() % keys.size()], i, i % 4, i % 3});
        detail::ReferenceTable table;
        for (size_t pass = 0; pass < 3; ++pass)
            for (const auto &key : keys) {
                std::vector<Id> expected, actual;
                for (const auto &row : rows)
                    if (row.ref == key)
                        expected.push_back(id(row));
                REQUIRE(table.visit(key, [&](auto emit) { return each(rows, emit); }, [&](const auto &row) {
                    actual.push_back(id(row));
                    return true;
                }, {}));
                CHECK(actual == expected);
                actual.clear();
                const bool complete = table.visit(key, [&](auto emit) { return each(rows, emit); }, [&](const auto &row) {
                    actual.push_back(id(row));
                    return actual.size() < 2;
                }, {});
                CHECK(complete == (expected.size() < 2));
                expected.resize(std::min(size_t{2}, expected.size()));
                CHECK(actual == expected);
            }
        detail::ReferenceTable reentrant;
        std::vector<Id> outer, expected;
        for (const auto &row : rows)
            if (row.ref == "A")
                expected.push_back(id(row));
        REQUIRE(reentrant.visit("A", [&](auto emit) { return each(rows, emit); }, [&](const auto &row) {
            const auto before = id(row);
            std::vector<Id> inner, wanted;
            for (const auto &candidate : rows)
                if (candidate.ref == "B")
                    wanted.push_back(id(candidate));
            REQUIRE(reentrant.visit("B", [&](auto emit) { return each(rows, emit); }, [&](const auto &candidate) {
                inner.push_back(id(candidate));
                return true;
            }, {}));
            CHECK(inner == wanted);
            CHECK(id(row) == before);
            outer.push_back(id(row));
            return true;
        }, {}));
        CHECK(outer == expected);
    }
}

TEST_CASE("reference table cancellation never publishes partial sorting results", "[a-m7]") {
    const std::vector<std::string> keys{"A", "B"};
    std::vector<ReferenceRow> rows;
    for (size_t i = 0; i < 128; ++i)
        rows.push_back({keys[i % 2], i});
    detail::ReferenceTable table;
    auto emitAll = [&](auto emit) { return each(rows, emit); };
    REQUIRE(table.visit("A", emitAll, [](auto) { return true; }, {}));
    std::stop_source stop;
    size_t count = 0;
    auto interrupted = [&](auto emit) {
        return each(rows, [&](const auto &row) {
            if (++count == 17)
                stop.request_stop();
            return emit(row);
        });
    };
    try {
        table.visit("B", interrupted, [](auto) { return true; }, stop.get_token());
        FAIL("expected cancellation during construction");
    } catch (const Error &error) {
        CHECK(error.code == ErrorCode::Cancelled);
    }
    std::vector<Id> actual, expected;
    for (const auto &row : rows)
        if (row.ref == "B")
            expected.push_back(id(row));
    REQUIRE(table.visit("B", emitAll, [&](const auto &row) { actual.push_back(id(row)); return true; }, {}));
    CHECK(actual == expected);
    CHECK_THROWS_AS(table.visit("B", emitAll, [](auto) { return true; }, stop.get_token()), Error);
}

TEST_CASE("fact reference lookup equals literal original qualification for every relation", "[a-m7]") {
    const std::vector<std::string> refs{"s::0", "s:1:02", "p:2:0", "s::000", "p::4", "x::9", "r::0",
                                       "", "i:", "i:3", "junk", "p:foo", "aa::3", "s::::", ":", "p:0:01", "p:00:1", "p:1.02:003", "p:.2:0", "s::18446744073709551616", std::string("s::\0", 4)};
    model::BodyConnections facts;
    std::array<std::vector<ReferenceRow>, size_t(detail::FactReference::Count)> original;
    auto record = [&](auto kind, const std::string &ref, size_t a, size_t b = 0, size_t c = 0) {
        original[size_t(kind)].push_back({ref, a, b, c});
    };
    // Expected rows borrow the separate stable refs array, not the production
    // enumerator. Literal qualify is the unchanged pre-index comparison oracle.
    for (size_t i = 0; i < 64; ++i) {
        model::SignalInfo signal;
        signal.ref = refs[i % refs.size()];
        facts.signals.push_back(signal);
        record(detail::FactReference::Signal, refs[i % refs.size()], i);
        model::QueryResult<model::ProcessInfo> process;
        for (size_t w = 0; w < 2; ++w) {
            model::Write write;
            write.target.ref = refs[(i + w) % refs.size()];
            record(detail::FactReference::Write, refs[(i + w) % refs.size()], i, w);
            for (size_t d = 0; d < 3; ++d) {
                model::Dep dep;
                dep.signal = refs[(i + w + d) % refs.size()];
                write.deps.push_back(dep);
                record(detail::FactReference::Read, refs[(i + w + d) % refs.size()], i, w, d);
            }
            process.result.writes.push_back(write);
        }
        facts.processes.push_back(process);
        model::PinBinding binding;
        binding.pin = refs[i % refs.size()];
        record(detail::FactReference::Pin, refs[i % refs.size()], i);
        for (size_t s = 0; s < 3; ++s) {
            model::BindSegment segment;
            segment.target.signal = refs[(i + s) % refs.size()];
            binding.segments.push_back(segment);
            binding.possibleWrites.push_back({refs[(i + s) % refs.size()], {s, 1}});
            record(detail::FactReference::Segment, refs[(i + s) % refs.size()], i, s);
            record(detail::FactReference::PossibleWrite, refs[(i + s) % refs.size()], i, s);
        }
        facts.bindings.push_back(binding);
    }
    detail::FactReferenceIndex index(facts);
    for (const model::InstKey &key : std::vector<model::InstKey>{{0}, {0, 2}, {1, 10, 2}}) {
        std::vector<std::string> targets = refs;
        for (const auto &ref : refs)
            targets.push_back(detail::qualify(ref, key));
        for (const auto *ref : {"p:00:0", "s:0:000", "s:0.20:0", "s:99:1", "p:1.100:2"})
            targets.emplace_back(ref);
        for (size_t pass = 0; pass < 2; ++pass) {
            std::reverse(targets.begin(), targets.end());
            for (size_t k = 0; k < original.size(); ++k)
                for (const auto &target : targets) {
                    std::vector<Id> expected, actual;
                    for (const auto &row : original[k])
                        if (detail::qualify(std::string(row.ref), key) == target)
                            expected.push_back(id(row));
                    REQUIRE(index.visit(detail::FactReference(k), key, target, [&](const auto &row) {
                        CHECK(detail::qualify(std::string(row.ref), key) == target);
                        actual.push_back(id(row));
                        return true;
                    }, {}));
                    CHECK(actual == expected);
                }
        }
    }
}

TEST_CASE("port reference lookup retains direct mapped unresolved and duplicate rows", "[a-m7]") {
    std::vector<model::PortInfo> ports(64);
    std::vector<ReferenceRow> expected;
    const std::vector<std::string> refs{"s:0:1", "s:0:2", "", "literal"};
    for (size_t i = 0; i < ports.size(); ++i) {
        auto &internal = ports[i].internal;
        internal.kind = i % 3 == 0 ? "unresolved" : i % 3 == 1 ? "direct" : "mapped";
        if (internal.kind == "direct") {
            internal.signal = refs[i % refs.size()];
            expected.push_back({refs[i % refs.size()], i});
        } else if (internal.kind == "mapped")
            for (size_t j = 0; j < 3; ++j) {
                model::BindSegment segment;
                segment.target.signal = refs[(i + j) % refs.size()];
                internal.segments.push_back(segment);
                expected.push_back({refs[(i + j) % refs.size()], i, j});
            }
    }
    detail::PortReferenceIndex index(ports);
    for (size_t pass = 0; pass < 3; ++pass)
        for (const auto &ref : refs) {
            std::vector<Id> actual, wanted;
            for (const auto &row : expected)
                if (row.ref == ref)
                    wanted.push_back(id(row));
            REQUIRE(index.visit(ref, [&](const auto &row) { actual.push_back(id(row)); return true; }, {}));
            CHECK(actual == wanted);
        }
}

TEST_CASE("public hierarchical endpoint walks retain bridge routes cache identity and ownership", "[a-m7]") {
    std::string baseline, retained;
    model::QueryResult<std::vector<model::Endpoint>> result;
    for (bool per : {false, true})
        for (const size_t cache : {size_t{0}, size_t{1}, size_t{128}, size_t{64 * 1024 * 1024}}) {
            model::OpenOptions options;
            options.files = {HIER_CONNECTION_REFERENCES_FIXTURE};
            options.tops = {"reference_top"};
            options.forcePerInstanceBodies = per;
            options.connectionCacheBytes = cache;
            auto design = Design::open(options);
            REQUIRE(design);
            REQUIRE((*design)->diagnostics().errorCount == 0);
            ConnectionRequest request;
            request.reach = "hier";
            auto reply = (*design)->loads("s:0:0", request);
            REQUIRE(reply);
            REQUIRE(reply->result.size() == 16);
            CHECK(reply->completeness.status == "partial");
            REQUIRE(reply->completeness.reasons.size() == 16);
            for (size_t i = 0; i < reply->result.size(); ++i) {
                const auto bridge = "0." + std::to_string(2 * i), observer = "0." + std::to_string(2 * i + 1);
                const auto &endpoint = reply->result[i];
                CHECK(endpoint.kind == "blackbox_pin");
                CHECK(endpoint.ref == "p:" + observer + ":0");
                CHECK(endpoint.inst == "i:" + observer);
                CHECK(endpoint.bits == model::BitRange{0, 1});
                CHECK(endpoint.queried == model::BitRange{0, 1});
                CHECK(endpoint.reason == "blackbox");
                REQUIRE(endpoint.via.size() == 2);
                CHECK(endpoint.via[0].via == "p:" + bridge + ":0");
                CHECK(endpoint.via[0].from.ref == "s:0:0");
                CHECK(endpoint.via[1].via == "p:" + bridge + ":1");
                CHECK(endpoint.via[1].from.ref == "s:" + bridge + ":0");
                CHECK(reply->completeness.reasons[i].at == endpoint.ref);
            }
            const auto text = json(*reply);
            if (baseline.empty())
                baseline = text;
            CHECK(text == baseline);
            std::stop_source stop;
            stop.request_stop();
            auto cancelled = (*design)->loads("s:0:0", request, stop.get_token());
            REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == ErrorCode::Cancelled);
            auto retry = (*design)->loads("s:0:0", request);
            REQUIRE(retry);
            CHECK(json(*retry) == baseline);
            result = *reply;
            retained = text;
        }
    CHECK(json(result) == retained);
}
