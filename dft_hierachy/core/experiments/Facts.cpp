// V2 / V4 / V6: what slang's own analysis gives us per body (which bits each process
// writes and reads), how unpacked types are numbered, and how drivers that reach
// across module boundaries show up.
//
// Also `clockstat`: how selection logic on clock/reset paths is written.
#include <cstdio>
#include <map>
#include <set>
#include <unordered_map>

#include <slang/analysis/AnalysisManager.h>
#include <slang/analysis/AnalyzedProcedure.h>
#include <slang/analysis/ValueDriver.h>
#include <slang/ast/ASTVisitor.h>
#include <slang/ast/TimingControl.h>
#include <slang/ast/expressions/MiscExpressions.h>
#include <slang/ast/expressions/OperatorExpressions.h>
#include <slang/ast/statements/ConditionalStatements.h>
#include <slang/ast/statements/MiscStatements.h>
#include <slang/ast/symbols/BlockSymbols.h>
#include <slang/ast/symbols/CompilationUnitSymbols.h>
#include <slang/ast/symbols/MemberSymbols.h>
#include <slang/ast/symbols/PortSymbols.h>
#include <slang/ast/symbols/VariableSymbols.h>
#include <slang/ast/types/Type.h>
#include <slang/text/SourceManager.h>

#include "Common.h"

using namespace slang;
using namespace slang::ast;
using namespace slang::analysis;

