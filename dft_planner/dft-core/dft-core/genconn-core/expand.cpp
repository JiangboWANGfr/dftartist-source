#include "expand.h"

// C++ port of newProject/src/core/expand.ts — data-driven bus signal expansion.

namespace genconn {

namespace {

constexpr int SSN_DEFAULT_WIDTH = 4;

Base down(const std::string& name, bool wide = false) { return Base{name, "down", wide, ""}; }
Base up(const std::string& name, bool wide = false) { return Base{name, "up", wide, ""}; }
Base downQ(const std::string& name, const std::string& qual) { return Base{name, "down", false, qual}; }

std::string ifName(const BusInterface& i) { return i.interfaceName.value_or("undefined"); }

// SSN interfaceName placement: "prefix"(default, interfaceName in front) | "postfix"(at end).
bool ssnPostfix(const BusInterface& i) { return i.ifNamePlacement.value_or("prefix") == "postfix"; }

// Interface-name suffix appended after the base name (before the width bracket);
// only for SSN in postfix mode.
std::string ifSuffix(const BusInterface& i) {
    return (i.busType == "SSN" && ssnPostfix(i)) ? ("_" + ifName(i)) : "";
}

// BISR pd prefix: powerDomain set and not pdMatchOnly -> "<pd>_"; else "".
std::string pdPrefix(const BusInterface& i) {
    bool pdSet = i.powerDomain.has_value() && !i.powerDomain->empty();
    bool matchOnly = i.pdMatchOnly.value_or(false);
    return (pdSet && !matchOnly) ? (*i.powerDomain + "_") : "";
}

std::string clientPrefix(const BusInterface& i) {
    if (i.busType == "SSN")
        return (i.interfaceName.has_value() && !i.interfaceName->empty()) ? (*i.interfaceName + "_ssn_")
                                                                          : "ssn_";
    if (i.busType == "IJTAG") return "ijtag_";
    if (i.busType == "BISR") return pdPrefix(i) + "bisr_";
    if (i.busType == "BSCAN") return "bscan_";
    if (i.busType == "JTAG1838") return "stap_";
    return "";
}

std::string toPrefix(const BusInterface& i, const Base& b) {
    if (i.busType == "SSN") return ssnPostfix(i) ? "ssn_to_" : (ifName(i) + "_ssn_to_");
    if (i.busType == "IJTAG") return ifName(i) + "_ijtag_to_";
    if (i.busType == "BISR") return pdPrefix(i) + ifName(i) + "_bisr_to_";
    if (i.busType == "BSCAN") return ifName(i) + "_bscan_to_";
    if (i.busType == "JTAG1838") return ifName(i) + "_" + b.qual + "to_";
    return "";
}

std::string fromPrefix(const BusInterface& i, const Base& b) {
    if (i.busType == "SSN") return ssnPostfix(i) ? "ssn_from_" : (ifName(i) + "_ssn_from_");
    if (i.busType == "IJTAG") return ifName(i) + "_ijtag_from_";
    if (i.busType == "BISR") return pdPrefix(i) + ifName(i) + "_bisr_from_";
    if (i.busType == "BSCAN") return ifName(i) + "_bscan_from_";
    if (i.busType == "JTAG1838") return ifName(i) + "_" + b.qual + "from_";
    return "";
}

int widthOf(const BusInterface& i, const Base& b) {
    return b.wide ? i.busWidth.value_or(SSN_DEFAULT_WIDTH) : 1;
}

std::string suffix(int w) { return w > 1 ? ("[" + std::to_string(w - 1) + ":0]") : ""; }

}  // namespace

std::vector<Base> basesOf(const BusInterface& i) {
    if (i.busType == "SSN") {
        return {down("bus_clock"), down("bus_data_in", true), up("bus_data_out", true)};
    }
    if (i.busType == "IJTAG") {
        return {down("tck"), down("reset"), down("ce"), down("se"), down("ue"), down("sel"),
                down("si"), up("so")};
    }
    if (i.busType == "BISR") {
        std::vector<Base> b;
        if (!i.omitMemCtrl.value_or(false)) b.push_back(down("mem_chain_select"));
        b.push_back(down("shift_en"));
        b.push_back(down("clk"));
        if (!i.omitMemCtrl.value_or(false)) b.push_back(down("mem_disable"));
        b.push_back(down("reset"));
        b.push_back(down("si"));
        b.push_back(up("so"));
        return b;
    }
    if (i.busType == "BSCAN") {
        std::vector<Base> b = {down("select"),          down("force_disable"),
                               down("select_jtag_input"), down("select_jtag_output"),
                               down("clock"),           down("capture_en"),
                               down("shift_en"),        down("update_en"),
                               down("scan_in")};
        if (i.bscanVariant.value_or("") == "AC") {
            b.push_back(down("ac_init_clk0"));
            b.push_back(down("ac_signal"));
            b.push_back(down("ac_mode_en"));
        }
        b.push_back(up("scan_out"));
        return b;
    }
    if (i.busType == "JTAG1838") {
        return {down("tck"), down("tms"), down("trst"),
                downQ("reset", "ijtag_"), downQ("ce", "ijtag_"),
                downQ("se", "ijtag_"), downQ("ue", "ijtag_"),
                down("tdi"), up("tdo")};
    }
    return {};
}

InterfaceSignal clientSignal(const BusInterface& i, const Base& b) {
    int w = widthOf(i, b);
    InterfaceSignal s;
    s.name = clientPrefix(i) + b.qual + b.name + suffix(w);
    s.direction = (b.group == "down") ? "input" : "output";
    s.width = w;
    return s;
}

InterfaceSignal secondarySignal(const BusInterface& i, const Base& b) {
    int w = widthOf(i, b);
    std::string prefix = (b.group == "down") ? toPrefix(i, b) : fromPrefix(i, b);
    InterfaceSignal s;
    s.name = prefix + b.name + ifSuffix(i) + suffix(w);
    s.direction = (b.group == "down") ? "output" : "input";
    s.width = w;
    return s;
}

std::vector<InterfaceSignal> expandInterface(const BusInterface& i) {
    std::vector<InterfaceSignal> out;
    for (const Base& b : basesOf(i))
        out.push_back(i.role == "client" ? clientSignal(i, b) : secondarySignal(i, b));
    return out;
}

}  // namespace genconn
