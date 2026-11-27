#include "bscan.h"

#include <stdexcept>
#include <unordered_set>

#include "datapath.h"
#include "gen.h"
#include "schema.h"

namespace specgen {

namespace {
using hdl::json::Value;

// JS `g.ipOf.get(k)`: undefined (key absent) vs null (iface) vs ip id (present, non-null).
std::optional<std::string> ipOwnerOf(const Graph& g, const std::string& k) {
    auto it = g.ipOf.find(k);
    if (it == g.ipOf.end()) return std::nullopt;
    return it->second;
}

}  // namespace

bool linearizeBScanChain(const SpecgenScope& scope, BScanChain& out) {
    const genconn::BusInterface* client = nullptr;
    for (const auto& i : scope.interfaces)
        if (i.busType == "BSCAN" && i.role == "client") { client = &i; break; }
    if (!client) return false;

    Graph g = buildGraph(scope);
    DftEndpoint startEp;
    startEp.kind = "iface";
    startEp.instanceId = scope.id;
    startEp.interfaceId = client->id;
    startEp.pin = "out";
    DftEndpoint endEp = startEp;
    endEp.pin = "in";
    std::string startKey = keyOf(startEp);
    std::string endKey = keyOf(endEp);

    std::vector<BScanNode> order;
    std::unordered_set<std::string> seenIp, seenSec;
    std::unordered_set<std::string> guard{startKey};

    auto oneSucc = [&](const std::string& k) -> std::string {
        auto it = g.adj.find(k);
        const std::vector<std::string>& succ = it == g.adj.end() ? std::vector<std::string>{} : it->second;
        if (succ.empty()) throw std::runtime_error("BScan 链断裂：走不到 client 的 in 脚");
        if (succ.size() > 1) throw std::runtime_error("BScan 链出现分支（当前不支持）");
        return succ[0];
    };

    std::string cur = startKey;
    while (cur != endKey) {
        auto ipId = ipOwnerOf(g, cur);
        if (ipId && !seenIp.count(*ipId)) {
            seenIp.insert(*ipId);
            const DftIpInstance* ip = g.ipById.at(*ipId);
            BScanNode n;
            n.type = ip->ipType == "DesignInstance" ? "EBScanInstance" : "EBScanPipeline";
            n.name = ip->instanceName;
            if (ip->config.type == Value::Type::Null) n.params.type = Value::Type::Object;
            else n.params = ip->config;
            order.push_back(std::move(n));
        }
        std::string next;
        auto fit = g.ifaceIdOf.find(cur);
        std::string pin = cur.substr(cur.rfind(':') + 1);
        if (fit != g.ifaceIdOf.end() && pin == "in") {
            const std::string& ifId = fit->second;
            const genconn::BusInterface* itf = nullptr;
            for (const auto& f : scope.interfaces)
                if (f.id == ifId) { itf = &f; break; }
            if (!itf || itf->role != "secondary") throw std::runtime_error("BScan 链到达非 secondary 的 in 脚");
            if (!seenSec.count(ifId)) {
                seenSec.insert(ifId);
                BScanNode n;
                n.type = "SecondaryEBScanInterface";
                n.name = itf->interfaceName.value_or(ifId);
                n.params.type = Value::Type::Object;
                order.push_back(std::move(n));
            }
            DftEndpoint outEp;
            outEp.kind = "iface";
            outEp.instanceId = scope.id;
            outEp.interfaceId = ifId;
            outEp.pin = "out";
            next = keyOf(outEp);
        } else {
            next = oneSucc(cur);
        }
        if (guard.count(next)) throw std::runtime_error("BScan 链有环");
        guard.insert(next);
        cur = next;
    }

    out.clientName = client->interfaceName.value_or("client");
    out.order = std::move(order);
    return true;
}

std::string genBScanSpec(const SpecgenScope& scope) {
    BScanChain chain;
    if (!linearizeBScanChain(scope, chain) || chain.order.empty()) return "";

    std::string inner;
    for (const auto& n : chain.order) {
        const BlockSchema& comp = bscanComponentSchema(n.type);
        std::string body = genBlock(comp, n.params, 4);
        inner += ind(3) + n.type + " (" + n.name + ") {\n" + body + ind(3) + "}\n";
    }
    return ind(1) + "EmbeddedBoundaryScan {\n"
         + ind(2) + "HostBScanInterface (" + chain.clientName + ") {\n"
         + inner
         + ind(2) + "}\n"
         + ind(1) + "}\n";
}

}  // namespace specgen
