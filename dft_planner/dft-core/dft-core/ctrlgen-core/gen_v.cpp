#include "gen_v.h"

#include <sstream>
#include <vector>

namespace ctrlgen {

std::string generateVerilog(const CtrlIpSpec& s) {
    std::ostringstream o;
    o << "module " << moduleName(s) << " (\n";

    // port order tracks dfx_ip_gen.pl: control _tdr inputs, dfx_mode, observe inputs,
    // control outputs, observe _tdr outputs. Scalar -> "input wire  x" (double space).
    std::vector<std::string> ports;
    for (const auto& p : s.pins)
        if (p.mode == "control")
            ports.push_back("input wire " + widthStr(p.width) + " " + p.portName + "_tdr");
    ports.push_back("input wire dfx_mode");
    for (const auto& p : s.pins)
        if (p.mode == "observe")
            ports.push_back("input wire " + widthStr(p.width) + " " + p.portName);
    for (const auto& p : s.pins)
        if (p.mode == "control")
            ports.push_back("output wire " + widthStr(p.width) + " " + p.portName);
    for (const auto& p : s.pins)
        if (p.mode == "observe")
            ports.push_back("output wire " + widthStr(p.width) + " " + p.portName + "_tdr");
    for (size_t i = 0; i < ports.size(); ++i)
        o << "  " << ports[i] << (i + 1 == ports.size() ? "" : ",") << "\n";
    o << ");\n\n";

    auto emitGate = [&](const PinSpec& p, bool control) {
        const auto& g = s.gateCell;
        const std::string tdr = p.portName + "_tdr";
        const std::string z = control ? p.portName : tdr;
        const std::string a1 = control ? tdr : p.portName;
        if (p.width == 1) {
            o << g.name << " " << p.portName << "_persistent_and2_inst (." << g.out << "(" << z
              << "), ." << g.a << "(" << a1 << "), ." << g.b << "(dfx_mode));\n";
        } else {
            const std::string i = "i_" + p.portName;
            o << "generate\n"
              << "genvar " << i << ";\n"
              << "for(" << i << "=0; " << i << "<" << p.width << "; " << i << "=" << i
              << "+1) begin: " << p.portName << "_gen\n"
              << "    " << g.name << " " << p.portName << "_persistent_and2_inst (." << g.out
              << "(" << z << "[" << i << "]), ." << g.a << "(" << a1 << "[" << i << "]), ."
              << g.b << "(dfx_mode));\n"
              << "end\n"
              << "endgenerate\n\n";
        }
    };
    for (const auto& p : s.pins)
        if (p.mode == "control") emitGate(p, true);
    for (const auto& p : s.pins)
        if (p.mode == "observe") emitGate(p, false);

    o << "endmodule\n\n";
    return o.str();
}

}  // namespace ctrlgen