namespace hexp {

namespace {

unsigned long long ull(uint64_t v) {
    return static_cast<unsigned long long>(v);
}

std::string where(const SourceManager& sm, SourceLocation loc) {
    if (!loc)
        return "?";
    std::string f(sm.getFileName(loc));
    if (auto p = f.find_last_of('/'); p != std::string::npos)
        f = f.substr(p + 1);
    return f + ":" + std::to_string(sm.getLineNumber(loc));
}

const char* sourceName(DriverSource s) {
    switch (s) {
        case DriverSource::Initial: return "initial";
        case DriverSource::Final: return "final";
        case DriverSource::Always: return "always";
        case DriverSource::AlwaysComb: return "always_comb";
        case DriverSource::AlwaysLatch: return "always_latch";
        case DriverSource::AlwaysFF: return "always_ff";
        case DriverSource::Subroutine: return "subroutine";
        default: return "other";
    }
}

std::string flagNames(bitmask<DriverFlags> f) {
    std::string s;
    auto add = [&](DriverFlags b, const char* n) {
        if (f.has(b)) {
            s += s.empty() ? "" : "|";
            s += n;
        }
    };
    add(DriverFlags::InputPort, "InputPort");
    add(DriverFlags::OutputPort, "OutputPort");
    add(DriverFlags::Initializer, "Initializer");
    add(DriverFlags::FromSideEffect, "FromSideEffect");
    add(DriverFlags::ViaIndirectPort, "ViaIndirectPort");
    return s.empty() ? "-" : s;
}

// Every net/variable declared in a body, including inside generate blocks.
void collectValues(const Scope& scope, std::vector<const ValueSymbol*>& out) {
    for (auto& m : scope.members()) {
        if (m.kind == SymbolKind::Net || m.kind == SymbolKind::Variable)
            out.push_back(&m.as<ValueSymbol>());
        else if (m.kind == SymbolKind::GenerateBlock) {
            if (!m.as<GenerateBlockSymbol>().isUninstantiated)
                collectValues(m.as<GenerateBlockSymbol>(), out);
        }
        else if (m.kind == SymbolKind::GenerateBlockArray)
            collectValues(m.as<GenerateBlockArraySymbol>(), out);
    }
}

void collectInstances(const Scope& scope, std::vector<const InstanceSymbol*>& out) {
    for (auto& m : scope.members()) {
        if (m.kind == SymbolKind::Instance)
            out.push_back(&m.as<InstanceSymbol>());
        else if (m.kind == SymbolKind::InstanceArray)
            collectInstances(m.as<InstanceArraySymbol>(), out);
        else if (m.kind == SymbolKind::GenerateBlock) {
            if (!m.as<GenerateBlockSymbol>().isUninstantiated)
                collectInstances(m.as<GenerateBlockSymbol>(), out);
        }
        else if (m.kind == SymbolKind::GenerateBlockArray)
            collectInstances(m.as<GenerateBlockArraySymbol>(), out);
    }
}

const InstanceBodySymbol& bodyOf(const InstanceSymbol& inst) {
    auto c = inst.getCanonicalBody();
    return c ? *c : inst.body;
}

}  // namespace

// Dumps, per instance: every net/variable with its drivers (bit bounds, kind, where the
// driving code lives), and every analysed process with its read set.
int cmdDrivers(Loaded& l) {
    auto t = std::chrono::steady_clock::now();
    auto am = l.driver->runAnalysis(*l.comp);
    double analysisSeconds = seconds(t);
    auto& sm = *l.comp->getSourceManager();
    bool quiet = std::getenv("HIER_EXP_QUIET") != nullptr;

    size_t procs = 0, drivers = 0, reads = 0, crossBody = 0, symbols = 0, noScope = 0;
    forEachInstance(*l.comp, [&](const InstanceSymbol& inst) {
        bool canonicalElsewhere = inst.getCanonicalBody() != nullptr;
        if (!quiet)
            std::printf("\n== %s%s\n", inst.getHierarchicalPath().c_str(),
                        canonicalElsewhere ? "  (shares an earlier body)" : "");
        std::vector<const ValueSymbol*> values;
        collectValues(inst.body, values);
        for (auto v : values) {
            symbols++;
            auto ds = am->getDrivers(*v);
            if (!quiet)
                std::printf("  %-14s %-28s width=%llu drivers=%zu\n", std::string(v->name).c_str(),
                            v->getType().toString().c_str(),
                            ull(v->getType().getSelectableWidth()), ds.size());
            for (auto d : ds) {
                drivers++;
                auto [lo, hi] = d->getBounds();
                auto owner = d->containingSymbol->getParentScope()
                                 ? d->containingSymbol->getParentScope()->getContainingInstance()
                                 : nullptr;
                bool cross = owner && owner != &inst.body && !d->flags.has(DriverFlags::InputPort) &&
                             !d->flags.has(DriverFlags::OutputPort);
                if (cross)
                    crossBody++;
                if (!quiet)
                    std::printf("      [%llu:%llu] %s %s flags=%s by %s at %s%s\n",
                                ull(hi), ull(lo),
                                std::string(toString(d->kind)).c_str(), sourceName(d->source),
                                flagNames(d->flags).c_str(),
                                std::string(toString(d->containingSymbol->kind)).c_str(),
                                where(sm, d->getSourceRange().start()).c_str(),
                                cross ? "  <-- driven from another body" : "");
            }
        }
        auto scope = am->getAnalyzedScope(inst.body);
        if (!scope) {
            noScope++;
            return;
        }
        for (auto& p : scope->procedures) {
            procs++;
            reads += p.getReadSet().size();
            if (quiet)
                continue;
            std::printf("  process %s at %s%s\n",
                        std::string(toString(p.analyzedSymbol->kind)).c_str(),
                        where(sm, p.analyzedSymbol->location).c_str(),
                        p.getInferredClock() ? "  (clock inferred)" : "");
            for (auto d : p.getDrivers())
                std::printf("      writes %s[%llu:%llu]\n", std::string(d->getSymbol().name).c_str(),
                            ull(d->getBounds().second),
                            ull(d->getBounds().first));
            for (auto& r : p.getReadSet())
                std::printf("      reads  %s[%llu:%llu]\n", std::string(r.symbol->name).c_str(),
                            ull(r.bitRange.second),
                            ull(r.bitRange.first));
        }
    });
    std::fprintf(stderr,
                 "analysis %.2fs, peak RSS %ld MB; symbols %zu, drivers %zu (%zu from another body), "
                 "processes %zu, reads %zu, instances without an analysed scope %zu\n",
                 analysisSeconds, peakRssMb(), symbols, drivers, crossBody, procs, reads, noScope);
    return 0;
}

// --- clockstat -------------------------------------------------------------------
// For every distinct body: which signals lie on a clock or async-reset path (they
// clock a local edge-triggered block, or feed a child port that does, transitively
// through combinational processes), and how the combinational processes on those
// paths are written. Answers: how often is selection logic on such paths written as a
// procedural block (which the first version cannot reason about) versus an assign?
namespace {

struct RefCollector : ASTVisitor<RefCollector, VisitFlags::Expressions> {
    std::set<const ValueSymbol*> syms;
    void handle(const NamedValueExpression& e) { syms.insert(&e.symbol); }
};

struct BranchFinder : ASTVisitor<BranchFinder, VisitFlags::Statements> {
    bool found = false;
    void handle(const ConditionalStatement&) { found = true; }
    void handle(const CaseStatement&) { found = true; }
};

void edgeSymbols(const TimingControl& tc, std::set<const ValueSymbol*>& out) {
    if (tc.kind == TimingControlKind::SignalEvent) {
        auto& ev = tc.as<SignalEventControl>();
        if (ev.edge != EdgeKind::None) {
            RefCollector rc;
            ev.expr.visit(rc);
            out.insert(rc.syms.begin(), rc.syms.end());
        }
    }
    else if (tc.kind == TimingControlKind::EventList) {
        for (auto e : tc.as<EventListControl>().events)
            edgeSymbols(*e, out);
    }
}

// Edge-triggered: always_ff, or always with an edge event at the top.
bool edgeTriggered(const ProceduralBlockSymbol& pb, std::set<const ValueSymbol*>& clocks) {
    if (pb.procedureKind != ProceduralBlockKind::AlwaysFF &&
        pb.procedureKind != ProceduralBlockKind::Always)
        return false;
    auto& body = pb.getBody();
    if (body.kind != StatementKind::Timed)
        return false;
    size_t before = clocks.size();
    std::set<const ValueSymbol*> found;
    edgeSymbols(body.as<TimedStatement>().timing, found);
    clocks.insert(found.begin(), found.end());
    return !found.empty() || clocks.size() != before;
}

const Expression& stripConversions(const Expression& e) {
    auto p = &e;
    while (p->kind == ExpressionKind::Conversion)
        p = &p->as<ConversionExpression>().operand();
    return *p;
}

struct ClockStat {
    AnalysisManager& am;
    const SourceManager& sm;
    std::unordered_map<const InstanceBodySymbol*, std::set<const ValueSymbol*>> memo;
    std::map<std::string, size_t> kinds;          // per distinct body
    std::vector<std::string> procSelectors;       // examples
    size_t bodies = 0, bodiesWithClockPath = 0;

