#include "gen_icl.h"

#include <sstream>

namespace ctrlgen {

std::string generateIcl(const CtrlIpSpec& s) {
    std::ostringstream o;
    o << "Module " << moduleName(s) << " {\n";
    for (const auto& p : s.pins)
        if (p.mode == "control")
            o << "  DataInPort  " << p.portName << "_tdr" << widthStr(p.width)
              << " {DefaultLoadValue " << (p.width > 1 ? "0" : "1'b0") << ";}\n";
    for (const auto& p : s.pins)
        if (p.mode == "observe")
            o << "  DataOutPort  " << p.portName << "_tdr" << widthStr(p.width) << " {}\n";
    o << "}\n\n";
    return o.str();
}

}  // namespace ctrlgen
