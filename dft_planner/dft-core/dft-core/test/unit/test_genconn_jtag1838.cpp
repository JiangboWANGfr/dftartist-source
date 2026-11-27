#undef NDEBUG  // asserts 在 Release 也要生效
#include "expand.h"
#include "model.h"
#include "order.h"

#include <cassert>
#include <set>
#include <cstdio>
#include <string>
#include <vector>

using namespace genconn;

static std::vector<std::string> names(const BusInterface& i) {
    std::vector<std::string> out;
    for (const auto& s : expandInterface(i)) out.push_back(s.direction + " " + s.name);
    return out;
}

int main() {
    BusInterface client;
    client.id = "c"; client.busType = "JTAG1838"; client.role = "client";
    std::vector<std::string> cexp = {
        "input stap_tck", "input stap_tms", "input stap_trst",
        "input stap_ijtag_reset", "input stap_ijtag_ce", "input stap_ijtag_se", "input stap_ijtag_ue",
        "input stap_tdi", "output stap_tdo"};
    assert(names(client) == cexp);

    BusInterface sec;
    sec.id = "s"; sec.busType = "JTAG1838"; sec.role = "secondary"; sec.interfaceName = "host_stap";
    std::vector<std::string> sexp = {
        "output host_stap_to_tck", "output host_stap_to_tms", "output host_stap_to_trst",
        "output host_stap_ijtag_to_reset", "output host_stap_ijtag_to_ce", "output host_stap_ijtag_to_se", "output host_stap_ijtag_to_ue",
        "output host_stap_to_tdi", "input host_stap_from_tdo"};
    assert(names(sec) == sexp);

    // order.cpp BUS_ORDER 必须含 JTAG1838，否则接口被静默丢弃
    HardenDef def;
    def.id = "d"; def.designName = "top"; def.designLevel = "chip"; def.designType = "hierarchical";
    BusInterface ss; ss.id = "ss"; ss.busType = "SSN"; ss.role = "client";
    BusInterface jj; jj.id = "jj"; jj.busType = "JTAG1838"; jj.role = "client";
    def.interfaces = {ss, jj};
    DefPorts ports = expandDef(def, {});
    bool hasStapTck = false;
    for (const auto& s : ports.inputPorts) if (s.name == "stap_tck") hasStapTck = true;
    assert(hasStapTck);  // JTAG1838 接口的 stap_tck 必须出现在展开端口里

    std::printf("test_genconn_jtag1838 OK\n");
    return 0;
}