    const std::set<const ValueSymbol*>& body(const InstanceBodySymbol& b) {
        if (auto it = memo.find(&b); it != memo.end())
            return it->second;
        auto& onPath = memo[&b];
        bodies++;

        struct Proc {
            const AnalyzedProcedure* ap;
            bool sequential = false;
            bool counted = false;
        };
        std::vector<Proc> procs;
        std::unordered_map<const ValueSymbol*, std::vector<size_t>> writers;
        if (auto scope = am.getAnalyzedScope(b)) {
            for (auto& ap : scope->procedures) {
                Proc p{&ap};
                if (ap.analyzedSymbol->kind == SymbolKind::ProceduralBlock)
                    p.sequential =
                        edgeTriggered(ap.analyzedSymbol->as<ProceduralBlockSymbol>(), onPath);
                for (auto d : ap.getDrivers())
                    writers[&d->getSymbol()].push_back(procs.size());
                procs.push_back(p);
            }
        }

        // Child ports that are on a clock path inside the child pull in whatever the
        // parent connects to them.
        std::vector<const InstanceSymbol*> children;
        collectInstances(b, children);
        for (auto child : children) {
            auto& childSet = body(bodyOf(*child));
            for (auto conn : child->getPortConnections()) {
                if (conn->port.kind != SymbolKind::Port)
                    continue;
                auto internal = conn->port.as<PortSymbol>().internalSymbol;
                if (!internal || internal->kind == SymbolKind::Subroutine)
                    continue;
                // The child was analysed through its canonical body; look the port's
                // internal symbol up there by name.
                auto canonInternal = bodyOf(*child).find(internal->name);
                if (!canonInternal || !canonInternal->isValue() ||
                    !childSet.contains(&canonInternal->as<ValueSymbol>()))
                    continue;
                if (auto e = conn->getExpression()) {
                    RefCollector rc;
                    e->visit(rc);
                    onPath.insert(rc.syms.begin(), rc.syms.end());
                }
            }
        }

        // Walk backwards through combinational processes.
        std::vector<const ValueSymbol*> work(onPath.begin(), onPath.end());
        while (!work.empty()) {
            auto s = work.back();
            work.pop_back();
            auto it = writers.find(s);
            if (it == writers.end())
                continue;
            for (auto idx : it->second) {
                auto& p = procs[idx];
                if (p.counted)
                    continue;
                p.counted = true;
                classify(*p.ap, p.sequential);
                if (p.sequential)
                    continue;  // a register output used as a clock: stop here
                for (auto& r : p.ap->getReadSet())
                    if (onPath.insert(r.symbol).second)
                        work.push_back(r.symbol);
            }
        }
        if (!onPath.empty())
            bodiesWithClockPath++;
        return onPath;
    }

