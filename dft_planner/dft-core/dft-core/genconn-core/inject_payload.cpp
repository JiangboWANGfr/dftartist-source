#include "inject_payload.h"

#include <cctype>
#include <regex>
#include <set>

#include "expand.h"

namespace genconn {

std::string bareName(const std::string& s) {
    static const std::regex re(R"(\[\d+:\d+\]$)");
    return std::regex_replace(s, re, "");
}

std::string instKey(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n\f\v");
    size_t b = s.find_last_not_of(" \t\r\n\f\v");
    std::string t = (a == std::string::npos) ? "" : s.substr(a, b - a + 1);
    for (char& c : t) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return t;
}

const HardenDef* findDef(const HardenLibrary& lib, const std::string& id) {
    for (const auto& d : lib.defs)
        if (d.id == id) return &d;
    return nullptr;
}

static const BusInterface* ifaceOf(const HardenDef* def, const std::string& id) {
    if (!def) return nullptr;
    for (const auto& x : def->interfaces)
        if (x.id == id) return &x;
    return nullptr;
}

DftWiring collectDftWiring(const HardenDef& root, const HardenLibrary& lib) {
    std::map<std::string, const HardenInstance*> insts;
    for (const auto& i : root.childInstances) insts[i.id] = &i;
    auto defOf = [&](const HardenInstance* i) { return i ? findDef(lib, i->hardenId) : nullptr; };
    auto isTiling = [&](const HardenInstance* i) {
        const HardenDef* d = defOf(i);
        return d && d->designType == "tiling";
    };

    DftWiring w;
    std::set<std::string> netSeen;
    auto addPort = [&](const std::string& instName, const std::string& port, const std::string& net) {
        w.perInstance[instKey(instName)].push_back({port, net});
    };
    auto addNet = [&](const std::string& name, int width) {
        if (netSeen.insert(name).second) w.nets.push_back({name, width});
    };

    for (const auto& conn : root.connections) {
        auto ai = insts.find(conn.secondaryInstanceId);
        auto bi = insts.find(conn.clientInstanceId);
        if (ai == insts.end() || bi == insts.end()) continue;
        const HardenInstance* A = ai->second;
        const HardenInstance* B = bi->second;
        if (!isTiling(A) || !isTiling(B)) continue;
        const BusInterface* S = ifaceOf(defOf(A), conn.secondaryInterfaceId);
        const BusInterface* C = ifaceOf(defOf(B), conn.clientInterfaceId);
        if (!S || !C || S->busType != C->busType) continue;
        for (const Base& b : basesOf(*S)) {
            InterfaceSignal ss = secondarySignal(*S, b);
            InterfaceSignal cs = clientSignal(*C, b);
            std::string net = bareName(ss.name);
            addNet(net, ss.width);
            addPort(B->instanceName, bareName(cs.name), net);
            addPort(A->instanceName, net, net);
        }
    }
    return w;
}

PortedResult collectPortedPorts(const HardenDef& root) {
    PortedResult r;
    std::set<std::string> seen, seenFeed;
    auto addPort = [&](const std::string& instName, const std::string& port, const std::string& net) {
        std::string key = instKey(instName);
        if (!seenFeed.insert(key + std::string(1, '\0') + port).second) return;
        r.perInstance[key].push_back({port, net});
    };
    for (const auto& bi : root.interfaces) {
        if (!bi.portedFrom) continue;
        const HardenInstance* inst = nullptr;
        for (const auto& i : root.childInstances)
            if (i.id == bi.portedFrom->instanceId) { inst = &i; break; }
        if (!inst) continue;
        for (const auto& sig : expandInterface(bi)) {
            std::string bare = bareName(sig.name);
            if (seen.insert(bare).second) r.portDecls.push_back({bare, sig.direction, sig.width});
            addPort(inst->instanceName, bare, bare);
        }
    }
    return r;
}

std::string fmtWidth(int w) { return w > 1 ? ("[" + std::to_string(w - 1) + ":0] ") : ""; }

std::string wireBlock(const std::vector<NetDecl>& nets) {
    std::map<int, std::vector<std::string>> byWidth;
    for (const auto& n : nets) byWidth[n.width].push_back(n.name);
    std::vector<std::string> lines;
    for (const auto& [w, names] : byWidth) {
        std::string joined;
        for (size_t i = 0; i < names.size(); ++i) joined += (i ? ", " : "") + names[i];
        lines.push_back("  wire " + fmtWidth(w) + joined + ";");
    }
    std::string out;
    for (size_t i = 0; i < lines.size(); ++i) out += (i ? "\n" : "") + lines[i];
    return out;
}

}  // namespace genconn
