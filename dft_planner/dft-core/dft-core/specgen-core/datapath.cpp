#include "datapath.h"

#include <deque>
#include <stdexcept>
#include <unordered_map>
#include <unordered_set>

#include "catalog.h"

namespace specgen {

namespace {
using hdl::json::Value;

// ---- graph ---------------------------------------------------------------

std::string ipPortKey(const std::string& ipId, const std::string& port) {
    return "ip:" + ipId + ":" + port;
}

bool roleEq(const DftPort& p, const char* r) { return p.role.has_value() && *p.role == r; }

// JS `g.ipOf.get(v) === null`: present AND null (iface). Absent -> undefined !== null -> false.
bool ipOfNull(const Graph& g, const std::string& k) {
    auto it = g.ipOf.find(k);
    return it != g.ipOf.end() && !it->second.has_value();
}
// JS `g.ipOf.get(k) ?? null`: owner id (present) or nullopt (null or absent).
std::optional<std::string> ipOfOwner(const Graph& g, const std::string& k) {
    auto it = g.ipOf.find(k);
    if (it == g.ipOf.end()) return std::nullopt;
    return it->second;
}

std::vector<DftEndpoint> dedupByKey(const std::vector<DftEndpoint>& eps) {
    std::unordered_set<std::string> seen;
    std::vector<DftEndpoint> out;
    for (const auto& e : eps) {
        std::string k = keyOf(e);
        if (!seen.count(k)) { seen.insert(k); out.push_back(e); }
    }
    return out;
}

std::optional<std::vector<std::string>> bfsBlockingBoundaries(const Graph& g, const std::string& start,
                                                              const std::string& goal) {
    std::unordered_map<std::string, std::optional<std::string>> prev;
    prev[start] = std::nullopt;
    std::deque<std::string> q;
    q.push_back(start);
    while (!q.empty()) {
        std::string u = q.front();
        q.pop_front();
        if (u == goal) break;
        auto it = g.adj.find(u);
        if (it == g.adj.end()) continue;
        for (const auto& v : it->second) {
            if (prev.count(v)) continue;
            if (v != goal && ipOfNull(g, v)) continue;  // block mid-path iface boundary
            prev[v] = u;
            q.push_back(v);
        }
    }
    if (!prev.count(goal)) return std::nullopt;
    std::vector<std::string> path;
    std::optional<std::string> c = goal;
    while (c.has_value()) { path.insert(path.begin(), *c); c = prev[*c]; }
    return path;
}

std::vector<std::string> ipPath(const Graph& g, const std::vector<std::string>& keys) {
    std::vector<std::string> out;
    for (const auto& k : keys) {
        auto id = ipOfOwner(g, k);
        if (!id) continue;
        if (out.empty() || out.back() != *id) out.push_back(*id);
    }
    return out;
}
std::vector<std::string> reversedUnique(const std::vector<std::string>& ids) {
    std::unordered_set<std::string> seen;
    std::vector<std::string> out;
    for (auto it = ids.rbegin(); it != ids.rend(); ++it)
        if (!seen.count(*it)) { seen.insert(*it); out.push_back(*it); }
    return out;
}

DpNode buildNode(const Graph& g, const std::string& ipId) {
    const DftIpInstance* ip = g.ipById.at(ipId);
    DpNode n;
    n.type = ip->ipType;
    n.instanceName = ip->instanceName;
    n.id = ip->instanceName;
    if (ip->config.type == Value::Type::Null) n.params.type = Value::Type::Object;  // (ip.config ?? {})
    else n.params = ip->config;
    n.moduleName = ip->moduleName;
    return n;
}

std::vector<std::string> chainBackward(const Graph& g, const std::string& startInKey,
                                       const std::unordered_set<std::string>* stopSet) {
    std::string cur = startInKey;
    std::vector<std::string> out;
    std::unordered_set<std::string> seen{cur};
    while (true) {
        auto it = g.radj.find(cur);
        if (it == g.radj.end() || it->second.empty()) break;
        std::string nxt = it->second[0];
        if (seen.count(nxt)) break;
        seen.insert(nxt);
        auto owner = ipOfOwner(g, nxt);
        if (!owner) break;
        if (stopSet && stopSet->count(*owner)) break;
        if (out.empty() || out.back() != *owner) out.push_back(*owner);
        cur = nxt;
    }
    return out;
}

struct ChainWithIface {
    std::vector<std::string> chain;
    std::optional<std::string> ifaceId;
};

ChainWithIface chainBackwardToIface(const Graph& g, const std::string& startInKey) {
    std::string cur = startInKey;
    ChainWithIface r;
    std::unordered_set<std::string> seen{cur};
    while (true) {
        auto it = g.radj.find(cur);
        if (it == g.radj.end() || it->second.empty()) return r;
        std::string nxt = it->second[0];
        if (seen.count(nxt)) return r;
        seen.insert(nxt);
        auto owner = ipOfOwner(g, nxt);
        if (!owner) {
            auto fit = g.ifaceIdOf.find(nxt);
            if (fit != g.ifaceIdOf.end()) r.ifaceId = fit->second;
            return r;
        }
        if (r.chain.empty() || r.chain.back() != *owner) r.chain.push_back(*owner);
        cur = nxt;
    }
}

std::optional<std::vector<DpNode>> buildSmuxSecondary(const Graph& g, const std::string& ipId) {
    auto it = g.ipById.find(ipId);
    if (it == g.ipById.end() || it->second->ipType != "Multiplexer") return std::nullopt;
    auto stopVec = chainBackward(g, ipPortKey(ipId, "master_bus_data_in"), nullptr);
    std::unordered_set<std::string> stop(stopVec.begin(), stopVec.end());
    auto chain = chainBackward(g, ipPortKey(ipId, "secondary_bus_data_in"), &stop);
    if (chain.empty()) return std::nullopt;
    std::vector<DpNode> nodes;
    for (const auto& id : chain) nodes.push_back(buildNode(g, id));
    return nodes;
}

ChainWithIface chainForward(const Graph& g, const std::string& startInKey,
                            const std::unordered_set<std::string>& stopSet) {
    std::string cur = startInKey;
    ChainWithIface r;
    std::unordered_set<std::string> seen{cur};
    while (true) {
        auto it = g.adj.find(cur);
        if (it == g.adj.end() || it->second.empty()) return r;
        std::string nxt = it->second[0];
        if (seen.count(nxt)) return r;
        seen.insert(nxt);
        auto owner = ipOfOwner(g, nxt);
        if (!owner) {
            auto fit = g.ifaceIdOf.find(nxt);
            if (fit != g.ifaceIdOf.end()) r.ifaceId = fit->second;
            return r;
        }
        if (stopSet.count(*owner)) return r;
        if (r.chain.empty() || r.chain.back() != *owner) r.chain.push_back(*owner);
        cur = nxt;
    }
}

std::optional<std::vector<ExtraOutput>> buildExtraOutputs(const Graph& g, const std::string& ipId,
                                                          const std::vector<std::string>& mainKeys,
                                                          const std::unordered_set<std::string>& mainIpSet,
                                                          int defaultWidth) {
    const DftIpInstance* ip = g.ipById.at(ipId);
    const DftPort* outPort = nullptr;
    for (const auto& p : catalogEntry(ip->ipType).ports)
        if (p.dir == "out" && !roleEq(p, "clock")) { outPort = &p; break; }
    if (!outPort) return std::nullopt;
    std::string ok = ipPortKey(ipId, outPort->name);
    int idx = -1;
    for (size_t i = 0; i < mainKeys.size(); ++i)
        if (mainKeys[i] == ok) { idx = static_cast<int>(i); break; }
    std::optional<std::string> mainSucc;  // main path's already-used out edge target
    if (idx >= 0 && idx + 1 < static_cast<int>(mainKeys.size())) mainSucc = mainKeys[idx + 1];

    std::vector<ExtraOutput> extras;
    auto it = g.adj.find(ok);
    if (it != g.adj.end()) {
        for (const auto& v : it->second) {
            if (mainSucc && v == *mainSucc) continue;
            std::vector<std::string> chainIds;
            std::optional<std::string> exitInterfaceId;
            if (!ipOfOwner(g, v)) {
                auto fit = g.ifaceIdOf.find(v);
                if (fit != g.ifaceIdOf.end()) exitInterfaceId = fit->second;  // branch straight to iface
            } else {
                auto res = chainForward(g, v, mainIpSet);
                chainIds = res.chain;
                exitInterfaceId = res.ifaceId;
            }
            if (chainIds.empty() && !exitInterfaceId) continue;
            std::vector<DpNode> chain;
            for (const auto& id : chainIds) {
                DpNode n = buildNode(g, id);
                auto s = buildSmuxSecondary(g, id);
                if (s) n.smux_secondary = *s;
                chain.push_back(std::move(n));
            }
            ExtraOutput eo;
            eo.outputBusWidth = defaultWidth;
            eo.chain = std::move(chain);
            if (exitInterfaceId) eo.exitInterfaceId = exitInterfaceId;
            extras.push_back(std::move(eo));
        }
    }
    if (extras.empty()) return std::nullopt;
    return extras;
}

int exitBusWidthOf(const SpecgenScope& scope, const DftEndpoint& exit) {
    // (exit.kind==="iface" && interfaces.find(id)?.busWidth) || 4  -> 0/absent => 4.
    if (exit.kind == "iface")
        for (const auto& itf : scope.interfaces)
            if (itf.id == exit.interfaceId) {
                if (itf.busWidth.has_value() && *itf.busWidth != 0) return *itf.busWidth;  // JS `|| 4`: 只 0/缺失→4
                break;
            }
    return 4;
}

}  // namespace

std::string keyOf(const DftEndpoint& ep) {
    return ep.kind == "ip" ? ("ip:" + ep.ipId + ":" + ep.port)
                           : ("if:" + ep.instanceId + ":" + ep.interfaceId + ":" + ep.pin);
}

Graph buildGraph(const SpecgenScope& scope) {
    Graph g;
    for (const auto& ip : scope.dftIps) g.ipById[ip.id] = &ip;

    auto addEdge = [&](const std::string& a, const std::string& b) {
        g.adj[a].push_back(b);
        g.radj[b].push_back(a);
    };
    auto reg = [&](const DftEndpoint& ep) -> std::string {
        std::string k = keyOf(ep);
        if (g.ipOf.find(k) == g.ipOf.end()) {
            if (ep.kind == "ip") g.ipOf[k] = ep.ipId;
            else { g.ipOf[k] = std::nullopt; g.ifaceIdOf[k] = ep.interfaceId; }
        }
        return k;
    };
    auto isChainEp = [&](const DftEndpoint& ep) -> bool {
        if (ep.kind != "ip") return false;
        auto it = g.ipById.find(ep.ipId);
        if (it == g.ipById.end()) return false;
        for (const auto& p : catalogEntry(it->second->ipType).ports)
            if (p.name == ep.port) return roleEq(p, "chain");
        return false;
    };

    for (const auto& w : scope.dftWires) {
        if (isChainEp(w.from) || isChainEp(w.to)) continue;
        addEdge(reg(w.from), reg(w.to));  // real edge (already out->in)
    }
    for (const auto& ip : scope.dftIps) {  // catalog-derived internal passthrough edges
        const auto& ports = catalogEntry(ip.ipType).ports;
        std::vector<const DftPort*> ins, outs;
        for (const auto& p : ports)
            if (p.dir == "in" && !roleEq(p, "clock") && !roleEq(p, "secondary") && !roleEq(p, "chain"))
                ins.push_back(&p);
        for (const auto& p : ports)
            if (p.dir == "out" && !roleEq(p, "clock") && !roleEq(p, "chain")) outs.push_back(&p);
        for (const auto* i : ins)
            for (const auto* o : outs) {
                std::string a = ipPortKey(ip.id, i->name), b = ipPortKey(ip.id, o->name);
                g.ipOf[a] = ip.id;
                g.ipOf[b] = ip.id;
                addEdge(a, b);
            }
    }
    return g;
}

std::vector<DatapathN> linearizeDatapaths(const SpecgenScope& scope) {
    Graph g = buildGraph(scope);
    const auto& wires = scope.dftWires;

    auto ifaceBus = [&](const DftEndpoint& e) -> std::string {
        for (const auto& f : scope.interfaces) if (f.id == e.interfaceId) return f.busType;
        return "";
    };
    std::vector<DftEndpoint> entriesRaw, exitsRaw;
    for (const auto& w : wires)
        if (w.from.kind == "iface" && w.from.pin == "out" && ifaceBus(w.from) == "SSN") entriesRaw.push_back(w.from);
    for (const auto& w : wires)
        if (w.to.kind == "iface" && w.to.pin == "in" && ifaceBus(w.to) == "SSN") exitsRaw.push_back(w.to);
    auto entries = dedupByKey(entriesRaw);
    auto exits = dedupByKey(exitsRaw);
    if (entries.empty() || exits.empty())
        throw std::runtime_error("datapath needs a boundary interface entry(out) and exit(in)");

    struct Flow {
        DftEndpoint entry, exit;
        std::vector<std::string> mainKeys, mainIpIds;
    };
    std::vector<Flow> flows;
    std::unordered_set<std::string> usedExit;
    for (const auto& en : entries) {
        // exit candidate priority: (1) same-interface in-pin, (2) unused, (3) rest.
        std::vector<DftEndpoint> cand;
        for (const auto& x : exits)
            if (x.kind == "iface" && en.kind == "iface" && x.interfaceId == en.interfaceId)
                cand.push_back(x);
        for (const auto& x : exits)
            if (!usedExit.count(keyOf(x))) cand.push_back(x);
        for (const auto& x : exits) cand.push_back(x);
        cand = dedupByKey(cand);

        bool ok = false;
        DftEndpoint foundEx;
        std::vector<std::string> foundKeys;
        for (const auto& ex : cand) {
            auto keys = bfsBlockingBoundaries(g, keyOf(en), keyOf(ex));
            if (keys) { foundEx = ex; foundKeys = *keys; ok = true; break; }
        }
        if (!ok) continue;
        usedExit.insert(keyOf(foundEx));
        Flow f;
        f.entry = en;
        f.exit = foundEx;
        f.mainKeys = foundKeys;
        f.mainIpIds = reversedUnique(ipPath(g, foundKeys));
        flows.push_back(std::move(f));
    }
    if (flows.empty()) throw std::runtime_error("no main datapath path from entry to exit");

    std::unordered_map<std::string, int> ipToDp;
    for (size_t i = 0; i < flows.size(); ++i)
        for (const auto& id : flows[i].mainIpIds)
            if (!ipToDp.count(id)) ipToDp[id] = static_cast<int>(i) + 1;

    std::vector<DatapathN> result;
    for (size_t i = 0; i < flows.size(); ++i) {
        const Flow& f = flows[i];
        int dpId = static_cast<int>(i) + 1;
        int exitBusWidth = exitBusWidthOf(scope, f.exit);
        std::unordered_set<std::string> mainIpSet(f.mainIpIds.begin(), f.mainIpIds.end());
        std::vector<DpNode> order;
        for (const auto& ipId : f.mainIpIds) {
            DpNode node = buildNode(g, ipId);
            auto pit = g.ipById.find(ipId);
            if (pit != g.ipById.end() && pit->second->ipType == "Multiplexer") {
                auto sec = chainBackwardToIface(g, ipPortKey(ipId, "secondary_bus_data_in"));
                std::optional<std::string> srcIp;
                if (!sec.chain.empty()) srcIp = sec.chain.back();
                std::optional<int> srcDp;
                if (srcIp) {
                    auto dit = ipToDp.find(*srcIp);
                    if (dit != ipToDp.end()) srcDp = dit->second;
                }
                if (srcDp && *srcDp != dpId) node.secondaryInputDatapathId = *srcDp;  // cross-segment
                else {
                    auto smux = buildSmuxSecondary(g, ipId);
                    if (smux) node.smux_secondary = *smux;
                    if (sec.ifaceId) node.secondaryFeedInterfaceId = sec.ifaceId;
                }
            }
            auto extra = buildExtraOutputs(g, ipId, f.mainKeys, mainIpSet, exitBusWidth);
            if (extra) node.extra_output_paths = *extra;
            order.push_back(std::move(node));
        }
        DatapathN dn;
        dn.id = dpId;
        dn.order = std::move(order);
        dn.entry = f.entry;
        dn.exit = f.exit;
        dn.outputBusWidth = exitBusWidth;
        result.push_back(std::move(dn));
    }
    return result;
}

}  // namespace specgen