    void classify(const AnalyzedProcedure& ap, bool sequential) {
        auto& sym = *ap.analyzedSymbol;
        if (sequential) {
            kinds["register output used as clock/reset"]++;
            return;
        }
        if (sym.kind == SymbolKind::ContinuousAssign) {
            auto& assign = sym.as<ContinuousAssignSymbol>().getAssignment();
            const Expression* rhs = &assign;
            if (assign.kind == ExpressionKind::Assignment)
                rhs = &assign.as<AssignmentExpression>().right();
            auto& e = stripConversions(*rhs);
            switch (e.kind) {
                case ExpressionKind::NamedValue:
                case ExpressionKind::ElementSelect:
                case ExpressionKind::RangeSelect:
                    kinds["assign: plain connection"]++;
                    break;
                case ExpressionKind::UnaryOp:
                    kinds["assign: inverter / unary"]++;
                    break;
                case ExpressionKind::BinaryOp:
                    kinds["assign: gate (binary op)"]++;
                    break;
                case ExpressionKind::ConditionalOp:
                    kinds["assign: selector (?:)"]++;
                    break;
                default:
                    kinds["assign: other expression"]++;
                    break;
            }
            return;
        }
        BranchFinder bf;
        sym.as<ProceduralBlockSymbol>().getBody().visit(bf);
        if (bf.found) {
            kinds["procedural block WITH if/case (selector the first version cannot derive)"]++;
            if (procSelectors.size() < 12)
                procSelectors.push_back(where(sm, sym.location));
        }
        else {
            kinds["procedural block without branches"]++;
        }
    }
};

}  // namespace

int cmdClockStat(Loaded& l) {
    auto am = l.driver->runAnalysis(*l.comp);
    ClockStat cs{*am, *l.comp->getSourceManager(), {}, {}, {}, 0, 0};
    for (auto top : l.comp->getRoot().topInstances)
        cs.body(top->body);
    std::printf("distinct bodies %zu, of which %zu have signals on a clock/async-reset path\n",
                cs.bodies, cs.bodiesWithClockPath);
    std::printf("combinational drivers on those paths, counted once per distinct body:\n");
    for (auto& [k, n] : cs.kinds)
        std::printf("  %6zu  %s\n", n, k.c_str());
    if (!cs.procSelectors.empty()) {
        std::printf("examples of procedural-block selectors:\n");
        for (auto& w : cs.procSelectors)
            std::printf("  %s\n", w.c_str());
    }
    return 0;
}

}  // namespace hexp
