#pragma once
#include <set>
#include <string>
#include <vector>

#include "model.h"

namespace genconn {

std::vector<BusInterface> orderInterfaces(const HardenDef& def);

struct DefPorts {
    std::vector<InterfaceSignal> inputPorts;
    std::vector<InterfaceSignal> outputPorts;
};

DefPorts expandDef(const HardenDef& def, const std::set<std::string>& excludeIfIds = {});

}  // namespace genconn
