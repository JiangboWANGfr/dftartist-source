#include "ProcedureAnalysisLookup.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <memory>
#include <random>
#include <stdexcept>

namespace {
using Lookup = hier::frontend::detail::ProcedureAnalysisLookup;
using Procedure = Lookup::Procedure;
using Symbol = Lookup::Symbol;
using Kind = slang::ast::SymbolKind;
// Metadata-only symbols through Slang's existing base constructor. No AST
// visitor or driver analysis is invoked on these fixtures.
struct TestSymbol final : Symbol {
    std::string text;
    TestSymbol(Kind kind, slang::SourceLocation location, std::string path)
        : Symbol(kind, {}, location), text(std::move(path)) { name = text; }
};
auto relative(const Symbol &symbol) { return std::string(symbol.name); }
const Procedure *linear(std::span<const Procedure> direct, std::span<const Procedure> canonical,
                        const Symbol &source) {
    const Procedure *result = nullptr;
    for (const auto &p : direct)
        if (p.analyzedSymbol == &source) result = &p;
    if (!result)
        for (const auto &p : canonical) {
            const auto &candidate = *p.analyzedSymbol;
            if (candidate.kind == source.kind && candidate.location == source.location &&
                relative(candidate) == relative(source)) result = &p;
        }
    return result;
}
slang::SourceLocation location(uint32_t buffer, uint64_t offset) {
    return {slang::BufferID(buffer, "fixture"), offset};
}
} // namespace

TEST_CASE("procedure matching retains direct precedence and last complete signature", "[a-m7]") {
    std::vector<std::unique_ptr<TestSymbol>> symbols, sources;
    for (size_t i = 0; i < 384; ++i) {
        auto kind = i % 3 ? Kind::ProceduralBlock : Kind::ContinuousAssign;
        auto at = location(uint32_t(1 + i % 3), i % 17);
        const auto path = "g[" + std::to_string(i % 23) + "].proc";
        symbols.push_back(std::make_unique<TestSymbol>(kind, at, path));
        sources.push_back(std::make_unique<TestSymbol>(kind, at, path));
    }
    for (size_t seed = 0; seed < 16; ++seed) {
        std::mt19937 random(unsigned(seed + 172));
        std::vector<size_t> order;
        for (size_t i = 0; i < symbols.size(); ++i) order.push_back(i);
        std::shuffle(order.begin(), order.end(), random);
        std::vector<Procedure> direct, canonical;
        for (const auto index : order) {
            canonical.emplace_back(*symbols[index], nullptr);
            if (index % 5 == 0) direct.emplace_back(*sources[index], nullptr);
        }
        // Identical symbol pointers and identical signatures each retain the
        // last procedure, rather than the first inserted map record.
        direct.emplace_back(*sources[0], nullptr);
        canonical.emplace_back(*symbols[0], nullptr);
        Lookup lookup(direct, canonical);
        for (size_t i = 0; i < sources.size(); ++i) {
            CHECK(lookup.find(*sources[i], relative) == linear(direct, canonical, *sources[i]));
            CHECK(lookup.find(*symbols[i], relative) == linear(direct, canonical, *symbols[i]));
        }
        for (auto it = sources.rbegin(); it != sources.rend(); ++it)
            CHECK(lookup.find(**it, relative) == linear(direct, canonical, **it));
    }
}

TEST_CASE("procedure signature includes kind source buffer offset and relative path", "[a-m7]") {
    TestSymbol original(Kind::ProceduralBlock, location(1, 8), "g[0].p");
    std::vector<Procedure> canonical;
    canonical.emplace_back(original, nullptr);
    Lookup lookup({}, canonical);
    for (const auto kind : {Kind::ProceduralBlock, Kind::ContinuousAssign})
        for (const auto buffer : {1u, 2u})
            for (const auto offset : {8u, 9u})
                for (const auto path : {"g[0].p", "g[1].p", "g[0].p "}) {
                    TestSymbol source(kind, location(buffer, offset), path);
                    CHECK(lookup.find(source, relative) == linear({}, canonical, source));
                }
    Lookup absent({}, {});
    CHECK(absent.find(original, [](const Symbol &) -> std::string {
        throw std::runtime_error("no fallback to evaluate");
    }) == nullptr);
}

TEST_CASE("analysis indexes are lazy and failed metadata construction is retryable", "[a-m7]") {
    std::vector<std::unique_ptr<TestSymbol>> symbols;
    std::vector<Procedure> canonical;
    for (size_t i = 0; i < 64; ++i) {
        symbols.push_back(std::make_unique<TestSymbol>(Kind::ProceduralBlock, location(1, i),
                                                      "p" + std::to_string(i)));
        canonical.emplace_back(*symbols.back(), nullptr);
    }
    Lookup exact(canonical, canonical);
    size_t calls = 0;
    auto counted = [&](const Symbol &source) { ++calls; return relative(source); };
    for (size_t i = 0; i < symbols.size(); ++i)
        CHECK(exact.find(*symbols[i], counted) == &canonical[i]);
    CHECK(calls == 0); // Direct identity never builds canonical metadata.
    TestSymbol alias(Kind::ProceduralBlock, location(1, 0), "p0");
    Lookup fallback({}, canonical);
    CHECK_THROWS_AS(fallback.find(alias, [&](const Symbol &source) {
        if (++calls == 4) throw std::runtime_error("metadata allocation surrogate");
        return relative(source);
    }), std::runtime_error);
    calls = 0;
    CHECK(fallback.find(alias, counted) == &canonical[0]);
    CHECK(calls == canonical.size() + 1);
    for (size_t i = 0; i < 100; ++i) CHECK(fallback.find(alias, counted) == &canonical[0]);
    CHECK(calls == canonical.size() + 101);
    // Only metadata was destroyed; procedures remain owned by their caller.
    CHECK(canonical[0].analyzedSymbol == symbols[0].get());
}
