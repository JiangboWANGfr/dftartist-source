#include "extract.h"

#include <algorithm>
#include <cctype>
#include <map>
#include <stdexcept>

#include "frontend/SlangCompile.h"
#include "service/Filelist.h"
#include "service/SlangHelpers.h"
#include "slang/ast/Compilation.h"
#include "slang/ast/EvalContext.h"
#include "slang/ast/expressions/AssertionExpr.h"
#include "slang/ast/expressions/AssignmentExpressions.h"
#include "slang/ast/expressions/SelectExpressions.h"
#include "slang/ast/symbols/CompilationUnitSymbols.h"
#include "slang/ast/symbols/InstanceSymbols.h"
#include "slang/ast/symbols/PortSymbols.h"
#include "slang/numeric/ConstantValue.h"

using namespace slang::ast;
using SK = slang::ast::SymbolKind;

namespace pad {

namespace {

[[noreturn]] void fail(const std::string& why) { throw std::runtime_error("pad extract: " + why); }

std::string lower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return s;
}

// bound expression -> net name: identifier "n"; constant bit-select "n[i]"; else ""
// ctxSym: any enclosing Symbol, needed to build an EvalContext for folding the selector
// (blackbox port connections have no PortConnection/port Symbol to key off of, unlike
// SlangHelpers.cpp's connTie(); the instance symbol itself works just as well).
std::string exprNet(const Expression& e, const Symbol& ctxSym) {
    if (e.kind == ExpressionKind::NamedValue) {
        const Symbol* s = e.getSymbolReference();
        return s ? std::string(s->name) : "";
    }
    if (e.kind == ExpressionKind::ElementSelect) {
        const auto& sel = e.as<ElementSelectExpression>();
        std::string base = exprNet(sel.value(), ctxSym);
        if (base.empty() || base.find('[') != std::string::npos) return "";
        // The selector index is folded lazily: getConstant() is only populated once
        // eval() has run on it (see slang/ast/Expression.h), so evaluate it explicitly
        // the same way SlangHelpers.cpp's connTie() does for constant ties.
        EvalContext ctx(ctxSym);
        slang::ConstantValue cv = sel.selector().eval(ctx);
        if (cv.isInteger()) {
            const auto& iv = cv.integer();
            if (!iv.hasUnknown()) {
                if (auto idx = iv.as<int64_t>()) return base + "[" + std::to_string(*idx) + "]";
            }
        }
        return "";
    }
    return "";  // concat / tie / anything composite
}

// blackbox instance pin -> net (named connections only; "" for empty/tie/composite)
std::vector<std::pair<std::string, std::string>> bboxConns(const UninstantiatedDefSymbol& u) {
    std::vector<std::pair<std::string, std::string>> out;
    auto names = u.getPortNames();
    auto conns = u.getPortConnections();
    for (size_t i = 0; i < names.size(); ++i) {
        std::string net;
        if (i < conns.size() && conns[i] && !conns[i]->bad() &&
            conns[i]->kind == AssertionExprKind::Simple)
            net = exprNet(conns[i]->as<SimpleAssertionExpr>().expr, u);
        out.emplace_back(std::string(names[i]), net);
    }
    return out;
}

struct Walker {
    const std::map<std::string, PadCellInfo>& dict;
    ExtractResult& res;
    std::vector<const InstanceSymbol*> chain;  // top .. current enclosing instance

