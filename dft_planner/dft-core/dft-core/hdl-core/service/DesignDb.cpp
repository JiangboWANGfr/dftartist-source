#include <fstream>
#include "service/DesignDb.h"

#include "service/SdcLite.h"
#include "service/SdcTcl.h"
#include "service/DftLib.h"
#include "clockgen.h"   // sdc-core: master-clock inference + resolved period (Clock Tree enrichment)
#include "lint.h"       // sdc-core: same parse pass, needed to reach clockgen's input

#include <algorithm>
#include <chrono>
#include <functional>
#include <cstring>
#include <cstdlib>
#include <climits>
#include <optional>
#include <map>
#include <unordered_map>
#include <unordered_set>
#include <set>
#include <span>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "frontend/SlangCompile.h"
#include "slang/analysis/AnalysisManager.h"
#include "slang/analysis/ValueDriver.h"
#include "slang/ast/ASTVisitor.h"
#include "slang/ast/Compilation.h"
#include "slang/ast/EvalContext.h"
#include "slang/ast/Expression.h"
#include "slang/ast/SemanticFacts.h"  // ProceduralBlockKind, EdgeKind
#include "slang/ast/Statement.h"      // Statement, StatementKind, StatementList, BlockStatement
#include "slang/ast/Symbol.h"
#include "slang/ast/TimingControl.h"  // SignalEventControl, EventListControl
#include "slang/ast/expressions/AssignmentExpressions.h"
#include "slang/ast/expressions/CallExpression.h"     // CallExpression (P2 decompose)
#include "slang/ast/expressions/ConversionExpression.h"  // ConversionExpression (P2 decompose)
#include "slang/ast/expressions/LiteralExpressions.h"  // IntegerLiteral (P2 decompose)
#include "slang/ast/expressions/MiscExpressions.h"  // Named/HierarchicalValueExpression
#include "slang/ast/expressions/Operator.h"          // Unary/BinaryOperator enums (P2 decompose)
#include "slang/ast/expressions/OperatorExpressions.h"  // Unary/BinaryExpression, MemberAccess
#include "slang/ast/expressions/SelectExpressions.h"  // Element/RangeSelectExpression
#include "slang/ast/statements/ConditionalStatements.h"
#include "slang/ast/statements/MiscStatements.h"  // TimedStatement
#include "slang/ast/symbols/BlockSymbols.h"  // ProceduralBlockSymbol, GenerateBlock*
#include "slang/ast/symbols/MemberSymbols.h"  // ContinuousAssignSymbol
#include "slang/ast/symbols/CompilationUnitSymbols.h"  // RootSymbol
#include "slang/ast/symbols/InstanceSymbols.h"
#include "slang/ast/symbols/ParameterSymbols.h"
#include "slang/ast/symbols/PortSymbols.h"
#include "slang/ast/symbols/ValueSymbol.h"
#include "slang/ast/types/Type.h"
#include "slang/numeric/ConstantValue.h"
#include "slang/syntax/SyntaxTree.h"  // memory-map: parse the library's Verilog model
#include "slang/text/SourceManager.h"

using namespace slang::ast;
using SK = slang::ast::SymbolKind;

namespace {

// Generation counter for every cache in this file that is keyed on a slang SYMBOL POINTER.
// A destroyed Compilation can hand the same address back to a new one, which would alias a fresh
// body onto a stale entry (the unit tests build several DesignDbs in one process). Bumped by the
// DesignDb constructor; each cache clears itself when it sees a new generation.
// NOTE: declared here, not next to its first user, so the constructor above can reach it — the
// counter previously sat in a later anonymous-namespace block and was therefore never bumped.
std::uint64_t g_structGen = 0;

std::string dirStr(ArgumentDirection d) {
    switch (d) {
        case ArgumentDirection::In: return "in";
        case ArgumentDirection::Out: return "out";
        case ArgumentDirection::InOut: return "inout";
        case ArgumentDirection::Ref: return "ref";
    }
    return "inout";
}

const Symbol* netOf(const InstanceSymbol& inst, const std::string& port) {
    for (auto* pc : inst.getPortConnections()) {
        const Symbol& p = pc->port;
        if (p.kind == SK::Port && p.name == port) return hdl::service::connNet(pc);
    }
    return nullptr;
}

/// A BLACKBOX (UninstantiatedDef — memory macro, hard IP) pin's connection expression at the
/// instantiation site. slang has no PortSymbols for a module without source; the named
/// `.CLK(mclk)` bindings are the ONLY port knowledge that exists, so every per-pin query
/// (get-ports, trace, drivers/loads) starts here.
const Expression* blackboxPinExpr(const UninstantiatedDefSymbol& ud, const std::string& port) {
    const auto names = ud.getPortNames();
    const auto conns = ud.getPortConnections();
    for (std::size_t i = 0; i < conns.size() && i < names.size(); ++i) {
        if (std::string(names[i]) != port) continue;
        if (!conns[i] || conns[i]->kind != slang::ast::AssertionExprKind::Simple) return nullptr;
        return &conns[i]->as<slang::ast::SimpleAssertionExpr>().expr;
    }
    return nullptr;
}

/// Unwrap conversions/selects down to the connected NET symbol (null for ties/expressions).
const Symbol* connExprSymbol(const Expression& e) {
    const Expression* e2 = &e;
    while (true) {
        if (e2->kind == ExpressionKind::Conversion) e2 = &e2->as<ConversionExpression>().operand();
        else if (e2->kind == ExpressionKind::ElementSelect) e2 = &e2->as<ElementSelectExpression>().value();
        else if (e2->kind == ExpressionKind::RangeSelect) e2 = &e2->as<RangeSelectExpression>().value();
        else break;
    }
    return e2->getSymbolReference();
}

std::string srcLabel(slang::analysis::DriverSource s) {
    using DS = slang::analysis::DriverSource;
    switch (s) {
        case DS::Always: return "always";
        case DS::AlwaysComb: return "always_comb";
        case DS::AlwaysLatch: return "always_latch";
        case DS::AlwaysFF: return "always_ff";
        case DS::Initial: return "initial";
        case DS::Final: return "final";
        case DS::Subroutine: return "task/func";
        case DS::Other: return "other";
    }
    return "other";
}

}  // namespace

namespace hdl::service {

struct DesignDb::Impl {
    std::unique_ptr<hdl::frontend::Design> design;
    Compilation* comp = nullptr;
    const slang::SourceManager* sm = nullptr;

    std::map<std::string, const Symbol*> inst;          // hierPath -> symbol (any kind)
    std::map<std::string, const Symbol*> defs;          // defId -> DefinitionSymbol
    std::map<std::string, const InstanceSymbol*> defInst;  // defId -> representative instance
    std::map<std::string, std::vector<PortDict>> portCache;
    std::map<std::string, bool> paramCache;

    std::vector<Meta> candidateTops;  // ranked, with subtreeSize
    int defCount = 0;

    // logicId ("logic:<file>:<line>") -> {behavioral block symbol, scopeId} so traceLogic can
    // resolve a previously-emitted logic source back to its always/assign block and fan-in.
    std::map<std::string, std::pair<const Symbol*, std::string>> logicBlocks;
    // logicId -> {port-connection EXPRESSION, scopeId}: `.data_in(~puc_s)` — inline logic at
    // the instantiation, no block symbol exists. traceLogic resolves fan-in from the
    // expression's reads directly.
    std::map<std::string, std::pair<const Expression*, std::string>> connExprs;
    /// Templates from the last memory-map call. A blackbox has no port DIRECTIONS anywhere in
    /// the design HDL; the library's Verilog model (hdlPorts) or the *.tcd_memory pin table is
    /// the authoritative source, so get-ports consults this cache to orient a matched memory's
    /// pins (unmatched pins stay "inout"). memLibDir lets report_memory_instance re-run the
    /// match without the caller re-passing the directory.
    std::vector<MemTemplate> memTemplates;
    std::string memLibDir;
    /// set_memory_instance_options, shared by the console and every GUI query.
    std::vector<MbistPlanOptions::InstanceOption> memInstOpts;
    /// Cached flop enumeration — immutable after compile; see DesignDb::getSequential().
    std::optional<std::vector<SeqElement>> seqCache;
    /// The same elements sorted by ownerInstanceId, so a SCOPED query binary-searches its
    /// subtree instead of scanning the whole design. Without it every drill-in still paid an
    /// O(design) filter pass — 25 ms per click at 2M registers, and growing.
    std::optional<std::vector<const SeqElement*>> seqByOwner;

    std::unique_ptr<slang::analysis::AnalysisManager> am;  // lazy: built on first trace-drivers

    slang::analysis::AnalysisManager& ensureAm() {
        if (!am) {
            comp->getAllDiagnostics();  // ensure fully elaborated
            am = std::make_unique<slang::analysis::AnalysisManager>();
            am->analyze(*comp);
        }
        return *am;
    }

    int subtreeSizeCapped(const Symbol& root, int cap) {
        std::vector<const Symbol*> stack{&root};
        int n = 0;
        while (!stack.empty() && n < cap) {
            const Symbol* x = stack.back();
            stack.pop_back();
            ++n;
            if (isRealInstance(*x)) {
                std::vector<const Symbol*> kids;
                collectChildren(x->as<InstanceSymbol>().body, kids);
                for (auto* k : kids) stack.push_back(k);
            }
        }
        return n;
    }

    void registerSym(const Symbol& s) {
        inst[s.getHierarchicalPath()] = &s;
        if (isRealInstance(s)) {
            std::string did = defInfo(s, *sm).id;
            defInst.try_emplace(did, &s.as<InstanceSymbol>());
        }
    }

    Meta metaOf(const Symbol& s) {
        Meta m;
        m.id = s.getHierarchicalPath();
        m.instanceName = leafName(s);
        m.kind = kindOf(s);
        m.definitionId = defInfo(s, *sm).id;
        if (isRealInstance(s)) {
            std::vector<const Symbol*> kids;
            collectChildren(s.as<InstanceSymbol>().body, kids);
            m.isLeaf = kids.empty();
        } else {
            m.isLeaf = true;
        }
        return m;
    }

    bool parameterizedFor(const std::string& did) {
        auto it = paramCache.find(did);
        if (it != paramCache.end()) return it->second;
        bool v = false;
        auto di = defInst.find(did);
        if (di != defInst.end()) v = isParameterized(*di->second);
        paramCache[did] = v;
        return v;
    }

    const std::vector<PortDict>& repPorts(const std::string& did) {
        auto c = portCache.find(did);
        if (c != portCache.end()) return c->second;
        auto di = defInst.find(did);
        if (di == defInst.end())
            throw std::out_of_range("no elaborated instance registered for def " + did);
        portCache[did] = portDicts(*di->second);
        return portCache[did];
    }
};

DesignDb::DesignDb(std::unique_ptr<hdl::frontend::Design> design) : p_(std::make_unique<Impl>()) {
    ++g_structGen;  // invalidate every pointer-keyed cache from a previous compilation
    p_->design = std::move(design);
    p_->comp = p_->design->comp.get();
    p_->sm = p_->comp->getSourceManager();

    // candidate_roots: all tops, ranked by capped subtree size, descending (stable).
    auto tops = p_->comp->getRoot().topInstances;
    std::vector<std::pair<int, const InstanceSymbol*>> ranked;
    ranked.reserve(tops.size());
    for (auto* t : tops) ranked.emplace_back(p_->subtreeSizeCapped(*t, 2000), t);
    std::stable_sort(ranked.begin(), ranked.end(),
                     [](const auto& a, const auto& b) { return a.first > b.first; });

    for (auto& [size, t] : ranked) {
        p_->registerSym(*t);
        Meta m = p_->metaOf(*t);
        m.subtreeSize = size;
        p_->candidateTops.push_back(std::move(m));
    }

    // register all module/iface/prog definitions
    for (const Symbol* d : p_->comp->getDefinitions()) {
        if (d->kind != SK::Definition) continue;
        p_->defs[defIdOfDefinition(*d, *p_->sm)] = d;
    }
    p_->defCount = static_cast<int>(p_->defs.size());
}

DesignDb::~DesignDb() = default;

ReadyInfo DesignDb::ready() const {
    return ReadyInfo{p_->candidateTops, p_->defCount};
}

DiagnosticsResult DesignDb::getDiagnostics() const {
    const auto& d = *p_->design;
    DiagnosticsResult r;
    const auto& dg = d.diagnostics();  // deferred until someone asks: this elaborates everything
    r.errorCount = dg.errorCount;
    r.totalDiagnostics = dg.totalDiagnostics;
    r.truncated = dg.truncated;
    r.text = dg.text;
    r.missingFiles = d.missingFiles;
    r.libraryFiles = d.libraryFiles;
    r.missingLibDirs = d.missingLibDirs;
    return r;
}

std::pair<std::vector<std::string>, int> DesignDb::ping() const {
    std::vector<std::string> roots;
    for (auto& m : p_->candidateTops) roots.push_back(m.id);
    return {roots, p_->defCount};
}

ExpandResult DesignDb::expandChildren(const std::string& nodeId) {
    ensureRegistered(nodeId, /*expandSelf*/ false);
    auto it = p_->inst.find(nodeId);
    if (it == p_->inst.end())
        throw std::out_of_range("unknown nodeId " + nodeId + " (expand its parent first)");
    const Symbol& s = *it->second;
    ExpandResult r;
    if (!isRealInstance(s)) return r;
    std::vector<const Symbol*> kids;
    collectChildren(s.as<InstanceSymbol>().body, kids);
    for (auto* c : kids) {
        p_->registerSym(*c);
        r.children.push_back(p_->metaOf(*c));
        r.childInstanceIds.push_back(c->getHierarchicalPath());
    }
    return r;
}

// Lazily register an instance path: expand every ancestor prefix (and optionally
// the node itself, so its children register too). Fast-path: already-registered
// nodes are skipped — the invariant "node registered => ancestors registered"
// holds for all registration paths.
void DesignDb::ensureRegistered(const std::string& id, bool expandSelf) {
    if (p_->inst.count(id)) {
        if (!expandSelf) return;
        // node known but children may not be -> one self expansion is enough
        try {
            expandChildren(id);
        } catch (const std::out_of_range&) {
        }
        return;
    }
    size_t pos = 0;
    while ((pos = id.find('.', pos)) != std::string::npos) {
        try {
            expandChildren(id.substr(0, pos));
        } catch (const std::out_of_range&) {
        }
        ++pos;
    }
    if (expandSelf) {
        try {
            expandChildren(id);
        } catch (const std::out_of_range&) {
        }
    }
}

PortsResult DesignDb::getPortsByDef(const std::string& defId) {
    PortsResult r;
    r.ports = p_->repPorts(defId);
    return r;
}

PortsResult DesignDb::getPortsByNode(const std::string& nodeId) {
    // Cold sessions (restored schematics, scripts, sweeps) ask about DEEP nodes directly —
    // walk the path into the registry first, exactly like every trace method does.
    ensureRegistered(nodeId, /*expandSelf*/ false);
    auto it = p_->inst.find(nodeId);
    if (it == p_->inst.end()) throw std::out_of_range("unknown nodeId " + nodeId);
    const Symbol& s = *it->second;
    PortsResult r;
    if (!isRealInstance(s)) {
        // BLACKBOX (memory macro / hard IP): no source, no PortSymbols — synthesize the port
        // list from the instantiation's named connections. Widths come from the connected
        // expressions' types; directions from the matched membistlib template when a
        // memory-map ran (Q is an output because the .tcd_memory says so), else the honest
        // unknown "inout". Without this every SRAM drew as a pin-less dead box.
        const auto* ud = s.as_if<UninstantiatedDefSymbol>();
        if (!ud) return r;
        const MemTemplate* mt = nullptr;
        for (const auto& t : p_->memTemplates)
            if (t.name == ud->definitionName) { mt = &t; break; }
        // The library's VERILOG MODEL is the module's own declaration — use it verbatim.
        if (mt && !mt->hdlPorts.empty()) { r.ports = mt->hdlPorts; return r; }
        const auto names = ud->getPortNames();
        const auto conns = ud->getPortConnections();
        for (std::size_t i = 0; i < names.size(); ++i) {
            if (names[i].empty()) continue;   // positional connection — no name to show
            PortDict pd;
            pd.name = std::string(names[i]);
            pd.width = 1;
            if (i < conns.size() && conns[i] &&
                conns[i]->kind == slang::ast::AssertionExprKind::Simple) {
                const auto& ex = conns[i]->as<slang::ast::SimpleAssertionExpr>().expr;
                if (ex.type) pd.width = static_cast<int>(ex.type->getBitWidth());
            }
            pd.direction = "inout";
            if (mt) {
                for (const auto& mp : mt->pins) {
                    if (mp.name.substr(0, mp.name.find('[')) != pd.name) continue;
                    if (mp.direction == "Input") pd.direction = "in";
                    else if (mp.direction == "Output") pd.direction = "out";
                    else if (!mp.function.empty()) pd.direction = "in";  // Clock/Address/Select/WE
                    break;
                }
            }
            pd.busLabel = pd.width > 1
                ? pd.name + "[" + std::to_string(pd.width - 1) + ":0]" : pd.name;
            pd.type = pd.width > 1
                ? "logic[" + std::to_string(pd.width - 1) + ":0]" : "logic";
            pd.portKind = "port";
            r.ports.push_back(std::move(pd));
        }
        return r;
    }

    const auto& inst = s.as<InstanceSymbol>();
    std::string did = defInfo(s, *p_->sm).id;
    const std::vector<PortDict>& rep = p_->repPorts(did);
    if (!p_->parameterizedFor(did)) {
        r.ports = rep;
        return r;
    }
    // parameterized: this instance's own widths + sparse overrides vs representative
    r.ports = portDicts(inst);
    std::map<std::string, int> repW;
    for (auto& p : rep) repW[p.name] = p.width;
    for (auto& p : r.ports) {
        auto rw = repW.find(p.name);
        if (rw == repW.end() || rw->second != p.width)
            r.portWidthOverrides.emplace_back(p.name, p.width);
    }
    return r;
}

SourceLoc DesignDb::getSourceLocation(const std::string& kind, const std::string& id) {
    slang::SourceLocation loc;
    if (kind == "definition") {
        auto it = p_->defs.find(id);
        if (it == p_->defs.end()) throw std::out_of_range("unknown defId " + id);
        loc = it->second->location;
    } else if (kind == "instantiation") {
        ensureRegistered(id, /*expandSelf*/ false);
        auto it = p_->inst.find(id);
        if (it == p_->inst.end()) throw std::out_of_range("unknown nodeId " + id);
        loc = it->second->location;
    } else {
        throw std::invalid_argument("kind must be 'definition' or 'instantiation'");
    }
    SourceLoc r;
    try {
        r.file = p_->sm->getFullPath(loc.buffer()).string();
    } catch (...) {
        r.file = "";
    }
    r.line = static_cast<int>(p_->sm->getLineNumber(loc));
    return r;
}

TraceResult DesignDb::trace(const std::string& nodeId, const std::string& port, bool wantDriver) {
    TraceResult r;
    ensureRegistered(nodeId, /*expandSelf*/ false);
    auto it = p_->inst.find(nodeId);
    if (it == p_->inst.end()) return r;
    const Symbol& selfSym = *it->second;
    // A BLACKBOX (memory macro) is traceable too: its pins resolve to the connected nets at
    // the instantiation site — an SRAM's CLK/D/Q used to be a guaranteed dead end.
    const auto* bb = selfSym.as_if<UninstantiatedDefSymbol>();
    if (!bb && !isRealInstance(selfSym)) return r;

    auto pos = nodeId.rfind('.');
    if (pos == std::string::npos) return r;  // a top has no sibling scope
    auto pit = p_->inst.find(nodeId.substr(0, pos));
    if (pit == p_->inst.end() || !isRealInstance(*pit->second)) return r;
    const InstanceBodySymbol& body = pit->second->as<InstanceSymbol>().body;

    const Symbol* net = nullptr;
    if (bb) {
        if (const Expression* ce = blackboxPinExpr(*bb, port)) net = connExprSymbol(*ce);
    } else {
        net = netOf(selfSym.as<InstanceSymbol>(), port);
    }
    if (!net) return r;
    bool bus = false;
    if (auto* vs = net->as_if<ValueSymbol>()) bus = vs->getType().getBitWidth() > 1;

    std::set<std::string> seen;
    const auto emitEdge = [&](const std::string& other, const std::string& otherPort,
                              bool otherIsDriver, const Symbol& sym) {
        TraceEdge e;
        e.netName = std::string(net->name);
        e.bus = bus;
        if (wantDriver && otherIsDriver) {
            e.fromNode = other; e.fromPort = otherPort; e.toNode = nodeId; e.toPort = port;
        } else if (!wantDriver && !otherIsDriver) {
            e.fromNode = nodeId; e.fromPort = port; e.toNode = other; e.toPort = otherPort;
        } else return;
        r.edges.push_back(std::move(e));
        if (!seen.count(other)) {
            seen.insert(other);
            p_->registerSym(sym);
            r.nodes.push_back(p_->metaOf(sym));
        }
    };

    // collectChildren descends generate blocks; an instance under `generate` is a sibling
    // structurally. Blackboxes (UninstantiatedDefSymbol — memories, hard macros) are children
    // too: their port directions are unknown, so a blackbox counts as the LOAD on a fanout
    // query and the DRIVER on a fanin query — dmem_addr feeding a memory macro used to be a
    // dead end because the scan only looked at fully-elaborated instances.
    std::vector<const Symbol*> kids;
    collectChildren(body, kids);
    for (const Symbol* km : kids) {
        if (km == &selfSym) continue;
        if (km->kind == SK::Instance) {
            const auto& mi = km->as<InstanceSymbol>();
            for (auto* pc : mi.getPortConnections()) {
                const Symbol& p = pc->port;
                if (p.kind != SK::Port || connNet(pc) != net) continue;
                const std::string dir = dirStr(p.as<PortSymbol>().direction);
                if (dir != "in" && dir != "out") continue;
                emitEdge(mi.getHierarchicalPath(), std::string(p.name), dir == "out", mi);
            }
        } else if (km->kind == SK::UninstantiatedDef) {
            const auto& ud = km->as<UninstantiatedDefSymbol>();
            const auto names = ud.getPortNames();
            const auto conns = ud.getPortConnections();
            for (std::size_t i = 0; i < conns.size() && i < names.size(); ++i) {
                if (!conns[i] || conns[i]->kind != slang::ast::AssertionExprKind::Simple) continue;
                const Expression& ex = conns[i]->as<slang::ast::SimpleAssertionExpr>().expr;
                const Expression* e2 = &ex;
                while (true) {
                    if (e2->kind == ExpressionKind::Conversion) e2 = &e2->as<ConversionExpression>().operand();
                    else if (e2->kind == ExpressionKind::ElementSelect) e2 = &e2->as<ElementSelectExpression>().value();
                    else if (e2->kind == ExpressionKind::RangeSelect) e2 = &e2->as<RangeSelectExpression>().value();
                    else break;
                }
                if (e2->getSymbolReference() != net) continue;
                emitEdge(ud.getHierarchicalPath(), std::string(names[i]), wantDriver, ud);
            }
        }
    }
    return r;
}

static ParamsResult paramsOf(const InstanceBodySymbol& body) {
    ParamsResult r;
    for (auto* pb : body.getParameters()) {
        ParamInfo pi;
        pi.name = std::string(pb->symbol.name);
        pi.isLocal = pb->isLocalParam();
        if (pb->symbol.kind == SK::Parameter) {
            const auto& ps = pb->symbol.as<ParameterSymbol>();
            pi.value = ps.getValue().toString();
            pi.type = ps.getType().toString();
        }
        r.parameters.push_back(std::move(pi));
    }
    return r;
}

ParamsResult DesignDb::getParametersByNode(const std::string& nodeId) {
    ensureRegistered(nodeId, /*expandSelf*/ false);
    auto it = p_->inst.find(nodeId);
    if (it == p_->inst.end() || !isRealInstance(*it->second)) return ParamsResult{};
    return paramsOf(it->second->as<InstanceSymbol>().body);
}

ParamsResult DesignDb::getParametersByDef(const std::string& defId) {
    auto it = p_->defInst.find(defId);
    if (it == p_->defInst.end())
        throw std::out_of_range("no elaborated instance registered for def " + defId);
    return paramsOf(it->second->body);
}

LocalNetlist DesignDb::getNetlist(const std::string& ownerInstanceId) {
    ensureRegistered(ownerInstanceId, /*expandSelf*/ true);
    auto it = p_->inst.find(ownerInstanceId);
    if (it == p_->inst.end() || !isRealInstance(*it->second)) {
        LocalNetlist nl;
        nl.ownerInstanceId = ownerInstanceId;
        return nl;
    }
    return extractLocalNetlist(it->second->as<InstanceSymbol>(), *p_->sm);
}

namespace {
// defined further down (with the other AST helpers); declared here for traceDrivers/traceLoads
const char* exprShape(const Expression& e0);
const char* assignShape(const ContinuousAssignSymbol& ca);
/// The RHS-read signal names of an assign / wire-initializer — a gate source's REAL inputs.
std::vector<std::string> gateReads(const Symbol& blk, std::string_view ownNet);
std::vector<std::string> exprReads(const Expression& e);
std::vector<const Symbol*> structuralReadersOf(const ValueSymbol& net);
}  // namespace

DriversResult DesignDb::traceDrivers(const std::string& nodeId, const std::string& port) {
    DriversResult r;
    ensureRegistered(nodeId, /*expandSelf*/ false);
    auto it = p_->inst.find(nodeId);
    if (it == p_->inst.end()) return r;
    const Symbol& selfSym = *it->second;
    const auto* bb = selfSym.as_if<UninstantiatedDefSymbol>();
    if (!bb && !isRealInstance(selfSym)) return r;

    auto pos = nodeId.rfind('.');
    if (pos == std::string::npos) {
        // A TOP instance's input has no upstream design — it IS a primary input. Say so
        // instead of answering nothing (an empty answer marks the pin dead in the GUI).
        DriverSourceInfo s;
        s.kind = "port";
        s.id = "pi:" + nodeId + "." + port;
        s.label = port;
        s.detail = "primary input";
        s.net = port;
        r.sources.push_back(std::move(s));
        r.netName = port;
        return r;
    }
    auto pit = p_->inst.find(nodeId.substr(0, pos));
    if (pit == p_->inst.end() || !isRealInstance(*pit->second)) return r;

    // BLACKBOX pin: the connected net comes from the instantiation's `.PIN(net)` binding —
    // a tie (`.CEN(1'b0)`) or inline expression binding reports like the instance cases below.
    const Symbol* net = nullptr;
    const Expression* bbConn = nullptr;
    if (bb) {
        bbConn = blackboxPinExpr(*bb, port);
        if (bbConn) net = connExprSymbol(*bbConn);
        if (!net && bbConn) {
            try {
                EvalContext ectx(selfSym);
                const slang::ConstantValue cv = bbConn->eval(ectx);
                if (cv.isInteger()) {
                    DriverSourceInfo s;
                    s.kind = "constant";
                    s.id = "const:" + nodeId + "." + port;
                    s.label = cv.toString();
                    s.detail = cv.toString();
                    r.sources.push_back(std::move(s));
                    return r;
                }
            } catch (...) {}
            std::string f;
            int ln = 0;
            try {
                f = p_->sm->getFullPath(bbConn->sourceRange.start().buffer()).string();
                ln = static_cast<int>(p_->sm->getLineNumber(bbConn->sourceRange.start()));
            } catch (...) { f.clear(); }
            if (ln > 0) {
                const std::string parent = nodeId.substr(0, pos);
                DriverSourceInfo s;
                s.kind = "logic";
                s.shape = exprShape(*bbConn);
                if (!s.shape.empty()) s.reads = exprReads(*bbConn);
                s.id = "logic:" + parent + ":" + f + ":" + std::to_string(ln);
                s.label = "assign";
                s.detail = "port connection";
                s.net = port;
                s.file = f;
                s.line = ln;
                p_->connExprs[s.id] = {bbConn, parent};
                r.sources.push_back(std::move(s));
                r.netName = port;
            }
            return r;
        }
        if (!net) return r;
    } else {
        net = netOf(selfSym.as<InstanceSymbol>(), port);
    }
    if (!net) {
        const InstanceSymbol& self = selfSym.as<InstanceSymbol>();
        for (auto* pc : self.getPortConnections()) {
            if (pc->port.kind == SK::Port && pc->port.name == port) {
                // constant tie -> report it; dangling stays empty (M0 tie patch)
                if (auto tie = connTie(pc)) {
                    DriverSourceInfo s;
                    s.kind = "constant";
                    s.id = "const:" + nodeId + "." + port;
                    s.label = *tie;
                    s.detail = *tie;
                    r.sources.push_back(std::move(s));
                    break;
                }
                // EXPRESSION connection (`.data_in(~puc_s)`): inline logic at the
                // instantiation — no net, no block symbol, and this pin dead-ended. Emit it
                // as a logic source (shape-classified, so it renders as the gate) and
                // register the expression so trace-through resolves its reads.
                if (const Expression* ex = pc->getExpression()) {
                    const Expression* rhs = ex;
                    if (rhs->kind == ExpressionKind::Assignment)
                        rhs = &rhs->as<AssignmentExpression>().right();
                    std::string f;
                    int ln = 0;
                    try {
                        f = p_->sm->getFullPath(rhs->sourceRange.start().buffer()).string();
                        ln = static_cast<int>(p_->sm->getLineNumber(rhs->sourceRange.start()));
                    } catch (...) { f.clear(); }
                    if (ln > 0) {
                        const std::string parent = nodeId.substr(0, pos);
                        DriverSourceInfo s;
                        s.kind = "logic";
                        s.shape = exprShape(*rhs);
                        if (!s.shape.empty()) s.reads = exprReads(*rhs);
                        s.id = "logic:" + parent + ":" + f + ":" + std::to_string(ln);
                        s.label = "assign";
                        s.detail = "port connection";
                        s.net = port;
                        s.file = f;
                        s.line = ln;
                        p_->connExprs[s.id] = {rhs, parent};
                        r.sources.push_back(std::move(s));
                        r.netName = port;
                    }
                }
                break;
            }
        }
        return r;
    }
    const auto* vs = net->as_if<ValueSymbol>();
    if (!vs) return r;

    bool bus = vs->getType().getBitWidth() > 1;
    std::string parent = nodeId.substr(0, pos);
    std::string netName = std::string(net->name);
    r.netName = netName;
    r.bus = bus;

    collectBehavioralSources(*vs, parent, bus, r.sources);
    return r;
}

DriversResult DesignDb::traceLoads(const std::string& nodeId, const std::string& port) {
    DriversResult r;
    ensureRegistered(nodeId, /*expandSelf*/ false);
    auto it = p_->inst.find(nodeId);
    if (it == p_->inst.end()) return r;
    const Symbol& selfSym = *it->second;
    const auto* bb = selfSym.as_if<UninstantiatedDefSymbol>();
    if (!bb && !isRealInstance(selfSym)) return r;

    auto pos = nodeId.rfind('.');
    if (pos == std::string::npos) {
        // A TOP instance's output leaves the design here — it IS the primary output.
        DriverSourceInfo s;
        s.kind = "port";
        s.id = "po:" + nodeId + "." + port;
        s.label = port;
        s.detail = "primary output";
        s.net = port;
        r.sources.push_back(std::move(s));
        r.netName = port;
        return r;
    }
    auto pit = p_->inst.find(nodeId.substr(0, pos));
    if (pit == p_->inst.end() || !isRealInstance(*pit->second)) return r;

    const Symbol* net = nullptr;
    if (bb) {
        if (const Expression* ce = blackboxPinExpr(*bb, port)) net = connExprSymbol(*ce);
    } else {
        net = netOf(selfSym.as<InstanceSymbol>(), port);
    }
    const auto* vs = net ? net->as_if<ValueSymbol>() : nullptr;
    if (!vs) return r;

    const bool bus = vs->getType().getBitWidth() > 1;
    const std::string parent = nodeId.substr(0, pos);
    const std::string netName(net->name);
    r.netName = netName;
    r.bus = bus;
    for (const Symbol* blk : structuralReadersOf(*vs)) {
        std::string f;
        int ln = 0;
        try {
            f = p_->sm->getFullPath(blk->location.buffer()).string();
            ln = static_cast<int>(p_->sm->getLineNumber(blk->location));
        } catch (...) { continue; }
        if (ln <= 0) continue;
        DriverSourceInfo s;
        s.kind = "logic";
        s.id = "logic:" + parent + ":" + f + ":" + std::to_string(ln);
        if (blk->kind == SK::ContinuousAssign) {
            s.label = "assign";
            s.shape = assignShape(blk->as<ContinuousAssignSymbol>());
            if (!s.shape.empty()) s.reads = gateReads(*blk, "");
            // the LHS this reader DRIVES -> the load node gets an OUTPUT pin to trace on from
            const Expression& asn = blk->as<ContinuousAssignSymbol>().getAssignment();
            if (asn.kind == ExpressionKind::Assignment)
                if (const Symbol* lhs =
                        asn.as<AssignmentExpression>().left().getSymbolReference())
                    s.drives = std::string(lhs->name);
        } else if (blk->kind == SK::ProceduralBlock) {
            s.label = blk->as<ProceduralBlockSymbol>().procedureKind == ProceduralBlockKind::AlwaysFF
                      ? "always_ff" : "always";
        } else {   // Net/Variable: a `wire y = expr;` reader
            s.label = "wire";
            s.drives = std::string(blk->name);   // a wire initializer drives itself
            if (const Expression* init = blk->as<ValueSymbol>().getInitializer()) {
                s.shape = exprShape(*init);
                if (!s.shape.empty()) s.reads = gateReads(*blk, "");
            }
        }
        s.detail = s.label;
        s.net = netName;
        s.file = f;
        s.line = ln;
        s.bus = bus;
        p_->logicBlocks[s.id] = {blk, parent};
        r.sources.push_back(std::move(s));
    }
    if (r.sources.empty()) {
        // No reader in the parent: the net may LEAVE through the parent's boundary — its
        // readers are one level up (dmem_addr threading out of mem_backbone, or a chip pin).
        const InstanceSymbol& par = pit->second->as<InstanceSymbol>();
        for (const Symbol& m : par.body.members()) {
            if (m.kind != SK::Port) continue;
            const auto& ps = m.as<PortSymbol>();
            if (ps.direction != ArgumentDirection::Out) continue;
            if (ps.internalSymbol != static_cast<const Symbol*>(vs) && ps.name != netName) continue;
            DriverSourceInfo s;
            s.kind = "port";
            s.id = "port:" + parent + "." + std::string(ps.name);
            s.label = std::string(ps.name);
            s.detail = parent.find('.') == std::string::npos ? "primary output" : "output port";
            s.net = netName;
            r.sources.push_back(std::move(s));
            break;
        }
    }
    return r;
}

namespace {
// Structural driver scan — the fallback for slang's per-DEFINITION driver bookkeeping.
// AnalysisManager keeps driver data for ONE representative instance of each module; a net in
// any other instance of the same module reports zero drivers even though its own AST plainly
// writes it. On the real design that cascaded into 114 of 121 resets reading "undriven"
// (every reset synchroniser after the first). The instance's AST is complete, so scanning it
// directly is exact; the analysis stays as the fast path.
struct StructDrivers {
    std::vector<const ContinuousAssignSymbol*> assigns;
    std::vector<const ProceduralBlockSymbol*> procs;
    /// Child-instance OUTPUT connections that drive the net (`.o(net)`): the driver the
    /// analysis loop deliberately skips ("structural driver -> the port-connection scan's
    /// job") — but trace-logic/trace-net have no port-connection scan, so without these an
    /// instance-driven input reported no source at all and the trace dead-ended (the
    /// per_dout1 case: `assign dout = per_dout1|din1|din2` had zero fan-in cold).
    std::vector<std::pair<const InstanceSymbol*, const PortSymbol*>> instOuts;
};
StructDrivers structuralDriversOf(const ValueSymbol& net);   // defined after the AST helpers
/// Behavioral READERS of a net (assigns whose RHS references it, procedural blocks reading
/// it): the load-side mirror of structuralDriversOf. Per-body cached the same way.
std::vector<const Symbol*> structuralReadersOf(const ValueSymbol& net);
}  // namespace

namespace {
/// Shape of a driving expression, for UNIFORM rendering across every schematic view (clock
/// tree / DRC debug / free trace draw the same statement with the same symbol): a bare
/// name/select is an ALIAS (physically a wire), a single operator is that gate, anything
/// else is a real block ("").
const char* exprShape(const Expression& e0) {
    const Expression* e = &e0;
    while (e->kind == ExpressionKind::Conversion) e = &e->as<ConversionExpression>().operand();
    switch (e->kind) {
        case ExpressionKind::NamedValue:
        case ExpressionKind::HierarchicalValue:
        case ExpressionKind::ElementSelect:
        case ExpressionKind::RangeSelect:
            return "alias";
        case ExpressionKind::UnaryOp: {
            const auto op = e->as<UnaryExpression>().op;
            return (op == UnaryOperator::BitwiseNot || op == UnaryOperator::LogicalNot) ? "inv" : "";
        }
        case ExpressionKind::BinaryOp: {
            switch (e->as<BinaryExpression>().op) {
                case BinaryOperator::BinaryAnd:
                case BinaryOperator::LogicalAnd: return "and";
                case BinaryOperator::BinaryOr:
                case BinaryOperator::LogicalOr: return "or";
                case BinaryOperator::BinaryXor: return "xor";
                default: return "";
            }
        }
        case ExpressionKind::ConditionalOp: return "mux";
        default: return "";
    }
}
/// Shape of a continuous-assign statement's RHS ("" when not a simple assignment).
const char* assignShape(const ContinuousAssignSymbol& ca) {
    const Expression& asn = ca.getAssignment();
    if (asn.kind != ExpressionKind::Assignment) return "";
    return exprShape(asn.as<AssignmentExpression>().right());
}

}  // namespace

void DesignDb::collectBehavioralSources(const ValueSymbol& vs, const std::string& scopeId,
                                        bool bus, std::vector<DriverSourceInfo>& out) {
    auto& am = p_->ensureAm();
    std::string netName(vs.name);
    std::set<std::string> seen;
    for (auto& s0 : out) seen.insert(s0.id);

    // Child-instance outputs driving the net (`.o(net)`): the driver kind BOTH paths below
    // otherwise drop — the analysis loop skips instance drivers and the structural fallback
    // used to collect only assigns/procs — so an instance-driven input had no source at all
    // and every trace through it dead-ended. The id is keyed to the QUERIED scope (vs may
    // live in the representative body): scopeId + the child's canonical path relative to its
    // body, so generate-block segments (genblk1…) come out right for any instance.
    const auto emitInstOuts = [&]() {
        for (const auto& [ci, ps] : structuralDriversOf(vs).instOuts) {
            std::string rel(ci->getHierarchicalPath());
            const Scope* sc2 = ci->getParentScope();
            while (sc2 && sc2->asSymbol().kind != SK::InstanceBody)
                sc2 = sc2->asSymbol().getParentScope();
            if (sc2)
                if (const InstanceSymbol* bi = sc2->asSymbol().as<InstanceBodySymbol>().parentInstance) {
                    const std::string bodyPath = bi->getHierarchicalPath();
                    if (rel.size() > bodyPath.size() && rel.compare(0, bodyPath.size(), bodyPath) == 0)
                        rel = rel.substr(bodyPath.size() + 1);   // drop "<body>."
                }
            DriverSourceInfo s;
            s.kind = "instance";
            s.id = scopeId.empty() ? rel : scopeId + "." + rel;
            s.label = std::string(ps->name);                          // the driving output pin
            s.detail = std::string(ci->body.getDefinition().name);     // module name
            s.net = netName;
            s.bus = bus;
            try {
                s.file = p_->sm->getFullPath(ci->location.buffer()).string();
                s.line = static_cast<int>(p_->sm->getLineNumber(ci->location));
            } catch (...) {}
            const std::string key = s.id + ">" + s.label;
            if (!seen.count(key)) { seen.insert(key); out.push_back(std::move(s)); }
        }
    };

    // `wire x = expr;` — slang's AnalysisManager does NOT report a declaration initializer as a
    // driver, so such a signal looks completely undriven and every trace through it dead-ended
    // silently (e.g. `wire puc_a = por | wdt_reset;` stopped the fan-in at puc_a_scan). The
    // declaration IS the driving statement: emit it as a logic source and register it so
    // traceLogic can step through it as well. Same gap the clock walk handles in drivingExprOf.
    if (am.getDrivers(vs).empty()) {
        if (vs.getInitializer()) {
            std::string f;
            int ln = 0;
            try {
                f = p_->sm->getFullPath(vs.location.buffer()).string();
                ln = static_cast<int>(p_->sm->getLineNumber(vs.location));
            } catch (...) { f.clear(); }
            if (ln > 0) {
                DriverSourceInfo s;
                s.kind = "logic";
                s.id = "logic:" + scopeId + ":" + f + ":" + std::to_string(ln);   // per-INSTANCE id
                s.label = "wire";        // the declaration, not a separate `assign`
                s.detail = "wire";
                s.shape = exprShape(*vs.getInitializer());
                if (!s.shape.empty()) s.reads = gateReads(vs, netName);
                s.net = netName;
                s.file = f;
                s.line = ln;
                s.bus = bus;
                p_->logicBlocks[s.id] = {&vs, scopeId};
                if (!seen.count(s.id)) { seen.insert(s.id); out.push_back(std::move(s)); }
            }
            return;
        }
        // No initializer either: on a NON-REPRESENTATIVE instance zero drivers is the normal
        // analysis answer, not proof of an undriven net — classify from this instance's AST.
        // This is what made "trace 不动": fan-in through any module instantiated more than
        // once came back empty for every instance except the analysed one.
        //
        // Case 1: the net IS an input port. The analysis path reports these via
        // d->isInputPort(); structurally the port declaration itself is the source.
        {
            const Scope* sc = vs.getParentScope();
            while (sc && sc->asSymbol().kind != SK::InstanceBody) sc = sc->asSymbol().getParentScope();
            if (sc)
                for (const Symbol& m : sc->members()) {
                    if (m.kind != SK::Port) continue;
                    const auto& ps = m.as<PortSymbol>();
                    if (ps.name != vs.name || ps.direction != ArgumentDirection::In) continue;
                    DriverSourceInfo s;
                    s.kind = "port";
                    s.id = "port:" + scopeId + "." + netName;
                    s.label = netName;
                    s.detail = "input port";
                    s.net = netName;
                    s.bus = bus;
                    try {
                        s.file = p_->sm->getFullPath(ps.location.buffer()).string();
                        s.line = static_cast<int>(p_->sm->getLineNumber(ps.location));
                    } catch (...) {}
                    if (!seen.count(s.id)) { seen.insert(s.id); out.push_back(std::move(s)); }
                    return;
                }
        }
        // Case 2: written by statements in this body.
        const StructDrivers sd = structuralDriversOf(vs);
        auto emit = [&](const Symbol& blk, const char* label, const char* shape = "") {
            std::string f;
            int ln = 0;
            try {
                f = p_->sm->getFullPath(blk.location.buffer()).string();
                ln = static_cast<int>(p_->sm->getLineNumber(blk.location));
            } catch (...) { f.clear(); }
            if (ln <= 0) return;
            DriverSourceInfo s;
            s.kind = "logic";
            s.id = "logic:" + scopeId + ":" + f + ":" + std::to_string(ln);   // per-INSTANCE id
            s.label = label;
            s.detail = label;
            s.shape = shape;
            if (!s.shape.empty()) s.reads = gateReads(blk, netName);
            s.net = netName;
            s.file = f;
            s.line = ln;
            s.bus = bus;
            p_->logicBlocks[s.id] = {&blk, scopeId};
            if (!seen.count(s.id)) { seen.insert(s.id); out.push_back(std::move(s)); }
        };
        for (const ContinuousAssignSymbol* ca : sd.assigns) emit(*ca, "assign", assignShape(*ca));
        for (const ProceduralBlockSymbol* pb : sd.procs)
            emit(*pb, pb->procedureKind == ProceduralBlockKind::AlwaysFF ? "always_ff" : "always");
        emitInstOuts();
        return;
    }

    for (auto& [d, range] : am.getDrivers(vs)) {
        const Symbol* cs = d->containingSymbol;
        if (cs->kind == SK::Instance) continue;  // structural driver -> the port-connection scan's job

        slang::SourceRange sr = d->getSourceRange();
        std::string f;
        try {
            f = p_->sm->getFullPath(sr.start().buffer()).string();
        } catch (...) {
            f.clear();
        }
        int ln = static_cast<int>(p_->sm->getLineNumber(sr.start()));

        DriverSourceInfo s;
        s.file = f;
        s.line = ln;
        s.bus = bus;
        s.net = netName;   // which signal this source drives (see DriverSourceInfo::net)
        if (d->isInputPort()) {
            s.kind = "port";
            s.id = "port:" + scopeId + "." + netName;
            s.label = netName;
            s.detail = "input port";
        } else {
            std::string detail =
                (d->kind == slang::analysis::DriverKind::Continuous) ? "assign" : srcLabel(d->source);
            s.kind = "logic";
            s.id = "logic:" + scopeId + ":" + f + ":" + std::to_string(ln);   // per-INSTANCE id
            s.label = detail;
            s.detail = detail;
            if (cs->kind == SK::ContinuousAssign) {
                s.shape = assignShape(cs->as<ContinuousAssignSymbol>());
                if (!s.shape.empty()) s.reads = gateReads(*cs, netName);
            }
            p_->logicBlocks[s.id] = {cs, scopeId};  // remember for traceLogic (trace-through)
        }
        if (!seen.count(s.id)) {
            seen.insert(s.id);
            out.push_back(std::move(s));
        }
    }
    // The loop above skips instance drivers ("the port-connection scan's job") — right for the
    // schematic's structural edges, wrong for trace-logic/trace-net which have no such scan.
    emitInstOuts();
}

TraceIntoResult DesignDb::traceInto(const std::string& nodeId, const std::string& port) {
    TraceIntoResult r;
    ensureRegistered(nodeId, /*expandSelf*/ false);
    auto it = p_->inst.find(nodeId);
    if (it == p_->inst.end() || !isRealInstance(*it->second)) return r;
    const InstanceBodySymbol& body = it->second->as<InstanceSymbol>().body;

    // boundary port -> its INTERNAL net: the bridge into self.body (spec §1, Netlist.cpp:79)
    const PortSymbol* bp = nullptr;
    for (const Symbol* p : body.getPortList())
        if (p->kind == SK::Port && p->name == port) {
            bp = &p->as<PortSymbol>();
            break;
        }
    if (!bp || !bp->internalSymbol) return r;
    const Symbol* net = bp->internalSymbol;

    std::string dir = dirStr(bp->direction);
    bool wantDrivers = (dir == "out" || dir == "inout");
    bool wantLoads = (dir == "in" || dir == "inout");

    const auto* vs = net->as_if<ValueSymbol>();
    bool bus = vs && vs->getType().getBitWidth() > 1;
    r.netName = std::string(net->name);
    r.bus = bus;

    std::vector<const Symbol*> kids;
    collectChildren(body, kids);  // descends generate blocks, like extractLocalNetlist
    std::set<std::string> seen;
    for (const Symbol* k : kids) {
        if (!isRealInstance(*k)) continue;
        const auto& ci = k->as<InstanceSymbol>();
        for (auto* pc : ci.getPortConnections()) {
            const Symbol& p = pc->port;
            if (p.kind != SK::Port || connNet(pc) != net) continue;
            std::string cdir = dirStr(p.as<PortSymbol>().direction);
            std::string cid = ci.getHierarchicalPath();
            TraceEdge e;
            e.netName = r.netName;
            e.bus = bus;
            if (wantDrivers && cdir == "out") {
                e.fromNode = cid;
                e.fromPort = std::string(p.name);
                e.toNode = nodeId;
                e.toPort = port;
            } else if (wantLoads && cdir == "in") {
                e.fromNode = nodeId;
                e.fromPort = port;
                e.toNode = cid;
                e.toPort = std::string(p.name);
            } else {
                continue;
            }
            r.edges.push_back(std::move(e));
            if (!seen.count(cid)) {
                seen.insert(cid);
                p_->registerSym(ci);
                r.nodes.push_back(p_->metaOf(ci));
            }
        }
    }

    // out pin with no structural (child-instance) driver -> behavioral sources (spec §2.2)
    bool hasDriverEdge = std::any_of(r.edges.begin(), r.edges.end(),
                                     [&](const TraceEdge& e) { return e.toNode == nodeId; });
    if (wantDrivers && !hasDriverEdge && vs) collectBehavioralSources(*vs, nodeId, bus, r.sources);
    // in pin with no structural (child-instance) LOAD -> behavioral readers: pure-RTL modules
    // consume their inputs in always/assign statements, and without this every such pin
    // dead-ended even though slang has the full answer (deadend sweep category "into:in-empty").
    bool hasLoadEdge = std::any_of(r.edges.begin(), r.edges.end(),
                                   [&](const TraceEdge& e) { return e.fromNode == nodeId; });
    if (wantLoads && !hasLoadEdge && vs) {
        for (const Symbol* blk : structuralReadersOf(*vs)) {
            std::string f;
            int ln = 0;
            try {
                f = p_->sm->getFullPath(blk->location.buffer()).string();
                ln = static_cast<int>(p_->sm->getLineNumber(blk->location));
            } catch (...) { continue; }
            if (ln <= 0) continue;
            DriverSourceInfo s;
            s.kind = "logic";
            s.id = "logic:" + nodeId + ":" + f + ":" + std::to_string(ln);
            if (blk->kind == SK::ContinuousAssign) {
                s.label = "assign";
                s.shape = assignShape(blk->as<ContinuousAssignSymbol>());
                if (!s.shape.empty()) s.reads = gateReads(*blk, "");
            } else if (blk->kind == SK::ProceduralBlock) {
                s.label = blk->as<ProceduralBlockSymbol>().procedureKind == ProceduralBlockKind::AlwaysFF
                          ? "always_ff" : "always";
            } else {   // Net/Variable: a `wire y = expr;` reader
                s.label = "wire";
                if (const Expression* init = blk->as<ValueSymbol>().getInitializer()) {
                    s.shape = exprShape(*init);
                    if (!s.shape.empty()) s.reads = gateReads(*blk, "");
                }
            }
            s.detail = s.label;
            s.net = r.netName;
            s.file = f;
            s.line = ln;
            s.bus = bus;
            p_->logicBlocks[s.id] = {blk, nodeId};
            r.sources.push_back(std::move(s));
        }
    }
    return r;
}

// ---- L4 get-sequential: edge-triggered procedural blocks (flops) ---------------------------

namespace {

std::string edgeStr(EdgeKind e) {
    switch (e) {
        case EdgeKind::PosEdge: return "posedge";
        case EdgeKind::NegEdge: return "negedge";
        case EdgeKind::BothEdges: return "both";
        case EdgeKind::None: return "none";
    }
    return "none";
}

// Collect every value symbol referenced in an expression, descending !/~ and &&/||/== etc.
// At a leaf, getSymbolReference() resolves through conversions and member/element selects.
void collectSyms(const Expression& e, std::set<const Symbol*>& out) {
    switch (e.kind) {
        case ExpressionKind::UnaryOp:
            collectSyms(e.as<UnaryExpression>().operand(), out);
            return;
        case ExpressionKind::BinaryOp: {
            const auto& b = e.as<BinaryExpression>();
            collectSyms(b.left(), out);
            collectSyms(b.right(), out);
            return;
        }
        default:
            break;
    }
    if (const Symbol* s = e.getSymbolReference()) out.insert(s);
}

// Find the first conditional inside a procedural body (the async-reset `if`), unwrapping
// timing/begin-end/statement-list wrappers and scanning a block for its leading `if`.
const ConditionalStatement* findLeadingCond(const Statement* s) {
    if (!s) return nullptr;
    switch (s->kind) {
        case StatementKind::Conditional: return &s->as<ConditionalStatement>();
        case StatementKind::Timed: return findLeadingCond(&s->as<TimedStatement>().stmt);
        case StatementKind::Block: return findLeadingCond(&s->as<BlockStatement>().body);
        case StatementKind::List:
            for (auto* it : s->as<StatementList>().list)
                if (const ConditionalStatement* c = findLeadingCond(it)) return c;
            return nullptr;
        default:
            return nullptr;
    }
}

// Procedural blocks directly in a scope, descending instantiated generate blocks/arrays.
void collectProcBlocks(const Scope& scope, std::vector<const ProceduralBlockSymbol*>& out) {
    for (const Symbol& m : scope.members()) {
        switch (m.kind) {
            case SK::ProceduralBlock:
                out.push_back(&m.as<ProceduralBlockSymbol>());
                break;
            case SK::GenerateBlock: {
                auto& gb = m.as<GenerateBlockSymbol>();
                if (!gb.isUninstantiated) collectProcBlocks(gb, out);
                break;
            }
            case SK::GenerateBlockArray:
                for (auto* e : m.as<GenerateBlockArraySymbol>().entries) collectProcBlocks(*e, out);
                break;
            default:
                break;
        }
    }
}

// Does this branch of the leading `if` load a NONZERO constant into the register?
// `if (!rst_n) q <= 0;` -> reset; `else if (set) q <= 8'hFF;` -> SET. Anything non-constant
// (or no assignment found) reads as reset, the conservative default.
bool branchLoadsOnes(const Statement* s) {
    if (!s) return false;
    switch (s->kind) {
        case StatementKind::Block: return branchLoadsOnes(&s->as<BlockStatement>().body);
        case StatementKind::Timed: return branchLoadsOnes(&s->as<TimedStatement>().stmt);
        case StatementKind::List:
            for (auto* it : s->as<StatementList>().list)
                if (branchLoadsOnes(it)) return true;
            return false;
        case StatementKind::ExpressionStatement: {
            const Expression& e = s->as<ExpressionStatement>().expr;
            if (e.kind != ExpressionKind::Assignment) return false;
            const Expression* r = &e.as<AssignmentExpression>().right();
            while (r->kind == ExpressionKind::Conversion)
                r = &r->as<ConversionExpression>().operand();
            if (const slang::ConstantValue* cv = r->getConstant())
                if (cv->isInteger()) {
                    try { return static_cast<bool>(cv->integer() != 0); } catch (...) { return false; }
                }
            return false;
        }
        default:
            return false;
    }
}

// One edge-triggered block -> {clock(s), async reset(s), file:line}. Returns an element with
// empty clocks+resets (caller drops it) when the block is not edge-sensitive sequential logic.
SeqElement extractSeq(const ProceduralBlockSymbol& pb, const std::string& ownerId,
                      const slang::SourceManager& sm, const InstanceSymbol* ownerSym) {
    SeqElement el;
    el.ownerInstanceId = ownerId;
    el.ownerSym = ownerSym;
    try {
        el.file = sm.getFullPath(pb.location.buffer()).string();
    } catch (...) {
    }
    el.line = static_cast<int>(sm.getLineNumber(pb.location));

    ProceduralBlockKind pk = pb.procedureKind;
    if (pk != ProceduralBlockKind::AlwaysFF && pk != ProceduralBlockKind::Always) return el;

    const Statement& body = pb.getBody();
    if (body.kind != StatementKind::Timed) return el;  // always with no timing -> not a flop
    const auto& ts = body.as<TimedStatement>();
    const TimingControl& tc = ts.timing;

    struct Ev {
        const Symbol* sym;
        std::string net, edge;
    };
    std::vector<Ev> events;
    auto addEvent = [&](const SignalEventControl& sec) {
        if (sec.edge == EdgeKind::None) return;  // level-sensitive -> combinational
        if (const Symbol* sym = sec.expr.getSymbolReference())
            events.push_back({sym, std::string(sym->name), edgeStr(sec.edge)});
    };
    if (tc.kind == TimingControlKind::SignalEvent)
        addEvent(tc.as<SignalEventControl>());
    else if (tc.kind == TimingControlKind::EventList)
        for (auto* ev : tc.as<EventListControl>().events)
            if (ev->kind == TimingControlKind::SignalEvent) addEvent(ev->as<SignalEventControl>());
    if (events.empty()) return el;  // e.g. always @(*) -> combinational

    // async reset/set = edge signals referenced in the leading `if` chain. The WHOLE else-if
    // chain: `if (!rst_n) … else if (set) …` — the second level is as asynchronous as the
    // first (it was previously read as a clock), and per level we record whether the branch
    // loads ONES, which is what makes it a SET pin rather than a reset.
    std::set<const Symbol*> resetSyms;
    std::map<const Symbol*, bool> loadsOnes;
    {
        int guard = 0;
        const ConditionalStatement* c = findLeadingCond(&ts.stmt);
        while (c && ++guard <= 8) {
            std::set<const Symbol*> syms;
            for (auto& cond : c->conditions) collectSyms(*cond.expr, syms);
            const bool ones = branchLoadsOnes(&c->ifTrue);
            for (const Symbol* sy : syms) {
                resetSyms.insert(sy);
                loadsOnes.emplace(sy, ones);   // first (outermost) test wins
            }
            c = c->ifFalse ? findLeadingCond(c->ifFalse) : nullptr;
        }
    }

    for (auto& e : events) {
        if (resetSyms.count(e.sym)) {
            const auto lo = loadsOnes.find(e.sym);
            el.asyncResets.push_back(SeqEvent{e.net, e.edge, lo != loadsOnes.end() && lo->second});
        } else {
            el.clocks.push_back(SeqEvent{e.net, e.edge});
        }
    }
    return el;
}

// Register BITS a sequential block infers (sum of written packed-variable widths, unpacked
// arrays excluded — those are memories). Defined below AssignTargetVisitor.
int seqBlockBits(const ProceduralBlockSymbol& pb);

void walkSeq(const InstanceSymbol& inst, const slang::SourceManager& sm,
             std::vector<SeqElement>& out) {
    std::string ownerId = inst.getHierarchicalPath();
    std::vector<const ProceduralBlockSymbol*> blocks;
    collectProcBlocks(inst.body, blocks);
    for (auto* pb : blocks) {
        SeqElement el = extractSeq(*pb, ownerId, sm, &inst);
        el.bits = seqBlockBits(*pb);
        if (!el.clocks.empty() || !el.asyncResets.empty()) out.push_back(std::move(el));
    }
    std::vector<const Symbol*> kids;
    collectChildren(inst.body, kids);
    for (auto* k : kids)
        if (isRealInstance(*k)) walkSeq(k->as<InstanceSymbol>(), sm, out);
}

// ---- L4b get-register-count: per-instance flop bit count ------------------------------------

// Base ValueSymbol(s) targeted by an assignment LHS, counting the full declared width of each
// (partial writes count the whole variable per the spec convention). All prefix wrappers --
// concatenation, member-access, element-select, range-select -- recurse to the base variable;
// getSymbolReference is only the leaf fallback. This matters because member-access (x.a) and
// select-of-member (x.a[1]) resolve via getSymbolReference to the struct type's SHARED
// FieldSymbol, which would collide across distinct variables of the same struct type.
// Known limitation: streaming-concatenation LHS ({>>{...}} <= ...; ExpressionKind::Streaming)
// is NOT counted -- rare, accepted.
void collectLhsTargets(const Expression& lhs, std::set<const ValueSymbol*>& out) {
    switch (lhs.kind) {
        case ExpressionKind::Concatenation:
            for (const Expression* op : lhs.as<ConcatenationExpression>().operands())
                collectLhsTargets(*op, out);
            return;
        case ExpressionKind::MemberAccess:
            collectLhsTargets(lhs.as<MemberAccessExpression>().value(), out);  // -> base var
            return;
        case ExpressionKind::ElementSelect:
            collectLhsTargets(lhs.as<ElementSelectExpression>().value(), out);
            return;
        case ExpressionKind::RangeSelect:
            collectLhsTargets(lhs.as<RangeSelectExpression>().value(), out);
            return;
        default:
            if (const Symbol* s = lhs.getSymbolReference())
                if (const auto* vs = s->as_if<ValueSymbol>()) out.insert(vs);
            return;
    }
}

// Visits every assignment under a statement, collecting LHS target symbols.
struct AssignTargetVisitor
    : public ASTVisitor<AssignTargetVisitor, VisitFlags::Statements | VisitFlags::Expressions> {
    std::set<const ValueSymbol*>& out;
    explicit AssignTargetVisitor(std::set<const ValueSymbol*>& o) : out(o) {}
    void handle(const AssignmentExpression& e) {
        collectLhsTargets(e.left(), out);
        visitDefault(e);
    }
    // x++ / x-- / ++x / --x are UnaryExpressions, not AssignmentExpressions, but write x.
    void handle(const UnaryExpression& e) {
        switch (e.op) {
            case UnaryOperator::Preincrement:
            case UnaryOperator::Predecrement:
            case UnaryOperator::Postincrement:
            case UnaryOperator::Postdecrement:
                collectLhsTargets(e.operand(), out);
                break;
            default:
                break;
        }
        visitDefault(e);
    }
};

// True if a procedural block is edge-triggered sequential logic (a flop). Mirrors extractSeq.
bool isEdgeTriggered(const ProceduralBlockSymbol& pb) {
    ProceduralBlockKind pk = pb.procedureKind;
    if (pk != ProceduralBlockKind::AlwaysFF && pk != ProceduralBlockKind::Always) return false;
    const Statement& body = pb.getBody();
    if (body.kind != StatementKind::Timed) return false;
    const TimingControl& tc = body.as<TimedStatement>().timing;
    auto edgy = [](const SignalEventControl& s) { return s.edge != EdgeKind::None; };
    if (tc.kind == TimingControlKind::SignalEvent) return edgy(tc.as<SignalEventControl>());
    if (tc.kind == TimingControlKind::EventList)
        for (auto* ev : tc.as<EventListControl>().events)
            if (ev->kind == TimingControlKind::SignalEvent && edgy(ev->as<SignalEventControl>()))
                return true;
    return false;
}

// own flop bits (packed vars) + memory bits (unpacked arrays) directly in one instance body.
int seqBlockBits(const ProceduralBlockSymbol& pb) {
    std::set<const ValueSymbol*> targets;
    AssignTargetVisitor v(targets);
    pb.getBody().visit(v);
    int bits = 0;
    for (const ValueSymbol* vs : targets) {
        const Type& t = vs->getType();
        if (!t.isUnpackedArray()) bits += static_cast<int>(t.getBitWidth());
    }
    return bits > 0 ? bits : 1;
}

// How many register / memory bits an instance declares DIRECTLY in its own body.
//
// The answer depends only on the BODY, never on where the instance sits, so all instances of the
// same module with the same parameters can share one result. slang gives every duplicate instance
// its own InstanceBodySymbol but records the shared original in getCanonicalBody() — exactly, per
// its own docs, "to avoid duplicating effort visiting this instance's body again". Keying on that
// is what makes the cache hit; keying on &inst.body (the obvious choice) hits zero times.
// Measured on the 1024-core stress SoC: 4950 of regcount's 5102 ms were spent in here across
// 127,020 instances, recomputing an identical answer for all but a handful of them. For scale,
// slang elaborates that entire chip in 563 ms.
long long g_ownBitsCacheHits = 0;

void ownBitsOf(const InstanceSymbol& inst, int& ownBits, int& memBits) {
    static std::uint64_t cacheGen = ~0ull;
    // definition -> [(a body of that definition, its bit counts)]. The bucket holds one entry per
    // distinct PARAMETERISATION, which in practice is one or two, so the linear scan is trivial.
    struct Entry {
        const InstanceBodySymbol* body;
        int own, mem;
    };
    static std::unordered_map<const void*, std::vector<Entry>> cache;
    if (cacheGen != g_structGen) {
        cache.clear();
        cacheGen = g_structGen;
    }

    const InstanceBodySymbol& body = inst.body;
    auto& bucket = cache[static_cast<const void*>(&body.getDefinition())];
    for (const Entry& e : bucket) {
        // slang's own equivalence test: same definition AND same parameter values, therefore the
        // same member types and the same number of register bits.
        if (body.hasSameType(*e.body)) {
            ++g_ownBitsCacheHits;
            ownBits += e.own;
            memBits += e.mem;
            return;
        }
    }

    int own = 0, mem = 0;
    std::vector<const ProceduralBlockSymbol*> blocks;
    collectProcBlocks(inst.body, blocks);
    std::set<const ValueSymbol*> targets;
    for (auto* pb : blocks)
        if (isEdgeTriggered(*pb)) {
            AssignTargetVisitor v(targets);
            pb->getBody().visit(v);
        }
    for (const ValueSymbol* vs : targets) {
        const Type& t = vs->getType();
        if (t.isUnpackedArray()) mem += static_cast<int>(t.getBitstreamWidth());
        else own += static_cast<int>(t.getBitWidth());
    }
    bucket.push_back(Entry{&body, own, mem});
    ownBits += own;
    memBits += mem;
}

// Collects every ValueSymbol REFERENCED (read or written) under a statement/expression.
// Combined with the write set (AssignTargetVisitor), inputs = referenced − self-written.
struct ValueRefVisitor
    : public ASTVisitor<ValueRefVisitor, VisitFlags::Statements | VisitFlags::Expressions> {
    std::set<const ValueSymbol*>& out;
    explicit ValueRefVisitor(std::set<const ValueSymbol*>& o) : out(o) {}
    void handle(const NamedValueExpression& e) { out.insert(&e.symbol); visitDefault(e); }
    void handle(const HierarchicalValueExpression& e) { out.insert(&e.symbol); visitDefault(e); }
};

std::vector<std::string> exprReads(const Expression& e) {
    std::vector<std::string> out;
    std::set<const ValueSymbol*> refs;
    ValueRefVisitor v(refs);
    e.visit(v);
    for (const ValueSymbol* r : refs) out.emplace_back(r->name);
    std::sort(out.begin(), out.end());
    return out;
}

std::vector<std::string> gateReads(const Symbol& blk, std::string_view ownNet) {
    std::vector<std::string> out;
    const Expression* rhs = nullptr;
    if (blk.kind == SK::ContinuousAssign) {
        const Expression& asn = blk.as<ContinuousAssignSymbol>().getAssignment();
        if (asn.kind == ExpressionKind::Assignment)
            rhs = &asn.as<AssignmentExpression>().right();
    } else if (blk.kind == SK::Net || blk.kind == SK::Variable) {
        rhs = blk.as<ValueSymbol>().getInitializer();
    }
    if (!rhs) return out;
    std::set<const ValueSymbol*> refs;
    ValueRefVisitor v(refs);
    rhs->visit(v);
    for (const ValueSymbol* r : refs)
        if (r->name != ownNet) out.emplace_back(r->name);
    std::sort(out.begin(), out.end());   // pointer-set order is unstable across runs
    return out;
}


// HDL_PROF=1 splits a whole-design walk into its per-instance ingredients. Kept in the tree
// because "which of these three costs 40 us per instance" is a question that recurs every time
// the design gets bigger, and guessing it wrong wastes a day.
struct WalkProf {
    bool on = false;
    long long instances = 0, ownHits = 0;
    double nsPath = 0, nsOwn = 0, nsKids = 0;
    WalkProf() {
        const char* e = std::getenv("HDL_PROF");
        on = e && *e && *e != '0';
    }
    void report(const char* what) const {
        if (!on) return;
        std::fprintf(stderr,
                     "  [prof] %s: %lld instances | path %.0f ms | ownBits %.0f ms (%lld cached) "
                     "| children %.0f ms\n",
                     what, instances, nsPath / 1e6, nsOwn / 1e6, ownHits, nsKids / 1e6);
    }
};
WalkProf g_walkProf;

// Post-order walk: append each instance's RegCount, backfill subtree = own + child subtrees.
int walkReg(const InstanceSymbol& inst, std::vector<RegCount>& out) {
    using clk = std::chrono::steady_clock;
    const bool prof = g_walkProf.on;
    auto t0 = prof ? clk::now() : clk::time_point{};

    RegCount rc;
    rc.instanceId = inst.getHierarchicalPath();
    auto t1 = prof ? clk::now() : clk::time_point{};
    ownBitsOf(inst, rc.own, rc.memoryBits);
    auto t2 = prof ? clk::now() : clk::time_point{};

    size_t idx = out.size();
    out.push_back(rc);
    int subtree = out[idx].own;
    std::vector<const Symbol*> kids;
    collectChildren(inst.body, kids);
    auto t3 = prof ? clk::now() : clk::time_point{};
    if (prof) {
        ++g_walkProf.instances;
        g_walkProf.nsPath += std::chrono::duration<double, std::nano>(t1 - t0).count();
        g_walkProf.nsOwn += std::chrono::duration<double, std::nano>(t2 - t1).count();
        g_walkProf.nsKids += std::chrono::duration<double, std::nano>(t3 - t2).count();
    }

    for (auto* k : kids)
        if (isRealInstance(*k)) subtree += walkReg(k->as<InstanceSymbol>(), out);
    out[idx].subtree = subtree;
    return subtree;
}

// See the declaration next to collectBehavioralSources for why this exists. Climbs to the
// enclosing instance body and walks it (through generate blocks) for every statement that
// writes `net` — continuous assigns by LHS target, procedural blocks by their write set.
// The whole body's writer map is built ONCE and cached: nets at a big top level would
// otherwise each rescan the entire top body (measured: first analysis on the 64-core stress
// SoC went 115 -> 299 ms before this cache).
StructDrivers structuralDriversOf(const ValueSymbol& net) {
    const Scope* sc = net.getParentScope();
    while (sc && sc->asSymbol().kind != SK::InstanceBody) sc = sc->asSymbol().getParentScope();
    if (!sc) return {};

    static std::uint64_t cacheGen = ~0ull;
    static std::map<const Scope*, std::map<const ValueSymbol*, StructDrivers>> cache;
    if (cacheGen != g_structGen) { cache.clear(); cacheGen = g_structGen; }
    auto hit = cache.find(sc);
    if (hit == cache.end()) {
        std::map<const ValueSymbol*, StructDrivers> writers;
        // `.o(net)` — a child's output drives `net` in this body. The connection expression for
        // an output port is the external lvalue (possibly wrapped in an assignment); collect
        // the value symbols it names as write targets.
        const auto scanInstOuts = [&writers](const InstanceSymbol& ci) {
            for (const auto* pc : ci.getPortConnections()) {
                if (pc->port.kind != SK::Port) continue;
                if (pc->port.as<PortSymbol>().direction != ArgumentDirection::Out) continue;
                const Expression* ex = pc->getExpression();
                if (!ex) continue;
                std::set<const ValueSymbol*> t;
                if (ex->kind == ExpressionKind::Assignment)
                    collectLhsTargets(ex->as<AssignmentExpression>().left(), t);
                else
                    collectLhsTargets(*ex, t);
                for (const ValueSymbol* v : t)
                    writers[v].instOuts.emplace_back(&ci, &pc->port.as<PortSymbol>());
            }
        };
        const std::function<void(const Scope&)> walk = [&](const Scope& scope) {
            for (const Symbol& m : scope.members()) {
                switch (m.kind) {
                    case SK::ContinuousAssign: {
                        const auto& ca = m.as<ContinuousAssignSymbol>();
                        const Expression& asn = ca.getAssignment();
                        if (asn.kind != ExpressionKind::Assignment) break;
                        std::set<const ValueSymbol*> t;
                        collectLhsTargets(asn.as<AssignmentExpression>().left(), t);
                        for (const ValueSymbol* v : t) writers[v].assigns.push_back(&ca);
                        break;
                    }
                    case SK::ProceduralBlock: {
                        const auto& pb = m.as<ProceduralBlockSymbol>();
                        std::set<const ValueSymbol*> w;
                        AssignTargetVisitor v(w);
                        pb.getBody().visit(v);
                        for (const ValueSymbol* x : w) writers[x].procs.push_back(&pb);
                        break;
                    }
                    case SK::Instance:
                        scanInstOuts(m.as<InstanceSymbol>());
                        break;
                    case SK::InstanceArray:
                        for (const Symbol* e : m.as<InstanceArraySymbol>().elements)
                            if (e && e->kind == SK::Instance) scanInstOuts(e->as<InstanceSymbol>());
                        break;
                    case SK::GenerateBlock: {
                        const auto& gb = m.as<GenerateBlockSymbol>();
                        if (!gb.isUninstantiated) walk(gb);
                        break;
                    }
                    case SK::GenerateBlockArray:
                        for (auto* e : m.as<GenerateBlockArraySymbol>().entries) walk(*e);
                        break;
                    default:
                        break;
                }
            }
        };
        walk(*sc);
        hit = cache.emplace(sc, std::move(writers)).first;
    }
    auto w = hit->second.find(&net);
    return w != hit->second.end() ? w->second : StructDrivers{};
}

std::vector<const Symbol*> structuralReadersOf(const ValueSymbol& net) {
    const Scope* sc = net.getParentScope();
    while (sc && sc->asSymbol().kind != SK::InstanceBody) sc = sc->asSymbol().getParentScope();
    if (!sc) return {};

    static std::uint64_t cacheGen = ~0ull;
    static std::map<const Scope*, std::map<const ValueSymbol*, std::vector<const Symbol*>>> cache;
    if (cacheGen != g_structGen) { cache.clear(); cacheGen = g_structGen; }
    auto hit = cache.find(sc);
    if (hit == cache.end()) {
        std::map<const ValueSymbol*, std::vector<const Symbol*>> readers;
        const std::function<void(const Scope&)> walk = [&](const Scope& scope) {
            for (const Symbol& m : scope.members()) {
                switch (m.kind) {
                    case SK::ContinuousAssign: {
                        const auto& ca = m.as<ContinuousAssignSymbol>();
                        const Expression& asn = ca.getAssignment();
                        if (asn.kind != ExpressionKind::Assignment) break;
                        std::set<const ValueSymbol*> rd;
                        ValueRefVisitor v(rd);
                        asn.as<AssignmentExpression>().right().visit(v);
                        for (const ValueSymbol* x : rd) readers[x].push_back(&ca);
                        break;
                    }
                    case SK::ProceduralBlock: {
                        const auto& pb = m.as<ProceduralBlockSymbol>();
                        std::set<const ValueSymbol*> rd, wr;
                        ValueRefVisitor rv(rd);       pb.getBody().visit(rv);
                        AssignTargetVisitor wv(wr);   pb.getBody().visit(wv);
                        for (const ValueSymbol* x : rd)
                            if (!wr.count(x)) readers[x].push_back(&pb);   // reads, not self-writes
                        break;
                    }
                    case SK::Net:
                    case SK::Variable: {
                        // `wire y = expr;` READS everything in expr — openMSP430 is written
                        // almost entirely in this style, and skipping initializers left every
                        // such input "unread" (147 into:in-empty pins on the real design).
                        if (const Expression* init = m.as<ValueSymbol>().getInitializer()) {
                            std::set<const ValueSymbol*> rd;
                            ValueRefVisitor rv(rd);
                            init->visit(rv);
                            for (const ValueSymbol* x : rd) readers[x].push_back(&m);
                        }
                        break;
                    }
                    case SK::GenerateBlock: {
                        const auto& gb = m.as<GenerateBlockSymbol>();
                        if (!gb.isUninstantiated) walk(gb);
                        break;
                    }
                    case SK::GenerateBlockArray:
                        for (auto* e : m.as<GenerateBlockArraySymbol>().entries) walk(*e);
                        break;
                    default:
                        break;
                }
            }
        };
        walk(*sc);
        hit = cache.emplace(sc, std::move(readers)).first;
    }
    auto r = hit->second.find(&net);
    return r != hit->second.end() ? r->second : std::vector<const Symbol*>{};
}

}  // namespace

const std::vector<SeqElement>& DesignDb::getSequential() {
    // Enumerating flops walks the WHOLE elaborated design — O(design size), 250 ms on the 64-core
    // stress SoC, i.e. as expensive as the entire clock walk. The elaboration is immutable once
    // compiled, so this is computed once per daemon session. It also stops copying the vector
    // (18 000+ elements) on every query, which the by-value signature used to do.
    if (!p_->seqCache) {
        std::vector<SeqElement> out;
        for (auto* t : p_->comp->getRoot().topInstances) walkSeq(*t, *p_->sm, out);
        p_->seqCache = std::move(out);
    }
    return *p_->seqCache;
}

// ---- P2: decompose a behavioral block into RTL primitives ----------------------------------

namespace {

// Symbolic value of each written variable during the walk: symbol -> ref ("cell:cN"/"sig:x"/"const:v").
using Env = std::map<const ValueSymbol*, std::string>;

// Builds the cell netlist for ONE block. Every expression lowers to a ref, so leaves (signals,
// constants) stay refs and only real operators become cells (matches RTLvision's logic view).
struct Decomposer {
    DecomposeResult& r;
    const slang::SourceManager& sm;
    /// The decomposed block itself — anchors constant evaluation of parameter indices.
    const Symbol* blockSym = nullptr;
    int nextId = 0;
    std::set<std::string> inputSeen, outputSeen;
    // Guard against pathological expressions: stop emitting past this many cells.
    static constexpr int kMaxCells = 4000;

    Decomposer(DecomposeResult& res, const slang::SourceManager& s) : r(res), sm(s) {}

    int lineOf(const Expression& e) const {
        try { return static_cast<int>(sm.getLineNumber(e.sourceRange.start())); } catch (...) { return 0; }
    }
    /// The expression's ACTUAL source characters (`BCSCTL1[js]`, `{a, b[3:0]}`) — the user
    /// reads code, not synthesized placeholders like "[i]". Collapsed to one line, capped.
    std::string srcText(const Expression& e) const {
        try {
            const auto sr = e.sourceRange;
            if (!sr.start().valid() || !sr.end().valid() || sr.start().buffer() != sr.end().buffer())
                return {};
            const std::string_view txt = sm.getSourceText(sr.start().buffer());
            const std::size_t a = sr.start().offset(), b = sr.end().offset();
            if (b > txt.size() || a >= b) return {};
            std::string t;
            for (char c : txt.substr(a, b - a)) t += (c == '\n' || c == '\t') ? ' ' : c;
            while (t.find("  ") != std::string::npos) t.erase(t.find("  "), 1);
            if (t.size() > 22) t = t.substr(0, 19) + "...";
            return t;
        } catch (...) { return {}; }
    }
    /// Constant value of an index expression even when it is a PARAMETER/`define reference —
    /// `a[JS]` must resolve JS, not degrade to a generic [i] cell. Bound constant expressions
    /// carry their folded value (Expression::constant).
    std::string constText(const Expression& e0) const {
        const Expression* x = &e0;
        while (x->kind == ExpressionKind::Conversion) x = &x->as<ConversionExpression>().operand();
        const Expression& e = *x;
        auto render = [](const slang::ConstantValue& cv) -> std::string {
            if (!cv.isInteger() || cv.integer().hasUnknown()) return {};
            try { return cv.integer().toString(slang::LiteralBase::Decimal, false); } catch (...) { return {}; }
        };
        if (const slang::ConstantValue* cv = e.getConstant()) {
            std::string t = render(*cv);
            if (!t.empty()) return t;
        }
        // getConstant() is only pre-folded in constant contexts — evaluate explicitly so a
        // parameter/`define index (`a[BCSCTL1]`) still resolves to its value.
        if (blockSym) {
            try {
                EvalContext ctx(*blockSym);
                return render(e.eval(ctx));
            } catch (...) {}
        }
        return {};
    }
    bool full() const { return static_cast<int>(r.cells.size()) >= kMaxCells; }

    std::string sig(std::string_view name) {
        std::string n(name);
        if (!n.empty() && inputSeen.insert(n).second) r.inputs.push_back(n);
        return "sig:" + n;
    }

    std::string add(const std::string& kind, const std::string& label, std::vector<LogicPin> ins,
                    int width, int line) {
        if (full()) { r.truncated = true; return ins.empty() ? std::string("const:?") : ins[0].ref; }
        LogicCell c;
        c.id = "c" + std::to_string(nextId++);
        c.kind = kind;
        c.label = label;
        c.inputs = std::move(ins);
        c.width = width < 1 ? 1 : width;
        c.line = line;
        r.cells.push_back(std::move(c));
        return "cell:" + r.cells.back().id;
    }

    static int widthOf(const Expression& e) {
        try { return static_cast<int>(e.type->getBitWidth()); } catch (...) { return 1; }
    }

    /// Human text of a pin ref: `sig:x` -> "x", `const:5` -> "5", `cell:cN` -> "…" (a nested
    /// expression has no short name).
    static std::string refText(const std::string& ref) {
        if (ref.rfind("sig:", 0) == 0) return ref.substr(4);
        if (ref.rfind("const:", 0) == 0) return ref.substr(6);
        return "\xe2\x80\xa6";  // U+2026 HORIZONTAL ELLIPSIS
    }

    /// `{a, b[3:0], 1'b0}` for a concatenation, truncated so the symbol stays readable.
    static std::string refListLabel(const std::vector<LogicPin>& ins) {
        std::string s = "{";
        for (std::size_t i = 0; i < ins.size(); ++i) {
            if (i) s += ", ";
            if (s.size() > 44) { s += "\xe2\x80\xa6"; break; }
            s += refText(ins[i].ref);
        }
        return s + "}";
    }

    /// Name of a plain signal reference ("" when the expression is anything else) — lets a
    /// constant bit-select collapse into the signal name instead of becoming a cell.
    static std::string plainSignal(const Expression& e) {
        const Expression* x = &e;
        while (x->kind == ExpressionKind::Conversion) x = &x->as<ConversionExpression>().operand();
        if (x->kind == ExpressionKind::NamedValue || x->kind == ExpressionKind::HierarchicalValue)
            return std::string(x->as<ValueExpressionBase>().symbol.name);
        return {};
    }

    /// Plain decimal text of a constant integer expression ("" when not a literal) — used to
    /// label bit selects with their real index/range.
    static std::string intText(const Expression& e) {
        const Expression* x = &e;
        while (x->kind == ExpressionKind::Conversion) x = &x->as<ConversionExpression>().operand();
        if (x->kind != ExpressionKind::IntegerLiteral) return {};
        try {
            return x->as<IntegerLiteral>().getValue().toString(slang::LiteralBase::Decimal, false);
        } catch (...) { return {}; }
    }

    // gate/arith/cmp name for a binary operator (kind, display label)
    static std::pair<const char*, const char*> binOp(BinaryOperator op) {
        using B = BinaryOperator;
        switch (op) {
            case B::Add: return {"add", "+"};
            case B::Subtract: return {"sub", "-"};
            case B::Multiply: return {"mul", "*"};
            case B::Divide: return {"div", "/"};
            case B::Mod: return {"mod", "%"};
            case B::BinaryAnd: return {"and", "&"};
            case B::BinaryOr: return {"or", "|"};
            case B::BinaryXor: return {"xor", "^"};
            case B::BinaryXnor: return {"xnor", "~^"};
            case B::Equality: return {"eq", "=="};
            case B::Inequality: return {"neq", "!="};
            case B::CaseEquality: return {"eq", "==="};
            case B::CaseInequality: return {"neq", "!=="};
            case B::WildcardEquality: return {"eq", "==?"};
            case B::WildcardInequality: return {"neq", "!=?"};
            case B::GreaterThanEqual: return {"ge", ">="};
            case B::GreaterThan: return {"gt", ">"};
            case B::LessThanEqual: return {"le", "<="};
            case B::LessThan: return {"lt", "<"};
            case B::LogicalAnd: return {"land", "&&"};
            case B::LogicalOr: return {"lor", "||"};
            case B::LogicalImplication: return {"lor", "->"};
            case B::LogicalEquivalence: return {"eq", "<->"};
            case B::LogicalShiftLeft: return {"shl", "<<"};
            case B::LogicalShiftRight: return {"shr", ">>"};
            case B::ArithmeticShiftLeft: return {"shl", "<<<"};
            case B::ArithmeticShiftRight: return {"shr", ">>>"};
            case B::Power: return {"mul", "**"};
        }
        return {"and", "?"};
    }

    static std::pair<const char*, const char*> unOp(UnaryOperator op) {
        using U = UnaryOperator;
        switch (op) {
            case U::BitwiseNot: return {"not", "~"};
            case U::LogicalNot: return {"lnot", "!"};
            case U::BitwiseAnd: return {"rand", "&"};
            case U::BitwiseOr: return {"ror", "|"};
            case U::BitwiseXor: return {"rxor", "^"};
            case U::BitwiseNand: return {"rand", "~&"};
            case U::BitwiseNor: return {"ror", "~|"};
            case U::BitwiseXnor: return {"rxor", "~^"};
            case U::Minus: return {"sub", "-"};
            case U::Plus: return {"buf", "+"};
            default: return {"buf", "++"};
        }
    }

    /// Lower an expression to a ref. Pure leaves stay refs; operators become cells.
    std::string expr(const Expression& e) {
        using EK = ExpressionKind;
        if (full()) { r.truncated = true; return "const:?"; }
        switch (e.kind) {
            case EK::NamedValue:
            case EK::HierarchicalValue:
                return sig(e.as<ValueExpressionBase>().symbol.name);
            case EK::IntegerLiteral: {
                std::string v;
                try { v = e.as<IntegerLiteral>().getValue().toString(); } catch (...) { v = "?"; }
                return "const:" + v;
            }
            case EK::UnbasedUnsizedIntegerLiteral:
                return "const:'x";
            case EK::Conversion:   // width/sign casts are not logic — see through them
                return expr(e.as<ConversionExpression>().operand());
            case EK::Assignment:   // e.g. `a = b` used as an expression
                return expr(e.as<AssignmentExpression>().right());
            case EK::UnaryOp: {
                const auto& u = e.as<UnaryExpression>();
                auto [k, lbl] = unOp(u.op);
                std::string a = expr(u.operand());
                if (std::string(k) == "buf") return a;   // unary + is a no-op
                return add(k, lbl, {{"a", a}}, widthOf(e), lineOf(e));
            }
            case EK::BinaryOp: {
                const auto& b = e.as<BinaryExpression>();
                auto [k, lbl] = binOp(b.op);
                std::string a = expr(b.left());
                std::string c = expr(b.right());
                return add(k, lbl, {{"a", a}, {"b", c}}, widthOf(e), lineOf(e));
            }
            case EK::ConditionalOp: {
                const auto& c = e.as<ConditionalExpression>();
                std::string s = condRef(c.conditions, lineOf(e), widthOf(e));
                std::string t = expr(c.left());
                std::string f = expr(c.right());
                // MUX: s selects a(true) / b(false) — the classic RTLvision `?:` primitive
                return add("mux", "MUX", {{"s", s}, {"a", t}, {"b", f}}, widthOf(e), lineOf(e));
            }
            case EK::Concatenation: {
                // Label with the ACTUAL source characters — `{data_sync[0], 1'b0}` reads like
                // the RTL. refListLabel is only the fallback (it degrades to "{}" whenever a
                // member is itself an expression cell, which is what made the box unreadable).
                std::vector<LogicPin> ins;
                int i = 0;
                for (auto* op : e.as<ConcatenationExpression>().operands())
                    if (op) ins.push_back({"i" + std::to_string(i++), expr(*op)});
                const std::string lbl = srcText(e);
                return add("concat", lbl.empty() ? refListLabel(ins) : lbl,
                           std::move(ins), widthOf(e), lineOf(e));
            }
            case EK::Replication: {
                const auto& rp = e.as<ReplicationExpression>();
                const std::string lbl = srcText(e);
                return add("concat", lbl.empty() ? "{{}}" : lbl,
                           {{"n", expr(rp.count())}, {"i0", expr(rp.concat())}},
                           widthOf(e), lineOf(e));
            }
            case EK::ElementSelect: {
                // A CONSTANT bit select of a plain signal is not logic — it is just a name.
                // Fold it to a labelled wire instead of a cell plus a constant node. The index
                // may be a literal OR a parameter/`define — the label keeps the SOURCE
                // characters (`a[js]`) and appends the resolved value when they differ
                // (`a[js=3]`). Only a truly VARIABLE index is hardware (a mux) -> keep a cell,
                // labelled with the real source text, never a synthesized "[i]".
                const auto& s = e.as<ElementSelectExpression>();
                std::string idx = intText(s.selector());
                if (idx.empty()) {
                    const std::string cv = constText(s.selector());
                    if (!cv.empty()) {
                        std::string st = srcText(s.selector());
                        idx = st.empty() || st == cv ? cv : st + "=" + cv;
                    }
                }
                const std::string base = plainSignal(s.value());
                if (!idx.empty() && !base.empty()) return sig(base + "[" + idx + "]");
                const std::string lbl = srcText(e);
                return add("select", lbl.empty() ? (idx.empty() ? "[i]" : "[" + idx + "]") : lbl,
                           {{"a", expr(s.value())}, {"i", expr(s.selector())}},
                           widthOf(e), lineOf(e));
            }
            case EK::RangeSelect: {
                // Same for a constant range: one labelled wire, source characters kept and
                // parameter bounds resolved (`x[MSB=16:11]`).
                const auto& s = e.as<RangeSelectExpression>();
                auto bound = [&](const Expression& be) {
                    std::string t = intText(be);
                    if (t.empty()) {
                        const std::string cv = constText(be);
                        if (!cv.empty()) {
                            std::string st = srcText(be);
                            t = st.empty() || st == cv ? cv : st + "=" + cv;
                        }
                    }
                    return t;
                };
                const std::string l = bound(s.left()), rr = bound(s.right());
                const std::string base = plainSignal(s.value());
                if (!l.empty() && !rr.empty() && !base.empty())
                    return sig(base + "[" + l + ":" + rr + "]");
                const std::string lbl0 = srcText(e);
                const std::string lbl = !lbl0.empty() ? lbl0
                    : (l.empty() || rr.empty()) ? "[h:l]" : "[" + l + ":" + rr + "]";
                return add("select", lbl,
                           {{"a", expr(s.value())}, {"l", expr(s.left())}, {"r", expr(s.right())}},
                           widthOf(e), lineOf(e));
            }
            case EK::MemberAccess:
                return expr(e.as<MemberAccessExpression>().value());
            case EK::Call: {
                const auto& call = e.as<CallExpression>();
                std::vector<LogicPin> ins;
                int i = 0;
                for (auto* a : call.arguments())
                    if (a) ins.push_back({"a" + std::to_string(i++), expr(*a)});
                return add("call", std::string(call.getSubroutineName()), std::move(ins),
                           widthOf(e), lineOf(e));
            }
            default: {
                // Unmodelled expression: represent it as an opaque 1-input node over the values
                // it reads, so the cone stays connected instead of silently losing fan-in.
                std::set<const ValueSymbol*> reads;
                ValueRefVisitor rv(reads);
                e.visit(rv);
                std::vector<LogicPin> ins;
                int i = 0;
                for (const ValueSymbol* v : reads) ins.push_back({"a" + std::to_string(i++), sig(v->name)});
                return add("call", "expr", std::move(ins), widthOf(e), lineOf(e));
            }
        }
    }

    /// AND together the conditions of an if/?: (SystemVerilog allows `cond1 &&& cond2`).
    std::string condRef(std::span<const ConditionalExpression::Condition> conds, int line, int width) {
        std::string acc;
        for (auto& c : conds) {
            std::string one = expr(*c.expr);
            acc = acc.empty() ? one : add("land", "&&", {{"a", acc}, {"b", one}}, 1, line);
        }
        (void)width;
        return acc.empty() ? "const:1" : acc;
    }
    std::string condRef(std::span<const ConditionalStatement::Condition> conds, int line) {
        std::string acc;
        for (auto& c : conds) {
            std::string one = expr(*c.expr);
            acc = acc.empty() ? one : add("land", "&&", {{"a", acc}, {"b", one}}, 1, line);
        }
        return acc.empty() ? "const:1" : acc;
    }

    /// Current value of `v` in `env`, defaulting to the variable itself (hold / feedback).
    std::string cur(const Env& env, const ValueSymbol* v) {
        auto it = env.find(v);
        return it != env.end() ? it->second : sig(v->name);
    }

    static int bitsOf(const ValueSymbol* v) {
        try { return static_cast<int>(v->getType().getBitWidth()); } catch (...) { return 1; }
    }

    /// Symbolically execute a statement, updating each written variable's next-state ref.
    void stmt(const Statement& s, Env& env) {
        if (full()) { r.truncated = true; return; }
        switch (s.kind) {
            case StatementKind::List:
                for (auto* it : s.as<StatementList>().list)
                    if (it) stmt(*it, env);
                return;
            case StatementKind::Block:
                stmt(s.as<BlockStatement>().body, env);
                return;
            case StatementKind::Timed:
                stmt(s.as<TimedStatement>().stmt, env);
                return;
            case StatementKind::ExpressionStatement: {
                const Expression& e = s.as<ExpressionStatement>().expr;
                if (e.kind != ExpressionKind::Assignment) return;
                const auto& a = e.as<AssignmentExpression>();
                std::string rhs = expr(a.right());
                std::set<const ValueSymbol*> tgts;
                collectLhsTargets(a.left(), tgts);
                for (const ValueSymbol* t : tgts) env[t] = rhs;
                return;
            }
            case StatementKind::Conditional: {
                const auto& c = s.as<ConditionalStatement>();
                int line = static_cast<int>(sm.getLineNumber(s.sourceRange.start()));
                std::string sel = condRef(c.conditions, line);
                Env tEnv = env, fEnv = env;
                stmt(c.ifTrue, tEnv);
                if (c.ifFalse) stmt(*c.ifFalse, fEnv);
                mergeBranches(env, tEnv, fEnv, sel, line);
                return;
            }
            case StatementKind::Case: {
                const auto& cs = s.as<CaseStatement>();
                int line = static_cast<int>(sm.getLineNumber(s.sourceRange.start()));
                std::string sel = expr(cs.expr);
                // Evaluate every arm, then fold them into a chain of 2:1 muxes with an eq
                // comparator per label — the standard case→mux inference.
                std::vector<std::pair<std::string, Env>> arms;   // (match ref, env after arm)
                for (auto& item : cs.items) {
                    std::string match;
                    for (auto* le : item.expressions) {
                        if (!le) continue;
                        std::string one = add("eq", "==", {{"a", sel}, {"b", expr(*le)}}, 1, line);
                        match = match.empty() ? one : add("lor", "||", {{"a", match}, {"b", one}}, 1, line);
                    }
                    Env armEnv = env;
                    stmt(*item.stmt, armEnv);
                    if (!match.empty()) arms.emplace_back(std::move(match), std::move(armEnv));
                }
                Env defEnv = env;
                if (cs.defaultCase) stmt(*cs.defaultCase, defEnv);

                // Every variable any arm writes needs a mux chain; unwritten arms hold.
                // NOTE: compare against `env` directly — calling cur() here would register a
                // spurious self-input (sig:<var>) for a variable that every arm actually drives.
                std::set<const ValueSymbol*> touched;
                auto differs = [&](const ValueSymbol* v, const std::string& ref) {
                    auto it = env.find(v);
                    return it == env.end() || it->second != ref;
                };
                for (auto& [m, e2] : arms)
                    for (auto& [v, ref] : e2) if (differs(v, ref)) touched.insert(v);
                for (auto& [v, ref] : defEnv) if (differs(v, ref)) touched.insert(v);
                for (const ValueSymbol* v : touched) {
                    std::string acc = cur(defEnv, v);                       // default / hold
                    for (auto it = arms.rbegin(); it != arms.rend(); ++it)  // last arm innermost
                        acc = add("mux", "MUX", {{"s", it->first}, {"a", cur(it->second, v)}, {"b", acc}},
                                  bitsOf(v), line);
                    env[v] = acc;
                }
                return;
            }
            default: {
                // Loops / unmodelled statements: keep fan-in honest by marking every variable
                // they write as driven by an opaque node over everything they read.
                std::set<const ValueSymbol*> writes, reads;
                AssignTargetVisitor wv(writes); s.visit(wv);
                if (writes.empty()) return;
                ValueRefVisitor rv(reads); s.visit(rv);
                std::vector<LogicPin> ins;
                int i = 0;
                for (const ValueSymbol* v : reads)
                    if (!writes.count(v)) ins.push_back({"a" + std::to_string(i++), sig(v->name)});
                int line = 0;
                try { line = static_cast<int>(sm.getLineNumber(s.sourceRange.start())); } catch (...) {}
                std::string node = add("call", "stmt", std::move(ins), 1, line);
                for (const ValueSymbol* v : writes) env[v] = node;
                r.truncated = true;
                return;
            }
        }
    }

    /// Phi-merge two branch environments behind a MUX on `sel`.
    void mergeBranches(Env& env, const Env& tEnv, const Env& fEnv, const std::string& sel, int line) {
        std::set<const ValueSymbol*> vars;
        for (auto& [v, ref] : tEnv) vars.insert(v);
        for (auto& [v, ref] : fEnv) vars.insert(v);
        for (const ValueSymbol* v : vars) {
            std::string t = cur(tEnv, v), f = cur(fEnv, v);
            if (t == f) { env[v] = t; continue; }   // both branches agree -> no mux needed
            env[v] = add("mux", "MUX", {{"s", sel}, {"a", t}, {"b", f}}, bitsOf(v), line);
        }
    }

    /// Attach `outName` to the cell behind `ref`; buffer it when the ref is a bare signal/const.
    void nameOutput(const std::string& ref, const std::string& outName, int width, int line) {
        if (outputSeen.insert(outName).second) r.outputs.push_back(outName);
        if (ref.rfind("cell:", 0) == 0) {
            const std::string id = ref.substr(5);
            for (auto& c : r.cells)
                if (c.id == id && c.outName.empty()) { c.outName = outName; return; }
        }
        LogicCell c;
        c.id = "c" + std::to_string(nextId++);
        c.kind = "buf";
        c.label = "";
        c.inputs = {{"a", ref}};
        c.outName = outName;
        c.width = width < 1 ? 1 : width;
        c.line = line;
        r.cells.push_back(std::move(c));
    }
};

/// The conditional that IS the entire body (seeing through single-statement blocks/lists);
/// nullptr otherwise. Only such a statement may be read as `if (rst) ... else <next state>` —
/// if the block does anything else too, splitting on it would silently drop that logic.
const ConditionalStatement* soleCond(const Statement* s) {
    if (!s) return nullptr;
    switch (s->kind) {
        case StatementKind::Conditional: return &s->as<ConditionalStatement>();
        case StatementKind::Block: return soleCond(&s->as<BlockStatement>().body);
        case StatementKind::List: {
            const Statement* only = nullptr;
            for (auto* it : s->as<StatementList>().list) {
                if (!it || it->kind == StatementKind::VariableDeclaration) continue;
                if (only) return nullptr;   // more than one real statement
                only = it;
            }
            return soleCond(only);
        }
        default: return nullptr;
    }
}

/// Behavioral blocks (procedural + continuous assign) directly in a scope, descending
/// instantiated generate blocks/arrays — the search space for locating a block by source line.
void collectBehavioral(const Scope& scope, std::vector<const Symbol*>& out) {
    for (const Symbol& m : scope.members()) {
        switch (m.kind) {
            case SK::ProceduralBlock:
            case SK::ContinuousAssign:
                out.push_back(&m);
                break;
            case SK::Net:
            case SK::Variable:
                // `wire x = expr;` — the declaration IS the driving statement (slang emits no
                // separate assign for it). Without this, a cold "logic:<scope>:<file>:<line>"
                // pointing at such a line resolved to NOTHING and trace-logic/decompose came
                // back empty (the exec_cycle case: only a warm same-session registry worked).
                if (m.as<ValueSymbol>().getInitializer()) out.push_back(&m);
                break;
            case SK::GenerateBlock: {
                auto& gb = m.as<GenerateBlockSymbol>();
                if (!gb.isUninstantiated) collectBehavioral(gb, out);
                break;
            }
            case SK::GenerateBlockArray:
                for (auto* e : m.as<GenerateBlockArraySymbol>().entries)
                    if (e) collectBehavioral(*e, out);
                break;
            default:
                break;
        }
    }
}

/// Resolve a "logic:<file>:<line>" id by SCANNING the elaborated tree for the block at that
/// location. The logicBlocks registry only holds ids a previous trace happened to surface, so
/// relying on it alone made decompose fail silently on a restored graph / fresh daemon session.
///
/// The id's line is NOT necessarily the block's own line: traceInto records the location of the
/// DRIVER (the assignment inside the block), e.g. `always_ff` on line 27 whose `q <= ...` sits on
/// line 28. So match any block whose source RANGE encloses the line, and keep the tightest one
/// (an inner block wins over an outer one that merely contains it).
const Symbol* findBlockAt(Compilation& comp, const slang::SourceManager& sm,
                          const std::string& file, int line) {
    const Symbol* best = nullptr;
    int bestSpan = INT_MAX;
    std::vector<const InstanceSymbol*> stack;
    for (auto* t : comp.getRoot().topInstances) stack.push_back(t);
    std::set<const InstanceBodySymbol*> seenBody;   // shared bodies: scan each definition once
    while (!stack.empty()) {
        const InstanceSymbol* inst = stack.back();
        stack.pop_back();
        if (!seenBody.insert(&inst->body).second) continue;
        std::vector<const Symbol*> blocks;
        collectBehavioral(inst->body, blocks);
        for (const Symbol* b : blocks) {
            int lo = 0, hi = 0;
            std::string f;
            try {
                f = sm.getFullPath(b->location.buffer()).string();
                lo = static_cast<int>(sm.getLineNumber(b->location));
                hi = lo;
                if (const auto* sx = b->getSyntax()) {
                    const auto range = sx->sourceRange();
                    lo = static_cast<int>(sm.getLineNumber(range.start()));
                    hi = static_cast<int>(sm.getLineNumber(range.end()));
                }
            } catch (...) { continue; }
            if (f != file || line < lo || line > hi) continue;
            const int span = hi - lo;
            if (span < bestSpan) { bestSpan = span; best = b; }
        }
        std::vector<const Symbol*> kids;
        collectChildren(inst->body, kids);
        for (auto* k : kids)
            if (isRealInstance(*k)) stack.push_back(&k->as<InstanceSymbol>());
    }
    return best;
}

const char* procKindName(ProceduralBlockKind k) {
    switch (k) {
        case ProceduralBlockKind::AlwaysComb: return "always_comb";
        case ProceduralBlockKind::AlwaysLatch: return "always_latch";
        case ProceduralBlockKind::AlwaysFF: return "always_ff";
        case ProceduralBlockKind::Always: return "always";
        default: return "initial";
    }
}

}  // namespace

DecomposeResult DesignDb::decomposeLogic(const std::string& logicId) {
    DecomposeResult r;
    const Symbol* block = nullptr;
    auto it = p_->logicBlocks.find(logicId);
    if (it != p_->logicBlocks.end()) block = it->second.first;
    if (!block) {
        // Not registered by an earlier trace — locate it by source position instead, so the
        // op works on a fresh daemon session or a restored schematic.
        // id = "logic:[<scope>:]<file>:<line>". The scope segment is the owning INSTANCE:
        // without it the id collided across instances of the same module and the registry kept
        // whichever instance traced last, so a block resolved its fan-in in an arbitrary scope
        // (the residual I7s in the sweep). A scope never contains '/', a file path always
        // does — that is how old-format ids stay parseable.
        if (logicId.rfind("logic:", 0) != 0) return r;
        std::string rest = logicId.substr(6);
        if (const std::size_t c0 = rest.find(':');
            c0 != std::string::npos && rest.substr(0, c0).find('/') == std::string::npos &&
            rest.substr(0, c0).find('\\') == std::string::npos)
            rest = rest.substr(c0 + 1);                        // drop the scope segment
        const std::size_t colon = rest.rfind(':');
        if (colon == std::string::npos || colon == 0) return r;
        const std::string file = rest.substr(0, colon);
        int line = 0;
        try { line = std::stoi(rest.substr(colon + 1)); } catch (...) { return r; }
        if (line <= 0) return r;
        block = findBlockAt(*p_->comp, *p_->sm, file, line);
    }
    if (!block) return r;

    try { r.file = p_->sm->getFullPath(block->location.buffer()).string(); } catch (...) {}
    try { r.line = static_cast<int>(p_->sm->getLineNumber(block->location)); } catch (...) {}

    Decomposer D(r, *p_->sm);
    D.blockSym = block;

    if (block->kind == SK::ContinuousAssign) {
        r.blockKind = "assign";
        const Expression& asn = block->as<ContinuousAssignSymbol>().getAssignment();
        if (asn.kind != ExpressionKind::Assignment) return r;
        const auto& a = asn.as<AssignmentExpression>();
        std::string rhs = D.expr(a.right());
        std::set<const ValueSymbol*> tgts;
        collectLhsTargets(a.left(), tgts);
        for (const ValueSymbol* t : tgts)
            D.nameOutput(rhs, std::string(t->name), Decomposer::bitsOf(t), r.line);
        return r;
    }
    if (const auto* iv = block->as_if<ValueSymbol>()) {
        // `wire x = expr;` — decompose the initializer exactly like an assign RHS.
        r.blockKind = "wire";
        if (const Expression* init = iv->getInitializer())
            D.nameOutput(D.expr(*init), std::string(iv->name), Decomposer::bitsOf(iv), r.line);
        return r;
    }
    if (block->kind != SK::ProceduralBlock) return r;

    const auto& pb = block->as<ProceduralBlockSymbol>();
    r.blockKind = procKindName(pb.procedureKind);
    const Statement* body = &pb.getBody();

    // Edge-triggered? Collect the sensitivity list exactly like extractSeq does, then split
    // clock vs async reset by whether the signal is tested in the leading `if`.
    std::vector<std::pair<std::string, std::string>> clocks, resets;  // (net, edge)
    if (body->kind == StatementKind::Timed) {
        const auto& ts = body->as<TimedStatement>();
        const TimingControl& tc = ts.timing;
        struct Ev { const Symbol* sym; std::string net, edge; };
        std::vector<Ev> events;
        auto addEvent = [&](const SignalEventControl& sec) {
            if (sec.edge == EdgeKind::None) return;
            if (const Symbol* sym = sec.expr.getSymbolReference())
                events.push_back({sym, std::string(sym->name), edgeStr(sec.edge)});
        };
        if (tc.kind == TimingControlKind::SignalEvent)
            addEvent(tc.as<SignalEventControl>());
        else if (tc.kind == TimingControlKind::EventList)
            for (auto* ev : tc.as<EventListControl>().events)
                if (ev->kind == TimingControlKind::SignalEvent) addEvent(ev->as<SignalEventControl>());

        std::set<const Symbol*> resetSyms;
        if (const ConditionalStatement* c = findLeadingCond(&ts.stmt))
            for (auto& cond : c->conditions) collectSyms(*cond.expr, resetSyms);
        for (auto& e : events)
            (resetSyms.count(e.sym) ? resets : clocks).push_back({e.net, e.edge});
        body = &ts.stmt;
    }

    const bool isFlop = !clocks.empty();
    Env env;

    // async-reset flop: `if (rst) q <= RESET; else q <= NEXT;` — the true arm is the reset
    // value, the false arm is the next state. Decompose them separately so the DFF gets both.
    Env rstEnv;
    const ConditionalStatement* rstCond =
        (isFlop && !resets.empty()) ? soleCond(body) : nullptr;
    // `if (rst) q <= 0;` with no else means "hold otherwise" — there is no next-state branch to
    // split out, so fall back to walking the whole body (yields a mux, still correct hardware).
    if (rstCond && !rstCond->ifFalse) rstCond = nullptr;
    if (rstCond) {
        Env t = env;
        D.stmt(rstCond->ifTrue, t);
        rstEnv = t;
        if (rstCond->ifFalse) D.stmt(*rstCond->ifFalse, env);
    } else {
        D.stmt(*body, env);
    }

    if (!isFlop) {
        for (auto& [v, ref] : env) D.nameOutput(ref, std::string(v->name), Decomposer::bitsOf(v), r.line);
        return r;
    }
    // Flops: every variable driven in the normal OR the reset branch gets a register.
    std::set<const ValueSymbol*> regs;
    for (auto& [v, ref] : env) regs.insert(v);
    for (auto& [v, ref] : rstEnv) regs.insert(v);
    for (const ValueSymbol* v : regs) {
        const int w = Decomposer::bitsOf(v);
        std::vector<LogicPin> pins{{"d", D.cur(env, v)}};   // absent in env -> holds its value
        if (!clocks.empty()) pins.push_back({"clk", D.sig(clocks[0].first)});
        if (!resets.empty()) {
            pins.push_back({"rst", D.sig(resets[0].first)});
            auto rv = rstEnv.find(v);
            if (rv != rstEnv.end()) pins.push_back({"rval", rv->second});
        }
        const std::string outName(v->name);
        LogicCell c;
        c.id = "c" + std::to_string(D.nextId++);
        c.kind = "dff";
        c.label = resets.empty() ? "DFF" : "DFFR";
        c.inputs = std::move(pins);
        c.outName = outName;
        c.width = w;
        c.line = r.line;
        r.cells.push_back(std::move(c));
        // outName read from the local copy — `c` is moved-from above.
        if (D.outputSeen.insert(outName).second) r.outputs.push_back(outName);
    }
    return r;
}

DriversResult DesignDb::traceLogic(const std::string& logicId) {
    DriversResult r;
    // Inline port-connection expression (`.data_in(~puc_s)`): no block symbol exists — the
    // fan-in is simply the expression's reads.
    if (auto ce = p_->connExprs.find(logicId); ce != p_->connExprs.end()) {
        std::set<const ValueSymbol*> reads;
        ValueRefVisitor rv(reads);
        ce->second.first->visit(rv);
        r.netName = "assign";
        for (const ValueSymbol* sig : reads)
            collectBehavioralSources(*sig, ce->second.second, sig->getType().getBitWidth() > 1,
                                     r.sources);
        return r;
    }
    const Symbol* block = nullptr;
    std::string scopeId;
    if (auto it = p_->logicBlocks.find(logicId); it != p_->logicBlocks.end()) {
        block = it->second.first;
        scopeId = it->second.second;
    } else {
        // Not registered in THIS session — resolve by the id itself, exactly like
        // decomposeLogic does. This is what makes trace-logic usable from a restored
        // schematic or a script: it used to silently return an empty fan-in whenever the
        // discovering trace had not run in the same session (the sweep's I7s). The id's
        // scope segment (added with the per-instance ids) supplies the owning instance,
        // so the sources are keyed to the RIGHT hierarchy even on a cold session.
        if (logicId.rfind("logic:", 0) != 0) return r;
        std::string rest = logicId.substr(6);
        if (const std::size_t c0 = rest.find(':');
            c0 != std::string::npos && rest.substr(0, c0).find('/') == std::string::npos &&
            rest.substr(0, c0).find('\\') == std::string::npos) {
            scopeId = rest.substr(0, c0);
            rest = rest.substr(c0 + 1);
        }
        const std::size_t colon = rest.rfind(':');
        if (colon == std::string::npos || colon == 0) return r;
        const std::string file = rest.substr(0, colon);
        int line = 0;
        try { line = std::stoi(rest.substr(colon + 1)); } catch (...) { return r; }
        if (line <= 0) return r;
        block = findBlockAt(*p_->comp, *p_->sm, file, line);
        if (block) p_->logicBlocks[logicId] = {block, scopeId};
    }
    if (!block) return r;

    // Enumerate the block's read inputs = all referenced value symbols − the ones it writes
    // itself (self-driven feedback isn't an external input; clk/reset/data reads are kept).
    std::set<const ValueSymbol*> reads, writes;
    std::string rhsText;   // the driving expression's source text (constant-fan-in fallback)
    const auto textOf = [this](const Expression& e) -> std::string {
        const auto sr = e.sourceRange;
        if (!sr.start().valid() || !sr.end().valid() || sr.start().buffer() != sr.end().buffer())
            return {};
        const std::string_view txt = p_->sm->getSourceText(sr.start().buffer());
        const std::size_t a = sr.start().offset(), b = sr.end().offset();
        if (b > txt.size() || a >= b) return {};
        return std::string(txt.substr(a, b - a));
    };
    if (block->kind == SK::ProceduralBlock) {
        const Statement& body = block->as<ProceduralBlockSymbol>().getBody();
        ValueRefVisitor rv(reads);      body.visit(rv);
        AssignTargetVisitor wv(writes); body.visit(wv);
        r.netName = srcLabel(/*best-effort*/ slang::analysis::DriverSource::Always);
    } else if (block->kind == SK::ContinuousAssign) {
        const Expression& asn = block->as<ContinuousAssignSymbol>().getAssignment();
        if (asn.kind == ExpressionKind::Assignment) {
            const auto& a = asn.as<AssignmentExpression>();
            ValueRefVisitor rv(reads); a.right().visit(rv);
            collectLhsTargets(a.left(), writes);
            rhsText = textOf(a.right());
        }
        // netName = the DRIVEN net, not the literal word "assign" — the GUI labels the
        // driver's pin with this, and "assign" on a clock pin read as a phantom signal.
        r.netName = writes.empty() ? "assign" : std::string((*writes.begin())->name);
    } else if (const auto* iv = block->as_if<ValueSymbol>()) {
        // `wire x = expr;` registered by collectBehavioralSources — the declaration's
        // initializer is the driving expression, so its reads are this node's fan-in.
        const Expression* init = iv->getInitializer();
        if (!init) return r;
        ValueRefVisitor rv(reads); init->visit(rv);
        writes.insert(iv);
        rhsText = textOf(*init);
        r.netName = std::string(iv->name);
    } else {
        return r;
    }
    for (const ValueSymbol* w : writes) reads.erase(w);

    // Each input signal's drivers (port / other logic / constant) become the fan-in sources.
    for (const ValueSymbol* sig : reads) {
        bool bus = sig->getType().getBitWidth() > 1;
        collectBehavioralSources(*sig, scopeId, bus, r.sources);
    }
    if (r.sources.empty() && reads.empty() && !rhsText.empty()) {
        // No signal reads at all: `= 1'b1`, `= INST_NR` — a CONSTANT block. Answer with the
        // literal itself instead of an empty list, so the schematic shows why there is no
        // fan-in rather than presenting a dead end indistinguishable from a broken trace.
        std::string t;
        for (char c : rhsText) t += (c == '\n' || c == '\t') ? ' ' : c;   // one line
        while (!t.empty() && t.front() == ' ') t.erase(t.begin());
        while (!t.empty() && t.back() == ' ') t.pop_back();
        if (t.size() > 24) t = t.substr(0, 21) + "...";
        DriverSourceInfo s;
        s.kind = "constant";
        s.id = "const:" + logicId;
        s.label = t;
        s.detail = "constant";
        s.net = t;
        r.sources.push_back(std::move(s));
    }
    return r;
}

RegCountResult DesignDb::getRegisterCounts() {
    RegCountResult res;
    for (auto* t : p_->comp->getRoot().topInstances)
        res.total += walkReg(*t, res.counts);
    g_walkProf.ownHits = g_ownBitsCacheHits;
    g_walkProf.report("regcount");
    return res;
}

// ---- DFT-DRC reverse reachability: net -> primary input ------------------------------------

namespace {

// The enclosing instance of `I` (climbs out of generate blocks); nullptr if `I` is a top.
const InstanceSymbol* parentInstanceOf(const InstanceSymbol& I) {
    const Scope* sc = I.getParentScope();
    while (sc) {
        const Symbol& s = sc->asSymbol();
        if (s.kind == SK::InstanceBody) return s.as<InstanceBodySymbol>().parentInstance;
        sc = s.getParentScope();
    }
    return nullptr;
}

// The value symbol (net/var) named `name` directly in a body (skips the same-named PortSymbol).
const ValueSymbol* findNet(const Scope& body, std::string_view name) {
    const ValueSymbol* viaPort = nullptr;
    for (const Symbol& m : body.members()) {
        if (m.name != name) continue;
        if (auto* vs = m.as_if<ValueSymbol>()) return vs;   // a real net/variable member
        // Non-ANSI `output rst_s;` produces a PortSymbol whose INTERNAL symbol is the actual
        // net, and that internal symbol is NOT itself a member — so a plain member scan misses
        // it. This is what silently broke every instance of a module except the one slang's
        // AnalysisManager keeps drivers for: the "look the symbol up in the representative body"
        // fallback found nothing, the net looked undriven, and the trace dead-ended there.
        // (Reproduced with two instances of the same reset synchroniser: the first resolved,
        // the second reported `undriven` — 114 of 121 resets in the real design.)
        if (m.kind == SK::Port)
            if (const Symbol* iv = m.as<PortSymbol>().internalSymbol)
                viaPort = iv->as_if<ValueSymbol>();
    }
    return viaPort;
}

// Is `name` an input port of `body`? Matched by name (robust to `input x; wire x;` redeclaration
// where the port's internal symbol and the explicit net are distinct objects).
bool isInputPortNamed(const Scope& body, std::string_view name) {
    for (const Symbol& m : body.members())
        if (m.kind == SK::Port) {
            const auto& p = m.as<PortSymbol>();
            if (p.name == name && p.direction == ArgumentDirection::In) return true;
        }
    return false;
}

bool isOutputPortNamed(const Scope& body, std::string_view name) {
    for (const Symbol& m : body.members())
        if (m.kind == SK::Port) {
            const auto& p = m.as<PortSymbol>();
            if (p.name == name && p.direction == ArgumentDirection::Out) return true;
        }
    return false;
}

// A child instance in `body` whose OUTPUT port drives `net` (nullptr if none). Catches
// blackbox/cell outputs (e.g. gated_clk_cell.clk_out) that getDrivers' value analysis misses.
// Descends instantiated generate blocks/arrays — an instance under `generate` is still a direct
// child structurally, and skipping it broke the clock walk at nets driven from inside one.
const InstanceSymbol* outputDriverOf(const Scope& body, const Symbol* net,
                                     std::string* portName = nullptr) {
    for (const Symbol& m : body.members()) {
        switch (m.kind) {
            case SK::Instance: {
                const auto& inst = m.as<InstanceSymbol>();
                for (auto* pc : inst.getPortConnections()) {
                    if (pc->port.kind != SK::Port) continue;
                    if (pc->port.as<PortSymbol>().direction == ArgumentDirection::Out &&
                        connNet(pc) == net) {
                        if (portName) *portName = std::string(pc->port.name);
                        return &inst;
                    }
                }
                break;
            }
            case SK::GenerateBlock: {
                const auto& gb = m.as<GenerateBlockSymbol>();
                if (!gb.isUninstantiated)
                    if (const InstanceSymbol* r = outputDriverOf(gb, net, portName)) return r;
                break;
            }
            case SK::GenerateBlockArray: {
                for (auto* e : m.as<GenerateBlockArraySymbol>().entries)
                    if (e)
                        if (const InstanceSymbol* r = outputDriverOf(*e, net, portName)) return r;
                break;
            }
            default:
                break;
        }
    }
    return nullptr;
}

}  // namespace

DriversResult DesignDb::traceNet(const std::string& instanceId, const std::string& netName) {
    DriversResult r;
    r.netName = netName;
    // A schematic net tap only knows (owning instance, net name) — resolve the net symbol and
    // reuse the same behavioral-source collection that pin tracing uses, so a tap keeps tracing
    // backward instead of dead-ending.
    ensureRegistered(instanceId, /*expandSelf*/ false);
    auto it = p_->inst.find(instanceId);
    if (it == p_->inst.end() || !isRealInstance(*it->second)) return r;
    const InstanceSymbol& inst = it->second->as<InstanceSymbol>();
    // Route through the representative body (shared definitions only analyze one instance).
    const InstanceBodySymbol* body = &inst.body;
    auto di = p_->defInst.find(defInfo(inst, *p_->sm).id);
    if (di != p_->defInst.end()) body = &di->second->body;

    // Strip a bit-select suffix: "xfer_buf[19:1]" taps the net "xfer_buf".
    std::string base = netName;
    if (const std::size_t br = base.find('['); br != std::string::npos) base.erase(br);

    const ValueSymbol* netSym = findNet(*body, base);
    if (!netSym) return r;
    r.bus = netSym->getType().getBitWidth() > 1;
    collectBehavioralSources(*netSym, instanceId, r.bus, r.sources);
    return r;
}

DriversResult DesignDb::traceNetLoads(const std::string& instanceId, const std::string& netName) {
    // ALL loads of an INTERNAL net of `instanceId` — the fan-OUT counterpart of traceNet. This
    // is what lets a net's forward trace continue past a gate/assign node: (a) child instances
    // whose INPUT pin the net feeds (`.rst(por)` on a sync cell — the register loads the user
    // could not find), (b) behavioral readers (always/assign/wire-init), (c) blackbox pins,
    // (d) the boundary output port the net leaves through. Without it, fanout from a `logic:`
    // node dead-ended and a reset that feeds registers LOOKED like it feeds none.
    DriversResult r;
    r.netName = netName;
    ensureRegistered(instanceId, /*expandSelf*/ false);
    auto it = p_->inst.find(instanceId);
    if (it == p_->inst.end() || !isRealInstance(*it->second)) return r;
    const InstanceSymbol& inst = it->second->as<InstanceSymbol>();
    const InstanceBodySymbol* body = &inst.body;
    const InstanceSymbol* rep = &inst;
    if (auto di = p_->defInst.find(defInfo(inst, *p_->sm).id); di != p_->defInst.end()) {
        rep = di->second;
        body = &rep->body;
    }
    std::string base = netName;
    if (const std::size_t br = base.find('['); br != std::string::npos) base.erase(br);
    const ValueSymbol* vs = findNet(*body, base);
    if (!vs) return r;
    const bool bus = vs->getType().getBitWidth() > 1;
    r.bus = bus;

    // (a)+(c) structural loads: children (real instances and blackboxes) reading the net.
    // The walk runs in the REPRESENTATIVE body (shared definitions analyze once), so ids are
    // rebased onto instanceId — the representative's own path may be a sibling instance.
    const std::string repPath = rep->getHierarchicalPath();
    const auto rebase = [&](const std::string& full) {
        return full.rfind(repPath + ".", 0) == 0 ? instanceId + full.substr(repPath.size())
                                                 : full;
    };
    std::vector<const Symbol*> kids;
    collectChildren(*body, kids);
    for (const Symbol* km : kids) {
        if (km->kind == SK::Instance) {
            const auto& mi = km->as<InstanceSymbol>();
            for (auto* pc : mi.getPortConnections()) {
                if (pc->port.kind != SK::Port) continue;
                if (pc->port.as<PortSymbol>().direction != ArgumentDirection::In) continue;
                if (connNet(pc) != static_cast<const Symbol*>(vs)) continue;
                DriverSourceInfo s;
                s.kind = "instance";
                s.id = rebase(mi.getHierarchicalPath());
                s.label = std::string(pc->port.name);
                s.detail = std::string(mi.getDefinition().name);
                s.net = std::string(vs->name);
                s.bus = bus;
                r.sources.push_back(std::move(s));
            }
        } else if (km->kind == SK::UninstantiatedDef) {
            const auto& ud = km->as<UninstantiatedDefSymbol>();
            const auto names = ud.getPortNames();
            const auto conns = ud.getPortConnections();
            for (std::size_t i = 0; i < conns.size() && i < names.size(); ++i) {
                if (!conns[i] || conns[i]->kind != slang::ast::AssertionExprKind::Simple) continue;
                const Expression& ex = conns[i]->as<slang::ast::SimpleAssertionExpr>().expr;
                if (connExprSymbol(ex) != static_cast<const Symbol*>(vs)) continue;
                DriverSourceInfo s;
                s.kind = "instance";
                s.id = rebase(ud.getHierarchicalPath());
                s.label = std::string(names[i]);
                s.detail = std::string(ud.definitionName);
                s.net = std::string(vs->name);
                s.bus = bus;
                r.sources.push_back(std::move(s));
            }
        }
    }

    // (b) behavioral readers — same collection traceLoads uses for a pin's net.
    for (const Symbol* blk : structuralReadersOf(*vs)) {
        std::string f;
        int ln = 0;
        try {
            f = p_->sm->getFullPath(blk->location.buffer()).string();
            ln = static_cast<int>(p_->sm->getLineNumber(blk->location));
        } catch (...) { continue; }
        if (ln <= 0) continue;
        DriverSourceInfo s;
        s.kind = "logic";
        s.id = "logic:" + instanceId + ":" + f + ":" + std::to_string(ln);
        if (blk->kind == SK::ContinuousAssign) {
            s.label = "assign";
            s.shape = assignShape(blk->as<ContinuousAssignSymbol>());
            if (!s.shape.empty()) s.reads = gateReads(*blk, "");
            // the LHS this reader DRIVES -> the load node gets an OUTPUT pin to trace on from
            const Expression& asn = blk->as<ContinuousAssignSymbol>().getAssignment();
            if (asn.kind == ExpressionKind::Assignment)
                if (const Symbol* lhs =
                        asn.as<AssignmentExpression>().left().getSymbolReference())
                    s.drives = std::string(lhs->name);
        } else if (blk->kind == SK::ProceduralBlock) {
            s.label = blk->as<ProceduralBlockSymbol>().procedureKind == ProceduralBlockKind::AlwaysFF
                      ? "always_ff" : "always";
        } else {
            s.label = "wire";
            s.drives = std::string(blk->name);   // a wire initializer drives itself
            if (const Expression* init = blk->as<ValueSymbol>().getInitializer()) {
                s.shape = exprShape(*init);
                if (!s.shape.empty()) s.reads = gateReads(*blk, "");
            }
        }
        s.detail = s.label;
        s.net = std::string(vs->name);
        s.file = f;
        s.line = ln;
        s.bus = bus;
        p_->logicBlocks[s.id] = {blk, instanceId};
        r.sources.push_back(std::move(s));
    }

    // (d) the net leaves through this instance's own OUTPUT port -> the trace continues one
    // level up from that boundary pin.
    for (const Symbol& m : body->members()) {
        if (m.kind != SK::Port) continue;
        const auto& ps = m.as<PortSymbol>();
        if (ps.direction != ArgumentDirection::Out) continue;
        if (ps.internalSymbol != static_cast<const Symbol*>(vs) && ps.name != base) continue;
        DriverSourceInfo s;
        s.kind = "port";
        s.id = "port:" + instanceId + "." + std::string(ps.name);
        s.label = std::string(ps.name);
        s.detail = instanceId.find('.') == std::string::npos ? "primary output" : "output port";
        s.net = std::string(vs->name);
        r.sources.push_back(std::move(s));
        break;
    }
    return r;
}

NetSourceResult DesignDb::traceNetToSource(const std::string& instanceId,
                                           const std::string& netName) {
    NetSourceResult r;

    ensureRegistered(instanceId, /*expandSelf*/ false);
    auto it = p_->inst.find(instanceId);
    if (it == p_->inst.end() || !isRealInstance(*it->second)) {
        r.terminus = "undriven";
        return r;
    }

    const InstanceSymbol* cur = &it->second->as<InstanceSymbol>();
    std::string net = netName;  // track by name across hierarchy boundaries

    auto& am = p_->ensureAm();
    for (int depth = 0; depth < 256; ++depth) {
        // ct_top is instantiated 4x (cores 0-3): slang analyzes one representative body per
        // definition, so getDrivers only has data there. Route internal/driver queries through
        // that representative (same as get-ports does); use the per-instance `cur` only for the
        // upward crossing (its own parent + port connections, which differ per instance).
        const InstanceBodySymbol* body = &cur->body;
        auto di = p_->defInst.find(defInfo(*cur, *p_->sm).id);
        if (di != p_->defInst.end()) body = &di->second->body;
        const ValueSymbol* netSym = findNet(*body, net);
        r.path.push_back(cur->getHierarchicalPath() + ":" + net);
        if (!netSym) {
            r.terminus = "undriven";
            return r;
        }

        // 1. driven by procedural/continuous logic or a tracked instance (ignore port self-driver)
        bool sawLogic = false, sawInstance = false;
        std::string detail;
        for (auto& [d, range] : am.getDrivers(*netSym)) {
            if (d->isInputPort()) continue;
            const Symbol* cs = d->containingSymbol;
            if (cs->kind == SK::Instance) {
                sawInstance = true;
                detail = cs->getHierarchicalPath();
            } else {
                sawLogic = true;
                detail = (d->kind == slang::analysis::DriverKind::Continuous) ? "assign"
                                                                              : srcLabel(d->source);
            }
        }
        if (sawInstance) {
            r.terminus = "instance";
            r.detail = detail;
            return r;
        }
        if (sawLogic) {
            r.terminus = "logic";
            r.detail = detail;
            return r;
        }

        // 1b. driven by a child instance's output (blackbox/cell, e.g. clock-gating cell)?
        if (const InstanceSymbol* drv = outputDriverOf(*body, netSym)) {
            r.terminus = "instance";
            r.detail = drv->getHierarchicalPath();
            return r;
        }

        // 2. an input port -> cross up one level (or a primary input if this is a top)
        if (!isInputPortNamed(*body, net)) {
            r.terminus = "undriven";
            return r;
        }
        const InstanceSymbol* parent = parentInstanceOf(*cur);
        if (!parent) {
            r.terminus = "pi";
            r.detail = cur->getHierarchicalPath() + "." + net;
            return r;
        }
        const Symbol* pnet = nullptr;
        for (auto* pc : cur->getPortConnections())
            if (pc->port.kind == SK::Port && pc->port.name == net) {
                pnet = connNet(pc);
                break;
            }
        if (!pnet) {
            r.terminus = "undriven";  // port unconnected / constant
            return r;
        }
        cur = parent;
        net = std::string(pnet->name);
    }
    r.terminus = "undriven";  // depth cap (malformed/cyclic hierarchy)
    return r;
}

// ---- Design object query (tree search + dp_shell) ------------------------------------------

namespace {

// Tcl-compatible glob: * ? [set] with \ escaping. Standalone so object search works even in a
// build without the Tcl interpreter.
bool globMatch(const char* p, const char* s) {
    while (*p) {
        if (*p == '*') {
            ++p;
            if (!*p) return true;
            for (const char* t = s; ; ++t) {
                if (globMatch(p, t)) return true;
                if (!*t) return false;
            }
        }
        if (!*s) return false;
        if (*p == '?') { ++p; ++s; continue; }
        if (*p == '[') {
            ++p;
            bool neg = (*p == '^' || *p == '!');
            if (neg) ++p;
            bool hit = false;
            char prev = 0;
            for (; *p && *p != ']'; ++p) {
                if (*p == '-' && prev && p[1] && p[1] != ']') {
                    if (*s >= prev && *s <= p[1]) hit = true;
                    ++p;
                    prev = 0;
                } else {
                    if (*p == *s) hit = true;
                    prev = *p;
                }
            }
            if (*p == ']') ++p;
            if (hit == neg) return false;
            ++s;
            continue;
        }
        if (*p == '\\' && p[1]) ++p;
        if (*p != *s) return false;
        ++p;
        ++s;
    }
    return !*s;
}

bool wantKind(const std::string& kinds, const char* k) {
    if (kinds.empty()) return true;
    return kinds.find(k) != std::string::npos;
}

}  // namespace

std::vector<std::string> DesignDb::topNames() {
    std::vector<std::string> out;
    for (auto* t : p_->comp->getRoot().topInstances) {
        const std::string n(t->name);
        if (!n.empty()) out.push_back(n);
    }
    return out;
}

FindResult DesignDb::findObjects(const std::string& pattern, const std::string& kinds, int limit) {
    FindResult res;
    if (pattern.empty()) return res;
    if (limit <= 0) limit = 500;
    // A pattern containing '.' is matched against the full hierarchical path, otherwise against
    // the leaf name — so "clk*" finds pins anywhere, "u_core.*clk*" scopes to that subtree.
    const bool hier = pattern.find('.') != std::string::npos;
    // Tessent convention: hierarchical paths are TOP-RELATIVE — the top module name is
    // implicit (`PROCESSOR_1/clock_module_0/mclk`, not `processor_core/...`). Accept both
    // spellings by also matching "<top>.<pattern>" for every elaborated top.
    std::vector<std::string> pats{pattern};
    if (hier)
        for (auto* t : p_->comp->getRoot().topInstances) {
            const std::string tn(t->name);
            if (!tn.empty() && pattern.rfind(tn + ".", 0) != 0) pats.push_back(tn + "." + pattern);
        }
    auto hit = [&](const std::string& leaf, const std::string& path) {
        for (const std::string& pp : pats)
            if (globMatch(pp.c_str(), (hier ? path : leaf).c_str())) return true;
        return false;
    };
    auto push = [&](FoundObject o) {
        if (static_cast<int>(res.objects.size()) >= limit) { res.truncated = true; return; }
        res.objects.push_back(std::move(o));
    };

    std::set<std::string> seenDef;
    std::vector<const InstanceSymbol*> stack;
    for (auto* t : p_->comp->getRoot().topInstances) stack.push_back(t);
    while (!stack.empty() && !res.truncated) {
        const InstanceSymbol* inst = stack.back();
        stack.pop_back();
        ++res.scanned;
        const std::string path = inst->getHierarchicalPath();
        const std::string dname = std::string(inst->body.getDefinition().name);
        const InstanceSymbol* parent = parentInstanceOf(*inst);

        if (wantKind(kinds, "instance") && hit(leafName(*inst), path))
            push({"instance", path, leafName(*inst), dname,
                  parent ? parent->getHierarchicalPath() : "", ""});
        if (wantKind(kinds, "module") && hit(dname, dname)) {
            const std::string did = defInfo(*inst, *p_->sm).id;
            if (seenDef.insert(did).second) push({"module", did, dname, "", "", ""});
        }
        // ports of this instance == pins on it; on a top instance they are primary ports
        if (wantKind(kinds, "pin") || wantKind(kinds, "port")) {
            const bool isTop = (parent == nullptr);
            for (const Symbol& m : inst->body.members()) {
                if (m.kind != SK::Port) continue;
                const auto& ps = m.as<PortSymbol>();
                const std::string leaf(ps.name);
                const std::string full = path + "." + leaf;
                const char* k = isTop ? "port" : "pin";
                if (!wantKind(kinds, k)) continue;
                if (hit(leaf, full)) push({k, full, leaf, dname, path, dirStr(ps.direction)});
                if (res.truncated) break;
            }
        }
        if (wantKind(kinds, "net")) {
            for (const Symbol& m : inst->body.members()) {
                if (m.kind != SK::Net && m.kind != SK::Variable) continue;
                const std::string leaf(m.name);
                if (leaf.empty()) continue;
                const std::string full = path + "." + leaf;
                if (hit(leaf, full)) push({"net", full, leaf, dname, path, ""});
                if (res.truncated) break;
            }
        }
        std::vector<const Symbol*> kids;
        collectChildren(inst->body, kids);
        for (auto* k : kids)
            if (isRealInstance(*k)) stack.push_back(&k->as<InstanceSymbol>());
    }
    return res;
}

SdcObjectSet DesignDb::sdcObjects(int limit) {
    SdcObjectSet res;
    if (limit <= 0) limit = 200000;
    int total = 0;
    auto push = [&](std::vector<std::string>& v, std::string n) {
        if (total >= limit) { res.truncated = true; return; }
        ++total;
        v.push_back(std::move(n));
    };

    std::vector<const InstanceSymbol*> stack;
    for (auto* t : p_->comp->getRoot().topInstances) stack.push_back(t);
    while (!stack.empty() && !res.truncated) {
        const InstanceSymbol* inst = stack.back();
        stack.pop_back();
        ++res.scanned;
        const std::string path = inst->getHierarchicalPath();
        const bool isTop = parentInstanceOf(*inst) == nullptr;
        if (!isTop) push(res.cells, path);

        for (const Symbol& m : inst->body.members()) {
            if (m.kind == SK::Port) {
                const auto& ps = m.as<PortSymbol>();
                const std::string leaf(ps.name);
                if (leaf.empty()) continue;
                if (isTop) {
                    // SDC names primary I/O by the bare port name, never by <top>.<port>.
                    push(res.ports, leaf);
                    if (ps.direction == ArgumentDirection::In)
                        res.inputs.push_back(leaf);
                    else if (ps.direction == ArgumentDirection::Out)
                        res.outputs.push_back(leaf);
                } else {
                    push(res.pins, path + "." + leaf);
                }
            } else if (m.kind == SK::Net || m.kind == SK::Variable) {
                const std::string leaf(m.name);
                if (!leaf.empty()) push(res.nets, path + "." + leaf);
            }
        }
        std::vector<const Symbol*> kids;
        collectChildren(inst->body, kids);
        for (auto* k : kids)
            if (isRealInstance(*k)) stack.push_back(&k->as<InstanceSymbol>());
    }
    return res;
}

// ---- Clock / Reset structure tree (DFT: OCC + reset-mux planning) --------------------------

namespace {

// If `netSym`'s sole driver is a continuous assign whose RHS is a plain signal or its
// negation, return {sourceNetName, inverted} — the walk sees through buffers/inverters.
// Anything else (gates, muxes, procedural logic, multiple drivers) returns nullopt.
/// The single expression driving `netSym`, or nullptr: either its one continuous-assign RHS,
/// or — when the analysis reports no drivers at all — its declaration INITIALIZER.
/// slang's AnalysisManager does not record `wire x = y;` initializers as drivers (verified on
/// openMSP430's `wire mclk_pc = mclk;`, drivers=0 with a live initializer), and that single
/// gap made every non-CLOCK_GATING gated clock in the design dead-end as "undriven".
const Expression* drivingExprOf(slang::analysis::AnalysisManager& am, const ValueSymbol& netSym) {
    const ContinuousAssignSymbol* ca = nullptr;
    int drivers = 0;
    for (auto& [d, range] : am.getDrivers(netSym)) {
        if (d->isInputPort()) continue;
        ++drivers;
        const Symbol* cs = d->containingSymbol;
        if (cs && cs->kind == SK::ContinuousAssign) ca = &cs->as<ContinuousAssignSymbol>();
        else return nullptr;   // procedural / instance driver -> not a see-through
    }
    if (drivers == 0) {
        if (const Expression* init = netSym.getInitializer()) return init;   // `wire x = y;`
        // Zero drivers usually means a NON-REPRESENTATIVE instance (the analysis only covers
        // one instance per definition) — scan this instance's own AST instead. Only a single
        // continuous assign with no procedural writers is a see-through candidate, same rule
        // as the analysis path above.
        const StructDrivers sd = structuralDriversOf(netSym);
        if (sd.procs.empty() && sd.assigns.size() == 1) {
            const Expression& asn = sd.assigns[0]->getAssignment();
            if (asn.kind == ExpressionKind::Assignment)
                return &asn.as<AssignmentExpression>().right();
        }
        return nullptr;
    }
    if (drivers != 1 || !ca) return nullptr;
    const Expression& asn = ca->getAssignment();
    if (asn.kind != ExpressionKind::Assignment) return nullptr;
    return &asn.as<AssignmentExpression>().right();
}

std::optional<std::pair<std::string, bool>> seeThroughAssign(slang::analysis::AnalysisManager& am,
                                                            const ValueSymbol& netSym) {
    const Expression* rhs = drivingExprOf(am, netSym);
    if (!rhs) return std::nullopt;
    while (rhs->kind == ExpressionKind::Conversion) rhs = &rhs->as<ConversionExpression>().operand();
    bool inv = false;
    if (rhs->kind == ExpressionKind::UnaryOp) {
        const auto& u = rhs->as<UnaryExpression>();
        if (u.op != UnaryOperator::BitwiseNot && u.op != UnaryOperator::LogicalNot) return std::nullopt;
        inv = true;
        rhs = &u.operand();
        while (rhs->kind == ExpressionKind::Conversion) rhs = &rhs->as<ConversionExpression>().operand();
    }
    if (rhs->kind == ExpressionKind::NamedValue || rhs->kind == ExpressionKind::HierarchicalValue)
        return std::make_pair(std::string(rhs->as<ValueExpressionBase>().symbol.name), inv);
    // A BIT-SELECT of a vector is still just a wire tap: `assign data_out = data_sync[1];` is the
    // standard tail of a reset synchronizer, and not handling it made the whole reset trace
    // dead-end there with no explanation. Follow the base signal.
    if (rhs->kind == ExpressionKind::ElementSelect || rhs->kind == ExpressionKind::RangeSelect) {
        const Expression* base = (rhs->kind == ExpressionKind::ElementSelect)
                                     ? &rhs->as<ElementSelectExpression>().value()
                                     : &rhs->as<RangeSelectExpression>().value();
        while (base->kind == ExpressionKind::Conversion)
            base = &base->as<ConversionExpression>().operand();
        if (base->kind == ExpressionKind::NamedValue || base->kind == ExpressionKind::HierarchicalValue)
            return std::make_pair(std::string(base->as<ValueExpressionBase>().symbol.name), inv);
    }
    return std::nullopt;
}

// Normalized SDC constraint lookup: targets use '.' separators; a hierarchical target matches a
// "instPath.net" by suffix, a bare target matches primary-input port names only.
struct SdcIndex {
    // clockName per target
    std::vector<std::pair<std::string, std::string>> hierClocks;  // (normalized hier target, name)
    std::map<std::string, std::string> portClocks;                // bare port -> clock name
    std::map<std::string, int> hierCase;                          // normalized target -> 0/1
    std::map<std::string, int> portCase;

    static std::string norm(std::string t) {
        for (char& c : t) if (c == '/') c = '.';
        return t;
    }
    static bool suffixMatch(const std::string& full, const std::string& t) {
        if (full == t) return true;
        return full.size() > t.size() && full.compare(full.size() - t.size(), t.size(), t) == 0 &&
               full[full.size() - t.size() - 1] == '.';
    }
    /// Clock defined ON this hierarchical net ("" if none).
    std::string clockAt(const std::string& fullNet) const {
        for (auto& [t, n] : hierClocks)
            if (suffixMatch(fullNet, t)) return n.empty() ? t : n;
        return {};
    }
};

SdcIndex buildSdcIndex(const SdcInfo& sdc) {
    SdcIndex ix;
    for (const SdcClock& c : sdc.clocks)
        for (const std::string& t : c.targets) {
            const std::string n = SdcIndex::norm(t);
            if (n.find('.') != std::string::npos) ix.hierClocks.emplace_back(n, c.name);
            else ix.portClocks[n] = c.name;
        }
    for (const SdcCase& cs : sdc.cases) {
        const std::string n = SdcIndex::norm(cs.target);
        if (n.find('.') != std::string::npos) ix.hierCase[n] = cs.value;
        else ix.portCase[n] = cs.value;
    }
    return ix;
}

/// An RTL clock-gating structure: `assign gclk = clk & en;` (or `|`). In RTL there are no ICG
/// library cells — a gate like this IS the integrated clock gate (openMSP430's omsp_clock_gate
/// is exactly a low-phase enable latch plus this AND). Stopping here made every gated clock its
/// own "root"; instead recognise it, report the ENABLE, and keep climbing the CLOCK operand.
///
/// Which operand is the clock? The one NOT driven by a procedural block in this same body: the
/// enable comes from the local latch/flop, the clock arrives from outside. If neither or both
/// are locally driven the structure is ambiguous and we do NOT guess.
struct GateThrough {
    std::string clockNet;
    std::string enableNet;
};
std::optional<GateThrough> seeThroughGate(slang::analysis::AnalysisManager& am,
                                          const ValueSymbol& netSym) {
    const Expression* rhs = drivingExprOf(am, netSym);
    if (!rhs) return std::nullopt;
    while (rhs->kind == ExpressionKind::Conversion) rhs = &rhs->as<ConversionExpression>().operand();
    if (rhs->kind != ExpressionKind::BinaryOp) return std::nullopt;
    const auto& b = rhs->as<BinaryExpression>();
    if (b.op != BinaryOperator::BinaryAnd && b.op != BinaryOperator::BinaryOr &&
        b.op != BinaryOperator::LogicalAnd && b.op != BinaryOperator::LogicalOr)
        return std::nullopt;

    auto plain = [](const Expression& e) -> const ValueSymbol* {
        const Expression* x = &e;
        while (x->kind == ExpressionKind::Conversion) x = &x->as<ConversionExpression>().operand();
        if (x->kind == ExpressionKind::UnaryOp) {
            const auto& u = x->as<UnaryExpression>();
            if (u.op != UnaryOperator::BitwiseNot && u.op != UnaryOperator::LogicalNot) return nullptr;
            x = &u.operand();
            while (x->kind == ExpressionKind::Conversion) x = &x->as<ConversionExpression>().operand();
        }
        if (x->kind != ExpressionKind::NamedValue && x->kind != ExpressionKind::HierarchicalValue)
            return nullptr;
        return &x->as<ValueExpressionBase>().symbol;
    };
    const ValueSymbol* L = plain(b.left());
    const ValueSymbol* R = plain(b.right());
    if (!L || !R) return std::nullopt;

    auto localProc = [&](const ValueSymbol& v) {
        for (auto& [d, range] : am.getDrivers(v)) {
            if (d->isInputPort()) continue;
            const Symbol* cs = d->containingSymbol;
            if (cs && cs->kind == SK::ProceduralBlock) return true;
        }
        return false;
    };
    const bool lProc = localProc(*L), rProc = localProc(*R);
    if (lProc == rProc) return std::nullopt;   // ambiguous -> do not guess
    return lProc ? GateThrough{std::string(R->name), std::string(L->name)}
                 : GateThrough{std::string(L->name), std::string(R->name)};
}

/// Three-valued value of a control net (an ICG enable, a MUX select): 0 | 1 | X.
///
/// STRUCTURAL IMPLICATION ENGINE. A clock cell is only transparent under a KNOWN condition, so
/// anything unresolved must stay X — guessing invents a clock path that does not exist in test.
/// The previous version only followed literals and buffer/inverter chains inside ONE module
/// body, so in a real design (where test-mode signals come from the top through ports, and
/// enables are `scan_mode & ~foo`) practically every enable evaluated to X and the walk stopped
/// at the first clock gate. This engine adds the three things that actually matter:
///
///   1. CONTROLLING VALUES — a single 0 on an AND forces 0 whatever the other operands are, a
///      single 1 on an OR forces 1. That is an implication, not an evaluation: it concludes
///      even when operands are unknown, which is where most real enables get resolved.
///   2. HIERARCHY — a net that is an input port resolves against the expression connected in
///      the PARENT; a net driven by a child instance's output resolves inside that CHILD. Test
///      constraints live at the top, the gates live deep, so without this nothing connects.
///   3. MEMOISATION + a cycle guard, so a wide fanout of the same test signal costs once and a
///      combinational loop terminates instead of recursing.
///
/// Everything it cannot justify stays X. It never assumes a value to make a path appear.
enum class Tri : std::uint8_t { Zero, One, X };

class Implication {
public:
    /// `bodyOf` yields the body to query DRIVERS on: slang's AnalysisManager keeps driver data
    /// for one representative body per definition, so a second instance of the same module has
    /// none and would look undriven.
    using BodyOf = std::function<const InstanceBodySymbol*(const InstanceSymbol&)>;

    Implication(const SdcIndex& ix, slang::analysis::AnalysisManager& am, BodyOf bodyOf)
        : ix_(ix), am_(am), bodyOf_(std::move(bodyOf)) {}

    /// The first symbol the calculus could not justify: no continuous driver, no port to climb —
    /// typically a REGISTER output (procedural driver) or an undriven net. Empty when every X
    /// came from an X input rather than a structural dead end.
    const std::string& firstStuck() const { return firstStuck_; }

    /// Value of `netName` as seen inside `scope`.
    Tri net(const InstanceSymbol& scope, const std::string& netName, int depth = 0) {
        if (depth > kMaxDepth) return Tri::X;
        // An SDC set_case_analysis pinned on this exact hierarchical net wins outright.
        const std::string full = scope.getHierarchicalPath() + "." + netName;
        if (auto hc = ix_.hierCase.find(SdcIndex::norm(full)); hc != ix_.hierCase.end())
            return hc->second ? Tri::One : Tri::Zero;
        if (!parentInstanceOf(scope))
            if (auto pc = ix_.portCase.find(netName); pc != ix_.portCase.end())
                return pc->second ? Tri::One : Tri::Zero;

        const ValueSymbol* s = findNet(scope.body, netName);
        return s ? sym(scope, *s, depth) : Tri::X;
    }

    /// Evaluate an arbitrary expression in `scope` (used by the RTL clock-mux see-through).
    Tri expr_public(const InstanceSymbol& scope, const Expression& e) { return expr(scope, e, 0); }

private:
    static constexpr int kMaxDepth = 64;
    using Key = std::pair<const InstanceSymbol*, const ValueSymbol*>;

    Tri sym(const InstanceSymbol& scope, const ValueSymbol& s, int depth) {
        if (depth > kMaxDepth) return Tri::X;
        const Key k{&scope, &s};
        if (auto m = memo_.find(k); m != memo_.end()) return m->second;
        if (!active_.insert(k).second) return Tri::X;   // combinational loop -> unknown

        const Tri v = resolve(scope, s, depth);
        active_.erase(k);
        memo_.emplace(k, v);
        return v;
    }

    Tri resolve(const InstanceSymbol& scope, const ValueSymbol& s, int depth) {
        // set_case_analysis can also be written on this net by its hierarchical name.
        const std::string full = scope.getHierarchicalPath() + "." + std::string(s.name);
        if (auto hc = ix_.hierCase.find(SdcIndex::norm(full)); hc != ix_.hierCase.end())
            return hc->second ? Tri::One : Tri::Zero;

        // A declaration on ANY net of the eval root (add_pin_constraint u_dyn/<net>) cuts the
        // walk right here — INTERNAL nets included. The GUI labels such a net C1/C0; before
        // this, the label said C1 while the calculus walked straight past it into the register
        // behind and answered X — two answers for one wire.
        if (!parentInstanceOf(scope))
            if (auto pc = ix_.portCase.find(std::string(s.name)); pc != ix_.portCase.end())
                return pc->second ? Tri::One : Tri::Zero;

        // 1. driven by an expression in this body (`assign x = ...` or `wire x = ...;`)
        const ValueSymbol* q = &s;
        if (const InstanceBodySymbol* rep = bodyOf_(scope); rep && rep != &scope.body)
            if (const ValueSymbol* alt = findNet(*rep, std::string(s.name))) q = alt;
        if (const Expression* rhs = drivingExprOf(am_, *q)) return expr(scope, *rhs, depth + 1);

        // 2. an INPUT PORT of this module -> resolve against what the parent connects to it
        if (isInputPortNamed(scope.body, std::string(s.name))) {
            // At the TOP there is no parent, so a bare-port set_case_analysis is the only thing
            // that can constrain it. This check also lives in net(), but a symbol reached through
            // an expression lands here directly — without it every `set_case_analysis 1
            // [get_ports scan_enable]` was ignored and each test signal read X, which killed the
            // clock at the first RTL gate on a real SoC.
            if (!parentInstanceOf(scope))
                if (auto pc = ix_.portCase.find(std::string(s.name)); pc != ix_.portCase.end())
                    return pc->second ? Tri::One : Tri::Zero;
            if (const InstanceSymbol* parent = parentInstanceOf(scope)) {
                for (auto* pc : scope.getPortConnections()) {
                    if (pc->port.kind != SK::Port || pc->port.name != s.name) continue;
                    if (const Expression* e = pc->getExpression()) return expr(*parent, *e, depth + 1);
                    break;
                }
            }
            // A TOP input nobody constrained: X by the rule, and the FIRST such input is the
            // most actionable thing an X answer can name — it is what to constrain next.
            if (!parentInstanceOf(scope) && firstStuck_.empty())
                firstStuck_ = "input:" + std::string(s.name);
            return Tri::X;
        }

        // 3. driven by a CHILD instance's output -> resolve inside that child
        if (const InstanceSymbol* drv = outputDriverOf(scope.body, q)) {
            for (auto* pc : drv->getPortConnections()) {
                if (pc->port.kind != SK::Port) continue;
                const auto& ps = pc->port.as<PortSymbol>();
                if (ps.direction != ArgumentDirection::Out || connNet(pc) != q) continue;
                if (const auto* iv = ps.internalSymbol ? ps.internalSymbol->as_if<ValueSymbol>() : nullptr)
                    return sym(*drv, *iv, depth + 1);
                break;
            }
        }
        // 4. driven by a BLACKBOX standard cell (and02/or03/mux21/inv01… — what a gate-level
        // library bottoms out in when the foundry cells are not compiled). slang keeps these as
        // UninstantiatedDefSymbol; without inferring their function from the MODULE NAME every
        // wrapped cell output is a dead end and the whole library computes X no matter what the
        // user constrains — the opposite of "真实地根据输入源头计算".
        if (auto g = bbGate(scope, *q, depth)) return *g;
        // Nothing left to try: this symbol has no continuous driver and no port to climb. Name
        // it once — it is where a static analysis is STUCK (a register's output, or an undriven
        // net), which is the actionable half of an X answer.
        if (firstStuck_.empty())
            firstStuck_ = "dead:" + scope.getHierarchicalPath() + "." + std::string(s.name);
        return Tri::X;
    }

    /// Infer a blackbox cell's gate function from its definition name and compute through it.
    /// Handles the single-output combinational families (and/nand/or/nor/xor/xnor/inv/buf/mux,
    /// tiehi/tielo); anything else (flops, AOI/OAI compounds) stays a dead end, honestly.
    std::optional<Tri> bbGate(const InstanceSymbol& scope, const ValueSymbol& q, int depth) {
        using UD = slang::ast::UninstantiatedDefSymbol;
        const auto lower = [](std::string_view v) {
            std::string o(v);
            for (char& c : o) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
            return o;
        };
        const auto notOf = [](Tri v) {
            return v == Tri::One ? Tri::Zero : v == Tri::Zero ? Tri::One : Tri::X;
        };
        for (const Symbol& m : scope.body.members()) {
            if (m.kind != SK::UninstantiatedDef) continue;
            const auto& ud = m.as<UD>();
            const auto names = ud.getPortNames();
            const auto conns = ud.getPortConnections();
            // the port bound to q must be the cell's conventional OUTPUT pin
            int outIdx = -1;
            for (std::size_t i = 0; i < conns.size() && i < names.size(); ++i) {
                const auto* sa = conns[i] ? conns[i]->as_if<slang::ast::SimpleAssertionExpr>()
                                          : nullptr;
                if (!sa) continue;
                const Expression* e = &sa->expr;
                while (e->kind == ExpressionKind::Conversion)
                    e = &e->as<ConversionExpression>().operand();
                if (e->kind != ExpressionKind::NamedValue &&
                    e->kind != ExpressionKind::HierarchicalValue) continue;
                // Pointer OR name: resolve() may have remapped q to the REPRESENTATIVE body's
                // symbol while this (non-representative) instance's connection expressions
                // reference its own body's symbol of the same net. Name is unique within one
                // module body, so the name match is exact, and without it every cell instance
                // except the representative one silently computed X.
                const auto& bound = e->as<ValueExpressionBase>().symbol;
                if (&bound == &q || bound.name == q.name) { outIdx = static_cast<int>(i); break; }
            }
            if (outIdx < 0) continue;
            const std::string on = lower(names[static_cast<std::size_t>(outIdx)]);
            if (on != "y" && on != "z" && on != "zn" && on != "q" && on != "out") continue;

            const std::string dn = lower(ud.definitionName);
            const auto has = [&](const char* t) { return dn.find(t) != std::string::npos; };
            std::string fn;
            if (has("xnor")) fn = "xnor";
            else if (has("xor")) fn = "xor";
            else if (has("nand")) fn = "nand";
            else if (has("nor")) fn = "nor";
            else if (has("and")) fn = "and";
            else if (has("mux")) fn = "mux";
            else if (has("inv") || has("not")) fn = "inv";
            else if (has("buf") || has("dly") || has("delay")) fn = "buf";
            else if (has("tiehi") || has("tie1") || has("vcc")) fn = "tiehi";
            else if (has("tielo") || has("tie0") || has("gnd")) fn = "tielo";
            else if (has("or")) fn = "or";      // last: "or" is a substring of half the others
            else continue;                       // unknown cell family — stay honest

            if (fn == "tiehi") return Tri::One;
            if (fn == "tielo") return Tri::Zero;

            // evaluate every input pin in the INSTANTIATING scope
            std::vector<std::pair<std::string, Tri>> ins;
            for (std::size_t i = 0; i < conns.size() && i < names.size(); ++i) {
                if (static_cast<int>(i) == outIdx) continue;
                const auto* sa = conns[i] ? conns[i]->as_if<slang::ast::SimpleAssertionExpr>()
                                          : nullptr;
                if (!sa) continue;
                ins.emplace_back(lower(names[i]), expr(scope, sa->expr, depth + 1));
            }
            if (ins.empty()) continue;

            Tri r = Tri::X;
            if (fn == "inv" || fn == "buf") {
                r = fn == "inv" ? notOf(ins[0].second) : ins[0].second;
                return r;   // ZN on an inv is its single inversion, never a double one
            }
            if (fn == "mux") {
                // convention (matches the library's own comment `out = c ? in2 : in1`):
                // S/S0 selects; A1/in2/B = taken when 1, A0/in1/A = taken when 0
                Tri sel = Tri::X, a0 = Tri::X, a1 = Tri::X;
                for (auto& [n, v] : ins) {
                    if (!n.empty() && n[0] == 's') sel = v;
                    else if (n == "a1" || n == "in2" || n == "b" || n == "d1") a1 = v;
                    else if (n == "a0" || n == "in1" || n == "a" || n == "d0") a0 = v;
                }
                r = sel == Tri::One ? a1
                  : sel == Tri::Zero ? a0
                  : (a0 == a1 ? a0 : Tri::X);   // X select: only a unanimous answer survives
            } else if (fn == "and" || fn == "nand") {
                r = Tri::One;
                for (auto& [n, v] : ins)
                    if (v == Tri::Zero) { r = Tri::Zero; break; }
                    else if (v == Tri::X) r = Tri::X;
                if (fn == "nand") r = notOf(r);
            } else if (fn == "or" || fn == "nor") {
                r = Tri::Zero;
                for (auto& [n, v] : ins)
                    if (v == Tri::One) { r = Tri::One; break; }
                    else if (v == Tri::X) r = Tri::X;
                if (fn == "nor") r = notOf(r);
            } else {   // xor / xnor
                int ones = 0;
                bool anyX = false;
                for (auto& [n, v] : ins) {
                    if (v == Tri::X) { anyX = true; break; }
                    if (v == Tri::One) ++ones;
                }
                r = anyX ? Tri::X : (ones % 2 ? Tri::One : Tri::Zero);
                if (fn == "xnor" && r != Tri::X) r = notOf(r);
            }
            // ZN on a non-inverting family = the inverting variant of the cell
            if (on == "zn" && r != Tri::X) r = notOf(r);
            return r;
        }
        return std::nullopt;
    }

    Tri expr(const InstanceSymbol& scope, const Expression& e0, int depth) {
        if (depth > kMaxDepth) return Tri::X;
        const Expression* e = &e0;
        while (e->kind == ExpressionKind::Conversion) e = &e->as<ConversionExpression>().operand();

        switch (e->kind) {
            case ExpressionKind::IntegerLiteral: {
                const auto& iv = e->as<IntegerLiteral>().getValue();
                if (iv.hasUnknown()) return Tri::X;             // x/z literal
                std::string v;
                try { v = iv.toString(slang::LiteralBase::Decimal, /*includeBase*/ false); }
                catch (...) { return Tri::X; }
                return v == "0" ? Tri::Zero : Tri::One;
            }
            case ExpressionKind::NamedValue:
            case ExpressionKind::HierarchicalValue: {
                const auto& vb = e->as<ValueExpressionBase>();
                if (const auto* vs = vb.symbol.as_if<ValueSymbol>()) return sym(scope, *vs, depth + 1);
                return Tri::X;
            }
            case ExpressionKind::UnaryOp: {
                const auto& u = e->as<UnaryExpression>();
                const Tri v = expr(scope, u.operand(), depth + 1);
                switch (u.op) {
                    case UnaryOperator::BitwiseNot:
                    case UnaryOperator::LogicalNot:
                        return v == Tri::X ? Tri::X : (v == Tri::One ? Tri::Zero : Tri::One);
                    case UnaryOperator::BitwiseOr:      // reduction: |x
                    case UnaryOperator::BitwiseAnd:     // reduction: &x
                        return v;                        // 1-bit control: reduction is identity
                    case UnaryOperator::BitwiseNor:
                    case UnaryOperator::BitwiseNand:
                        return v == Tri::X ? Tri::X : (v == Tri::One ? Tri::Zero : Tri::One);
                    default: return Tri::X;
                }
            }
            case ExpressionKind::BinaryOp: {
                const auto& b = e->as<BinaryExpression>();
                const bool isAnd = b.op == BinaryOperator::BinaryAnd || b.op == BinaryOperator::LogicalAnd;
                const bool isOr  = b.op == BinaryOperator::BinaryOr  || b.op == BinaryOperator::LogicalOr;
                const bool isXor = b.op == BinaryOperator::BinaryXor;
                if (!isAnd && !isOr && !isXor) return Tri::X;   // arithmetic / compare: not justified
                const Tri l = expr(scope, b.left(), depth + 1);
                // CONTROLLING VALUE: decide without even looking at the other operand.
                if (isAnd && l == Tri::Zero) return Tri::Zero;
                if (isOr && l == Tri::One) return Tri::One;
                const Tri r = expr(scope, b.right(), depth + 1);
                if (isAnd) {
                    if (r == Tri::Zero) return Tri::Zero;
                    return (l == Tri::One && r == Tri::One) ? Tri::One : Tri::X;
                }
                if (isOr) {
                    if (r == Tri::One) return Tri::One;
                    return (l == Tri::Zero && r == Tri::Zero) ? Tri::Zero : Tri::X;
                }
                if (l == Tri::X || r == Tri::X) return Tri::X;
                return (l == r) ? Tri::Zero : Tri::One;         // xor
            }
            case ExpressionKind::ConditionalOp: {
                const auto& c = e->as<ConditionalExpression>();
                Tri cond = Tri::X;
                for (auto& p : c.conditions) {
                    const Tri v = expr(scope, *p.expr, depth + 1);
                    if (v == Tri::Zero) { cond = Tri::Zero; break; }   // any false -> false
                    cond = (cond == Tri::X && v == Tri::One) ? Tri::One
                         : (v == Tri::X ? Tri::X : cond);
                }
                if (cond == Tri::One) return expr(scope, c.left(), depth + 1);
                if (cond == Tri::Zero) return expr(scope, c.right(), depth + 1);
                // Unknown select, but if BOTH arms agree the result is implied regardless.
                const Tri a = expr(scope, c.left(), depth + 1);
                if (a == Tri::X) return Tri::X;
                return (a == expr(scope, c.right(), depth + 1)) ? a : Tri::X;
            }
            default:
                return Tri::X;
        }
    }

    const SdcIndex& ix_;
    slang::analysis::AnalysisManager& am_;
    BodyOf bodyOf_;
    std::map<Key, Tri> memo_;
    std::set<Key> active_;
    mutable std::string firstStuck_;
};

inline const char* triStr(Tri v) { return v == Tri::One ? "1" : v == Tri::Zero ? "0" : "X"; }

/// RTL clock gate `assign gck = ck & en;` (or the OR form), resolved by IMPLICATION.
///
/// `seeThroughGate` guesses which operand is the clock by asking which side a local procedural
/// block drives. Inside a dedicated gate module — the normal way to write one — BOTH operands are
/// input ports, so that heuristic always gives up and the clock dies at the gate. (Found by the
/// multi-core stress SoC: every core's clock stopped at `assign gck = ck & en`.)
///
/// With the engine we can decide properly instead of guessing: on an AND, the operand justified
/// to the NON-CONTROLLING value 1 must be the enable and the other is the clock, and the gate is
/// open. Symmetrically 0 for an OR. When neither side is justified we still refuse to guess.
std::optional<GateThrough> gateThroughByImplication(slang::analysis::AnalysisManager& am,
                                                    const ValueSymbol& netSym,
                                                    const InstanceSymbol& scope,
                                                    Implication& impl) {
    const Expression* rhs = drivingExprOf(am, netSym);
    if (!rhs) return std::nullopt;
    while (rhs->kind == ExpressionKind::Conversion) rhs = &rhs->as<ConversionExpression>().operand();
    if (rhs->kind != ExpressionKind::BinaryOp) return std::nullopt;
    const auto& b = rhs->as<BinaryExpression>();
    const bool isAnd = b.op == BinaryOperator::BinaryAnd || b.op == BinaryOperator::LogicalAnd;
    const bool isOr = b.op == BinaryOperator::BinaryOr || b.op == BinaryOperator::LogicalOr;
    if (!isAnd && !isOr) return std::nullopt;

    auto strip = [](const Expression* e) {
        while (e->kind == ExpressionKind::Conversion) e = &e->as<ConversionExpression>().operand();
        return e;
    };
    auto nameOf = [](const Expression* e) -> std::string {
        return (e->kind == ExpressionKind::NamedValue || e->kind == ExpressionKind::HierarchicalValue)
                   ? std::string(e->as<ValueExpressionBase>().symbol.name)
                   : std::string();
    };
    const std::string ln = nameOf(strip(&b.left())), rn = nameOf(strip(&b.right()));
    if (ln.empty() || rn.empty()) return std::nullopt;

    const Tri openVal = isAnd ? Tri::One : Tri::Zero;   // the value that lets the clock through
    const Tri lv = impl.net(scope, ln), rv = impl.net(scope, rn);
    if (lv == openVal && rv != openVal) return GateThrough{rn, ln};   // left is the enable
    if (rv == openVal && lv != openVal) return GateThrough{ln, rn};
    return std::nullopt;                                              // not justified: do not guess
}

/// RTL clock MUX `assign y = s ? a : b;`. Only library-cell muxes were traversable before, so a
/// behavioural clock mux — the usual way to write a functional/test clock switch in RTL — killed
/// the clock. Same rule as the cell case: cross ONLY when the select is justified to a constant,
/// then follow exactly that arm. Returns {clockNet, "s=<0|1>"}.
std::optional<GateThrough> muxThroughByImplication(slang::analysis::AnalysisManager& am,
                                                   const ValueSymbol& netSym,
                                                   const InstanceSymbol& scope,
                                                   Implication& impl) {
    const Expression* rhs = drivingExprOf(am, netSym);
    if (!rhs) return std::nullopt;
    while (rhs->kind == ExpressionKind::Conversion) rhs = &rhs->as<ConversionExpression>().operand();
    if (rhs->kind != ExpressionKind::ConditionalOp) return std::nullopt;
    const auto& c = rhs->as<ConditionalExpression>();
    if (c.conditions.size() != 1 || !c.conditions[0].expr) return std::nullopt;

    const Tri sel = impl.expr_public(scope, *c.conditions[0].expr);
    if (sel == Tri::X) return std::nullopt;                 // unknown select: never guess an arm
    auto strip = [](const Expression* e) {
        while (e->kind == ExpressionKind::Conversion) e = &e->as<ConversionExpression>().operand();
        return e;
    };
    const Expression* arm = strip(sel == Tri::One ? &c.left() : &c.right());
    if (arm->kind != ExpressionKind::NamedValue && arm->kind != ExpressionKind::HierarchicalValue)
        return std::nullopt;
    return GateThrough{std::string(arm->as<ValueExpressionBase>().symbol.name),
                       std::string("s=") + (sel == Tri::One ? "1" : "0")};
}

}  // namespace

std::vector<DesignDb::ModAssign> DesignDb::moduleAssigns(const std::string& topModule) {
    std::vector<ModAssign> out;
    const InstanceSymbol* top = nullptr;
    for (auto* t : p_->comp->getRoot().topInstances)
        if (std::string(t->body.getDefinition().name) == topModule ||
            std::string(t->name) == topModule) { top = t; break; }
    if (!top) return out;
    const auto strip = [](const Expression* e) {
        while (e->kind == ExpressionKind::Conversion) e = &e->as<ConversionExpression>().operand();
        return e;
    };
    for (const Symbol& m : top->body.members()) {
        if (m.kind != SK::ContinuousAssign) continue;
        const Expression& asn = m.as<ContinuousAssignSymbol>().getAssignment();
        if (asn.kind != ExpressionKind::Assignment) continue;
        const auto& ae = asn.as<AssignmentExpression>();
        const Expression* l = strip(&ae.left());
        if (l->kind != ExpressionKind::NamedValue) continue;   // part-select targets: not drawn
        ModAssign a;
        a.lhs = std::string(l->as<NamedValueExpression>().symbol.name);
        const Expression* r = strip(&ae.right());
        bool inv = false;
        if (r->kind == ExpressionKind::UnaryOp) {
            const auto& u = r->as<UnaryExpression>();
            if (u.op == UnaryOperator::BitwiseNot || u.op == UnaryOperator::LogicalNot) {
                const Expression* o = strip(&u.operand());
                if (o->kind == ExpressionKind::NamedValue) { inv = true; r = o; }
            }
        }
        if (r->kind == ExpressionKind::NamedValue) {
            a.kind = inv ? "inv" : "buf";
            a.ins = {std::string(r->as<NamedValueExpression>().symbol.name)};
        } else {
            a.kind = "expr";
            // The ACCURATE lowering: the same slang-driven decomposer behind "Show RTL
            // Primitives". A `sel ? a : b` becomes a MUX cell with s/a/b — showing it as an
            // opaque 3-input box lost the select direction, which for a reset override is
            // exactly the dangerous kind of vague.
            DecomposeResult dr;
            Decomposer D(dr, *p_->sm);
            D.blockSym = &m;
            const std::string ref = D.expr(ae.right());
            D.nameOutput(ref, a.lhs,
                         Decomposer::bitsOf(&l->as<NamedValueExpression>().symbol), 0);
            a.cells = std::move(dr.cells);
            a.ins = dr.inputs;
        }
        out.push_back(std::move(a));
    }
    return out;
}

namespace {
/// Collect every UninstantiatedDef under `inst` with its hierarchical path. Generate blocks
/// descend the same way the sequential walk does.
void walkBlackboxes(const Scope& scope, const std::string& prefix,
                    std::vector<std::pair<std::string, std::string>>& out) {
    for (const Symbol& m : scope.members()) {
        switch (m.kind) {
            case SK::UninstantiatedDef:
                out.emplace_back(prefix + "." + std::string(m.name),
                                 std::string(m.as<UninstantiatedDefSymbol>().definitionName));
                break;
            case SK::Instance: {
                const auto& is = m.as<InstanceSymbol>();
                if (isRealInstance(is))
                    walkBlackboxes(is.body, prefix + "." + std::string(is.name), out);
                break;
            }
            case SK::GenerateBlock: {
                auto& gb = m.as<GenerateBlockSymbol>();
                if (!gb.isUninstantiated) walkBlackboxes(gb, prefix, out);
                break;
            }
            case SK::GenerateBlockArray:
                for (auto* e : m.as<GenerateBlockArraySymbol>().entries)
                    walkBlackboxes(*e, prefix, out);
                break;
            default:
                break;
        }
    }
}
}  // namespace

namespace {
/// COMPONENTS placement out of a DEF: instName -> {x, y (micron), orient}. Deliberately a
/// LEXICAL scan, not a full DEF parser — the COMPONENTS section is the only thing MBIST
/// planning needs, and a lexical pass survives the vendor variations (multi-line components,
/// `+ FIXED` vs `+ PLACED`, extra properties) that a strict grammar would reject.
struct DefPlacement { double x = 0, y = 0; std::string orient; };
struct DefDie { bool have = false; double x0 = 0, y0 = 0, x1 = 0, y1 = 0; };
bool readDefPlacements(const std::string& file, std::map<std::string, DefPlacement>& out,
                       DefDie& die, std::string& err) {
    std::ifstream in(file);
    if (!in) { err = "cannot read DEF: " + file; return false; }
    double units = 1000.0;   // DEF default when UNITS DISTANCE MICRONS is absent
    std::string line, cur;   // cur = the component name whose PLACED we are still looking for
    bool inComponents = false;
    std::vector<std::pair<double, double>> diePts;   // raw DIEAREA points, scaled at the end
    while (std::getline(in, line)) {
        // strip DEF comments ("#" to end of line)
        if (const auto h = line.find('#'); h != std::string::npos) line = line.substr(0, h);
        std::istringstream ls(line);
        std::vector<std::string> tok;
        for (std::string t; ls >> t;) tok.push_back(t);
        if (tok.empty()) continue;
        if (!inComponents) {
            if (tok[0] == "UNITS" && tok.size() >= 4 && tok[1] == "DISTANCE") {
                try { units = std::stod(tok[3]); } catch (...) {}
                if (units <= 0) units = 1000.0;
            } else if (tok[0] == "DIEAREA") {
                // DIEAREA ( x y ) ( x y ) … ;  — the die bounding box is the clustering scale.
                for (std::size_t i = 0; i + 2 < tok.size(); ++i) {
                    if (tok[i] != "(") continue;
                    try { diePts.emplace_back(std::stod(tok[i + 1]), std::stod(tok[i + 2])); }
                    catch (...) {}
                }
            } else if (tok[0] == "COMPONENTS") {
                inComponents = true;
            }
            continue;
        }
        if (tok[0] == "END" && tok.size() >= 2 && tok[1] == "COMPONENTS") break;
        // `- <instName> <cellName>` starts a component; its PLACED may be on a later line.
        if (tok[0] == "-" && tok.size() >= 2) cur = tok[1];
        for (std::size_t i = 0; i + 4 < tok.size(); ++i) {
            if (tok[i] != "PLACED" && tok[i] != "FIXED" && tok[i] != "COVER") continue;
            if (tok[i + 1] != "(") continue;
            try {
                DefPlacement p;
                p.x = std::stod(tok[i + 2]) / units;
                p.y = std::stod(tok[i + 3]) / units;
                // tok[i+4] == ")" → orientation is the token after it
                if (tok[i + 4] == ")" && i + 5 < tok.size()) p.orient = tok[i + 5];
                if (!cur.empty()) out[cur] = p;
            } catch (...) {}
            break;
        }
    }
    if (!diePts.empty()) {
        die.have = true;
        die.x0 = die.x1 = diePts.front().first / units;
        die.y0 = die.y1 = diePts.front().second / units;
        for (const auto& [px, py] : diePts) {
            const double x = px / units, y = py / units;
            die.x0 = std::min(die.x0, x); die.x1 = std::max(die.x1, x);
            die.y0 = std::min(die.y0, y); die.y1 = std::max(die.y1, y);
        }
    }
    if (out.empty()) err = "no placed COMPONENTS found in " + file;
    return true;
}
}  // namespace

/// Controller partitioning, modelled on the flow's own rules rather than a generic clustering:
///
///   * memories of DIFFERENT TYPE (SRAM / ROM / DRAM) never share a controller — the hard
///     partition applied before any geometry is considered;
///   * within a type, the DIE is TILED into a grid of rectangles — each the same aspect ratio
///     as the die, sized so ITS OWN diagonal is `clusterSizeRatio` percent of the die's — and two
///     memories are only PHYSICALLY eligible to share a controller when they land in the SAME
///     tile (CCR3/SCR still apply on top: same clock domain, power domain, etc. decide the rest).
///     That is the `set_memory_instance_options -physical_cluster_size_ratio` model: 0 → every
///     tile holds one memory (one controller per memory); 100 → one tile covers the whole die
///     (a single physical cluster per type). A memory exactly on the die's far edge is pulled
///     back into the last tile rather than spilling into a one-past-the-end tile of its own.
///
/// Placement comes from the DEF; a design with no DEF has no physical grouping to compute, so
/// nothing is grouped rather than something invented. `maxPerGroup` is an EXTRA cap (0 = none):
/// once a tile's group hits it, any further memory landing in that SAME tile starts a new,
/// second group for that tile rather than growing the first one past the cap.
void DesignDb::groupMemories(MemoryMapResult& res, double clusterSizeRatio, int maxPerGroup) {
    res.groups.clear();
    if (clusterSizeRatio < 0) clusterSizeRatio = 0;
    if (clusterSizeRatio > 100) clusterSizeRatio = 100;
    for (auto& mi : res.instances) mi.group = -1;

    // The grid is cut from the DIEAREA; with none in the DEF, fall back to the placed memories'
    // own bounding box so the ratio still means "part of the placed span".
    double x0 = res.dieX0, y0 = res.dieY0, x1 = res.dieX1, y1 = res.dieY1;
    if (x1 <= x0 || y1 <= y0) {
        bool first = true;
        for (const auto& m : res.instances) {
            if (m.matched < 0 || !m.placed) continue;
            if (first) { x0 = x1 = m.x; y0 = y1 = m.y; first = false; continue; }
            x0 = std::min(x0, m.x); x1 = std::max(x1, m.x);
            y0 = std::min(y0, m.y); y1 = std::max(y1, m.y);
        }
        if (first) return;   // nothing placed at all -> nothing to grid
    }
    const double dieW = std::max(x1 - x0, 1e-9), dieH = std::max(y1 - y0, 1e-9);
    const double cellW = dieW * clusterSizeRatio / 100.0;
    const double cellH = dieH * clusterSizeRatio / 100.0;

    // Type key = CCR1: one controller tests exactly one memory type.
    const auto typeOf = [&](const MemInstance& m) -> std::string {
        return m.matched >= 0 ? res.templates[static_cast<std::size_t>(m.matched)].type : "";
    };
    // Memories in a deterministic order (placement, then name) so the same design always
    // partitions the same way — a plan that reshuffles between runs is not reviewable.
    std::vector<int> order;
    for (std::size_t i = 0; i < res.instances.size(); ++i)
        if (res.instances[i].matched >= 0 && res.instances[i].placed)
            order.push_back(static_cast<int>(i));
    std::sort(order.begin(), order.end(), [&](int a, int b) {
        const auto &A = res.instances[a], &B = res.instances[b];
        if (A.x != B.x) return A.x < B.x;
        if (A.y != B.y) return A.y < B.y;
        return A.path < B.path;
    });

    // key = (type, grid column, grid row). A degenerate cell size (ratio == 0) falls back to
    // "every memory its own column" via its own order-index, without dividing by zero.
    struct CellKey { std::string type; long long cx, cy; };
    struct CellKeyLess {
        bool operator()(const CellKey& a, const CellKey& b) const {
            if (a.type != b.type) return a.type < b.type;
            if (a.cx != b.cx) return a.cx < b.cx;
            return a.cy < b.cy;
        }
    };
    std::map<CellKey, std::vector<int>, CellKeyLess> tiles;   // -> group indices, fill order

    for (std::size_t oi = 0; oi < order.size(); ++oi) {
        const int idx = order[oi];
        const auto& m = res.instances[static_cast<std::size_t>(idx)];
        long long cx = 0, cy = 0;
        if (cellW > 1e-9) {
            const double px = std::min(m.x - x0, dieW - 1e-9);
            cx = static_cast<long long>(std::floor(px / cellW));
        } else {
            cx = static_cast<long long>(oi);   // ratio == 0: unique per memory
        }
        if (cellH > 1e-9) {
            const double py = std::min(m.y - y0, dieH - 1e-9);
            cy = static_cast<long long>(std::floor(py / cellH));
        }
        auto& groupIds = tiles[CellKey{typeOf(m), cx, cy}];
        int best = -1;
        if (!groupIds.empty()) {
            const int last = groupIds.back();
            if (maxPerGroup <= 0 ||
                static_cast<int>(res.groups[static_cast<std::size_t>(last)].members.size()) < maxPerGroup)
                best = last;
        }
        if (best < 0) {
            MemoryMapResult::MemGroup g;
            g.x0 = g.x1 = m.x; g.y0 = g.y1 = m.y;
            res.groups.push_back(std::move(g));
            best = static_cast<int>(res.groups.size()) - 1;
            groupIds.push_back(best);
        }
        auto& gr = res.groups[static_cast<std::size_t>(best)];
        gr.members.push_back(idx);
        gr.x0 = std::min(gr.x0, m.x); gr.x1 = std::max(gr.x1, m.x);
        gr.y0 = std::min(gr.y0, m.y); gr.y1 = std::max(gr.y1, m.y);
        res.instances[static_cast<std::size_t>(idx)].group = best;
    }
    for (auto& g : res.groups) {
        for (int i : g.members) { g.cx += res.instances[static_cast<std::size_t>(i)].x;
                                   g.cy += res.instances[static_cast<std::size_t>(i)].y; }
        if (!g.members.empty()) {
            g.cx /= static_cast<double>(g.members.size());
            g.cy /= static_cast<double>(g.members.size());
        }
    }
}

namespace {
/// Algorithm cost as a multiple of N (N = number of addresses). March algorithms are quoted in
/// exactly these terms, so one number per family reproduces the cycle counts the插入 flow
/// reports (e.g. SMarchCHKBCil on an 8K memory ≈ 44N). Anything unknown falls back to a
/// conservative 20N and is FLAGGED in the plan's notes — an estimate must never be silently
/// presented as the tool's own number.
double algoCyclesPerAddress(const std::string& algo, bool* known) {
    struct Entry { const char* key; double n; };
    static const Entry kTable[] = {
        {"SMarchCHKBCil", 44}, {"SMarchCHKBvcd", 41}, {"SMarchCHKBI", 30},
        {"SMarchCHKB", 26},    {"March2", 2},         {"MarchC", 10},
        {"MarchCminus", 10},   {"March13N", 13},      {"MarchLR", 14},
        {"SMarch", 22},        {"Checkerboard", 4},   {"ReadOnly", 1},
        {"RowBar", 4},         {"ColumnBar", 4},      {"Retention", 2},
        {"DAGalColumn", 6},    {"DAGalRow", 6},       {"DAGalPat", 8},
    };
    for (const auto& e : kTable)
        if (algo == e.key) { if (known) *known = true; return e.n; }
    // Prefix match (SMarchCHKBCil_v2 and friends) before giving up.
    for (const auto& e : kTable)
        if (algo.rfind(e.key, 0) == 0) { if (known) *known = true; return e.n; }
    if (known) *known = false;
    return 20;
}
}  // namespace

/// The CLOCK ROOT a net resolves to — the memory's clock domain, derived from the RTL alone.
/// Unlike traceNetToSource (which stops the moment an instance drives the net), this keeps
/// going: it descends INTO the driving instance through the output port that drives the net,
/// crosses UP through input ports, and sees through pure alias/buffer assigns. That is the
/// difference between reporting the local net name (`mclk`) and the actual clock (`dco_clk`).
std::string DesignDb::clockRootOf(const std::string& scopeId, const std::string& netName) {
    if (netName.empty()) return {};
    ensureRegistered(scopeId, /*expandSelf*/ true);
    auto it = p_->inst.find(scopeId);
    if (it == p_->inst.end() || !isRealInstance(*it->second)) return {};
    const InstanceSymbol* cur = &it->second->as<InstanceSymbol>();
    std::string net = netName, best = netName;
    // The root must be INSTANCE-QUALIFIED: two `clkdiv` instances each have an internal `d`,
    // and returning the bare leaf name merged two independent clock domains into one — which
    // silently put memories of different domains on the same controller (a CCR3 breach the
    // planner could not even see).
    const auto qualify = [&](const InstanceSymbol* owner, const std::string& n) {
        const std::string h = owner->getHierarchicalPath();
        const auto dot = h.find('.');
        const std::string rel = dot == std::string::npos ? std::string() : h.substr(dot + 1);
        return rel.empty() ? n : rel + "/" + n;
    };
    best = qualify(cur, net);
    std::set<std::pair<const Symbol*, std::string>> seen;   // cycle guard
    for (int depth = 0; depth < 64; ++depth) {
        if (!seen.insert({cur, net}).second) break;
        const InstanceBodySymbol* body = &cur->body;
        if (auto di = p_->defInst.find(defInfo(*cur, *p_->sm).id); di != p_->defInst.end())
            body = &di->second->body;
        const ValueSymbol* netSym = findNet(*body, net);
        if (!netSym) break;
        best = qualify(cur, net);
        // (a) a child instance's OUTPUT drives it -> descend and keep walking inside.
        std::string port;
        if (const InstanceSymbol* drv = outputDriverOf(*body, netSym, &port); drv && !port.empty()) {
            cur = drv;
            net = port;
            continue;
        }
        // (b) a pure alias / buffer assign (`assign mclk = nodiv_mclk;`) -> follow its one read.
        {
            std::set<const ValueSymbol*> reads;
            bool aliasFound = false;
            for (const Symbol& mem : body->members()) {
                if (mem.kind != SK::ContinuousAssign) continue;
                const Expression& asn = mem.as<ContinuousAssignSymbol>().getAssignment();
                if (asn.kind != ExpressionKind::Assignment) continue;
                const auto& a = asn.as<AssignmentExpression>();
                std::set<const ValueSymbol*> writes;
                collectLhsTargets(a.left(), writes);
                if (!writes.count(netSym)) continue;
                reads.clear();
                ValueRefVisitor rv(reads);
                a.right().visit(rv);
                aliasFound = true;
                break;
            }
            if (aliasFound) {
                if (reads.size() != 1) break;          // real logic, not an alias: stop here
                net = std::string((*reads.begin())->name);
                continue;
            }
        }
        // (c) an input port of this scope -> cross up one level.
        if (!isInputPortNamed(*body, net)) break;
        const InstanceSymbol* parent = parentInstanceOf(*cur);
        if (!parent) { best = net; break; }            // primary input of the top: bare name
        const Symbol* pnet = nullptr;
        for (auto* pc : cur->getPortConnections())
            if (pc->port.kind == SK::Port && pc->port.name == net) { pnet = connNet(pc); break; }
        if (!pnet) break;
        cur = parent;
        net = std::string(pnet->name);
    }
    return best;
}

void DesignDb::setMemoryInstanceOptions(std::vector<MbistPlanOptions::InstanceOption> opts) {
    p_->memInstOpts = std::move(opts);
}
const std::vector<DesignDb::MbistPlanOptions::InstanceOption>&
DesignDb::memoryInstanceOptions() const {
    return p_->memInstOpts;
}

DesignDb::MbistPlan DesignDb::mbistPlan(const MbistPlanOptions& optIn) {
    // Session options apply unless the caller passed its own set (an explicit list wins, so a
    // what-if query can plan without disturbing the session).
    MbistPlanOptions opt = optIn;
    if (opt.instanceOptions.empty()) opt.instanceOptions = p_->memInstOpts;
    MbistPlan plan;
    MemoryMapResult mm = memoryMap(opt.libDir, opt.defFile);
    for (const auto& e : mm.errors) plan.errors.push_back(e);
    if (opt.clusterSizeRatio >= 0 && !mm.defFile.empty())
        groupMemories(mm, opt.clusterSizeRatio);

    // The design top the MEMORIES live under — `topInstances.front()` is whichever module the
    // elaboration happened to rank first (a stray leaf cell), not this design.
    std::string top = "design";
    for (const auto& mi : mm.instances)
        if (mi.matched >= 0) { top = mi.path.substr(0, mi.path.find('.')); break; }

    // ---- 1. per-memory facts. Everything here comes from the RTL and the memory library;
    // nothing needs a DEF, a UPF or an SDC to exist. ----
    bool anyUnknownAlgo = false;
    for (const auto& mi : mm.instances) {
        if (mi.matched < 0) continue;
        const auto& t = mm.templates[static_cast<std::size_t>(mi.matched)];
        MbistMemory m;
        m.path = mi.path;
        m.module = mi.module;
        m.type = t.type;
        m.algorithm = t.algorithm;
        m.operationSet = t.operationSet.empty() ? t.ports : t.operationSet;
        m.placed = mi.placed;
        m.x = mi.x;
        m.y = mi.y;
        m.dataOutStage = t.dataOutStage;
        m.bitGrouping = t.bitGrouping;
        m.rowAddrBits = t.rowAddrBits;
        m.colAddrBits = t.colAddrBits;
        m.bankAddrBits = t.bankAddrBits;
        // Physical cluster (CCR3) only exists when a DEF was clustered.
        if (!mm.defFile.empty() && opt.clusterSizeRatio >= 0)
            for (const auto& g : mm.instances)
                if (g.path == mi.path && g.group >= 0)
                    { m.physicalCluster = "pc" + std::to_string(g.group); break; }
        try { m.words = std::stoll(t.words); } catch (...) { m.words = 0; }
        try { m.mwPerMhz = std::stod(t.milliWattsPerMhz); } catch (...) { m.mwPerMhz = 0; }
        for (const auto& hp : t.hdlPorts)
            if (hp.direction == "out" && hp.width > m.width) m.width = hp.width;
        if (!m.width)
            for (const auto& hp : t.hdlPorts) if (hp.width > m.width) m.width = hp.width;
        // The CLOCK pin the template declares, and the clock ROOT its net resolves to. This is
        // the partition key the flow calls "clock domain" — derived from the design itself.
        for (const auto& mp : t.pins)
            if (mp.function == "Clock") { m.clockPin = mp.name.substr(0, mp.name.find('[')); break; }
        if (!m.clockPin.empty()) {
            const auto pos = mi.path.rfind('.');
            const std::string parent = pos == std::string::npos ? mi.path : mi.path.substr(0, pos);
            DriversResult dr = traceDrivers(mi.path, m.clockPin);
            m.clockNet = dr.netName;
            m.clockDomain = clockRootOf(parent, m.clockNet);
            if (m.clockDomain.empty()) m.clockDomain = m.clockNet;
        }
        if (m.clockDomain.empty()) m.clockDomain = "unclocked";
        // Per-instance overrides (set_memory_instance_options) — user-forced CCR3/CCR4 keys.
        // Applied AFTER the RTL-derived values so an override actually overrides.
        bool excluded = false;
        {
            const std::string leafName = mi.path.substr(mi.path.rfind('.') + 1);
            for (const auto& io : opt.instanceOptions) {
                if (!globMatch(io.pattern.c_str(), mi.path.c_str()) &&
                    !globMatch(io.pattern.c_str(), leafName.c_str()))
                    continue;
                if (io.exclude) excluded = true;
                if (!io.partitioningGroup.empty()) m.partitioningGroup = io.partitioningGroup;
                if (!io.physicalCluster.empty()) m.physicalCluster = io.physicalCluster;
                if (!io.powerDomain.empty()) m.powerDomain = io.powerDomain;
                if (!io.clockDomain.empty()) m.clockDomain = io.clockDomain;
                if (!io.controller.empty()) m.forcedController = io.controller;
                if (io.stepIndex >= 0) m.forcedStep = io.stepIndex;
            }
        }
        if (excluded) continue;   // -use_in_memory_bist_dft_specification off
        m.periodNs = opt.defaultPeriodNs;
        for (const auto& [name, per] : opt.clockPeriods)
            if (name == m.clockDomain) { m.periodNs = per; break; }
        const double freqMhz = m.periodNs > 0 ? 1000.0 / m.periodNs : 0;
        m.powerMw = m.mwPerMhz * freqMhz;
        bool knownAlgo = false;
        m.cycles = static_cast<long long>(algoCyclesPerAddress(m.algorithm, &knownAlgo) *
                                          static_cast<double>(m.words));
        if (!knownAlgo) anyUnknownAlgo = true;
        plan.memories.push_back(std::move(m));
    }
    if (plan.memories.empty()) {
        plan.notes.push_back("no memory instance matched a library template — nothing to plan");
        return plan;
    }
    if (anyUnknownAlgo)
        plan.notes.push_back("some algorithms are not in the cycle-cost table: their cycle/runtime "
                             "figures are a 20N ESTIMATE, not the algorithm's real length");

    // ---- 2. CONTROLLER partition — the Controller Compatibility Rules, evaluated one at a
    // time so every split can name the rule that caused it:
    //   CCR1 one memory TYPE per controller
    //   CCR2 DRAMs on a controller must have identical row/column/bank dimensions
    //   CCR3 identical {physical region, clock domain, power domain, memory cluster}
    //   CCR4 different partitioning_group labels never share a controller
    // Nothing here needs a DEF or a UPF: without them the physical-region and power-domain
    // components are simply uniform, and CCR3 reduces to the clock domain.
    const auto ruleBump = [&](const char* id, const std::string& why, bool applies) {
        for (auto& r : plan.rules)
            if (r.id == id) { ++r.splits; r.applies = r.applies || applies; return; }
    };
    plan.rules = {
        {"CCR1", "one memory type (SRAM/ROM/DRAM) per controller", 0, true},
        {"CCR2", "DRAMs sharing a controller need identical row/column/bank dimensions", 0, false},
        {"CCR3", "identical physical region, clock domain, power domain and memory cluster", 0, true},
        {"CCR4", "different partitioning_group labels never share a controller", 0, false},
        {"SCR1", "same algorithm", 0, true},
        {"SCR2", "same operation set", 0, true},
        {"SCR3", "same memory type", 0, true},
        {"SCR4", "DRAMs: same number of row/column/bank address bits", 0, false},
        {"SCR5", "same address dimensions (a deeper memory would idle the shallower one)", 0, true},
        {"SCR7", "bit groupings all-even or all-odd (bit slice 1 exempt)", 0, false},
        {"SCR9", "identical DataOutStage", 0, true},
        {"SCR10", "max_power_per_step / max_memories_per_step", 0, true},
        {"SCR11", "max_steps_per_controller / max_test_time_per_controller", 0, true},
    };
    // Which CCR separates two memories (empty = they may share a controller).
    const auto ccrSplit = [](const MbistMemory& a, const MbistMemory& b,
                             std::string& id) -> std::string {
        if (a.type != b.type) { id = "CCR1"; return "memory type " + a.type + " vs " + b.type; }
        if (a.type == "DRAM" && (a.rowAddrBits != b.rowAddrBits || a.colAddrBits != b.colAddrBits ||
                                 a.bankAddrBits != b.bankAddrBits)) {
            id = "CCR2";
            return "DRAM dimensions differ";
        }
        if (a.clockDomain != b.clockDomain) {
            id = "CCR3";
            return "clock domain " + a.clockDomain + " vs " + b.clockDomain;
        }
        if (a.powerDomain != b.powerDomain) {
            id = "CCR3";
            return "power domain " + (a.powerDomain.empty() ? "(none)" : a.powerDomain) + " vs " +
                   (b.powerDomain.empty() ? "(none)" : b.powerDomain);
        }
        if (a.physicalCluster != b.physicalCluster) {
            id = "CCR3";
            return "physical cluster " + (a.physicalCluster.empty() ? "(none)" : a.physicalCluster) +
                   " vs " + (b.physicalCluster.empty() ? "(none)" : b.physicalCluster);
        }
        if (a.partitioningGroup != b.partitioningGroup) {
            id = "CCR4";
            return "partitioning_group " +
                   (a.partitioningGroup.empty() ? "(none)" : a.partitioningGroup) + " vs " +
                   (b.partitioningGroup.empty() ? "(none)" : b.partitioningGroup);
        }
        id.clear();
        return {};
    };
    // (a) USER-ASSIGNED controllers first, so an explicit "these memories live on ctrl X"
    // decides the layout and the automatic rules fill in around it. The assignment is honoured
    // exactly as asked; whether it is LEGAL is checked afterwards and reported.
    for (std::size_t i = 0; i < plan.memories.size(); ++i) {
        auto& m = plan.memories[i];
        if (m.forcedController.empty()) continue;
        int ci = -1;
        for (std::size_t c = 0; c < plan.controllers.size(); ++c)
            if (plan.controllers[c].name == m.forcedController) { ci = static_cast<int>(c); break; }
        if (ci < 0) {
            MbistController c;
            c.name = m.forcedController;
            c.clockDomain = m.clockDomain;
            c.periodNs = m.periodNs;
            c.type = m.type;
            c.physicalCluster = m.physicalCluster;
            c.powerDomain = m.powerDomain;
            c.partitioningGroup = m.partitioningGroup;
            c.userDefined = true;
            c.ruleId = "user";
            c.ruleWhy = "assigned with set_memory_instance_options -controller";
            plan.controllers.push_back(std::move(c));
            ci = static_cast<int>(plan.controllers.size()) - 1;
        }
        m.controller = ci;
        plan.controllers[static_cast<std::size_t>(ci)].memories.push_back(static_cast<int>(i));
    }
    // (b) everything else: the CCR ladder.
    for (std::size_t i = 0; i < plan.memories.size(); ++i) {
        auto& m = plan.memories[i];
        if (m.type == "DRAM") {
            for (auto& r : plan.rules) if (r.id == "CCR2" || r.id == "SCR4") r.applies = true;
        }
        if (!m.partitioningGroup.empty())
            for (auto& r : plan.rules) if (r.id == "CCR4") r.applies = true;
        if (m.controller >= 0) continue;         // already placed by the user
        int ci = -1;
        std::string lastId, lastWhy;
        for (std::size_t c = 0; c < plan.controllers.size(); ++c) {
            // A user-defined controller holds exactly what the user put there — the automatic
            // pass must not quietly add more memories to it.
            if (plan.controllers[c].userDefined) continue;
            const auto& rep = plan.memories[static_cast<std::size_t>(
                plan.controllers[c].memories.front())];
            std::string id;
            const std::string why = ccrSplit(rep, m, id);
            if (why.empty()) { ci = static_cast<int>(c); break; }
            lastId = id;
            lastWhy = why;
        }
        if (ci < 0) {
            MbistController c;
            c.name = top + "_mbist_c" + std::to_string(plan.controllers.size() + 1);
            c.clockDomain = m.clockDomain;
            c.periodNs = m.periodNs;
            c.type = m.type;
            c.physicalCluster = m.physicalCluster;
            c.powerDomain = m.powerDomain;
            c.partitioningGroup = m.partitioningGroup;
            c.ruleId = lastId;
            c.ruleWhy = lastWhy;
            plan.controllers.push_back(std::move(c));
            ci = static_cast<int>(plan.controllers.size()) - 1;
            if (!lastId.empty()) ruleBump(lastId.c_str(), lastWhy, true);
        }
        m.controller = ci;
        plan.controllers[static_cast<std::size_t>(ci)].memories.push_back(static_cast<int>(i));
    }

    // (c) VALIDATE the user's own controllers against the same CCRs. A forced grouping is
    // honoured — the plan shows what was asked for — but a controller that spans two clock
    // domains or two memory types cannot actually be built, so every breach is named here
    // rather than discovered at insertion time.
    for (auto& ctrl : plan.controllers) {
        if (!ctrl.userDefined || ctrl.memories.size() < 2) continue;
        const auto& rep = plan.memories[static_cast<std::size_t>(ctrl.memories.front())];
        for (std::size_t k = 1; k < ctrl.memories.size(); ++k) {
            const auto& m = plan.memories[static_cast<std::size_t>(ctrl.memories[k])];
            std::string id;
            const std::string why = ccrSplit(rep, m, id);
            if (why.empty()) continue;
            const std::string msg = id + " violated: " + m.path.substr(m.path.rfind('.') + 1) +
                                    " vs " + rep.path.substr(rep.path.rfind('.') + 1) + " — " + why;
            ctrl.violations.push_back(msg);
            plan.notes.push_back(ctrl.name + ": " + msg +
                                 " (the controller was built as asked; this grouping cannot be "
                                 "inserted as-is)");
        }
    }

    // ---- 3. STEP packing — the Step Compatibility Rules. Memories in one step are tested in
    // PARALLEL, steps run in SEQUENCE, so SCR1..SCR9 decide what CAN share a step and SCR10
    // decides how much of it fits (power / count budgets). SCR11 checks the controller budgets.
    const auto scrSplit = [](const MbistMemory& a, const MbistMemory& b,
                             std::string& id) -> std::string {
        if (a.algorithm != b.algorithm) {
            id = "SCR1"; return "algorithm " + a.algorithm + " vs " + b.algorithm;
        }
        if (a.operationSet != b.operationSet) {
            id = "SCR2"; return "operation set " + a.operationSet + " vs " + b.operationSet;
        }
        if (a.type != b.type) { id = "SCR3"; return "memory type " + a.type + " vs " + b.type; }
        if (a.type == "DRAM" && (a.rowAddrBits != b.rowAddrBits || a.colAddrBits != b.colAddrBits ||
                                 a.bankAddrBits != b.bankAddrBits)) {
            id = "SCR4"; return "DRAM address bits differ";
        }
        if (a.words != b.words) {
            id = "SCR5";
            return "depth " + std::to_string(a.words) + " vs " + std::to_string(b.words) +
                   " words (the shallower memory would idle for the deeper one's whole run)";
        }
        if (a.bitGrouping && b.bitGrouping && a.bitGrouping != 1 && b.bitGrouping != 1 &&
            (a.bitGrouping % 2) != (b.bitGrouping % 2)) {
            id = "SCR7"; return "bit grouping parity differs";
        }
        if (a.dataOutStage != b.dataOutStage) {
            id = "SCR9";
            return "DataOutStage " + (a.dataOutStage.empty() ? "(none)" : a.dataOutStage) + " vs " +
                   (b.dataOutStage.empty() ? "(none)" : b.dataOutStage);
        }
        id.clear();
        return {};
    };
    for (std::size_t c = 0; c < plan.controllers.size(); ++c) {
        auto& ctrl = plan.controllers[c];
        for (int mi : ctrl.memories) {
            auto& m = plan.memories[static_cast<std::size_t>(mi)];
            if (m.bitGrouping)
                for (auto& r : plan.rules) if (r.id == "SCR7") r.applies = true;
            int chosen = -1;
            std::string lastId, lastWhy;
            // An explicitly requested step wins over the packing rules (the user is telling the
            // planner what the layout is, not asking it to choose).
            if (m.forcedStep >= 0) {
                for (int si : ctrl.steps)
                    if (plan.steps[static_cast<std::size_t>(si)].index == m.forcedStep)
                        { chosen = si; break; }
                if (chosen < 0) {
                    MbistStep st;
                    st.controller = static_cast<int>(c);
                    st.index = m.forcedStep;
                    st.ruleId = "user";
                    st.ruleWhy = "step forced with -step";
                    plan.steps.push_back(std::move(st));
                    chosen = static_cast<int>(plan.steps.size()) - 1;
                    ctrl.steps.push_back(chosen);
                }
            }
            for (int si : ctrl.steps) {
                if (chosen >= 0) break;
                auto& st = plan.steps[static_cast<std::size_t>(si)];
                const auto& first = plan.memories[static_cast<std::size_t>(st.members.front())];
                std::string id;
                if (const std::string why = scrSplit(first, m, id); !why.empty()) {
                    lastId = id; lastWhy = why;
                    continue;
                }
                if (opt.maxMemoriesPerStep > 0 &&
                    static_cast<int>(st.members.size()) >= opt.maxMemoriesPerStep) {
                    lastId = "SCR10";
                    lastWhy = "max_memories_per_step " + std::to_string(opt.maxMemoriesPerStep) +
                              " reached";
                    continue;
                }
                if (opt.maxPowerPerStepMw > 0 && st.powerMw + m.powerMw > opt.maxPowerPerStepMw) {
                    lastId = "SCR10";
                    lastWhy = "max_power_per_step " + std::to_string(opt.maxPowerPerStepMw) +
                              " mW would be exceeded";
                    continue;
                }
                chosen = si;
                break;
            }
            if (chosen < 0) {
                MbistStep st;
                st.controller = static_cast<int>(c);
                st.index = static_cast<int>(ctrl.steps.size());
                st.ruleId = lastId;
                st.ruleWhy = lastWhy;
                plan.steps.push_back(std::move(st));
                chosen = static_cast<int>(plan.steps.size()) - 1;
                ctrl.steps.push_back(chosen);
                if (!lastId.empty()) ruleBump(lastId.c_str(), lastWhy, true);
            }
            auto& st = plan.steps[static_cast<std::size_t>(chosen)];
            st.members.push_back(mi);
            st.powerMw += m.powerMw;
            st.cycles = std::max(st.cycles, m.cycles);
            st.runtimeNs = static_cast<double>(st.cycles) * ctrl.periodNs;
            m.step = st.index;
            m.interfaceId = "m" + std::to_string(st.members.size());
        }
        // Roll the steps up: sequential in time, peak in power.
        for (int si : ctrl.steps) {
            const auto& st = plan.steps[static_cast<std::size_t>(si)];
            ctrl.cycles += st.cycles;
            ctrl.runtimeNs += st.runtimeNs;
            ctrl.powerMw = std::max(ctrl.powerMw, st.powerMw);
        }
        // Controller register cost: the BIST engine's own state (address/data/comparator
        // registers) scales with the widest memory it drives — reported so a plan can be
        // compared, not as a synthesis number.
        int widest = 0;
        long long deepest = 0;
        for (int mi : ctrl.memories) {
            widest = std::max(widest, plan.memories[static_cast<std::size_t>(mi)].width);
            deepest = std::max(deepest, plan.memories[static_cast<std::size_t>(mi)].words);
        }
        int addrBits = 0;
        while ((1LL << addrBits) < deepest) ++addrBits;
        ctrl.flops = 3 * widest + 4 * addrBits + 40;
        // SCR11: the controller-level budgets. Exceeding one does not silently re-partition —
        // it is reported, because the fix (split the controller, or raise the budget) is a
        // decision, not something to guess at.
        if (opt.maxStepsPerController > 0 &&
            static_cast<int>(ctrl.steps.size()) > opt.maxStepsPerController) {
            plan.notes.push_back("SCR11 " + ctrl.name + ": " + std::to_string(ctrl.steps.size()) +
                                 " steps exceeds max_steps_per_controller " +
                                 std::to_string(opt.maxStepsPerController) +
                                 " — split the controller or raise the budget");
            ruleBump("SCR11", "max_steps_per_controller exceeded", true);
        }
        if (opt.maxTestTimePerControllerMs > 0 &&
            ctrl.runtimeNs / 1e6 > opt.maxTestTimePerControllerMs) {
            plan.notes.push_back("SCR11 " + ctrl.name + ": test time " +
                                 std::to_string(ctrl.runtimeNs / 1e6) +
                                 " ms exceeds max_test_time_per_controller " +
                                 std::to_string(opt.maxTestTimePerControllerMs) + " ms");
            ruleBump("SCR11", "max_test_time_per_controller exceeded", true);
        }
    }
    for (const auto& c : plan.controllers) {
        plan.totalRuntimeNs = std::max(plan.totalRuntimeNs, c.runtimeNs);  // controllers concurrent
        plan.peakPowerMw += c.powerMw;
    }
    if (mm.defFile.empty())
        plan.notes.push_back("no DEF supplied: the partition is by memory type and clock domain. "
                             "Adding a DEF only SPLITS controllers further by placement.");
    return plan;
}

DesignDb::MemoryMapResult DesignDb::memoryMap(const std::string& libDirArg,
                                              const std::string& defFile) {
    MemoryMapResult res;
    namespace fs = std::filesystem;
    std::error_code ec;
    // "" = re-use the last directory (report_memory_instance re-reports without re-passing it).
    const std::string libDir = libDirArg.empty() ? p_->memLibDir : libDirArg;
    if (libDir.empty()) {
        res.errors.push_back("no membistlib dir: pass one (or scan in the Memory tab first)");
        return res;
    }
    // ---- 1. the membistlib templates: a light key/value + Port() parse of *.tcd_memory ----
    if (fs::is_directory(libDir, ec)) {
        for (const auto& e : fs::directory_iterator(libDir, ec)) {
            const std::string f = e.path().string();
            if (f.rfind(".tcd_memory") != f.size() - 11) continue;
            std::ifstream in(f);
            if (!in) { res.errors.push_back("cannot read " + f); continue; }
            MemTemplate t;
            t.file = f;
            std::string line;
            MemPort* curPort = nullptr;
            MemPort pending;
            const auto trim = [](std::string v) {
                const auto a = v.find_first_not_of(" \t\r");
                const auto b = v.find_last_not_of(" \t\r;");
                return a == std::string::npos ? std::string() : v.substr(a, b - a + 1);
            };
            // Vendors write these files both ways — one property per line, and whole port
            // blocks compacted onto one line (`Port (CLK) { Function : Clock; }`). Split each
            // line into STATEMENTS at ';' and at the brace boundaries first, so both forms
            // parse identically; a line-at-a-time reader silently lost every compact pin
            // (which then read as "this memory has no clock").
            std::vector<std::string> stmts;
            while (std::getline(in, line)) {
                if (const auto h = line.find("//"); h != std::string::npos) line.erase(h);
                std::string cur2;
                for (const char ch : line) {
                    if (ch == ';') { stmts.push_back(cur2); cur2.clear(); }
                    else if (ch == '{' || ch == '}') {
                        stmts.push_back(cur2 + ch);
                        cur2.clear();
                    } else cur2 += ch;
                }
                if (!trim(cur2).empty()) stmts.push_back(cur2);
            }
            for (const std::string& raw : stmts) {
                std::string l = trim(raw);
                if (l.empty()) continue;
                // A statement that only closes a block still has to close the pending port.
                if (l == "}" || (l.size() > 1 && l.back() == '}' && l.find(':') == std::string::npos &&
                                 l.find('(') == std::string::npos)) {
                    if (curPort) { t.pins.push_back(pending); curPort = nullptr; }
                    continue;
                }
                if (!l.empty() && l.back() == '{') l = trim(l.substr(0, l.size() - 1));
                if (l.empty()) continue;
                // MemoryTemplate (NAME) {
                if (l.rfind("MemoryTemplate", 0) == 0) {
                    const auto o = l.find('('), c = l.find(')');
                    if (o != std::string::npos && c > o) t.name = trim(l.substr(o + 1, c - o - 1));
                    continue;
                }
                // Port (NAME) {   (case-insensitive first letter in the wild)
                if (l.rfind("Port", 0) == 0 || l.rfind("port", 0) == 0) {
                    const auto o = l.find('('), c = l.find(')');
                    if (o != std::string::npos && c > o) {
                        pending = MemPort{};
                        pending.name = trim(l.substr(o + 1, c - o - 1));
                        curPort = &pending;
                    }
                    continue;
                }
                const auto colon = l.find(':');
                if (colon == std::string::npos) continue;
                const std::string k = trim(l.substr(0, colon));
                const std::string v = trim(l.substr(colon + 1));
                if (curPort) {
                    if (k == "Function" || k == "function") curPort->function = v;
                    else if (k == "Direction" || k == "direction") curPort->direction = v;
                    else if (k == "Polarity" || k == "polarity") curPort->polarity = v;
                } else if (k == "MemoryType") t.type = v;
                else if (k == "CellName" && t.name.empty()) t.name = v;
                else if (k == "CellName") t.name = v;   // CellName is the authoritative match key
                else if (k == "Algorithm") t.algorithm = v;
                else if (k == "NumberOfWords") t.words = v;
                else if (k == "logicalPorts") t.ports = v;
                else if (k == "MilliWattsPerMegaHertz") t.milliWattsPerMhz = v;
                else if (k == "OperationSet") t.operationSet = v;
                else if (k == "DataOutStage") t.dataOutStage = v;
                else if (k == "transparentMode" || k == "TransparentMode") t.transparentMode = v;
                else if (k == "BitGrouping") { try { t.bitGrouping = std::stoi(v); } catch (...) {} }
                // LogicalAddressMap: `RowAddress[8:0] : Address [12:4];` — the LHS width is the
                // number of row/column/bank address bits the step-compatibility rules compare.
                else if (k.rfind("RowAddress", 0) == 0 || k.rfind("ColumnAddress", 0) == 0 ||
                         k.rfind("BankAddress", 0) == 0) {
                    int bits = 0;
                    if (const auto br = k.find('['); br != std::string::npos) {
                        int hi = 0, lo = 0;
                        if (std::sscanf(k.c_str() + br, "[%d:%d]", &hi, &lo) == 2)
                            bits = std::abs(hi - lo) + 1;
                    }
                    if (bits > 0) {
                        if (k.rfind("RowAddress", 0) == 0) t.rowAddrBits = bits;
                        else if (k.rfind("ColumnAddress", 0) == 0) t.colAddrBits = bits;
                        else t.bankAddrBits = bits;
                    }
                }
            }
            if (!t.name.empty()) res.templates.push_back(std::move(t));
            else res.errors.push_back("no CellName/MemoryTemplate name in " + f);
        }
    } else {
        res.errors.push_back("membistlib dir not readable: " + libDir);
    }
    // ---- 1b. the memory's VERILOG MODEL: `<CellName>.v` beside the templates. PORT-ONLY
    // recognition (只识别 port,不解析内部内容): only the module's port list is read —
    // slang's lazy elaboration never analyzes the body's statements, and diagnostics are
    // never requested, so a foundry model's exotic internals cannot break identification.
    // hdlPorts is therefore the model's OWN port declaration: names/directions/widths as
    // written, not inferred from anything. ----
    for (auto& t : res.templates) {
        // `<CellName>.v_interface` FIRST when the vendor ships it: it is the port declaration
        // with an empty body — literally the port-only model, nothing else to misparse. The
        // full `.v` is the fallback (still port-only in effect: the body is never analyzed).
        fs::path mv = fs::path(libDir) / (t.name + ".v_interface");
        if (!fs::is_regular_file(mv, ec)) mv = fs::path(libDir) / (t.name + ".v");
        if (!fs::is_regular_file(mv, ec)) continue;
        t.verilogModel = mv.string();
        try {
            auto tree = slang::syntax::SyntaxTree::fromFile(mv.string());
            if (!tree) { res.errors.push_back("cannot read model " + mv.string()); continue; }
            Compilation mc;
            mc.addSyntaxTree(tree.value());
            for (auto* ti : mc.getRoot().topInstances)
                if (std::string(ti->name) == t.name) { t.hdlPorts = portDicts(*ti); break; }
            if (t.hdlPorts.empty())
                res.errors.push_back("model " + mv.string() + " does not define module " + t.name);
        } catch (...) {
            res.errors.push_back("cannot parse model " + mv.string());
        }
    }
    // ---- 2. the design's blackbox instances ----
    std::vector<std::pair<std::string, std::string>> bbs;
    for (auto* top : p_->comp->getRoot().topInstances)
        walkBlackboxes(top->body, std::string(top->name), bbs);
    for (auto& [path, mod] : bbs) {
        MemInstance mi;
        mi.path = path;
        mi.module = mod;
        for (std::size_t i = 0; i < res.templates.size(); ++i)
            if (res.templates[i].name == mod) { mi.matched = static_cast<int>(i); break; }
        res.instances.push_back(std::move(mi));
    }
    std::stable_sort(res.instances.begin(), res.instances.end(),
                     [](const MemInstance& a, const MemInstance& b) {
                         return (a.matched >= 0) > (b.matched >= 0);
                     });
    // ---- 3. PLACEMENT from a DEF: physical position is what MBIST controller grouping is
    // built on (a controller's BIST bus / clock / repair chain should stay local). Instances
    // are matched by the DEF's component name, which is the flat hierarchical path — tried
    // both with '/' and '.' separators, and top-relative as well as fully qualified. ----
    if (!defFile.empty()) {
        std::map<std::string, DefPlacement> place;
        DefDie die;
        std::string derr;
        if (!readDefPlacements(defFile, place, die, derr)) {
            res.errors.push_back(derr);
        } else {
            if (!derr.empty()) res.errors.push_back(derr);
            res.defFile = defFile;
            if (die.have) {
                res.dieX0 = die.x0; res.dieY0 = die.y0;
                res.dieX1 = die.x1; res.dieY1 = die.y1;
                res.dieDiagonal = std::hypot(die.x1 - die.x0, die.y1 - die.y0);
            }
            const auto slash = [](std::string s) {
                for (char& c : s) if (c == '.') c = '/';
                return s;
            };
            for (auto& mi : res.instances) {
                std::string topRel = mi.path;
                if (const auto dot = topRel.find('.'); dot != std::string::npos)
                    topRel = topRel.substr(dot + 1);           // strip the implicit top
                const std::string cands[] = {mi.path, slash(mi.path), topRel, slash(topRel)};
                for (const auto& c : cands) {
                    const auto it = place.find(c);
                    if (it == place.end()) continue;
                    mi.placed = true;
                    mi.x = it->second.x;
                    mi.y = it->second.y;
                    mi.orient = it->second.orient;
                    ++res.placedCount;
                    break;
                }
            }
            if (res.placedCount == 0)
                res.errors.push_back("DEF read, but no memory instance name matched a component "
                                     "(check that the DEF is for this design level)");
        }
    }
    // Cache for the sessions' other consumers: get-ports orients blackbox pins from the model
    // / template, and report_memory_instance re-reports without re-passing the directory.
    p_->memTemplates = res.templates;
    p_->memLibDir = libDir;
    return res;
}

std::string DesignDb::evalNet(const std::string& topModule, const std::string& net,
                              const std::vector<std::pair<std::string, int>>& ports,
                              std::string* stuckAt) {
    // Find the requested top instance — by module name first (the planned-IP case: the module
    // was compiled as its own top), by instance name as a courtesy.
    const InstanceSymbol* top = nullptr;
    for (auto* t : p_->comp->getRoot().topInstances) {
        if (std::string(t->body.getDefinition().name) == topModule ||
            std::string(t->name) == topModule) { top = t; break; }
    }
    if (!top) return "X";
    SdcIndex ix;
    for (const auto& [n, v] : ports) ix.portCase[SdcIndex::norm(n)] = v;
    auto bodyOf = [this](const InstanceSymbol& s) -> const InstanceBodySymbol* {
        auto di = p_->defInst.find(defInfo(s, *p_->sm).id);
        return di != p_->defInst.end() ? &di->second->body : nullptr;
    };
    Implication impl(ix, p_->ensureAm(), bodyOf);
    const std::string v = triStr(impl.net(*top, net));
    if (v == "X" && stuckAt && !impl.firstStuck().empty()) *stuckAt = impl.firstStuck();
    return v;
}


ClockResetTreeResult DesignDb::clockResetTree(const std::string& sdcFile,
                                              const std::string& dftLibSetting,
                                              const ScanModeInput& scan, const CrQuery& q) {
    ClockResetTreeResult res;
    // Cell dictionary: tells us which module is an ICG/BUF/INV/MUX and — crucially — WHICH pin
    // is its clock input. Without it the walk has to stop at the first cell (slang knows nothing
    // about cell semantics); with it we can climb the whole clock tree.
    DftLibResult lib;
    if (!dftLibSetting.empty()) {
        lib = loadDftLib(dftLibSetting);
        for (auto& e : lib.errors) res.sdcErrors.push_back(e);
        for (auto& m : lib.missing) res.sdcErrors.push_back("cell library not readable: " + m);
    }
    SdcInfo sdc;
    if (!sdcFile.empty()) {
        // SDC is Tcl: evaluate it with the real interpreter, giving it the design's actual port
        // and pin names so `get_ports *clk*` glob-matches instead of being taken literally.
        SdcObjects objs;
        for (auto* t : p_->comp->getRoot().topInstances) {
            const InstanceBodySymbol& body = t->body;
            for (const Symbol& m : body.members()) {
                if (m.kind != SK::Port) continue;
                const auto& ps = m.as<PortSymbol>();
                objs.ports.emplace_back(ps.name);
                if (ps.direction == ArgumentDirection::In) objs.inputs.emplace_back(ps.name);
            }
        }
        // Hierarchical pins: every registered instance's ports (registration is lazy, so this
        // covers what has been expanded; unmatched literal targets are kept verbatim anyway).
        for (auto& [id, sym] : p_->inst) {
            if (!sym || !isRealInstance(*sym)) continue;
            for (const Symbol& m : sym->as<InstanceSymbol>().body.members())
                if (m.kind == SK::Port) objs.pins.emplace_back(id + "." + std::string(m.name));
        }
        sdc = parseSdcTcl(sdcFile, objs);
    }
    res.sdcErrors = sdc.errors;
    for (const SdcClock& c : sdc.clocks)
        res.clocks.push_back({c.name, c.targets, c.period, c.generated});
    // Enrich with the richer engine (sdc-core/clockgen.cpp): SdcTcl's own parse above never
    // resolves a generated clock's period (it reads -period only, which generated clocks don't
    // have) and drops -master_clock entirely -- both stay at their SdcClockInfo defaults (0 /
    // "") unless overwritten here. Same parse-then-generate pass `sdc-lint` already runs; matched
    // back onto `res.clocks` by NAME so the walk's own SdcIndex (built from `sdc` above, driving
    // clockAt/rootValue) is completely unchanged.
    if (!sdcFile.empty()) {
        SdcObjectSet s = sdcObjects();
        sdc::DesignObjects sobjs;
        if (!s.truncated) {
            sobjs.ports = std::move(s.ports);
            sobjs.inputs = std::move(s.inputs);
            sobjs.outputs = std::move(s.outputs);
            sobjs.pins = std::move(s.pins);
            sobjs.nets = std::move(s.nets);
            sobjs.cells = std::move(s.cells);
        }
        sdc::LintOptions lopt;
        lopt.designAware = !s.truncated;
        const sdc::LintReport rep = sdc::lintFile(sdcFile, lopt, sobjs);
        const sdc::ClockGenResult gen = sdc::generateClocks(rep.clocks);
        std::unordered_map<std::string, const sdc::GeneratedClock*> byName;
        for (const sdc::GeneratedClock& g : gen.clocks) byName[g.name] = &g;
        for (SdcClockInfo& c : res.clocks) {
            auto it = byName.find(c.name);
            if (it == byName.end()) continue;
            c.period = it->second->period;
            c.masterClock = it->second->masterClock;
            c.masterInferred = it->second->masterInferred;
            c.frequencyMhz = it->second->frequencyMhz;
            c.file = it->second->file;
            c.line = it->second->line;
        }
    }
    SdcIndex ix = buildSdcIndex(sdc);
    // User pin constraints (add_pin_constraint) enter the value calculus exactly like
    // set_case_analysis lines; the scan pass copies `ix`, so they hold in both passes.
    // hierCase is consulted by EXACT full-path match, but pins arrive in the Tessent
    // top-relative spelling (`PROCESSOR_1/...`) — key BOTH forms, or the constraint is
    // silently ignored ("add_pin_constraint 之后 run_drc 没有用").
    const auto mergeUserPins = [&](SdcIndex& into) {
        for (const auto& [pin, v] : q.pinConstraints) {
            const std::string n = SdcIndex::norm(pin);
            if (n.find('.') != std::string::npos) {
                into.hierCase[n] = v;
                for (auto* t : p_->comp->getRoot().topInstances) {
                    const std::string tn(t->name);
                    if (!tn.empty() && n.rfind(tn + ".", 0) != 0) into.hierCase[tn + "." + n] = v;
                }
            } else {
                into.portCase[n] = v;
            }
        }
    };
    mergeUserPins(ix);
    // The RESET view of the constraints. set_case_analysis states what the FUNCTIONAL mode ties
    // off; the reset DRC asks about TEST mode, and a functional constant is no evidence the
    // reset is inactive while the chain shifts — an SDC line was making resets read "OK" that
    // nothing in the test setup actually holds. So resets see the SDC's clocks (structure) but
    // NOT its case analysis; what they do see is the DFT plan's own declarations
    // (add_pin_constraint) and the planned muxes.
    SdcIndex ixRst = buildSdcIndex(sdc);
    ixRst.hierCase.clear();
    ixRst.portCase.clear();
    mergeUserPins(ixRst);
    auto& am = p_->ensureAm();

    // getHierarchicalPath() walks up the parent chain and BUILDS A STRING every time; the walk
    // calls it several times per hop, so on a big design it dominates. It is immutable per
    // instance — cache it. (Pure speed: identical results, verified by the item/hop counts.)
    std::unordered_map<const InstanceSymbol*, std::string> hpCache;
    auto hpath = [&hpCache](const InstanceSymbol& s) -> const std::string& {
        auto it = hpCache.find(&s);
        if (it == hpCache.end()) it = hpCache.emplace(&s, s.getHierarchicalPath()).first;
        return it->second;
    };

    // Representative body per instance, cached: defInfo() rebuilds a "<design>|<abs path>" id
    // string on every call and the map is keyed by it, so this was pure per-hop overhead.
    std::unordered_map<const InstanceSymbol*, const InstanceBodySymbol*> bodyCache;
    auto repBody = [this, &bodyCache](const InstanceSymbol& s) -> const InstanceBodySymbol* {
        auto it = bodyCache.find(&s);
        if (it == bodyCache.end()) {
            auto di = p_->defInst.find(defInfo(s, *p_->sm).id);
            it = bodyCache.emplace(&s, di != p_->defInst.end() ? &di->second->body : &s.body).first;
        }
        return it->second;
    };
    // Does the SDC constrain anything by HIERARCHICAL name? When not (the common case) the walk
    // can skip building and normalising a full path on every hop.
    const bool ixHasHier = !ix.hierClocks.empty() || !ix.hierCase.empty();

    auto bodyOf = [this](const InstanceSymbol& s) -> const InstanceBodySymbol* {
        auto di = p_->defInst.find(defInfo(s, *p_->sm).id);
        return di != p_->defInst.end() ? &di->second->body : nullptr;
    };
    // One engine for the whole run: its memo is what makes a widely-fanned-out test signal
    // (scan_mode feeding hundreds of gates) cost one resolution instead of hundreds.
    Implication impl(ix, am, bodyOf);
    // Reset walks resolve ICG enables / mux selects under the same rule: functional case
    // analysis is not test mode. Separate memo, because the same net can answer differently.
    Implication implRst(ixRst, am, bodyOf);

    // Walk ONE (owner, net) to its source, recording hops/elements and computing the value.
    // `ix`/`impl` are PARAMETERS (shadowing the enclosing ones on purpose) so the very same
    // walk can be replayed under a different constraint set — that is how the scan-mode
    // dimension re-walks each path with the DFT signals forced.
    // MEMO for the climb. A clock tree is a DAG, not a tree: thousands of register groups share
    // the same upstream spine, and without this every group re-walks that spine from its own flop
    // — O(groups × depth), which is the one place this analysis blows up on a large chip. The
    // tail from a given (instance, net) is independent of how the walk arrived there, so the
    // first group to reach it does the work and every later one splices the stored tail.
    // `inverted` is the only carried state, and it is stored as a DELTA so it composes.
    struct Tail {
        std::vector<std::string> path, elems;
        bool invertedDelta = false;
        std::string terminus, detail, clockName, rootValue;
        std::string terminusFile;
        int terminusLine = 0;
    };
    using MemoKey = std::pair<const InstanceSymbol*, std::string>;
    std::map<MemoKey, Tail> memoF, memoS;   // functional / scan-mode pass keep separate memos
    std::map<MemoKey, Tail> memoR;          // reset pass: same design, different constraint view
    // A summary answer throws the per-group paths away, so building them is pure waste — and on
    // a 2M-register design that is millions of string allocations for nothing. Skip recording
    // detail entirely in that mode; the memo still caches the SCALAR result, so the walk keeps
    // its full speed-up.
    const bool wantDetail = !q.summary;
    // Escape hatch: DFT_NO_WALK_MEMO=1 walks every path from scratch. The memo is pure caching,
    // so both settings MUST produce byte-identical output — that is how the equivalence of this
    // optimisation is checked against a real design, not by aggregate counts.
    // NB: an env var set to the EMPTY string still makes getenv() return non-null, so a shell
    // doing `VAR= cmd` would silently disable the memo. Require a real, non-"0" value.
    auto envOn = [](const char* k) {
        const char* v = std::getenv(k);
        return v && *v && std::strcmp(v, "0") != 0;
    };
    const bool memoOff = envOn("DFT_NO_WALK_MEMO");
    // DFT_WALK_STATS=1 reports how much the memo actually saved: hops EXECUTED versus hops in
    // the output. Their ratio is the scaling factor on a design where the clock tree fans out.
    const bool wantStats = envOn("DFT_WALK_STATS");
    long long stepsRun = 0, memoHits = 0;
    // Fine-grained accounting: the climb, the per-group bookkeeping around it, and the scan pass
    // are three different costs and guessing which dominates has already misled me twice.
    double nsWalk = 0, nsGroup = 0, nsScan = 0;
    auto clk = [] { return std::chrono::steady_clock::now(); };

    // Resolving the owning instance was done per ITEM via a std::map keyed by the full
    // hierarchical path; a register block yields several items (clock + resets) and neighbouring
    // blocks repeat the same owner, so this is cached too.
    std::unordered_map<std::string, const InstanceSymbol*> ownerCache;
    auto ownerOf = [&](const std::string& id) -> const InstanceSymbol* {
        auto c = ownerCache.find(id);
        if (c != ownerCache.end()) return c->second;
        ensureRegistered(id, false);
        auto it = p_->inst.find(id);
        const InstanceSymbol* r = (it != p_->inst.end() && isRealInstance(*it->second))
                                      ? &it->second->as<InstanceSymbol>() : nullptr;
        ownerCache.emplace(id, r);
        return r;
    };

    auto walk = [&](CrPathItem& item, const SdcIndex& ix, Implication& impl,
                    std::map<MemoKey, Tail>& memo, const InstanceSymbol* owner) {
        const InstanceSymbol* cur = owner ? owner : ownerOf(item.ownerInstanceId);
        if (!cur || !isRealInstance(*cur)) { item.terminus = "undriven"; item.value = "X"; return; }
        std::string net = item.net;
        bool inverted = false;
        std::string rootValue = "X";
        // When we descend into a module we already hold the exact internal symbol; re-finding it
        // by NAME in the definition's representative body is fragile (different Symbol objects,
        // and the name may not be a direct member). Carry the symbol across the hop instead.
        const ValueSymbol* pending = nullptr;

        // Points visited on THIS walk, so their tails can be published once it terminates.
        struct Visit { const InstanceSymbol* inst; std::string net; std::size_t p, e; bool inv; };
        std::vector<Visit> visits;

        for (int depth = 0; depth < 256; ++depth) {
            // Only memoise states entered WITHOUT a carried symbol: `pending` is extra context
            // from the descend hop, so a state holding one is not interchangeable with the same
            // (instance, net) reached by name.
            if (!pending && !memoOff) {
                const MemoKey k{cur, net};
                if (auto m = memo.find(k); m != memo.end()) {
                    const Tail& t = m->second;
                    item.path.insert(item.path.end(), t.path.begin(), t.path.end());
                    item.elems.insert(item.elems.end(), t.elems.begin(), t.elems.end());
                    inverted = (inverted != t.invertedDelta);
                    item.terminus = t.terminus;
                    item.detail = t.detail;
                    item.terminusFile = t.terminusFile;
                    item.terminusLine = t.terminusLine;
                    if (!t.clockName.empty()) item.clockName = t.clockName;
                    rootValue = t.rootValue;
                    // States visited BEFORE this hit are still new and must be published: their
                    // tail is their own prefix plus the tail we just spliced in.
                    ++memoHits;
                    break;
                }
                visits.push_back({cur, net, item.path.size(), item.elems.size(), inverted});
            }

            // Representative body, CACHED. defInfo() built a definition id (design name + the
            // absolute source path) on every single hop and then looked it up in a map keyed by
            // that long string — one of the two things that made a hop cost ~20 us.
            const InstanceBodySymbol* body = repBody(*cur);
            ++stepsRun;
            if (wantDetail) item.path.push_back(hpath(*cur) + ":" + net);

            // SDC clock defined directly on this hierarchical net (a generated/internal clock
            // point): the value is 010 FROM HERE regardless of what drives it upstream.
            // Building `full` (and normalising it) per hop is the other hot cost, and it is only
            // needed when the SDC actually has hierarchical targets — usually it has none.
            std::string full;
            if (ixHasHier) {
                full = hpath(*cur) + "." + net;
                if (const std::string cn = ix.clockAt(full); !cn.empty()) {
                    item.terminus = "pi";
                    item.detail = full;
                    item.clockName = cn;
                    rootValue = "010";
                    break;
                }
            }
            if (ixHasHier)
            if (auto hc = ix.hierCase.find(SdcIndex::norm(full)); hc != ix.hierCase.end()) {
                item.terminus = "pi";
                item.detail = full;
                rootValue = hc->second ? "1" : "0";
                break;
            }

            const ValueSymbol* netSym = pending ? pending : findNet(*body, net);
            pending = nullptr;
            if (!netSym) { item.terminus = "undriven"; break; }
            // slang's AnalysisManager holds driver data for ONE representative body per
            // definition. After descending into a *different* instance of the same module the
            // symbol we carry has no drivers, which used to surface as a bogus "undriven".
            // Fall back to the same-named symbol in the representative body.
            if (am.getDrivers(*netSym).empty()) {
                if (const ValueSymbol* rep = findNet(*body, net); rep && rep != netSym) netSym = rep;
            }

            // Source location of the RTL construct driving this net, as a "|file=..|line=.."
            // tail. Lets the schematic's Show HDL Definition jump to the exact `assign`
            // statement instead of only opening the module that contains it.
            auto srcTail = [&](const ValueSymbol& vs) -> std::string {
                const Expression* e = drivingExprOf(am, vs);
                if (!e) return {};
                try {
                    const auto loc = e->sourceRange.start();
                    if (!loc) return {};
                    return "|file=" + p_->sm->getFullPath(loc.buffer()).string() +
                           "|line=" + std::to_string(p_->sm->getLineNumber(loc));
                } catch (...) { return {}; }
            };

            // logic driver: see through buf/inv chains, stop at real gates
            bool sawLogic = false, sawInstance = false, sawSeq = false;
            std::string detail, seqDetail, seqFile, logicFile;
            int seqLine = 0, logicLine = 0;
            for (auto& [d, range] : am.getDrivers(*netSym)) {
                if (d->isInputPort()) continue;
                const Symbol* cs = d->containingSymbol;
                if (cs->kind == SK::Instance) { sawInstance = true; detail = cs->getHierarchicalPath(); }
                else {
                    sawLogic = true;
                    detail = (d->kind == slang::analysis::DriverKind::Continuous) ? "assign" : srcLabel(d->source);
                    // Location of the blocking statement: lets a "logic" terminus surface as a
                    // REAL logic node in the debug schematic (Show HDL / decompose / trace),
                    // exactly like the sequential terminus does.
                    try {
                        const auto sr0 = d->getSourceRange();
                        logicFile = p_->sm->getFullPath(sr0.start().buffer()).string();
                        logicLine = static_cast<int>(p_->sm->getLineNumber(sr0.start()));
                    } catch (...) { logicFile.clear(); logicLine = 0; }
                    // A FLIP-FLOP output. Saying "logic" here hides the DFT fact that matters:
                    // a registered value cannot be forced combinationally, so in scan mode this
                    // net is uncontrollable unless a control point is inserted. Name the flop AND
                    // its own async reset — that reset is the candidate control point.
                    if (cs->kind == SK::ProceduralBlock) {
                        const SeqElement se = extractSeq(cs->as<ProceduralBlockSymbol>(),
                                                         hpath(*cur), *p_->sm, cur);
                        if (!se.clocks.empty()) {
                            sawSeq = true;
                            seqFile = se.file; seqLine = se.line;
                            seqDetail = hpath(*cur) + "." + net + " <- flop @" +
                                        (se.clocks.empty() ? "" : se.clocks[0].net);
                            if (!se.asyncResets.empty())
                                seqDetail += ", async reset " + se.asyncResets[0].net +
                                             " (insert the DFT control point here)";
                            else
                                seqDetail += ", no async reset";
                        }
                    }
                }
            }
            // The analysis found NOTHING: on a non-representative instance (drivers are kept
            // for one instance per definition) that is the NORMAL case, not proof the net is
            // undriven. Classify from this instance's own AST instead — this is what turned
            // 114 of 121 resets into a meaningless "undriven" on the real design.
            if (!sawInstance && !sawLogic) {
                const StructDrivers sd = structuralDriversOf(*netSym);
                if (!sd.assigns.empty()) {
                    sawLogic = true;
                    detail = "assign";
                    try {
                        const auto& loc0 = sd.assigns.front()->location;
                        logicFile = p_->sm->getFullPath(loc0.buffer()).string();
                        logicLine = static_cast<int>(p_->sm->getLineNumber(loc0));
                    } catch (...) { logicFile.clear(); logicLine = 0; }
                }
                for (const ProceduralBlockSymbol* pb : sd.procs) {
                    sawLogic = true;
                    detail = "always";
                    try {
                        logicFile = p_->sm->getFullPath(pb->location.buffer()).string();
                        logicLine = static_cast<int>(p_->sm->getLineNumber(pb->location));
                    } catch (...) { logicFile.clear(); logicLine = 0; }
                    const SeqElement se = extractSeq(*pb, hpath(*cur), *p_->sm, cur);
                    if (!se.clocks.empty()) {
                        sawSeq = true;
                        seqFile = se.file; seqLine = se.line;
                        seqDetail = hpath(*cur) + "." + net + " <- flop @" + se.clocks[0].net;
                        if (!se.asyncResets.empty())
                            seqDetail += ", async reset " + se.asyncResets[0].net +
                                         " (insert the DFT control point here)";
                        else
                            seqDetail += ", no async reset";
                    }
                }
            }
            // See-through applies when the net is driven by a lone continuous assign OR by a
            // `wire x = ...;` INITIALIZER. The latter reports ZERO drivers (slang's analysis
            // does not track initializers), so this must run even when sawLogic is false —
            // gating on sawLogic alone dead-ended every `wire mclk_pc = mclk;` style clock.
            if (!sawInstance) {
                if (auto thr = seeThroughAssign(am, *netSym)) {
                    if (wantDetail) item.elems.push_back((thr->second ? "inv@" : "buf@") + hpath(*cur) + ":" + net + srcTail(*netSym));
                    if (thr->second) inverted = !inverted;
                    net = thr->first;
                    continue;   // same instance, upstream net
                }
                // RTL clock gate (`assign gclk = clk & en`): SHOW it as an ICG stage and keep
                // climbing the clock operand. The enable's test-mode state is annotation, not a
                // blocker — DFT control of that enable is exactly what the user decides later.
                if (auto mx = muxThroughByImplication(am, *netSym, *cur, impl)) {
                    if (wantDetail) item.elems.push_back("mux@" + hpath(*cur) + ":" + net +
                                         "#" + mx->enableNet + srcTail(*netSym));
                    net = mx->clockNet;
                    continue;
                }
                auto g = gateThroughByImplication(am, *netSym, *cur, impl);
                if (!g) g = seeThroughGate(am, *netSym);   // fall back to the old heuristic
                if (g) {
                    if (wantDetail) item.elems.push_back("icg@" + hpath(*cur) + ":" + net +
                                         "#en=" + g->enableNet + srcTail(*netSym));
                    net = g->clockNet;
                    continue;
                }
                if (sawSeq) {     // registered value: uncontrollable in scan without a control point
                    item.terminus = "sequential";
                    item.detail = seqDetail;
                    item.terminusFile = seqFile;
                    item.terminusLine = seqLine;
                    break;
                }
                // ZERO drivers but a real RHS: `wire x = a | b;` — slang's analysis skips
                // INITIALIZERS, so this multi-input assign used to die as "undriven" with an
                // EMPTY detail. That empty detail then broke the FIX POINT (fell back to the
                // flop's own net) and planted a second mux in series with the upstream one
                // ("reset 重复修复"). It is a LOGIC stop, and the net itself is the CONVERGE
                // POINT — multiple reset sources meet here, one control point covers them all.
                if (!sawLogic && !sawSeq) {
                    const Expression* rhs0 = netSym->getInitializer();
                    if (!rhs0) {
                        const StructDrivers sd0 = structuralDriversOf(*netSym);
                        if (sd0.procs.empty() && sd0.instOuts.empty() && sd0.assigns.size() == 1) {
                            const Expression& a0 = sd0.assigns.front()->getAssignment();
                            if (a0.kind == ExpressionKind::Assignment)
                                rhs0 = &a0.as<AssignmentExpression>().right();
                        }
                    }
                    if (rhs0) {
                        item.terminus = "logic";
                        item.detail = hpath(*cur) + "." + net +
                                      " <- assign (multi-source converge point)";
                        try {
                            item.terminusFile = p_->sm->getFullPath(netSym->location.buffer()).string();
                            item.terminusLine = static_cast<int>(p_->sm->getLineNumber(netSym->location));
                        } catch (...) {}
                        break;
                    }
                }
                if (sawLogic) {   // real combinational logic we cannot see through
                    // CONSTANT tie (`assign dbg_rst = 1'b0;` / `wire x = 1'b1;`): FOLD it —
                    // the value calculus must COMPUTE the real 0/1, never default a tie to X
                    // (user: dbg_rst tie0 read X). The shared finalization below applies the
                    // accumulated inverter chain to rootValue.
                    const Expression* rhs = netSym->getInitializer();
                    if (!rhs) {
                        const StructDrivers sd2 = structuralDriversOf(*netSym);
                        if (sd2.procs.empty() && sd2.instOuts.empty() && sd2.assigns.size() == 1) {
                            const Expression& a2 = sd2.assigns.front()->getAssignment();
                            if (a2.kind == ExpressionKind::Assignment)
                                rhs = &a2.as<AssignmentExpression>().right();
                        }
                    }
                    if (rhs) {
                        try {
                            EvalContext ctx(*netSym);
                            const slang::ConstantValue cv = rhs->eval(ctx);
                            if (cv.isInteger() && !cv.integer().hasUnknown())
                                rootValue = (cv.integer() == 0) ? "0" : "1";
                        } catch (...) {}
                    }
                    item.terminus = "logic";
                    // Lead with the NET PATH: the fix point is derived from the first token of
                    // detail, and a bare "assign" label sent every logic-terminus fix to a
                    // nonsense target. The human label follows after " <- ".
                    item.detail = hpath(*cur) + "." + net + " <- " + detail;
                    item.terminusFile = logicFile;
                    item.terminusLine = logicLine;
                    break;
                }
                // no drivers at all -> fall through to instance-output / port handling
            }
            // Driven by a child instance: if the cell library says it is a clock cell, HOP
            // THROUGH it via its declared clock_in pin and keep climbing; otherwise stop here.
            const InstanceSymbol* drv = outputDriverOf(*body, netSym);
            if (sawInstance && !drv) { item.terminus = "instance"; item.detail = detail; break; }
            if (drv) {
                const std::string mod(drv->body.getDefinition().name);
                auto ci = lib.cells.find(mod);
                if (ci == lib.cells.end()) {
                    // Not a library cell. In RTL the clock runs through ordinary MODULES
                    // (omsp_clock_gate, omsp_clock_mux, …) — slang can see inside those, so
                    // DESCEND through the driving output port and keep walking. Stopping here
                    // is what made every RTL clock read "no create_clock reached".
                    const Symbol* internal = nullptr;
                    std::string outPort;
                    for (auto* pc : drv->getPortConnections()) {
                        if (pc->port.kind != SK::Port) continue;
                        const auto& ps = pc->port.as<PortSymbol>();
                        if (ps.direction != ArgumentDirection::Out) continue;
                        if (connNet(pc) != netSym) continue;
                        internal = ps.internalSymbol;
                        outPort = std::string(ps.name);
                        break;
                    }
                    if (const auto* iv = internal ? internal->as_if<ValueSymbol>() : nullptr) {
                        // Record the REAL boundary crossing: the clock/reset leaves this child
                        // module through output port `outPort`. The schematic view draws the
                        // module box with exactly this pin — real hierarchy, real pin name.
                        if (wantDetail) item.elems.push_back("xdn@" + hpath(*drv) + ":" + outPort);
                        cur = drv;                       // step INTO the module
                        net = std::string(iv->name);
                        pending = iv;                    // exact symbol, no name re-lookup
                        continue;
                    }
                    item.terminus = "instance";          // blackbox: nothing to see inside
                    item.detail = hpath(*drv);
                    break;
                }
                const ClockCell& cell = ci->second;
                const std::string inst = hpath(*drv);
                // Net attached to one of this instance's pins, in the CURRENT scope.
                auto pinNet = [&](const std::string& pin) -> std::string {
                    for (auto* pc : drv->getPortConnections())
                        if (pc->port.kind == SK::Port && pc->port.name == pin)
                            if (const Symbol* s = connNet(pc)) return std::string(s->name);
                    return {};
                };
                // The cell's REAL output pin driving the net we walked in on (schematic view
                // draws the cell with its actual pin names, not invented CK/GCK labels).
                auto cellOutPin = [&]() -> std::string {
                    for (auto* pc : drv->getPortConnections()) {
                        if (pc->port.kind != SK::Port) continue;
                        if (pc->port.as<PortSymbol>().direction != ArgumentDirection::Out) continue;
                        if (connNet(pc) == netSym) return std::string(pc->port.name);
                    }
                    return {};
                };
                // Structured tail shared by every cell elem: |net=<driven net>|in=..|out=..|mod=..
                auto cellInfo = [&](const std::string& inPin) {
                    return "|net=" + net + "|in=" + inPin + "|out=" + cellOutPin() + "|mod=" + mod;
                };

                // A clock cell is only TRANSPARENT under a condition; traversing it
                // unconditionally would invent a clock path that does not exist in test.
                if (!cell.muxSel.empty()) {
                    // MUX: pass only when the select is a known constant. S=0 -> in0, S=1 -> in1.
                    const std::string selNet = pinNet(cell.muxSel);
                    const std::string sel = selNet.empty() ? "X" : triStr(impl.net(*cur, selNet));
                    if (sel == "0" || sel == "1") {
                        const std::string dataPin = (sel == "1") ? cell.muxIn1 : cell.muxIn0;
                        const std::string up = dataPin.empty() ? "" : pinNet(dataPin);
                        if (!up.empty()) {
                            if (wantDetail) item.elems.push_back("mux@" + inst + "#" + sel + cellInfo(dataPin));
                            net = up;
                            continue;
                        }
                    }
                    item.terminus = "instance";
                    item.detail = inst + " [mux sel=" + sel + "]";
                    break;   // select unknown -> the clock through it is X
                }
                if (!cell.enable.empty() || !cell.enableInv.empty()) {
                    // ICG: passes only when an enable is asserted (…_inv pins assert on 0).
                    bool open = false;
                    std::string why = "en=X";
                    for (const std::string& e : cell.enable) {
                        const std::string n2 = pinNet(e);
                        const std::string v = n2.empty() ? "X" : triStr(impl.net(*cur, n2));
                        if (v == "1") { open = true; why = e + "=1"; break; }
                    }
                    if (!open)
                        for (const std::string& e : cell.enableInv) {
                            const std::string n2 = pinNet(e);
                            const std::string v = n2.empty() ? "X" : triStr(impl.net(*cur, n2));
                            if (v == "0") { open = true; why = e + "=0"; break; }
                        }
                    if (!open) {
                        item.terminus = "instance";
                        item.detail = inst + " [" + cell.role + " gated, " + why + "]";
                        break;   // gate closed (or enable unknown) -> no clock downstream
                    }
                    if (!cell.clockIn.empty()) {
                        const std::string up = pinNet(cell.clockIn.front());
                        if (!up.empty()) {
                            if (wantDetail) item.elems.push_back(cell.role + "@" + inst + "#" + why +
                                                 cellInfo(cell.clockIn.front()));
                            if (cell.inverting) inverted = !inverted;
                            net = up;
                            continue;
                        }
                    }
                }
                // Unconditional pass-through: buffer / inverter / shaper (one clock input,
                // no enable and no select — nothing can block it).
                if (cell.enable.empty() && cell.enableInv.empty() && cell.muxSel.empty() &&
                    cell.clockIn.size() == 1) {
                    const std::string up = pinNet(cell.clockIn.front());
                    if (!up.empty()) {
                        if (wantDetail) item.elems.push_back(cell.role + "@" + inst +
                                             cellInfo(cell.clockIn.front()));
                        if (cell.inverting) inverted = !inverted;
                        net = up;
                        continue;
                    }
                }
                item.terminus = "instance";
                item.detail = inst + " [" + cell.role + "]";
                break;
            }

            // input port -> primary input, or cross up one level
            if (!isInputPortNamed(*body, net)) {
                // Nothing drives this net and it is not an input we can climb through. The
                // overwhelmingly common cause on a gate-level netlist is a standard cell whose
                // Verilog model is MISSING from the filelist: slang cannot resolve the
                // instantiation, the analysis reports zero drivers, and the walk lands here.
                // "undriven" with an empty detail told the user nothing, so name the situation.
                item.terminus = "undriven";
                for (const Symbol& m : body->members()) {
                    // slang represents an instantiation whose module it could NOT find as an
                    // UninstantiatedDefSymbol, not an Instance — which is exactly the standard
                    // cell case (a .vg netlist whose cell models are not in the filelist).
                    if (m.kind == SK::UninstantiatedDef) {
                        const auto& ud = m.as<UninstantiatedDefSymbol>();
                        // Port connections of an unresolved instantiation are un-typed, so slang
                        // hands them back as AssertionExprs; the ordinary `.Z(net)` form is a
                        // Simple one wrapping the expression.
                        bool drivesIt = false;
                        for (const slang::ast::AssertionExpr* a : ud.getPortConnections()) {
                            if (!a || a->kind != slang::ast::AssertionExprKind::Simple) continue;
                            const Expression& e = a->as<slang::ast::SimpleAssertionExpr>().expr;
                            // Compare by NAME: `body` may be the definition's representative
                            // body, whose symbols are different objects from this instance's.
                            const Symbol* r = e.getSymbolReference();
                            if (r && r->name == net) { drivesIt = true; break; }
                        }
                        if (!drivesIt) continue;
                        item.terminus = "blackbox";
                        item.detail = hpath(*cur) + "." + std::string(ud.name) + " (" +
                                      std::string(ud.definitionName) +
                                      "): module/cell model not in the filelist";
                        break;
                    }
                    if (m.kind != SK::Instance) continue;
                    const auto& ci = m.as<InstanceSymbol>();
                    bool drivesIt = false;
                    for (auto* pc : ci.getPortConnections())
                        if (pc->port.kind == SK::Port &&
                            pc->port.as<PortSymbol>().direction == ArgumentDirection::Out) {
                            const Symbol* cn = connNet(pc);
                            if (cn && cn->name == net) { drivesIt = true; break; }
                        }
                    if (!drivesIt) continue;
                    const std::string mod(ci.body.getDefinition().name);
                    item.terminus = "blackbox";
                    item.detail = hpath(ci) + " (" + mod + "): no module definition / cell model";
                    break;
                }
                if (item.detail.empty() && isOutputPortNamed(*body, net))
                    item.detail = hpath(*cur) + "." + net + ": output port with no internal driver";
                break;
            }
            const InstanceSymbol* parent = parentInstanceOf(*cur);
            if (!parent) {
                item.terminus = "pi";
                item.detail = hpath(*cur) + "." + net;
                if (auto pc = ix.portClocks.find(net); pc != ix.portClocks.end()) {
                    item.clockName = pc->second;
                    rootValue = "010";
                } else if (auto cc = ix.portCase.find(net); cc != ix.portCase.end()) {
                    rootValue = cc->second ? "1" : "0";
                } else {
                    rootValue = "Z";   // unconstrained top input floats
                }
                break;
            }
            const Symbol* pnet = nullptr;
            for (auto* pc : cur->getPortConnections())
                if (pc->port.kind == SK::Port && pc->port.name == net) { pnet = connNet(pc); break; }
            if (!pnet) { item.terminus = "undriven"; break; }
            // Real boundary crossing upward: the signal enters `cur` through its input
            // port `net` (isInputPortNamed guaranteed that name IS a port of this module).
            if (wantDetail) item.elems.push_back("xup@" + hpath(*cur) + ":" + net);
            cur = parent;
            net = std::string(pnet->name);
        }

        // Publish a tail for every state this walk visited, so the next group that reaches any
        // of them stops there. Only when the walk actually terminated: a depth-capped walk has
        // no meaningful tail and caching it would poison every path through that point.
        if (!item.terminus.empty() && !memoOff) {
            for (const Visit& v : visits) {
                MemoKey k{v.inst, v.net};
                if (memo.count(k)) continue;
                Tail t;
                if (wantDetail) {
                    t.path.assign(item.path.begin() + static_cast<std::ptrdiff_t>(v.p), item.path.end());
                    t.elems.assign(item.elems.begin() + static_cast<std::ptrdiff_t>(v.e), item.elems.end());
                }
                t.invertedDelta = (inverted != v.inv);
                t.terminus = item.terminus;
                t.detail = item.detail;
                t.terminusFile = item.terminusFile;
                t.terminusLine = item.terminusLine;
                t.clockName = item.clockName;
                t.rootValue = rootValue;
                memo.emplace(std::move(k), std::move(t));
            }
        }

        // value at the flop pin: X wins; Z is analyzed as X inside; inversions act on 010/const
        item.rootValue = rootValue;
        item.inverted = inverted;
        if (rootValue == "010") item.value = inverted ? "101" : "010";
        else if (rootValue == "0" || rootValue == "1")
            item.value = inverted ? (rootValue == "1" ? "0" : "1") : rootValue;  // inverter flips a constant
        else item.value = "X";   // X stays X; Z is analyzed as X inside the design
    };

    // Enumerate flops once; aggregate identical (kind, owner, net) paths.
    // Hashed, not ordered: this is keyed by "<kind>|<owner>|<net>" and on a large chip it holds
    // hundreds of thousands of long strings — an ordered map pays O(log n) STRING COMPARES per
    // lookup, which showed up as a flat per-group cost dwarfing the (memoised) walk itself.
    std::unordered_map<std::string, std::size_t> seen;
    // slang promotes every never-instantiated module to a top instance, so getSequential()
    // also returns flops inside e.g. a bare `omsp_clock_mux` "top". Those fake roots produced
    // hundreds of bogus clock groups. Analyze ONLY the real harden top = the highest-ranked
    // candidate (candidateTops is sorted by subtree size, and the harden flow has one top).
    std::string topPrefix;
    if (!p_->candidateTops.empty()) topPrefix = p_->candidateTops.front().id;
    // Time the two halves separately: enumerating flops is O(DESIGN SIZE) while the walk is now
    // O(clock-tree size). Which one dominates decides where any parallelism would belong.
    const auto tSeq0 = std::chrono::steady_clock::now();
    const std::vector<SeqElement>& seqAll = getSequential();
    const auto tSeq1 = std::chrono::steady_clock::now();
    // Scoped query: analyse only what the user is looking at. The walk itself, the memo and the
    // per-group path materialisation then all cost O(subtree), which is what makes drilling into
    // a large SoC interactive instead of re-analysing the whole chip on every expansion.
    const std::string scopePrefix = SdcIndex::norm(q.scope);
    auto inScope = [&scopePrefix](const std::string& owner) {
        return scopePrefix.empty() || owner == scopePrefix ||
               owner.rfind(scopePrefix + ".", 0) == 0;
    };
    // Which elements to visit. Unscoped -> all of them. Scoped -> binary-search the sorted
    // index: ids sharing a prefix are contiguous ('.' sorts below every identifier character),
    // so the subtree is one range and the query stops costing O(design).
    std::vector<const SeqElement*> todo;
    if (scopePrefix.empty()) {
        todo.reserve(seqAll.size());
        for (const SeqElement& e : seqAll) todo.push_back(&e);
    } else {
        if (!p_->seqByOwner) {
            std::vector<const SeqElement*> idx;
            idx.reserve(seqAll.size());
            for (const SeqElement& e : seqAll) idx.push_back(&e);
            std::stable_sort(idx.begin(), idx.end(), [](const SeqElement* a, const SeqElement* b) {
                return a->ownerInstanceId < b->ownerInstanceId;
            });
            p_->seqByOwner = std::move(idx);
        }
        const auto& idx = *p_->seqByOwner;
        auto lo = std::lower_bound(idx.begin(), idx.end(), scopePrefix,
                                   [](const SeqElement* e, const std::string& v) {
                                       return e->ownerInstanceId < v;
                                   });
        for (; lo != idx.end() && inScope((*lo)->ownerInstanceId); ++lo) todo.push_back(*lo);
    }

    for (const SeqElement* elp : todo) {
        const SeqElement& el = *elp;
        if (!topPrefix.empty() && el.ownerInstanceId != topPrefix &&
            el.ownerInstanceId.rfind(topPrefix + ".", 0) != 0)
            continue;   // flop lives under a phantom top, not the harden
        auto addItem = [&](const std::string& kind, const SeqEvent& ev) {
            const std::string key = kind + "|" + el.ownerInstanceId + "|" + ev.net;
            if (auto s = seen.find(key); s != seen.end()) { res.items[s->second].flopCount += (el.bits > 0 ? el.bits : 1); return; }
            CrPathItem item;
            item.kind = kind;
            item.ownerInstanceId = el.ownerInstanceId;
            item.net = ev.net;
            item.edge = ev.edge;
            item.file = el.file;
            item.line = el.line;
            item.flopCount = el.bits > 0 ? el.bits : 1;   // register BITS, not block count
            const auto w0 = clk();
            if (kind == "reset") walk(item, ixRst, implRst, memoR, el.ownerSym);
            else walk(item, ix, impl, memoF, el.ownerSym);
            nsWalk += std::chrono::duration<double, std::nano>(clk() - w0).count();
            if (kind == "reset") {
                // active edge negedge -> active-low reset -> inactive value is 1 (and vice versa)
                item.inactive = (ev.edge == "negedge") ? "1" : "0";
                item.set = ev.set;   // SET pin (branch loads ones): fixed from dfx_set_scan_n/p
                // A PLANNED control mux drives this net in test mode, so the value the DRC
                // has to judge is the one the plan produces — otherwise a fix cannot be checked
                // until after it is inserted, which is the wrong end of the flow. Flagged as
                // planned: `ok` on its own would claim the netlist is fine when nothing has
                // been inserted yet.
                if (!q.plannedMuxes.empty()) {
                    const std::string here = SdcIndex::norm(item.ownerInstanceId + "." + item.net);
                    std::string src = SdcIndex::norm(item.detail);
                    if (const auto sp = src.find(' '); sp != std::string::npos) src.resize(sp);
                    const auto tailMatch = [](const std::string& full, const std::string& t) {
                        return !t.empty() && (full == t ||
                            (full.size() > t.size() + 1 &&
                             full.compare(full.size() - t.size(), t.size(), t) == 0 &&
                             full[full.size() - t.size() - 1] == '.') ||
                            (t.size() > full.size() + 1 &&
                             t.compare(t.size() - full.size(), full.size(), full) == 0 &&
                             t[t.size() - full.size() - 1] == '.'));
                    };
                    std::string winner;   // which mux decided the value (nearest to the flop)
                    const auto muxAt = [&](const std::string& obj, std::string* val) {
                        for (const auto& pm : q.plannedMuxes)
                            if (tailMatch(obj, SdcIndex::norm(pm.target))) {
                                *val = pm.value;
                                winner = pm.target;
                                return true;
                            }
                        return false;
                    };
                    const auto flip = [](const std::string& v) {
                        return v == "1" ? std::string("0") : v == "0" ? std::string("1") : v;
                    };
                    // THE MUX NEAREST THE FLOP WINS — that is what the electricity does: a mux
                    // downstream overrides whatever an upstream one drives. Walking the path
                    // flop-outward and stopping at the FIRST planned point is that rule; taking
                    // whichever mux came first in the list (as this did) let an upstream patch
                    // hide a bad downstream one, or the reverse, depending on entry order.
                    std::string v;
                    bool found = false;
                    int invs = 0;
                    if (muxAt(here, &v)) {
                        found = true;              // on the flop's own net: nothing in between
                    } else {
                        for (const std::string& el : item.elems) {
                            const std::size_t at = el.find('@');
                            if (at == std::string::npos) continue;
                            const std::string kind = el.substr(0, at);
                            std::string obj = el.substr(at + 1);
                            if (const auto sp = obj.find(' '); sp != std::string::npos) obj.resize(sp);
                            if (const auto hash = obj.find('#'); hash != std::string::npos) obj.resize(hash);
                            for (char& ch : obj) if (ch == ':' || ch == '/') ch = '.';
                            if (muxAt(obj, &v)) { found = true; break; }
                            if (kind == "inv") ++invs;
                        }
                        if (!found && item.terminus != "undriven" && muxAt(src, &v)) {
                            found = true;
                            invs = item.inverted ? 1 : 0;   // the whole path's inversion parity
                        }
                    }
                    if (found) {
                        item.value = (invs % 2) ? flip(v) : v;
                        item.plannedFix = true;
                        item.plannedMuxTarget = winner;
                    }
                }
                item.ok = (item.value == item.inactive);
            }
            seen.emplace(key, res.items.size());
            res.items.push_back(std::move(item));
        };
        for (const SeqEvent& c : el.clocks) addItem("clock", c);
        for (const SeqEvent& rst : el.asyncResets) addItem("reset", rst);
    }

    // ---- SCAN-MODE dimension -------------------------------------------------------------
    // Replay every clock path with the DFT signals FORCED, then ask the only question that
    // matters for scan: does this flop's clock now come from one of the OCC definition points
    // the user declared? A chain that shifts requires yes for every flop on it. We never infer
    // an OCC point — an empty occPoints list simply reports where each clock lands in test mode.
    const auto tScan0 = clk();
    if (!scan.empty()) {
        SdcIndex sIx = ix;
        for (const auto& [target, val] : scan.forces) {
            const std::string n = SdcIndex::norm(target);
            if (n.find('.') != std::string::npos) {
                sIx.hierCase[n] = val ? 1 : 0;
                // top-relative spelling too (same convention as pin constraints above)
                for (auto* t : p_->comp->getRoot().topInstances) {
                    const std::string tn(t->name);
                    if (!tn.empty() && n.rfind(tn + ".", 0) != 0) sIx.hierCase[tn + "." + n] = val ? 1 : 0;
                }
            } else {
                sIx.portCase[n] = val ? 1 : 0;
            }
        }
        std::vector<std::string> occ;
        occ.reserve(scan.occPoints.size());
        for (const auto& o : scan.occPoints) occ.push_back(SdcIndex::norm(o));
        // A declared point may be written with or without the harden top; accept either.
        auto occHit = [&occ](const std::string& pin) -> const std::string* {
            for (const auto& o : occ)
                if (pin == o || SdcIndex::suffixMatch(pin, o)) return &o;
            return nullptr;
        };

        Implication sImpl(sIx, am, bodyOf);
        for (CrPathItem& it : res.items) {
            if (it.kind != "clock") continue;      // an OCC controls clocks, not resets
            CrPathItem s;
            s.kind = it.kind;
            s.ownerInstanceId = it.ownerInstanceId;
            s.net = it.net;
            s.edge = it.edge;
            walk(s, sIx, sImpl, memoS, nullptr);

            it.scanChecked = true;
            it.scanValue = s.value;
            it.scanTerminus = s.terminus;
            it.scanDetail = s.detail;
            // An OCC point can name either a NET on the path ("inst/net") or a CELL PIN
            // ("inst/GCK"). Nets show up in `path` as "inst:net"; cells only ever appear in
            // `elems`, carrying their real output pin in the |out= tail — so both must be
            // checked or a point declared on a gate output would never be found.
            auto mark = [&](const std::string& pin) {
                if (it.scanOcc || pin.empty()) return;
                if (occHit(pin)) { it.scanOcc = true; it.scanOccPoint = pin; }
            };
            for (const std::string& hop : s.path) {          // "inst:net" -> inst.net
                const std::size_t c = hop.rfind(':');
                if (c != std::string::npos) mark(hop.substr(0, c) + "." + hop.substr(c + 1));
                if (it.scanOcc) break;
            }
            for (const std::string& raw : s.elems) {
                if (it.scanOcc) break;
                const std::size_t bar = raw.find('|');
                const std::string head = raw.substr(0, bar);
                const std::size_t at = head.find('@');
                if (at == std::string::npos) continue;
                std::string body = head.substr(at + 1);
                if (const std::size_t h = body.find('#'); h != std::string::npos) body.resize(h);
                if (const std::size_t col = body.find(':'); col != std::string::npos) {
                    mark(body.substr(0, col) + "." + body.substr(col + 1));   // RTL: inst.net
                    continue;
                }
                mark(body);                                                   // the cell instance
                if (bar == std::string::npos) continue;
                // …and its real output pin, which is what a user declares on a gate.
                const std::string tail = raw.substr(bar);
                if (const std::size_t o = tail.find("|out="); o != std::string::npos) {
                    std::string pin = tail.substr(o + 5);
                    if (const std::size_t e = pin.find('|'); e != std::string::npos) pin.resize(e);
                    if (!pin.empty()) mark(body + "." + pin);
                }
            }
        }
    }
    nsScan = std::chrono::duration<double, std::nano>(clk() - tScan0).count();

    // ---- Hierarchical roll-up ------------------------------------------------------------
    // Aggregate every group onto the DIRECT CHILD of the queried scope that contains it, so the
    // caller gets a handful of rows and drills down by re-querying with that child as the scope.
    res.totalGroups = static_cast<int>(res.items.size());
    for (const CrPathItem& i : res.items) res.totalFlopBits += i.flopCount;
    if (q.summary) {
        const std::string base = scopePrefix.empty() ? topPrefix : scopePrefix;
        std::map<std::string, CrScopeSummary> roll;
        for (const CrPathItem& i : res.items) {
            // child = base + the next path segment below it (the group's own owner when it
            // sits directly in `base`).
            std::string child = i.ownerInstanceId;
            if (!base.empty() && child.rfind(base + ".", 0) == 0) {
                const std::size_t start = base.size() + 1;
                const std::size_t dot = child.find('.', start);
                child = (dot == std::string::npos) ? child : child.substr(0, dot);
            }
            CrScopeSummary& s = roll[child];
            s.instanceId = child;
            ++s.groups;
            s.flopBits += i.flopCount;
            const bool bad = (i.kind == "reset") ? !i.ok : (i.value != "010" && i.value != "101");
            if (bad) ++s.violations;
            if (child != i.ownerInstanceId) s.hasChildren = true;
        }
        res.scopes.reserve(roll.size());
        for (auto& [k, s] : roll) res.scopes.push_back(std::move(s));
        // Drop the bulky per-group detail: it is what makes a full-chip answer hundreds of MB,
        // and the caller asked for the roll-up. Values/violations above are already computed.
        res.items.clear();
        res.items.shrink_to_fit();
    }

    if (wantStats) {
        const auto tEnd = std::chrono::steady_clock::now();
        auto ms = [](auto a, auto b) {
            return std::chrono::duration<double, std::milli>(b - a).count();
        };
        std::fprintf(stderr,
                     "[time] getSequential=%6.1f | climb=%6.1f  groupOverhead=%6.1f  scanPass=%5.1f"
                     " | analysis=%6.1f ms (%zu elems)\n",
                     ms(tSeq0, tSeq1), nsWalk / 1e6,
                     ms(tSeq1, tEnd) - nsWalk / 1e6 - nsScan / 1e6, nsScan / 1e6,
                     ms(tSeq1, tEnd), seqAll.size());
        long long hopsOut = 0;
        for (const CrPathItem& i : res.items) hopsOut += static_cast<long long>(i.path.size());
        if (q.summary) hopsOut = stepsRun;   // detail was dropped; report what was walked
        std::fprintf(stderr,
                     "[walk] groups=%zu hopsInOutput=%lld hopsExecuted=%lld memoHits=%lld "
                     "memoEntries=%zu saving=%.2fx\n",
                     static_cast<std::size_t>(res.totalGroups), hopsOut, stepsRun, memoHits, memoF.size() + memoS.size(),
                     stepsRun ? static_cast<double>(hopsOut) / static_cast<double>(stepsRun) : 1.0);
    }
    return res;
}

// ---- Wrapper-cell estimation: bounded boundary cones -> shared vs dedicated -----------------
//
// A wrapper cell is SHARED when a functional flop already sits close enough to the boundary port
// to control it (input) or observe it (output); otherwise the insertion tool has to ADD one. The
// decision is a bounded cone count, so the walk stops as soon as the answer can no longer be
// "shared" — which is also what keeps it cheap on a real chip.

namespace {

/// Per-port-bit budget. Not a DFT rule — a runaway-design backstop. Hitting it is reported as
/// "max identified cells", the same conservative answer an over-threshold cone gets.
constexpr int kWrapMaxNodes = 20000;
constexpr int kWrapExprDepth = 48;

int widthOfVal(const ValueSymbol& v) {
    const int w = static_cast<int>(v.getType().getBitWidth());
    return w > 0 ? w : 1;
}

/// 0-based bit POSITION of a declared index: `reg [15:8] x; x[9]` is position 1, not 9.
std::optional<int> bitPosOf(const Type& t, int declaredIndex) {
    const Type& ct = t.getCanonicalType();
    if (!ct.hasFixedRange()) return std::nullopt;
    const slang::ConstantRange r = ct.getFixedRange();
    if (!r.containsPoint(declaredIndex)) return std::nullopt;
    return static_cast<int>(r.translateIndex(declaredIndex));
}

/// The declared index of bit POSITION `pos`, for report names that match the RTL.
int declaredIndexOf(const Type& t, int pos) {
    const Type& ct = t.getCanonicalType();
    if (!ct.hasFixedRange()) return pos;
    const slang::ConstantRange r = ct.getFixedRange();
    return r.isLittleEndian() ? r.lower() + pos : r.upper() - pos;
}

/// Constant value of an expression, or nullopt. PARAMETERS resolve here, which is the whole
/// point: a disabled peripheral's port is ANDed with a `parameter P3_EN = 1'b0`, and without
/// folding that the port looks like a live input that needs a wrapper cell.
/// Folding is on the hot path — a gate like `& P1_EN[0]` is re-evaluated by every cone that
/// crosses it — so results are memoised per expression. Keyed on the symbol-pointer generation
/// like every other pointer-keyed cache here, because a fresh Compilation reuses addresses.
struct WConstMemo {
    std::uint64_t gen = 0;
    std::unordered_map<const Expression*, std::optional<slang::SVInt>> m;
};
WConstMemo g_wConstMemo;

std::optional<slang::SVInt> constIntOf(const Expression& e, const Symbol& scopeSym) {
    if (g_wConstMemo.gen != g_structGen) {
        g_wConstMemo.m.clear();
        g_wConstMemo.gen = g_structGen;
    }
    if (auto it = g_wConstMemo.m.find(&e); it != g_wConstMemo.m.end()) return it->second;
    std::optional<slang::SVInt> r;
    EvalContext ctx(scopeSym);
    slang::ConstantValue cv = e.eval(ctx);
    if (cv && cv.isInteger() && !cv.integer().hasUnknown()) r = cv.integer();
    g_wConstMemo.m.emplace(&e, r);
    return r;
}

std::optional<int> constIdxOf(const Expression& e, const Symbol& scopeSym) {
    auto iv = constIntOf(e, scopeSym);
    if (!iv) return std::nullopt;
    try {
        slang::SVInt s = *iv;
        s.setSigned(true);
        return std::stoi(s.toString(slang::LiteralBase::Decimal, /*includeBase*/ false));
    } catch (...) {
        return std::nullopt;
    }
}

bool constBitIsOne(const slang::SVInt& v, int b) {
    if (b < 0 || b >= static_cast<int>(v.getBitWidth())) return false;
    return v[b].value == 1;
}

bool readsSymbol(const Expression& e, const ValueSymbol& net) {
    std::set<const ValueSymbol*> reads;
    ValueRefVisitor rv(reads);
    e.visit(rv);
    return reads.count(&net) != 0;
}

/// Which bits of an expression's VALUE depend on one bit of one signal.
/// `all` is the give-up answer; `any == false` means the bit does not reach the value at all,
/// which is how a controlling constant prunes a dead port out of the analysis entirely.
struct BitDep {
    bool any = false;
    bool all = false;
    std::vector<int> bits;

    void add(int b) {
        any = true;
        if (!all && std::find(bits.begin(), bits.end(), b) == bits.end()) bits.push_back(b);
    }
    void setAll() {
        any = true;
        all = true;
        bits.clear();
    }
    void merge(const BitDep& o) {
        if (!o.any) return;
        if (all) return;
        if (o.all) { setAll(); return; }
        for (int b : o.bits) add(b);
    }
    void shift(int by) {
        if (!all)
            for (int& b : bits) b += by;
    }
    /// Result bits to iterate: the enumerated ones, or every bit of a `width`-wide value.
    std::vector<int> resolve(int width) const {
        if (!any) return {};
        if (!all) return bits;
        std::vector<int> v(static_cast<std::size_t>(std::max(width, 1)));
        for (int i = 0; i < std::max(width, 1); ++i) v[static_cast<std::size_t>(i)] = i;
        return v;
    }
};

/// CONTROLLING VALUE pruning: a constant 0 on an AND (1 on an OR) blocks that bit outright,
/// whatever the other operand does. This is an implication, not an evaluation — it concludes
/// with the data input still unknown, which is exactly the disabled-peripheral case.
void pruneByControl(BitDep& dep, const Expression& other, BinaryOperator op,
                    const Symbol& scopeSym) {
    if (!dep.any) return;
    const bool isAnd = op == BinaryOperator::BinaryAnd;
    const bool isOr = op == BinaryOperator::BinaryOr;
    if (!isAnd && !isOr) return;
    const auto c = constIntOf(other, scopeSym);
    if (!c) return;
    const int w = static_cast<int>(c->getBitWidth());
    if (dep.all) {
        // The result bits are not enumerated here, so only a wholly blocking mask is decidable.
        for (int i = 0; i < w; ++i)
            if (constBitIsOne(*c, i) == isAnd) return;
        if (w > 0) dep = BitDep{};
        return;
    }
    std::vector<int> keep;
    for (int b : dep.bits)
        if (constBitIsOne(*c, b) == isAnd) keep.push_back(b);
    dep.bits = std::move(keep);
    dep.any = !dep.bits.empty();
}

BitDep depOf(const Expression& e0, const ValueSymbol& net, int bit, const Symbol& scopeSym,
             int depth) {
    BitDep d;
    const Expression* e = &e0;
    while (e->kind == ExpressionKind::Conversion) e = &e->as<ConversionExpression>().operand();
    if (depth > kWrapExprDepth) {
        if (readsSymbol(*e, net)) d.setAll();
        return d;
    }

    switch (e->kind) {
        case ExpressionKind::NamedValue:
        case ExpressionKind::HierarchicalValue: {
            const auto& vb = e->as<ValueExpressionBase>();
            if (&vb.symbol == &net && bit < widthOfVal(net)) d.add(bit);
            return d;
        }
        case ExpressionKind::ElementSelect: {
            const auto& s = e->as<ElementSelectExpression>();
            if (readsSymbol(s.selector(), net)) { d.setAll(); return d; }  // dynamic index
            const BitDep sub = depOf(s.value(), net, bit, scopeSym, depth + 1);
            if (!sub.any) return d;
            const auto idx = constIdxOf(s.selector(), scopeSym);
            if (!idx) { d.setAll(); return d; }
            const auto pos = bitPosOf(*s.value().type, *idx);
            if (!pos) { d.setAll(); return d; }
            if (sub.all || std::find(sub.bits.begin(), sub.bits.end(), *pos) != sub.bits.end())
                d.add(0);
            return d;
        }
        case ExpressionKind::RangeSelect: {
            const auto& s = e->as<RangeSelectExpression>();
            const BitDep sub = depOf(s.value(), net, bit, scopeSym, depth + 1);
            if (!sub.any) return d;
            if (sub.all || s.getSelectionKind() != RangeSelectionKind::Simple) {
                d.setAll();
                return d;
            }
            const auto a = constIdxOf(s.left(), scopeSym);
            const auto b = constIdxOf(s.right(), scopeSym);
            if (!a || !b) { d.setAll(); return d; }
            const auto p1 = bitPosOf(*s.value().type, *a);
            const auto p2 = bitPosOf(*s.value().type, *b);
            if (!p1 || !p2) { d.setAll(); return d; }
            const int base = std::min(*p1, *p2);
            const int w = static_cast<int>(e->type->getBitWidth());
            for (int x : sub.bits)
                if (x >= base && x < base + w) d.add(x - base);
            return d;
        }
        case ExpressionKind::UnaryOp: {
            const auto& u = e->as<UnaryExpression>();
            const BitDep sub = depOf(u.operand(), net, bit, scopeSym, depth + 1);
            if (!sub.any) return d;
            switch (u.op) {
                case UnaryOperator::BitwiseNot:
                    return sub;  // bitwise: aligned, bit for bit
                case UnaryOperator::Plus:
                case UnaryOperator::Minus:
                    d.setAll();  // carries move upward
                    return d;
                default:
                    d.add(0);  // reductions and logical not collapse to one bit
                    return d;
            }
        }
        case ExpressionKind::BinaryOp: {
            const auto& b = e->as<BinaryExpression>();
            const bool bitwise =
                b.op == BinaryOperator::BinaryAnd || b.op == BinaryOperator::BinaryOr ||
                b.op == BinaryOperator::BinaryXor || b.op == BinaryOperator::BinaryXnor;
            const bool onebit =
                b.op == BinaryOperator::LogicalAnd || b.op == BinaryOperator::LogicalOr ||
                b.op == BinaryOperator::LogicalImplication ||
                b.op == BinaryOperator::LogicalEquivalence || b.op == BinaryOperator::Equality ||
                b.op == BinaryOperator::Inequality || b.op == BinaryOperator::CaseEquality ||
                b.op == BinaryOperator::CaseInequality || b.op == BinaryOperator::GreaterThan ||
                b.op == BinaryOperator::GreaterThanEqual || b.op == BinaryOperator::LessThan ||
                b.op == BinaryOperator::LessThanEqual;
            BitDep l = depOf(b.left(), net, bit, scopeSym, depth + 1);
            BitDep r = depOf(b.right(), net, bit, scopeSym, depth + 1);
            if (!l.any && !r.any) return d;
            if (bitwise) {
                pruneByControl(l, b.right(), b.op, scopeSym);
                pruneByControl(r, b.left(), b.op, scopeSym);
                d.merge(l);
                d.merge(r);
                return d;
            }
            if (onebit) { d.add(0); return d; }
            d.setAll();  // arithmetic / shift: bit alignment does not survive
            return d;
        }
        case ExpressionKind::ConditionalOp: {
            const auto& c = e->as<ConditionalExpression>();
            for (auto& p : c.conditions)
                if (p.expr && depOf(*p.expr, net, bit, scopeSym, depth + 1).any) {
                    d.setAll();  // a select reaches every bit of the mux output
                    return d;
                }
            d.merge(depOf(c.left(), net, bit, scopeSym, depth + 1));
            d.merge(depOf(c.right(), net, bit, scopeSym, depth + 1));
            return d;
        }
        case ExpressionKind::Concatenation: {
            // slang lists concat operands MSB-first; accumulate offsets from the LSB end.
            const auto ops = e->as<ConcatenationExpression>().operands();
            int off = 0;
            for (auto it = ops.rbegin(); it != ops.rend(); ++it) {
                const Expression& op = **it;
                const int w = static_cast<int>(op.type->getBitWidth());
                BitDep sub = depOf(op, net, bit, scopeSym, depth + 1);
                if (sub.any) {
                    if (sub.all) { d.setAll(); return d; }
                    sub.shift(off);
                    d.merge(sub);
                }
                off += w;
            }
            return d;
        }
        default:
            if (readsSymbol(*e, net)) d.setAll();
            return d;
    }
}

using WSrc = std::vector<std::pair<const ValueSymbol*, int>>;

void addAllBits(const Expression& e, WSrc& out) {
    std::set<const ValueSymbol*> reads;
    ValueRefVisitor rv(reads);
    e.visit(rv);
    for (const ValueSymbol* v : reads) {
        const int w = widthOfVal(*v);
        for (int b = 0; b < w; ++b) out.emplace_back(v, b);
    }
}

/// The (signal, bit) pairs one RESULT bit of an expression can come from — the mirror of depOf.
/// Also used on an assignment LHS, where it answers "which net bit does result bit N land on".
void srcOf(const Expression& e0, int bit, const Symbol& scopeSym, int depth, WSrc& out) {
    const Expression* e = &e0;
    while (e->kind == ExpressionKind::Conversion) e = &e->as<ConversionExpression>().operand();
    if (depth > kWrapExprDepth) { addAllBits(*e, out); return; }

    switch (e->kind) {
        case ExpressionKind::NamedValue:
        case ExpressionKind::HierarchicalValue: {
            const auto& vb = e->as<ValueExpressionBase>();
            if (const auto* vs = vb.symbol.as_if<ValueSymbol>())
                if (bit < widthOfVal(*vs)) out.emplace_back(vs, bit);
            return;
        }
        case ExpressionKind::ElementSelect: {
            const auto& s = e->as<ElementSelectExpression>();
            const auto idx = constIdxOf(s.selector(), scopeSym);
            if (!idx) { addAllBits(*e, out); return; }
            const auto pos = bitPosOf(*s.value().type, *idx);
            if (!pos) { addAllBits(s.value(), out); return; }
            srcOf(s.value(), *pos, scopeSym, depth + 1, out);
            return;
        }
        case ExpressionKind::RangeSelect: {
            const auto& s = e->as<RangeSelectExpression>();
            if (s.getSelectionKind() != RangeSelectionKind::Simple) { addAllBits(*e, out); return; }
            const auto a = constIdxOf(s.left(), scopeSym);
            const auto b = constIdxOf(s.right(), scopeSym);
            if (!a || !b) { addAllBits(*e, out); return; }
            const auto p1 = bitPosOf(*s.value().type, *a);
            const auto p2 = bitPosOf(*s.value().type, *b);
            if (!p1 || !p2) { addAllBits(s.value(), out); return; }
            srcOf(s.value(), std::min(*p1, *p2) + bit, scopeSym, depth + 1, out);
            return;
        }
        case ExpressionKind::UnaryOp: {
            const auto& u = e->as<UnaryExpression>();
            if (u.op == UnaryOperator::BitwiseNot) {
                srcOf(u.operand(), bit, scopeSym, depth + 1, out);
                return;
            }
            addAllBits(u.operand(), out);
            return;
        }
        case ExpressionKind::BinaryOp: {
            const auto& b = e->as<BinaryExpression>();
            const bool isAnd = b.op == BinaryOperator::BinaryAnd;
            const bool isOr = b.op == BinaryOperator::BinaryOr;
            const bool bitwise = isAnd || isOr || b.op == BinaryOperator::BinaryXor ||
                                 b.op == BinaryOperator::BinaryXnor;
            if (!bitwise) { addAllBits(*e, out); return; }
            const auto lc = constIntOf(b.left(), scopeSym);
            const auto rc = constIntOf(b.right(), scopeSym);
            if (isAnd || isOr) {
                // A controlling constant on either side makes this output bit a constant, so it
                // has no source at all — the same pruning depOf does, from the other end.
                if (lc && constBitIsOne(*lc, bit) != isAnd) return;
                if (rc && constBitIsOne(*rc, bit) != isAnd) return;
            }
            if (!lc) srcOf(b.left(), bit, scopeSym, depth + 1, out);
            if (!rc) srcOf(b.right(), bit, scopeSym, depth + 1, out);
            return;
        }
        case ExpressionKind::ConditionalOp: {
            const auto& c = e->as<ConditionalExpression>();
            for (auto& p : c.conditions)
                if (p.expr) addAllBits(*p.expr, out);
            srcOf(c.left(), bit, scopeSym, depth + 1, out);
            srcOf(c.right(), bit, scopeSym, depth + 1, out);
            return;
        }
        case ExpressionKind::Concatenation: {
            const auto ops = e->as<ConcatenationExpression>().operands();
            int off = 0;
            for (auto it = ops.rbegin(); it != ops.rend(); ++it) {
                const Expression& op = **it;
                const int w = static_cast<int>(op.type->getBitWidth());
                if (bit >= off && bit < off + w) {
                    srcOf(op, bit - off, scopeSym, depth + 1, out);
                    return;
                }
                off += w;
            }
            return;
        }
        case ExpressionKind::IntegerLiteral:
        case ExpressionKind::UnbasedUnsizedIntegerLiteral:
            return;  // a constant drives nothing
        default:
            addAllBits(*e, out);
            return;
    }
}

/// Every assignment under a procedural block, each with the conditions that guard it. The
/// conditions matter in both directions: reaching a mux select controls EVERY bit the block
/// writes, and an output's cone includes the selects that steer it.
struct WBlockScan
    : public ASTVisitor<WBlockScan, VisitFlags::Statements | VisitFlags::Expressions> {
    std::vector<const Expression*> stack;
    std::vector<std::pair<const AssignmentExpression*, std::vector<const Expression*>>> out;

    void handle(const ConditionalStatement& s) {
        const std::size_t mark = stack.size();
        for (auto& c : s.conditions)
            if (c.expr) stack.push_back(c.expr);
        visitDefault(s);
        stack.resize(mark);
    }
    void handle(const CaseStatement& s) {
        const std::size_t mark = stack.size();
        stack.push_back(&s.expr);
        visitDefault(s);
        stack.resize(mark);
    }
    void handle(const AssignmentExpression& e) {
        out.emplace_back(&e, stack);
        visitDefault(e);
    }
};

/// Which BITS of `net` an expression touches. Deliberately coarser than depOf — it ignores
/// controlling constants and direction — because it only has to build a SUPERSET index; the
/// precise per-bit analysis still runs on whatever the index hands back.
struct RefBits {
    bool any = false;
    bool all = false;
    std::vector<int> bits;
    void add(int b) {
        any = true;
        if (!all && std::find(bits.begin(), bits.end(), b) == bits.end()) bits.push_back(b);
    }
    void setAll() { any = true; all = true; bits.clear(); }
};

bool isPlainRef(const Expression& e, const ValueSymbol& net) {
    return (e.kind == ExpressionKind::NamedValue || e.kind == ExpressionKind::HierarchicalValue) &&
           &e.as<ValueExpressionBase>().symbol == &net;
}

void readBitsOf(const Expression& e0, const ValueSymbol& net, const Symbol& scopeSym, RefBits& out,
                int depth) {
    if (out.all) return;
    const Expression* e = &e0;
    while (e->kind == ExpressionKind::Conversion) e = &e->as<ConversionExpression>().operand();
    if (depth > kWrapExprDepth) {
        if (readsSymbol(*e, net)) out.setAll();
        return;
    }
    switch (e->kind) {
        case ExpressionKind::NamedValue:
        case ExpressionKind::HierarchicalValue:
            if (&e->as<ValueExpressionBase>().symbol == &net) out.setAll();
            return;
        case ExpressionKind::ElementSelect: {
            const auto& s = e->as<ElementSelectExpression>();
            if (readsSymbol(s.selector(), net)) { out.setAll(); return; }  // dynamic index
            if (!isPlainRef(s.value(), net)) {
                readBitsOf(s.value(), net, scopeSym, out, depth + 1);
                return;
            }
            const auto idx = constIdxOf(s.selector(), scopeSym);
            const auto pos = idx ? bitPosOf(*s.value().type, *idx) : std::nullopt;
            if (pos) out.add(*pos);
            else out.setAll();
            return;
        }
        case ExpressionKind::RangeSelect: {
            const auto& s = e->as<RangeSelectExpression>();
            if (!isPlainRef(s.value(), net)) {
                readBitsOf(s.value(), net, scopeSym, out, depth + 1);
                return;
            }
            if (s.getSelectionKind() != RangeSelectionKind::Simple) { out.setAll(); return; }
            const auto a = constIdxOf(s.left(), scopeSym);
            const auto b = constIdxOf(s.right(), scopeSym);
            const auto p1 = a ? bitPosOf(*s.value().type, *a) : std::nullopt;
            const auto p2 = b ? bitPosOf(*s.value().type, *b) : std::nullopt;
            if (!p1 || !p2) { out.setAll(); return; }
            for (int i = std::min(*p1, *p2); i <= std::max(*p1, *p2); ++i) out.add(i);
            return;
        }
        case ExpressionKind::UnaryOp:
            readBitsOf(e->as<UnaryExpression>().operand(), net, scopeSym, out, depth + 1);
            return;
        case ExpressionKind::BinaryOp: {
            const auto& b = e->as<BinaryExpression>();
            readBitsOf(b.left(), net, scopeSym, out, depth + 1);
            readBitsOf(b.right(), net, scopeSym, out, depth + 1);
            return;
        }
        case ExpressionKind::ConditionalOp: {
            const auto& c = e->as<ConditionalExpression>();
            for (auto& p : c.conditions)
                if (p.expr) readBitsOf(*p.expr, net, scopeSym, out, depth + 1);
            readBitsOf(c.left(), net, scopeSym, out, depth + 1);
            readBitsOf(c.right(), net, scopeSym, out, depth + 1);
            return;
        }
        case ExpressionKind::Concatenation:
            for (const Expression* op : e->as<ConcatenationExpression>().operands())
                readBitsOf(*op, net, scopeSym, out, depth + 1);
            return;
        case ExpressionKind::Assignment: {
            const auto& a = e->as<AssignmentExpression>();
            readBitsOf(a.left(), net, scopeSym, out, depth + 1);
            readBitsOf(a.right(), net, scopeSym, out, depth + 1);
            return;
        }
        default:
            if (readsSymbol(*e, net)) out.setAll();
            return;
    }
}

/// One thing inside a module body that reads or writes a net.
struct WUse {
    enum class Kind : std::uint8_t { Proc, Assign, NetInit, ChildPort };
    Kind kind = Kind::Proc;
    const ProceduralBlockSymbol* pb = nullptr;  // Proc
    const AssignmentExpression* asn = nullptr;  // Assign: the continuous assignment
    const ValueSymbol* net = nullptr;           // NetInit: the net whose initialiser this is
    const InstanceSymbol* child = nullptr;      // ChildPort
    const PortConnection* pc = nullptr;         // ChildPort
};

/// Uses of one net, split so that a wide reference costs one entry instead of one per bit.
struct WNetUses {
    std::vector<WUse> allBits;
    std::unordered_map<int, std::vector<WUse>> byBit;
};

/// Reverse index of a module body: net bit -> what reads it, what drives it.
///
/// THIS IS WHAT MAKES THE ANALYSIS SCALE. Without it every cone hop rescans the whole enclosing
/// module, which is quadratic in the module's size — measured on a 2 M-register block with a
/// 4 k-bit boundary, the walk spent 7.8 s of an 8.0 s run inside that rescan. Built once per
/// body; a hop then costs O(fanout of that single bit).
struct WBodyIndex {
    std::unordered_map<const ValueSymbol*, WNetUses> readers, drivers;
    /// Port names of this body. A membership test, because the name-based port lookups scan
    /// every member of the module and the cone asks at every hop that lands in it — on a block
    /// whose top body has tens of thousands of members that alone made the walk quadratic
    /// (measured: 42 us/node at 4 M registers vs 8 us at 1 M, all of it in this lookup).
    std::unordered_set<std::string_view> inPorts, outPorts;
};

/// A reference this wide is indexed against the whole net rather than bit by bit, so a
/// `|wide_bus` reduction does not create one index entry per bit.
constexpr int kWrapMaxIndexBits = 16;

void addUse(std::unordered_map<const ValueSymbol*, WNetUses>& m, const ValueSymbol* net,
            const RefBits& rb, const WUse& u) {
    if (!rb.any) return;
    WNetUses& slot = m[net];
    if (rb.all || static_cast<int>(rb.bits.size()) > kWrapMaxIndexBits) {
        slot.allBits.push_back(u);
        return;
    }
    for (int b : rb.bits) slot.byBit[b].push_back(u);
}

template <typename F>
void forEachUse(const std::unordered_map<const ValueSymbol*, WNetUses>& m, const ValueSymbol* net,
                int bit, F&& fn) {
    const auto it = m.find(net);
    if (it == m.end()) return;
    for (const WUse& u : it->second.allBits) fn(u);
    const auto b = it->second.byBit.find(bit);
    if (b != it->second.byBit.end())
        for (const WUse& u : b->second) fn(u);
}

void collectContAssigns(const Scope& scope, std::vector<const ContinuousAssignSymbol*>& out) {
    for (const Symbol& m : scope.members()) {
        switch (m.kind) {
            case SK::ContinuousAssign:
                out.push_back(&m.as<ContinuousAssignSymbol>());
                break;
            case SK::GenerateBlock: {
                const auto& gb = m.as<GenerateBlockSymbol>();
                if (!gb.isUninstantiated) collectContAssigns(gb, out);
                break;
            }
            case SK::GenerateBlockArray:
                for (auto* e : m.as<GenerateBlockArraySymbol>().entries)
                    if (e) collectContAssigns(*e, out);
                break;
            default:
                break;
        }
    }
}

/// `wire x = y;` declaration initialisers. slang does not record them as drivers, so a walk that
/// only looks at ContinuousAssign silently loses every net written this way.
void collectNetInits(const Scope& scope, std::vector<const ValueSymbol*>& out) {
    for (const Symbol& m : scope.members()) {
        switch (m.kind) {
            case SK::Net:
            case SK::Variable:
                if (const auto* vs = m.as_if<ValueSymbol>())
                    if (vs->getInitializer()) out.push_back(vs);
                break;
            case SK::GenerateBlock: {
                const auto& gb = m.as<GenerateBlockSymbol>();
                if (!gb.isUninstantiated) collectNetInits(gb, out);
                break;
            }
            case SK::GenerateBlockArray:
                for (auto* e : m.as<GenerateBlockArraySymbol>().entries)
                    if (e) collectNetInits(*e, out);
                break;
            default:
                break;
        }
    }
}

/// Edge signals of a sequential block, split into clock and asynchronous reset the same way
/// get-sequential does: a reset is an edge signal named in the block's leading `if`.
void eventSymsOf(const ProceduralBlockSymbol& pb, std::set<const Symbol*>& clocks,
                 std::set<const Symbol*>& resets) {
    const Statement& body = pb.getBody();
    if (body.kind != StatementKind::Timed) return;
    const auto& ts = body.as<TimedStatement>();
    std::vector<const Symbol*> events;
    auto add = [&](const SignalEventControl& s) {
        if (s.edge == EdgeKind::None) return;
        if (const Symbol* sym = s.expr.getSymbolReference()) events.push_back(sym);
    };
    if (ts.timing.kind == TimingControlKind::SignalEvent)
        add(ts.timing.as<SignalEventControl>());
    else if (ts.timing.kind == TimingControlKind::EventList)
        for (auto* ev : ts.timing.as<EventListControl>().events)
            if (ev->kind == TimingControlKind::SignalEvent) add(ev->as<SignalEventControl>());

    std::set<const Symbol*> rst;
    if (const ConditionalStatement* c = findLeadingCond(&ts.stmt))
        for (auto& cond : c->conditions) collectSyms(*cond.expr, rst);
    for (const Symbol* s : events) {
        if (rst.count(s)) resets.insert(s);
        else clocks.insert(s);
    }
}

/// One flop bit: the instance holding the always block, the variable it writes, and the bit.
struct WFlop {
    const InstanceSymbol* inst = nullptr;
    const ValueSymbol* var = nullptr;
    int bit = 0;
    bool operator<(const WFlop& o) const {
        if (inst != o.inst) return std::less<const void*>{}(inst, o.inst);
        if (var != o.var) return std::less<const void*>{}(var, o.var);
        return bit < o.bit;
    }
};

struct WNode {
    const InstanceSymbol* inst = nullptr;
    const ValueSymbol* net = nullptr;
    int bit = 0;
    bool operator==(const WNode& o) const {
        return inst == o.inst && net == o.net && bit == o.bit;
    }
};

struct WNodeHash {
    std::size_t operator()(const WNode& n) const {
        auto mix = [](std::size_t h, std::size_t v) {
            return h ^ (v + 0x9e3779b97f4a7c15ULL + (h << 6) + (h >> 2));
        };
        std::size_t h = std::hash<const void*>{}(n.inst);
        h = mix(h, std::hash<const void*>{}(n.net));
        return mix(h, static_cast<std::size_t>(n.bit));
    }
};

/// Symbols read by the INDEX expressions of an assignment target: `x[i] <= d` writes x but
/// reads i. Only the selectors — adding the target itself would make every block a reader of
/// its own output and cost a wasted rescan at each of its flops.
void collectLhsIndexReads(const Expression& lhs, std::set<const ValueSymbol*>& out) {
    switch (lhs.kind) {
        case ExpressionKind::ElementSelect: {
            const auto& s = lhs.as<ElementSelectExpression>();
            ValueRefVisitor rv(out);
            s.selector().visit(rv);
            collectLhsIndexReads(s.value(), out);
            return;
        }
        case ExpressionKind::RangeSelect: {
            const auto& s = lhs.as<RangeSelectExpression>();
            ValueRefVisitor rv(out);
            s.left().visit(rv);
            s.right().visit(rv);
            collectLhsIndexReads(s.value(), out);
            return;
        }
        case ExpressionKind::Concatenation:
            for (const Expression* op : lhs.as<ConcatenationExpression>().operands())
                collectLhsIndexReads(*op, out);
            return;
        default:
            return;
    }
}

struct WCone {
    std::set<WFlop> flops;
    bool hitClock = false;
    bool hitReset = false;
    bool hitBlackbox = false;
    bool overflow = false;    // flop threshold or node budget exceeded
    bool depthLimit = false;  // cone ran deeper than levelsThreshold
    bool sawLoad = false;     // forward: the bit reaches logic
    bool sawDriver = false;   // backward: the bit has a driver
    /// backward: the driver had a real signal source. A driver with none is a constant tie —
    /// `assign dco_enable = 1'b1;` — which needs no cell, unlike a flopless feedthrough.
    bool sawSource = false;
    /// backward: a path reached a primary input of the core. Without a flop in the cone this is
    /// what separates a FEEDTHROUGH (still has to be driven in EXTEST, so it needs a cell) from a
    /// BLOCKED output whose every path dies on a constant and that no cell could ever move.
    bool sawPI = false;
    /// forward: the bit reached a primary OUTPUT of the core. With no flop in between that is a
    /// feedthrough seen from the input side, the mirror of sawPI.
    bool sawPO = false;
    bool nonScan = false;     // a latch sits in the way
    /// Deepest level the walk actually reached — Tessent reports this as "Max Logic Level", and
    /// it is the number that explains a decision better than any other single figure.
    int maxLevel = 0;
};

/// Both cones over the elaborated design, driven by a per-body reverse index so that the cost of
/// a hop is the fanout of one net bit rather than the size of the module it sits in.
class WrapWalker {
public:
    /// Record the route, not only the destination. Every hop the walk takes is (from -> to) on a
    /// net bit; keeping those edges is what turns the analysis from a verdict into a diagram.
    /// A hop, and the ELEMENT that made it. Without the element the picture is a list of net
    /// names joined by lines — the nets are the wires, and a schematic is mostly the things
    /// BETWEEN them.
    struct WHop {
        WNode from, to;
        std::string elem;    // "and"|"or"|"xor"|"inv"|"mux"|"buf"|"logic"|"port"|"dff"
        std::string detail;  // the statement kind, for the tooltip
        int line = 0;
    };
    struct WTrace {
        std::vector<WHop> edges;
        std::vector<std::pair<WNode, WFlop>> flopEdges;  // net bit -> the flop it lands on
    };
    void setTrace(WTrace* t) { trace_ = t; }

    /// The net on a flop's clock pin, learned while walking. Only the always-block that infers
    /// the flop knows it, so it is captured there; a wrapper cell without its clock cannot be
    /// checked against the OCC plan, which is why the vendor report carries a Clock column too.
    std::string clockOf(const WFlop& f) const {
        auto it = flopClocks_.find(f);
        return it == flopClocks_.end() ? std::string() : it->second;
    }

    explicit WrapWalker(const WrapperOptions& opt) : opt_(opt) {}

    WCone forward(const InstanceSymbol& top, const ValueSymbol& net, int bit) {
        return walk(top, top, net, bit, /*fwd*/ true, opt_.inputFanoutFlopThreshold);
    }
    WCone backward(const InstanceSymbol& top, const ValueSymbol& net, int bit) {
        return walk(top, top, net, bit, /*fwd*/ false, opt_.outputFaninFlopThreshold);
    }

    /// Of the flops a cone identified, how many sit on a SEQUENTIAL LOOP inside that same cone —
    /// their own output travels combinationally back to the D of a flop in the set (`acc <= acc +
    /// din` is the canonical one). A wrapper cell cannot place such a flop in a single shift, so
    /// they are counted against their own threshold rather than lumped in with the direct ones.
    int feedbackCount(const InstanceSymbol& core, const std::set<WFlop>& direct) {
        if (direct.size() < 1) return 0;
        const int limit = static_cast<int>(direct.size()) + 1;
        int n = 0;
        for (const WFlop& f : direct) {
            const WCone probe = walk(core, *f.inst, *f.var, f.bit, /*fwd*/ true, limit);
            for (const WFlop& g : probe.flops)
                if (direct.count(g)) { ++n; break; }
        }
        return n;
    }

    long long nodesWalked() const { return nodes_; }

    /// HDL_PROF=1: which half of the run costs — building the per-body indexes (one-time, grows
    /// with the design) or walking the cones (grows with the boundary).
    void reportProf() const {
        if (!g_walkProf.on) return;
        std::fprintf(stderr,
                     "  [prof] wrapper: index %.0f ms (%lld bodies) | cones %lld nodes\n",
                     indexMs_, indexBuilds_, nodes_);
    }

private:
    const WrapperOptions& opt_;
    /// The instance whose boundary is being analysed — neither cone may leave it.
    const InstanceSymbol* core_ = nullptr;
    /// Set only for the one port a diagram is being drawn for — the ordinary run must not pay for
    /// route-keeping on every bit of a 4000-port boundary.
    WTrace* trace_ = nullptr;
    WNode cur_{};   // the node currently being expanded, so a hop knows where it came from
    /// What the hop about to be pushed passes THROUGH. Set at each call site in the step
    /// functions, which are the only places that know it.
    std::string elem_, detail_;
    /// Clock net of the sequential block currently being expanded ("" outside one).
    std::string clock_;
    std::map<WFlop, std::string> flopClocks_;
    int line_ = 0;
    void elem(const char* shape, const char* detail, int line) {
        elem_ = shape && *shape ? shape : "logic";
        detail_ = detail;
        line_ = line;
    }
    long long nodes_ = 0;
    double indexMs_ = 0;
    long long indexBuilds_ = 0;
    std::unordered_map<const ProceduralBlockSymbol*, std::shared_ptr<WBlockScan>> blockCache_;
    std::unordered_map<const ProceduralBlockSymbol*,
                       std::shared_ptr<std::pair<std::set<const Symbol*>, std::set<const Symbol*>>>>
        eventCache_;
    std::unordered_map<const Scope*, std::shared_ptr<WBodyIndex>> indexCache_;

    const WBlockScan& blockOf(const ProceduralBlockSymbol& pb) {
        auto& slot = blockCache_[&pb];
        if (!slot) {
            slot = std::make_shared<WBlockScan>();
            pb.getBody().visit(*slot);
        }
        return *slot;
    }
    /// (clocks, async resets) of an edge-triggered block. Cached: the cone asks this at every hop
    /// that lands on a sequential block, and re-deriving it walks the timing control each time.
    const std::pair<std::set<const Symbol*>, std::set<const Symbol*>>& eventsOf(
        const ProceduralBlockSymbol& pb) {
        auto& slot = eventCache_[&pb];
        if (!slot) {
            slot = std::make_shared<std::pair<std::set<const Symbol*>, std::set<const Symbol*>>>();
            eventSymsOf(pb, slot->first, slot->second);
        }
        return *slot;
    }

    const WBodyIndex& indexOf(const InstanceSymbol& inst) {
        auto& slot = indexCache_[&inst.body];
        if (slot) return *slot;
        const auto tIx = std::chrono::steady_clock::now();
        ++indexBuilds_;
        struct Stop {
            WrapWalker* w;
            std::chrono::steady_clock::time_point t;
            ~Stop() {
                w->indexMs_ +=
                    std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t)
                        .count();
            }
        } stop{this, tIx};
        slot = std::make_shared<WBodyIndex>();
        WBodyIndex& ix = *slot;
        const Symbol& scopeSym = inst.body.asSymbol();

        for (const Symbol& m : inst.body.members())
            if (m.kind == SK::Port) {
                const auto& p = m.as<PortSymbol>();
                if (p.direction == ArgumentDirection::In) ix.inPorts.insert(p.name);
                else if (p.direction == ArgumentDirection::Out) ix.outPorts.insert(p.name);
            }

        std::vector<const ProceduralBlockSymbol*> procs;
        collectProcBlocks(inst.body, procs);
        for (const ProceduralBlockSymbol* pb : procs) {
            const WBlockScan& sc = blockOf(*pb);
            const WUse u{WUse::Kind::Proc, pb, nullptr, nullptr, nullptr, nullptr};
            // The clock and the async reset are reads too: that is how a clock port's cone
            // discovers it lands on a clock pin instead of a data pin.
            const auto& ev = eventsOf(*pb);
            for (const std::set<const Symbol*>* set : {&ev.first, &ev.second})
                for (const Symbol* s : *set)
                    if (const auto* v = s->as_if<ValueSymbol>()) {
                        RefBits all;
                        all.setAll();
                        addUse(ix.readers, v, all, u);
                    }
            std::set<const ValueSymbol*> reads, writes;
            for (const auto& [asn, conds] : sc.out) {
                ValueRefVisitor rv(reads);
                asn->right().visit(rv);
                for (const Expression* ce : conds) ce->visit(rv);
                collectLhsIndexReads(asn->left(), reads);
                collectLhsTargets(asn->left(), writes);
            }
            for (const ValueSymbol* v : reads) {
                RefBits rb;
                for (const auto& [asn, conds] : sc.out) {
                    readBitsOf(asn->right(), *v, scopeSym, rb, 0);
                    for (const Expression* ce : conds) readBitsOf(*ce, *v, scopeSym, rb, 0);
                    if (rb.all) break;
                }
                addUse(ix.readers, v, rb, u);
            }
            for (const ValueSymbol* v : writes) {
                RefBits rb;
                for (const auto& [asn, conds] : sc.out) {
                    readBitsOf(asn->left(), *v, scopeSym, rb, 0);
                    if (rb.all) break;
                }
                addUse(ix.drivers, v, rb, u);
            }
        }

        std::vector<const ContinuousAssignSymbol*> cas;
        collectContAssigns(inst.body, cas);
        for (const ContinuousAssignSymbol* ca : cas) {
            const Expression& e = ca->getAssignment();
            if (e.kind != ExpressionKind::Assignment) continue;
            const auto& asn = e.as<AssignmentExpression>();
            const WUse u{WUse::Kind::Assign, nullptr, &asn, nullptr, nullptr, nullptr};
            std::set<const ValueSymbol*> reads, writes;
            {
                ValueRefVisitor rv(reads);
                asn.right().visit(rv);
            }
            collectLhsIndexReads(asn.left(), reads);
            collectLhsTargets(asn.left(), writes);
            for (const ValueSymbol* v : reads) {
                RefBits rb;
                readBitsOf(asn.right(), *v, scopeSym, rb, 0);
                addUse(ix.readers, v, rb, u);
            }
            for (const ValueSymbol* v : writes) {
                RefBits rb;
                readBitsOf(asn.left(), *v, scopeSym, rb, 0);
                addUse(ix.drivers, v, rb, u);
            }
        }

        std::vector<const ValueSymbol*> inits;
        collectNetInits(inst.body, inits);
        for (const ValueSymbol* v : inits) {
            const Expression* init = v->getInitializer();
            if (!init) continue;
            const WUse u{WUse::Kind::NetInit, nullptr, nullptr, v, nullptr, nullptr};
            std::set<const ValueSymbol*> reads;
            {
                ValueRefVisitor rv(reads);
                init->visit(rv);
            }
            for (const ValueSymbol* r : reads) {
                RefBits rb;
                readBitsOf(*init, *r, scopeSym, rb, 0);
                addUse(ix.readers, r, rb, u);
            }
            RefBits all;
            all.setAll();
            addUse(ix.drivers, v, all, u);
        }

        std::vector<const Symbol*> kids;
        collectChildren(inst.body, kids);
        for (const Symbol* k : kids) {
            if (!isRealInstance(*k)) continue;  // blackbox/primitive: nothing to look inside
            const auto& child = k->as<InstanceSymbol>();
            for (auto* pc : child.getPortConnections()) {
                if (pc->port.kind != SK::Port) continue;
                const auto& ps = pc->port.as<PortSymbol>();
                const Expression* ex = pc->getExpression();
                if (!ex) continue;
                const WUse u{WUse::Kind::ChildPort, nullptr, nullptr, nullptr, &child, pc};
                if (ps.direction == ArgumentDirection::Out) {
                    const Expression& lhs = ex->kind == ExpressionKind::Assignment
                                                ? ex->as<AssignmentExpression>().left()
                                                : *ex;
                    std::set<const ValueSymbol*> writes;
                    collectLhsTargets(lhs, writes);
                    for (const ValueSymbol* v : writes) {
                        RefBits rb;
                        readBitsOf(lhs, *v, scopeSym, rb, 0);
                        addUse(ix.drivers, v, rb, u);
                    }
                } else {
                    // An inout is indexed as a read only; its drive side is not modelled.
                    std::set<const ValueSymbol*> reads;
                    {
                        ValueRefVisitor rv(reads);
                        ex->visit(rv);
                    }
                    for (const ValueSymbol* v : reads) {
                        RefBits rb;
                        readBitsOf(*ex, *v, scopeSym, rb, 0);
                        addUse(ix.readers, v, rb, u);
                    }
                }
            }
        }
        return ix;
    }

    WCone walk(const InstanceSymbol& core, const InstanceSymbol& startInst,
               const ValueSymbol& net0, int bit0, bool fwd, int flopLimit) {
        WCone c;
        core_ = &core;
        std::unordered_set<WNode, WNodeHash> seen;
        std::vector<std::pair<WNode, int>> work{{WNode{&startInst, &net0, bit0}, 0}};
        seen.insert(work.front().first);
        int nodes = 0;

        auto push = [&](const InstanceSymbol* inst, const ValueSymbol* net, int bit, int level) {
            if (!inst || !net || bit < 0 || bit >= widthOfVal(*net)) return;
            if (level > opt_.levelsThreshold) { c.depthLimit = true; return; }
            const WNode n{inst, net, bit};
            if (trace_) trace_->edges.push_back({cur_, n, elem_, detail_, line_});
            if (!seen.insert(n).second) return;
            work.emplace_back(n, level);
        };
        auto addFlop = [&](const InstanceSymbol* inst, const ValueSymbol* var, int bit) {
            if (!inst || !var || bit < 0 || bit >= widthOfVal(*var)) return;
            if (trace_) trace_->flopEdges.emplace_back(cur_, WFlop{inst, var, bit});
            if (!clock_.empty()) flopClocks_.emplace(WFlop{inst, var, bit}, clock_);
            c.flops.insert(WFlop{inst, var, bit});
            if (static_cast<int>(c.flops.size()) > flopLimit) c.overflow = true;
        };

        while (!work.empty() && !c.overflow) {
            if (++nodes > kWrapMaxNodes) { c.overflow = true; break; }
            const auto [n, level] = work.back();
            work.pop_back();
            if (level > c.maxLevel) c.maxLevel = level;
            cur_ = n;
            if (fwd) step_fwd(n, level, c, push, addFlop);
            else step_bwd(n, level, c, push, addFlop);
        }
        nodes_ += nodes;
        return c;
    }

    // ---- forward: input port bit -> flop D bits ------------------------------------------
    template <typename Push, typename AddFlop>
    void step_fwd(const WNode& n, int level, WCone& c, Push&& push, AddFlop&& addFlop) {
        const InstanceSymbol& inst = *n.inst;
        const Symbol& scopeSym = inst.body.asSymbol();
        const WBodyIndex& bix = indexOf(inst);

        forEachUse(bix.readers, n.net, n.bit, [&](const WUse& u) {
            switch (u.kind) {
                case WUse::Kind::Proc: {
                    const ProceduralBlockSymbol& pb = *u.pb;
                    const bool seq = isEdgeTriggered(pb);
                    if (seq) {
                        const auto& ev = eventsOf(pb);
                        if (ev.first.count(n.net)) { c.hitClock = true; c.sawLoad = true; return; }
                        if (ev.second.count(n.net)) { c.hitReset = true; c.sawLoad = true; return; }
                    }
                    const bool latch = pb.procedureKind == ProceduralBlockKind::AlwaysLatch;
                    // The clock is whatever this block triggers on; it is in scope only here.
                    clock_.clear();
                    if (seq)
                        for (const Symbol* cs : eventsOf(pb).first)
                            if (cs) { clock_ = std::string(cs->name); break; }
                    for (const auto& [asn, conds] : blockOf(pb).out) {
                        elem(seq ? "dff" : (latch ? "latch" : exprShape(asn->right())),
                             seq ? "always_ff" : (latch ? "always_latch" : "always_comb"),
                             0);
                        BitDep dep = depOf(asn->right(), *n.net, n.bit, scopeSym, 0);
                        bool viaCond = false;
                        for (const Expression* ce : conds)
                            if (depOf(*ce, *n.net, n.bit, scopeSym, 0).any) { viaCond = true; break; }
                        if (!dep.any && !viaCond) continue;
                        c.sawLoad = true;
                        if (latch) { c.nonScan = true; continue; }
                        const int rw = static_cast<int>(asn->right().type->getBitWidth());
                        if (viaCond) dep.setAll();   // a select reaches every bit the block writes
                        for (int rb : dep.resolve(rw)) {
                            WSrc tgt;
                            srcOf(asn->left(), rb, scopeSym, 0, tgt);
                            for (auto& [var, vb] : tgt) {
                                if (seq) addFlop(&inst, var, vb);
                                else push(&inst, var, vb, level + 1);
                            }
                        }
                    }
                    return;
                }
                case WUse::Kind::Assign: {
                    const AssignmentExpression& asn = *u.asn;
                    const BitDep dep = depOf(asn.right(), *n.net, n.bit, scopeSym, 0);
                    if (!dep.any) return;
                    c.sawLoad = true;
                    elem(exprShape(asn.right()), "assign", 0);
                    const int rw = static_cast<int>(asn.right().type->getBitWidth());
                    for (int rb : dep.resolve(rw)) {
                        WSrc tgt;
                        srcOf(asn.left(), rb, scopeSym, 0, tgt);
                        for (auto& [var, vb] : tgt) push(&inst, var, vb, level + 1);
                    }
                    return;
                }
                case WUse::Kind::NetInit: {
                    const Expression* init = u.net->getInitializer();
                    if (!init) return;
                    const BitDep dep = depOf(*init, *n.net, n.bit, scopeSym, 0);
                    if (!dep.any) return;
                    c.sawLoad = true;
                    elem(exprShape(*init), "net assignment", 0);
                    for (int rb : dep.resolve(widthOfVal(*u.net)))
                        push(&inst, u.net, rb, level + 1);
                    return;
                }
                case WUse::Kind::ChildPort: {
                    const auto& ps = u.pc->port.as<PortSymbol>();
                    if (ps.direction == ArgumentDirection::Out) return;
                    const Expression* ex = u.pc->getExpression();
                    if (!ex) return;
                    const BitDep dep = depOf(*ex, *n.net, n.bit, scopeSym, 0);
                    if (!dep.any) return;
                    // Crossing a module boundary is NOT itself a load: whatever is inside decides.
                    // Counting it as one made a port that only feeds a constant-disabled peripheral
                    // look live, and every such bit came out needing a dedicated cell.
                    const auto* iv =
                        ps.internalSymbol ? ps.internalSymbol->as_if<ValueSymbol>() : nullptr;
                    if (!iv) { c.hitBlackbox = true; return; }
                    elem("port", "module boundary", 0);
                    for (int rb : dep.resolve(widthOfVal(*iv))) push(u.child, iv, rb, level);
                    return;
                }
            }
        });

        // Reaching the core's own output port ends the walk, but the fact is worth recording: a
        // bit that arrives here having passed no flop is a feedthrough.
        if (&inst == core_ && bix.outPorts.count(n.net->name)) c.sawPO = true;

        // The bit left this module through an output port: continue in the parent. Never past the
        // core itself — its boundary is what is being analysed, not the environment around it.
        if (const InstanceSymbol* parent = &inst == core_ ? nullptr : parentInstanceOf(inst)) {
            if (bix.outPorts.count(n.net->name)) {
                for (auto* pc : inst.getPortConnections()) {
                    if (pc->port.kind != SK::Port || pc->port.name != n.net->name) continue;
                    const Expression* ex = pc->getExpression();
                    if (!ex) break;
                    const Expression* lhs =
                        ex->kind == ExpressionKind::Assignment
                            ? &ex->as<AssignmentExpression>().left()
                            : ex;
                    WSrc tgt;
                    srcOf(*lhs, n.bit, parent->body.asSymbol(), 0, tgt);
                    for (auto& [var, vb] : tgt) push(parent, var, vb, level);
                    break;
                }
            }
        }
    }

    // ---- backward: output port bit -> flop Q bits ----------------------------------------
    template <typename Push, typename AddFlop>
    void step_bwd(const WNode& n, int level, WCone& c, Push&& push, AddFlop&& addFlop) {
        const InstanceSymbol& inst = *n.inst;
        const Symbol& scopeSym = inst.body.asSymbol();
        const WBodyIndex& bix = indexOf(inst);

        forEachUse(bix.drivers, n.net, n.bit, [&](const WUse& u) {
            switch (u.kind) {
                case WUse::Kind::Proc: {
                    const ProceduralBlockSymbol& pb = *u.pb;
                    const bool seq = isEdgeTriggered(pb);
                    const bool latch = pb.procedureKind == ProceduralBlockKind::AlwaysLatch;
                    clock_.clear();
                    if (seq)
                        for (const Symbol* cs : eventsOf(pb).first)
                            if (cs) { clock_ = std::string(cs->name); break; }
                    for (const auto& [asn, conds] : blockOf(pb).out) {
                        const BitDep hit = depOf(asn->left(), *n.net, n.bit, scopeSym, 0);
                        if (!hit.any) continue;
                        c.sawDriver = true;
                        if (seq) { addFlop(&inst, n.net, n.bit); continue; }
                        if (latch) { c.nonScan = true; continue; }
                        WSrc src;
                        for (int rb :
                             hit.resolve(static_cast<int>(asn->right().type->getBitWidth())))
                            srcOf(asn->right(), rb, scopeSym, 0, src);
                        for (const Expression* ce : conds) addAllBits(*ce, src);
                        if (!src.empty()) c.sawSource = true;
                        elem(seq ? "dff" : exprShape(asn->right()),
                             seq ? "always_ff" : "always", 0);
                        for (auto& [var, vb] : src) push(&inst, var, vb, level + 1);
                    }
                    return;
                }
                case WUse::Kind::Assign: {
                    const AssignmentExpression& asn = *u.asn;
                    const BitDep hit = depOf(asn.left(), *n.net, n.bit, scopeSym, 0);
                    if (!hit.any) return;
                    c.sawDriver = true;
                    WSrc src;
                    for (int rb : hit.resolve(static_cast<int>(asn.right().type->getBitWidth())))
                        srcOf(asn.right(), rb, scopeSym, 0, src);
                    if (!src.empty()) c.sawSource = true;
                    elem(exprShape(asn.right()), "assign", 0);
                    for (auto& [var, vb] : src) push(&inst, var, vb, level + 1);
                    return;
                }
                case WUse::Kind::NetInit: {
                    const Expression* init = u.net->getInitializer();
                    if (!init || u.net != n.net) return;
                    c.sawDriver = true;
                    WSrc src;
                    srcOf(*init, n.bit, scopeSym, 0, src);
                    if (!src.empty()) c.sawSource = true;
                    for (auto& [var, vb] : src) push(&inst, var, vb, level + 1);
                    return;
                }
                case WUse::Kind::ChildPort: {
                    const auto& ps = u.pc->port.as<PortSymbol>();
                    if (ps.direction != ArgumentDirection::Out) return;
                    const Expression* ex = u.pc->getExpression();
                    if (!ex) return;
                    const Expression* lhs = ex->kind == ExpressionKind::Assignment
                                                ? &ex->as<AssignmentExpression>().left()
                                                : ex;
                    const BitDep hit = depOf(*lhs, *n.net, n.bit, scopeSym, 0);
                    if (!hit.any) return;
                    c.sawDriver = true;
                    const auto* iv =
                        ps.internalSymbol ? ps.internalSymbol->as_if<ValueSymbol>() : nullptr;
                    if (!iv) { c.hitBlackbox = true; return; }
                    c.sawSource = true;
                    elem("port", "module boundary", 0);
                    for (int rb : hit.resolve(widthOfVal(*iv))) push(u.child, iv, rb, level);
                    return;
                }
            }
        });

        // Nothing inside drives it: an input port takes its value from the parent — unless this
        // IS the core, whose inputs are the boundary the analysis is about.
        const bool atCore = &inst == core_;
        const bool isIn = bix.inPorts.count(n.net->name) != 0;
        if (atCore && isIn) c.sawPI = true;
        const InstanceSymbol* parent = atCore ? nullptr : parentInstanceOf(inst);
        if (parent) {
            if (isIn) {
                for (auto* pc : inst.getPortConnections()) {
                    if (pc->port.kind != SK::Port || pc->port.name != n.net->name) continue;
                    const Expression* ex = pc->getExpression();
                    if (!ex) break;
                    c.sawDriver = true;
                    WSrc src;
                    srcOf(*ex, n.bit, parent->body.asSymbol(), 0, src);
                    if (!src.empty()) c.sawSource = true;
                    for (auto& [var, vb] : src) push(parent, var, vb, level);
                    break;
                }
            }
        }
    }
};

/// "GPIO_1/p1_out[3]" — the flop path relative to the core, in the separator a DFT flow uses.
std::string flopLabel(const WFlop& f, const std::string& corePath) {
    std::string p = f.inst ? f.inst->getHierarchicalPath() : std::string();
    if (!corePath.empty() && p.rfind(corePath, 0) == 0) {
        p.erase(0, corePath.size());
        if (!p.empty() && (p[0] == '.' || p[0] == '/')) p.erase(0, 1);
    }
    for (char& ch : p)
        if (ch == '.') ch = '/';
    if (!p.empty()) p += '/';
    p += std::string(f.var->name);
    if (widthOfVal(*f.var) > 1)
        p += "[" + std::to_string(declaredIndexOf(f.var->getType(), f.bit)) + "]";
    return p;
}

bool excludedPort(const std::string& name, const std::vector<std::string>& pats) {
    for (const std::string& p : pats)
        if (globMatch(p.c_str(), name.c_str())) return true;
    return false;
}

}  // namespace

WrapperEstimate DesignDb::wrapperCells(const std::string& coreInstanceId,
                                       const WrapperOptions& opt) {
    WrapperEstimate est;
    std::string id = coreInstanceId;
    if (id.empty()) {
        if (p_->candidateTops.empty()) return est;
        id = p_->candidateTops.front().id;
    }
    est.core = id;

    ensureRegistered(id, /*expandSelf*/ true);
    auto it = p_->inst.find(id);
    if (it == p_->inst.end() || !isRealInstance(*it->second)) return est;
    const InstanceSymbol& top = it->second->as<InstanceSymbol>();
    p_->comp->getAllDiagnostics();  // fully elaborate before any structural walk

    const auto tStart = std::chrono::steady_clock::now();
    WrapWalker walker(opt);
    const auto say = [&](const std::string& s) {
        if (opt.log) opt.log(s);
    };

    // Count the boundary first so the progress line has a denominator — a user watching a
    // 4000-port block needs to know how far along it is, not just that it is still going.
    int totalBits = 0, totalPorts = 0;
    for (const Symbol* ps : top.body.getPortList()) {
        if (!ps || ps->kind != SK::Port) continue;
        const auto& p = ps->as<PortSymbol>();
        if (p.direction != ArgumentDirection::In && p.direction != ArgumentDirection::Out &&
            p.direction != ArgumentDirection::InOut)
            continue;
        ++totalPorts;
        totalBits += std::max(static_cast<int>(p.getType().getBitWidth()), 1);
    }
    say("core                 " + id);
    say("boundary             " + std::to_string(totalPorts) + " ports, " +
        std::to_string(totalBits) + " bits");
    say("thresholds           input fanout " + std::to_string(opt.inputFanoutFlopThreshold) +
        ", output fanin " + std::to_string(opt.outputFaninFlopThreshold) + ", feedback " +
        std::to_string(opt.feedbackFlopThreshold) + ", levels " +
        std::to_string(opt.levelsThreshold));
    say(std::string("register_undriven_output          ") +
        (opt.registerUndrivenOutput ? "on" : "off"));
    say(std::string("register_ports_reaching_blackboxes ") +
        (opt.registerPortsReachingBlackboxes ? "on" : "off"));
    say(std::string("infer_clock_ports                 ") + (opt.inferClockPorts ? "on" : "off"));
    say(std::string("skip_feedthrough_ports            ") + (opt.skipFeedthroughPorts ? "on" : "off"));
    // Every user constraint is echoed: a run whose answer surprises you should let you see what
    // it was told before you go looking at the design.
    const auto sayList = [&](const char* label, const std::vector<std::string>& v) {
        if (v.empty()) return;
        std::string s;
        for (const std::string& p : v) s += (s.empty() ? "" : " ") + p;
        say(std::string(label) + s);
    };
    sayList("exclude_ports        ", opt.excludePorts);
    sayList("clock_ports          ", opt.clockPorts);
    sayList("force_dedicated      ", opt.forceDedicatedPorts);
    sayList("force_shared         ", opt.forceSharedPorts);
    say("");

    // Report every ~2%, but never more often than every 64 bits — on a small block that keeps
    // the log to a handful of lines instead of one per port.
    const int step = std::max(64, totalBits / 50);
    int doneBits = 0, nextMark = step;

    for (const Symbol* ps : top.body.getPortList()) {
        if (!ps || ps->kind != SK::Port) continue;
        const auto& port = ps->as<PortSymbol>();
        const std::string pname(port.name);
        const Type& pt = port.getType();
        const int width = std::max(static_cast<int>(pt.getBitWidth()), 1);
        const bool isIn = port.direction == ArgumentDirection::In;
        const bool isOut = port.direction == ArgumentDirection::Out;
        const bool isBidi = port.direction == ArgumentDirection::InOut;
        if (!isIn && !isOut && !isBidi) continue;

        const auto* net = port.internalSymbol ? port.internalSymbol->as_if<ValueSymbol>() : nullptr;
        const bool skip = excludedPort(pname, opt.excludePorts);
        // User intent, resolved once per port. Order below: a declared clock beats everything
        // (a cell there lands in the clock path), then the explicit force switches, then what
        // the walk infers.
        const bool userClock = excludedPort(pname, opt.clockPorts);
        const bool userDedicated = excludedPort(pname, opt.forceDedicatedPorts);
        const bool userShared = excludedPort(pname, opt.forceSharedPorts);

        for (int b = 0; b < width; ++b) {
            WrapperPortCell row;
            row.port = pname;
            row.bit = b;
            row.name = width > 1 ? pname + "[" + std::to_string(declaredIndexOf(pt, b)) + "]"
                                 : pname;
            row.dir = isIn ? "in" : (isOut ? "out" : "inout");
            if (isIn) ++est.inputBits;
            else ++est.outputBits;

            if (skip) {
                row.decision = "none";
                row.reason = "excluded";
            } else if (userClock) {
                row.decision = "none";
                row.reason = "clock (declared)";
            } else if (!net) {
                row.decision = "none";
                row.reason = "no internal connection";
            } else if (isBidi) {
                // A bidirectional port has to be both controlled and observed in EXTEST; one
                // shared functional flop cannot do both, so the tool adds a cell.
                row.decision = "dedicated";
                row.reason = "bidirectional";
            } else {
                const WCone cone = isIn ? walker.forward(top, *net, b)
                                        : walker.backward(top, *net, b);
                const int limit =
                    isIn ? opt.inputFanoutFlopThreshold : opt.outputFaninFlopThreshold;
                const int nflops = static_cast<int>(cone.flops.size());

                if (userDedicated) {
                    // An explicit instruction outranks anything inferred below — including the
                    // clock inference, since the engineer saying "wrap this" knows what it is.
                    row.decision = "dedicated";
                    row.reason = "forced dedicated (user)";
                } else if (isIn && opt.inferClockPorts && cone.hitClock) {
                    // A clock gets NO cell, whether or not it also lands on data pins. This used
                    // to require an otherwise-empty cone, so a clock that fed a synchroniser's
                    // data pin anywhere in the design came out as an ordinary shared cell — which
                    // is a flop inserted into a clock path.
                    row.decision = "none";
                    row.reason = cone.flops.empty() ? "clock" : "clock (also reaches data)";
                } else if (isIn && cone.flops.empty() && cone.hitReset) {
                    row.decision = "none";
                    row.reason = "reset";
                } else if (opt.skipFeedthroughPorts && cone.flops.empty() &&
                           (isIn ? cone.sawPO : cone.sawPI)) {
                    // Input wired straight through to an output. A cell here sits in the middle
                    // of a pass-through path; both ends of it are already controlled and observed
                    // from the boundary on either side.
                    row.decision = "none";
                    row.reason = "feedthrough";
                } else if (isIn && !cone.sawLoad && !cone.hitBlackbox) {
                    row.decision = "none";
                    row.reason = "no functional load";
                } else if (!isIn && !cone.sawDriver) {
                    row.decision = opt.registerUndrivenOutput ? "dedicated" : "none";
                    row.reason = "undriven output";
                } else if (!isIn && cone.flops.empty() && !cone.hitBlackbox && !cone.sawPI) {
                    // Every path back from this output dies on a constant: no cell can move it,
                    // and none is needed. A FEEDTHROUGH from a core input reaches sawPI instead
                    // and still needs a cell to drive the outside world in EXTEST.
                    row.decision = "none";
                    row.reason = cone.sawSource ? "blocked output" : "constant-driven output";
                } else if (cone.hitBlackbox && !opt.registerPortsReachingBlackboxes &&
                           cone.flops.empty()) {
                    row.decision = "none";
                    row.reason = "reaches blackbox";
                } else if (!userShared && (cone.overflow || nflops > limit)) {
                    row.decision = "dedicated";
                    row.reason = "max identified cells";
                } else if (!userShared && !cone.flops.empty() &&
                           (row.flopsFeedback = walker.feedbackCount(top, cone.flops)) >
                               opt.feedbackFlopThreshold) {
                    row.decision = "dedicated";
                    row.reason = "max identified cells (fanout + feedback)";
                } else if (!userShared && cone.depthLimit) {
                    // The four threshold switches are exactly what a forced share overrides, per
                    // `set_dedicated_wrapper_cell_options off`. A latch in the path and an empty
                    // cone are not thresholds, so they still win below.
                    row.decision = "dedicated";
                    row.reason = "cone depth limit";
                } else if (cone.nonScan) {
                    row.decision = "dedicated";
                    row.reason = "non-scan element in cone";
                } else if (cone.flops.empty()) {
                    // A forced share cannot invent a flop to share; say so rather than silently
                    // doing the opposite of what was asked.
                    row.decision = "dedicated";
                    row.reason = userShared
                        ? (isIn ? "forced shared, but no flop in fanout"
                                : "forced shared, but no flop in fanin")
                        : (isIn ? "no flop in fanout" : "no flop in fanin");
                } else {
                    row.decision = "shared";
                    row.flops = nflops;
                    std::string best;
                    for (const WFlop& f : cone.flops) {
                        std::string lbl = flopLabel(f, id);
                        if (best.empty() || lbl < best) best = std::move(lbl);
                    }
                    row.cell = best;
                    // Clock of the flop actually chosen. Free: the walker recorded it when it
                    // found the flop, so no second walk is needed for 337 shared ports.
                    for (const WFlop& f : cone.flops)
                        if (flopLabel(f, id) == best) { row.clock = walker.clockOf(f); break; }
                }

                // Keep the evidence, whatever the decision was. A dedicated cell caused by
                // "max identified cells" is only checkable if the cells it counted are visible.
                row.levels = cone.maxLevel;
                for (const WFlop& f : cone.flops) {
                    if (static_cast<int>(row.candidates.size()) >= kWrapMaxCandidates) break;
                    row.candidates.push_back(
                        {flopLabel(f, id),
                         f.inst ? f.inst->getHierarchicalPath() : std::string()});
                }
                if (row.flops == 0) row.flops = nflops;   // report the cone even when not shared
            }

            if (row.decision == "shared") {
                if (isIn) ++est.sharedIn;
                else ++est.sharedOut;
            } else if (row.decision == "dedicated") {
                if (isIn) ++est.dedicatedIn;
                else ++est.dedicatedOut;
            } else {
                if (isIn) ++est.noneIn;
                else ++est.noneOut;
            }
            if (opt.logEveryPort) {
                std::string line = "  " + row.name + " (" + (isIn ? "I" : "O") + ")  " +
                                   row.decision;
                if (row.flops)
                    line += "  cells=" + std::to_string(row.flops - row.flopsFeedback) + "/" +
                            std::to_string(row.flopsFeedback);
                if (!row.cell.empty()) line += "  " + row.cell;
                if (!row.reason.empty()) line += "  [" + row.reason + "]";
                say(line);
            }
            if (++doneBits >= nextMark || doneBits == totalBits) {
                nextMark = doneBits + step;
                const int pct = totalBits ? doneBits * 100 / totalBits : 100;
                say("  " + std::to_string(doneBits) + "/" + std::to_string(totalBits) +
                    " port bits (" + std::to_string(pct) + "%)  shared " +
                    std::to_string(est.sharedIn + est.sharedOut) + "  dedicated " +
                    std::to_string(est.dedicatedIn + est.dedicatedOut) + "  none " +
                    std::to_string(est.noneIn + est.noneOut));
            }
            est.cells.push_back(std::move(row));
        }
    }
    walker.reportProf();
    est.coneNodes = walker.nodesWalked();
    est.analysisMs = std::chrono::duration<double, std::milli>(
                         std::chrono::steady_clock::now() - tStart).count();
    if (opt.log) {
        auto row3 = [&](const char* what, int in, int out) {
            std::string label(what);
            if (label.size() < 24) label.append(24 - label.size(), ' ');
            say("  " + label + "in " + std::to_string(in) + "   out " + std::to_string(out) +
                "   total " + std::to_string(in + out));
        };
        say("");
        row3("analysed port bits", est.inputBits, est.outputBits);
        row3("shared wrapper cells", est.sharedIn, est.sharedOut);
        row3("dedicated (added)", est.dedicatedIn, est.dedicatedOut);
        row3("no wrapper cell", est.noneIn, est.noneOut);
        row3("WRAPPER CELLS", est.wrapperIn(), est.wrapperOut());
        say("  scan cells added to the design: " + std::to_string(est.addedScanCells()) +
            "  (shared cells are already flops)");
        say("  analysis: " + std::to_string(static_cast<long long>(est.analysisMs)) + " ms, " +
            std::to_string(est.coneNodes) + " net bits visited");
    }
    return est;
}

// ---------------------------------------------------------------------------------------------
// The cone behind ONE port bit, as a drawable graph.
//
// Same walk, same options, same thresholds as wrapperCells — the only difference is that the
// route is kept. That matters: a picture drawn by a second, separately-configured analysis would
// be a picture of a different decision than the one in the table.
// ---------------------------------------------------------------------------------------------
WrapperCone DesignDb::wrapperCone(const std::string& coreInstanceId, const std::string& port,
                                  int bit, const WrapperOptions& opt) {
    WrapperCone out;
    out.port = port;
    out.bit = bit;

    std::string id = coreInstanceId;
    if (id.empty()) {
        if (p_->candidateTops.empty()) return out;
        id = p_->candidateTops.front().id;
    }
    out.core = id;

    ensureRegistered(id, /*expandSelf*/ true);
    auto it = p_->inst.find(id);
    if (it == p_->inst.end() || !isRealInstance(*it->second)) return out;
    const InstanceSymbol& top = it->second->as<InstanceSymbol>();
    p_->comp->getAllDiagnostics();

    // Find the port and its internal net.
    const PortSymbol* ps = nullptr;
    for (const Symbol* s : top.body.getPortList()) {
        if (!s || s->kind != SK::Port) continue;
        if (std::string(s->as<PortSymbol>().name) == port) { ps = &s->as<PortSymbol>(); break; }
    }
    if (!ps) return out;
    const auto* net = ps->internalSymbol ? ps->internalSymbol->as_if<ValueSymbol>() : nullptr;
    if (!net) return out;

    const bool isIn = ps->direction == ArgumentDirection::In;
    out.dir = isIn ? "in" : (ps->direction == ArgumentDirection::Out ? "out" : "inout");
    const int width = std::max(static_cast<int>(ps->getType().getBitWidth()), 1);
    if (bit < 0 || bit >= width) return out;
    out.name = width > 1 ? port + "[" + std::to_string(declaredIndexOf(ps->getType(), bit)) + "]"
                         : port;

    WrapWalker walker(opt);
    WrapWalker::WTrace tr;
    walker.setTrace(&tr);
    const WCone cone = isIn ? walker.forward(top, *net, bit) : walker.backward(top, *net, bit);
    walker.setTrace(nullptr);

    // ---- turn the recorded hops into nodes and edges ----------------------------------------
    const std::string corePath = id;
    const auto relative = [&](std::string p) {
        if (!corePath.empty() && p.rfind(corePath, 0) == 0) {
            p.erase(0, corePath.size());
            if (!p.empty() && (p[0] == '.' || p[0] == '/')) p.erase(0, 1);
        }
        for (char& ch : p)
            if (ch == '.') ch = '/';
        return p;
    };
    const auto nodeId = [&](const WNode& n) {
        return (n.inst ? n.inst->getHierarchicalPath() : std::string()) + "|" +
               std::string(n.net ? n.net->name : "") + "|" + std::to_string(n.bit);
    };
    const auto flopId = [&](const WFlop& f) {
        return "flop:" + (f.inst ? f.inst->getHierarchicalPath() : std::string()) + "|" +
               std::string(f.var ? f.var->name : "") + "|" + std::to_string(f.bit);
    };
    const auto bitLabel = [](const ValueSymbol& v, int b) {
        std::string s(v.name);
        if (widthOfVal(v) > 1) s += "[" + std::to_string(declaredIndexOf(v.getType(), b)) + "]";
        return s;
    };

    std::map<std::string, WrapperConeNode> byId;
    const auto addNet = [&](const WNode& n, const char* kind) -> WrapperConeNode& {
        const std::string nid = nodeId(n);
        auto ins = byId.find(nid);
        if (ins != byId.end()) return ins->second;
        WrapperConeNode wn;
        wn.id = nid;
        wn.kind = kind;
        wn.label = n.net ? bitLabel(*n.net, n.bit) : std::string();
        wn.instance = n.inst ? n.inst->getHierarchicalPath() : std::string();
        wn.scope = relative(wn.instance);
        return byId.emplace(nid, std::move(wn)).first->second;
    };

    const WNode start{&top, net, bit};
    addNet(start, "port");

    std::vector<WrapperConeEdge> edges;
    std::set<std::pair<std::string, std::string>> edgeSeen;
    const auto addEdge = [&](const std::string& a, const std::string& b) {
        if (a == b || a.empty() || b.empty()) return;
        if (!edgeSeen.emplace(a, b).second) return;
        edges.push_back({a, b});
    };

    // A hop becomes  net -> GATE -> net, and gates are keyed by (destination, element) so the
    // several hops of one statement collapse into ONE symbol: both operands of `y = a & b`
    // arrive at y through the same AND, which is what makes this a circuit rather than a list of
    // wires. A module-boundary crossing is not an element, so it stays a plain wire.
    for (const WrapWalker::WHop& h : tr.edges) {
        addNet(h.from, "net");
        addNet(h.to, "net");
        const std::string a = nodeId(h.from), b = nodeId(h.to);
        // A boundary crossing is not an element, and neither is `y = x` — both are wire, and
        // drawing a box for them would bury the real logic in renaming steps.
        if (h.elem.empty() || h.elem == "port" || h.elem == "alias") { addEdge(a, b); continue; }
        const std::string gid = "gate:" + b + "|" + h.elem;
        if (!byId.count(gid)) {
            WrapperConeNode g;
            g.id = gid;
            g.kind = "gate";
            g.elem = h.elem;
            g.detail = h.detail;
            // The net this gate DRIVES — its identity, and what a schematic id is built from.
            g.label = h.to.net ? bitLabel(*h.to.net, h.to.bit) : h.elem;
            g.instance = h.to.inst ? h.to.inst->getHierarchicalPath() : std::string();
            g.scope = relative(g.instance);
            byId.emplace(gid, std::move(g));
        }
        addEdge(a, gid);
        addEdge(gid, b);
    }
    for (const auto& [from, f] : tr.flopEdges) {
        addNet(from, "net");
        const std::string fid = flopId(f);
        if (!byId.count(fid)) {
            WrapperConeNode wn;
            wn.id = fid;
            wn.kind = "flop";
            wn.label = f.var ? bitLabel(*f.var, f.bit) : std::string();
            wn.instance = f.inst ? f.inst->getHierarchicalPath() : std::string();
            wn.scope = relative(wn.instance);
            wn.clock = walker.clockOf(f);
            byId.emplace(fid, std::move(wn));
        }
        addEdge(nodeId(from), fid);
    }
    // The start node is the boundary whatever else it looked like along the way.
    if (auto s = byId.find(nodeId(start)); s != byId.end()) {
        s->second.kind = "port";
        s->second.label = out.name;
    }

    // ---- levels: distance from the port, so the drawing has columns -------------------------
    std::map<std::string, std::vector<std::string>> fanout;
    for (const auto& e : edges) fanout[e.from].push_back(e.to);
    std::map<std::string, int> level{{nodeId(start), 0}};
    std::vector<std::string> queue{nodeId(start)};
    for (std::size_t qi = 0; qi < queue.size(); ++qi) {
        const std::string cur = queue[qi];
        const int lv = level[cur];
        for (const std::string& nx : fanout[cur]) {
            if (level.count(nx)) continue;
            level[nx] = lv + 1;
            queue.push_back(nx);
        }
    }

    // ---- emit, nearest the port first, cut at the readability limit -------------------------
    std::vector<const WrapperConeNode*> ordered;
    ordered.reserve(byId.size());
    for (auto& [k, v] : byId) {
        auto lv = level.find(k);
        const_cast<WrapperConeNode&>(v).level = lv == level.end() ? -1 : lv->second;
        if (v.level >= 0) ordered.push_back(&v);   // unreachable leftovers are not part of it
    }
    std::sort(ordered.begin(), ordered.end(),
              [](const WrapperConeNode* a, const WrapperConeNode* b) {
                  if (a->level != b->level) return a->level < b->level;
                  return a->id < b->id;
              });
    if (static_cast<int>(ordered.size()) > kWrapConeMaxNodes) {
        ordered.resize(kWrapConeMaxNodes);
        out.truncated = true;
    }
    std::set<std::string> kept;
    for (const WrapperConeNode* n : ordered) {
        kept.insert(n->id);
        out.nodes.push_back(*n);
    }
    for (const auto& e : edges)
        if (kept.count(e.from) && kept.count(e.to)) out.edges.push_back(e);

    // ---- the same verdict the table shows, so the picture is captioned by its conclusion ----
    const WrapperEstimate est = wrapperCells(id, opt);
    for (const WrapperPortCell& c : est.cells) {
        if (c.name != out.name) continue;
        out.decision = c.decision;
        out.reason = c.reason;
        out.cell = c.cell;
        break;
    }
    return out;
}

}  // namespace hdl::service
