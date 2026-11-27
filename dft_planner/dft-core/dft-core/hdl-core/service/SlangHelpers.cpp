#include "service/SlangHelpers.h"

#include "slang/ast/EvalContext.h"
#include "slang/ast/Expression.h"
#include "slang/ast/Scope.h"
#include "slang/ast/Symbol.h"
#include "slang/ast/expressions/AssignmentExpressions.h"
#include "slang/ast/expressions/ConversionExpression.h"
#include "slang/ast/expressions/SelectExpressions.h"
#include "slang/ast/symbols/BlockSymbols.h"
#include "slang/ast/symbols/CheckerSymbols.h"
#include "slang/ast/symbols/CompilationUnitSymbols.h"  // DefinitionSymbol
#include "slang/ast/symbols/InstanceSymbols.h"
#include "slang/ast/symbols/PortSymbols.h"
#include "slang/ast/types/Type.h"
#include "slang/numeric/ConstantValue.h"
#include "slang/text/SourceManager.h"

using namespace slang::ast;
using SK = slang::ast::SymbolKind;

namespace hdl::service {

void collectChildren(const Scope& scope, std::vector<const Symbol*>& out) {
    for (const Symbol& m : scope.members()) {
        switch (m.kind) {
            case SK::Instance:
                out.push_back(&m);
                break;
            case SK::InstanceArray:
                for (auto* e : m.as<InstanceArraySymbol>().elements) out.push_back(e);
                break;
            case SK::UninstantiatedDef:
            case SK::PrimitiveInstance:
            // A `checker` instance is not an InstanceSymbol, so it is never walked into (it holds
            // assertions, not hardware). It is still listed: silently dropping it made the tree
            // disagree with the source about what a module contains.
            case SK::CheckerInstance:
                out.push_back(&m);
                break;
            case SK::GenerateBlock: {
                auto& gb = m.as<GenerateBlockSymbol>();
                if (!gb.isUninstantiated) collectChildren(gb, out);
                break;
            }
            case SK::GenerateBlockArray:
                for (auto* e : m.as<GenerateBlockArraySymbol>().entries) collectChildren(*e, out);
                break;
            default:
                break;
        }
    }
}

bool isRealInstance(const Symbol& s) { return s.kind == SK::Instance; }

std::string leafName(const Symbol& s) {
    if (!s.name.empty()) return std::string(s.name);
    std::string hp = s.getHierarchicalPath();
    auto pos = hp.rfind('.');
    return pos == std::string::npos ? hp : hp.substr(pos + 1);
}

std::string kindOf(const Symbol& s) {
    if (s.kind == SK::Instance) return "module";
    if (s.kind == SK::PrimitiveInstance) return "primitive";
    if (s.kind == SK::CheckerInstance) return "checker";
    return "blackbox";
}

static std::string fullPathOf(const Symbol& s, const slang::SourceManager& sm) {
    try {
        return sm.getFullPath(s.location.buffer()).string();
    } catch (...) {
        return "";
    }
}

DefInfo defInfo(const Symbol& s, const slang::SourceManager& sm) {
    DefInfo d;
    if (s.kind == SK::Instance) {
        const Symbol& defn = s.as<InstanceSymbol>().getDefinition();
        d.designName = std::string(defn.name);
        std::string path = fullPathOf(defn, sm);
        d.id = d.designName + "|" + path;
        if (!path.empty()) {
            d.filePath = path;
            d.hasPath = true;
        }
    } else if (s.kind == SK::UninstantiatedDef) {
        d.designName = std::string(s.as<UninstantiatedDefSymbol>().definitionName);
        d.id = d.designName + "|";
    } else if (s.kind == SK::CheckerInstance) {
        const Symbol& defn = s.as<CheckerInstanceSymbol>().body.checker;
        d.designName = std::string(defn.name);
        std::string path = fullPathOf(defn, sm);
        d.id = d.designName + "|" + path;
        if (!path.empty()) {
            d.filePath = path;
            d.hasPath = true;
        }
    } else {
        d.designName = "primitive";
        d.id = "primitive|";
    }
    return d;
}

std::string defIdOfDefinition(const Symbol& defn, const slang::SourceManager& sm) {
    return std::string(defn.name) + "|" + fullPathOf(defn, sm);
}

static std::string dirString(ArgumentDirection dir) {
    switch (dir) {
        case ArgumentDirection::In: return "in";
        case ArgumentDirection::Out: return "out";
        case ArgumentDirection::InOut: return "inout";
        case ArgumentDirection::Ref: return "ref";
    }
    return "inout";
}

static std::string busLabel(const std::string& name, const Type& t) {
    if (t.isScalar() || t.getBitWidth() == 1) return name;
    if (t.isIntegral()) {
        slang::ConstantRange r = t.getFixedRange();
        return name + "[" + std::to_string(r.left) + ":" + std::to_string(r.right) + "]";
    }
    return name;
}

std::vector<PortDict> portDicts(const InstanceSymbol& inst) {
    std::vector<PortDict> ports;
    for (const Symbol* p : inst.body.getPortList()) {
        if (p->kind == SK::Port) {
            const auto& port = p->as<PortSymbol>();
            const Type& t = port.getType();
            PortDict pd;
            pd.name = std::string(port.name);
            pd.direction = dirString(port.direction);
            pd.width = static_cast<int>(t.getBitWidth());
            pd.busLabel = busLabel(pd.name, t);
            pd.type = t.toString();
            pd.portKind = "port";
            ports.push_back(std::move(pd));
        } else if (p->kind == SK::InterfacePort) {
            const auto& ip = p->as<InterfacePortSymbol>();
            PortDict pd;
            pd.name = std::string(ip.name);
            pd.portKind = "interface";
            pd.interfaceType = ip.interfaceDef ? std::string(ip.interfaceDef->name) : "";
            pd.modport = std::string(ip.modport);
            ports.push_back(std::move(pd));
        }
        // MultiPort still skipped (branch added later)
    }
    return ports;
}

bool isParameterized(const InstanceSymbol& inst) {
    return !inst.body.getParameters().empty();
}

const Symbol* connNet(const PortConnection* pc) {
    const Expression* e = pc->getExpression();
    if (!e) return nullptr;
    if (e->kind == ExpressionKind::Assignment)  // output port -> AssignmentExpression
        e = &e->as<AssignmentExpression>().left();
    // See through slices and conversions: `.addr(mem_addr[10:0])` still CONNECTS mem_addr.
    // Without this every bit-sliced port connection was invisible to the structural scans
    // (the deadend sweep's "out:net-but-no-reader" category, 142 pins on the real design).
    while (true) {
        if (e->kind == ExpressionKind::Conversion)
            e = &e->as<ConversionExpression>().operand();
        else if (e->kind == ExpressionKind::ElementSelect)
            e = &e->as<ElementSelectExpression>().value();
        else if (e->kind == ExpressionKind::RangeSelect)
            e = &e->as<RangeSelectExpression>().value();
        else break;
    }
    return e->getSymbolReference();
}

std::optional<std::string> connTie(const PortConnection* pc) {
    const Expression* e = pc->getExpression();
    if (!e) return std::nullopt;                             // dangling .d()
    if (e->kind == ExpressionKind::Assignment) return std::nullopt;  // output port
    if (e->getSymbolReference()) return std::nullopt;        // real net -> not a tie
    EvalContext ctx(pc->port);
    slang::ConstantValue cv = e->eval(ctx);
    if (!cv || !cv.isInteger()) return std::nullopt;
    const auto& iv = cv.integer();
    if (iv.hasUnknown()) return std::nullopt;                // x/z -> treat as non-tie
    slang::SVInt norm = iv;                                  // signed ports: emit the raw
    norm.setSigned(false);                                   // bit pattern, not -N'sb form
    return norm.toString(slang::LiteralBase::Binary, /*includeBase*/ true);
}

}  // namespace hdl::service