    // net name in chain.back()'s scope -> top-level port name ("" + warning if unresolved)
    std::string resolveGpio(std::string net, const std::string& padPath) {
        if (net.empty()) {
            res.warnings.push_back(padPath + ": pad pin unconnected/composite, gpio unresolved");
            return "";
        }
        if (net.find('[') != std::string::npos) {
            res.warnings.push_back(padPath + ": bit-select pad net '" + net +
                                   "' not traced (P1 limitation)");
            return "";
        }
        for (size_t level = chain.size(); level-- > 0;) {
            const InstanceSymbol* cur = chain[level];
            bool isPort = false;
            // NOTE: matches net name against port names; assumes no genblk-local net shadows
            // a module port (generate-loop pads use bit-selects, which bail out above)
            for (const Symbol* p : cur->body.getPortList())
                if (p->kind == SK::Port && p->as<PortSymbol>().name == net) { isPort = true; break; }
            if (!isPort) {
                res.warnings.push_back(padPath + ": net '" + net +
                                       "' is not a boundary port, gpio unresolved");
                return "";
            }
            if (level == 0) return net;  // reached top: net IS the top-level port
            const Symbol* outer = nullptr;
            bool composite = false;
            for (auto* pc : cur->getPortConnections()) {  // parent-side bindings (Netlist.cpp:90)
                if (pc->port.kind == SK::Port && pc->port.name == net) {
                    const Expression* pe = pc->getExpression();
                    if (pe && pe->kind == ExpressionKind::Assignment)  // output port wrapper
                        pe = &pe->as<AssignmentExpression>().left();
                    // connNet strips element selects — a `.P(BUS[i])` binding would silently
                    // yield the whole bus; only trust a plain identifier (P1: warn + bail)
                    if (pe && pe->kind != ExpressionKind::NamedValue) composite = true;
                    else outer = hdl::service::connNet(pc);
                    break;
                }
            }
            if (composite) {
                res.warnings.push_back(padPath + ": port '" + net +
                                       "' bound to bit-select/composite at " +
                                       std::string(cur->name) + " (P1 limitation), gpio unresolved");
                return "";
            }
            if (!outer) {
                res.warnings.push_back(padPath + ": port '" + net + "' unconnected or composite at " +
                                       std::string(cur->name) + ", gpio unresolved");
                return "";
            }
            net = std::string(outer->name);
        }
        return "";
    }

    void addPad(const UninstantiatedDefSymbol& u, const PadCellInfo& info,
                const std::string& path) {
        PadInstance row;
        row.path = path;
        row.cell = info.cell;
        row.dir = info.dir;
        for (auto& [pin, net] : bboxConns(u)) {
            if (pin == info.padPin) row.padNet = net;
            else if (!info.coreInPin.empty() && pin == info.coreInPin) row.coreInNet = net;
            else if (!info.coreOutPin.empty() && pin == info.coreOutPin) row.coreOutNet = net;
            else if (!info.enablePin.empty() && pin == info.enablePin) row.autoEnableNet = net;
        }
        row.gpio = resolveGpio(row.padNet, path);
        row.enable = row.autoEnableNet;  // default; overlay may override (spec §12)
        res.pads.push_back(std::move(row));
    }

    void checkCaseMismatch(const std::string& cellName, const std::string& path) {
        std::string lc = lower(cellName);
        for (const auto& [name, info] : dict) {
            if (name != cellName && lower(name) == lc) {
                res.warnings.push_back(path + ": module '" + cellName + "' resembles pad cell '" +
                                       name + "' (case mismatch), not treated as pad");
                return;
            }
        }
    }

    void walk(const InstanceSymbol& inst, const std::string& path) {
        chain.push_back(&inst);
        std::vector<const Symbol*> kids;
        hdl::service::collectChildren(inst.body, kids);
        for (const Symbol* k : kids) {
            std::string kpath = path + "." + hdl::service::leafName(*k);
            if (k->kind == SK::UninstantiatedDef) {
                const auto& u = k->as<UninstantiatedDefSymbol>();
                std::string cellName(u.definitionName);
                auto it = dict.find(cellName);
                if (it != dict.end()) addPad(u, it->second, kpath);
                else checkCaseMismatch(cellName, kpath);
            } else if (hdl::service::isRealInstance(*k)) {
                walk(k->as<InstanceSymbol>(), kpath);
            }
        }
        chain.pop_back();
    }
};

}  // namespace

ExtractResult extractPads(const std::string& filelistPath, const CellLib& lib) {
    auto fl = hdl::service::parseFilelist(filelistPath, {}, {});
    if (fl.files.empty()) fail("no source files resolved from " + filelistPath);
    std::string parseErr;
    auto design = hdl::frontend::compileSingleTree(fl.files, fl.defines, fl.incdirs, parseErr);
    if (!design) fail("parse error: " + parseErr);

    ExtractResult res;
    auto dict = buildPadDict(lib);
    Walker w{dict, res, {}};
    for (auto* top : design->comp->getRoot().topInstances)
        w.walk(*top, std::string(top->name));
    return res;
}

}  // namespace pad
