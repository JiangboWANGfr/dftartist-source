#include "dftspec.h"

#include <algorithm>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>

#include "bscan.h"
#include "datapath.h"
#include "gen.h"
#include "genconn-core/expand.h"
#include "jtag1838.h"
#include "schema.h"

namespace specgen {

namespace {
using hdl::json::Value;

// One `ChainGroup (id)` on a ScanHost, and the controllers hanging off it.
//
// A group is NOT one EDT. Several controllers can share a group — that is what naming them the
// same `ssh_chain_group` means — and the ScanHost then has to be sized for all of them, so the
// channel counts are summed over the members rather than taken from whichever EDT was wired last.
struct ChainGroupInfo {
    std::string id;
    std::vector<std::string> members;  // EDT instanceNames, wire order
    int inChains = 0;                  // Σ input_channel_count over the members (0 = unknown)
    int outChains = 0;                 // Σ output_channel_count
};
// ScanHost instanceName -> its chain groups, in the order the wires introduced them.
using ChainGroups = std::map<std::string, std::vector<ChainGroupInfo>>;

// JS `name.padEnd(28)`: right-pad with spaces to width 28 (no truncation).
std::string pad28(const std::string& name) {
    if (name.size() >= 28) return name;
    return name + std::string(28 - name.size(), ' ');
}

struct IfacePorts {
    std::optional<std::string> clockIn, clockOut, dataIn, dataOut;
};

// null (nullopt) iff interface not found; else the four port-name slots (any may be empty).
std::optional<IfacePorts> ifacePorts(const SpecgenScope& scope, const std::string& interfaceId) {
    const genconn::BusInterface* itf = nullptr;
    for (const auto& x : scope.interfaces)
        if (x.id == interfaceId) { itf = &x; break; }
    if (!itf) return std::nullopt;
    auto sigs = genconn::expandInterface(*itf);
    const genconn::InterfaceSignal* clock = nullptr;
    const genconn::InterfaceSignal* dataIn = nullptr;
    const genconn::InterfaceSignal* dataOut = nullptr;
    for (const auto& s : sigs)
        if (s.width == 1) { clock = &s; break; }  // SSN's only narrow signal = clock
    for (const auto& s : sigs)
        if (s.width > 1 && s.direction == "input") { dataIn = &s; break; }
    for (const auto& s : sigs)
        if (s.width > 1 && s.direction == "output") { dataOut = &s; break; }
    IfacePorts r;
    if (clock && clock->direction == "input") r.clockIn = clock->name;
    if (clock && clock->direction == "output") r.clockOut = clock->name;
    if (dataIn) r.dataIn = dataIn->name;
    if (dataOut) r.dataOut = dataOut->name;
    return r;
}

// Object-Value helpers for the ScanHost/Multiplexer/EDT param injections.
Value strVal(const std::string& s) {
    Value v;
    v.type = Value::Type::Str;
    v.s = s;
    return v;
}
void ensureObject(Value& v) {
    if (v.type != Value::Type::Object) {
        v = Value{};
        v.type = Value::Type::Object;
    }
}
// {...obj, key: val}: override in place if key exists (order irrelevant to genBlock), else append.
void setKey(Value& obj, const std::string& key, Value val) {
    for (auto& kv : obj.obj)
        if (kv.first == key) { kv.second = std::move(val); return; }
    obj.obj.emplace_back(key, std::move(val));
}
// A string field the engineer typed in the IP's config, "" when absent/blank.
std::string cfgStr(const Value& params, const std::string& key) {
    const Value* v = params.type == Value::Type::Object ? params.find(key) : nullptr;
    return v && v->type == Value::Type::Str ? v->s : std::string{};
}
std::string cfgStr(const Value& params, const std::string& block, const std::string& key) {
    const Value* b = params.type == Value::Type::Object ? params.find(block) : nullptr;
    return b && b->type == Value::Type::Object ? cfgStr(*b, key) : std::string{};
}
int cfgInt(const Value& params, const std::string& key) {
    const std::string s = cfgStr(params, key);
    try { return s.empty() ? 0 : std::stoi(s); } catch (...) { return 0; }
}

/// Which chain group a controller belongs to: what its config says, else its own name.
///
/// Naming it after the EDT is only a DEFAULT — one group per controller is the common case, not
/// the rule. Type the same `ssh_chain_group` into two controllers and they join one group.
std::string chainGroupOf(const DftIpInstance& edt) {
    const std::string g = cfgStr(edt.config, "Connections", "ssh_chain_group");
    return g.empty() ? edt.instanceName : g;
}

std::string emitComponent(const SpecgenScope& scope, const DpNode& node, int depth, const ChainGroups& ctx);

// DataPath-level Connections: entry iface -> bus_clock_in/bus_data_in; exit iface ->
// bus_clock_out/bus_data_out. Missing key omits the line; no lines -> no block.
std::string emitDatapathConnections(const SpecgenScope& scope, const DatapathN& dp, int depth) {
    std::optional<IfacePorts> entryIf, exitIf;
    if (dp.entry.kind == "iface") entryIf = ifacePorts(scope, dp.entry.interfaceId);
    if (dp.exit.kind == "iface") exitIf = ifacePorts(scope, dp.exit.interfaceId);
    std::string lines;
    if (entryIf && entryIf->clockIn)
        lines += ind(depth + 2) + pad28("bus_clock_in") + ": " + *entryIf->clockIn + ";\n";
    if (entryIf && entryIf->dataIn)
        lines += ind(depth + 2) + pad28("bus_data_in") + ": " + *entryIf->dataIn + ";\n";
    if (exitIf && exitIf->clockOut)
        lines += ind(depth + 2) + pad28("bus_clock_out") + ": " + *exitIf->clockOut + ";\n";
    if (exitIf && exitIf->dataOut)
        lines += ind(depth + 2) + pad28("bus_data_out") + ": " + *exitIf->dataOut + ";\n";
    if (lines.empty()) return "";
    return ind(depth + 1) + "Connections {\n" + lines + ind(depth + 1) + "}\n";
}

// EOP-level Connections: only when the branch ends at a boundary interface.
std::string emitEopConnections(const SpecgenScope& scope, const ExtraOutput& eop, int depth) {
    std::optional<IfacePorts> ports;
    if (eop.exitInterfaceId) ports = ifacePorts(scope, *eop.exitInterfaceId);
    if (!ports) return "";
    std::string lines;
    if (ports->clockOut)
        lines += ind(depth + 2) + pad28("bus_clock_out") + ": " + *ports->clockOut + ";\n";
    if (ports->dataOut)
        lines += ind(depth + 2) + pad28("bus_data_out") + ": " + *ports->dataOut + ";\n";
    if (lines.empty()) return "";
    return ind(depth + 1) + "Connections {\n" + lines + ind(depth + 1) + "}\n";
}

std::string emitExtraOutputPath(const SpecgenScope& scope, const ExtraOutput& eop, int depth,
                                const ChainGroups& ctx) {
    std::string props =
        ind(depth + 1) + pad28("output_bus_width") + ": " + std::to_string(eop.outputBusWidth) + ";\n";
    std::string conn = emitEopConnections(scope, eop, depth);
    std::string comps;
    for (const auto& node : eop.chain) comps += emitComponent(scope, node, depth + 1, ctx);
    return ind(depth) + "ExtraOutputPath {\n" + props + conn + comps + ind(depth) + "}\n";
}

std::string emitComponent(const SpecgenScope& scope, const DpNode& node, int depth, const ChainGroups& ctx) {
    const BlockSchema& comp = componentSchema(node.type);
    // DesignInstance uses its module name as component name; else fall back to schema name.
    std::string compName = (node.type == "DesignInstance" && node.moduleName && !node.moduleName->empty()) ? *node.moduleName
                                                                              : comp.name.value_or("");
    Value params = node.params;

    if (node.type == "ScanHost") {
        auto git = ctx.find(node.instanceName);
        if (git != ctx.end() && !git->second.empty()) {
            Value arr;
            arr.type = Value::Type::Array;
            const Value* existing = params.find("ChainGroup");
            if (existing && existing->type == Value::Type::Array)
                for (const auto& e : existing->arr) arr.arr.push_back(e);
            for (const auto& g : git->second) {
                // Merge into a group the engineer already wrote by hand rather than emitting the
                // id twice — a duplicated ChainGroup is a spec error, not two groups.
                Value* item = nullptr;
                for (auto& e : arr.arr)
                    if (e.type == Value::Type::Object && cfgStr(e, "id") == g.id) { item = &e; break; }
                Value fresh;
                if (!item) {
                    fresh.type = Value::Type::Object;
                    fresh.obj.emplace_back("id", strVal(g.id));
                    item = &fresh;
                }
                // Summed over every controller on the group: the ScanHost carries all of them.
                // A hand-typed count wins — this is a default, not a correction.
                if (g.inChains > 0 && cfgStr(*item, "input_chain_count").empty())
                    setKey(*item, "input_chain_count", strVal(std::to_string(g.inChains)));
                if (g.outChains > 0 && cfgStr(*item, "output_chain_count").empty())
                    setKey(*item, "output_chain_count", strVal(std::to_string(g.outChains)));
                if (item == &fresh) arr.arr.push_back(std::move(fresh));
            }
            ensureObject(params);
            setKey(params, "ChainGroup", std::move(arr));
        }
    }
    if (node.type == "Multiplexer") {
        // topo key (cross-seg input_datapath_id / local secondary_bus_data_in) merged into Connections.
        Value topo;
        topo.type = Value::Type::Object;
        if (node.secondaryInputDatapathId)
            topo.obj.emplace_back("input_datapath_id", strVal(std::to_string(*node.secondaryInputDatapathId)));
        else if (node.secondaryFeedInterfaceId) {
            auto ports = ifacePorts(scope, *node.secondaryFeedInterfaceId);
            if (ports && ports->dataIn)
                topo.obj.emplace_back("secondary_bus_data_in", strVal(*ports->dataIn));
        }
        if (!topo.obj.empty()) {
            Value merged;
            merged.type = Value::Type::Object;
            const Value* existing = params.find("Connections");
            if (existing && existing->type == Value::Type::Object)
                for (const auto& kv : existing->obj) merged.obj.emplace_back(kv.first, kv.second);
            for (auto& kv : topo.obj) setKey(merged, kv.first, kv.second);  // topo overrides same names
            ensureObject(params);
            setKey(params, "Connections", std::move(merged));
        }
    }

    std::string inner = genBlock(comp, params, depth + 1);
    for (const auto& sec : node.smux_secondary) inner += emitComponent(scope, sec, depth + 1, ctx);
    for (const auto& eop : node.extra_output_paths) inner += emitExtraOutputPath(scope, eop, depth + 1, ctx);
    return ind(depth) + compName + " (" + node.id + ") {\n" + inner + ind(depth) + "}\n";
}

std::string emitDatapath(const SpecgenScope& scope, const DatapathN& dp, const std::string& dpId, int depth,
                         const ChainGroups& ctx) {
    std::string props =
        ind(depth + 1) + pad28("output_bus_width") + ": " + std::to_string(dp.outputBusWidth) + ";\n";
    std::string conn = emitDatapathConnections(scope, dp, depth);
    std::string comps;
    for (const auto& node : dp.order) comps += emitComponent(scope, node, depth + 1, ctx);
    return ind(depth) + "DataPath (" + dpId + ") {\n" + props + conn + comps + ind(depth) + "}\n";
}

}  // namespace

std::string genDftSpec(const SpecgenScope& scope) {
    std::vector<DatapathN> dps;
    std::exception_ptr ssnErr;
    try { dps = linearizeDatapaths(scope); } catch (...) { ssnErr = std::current_exception(); }
    std::string bscanBlock = genBScanSpec(scope);
    std::string jtag1838Block = genJtag1838Spec(scope);
    if (dps.empty() && bscanBlock.empty() && jtag1838Block.empty()) {
        if (ssnErr) std::rethrow_exception(ssnErr);
        throw std::runtime_error("datapath needs a boundary in/out");
    }

    std::vector<const DftIpInstance*> edts;
    for (const auto& i : scope.dftIps)
        if (i.ipType == "Edt") edts.push_back(&i);

    // chain wires (ScanHost.chain_group_out -> EDT.ssh_chain_group_in): the WIRE says which host
    // a controller hangs off; the controller's own `ssh_chain_group` says which group it joins.
    // Keeping those two apart is what lets several controllers share one group.
    ChainGroups chainGroupsBySh;
    if (!edts.empty()) {
        std::unordered_set<std::string> edtIds;
        for (const auto* e : edts) edtIds.insert(e->id);
        std::unordered_map<std::string, const DftIpInstance*> ipById;
        for (const auto& i : scope.dftIps) ipById[i.id] = &i;
        for (const auto& w : scope.dftWires) {
            const auto& from = w.from;
            const auto& to = w.to;
            if (to.kind != "ip" || from.kind != "ip" || !edtIds.count(to.ipId)) continue;
            auto fit = ipById.find(from.ipId);
            auto tit = ipById.find(to.ipId);
            if (fit == ipById.end() || fit->second->ipType != "ScanHost" || tit == ipById.end()) continue;
            const DftIpInstance& edt = *tit->second;
            auto& groups = chainGroupsBySh[fit->second->instanceName];
            const std::string gid = chainGroupOf(edt);
            auto git = std::find_if(groups.begin(), groups.end(),
                                    [&](const ChainGroupInfo& g) { return g.id == gid; });
            if (git == groups.end()) { groups.push_back(ChainGroupInfo{gid, {}, 0, 0}); git = groups.end() - 1; }
            // Two wires to the same controller are one membership, not two.
            if (std::find(git->members.begin(), git->members.end(), edt.instanceName) != git->members.end())
                continue;
            git->members.push_back(edt.instanceName);
            git->inChains += cfgInt(edt.config, "input_channel_count");
            git->outChains += cfgInt(edt.config, "output_channel_count");
        }
    }

    std::string out;
    bool hasBlockForm = !dps.empty() || !bscanBlock.empty();
    if (hasBlockForm) out += "read_config_data -in_wrapper $dftspec -rep -from_string {\n";
    if (!dps.empty()) {
        out += ind(1) + "SSN {\n";
        out += ind(2) + pad28("ijtag_host_interface") + ": Sib(ssn);\n";
        for (const auto& dp : dps)
            out += emitDatapath(scope, dp, std::to_string(dp.id), 2, chainGroupsBySh);
        out += ind(1) + "}\n";

        if (!edts.empty()) {
            std::unordered_set<std::string> chained;
            for (const auto& w : scope.dftWires) {
                const auto& to = w.to;
                if (to.kind != "ip") continue;
                for (const auto* e : edts)
                    if (e->id == to.ipId) { chained.insert(to.ipId); break; }
            }
            out += ind(1) + "EDT {\n";
            out += ind(2) + pad28("ijtag_host_interface") + ": Sib(edt);\n";
            const BlockSchema& comp = componentSchema("Edt");
            for (const auto* e : edts) {
                Value params;
                if (e->config.type == Value::Type::Object) params = e->config;  // {...(e.config ?? {})}
                else params.type = Value::Type::Object;
                // The group name is the engineer's if they typed one — overwriting it with the
                // instance name is what made "put both controllers on one group" impossible.
                if (chained.count(e->id) && cfgStr(params, "Connections", "ssh_chain_group").empty()) {
                    Value conn;
                    conn.type = Value::Type::Object;
                    const Value* existing = params.find("Connections");
                    if (existing && existing->type == Value::Type::Object) conn = *existing;
                    setKey(conn, "ssh_chain_group", strVal(chainGroupOf(*e)));
                    ensureObject(params);
                    setKey(params, "Connections", std::move(conn));
                }
                out += ind(2) + "Controller (" + e->instanceName + ") {\n" + genBlock(comp, params, 3) +
                       ind(2) + "}\n";
            }
            out += ind(1) + "}\n";
        }
    }

    out += bscanBlock;
    if (hasBlockForm) out += "}\n";
    out += jtag1838Block;
    return out;
}

}  // namespace specgen
