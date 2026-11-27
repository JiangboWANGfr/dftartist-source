// V3 / V8: how long do the steps the kernel depends on take, and what is the longest
// stretch that cannot be interrupted?
#include <algorithm>
#include <cstdio>
#include <unordered_map>
#include <unordered_set>

#include <slang/ast/symbols/BlockSymbols.h>

#include <slang/ast/ASTVisitor.h>

#include <slang/ast/symbols/CompilationUnitSymbols.h>

#include "Common.h"

using namespace slang;
using namespace slang::ast;

namespace hexp {

namespace {
struct ExprCounter
    : ASTVisitor<ExprCounter, VisitFlags::Statements | VisitFlags::Expressions> {
    size_t nodes = 0;
    template<std::derived_from<Expression> T>
    void handle(const T& e) {
        nodes++;
        visitDefault(e);
    }
    void handle(const InstanceSymbol&) {}  // child bodies are costed as their own instances
};
}  // namespace

int cmdScale(Loaded& l) {
    std::printf("parse + create compilation  %8.3f s\n", l.parseSeconds);

    auto t = std::chrono::steady_clock::now();
    auto& root = l.comp->getRoot();
    std::printf("getRoot (tops only)         %8.3f s   tops=%zu\n", seconds(t),
                root.topInstances.size());

    // Skeleton walk: what building the instance tree for the whole design costs.
    // The largest single step is one instance's member enumeration, which is where
    // slang lazily elaborates that body; it is the uninterruptible unit.
    t = std::chrono::steady_clock::now();
    size_t instances = 0;
    std::unordered_set<const DefinitionSymbol*> defs;
    forEachInstance(*l.comp, [&](const InstanceSymbol& inst) {
        instances++;
        defs.insert(&inst.getDefinition());
    });
    std::printf("skeleton walk               %8.3f s   instances=%zu defs=%zu rss=%ld MB\n",
                seconds(t), instances, defs.size(), peakRssMb());

    // Per-body deep visit (statements + expressions), own bodies only: an upper bound
    // on connection-level extraction per body. Report the slowest bodies.
    struct Cost {
        double s;
        std::string path;
    };
    std::vector<Cost> costs;
    t = std::chrono::steady_clock::now();
    forEachInstance(*l.comp, [&](const InstanceSymbol& inst) {
        auto b = std::chrono::steady_clock::now();
        ExprCounter counter;
        for (auto& m : inst.body.members()) {
            if (m.kind != SymbolKind::Instance && m.kind != SymbolKind::InstanceArray)
                m.visit(counter);
        }
        costs.push_back({seconds(b), inst.getHierarchicalPath()});
    });
    double deep = seconds(t);
    std::sort(costs.begin(), costs.end(), [](auto& a, auto& b) { return a.s > b.s; });
    std::printf("deep visit of every body    %8.3f s   rss=%ld MB\n", deep, peakRssMb());
    for (size_t i = 0; i < std::min<size_t>(3, costs.size()); i++)
        std::printf("  slowest body #%zu          %8.3f s   %s\n", i + 1, costs[i].s,
                    costs[i].path.c_str());

    t = std::chrono::steady_clock::now();
    auto& diags = l.comp->getAllDiagnostics();
    std::printf("getAllDiagnostics           %8.3f s   diags=%zu rss=%ld MB (single uninterruptible call)\n",
                seconds(t), diags.size(), peakRssMb());
    return 0;
}


// Folded walk: elaborate once, then visit each DISTINCT body once and get instance
// counts by multiplication. This is what the kernel's skeleton index would do.
namespace {
struct Folded {
    std::unordered_map<const InstanceBodySymbol*, size_t> memo;  // body -> instances below
    size_t bodies = 0;

    size_t below(const Scope& scope) {
        size_t n = 0;
        for (auto& m : scope.members()) {
            switch (m.kind) {
                case SymbolKind::Instance: {
                    auto& inst = m.as<InstanceSymbol>();
                    auto canon = inst.getCanonicalBody();
                    n += 1 + body(canon ? *canon : inst.body);
                    break;
                }
                case SymbolKind::InstanceArray:
                    n += below(m.as<InstanceArraySymbol>());
                    break;
                case SymbolKind::GenerateBlock:
                    if (!m.as<GenerateBlockSymbol>().isUninstantiated)
                        n += below(m.as<GenerateBlockSymbol>());
                    break;
                case SymbolKind::GenerateBlockArray:
                    n += below(m.as<GenerateBlockArraySymbol>());
                    break;
                default:
                    break;
            }
        }
        return n;
    }
    size_t body(const InstanceBodySymbol& b) {
        if (auto it = memo.find(&b); it != memo.end())
            return it->second;
        bodies++;
        size_t n = below(b);
        memo[&b] = n;
        return n;
    }
};
}  // namespace

int cmdScaleFolded(Loaded& l) {
    std::printf("parse + create compilation  %8.3f s\n", l.parseSeconds);
    auto t = std::chrono::steady_clock::now();
    auto& diags = l.comp->getAllDiagnostics();
    std::printf("getAllDiagnostics (cold)    %8.3f s   diags=%zu rss=%ld MB (single uninterruptible call)\n",
                seconds(t), diags.size(), peakRssMb());
    t = std::chrono::steady_clock::now();
    Folded f;
    size_t instances = 0;
    for (auto top : l.comp->getRoot().topInstances)
        instances += 1 + f.body(top->body);
    std::printf("folded skeleton walk        %8.3f s   instances=%zu distinct bodies visited=%zu rss=%ld MB\n",
                seconds(t), instances, f.bodies, peakRssMb());
    return 0;
}

}  // namespace hexp
