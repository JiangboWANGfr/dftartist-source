#include "jtag1838.h"

#include <stdexcept>
#include <unordered_set>
#include <vector>

#include "datapath.h"
#include "gen.h"

namespace specgen {

namespace {
std::optional<std::string> ipOwnerOf(const Graph& g, const std::string& k) {
    auto it = g.ipOf.find(k);
    if (it == g.ipOf.end()) return std::nullopt;
    return it->second;
}
}  // namespace

std::string genJtag1838Spec(const SpecgenScope& scope) {
    const genconn::BusInterface* client = nullptr;
    for (const auto& i : scope.interfaces)
        if (i.busType == "JTAG1838" && i.role == "client") { client = &i; break; }
    if (!client) return "";

    Graph g = buildGraph(scope);
    DftEndpoint startEp; startEp.kind = "iface"; startEp.instanceId = scope.id;
    startEp.interfaceId = client->id; startEp.pin = "out";
    DftEndpoint endEp = startEp; endEp.pin = "in";
    std::string startKey = keyOf(startEp), endKey = keyOf(endEp);

    std::vector<std::string> tokens;
    std::unordered_set<std::string> seenIp, seenSec, guard{startKey};

    auto oneSucc = [&](const std::string& k) -> std::string {
        auto it = g.adj.find(k);
        const std::vector<std::string>& succ = it == g.adj.end() ? std::vector<std::string>{} : it->second;
        if (succ.empty()) throw std::runtime_error("STAP 链断裂：走不到 client 的 in 脚");
        if (succ.size() > 1) throw std::runtime_error("STAP 链出现分支（当前不支持）");
        return succ[0];
    };

    std::string cur = startKey;
    while (cur != endKey) {
        auto ipId = ipOwnerOf(g, cur);
        if (ipId && !seenIp.count(*ipId)) {
            seenIp.insert(*ipId);
            const DftIpInstance* ip = g.ipById.at(*ipId);
            if (ip->ipType == "STapPipeline")
                tokens.push_back("pipe(" + ip->instanceName + ")");
        }
        std::string next;
        auto fit = g.ifaceIdOf.find(cur);
        std::string pin = cur.substr(cur.rfind(':') + 1);
        if (fit != g.ifaceIdOf.end() && pin == "in") {
            const std::string& ifId = fit->second;
            const genconn::BusInterface* itf = nullptr;
            for (const auto& f : scope.interfaces) if (f.id == ifId) { itf = &f; break; }
            if (!itf || itf->role != "secondary") throw std::runtime_error("STAP 链到达非 secondary 的 in 脚");
            if (!seenSec.count(ifId)) {
                seenSec.insert(ifId);
                if (itf->placement.value_or("pin") == "other") tokens.push_back("host");
                else tokens.push_back("sec_host(" + itf->interfaceName.value_or(ifId) + ")");
            }
            DftEndpoint outEp; outEp.kind = "iface"; outEp.instanceId = scope.id;
            outEp.interfaceId = ifId; outEp.pin = "out";
            next = keyOf(outEp);
        } else {
            next = oneSucc(cur);
        }
        if (guard.count(next)) throw std::runtime_error("STAP 链有环");
        guard.insert(next);
        cur = next;
    }
    if (tokens.empty()) return "";

    std::string inner;
    for (const auto& t : tokens) inner += ind(1) + t + "\n";
    return "set spec [create_dft_specification -stap_host_list {\n" + inner + "}]\n";
}

}  // namespace specgen
