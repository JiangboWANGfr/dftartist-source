#include "generate.h"

#include <map>
#include <set>
#include <stdexcept>

#include "expand.h"
#include "order.h"
#include "validate.h"

// C++ port of newProject/src/core/generate.ts (+ tcl.ts). Targets byte-identical output.

namespace genconn {

namespace {

template <typename T>
std::map<std::string, const T*> indexBy(const std::vector<T>& arr) {
    std::map<std::string, const T*> m;
    for (const auto& x : arr) m[x.id] = &x;
    return m;
}

const BusInterface& ifaceOf(const HardenDef& def, const std::string& id) {
    for (const auto& x : def.interfaces)
        if (x.id == id) return x;
    throw std::runtime_error("interface '" + id + "' not found in def '" + def.designName + "'");
}

std::string unconnected(const std::string& p) { return "/* UNCONNECTED:" + p + " */"; }

// Port list: label line, one item per line (+2 indent), commas, last item semicolon.
// Empty list degenerates to `label : ;`.
std::vector<std::string> fmtList(const std::string& label, const std::vector<std::string>& items,
                                 const std::string& indent) {
    std::vector<std::string> out;
    if (items.empty()) {
        out.push_back(indent + label + " : ;");
        return out;
    }
    out.push_back(indent + label + " :");
    for (size_t i = 0; i < items.size(); ++i)
        out.push_back(indent + "  " + items[i] + (i + 1 == items.size() ? ";" : ","));
    return out;
}

}  // namespace

std::optional<GenResult> generate(const HardenDef& root, const HardenLibrary& lib, bool isRoot) {
    auto defs = indexBy(lib.defs);
    auto insts = indexBy(root.childInstances);

    auto defOf = [&](const HardenInstance& i) -> const HardenDef& {
        auto it = defs.find(i.hardenId);
        if (it == defs.end())
            throw std::runtime_error("def '" + i.hardenId + "' (instance '" + i.instanceName +
                                     "') not found in library");
        return *it->second;
    };
    auto isTiling = [&](const HardenInstance& i) { return defOf(i).designType == "tiling"; };

    // §8 structural validation: root + every distinct child def
    validateDef(root);
    {
        std::set<std::string> seenDef;
        for (const auto& i : root.childInstances) {
            if (seenDef.insert(i.hardenId).second) {
                auto it = defs.find(i.hardenId);
                if (it != defs.end()) validateDef(*it->second);
            }
        }
    }

    // §6.0 gate: need at least one tiling child
    std::vector<const HardenInstance*> tilingInsts;
    for (const auto& i : root.childInstances)
        if (isTiling(i)) tilingInsts.push_back(&i);
    if (tilingInsts.empty()) return std::nullopt;

    // driver[instanceId][inputPortName] = "srcInst/srcPort"
    std::map<std::string, std::map<std::string, std::string>> driver;
    auto put = [&](const std::string& instId, const std::string& port, const std::string& src) {
        auto& m = driver[instId];
        auto ex = m.find(port);
        if (ex != m.end() && ex->second != src)
            throw std::runtime_error("port '" + port + "' on instance '" + instId +
                                     "' is driven by multiple secondaries ('" + ex->second +
                                     "' vs '" + src + "')");
        m[port] = src;
    };

    for (const auto& conn : root.connections) {
        auto ai = insts.find(conn.secondaryInstanceId);
        auto bi = insts.find(conn.clientInstanceId);
        if (ai == insts.end() || bi == insts.end()) continue;
        const HardenInstance& A = *ai->second;
        const HardenInstance& B = *bi->second;
        if (!isTiling(A) || !isTiling(B)) continue;

        const BusInterface& S = ifaceOf(defOf(A), conn.secondaryInterfaceId);
        const BusInterface& C = ifaceOf(defOf(B), conn.clientInterfaceId);

        if (S.busType != C.busType)
            throw std::runtime_error("busType mismatch on connection '" + conn.id + "'");
        if (S.busType == "BISR" && effectivePd(&A, S) != effectivePd(&B, C))
            throw std::runtime_error("powerDomain mismatch on connection '" + conn.id + "'");
        if (S.busType == "BISR" && S.omitMemCtrl.value_or(false) != C.omitMemCtrl.value_or(false))
            throw std::runtime_error("omitMemCtrl mismatch on connection '" + conn.id + "'");
        if (S.busType == "BSCAN" && S.bscanVariant != C.bscanVariant)
            throw std::runtime_error("bscanVariant mismatch on connection '" + conn.id + "'");
        if (S.busType == "SSN" && S.busWidth.value_or(4) != C.busWidth.value_or(4))
            throw std::runtime_error("busWidth mismatch on connection '" + conn.id + "'");

        for (const Base& b : basesOf(S)) {
            if (b.group == "down")
                put(B.id, clientSignal(C, b).name, A.instanceName + "/" + secondarySignal(S, b).name);
            else
                put(A.id, secondarySignal(S, b).name, B.instanceName + "/" + clientSignal(C, b).name);
        }
    }

    // portedFrom exclusion: boundary iface with portedFrom -> drop that child interface
    std::map<std::string, std::set<std::string>> exclude;  // hardenId -> {interfaceId}
    for (const auto& bI : root.interfaces) {
        if (!bI.portedFrom) continue;
        auto it = insts.find(bI.portedFrom->instanceId);
        if (it == insts.end()) continue;
        exclude[it->second->hardenId].insert(bI.portedFrom->interfaceId);
    }

    // ordered tiling defs (dedup by first appearance)
    std::set<std::string> seen;
    std::vector<const HardenDef*> orderedDefs;
    for (const auto* i : tilingInsts) {
        if (seen.insert(i->hardenId).second) orderedDefs.push_back(&defOf(*i));
    }

    std::vector<std::string> lines;
    lines.push_back("TopModuleConnections(" + root.designName + ") {");
    for (const auto* def : orderedDefs) {
        std::set<std::string> ex;
        auto exIt = exclude.find(def->id);
        if (exIt != exclude.end()) ex = exIt->second;
        DefPorts ports = expandDef(*def, ex);

        std::string fallback = "../../design/" + def->designName + "/" + def->designName + ".v";
        lines.push_back("  ChildBlock(" + def->designName + ") {");
        lines.push_back("    file_name : " + def->fileName.value_or(fallback) + ";");

        std::vector<std::string> inNames, outNames;
        for (const auto& p : ports.inputPorts) inNames.push_back(p.name);
        for (const auto& p : ports.outputPorts) outNames.push_back(p.name);
        for (auto& l : fmtList("input_ports", inNames, "    ")) lines.push_back(l);
        for (auto& l : fmtList("output_ports", outNames, "    ")) lines.push_back(l);

        for (const auto* inst : tilingInsts) {
            if (inst->hardenId != def->id) continue;
            std::vector<std::string> sources;
            auto dmIt = driver.find(inst->id);
            for (const auto& p : ports.inputPorts) {
                std::string src = unconnected(p.name);
                if (dmIt != driver.end()) {
                    auto s = dmIt->second.find(p.name);
                    if (s != dmIt->second.end()) src = s->second;
                }
                sources.push_back(src);
            }
            lines.push_back("    Instance(" + inst->instanceName + ") {");
            for (auto& l : fmtList("input_port_sources", sources, "      ")) lines.push_back(l);
            lines.push_back("    }");
        }
        lines.push_back("  }");
    }
    lines.push_back("}");

    std::string fileBase = isRoot ? "top" : root.designName;
    std::string text;
    for (const auto& l : lines) text += l + "\n";

    GenResult r;
    r.file = "../../design/" + root.designName + "/" + fileBase + ".top_level_ports_and_connectionss";
    r.text = text;
    return r;
}

std::optional<GenResult> generateTcl(const HardenDef& root, const HardenLibrary&, bool isRoot) {
    std::vector<const BusInterface*> ported;
    for (const auto& i : root.interfaces)
        if (i.portedFrom) ported.push_back(&i);
    if (ported.empty()) return std::nullopt;

    std::vector<std::string> ports, conns;
    for (const auto* bI : ported) {
        const HardenInstance* inst = nullptr;
        for (const auto& i : root.childInstances)
            if (i.id == bI->portedFrom->instanceId) { inst = &i; break; }
        if (!inst) continue;
        for (const auto& sig : expandInterface(*bI)) {
            ports.push_back("create_port " + sig.name);
            conns.push_back("create_connection " + sig.name + " " + inst->instanceName + "/" + sig.name);
        }
    }

    std::string fileBase = isRoot ? "top" : root.designName;
    std::string text;
    for (const auto& l : ports) text += l + "\n";
    for (const auto& l : conns) text += l + "\n";

    GenResult r;
    r.file = "../../design/" + root.designName + "/" + fileBase + ".tcl";
    r.text = text;
    return r;
}

std::vector<GenResult> generateAll(const HardenLibrary& lib, const std::string& rootId) {
    std::vector<GenResult> out;
    for (const auto& d : lib.defs) {
        auto r = generate(d, lib, d.id == rootId);
        if (r) out.push_back(*r);
        auto tcl = generateTcl(d, lib, d.id == rootId);
        if (tcl) out.push_back(*tcl);
    }
    return out;
}

}  // namespace genconn
