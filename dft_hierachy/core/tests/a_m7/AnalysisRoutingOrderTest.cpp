#include "hier/frontend/Frontend.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <numeric>
#include <random>
#include <tuple>

namespace {
using namespace hier;
template <class T> auto json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
// Use the existing serializers for public facts; private source/check metadata
// stays typed. This fingerprint checks order invariance, not semantic truth.
auto fingerprint(const model::BodyConnections &facts) {
    std::vector<std::tuple<std::string,model::SourceKind,size_t,uint64_t,uint64_t>> sources;
    for (const auto &s : facts.sources)
        sources.emplace_back(s.ref,s.kind,s.range.file,s.range.start,s.range.end);
    return std::tuple{json(facts.signals),json(facts.internals),json(facts.bindings),
        json(facts.processes),json(facts.registers),json(facts.completeness),sources,
        std::tuple{facts.check.slangCompared,facts.check.selfChecked,facts.check.skippedExternal,
                   facts.check.mismatched,facts.check.issues},facts.estimatedBytes};
}
auto open(bool per) {
    model::OpenOptions options;
    options.files = {HIER_ANALYSIS_ROUTING_FIXTURE};
    options.tops = {"route_top"};
    options.forcePerInstanceBodies = per;
    auto result = frontend::openDesign(options);
    REQUIRE(result);
    REQUIRE(result.value()->diagnostics(0).errorCount == 0);
    return std::move(result.value());
}
} // namespace

TEST_CASE("analysis routing is independent of fresh extraction order and prior parent pairs", "[a-m7]") {
    using Fingerprint = decltype(fingerprint(model::BodyConnections{}));
    for (const bool per : {false,true}) {
        std::vector<Fingerprint> baseline;
        {
            auto frontend = open(per);
            REQUIRE(frontend->bodyCount() > 2);
            for (model::BodyId i = 0; i < frontend->bodyCount(); ++i)
                baseline.push_back(fingerprint(frontend->connections(i)));
        }
        for (size_t pass = 0; pass < 4; ++pass) {
            auto frontend = open(per);
            REQUIRE(frontend->bodyCount() == baseline.size());
            std::vector<model::BodyId> order(baseline.size());
            std::iota(order.begin(),order.end(),0);
            if (pass == 1) std::reverse(order.begin(),order.end());
            if (pass >= 2) {
                std::mt19937 random(unsigned(172 + pass));
                std::shuffle(order.begin(),order.end(),random);
            }
            for (const auto id : order)
                CHECK(fingerprint(frontend->connections(id)) == baseline[id]);
            // Repeat without a fresh frontend after all memo/cache entries exist.
            for (auto it = order.rbegin(); it != order.rend(); ++it)
                CHECK(fingerprint(frontend->connections(*it)) == baseline[*it]);
        }
    }
}
