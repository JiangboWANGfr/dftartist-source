#include "order.h"

#include "expand.h"

// C++ port of newProject/src/core/order.ts — deterministic port ordering.

namespace genconn {

namespace {
const char* BUS_ORDER[] = {"BSCAN", "IJTAG", "JTAG1838", "BISR", "SSN"};
}

std::vector<BusInterface> orderInterfaces(const HardenDef& def) {
    std::vector<BusInterface> out;
    for (const char* bt : BUS_ORDER) {
        for (const auto& i : def.interfaces)
            if (i.busType == bt && i.role == "client") out.push_back(i);
        for (const auto& i : def.interfaces)
            if (i.busType == bt && i.role == "secondary") out.push_back(i);
    }
    return out;
}

DefPorts expandDef(const HardenDef& def, const std::set<std::string>& excludeIfIds) {
    std::vector<BusInterface> ordered = orderInterfaces(def);
    DefPorts ports;
    for (const auto& i : ordered) {
        if (!excludeIfIds.empty() && excludeIfIds.count(i.id)) continue;
        for (const auto& s : expandInterface(i)) {
            if (s.direction == "input")
                ports.inputPorts.push_back(s);
            else
                ports.outputPorts.push_back(s);
        }
    }
    return ports;
}

}  // namespace genconn
