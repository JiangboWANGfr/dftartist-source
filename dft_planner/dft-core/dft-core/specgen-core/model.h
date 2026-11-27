#pragma once
// SpecGen data model (C++ port of newProject/src/core/dft-model.ts + the DFT
// fields of HardenDef). Only the fields the DftSpecification generator reads.
#include <optional>
#include <string>
#include <vector>

#include "json/JsonValue.h"
#include "genconn-core/model.h"

namespace specgen {

// datapath wire endpoint: DFT IP port (kind="ip") or boundary interface pin (kind="iface").
struct DftEndpoint {
    std::string kind;  // "ip" | "iface"
    std::string ipId, port;                  // kind == "ip"
    std::string instanceId, interfaceId, pin;  // kind == "iface" (pin: "in" | "out")
};

struct DftWire {
    std::string id;
    DftEndpoint from, to;
};

struct DftIpInstance {
    std::string id, ipType, instanceName;
    hdl::json::Value config;  // raw props tree (schema-shaped); empty object if none
    std::optional<std::string> moduleName;  // DesignInstance: emitted component name
};

// One SpecGen scope = a HardenDef with its boundary interfaces + placed DFT IPs/wires.
struct SpecgenScope {
    std::string id;
    std::string designName;
    std::vector<genconn::BusInterface> interfaces;
    std::vector<DftIpInstance> dftIps;
    std::vector<DftWire> dftWires;
};

}  // namespace specgen
