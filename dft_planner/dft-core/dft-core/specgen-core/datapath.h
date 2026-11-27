#pragma once
// Datapath linearization (C++ port of newProject/src/dft/datapath.ts).
// dftWires directed graph -> Tessent declaration-order nested DataPath segments.
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "json/JsonValue.h"
#include "model.h"

namespace specgen {

struct DpNode;  // forward: ExtraOutput holds DpNode, DpNode holds ExtraOutput.

struct ExtraOutput {
    int outputBusWidth = 0;
    std::vector<DpNode> chain;
    std::optional<std::string> exitInterfaceId;
};

struct DpNode {
    std::string type, instanceName, id;
    hdl::json::Value params;  // raw config Value (empty object if none)
    std::optional<std::string> moduleName;
    std::vector<DpNode> smux_secondary;
    std::vector<ExtraOutput> extra_output_paths;
    std::optional<int> secondaryInputDatapathId;
    std::optional<std::string> secondaryFeedInterfaceId;
};

struct DatapathN {
    int id = 0;
    std::vector<DpNode> order;
    DftEndpoint entry, exit;
    int outputBusWidth = 0;
};

// 供 bscan.cpp 复用的图（endpoint key -> 邻接/所属 ip/接口 id）。key 见 keyOf。
struct Graph {
    std::unordered_map<std::string, std::vector<std::string>> adj, radj;
    std::unordered_map<std::string, std::optional<std::string>> ipOf;  // iface -> nullopt
    std::unordered_map<std::string, const DftIpInstance*> ipById;
    std::unordered_map<std::string, std::string> ifaceIdOf;
};
std::string keyOf(const DftEndpoint& ep);
Graph buildGraph(const SpecgenScope& scope);

// Multi-segment: one DataPath per wired boundary out-pin. Throws if no path.
std::vector<DatapathN> linearizeDatapaths(const SpecgenScope& scope);

}  // namespace specgen
