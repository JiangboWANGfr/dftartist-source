#pragma once
// GenConnection data model (C++ port of newProject/src/core/model.ts).
// Only the fields needed by the generate pipeline; view-only fields (position,
// rotation, size, vertices, color, edge) are intentionally omitted.
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace genconn {

struct PortedFrom {
    std::string instanceId;
    std::string interfaceId;
};

struct BusInterface {
    std::string id;
    std::string busType;  // "SSN" | "IJTAG" | "BISR" | "BSCAN" | "JTAG1838"
    std::string role;     // "client" | "secondary"
    std::optional<std::string> interfaceName;
    std::optional<std::string> powerDomain;
    std::optional<bool> pdMatchOnly;
    std::optional<int> busWidth;
    std::optional<std::string> bscanVariant;  // "DC" | "AC"
    std::optional<bool> omitMemCtrl;
    std::optional<std::string> ifNamePlacement;  // "prefix"(default) | "postfix"
    std::optional<PortedFrom> portedFrom;
    std::optional<std::string> placement;  // "pin" | "other"
    std::optional<bool> isDataSource;
};

struct HardenInstance {
    std::string id;
    std::string instanceName;
    std::string hardenId;
    std::map<std::string, std::string> ifacePd;  // per-interface pd override (BISR matching)
};

struct BusConnection {
    std::string id;
    std::string secondaryInstanceId;
    std::string secondaryInterfaceId;
    std::string clientInstanceId;
    std::string clientInterfaceId;
};

struct HardenDef {
    std::string id;
    std::string designName;
    std::string designLevel;  // "chip" | "physical_block" | "sub_block"
    std::string designType;   // "hierarchical" | "tiling"
    std::optional<std::string> fileName;
    std::vector<BusInterface> interfaces;
    std::vector<HardenInstance> childInstances;
    std::vector<BusConnection> connections;
};

struct HardenLibrary {
    std::vector<HardenDef> defs;
};

struct GenConnDocument {
    int schemaVersion = 1;
    HardenLibrary library;
    std::string openDefId;
    std::string rootDefId;
};

// Signal of an expanded interface.
struct InterfaceSignal {
    std::string name;
    std::string direction;  // "input" | "output"
    int width = 0;
};

}  // namespace genconn
