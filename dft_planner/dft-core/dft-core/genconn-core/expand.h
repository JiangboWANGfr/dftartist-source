#pragma once
#include <string>
#include <vector>

#include "model.h"

namespace genconn {

struct Base {
    std::string name;
    std::string group;  // "down" | "up"
    bool wide = false;  // true = width is busWidth (SSN data bus); else 1 bit
    std::string qual;   // leaf 前限定段（JTAG1838 reset/ce/se/ue = "ijtag_"）；位于 stap_/ifName 与 to_/from_/leaf 之间
};

std::vector<Base> basesOf(const BusInterface& i);
InterfaceSignal clientSignal(const BusInterface& i, const Base& b);
InterfaceSignal secondarySignal(const BusInterface& i, const Base& b);
std::vector<InterfaceSignal> expandInterface(const BusInterface& i);

}  // namespace genconn
