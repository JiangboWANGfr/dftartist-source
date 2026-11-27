#include "inject_slang.h"

#include <algorithm>
#include <map>
#include <stdexcept>
#include <vector>

#include "inject_payload.h"
#include "slang/diagnostics/Diagnostics.h"
#include "slang/parsing/Token.h"
#include "slang/syntax/AllSyntax.h"
#include "slang/syntax/SyntaxKind.h"
#include "slang/syntax/SyntaxNode.h"
#include "slang/syntax/SyntaxTree.h"
#include "slang/text/SourceLocation.h"
#include "slang/text/SourceManager.h"

using namespace slang::syntax;
using slang::parsing::Token;

namespace genconn {

namespace {

std::string lower(std::string s) {
    for (char& c : s) c = static_cast<char>(std::tolower((unsigned char)c));
    return s;
}

// Replace [at, at+removeLen) with `insert`.
struct Edit {
    size_t at;
    size_t removeLen;
    std::string insert;
};

void collectModules(const SyntaxNode& n, std::vector<const ModuleDeclarationSyntax*>& out) {
    if (n.kind == SyntaxKind::ModuleDeclaration) out.push_back(&n.as<ModuleDeclarationSyntax>());
    for (size_t i = 0; i < n.getChildCount(); ++i)
        if (const SyntaxNode* c = n.childNode(i)) collectModules(*c, out);
}

std::vector<std::string> portNamesOf(const ModuleDeclarationSyntax& mod) {
    std::vector<std::string> out;
    const PortListSyntax* pl = mod.header->ports;
    if (!pl) return out;
    if (pl->kind == SyntaxKind::AnsiPortList) {
        for (const MemberSyntax* m : pl->as<AnsiPortListSyntax>().ports) {
            if (m->kind == SyntaxKind::ImplicitAnsiPort)
                out.push_back(std::string(m->as<ImplicitAnsiPortSyntax>().declarator->name.valueText()));
            else if (m->kind == SyntaxKind::ExplicitAnsiPort)
                out.push_back(std::string(m->as<ExplicitAnsiPortSyntax>().name.valueText()));
        }
    } else if (pl->kind == SyntaxKind::NonAnsiPortList) {
        for (const NonAnsiPortSyntax* p : pl->as<NonAnsiPortListSyntax>().ports) {
            if (p->kind == SyntaxKind::ImplicitNonAnsiPort) {
                const auto& e = p->as<ImplicitNonAnsiPortSyntax>();
                if (e.expr && e.expr->kind == SyntaxKind::PortReference)
                    out.push_back(std::string(e.expr->as<PortReferenceSyntax>().name.valueText()));
            } else if (p->kind == SyntaxKind::ExplicitNonAnsiPort) {
                out.push_back(std::string(p->as<ExplicitNonAnsiPortSyntax>().name.valueText()));
            }
        }
    }
    return out;
}

std::string slice(const std::string& v, size_t a, size_t b) { return v.substr(a, b - a); }
std::string trim(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n\f\v");
    size_t b = s.find_last_not_of(" \t\r\n\f\v");
    return a == std::string::npos ? "" : s.substr(a, b - a + 1);
}

}  // namespace

std::string injectDftSlang(const std::string& vText, const HardenLibrary& lib,
                           const std::string& parentDefId) {
    const HardenDef* root = findDef(lib, parentDefId);
    if (!root) throw std::runtime_error("unknown def '" + parentDefId + "'");

    DftWiring w = collectDftWiring(*root, lib);
    PortedResult ported = collectPortedPorts(*root);
    for (auto& [k, arr] : ported.perInstance) {
        auto& ex = w.perInstance[k];
        ex.insert(ex.end(), arr.begin(), arr.end());
    }
    if (w.nets.empty() && ported.portDecls.empty()) return vText;

    // parse netlist
    slang::SourceManager sm;
    auto tree = SyntaxTree::fromText(std::string_view(vText), sm, "netlist.v");
    std::vector<const ModuleDeclarationSyntax*> modules;
    collectModules(tree->root(), modules);

    std::map<std::string, std::vector<std::string>> portOrder;  // moduleName(lower) -> port names
    const ModuleDeclarationSyntax* target = nullptr;
    std::string targetLower = lower(root->designName);
    for (const auto* mod : modules) {
        std::string nm = std::string(mod->header->name.valueText());
        portOrder[lower(nm)] = portNamesOf(*mod);
        if (lower(nm) == targetLower) target = mod;
    }
    if (!target) throw std::runtime_error("netlist: module '" + root->designName + "' not found");

    std::vector<Edit> edits;

    // --- lifted ports (portedFrom) into the module header ---
    if (!ported.portDecls.empty()) {
        const PortListSyntax* pl = target->header->ports;
        bool isAnsi = pl && pl->kind == SyntaxKind::AnsiPortList;
        bool isNonAnsi = pl && pl->kind == SyntaxKind::NonAnsiPortList;
        if (!pl || (!isAnsi && !isNonAnsi))
            throw std::runtime_error("module '" + root->designName +
                                     "' has no/unsupported port list for lifting");
        Token closeParen = isAnsi ? pl->as<AnsiPortListSyntax>().closeParen
                                  : pl->as<NonAnsiPortListSyntax>().closeParen;
        bool emptyList = isAnsi ? pl->as<AnsiPortListSyntax>().ports.empty()
                                : pl->as<NonAnsiPortListSyntax>().ports.empty();
        size_t closeOff = closeParen.location().offset();
        if (isAnsi) {
            std::string ins;
            for (size_t i = 0; i < ported.portDecls.size(); ++i) {
                const auto& p = ported.portDecls[i];
                ins += (i ? ", " : "") + (p.dir + " " + fmtWidth(p.width) + p.name);
            }
            edits.push_back({closeOff, 0, std::string(emptyList ? "" : ", ") + ins});
        } else {
            std::string names, decls;
            for (size_t i = 0; i < ported.portDecls.size(); ++i)
                names += (i ? ", " : "") + ported.portDecls[i].name;
            for (const auto& p : ported.portDecls)
                decls += "\n  " + p.dir + " " + fmtWidth(p.width) + p.name + ";";
            edits.push_back({closeOff, 0, std::string(emptyList ? "" : ", ") + names});
            edits.push_back({target->header->semi.location().offset() + 1, 0, decls});
        }
    }

    // --- enumerate instances in the target body, splice DFT connections ---
    std::map<std::string, bool> matched;
    long firstInjStart = -1;
    for (const MemberSyntax* member : target->members) {
        if (member->kind != SyntaxKind::HierarchyInstantiation) continue;
        const auto& hi = member->as<HierarchyInstantiationSyntax>();
        std::string typeLower = lower(std::string(hi.type.valueText()));
        size_t hiStart = hi.getFirstToken().location().offset();
        for (const HierarchicalInstanceSyntax* inst : hi.instances) {
            if (!inst->decl) continue;
            std::string instName = std::string(inst->decl->name.valueText());
            std::string key = instKey(instName);
            auto pit = w.perInstance.find(key);
            if (pit == w.perInstance.end()) continue;
            if (matched.count(key))
                throw std::runtime_error("duplicate instance in netlist: '" + instName + "'");
            matched[key] = true;
            if (firstInjStart < 0 || hiStart < static_cast<size_t>(firstInjStart))
                firstInjStart = static_cast<long>(hiStart);

            const auto& ports = pit->second;
            std::string dft;
            for (size_t i = 0; i < ports.size(); ++i)
                dft += (i ? ", " : "") + ("." + ports[i].port + "(" + ports[i].net + ")");

            size_t openOff = inst->openParen.location().offset();
            size_t closeOff = inst->closeParen.location().offset();
            bool empty = inst->connections.empty();
            bool ordered = !empty && inst->connections[0]->kind == SyntaxKind::OrderedPortConnection;

            if (ordered) {
                // convert positional -> named using the instantiated module's port order
                auto po = portOrder.find(typeLower);
                if (po == portOrder.end() || po->second.size() < inst->connections.size())
                    throw std::runtime_error("cannot convert positional ports for instance '" +
                                             instName + "' (module '" + std::string(hi.type.valueText()) +
                                             "' ports unknown)");
                std::string named;
                size_t i = 0;
                for (const PortConnectionSyntax* c : inst->connections) {
                    std::string expr;
                    if (c->kind == SyntaxKind::OrderedPortConnection) {
                        auto r = c->as<OrderedPortConnectionSyntax>().expr->sourceRange();
                        expr = trim(slice(vText, r.start().offset(), r.end().offset()));
                    }
                    named += (i ? ", " : "") + ("." + po->second[i] + "(" + expr + ")");
                    ++i;
                }
                named += ", " + dft;
                edits.push_back({openOff + 1, closeOff - (openOff + 1), named});
            } else {
                edits.push_back({closeOff, 0, std::string(empty ? "" : ",") + "\n          " + dft});
            }
        }
    }

    std::vector<std::string> unmatched;
    for (const auto& [k, v] : w.perInstance)
        if (!matched.count(k)) unmatched.push_back(k);
    if (!unmatched.empty()) {
        std::string u;
        for (size_t i = 0; i < unmatched.size(); ++i) u += (i ? ", " : "") + unmatched[i];
        throw std::runtime_error("instances not found in netlist: " + u);
    }

    if (!w.nets.empty() && firstInjStart >= 0)
        edits.push_back({static_cast<size_t>(firstInjStart), 0, wireBlock(w.nets) + "\n"});

    std::sort(edits.begin(), edits.end(), [](const Edit& a, const Edit& b) { return a.at > b.at; });
    std::string out = vText;
    for (const auto& e : edits)
        out = out.substr(0, e.at) + e.insert + out.substr(e.at + e.removeLen);
    return out;
}

int parseErrorCount(const std::string& vText) {
    slang::SourceManager sm;
    auto tree = SyntaxTree::fromText(std::string_view(vText), sm, "check.v");
    int errs = 0;
    for (const auto& d : tree->diagnostics())
        if (d.isError()) ++errs;
    return errs;
}

}  // namespace genconn
