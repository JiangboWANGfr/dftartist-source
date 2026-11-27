#include "vinject.h"

#include <algorithm>
#include <cctype>
#include <regex>
#include <set>
#include <stdexcept>

#include "inject_payload.h"

// Regex/anchored-splice injector (C++ port of vinject.ts). Byte-identical to the TS injectDft.
// Targets "regular" synthesized netlists; the slang-anchored injector (inject-core) handles all
// valid Verilog. Payload (what to inject) is shared via inject_payload.h.

namespace genconn {

namespace {

int matchParen(const std::string& text, size_t open) {
    int depth = 0;
    for (size_t i = open; i < text.size(); ++i) {
        if (text[i] == '(')
            depth++;
        else if (text[i] == ')') {
            if (--depth == 0) return static_cast<int>(i);
        }
    }
    return -1;
}

std::string maskComments(const std::string& text) {
    std::string out = text;
    size_t n = text.size(), i = 0;
    while (i < n) {
        if (text[i] == '/' && i + 1 < n && text[i + 1] == '/') {
            while (i < n && text[i] != '\n') out[i++] = ' ';
        } else if (text[i] == '/' && i + 1 < n && text[i + 1] == '*') {
            out[i] = ' ';
            out[i + 1] = ' ';
            i += 2;
            while (i < n && !(text[i] == '*' && i + 1 < n && text[i + 1] == '/')) {
                if (text[i] != '\n') out[i] = ' ';
                i++;
            }
            if (i < n) {
                out[i] = ' ';
                if (i + 1 < n) out[i + 1] = ' ';
                i += 2;
            }
        } else {
            i++;
        }
    }
    return out;
}

struct ModuleBounds {
    size_t headerOpen, headerClose, bodyStart, bodyEnd;
};

ModuleBounds findModuleBounds(const std::string& masked, const std::string& designName) {
    static const std::regex re(R"(\bmodule\s+(\w+)\s*\()", std::regex::icase);
    std::string lname = designName;
    for (char& c : lname) c = static_cast<char>(std::tolower((unsigned char)c));
    long headerOpen = -1;
    for (auto it = std::sregex_iterator(masked.begin(), masked.end(), re);
         it != std::sregex_iterator(); ++it) {
        std::string nm = (*it)[1].str();
        for (char& c : nm) c = static_cast<char>(std::tolower((unsigned char)c));
        if (nm == lname) {
            headerOpen = static_cast<long>(masked.find('(', it->position()));
            break;
        }
    }
    if (headerOpen < 0) throw std::runtime_error("netlist: module '" + designName + "' not found");
    int headerClose = matchParen(masked, static_cast<size_t>(headerOpen));
    if (headerClose < 0)
        throw std::runtime_error("module '" + designName + "' port list not closed");
    size_t semi = masked.find(';', static_cast<size_t>(headerClose));
    if (semi == std::string::npos)
        throw std::runtime_error("module '" + designName + "' header missing ';'");
    size_t end = masked.find("endmodule", semi);
    return {static_cast<size_t>(headerOpen), static_cast<size_t>(headerClose), semi + 1,
            end == std::string::npos ? masked.size() : end};
}

struct Edit {
    size_t at;
    std::string insert;
};

std::vector<Edit> headerPortEdits(const std::string& masked, const std::string& designName,
                                  const ModuleBounds& b, const std::vector<PortDecl>& portDecls) {
    std::string headerText = masked.substr(b.headerOpen + 1, b.headerClose - (b.headerOpen + 1));
    if (std::regex_search(headerText, std::regex(R"(\b(input|output|inout)\b)")))
        throw std::runtime_error("module '" + designName + "' is ANSI port style (unsupported)");
    std::set<std::string> existing;
    {
        size_t start = 0;
        while (start <= headerText.size()) {
            size_t comma = headerText.find(',', start);
            std::string tok = headerText.substr(
                start, comma == std::string::npos ? std::string::npos : comma - start);
            std::string k = instKey(tok);
            if (!k.empty()) existing.insert(k);
            if (comma == std::string::npos) break;
            start = comma + 1;
        }
    }
    std::vector<std::string> dup;
    for (const auto& p : portDecls) {
        std::string lk = p.name;
        for (char& c : lk) c = static_cast<char>(std::tolower((unsigned char)c));
        if (existing.count(lk)) dup.push_back(p.name);
    }
    if (!dup.empty()) {
        std::string d;
        for (size_t i = 0; i < dup.size(); ++i) d += (i ? ", " : "") + dup[i];
        throw std::runtime_error("ported port clashes with existing module port: " + d);
    }
    std::string trimmed = headerText;
    {
        size_t a = trimmed.find_first_not_of(" \t\r\n\f\v");
        trimmed = (a == std::string::npos) ? "" : trimmed.substr(a);
    }
    bool emptyHeader = trimmed.empty();
    std::string names, decls;
    for (size_t i = 0; i < portDecls.size(); ++i)
        names += (i ? ",\n             " : "") + portDecls[i].name;
    for (size_t i = 0; i < portDecls.size(); ++i)
        decls += (i ? "\n  " : "") + (portDecls[i].dir + " " + fmtWidth(portDecls[i].width) +
                                      portDecls[i].name + ";");
    return {{b.headerClose, std::string(emptyHeader ? "" : ",") + "\n             " + names},
            {b.bodyStart, "\n  " + decls}};
}

}  // namespace

bool defNeedsDft(const HardenDef& root, const HardenLibrary& lib) {
    return !collectDftWiring(root, lib).nets.empty() || !collectPortedPorts(root).portDecls.empty();
}

std::string injectDft(const std::string& vText, const HardenLibrary& lib,
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

    std::map<std::string, std::string> keyOwner;
    for (const auto& i : root->childInstances) {
        std::string k = instKey(i.instanceName);
        if (!w.perInstance.count(k)) continue;
        std::string trimmed = i.instanceName;
        {
            size_t a = trimmed.find_first_not_of(" \t\r\n\f\v");
            size_t b = trimmed.find_last_not_of(" \t\r\n\f\v");
            trimmed = (a == std::string::npos) ? "" : trimmed.substr(a, b - a + 1);
        }
        auto it = keyOwner.find(k);
        if (it != keyOwner.end() && it->second != trimmed)
            throw std::runtime_error("instance name clash after normalization: '" + it->second +
                                     "' vs '" + trimmed + "'");
        keyOwner[k] = trimmed;
    }

    std::string masked = maskComments(vText);
    ModuleBounds b = findModuleBounds(masked, root->designName);

    std::vector<Edit> edits;
    if (!ported.portDecls.empty())
        for (auto& e : headerPortEdits(masked, root->designName, b, ported.portDecls))
            edits.push_back(e);

    static const std::regex re(
        R"((\\\S+|[A-Za-z_]\w*)\s+(?:#\s*\((?:[^()]|\([^()]*\))*\)\s*)?(\\\S+|[A-Za-z_]\w*)\s*\()");
    std::set<std::string> matched;
    long firstInstStart = -1;
    size_t pos = b.bodyStart;
    std::smatch m;
    while (pos <= masked.size() && std::regex_search(masked.cbegin() + pos, masked.cend(), m, re)) {
        size_t idx = pos + static_cast<size_t>(m.position(0));
        size_t len = static_cast<size_t>(m.length(0));
        if (idx >= b.bodyEnd) break;
        std::string instName = m[2].str();
        std::string key = instKey(instName);
        auto pit = w.perInstance.find(key);
        if (pit == w.perInstance.end()) {
            pos = idx + len;
            continue;
        }
        if (!matched.insert(key).second)
            throw std::runtime_error("netlist has duplicate instances after normalization: '" +
                                     instName + "'");
        if (firstInstStart < 0 || idx < static_cast<size_t>(firstInstStart))
            firstInstStart = static_cast<long>(idx);
        size_t open = masked.find('(', idx + len - 1);
        int close = matchParen(masked, open);
        if (close < 0) throw std::runtime_error("instance '" + instName + "' port list not closed");
        bool empty = masked.substr(open + 1, close - (open + 1))
                         .find_first_not_of(" \t\r\n\f\v") == std::string::npos;
        std::string dft;
        const auto& ports = pit->second;
        for (size_t i = 0; i < ports.size(); ++i)
            dft += (i ? ", " : "") + ("." + ports[i].port + "(" + ports[i].net + ")");
        edits.push_back(
            {static_cast<size_t>(close), std::string(empty ? "" : ",") + "\n          " + dft});
        pos = static_cast<size_t>(close);
    }

    std::vector<std::string> unmatched;
    for (const auto& [k, v] : w.perInstance)
        if (!matched.count(k)) unmatched.push_back(k);
    if (!unmatched.empty()) {
        std::string u;
        for (size_t i = 0; i < unmatched.size(); ++i) u += (i ? ", " : "") + unmatched[i];
        throw std::runtime_error("instances not found in netlist: " + u);
    }

    if (!w.nets.empty() && firstInstStart >= 0)
        edits.push_back({static_cast<size_t>(firstInstStart), wireBlock(w.nets) + "\n"});

    std::sort(edits.begin(), edits.end(), [](const Edit& a, const Edit& b) { return a.at > b.at; });
    std::string out = vText;
    for (const auto& e : edits) out = out.substr(0, e.at) + e.insert + out.substr(e.at);
    return out;
}

}  // namespace genconn
