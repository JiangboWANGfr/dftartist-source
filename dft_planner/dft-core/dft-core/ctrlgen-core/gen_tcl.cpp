#include "gen_tcl.h"

#include <algorithm>
#include <sstream>
#include <vector>

namespace ctrlgen {

std::string generateStitchTcl(const CtrlIpSpec& s) {
    const std::string mod = moduleName(s);
    const std::string inst = "u_" + mod;

    std::vector<std::string> dels, adds;
    for (const auto& p : s.pins) {
        for (int i = 0; i < p.width; ++i) {
            const std::string bit = p.width == 1 ? "" : "[" + std::to_string(i) + "]";
            const std::string tgt = p.targets.empty() ? *p.target + bit
                                                      : p.targets[static_cast<size_t>(i)];
            const std::string ipPin = inst + "/" + p.portName + bit;
            if (p.mode == "observe") {
                // observe: add a load, quoted new-style (docs/specs §1.2.3 / §4.3)
                adds.push_back("create_connection \"" + tgt + "\" \"" + ipPin + "\"");
                continue;
            }
            const std::string& st = p.stitch[static_cast<size_t>(i)];
            if (st == "mux") {
                adds.push_back("add_input_pin_dft_mux_override \"" + tgt + "\" \"" + ipPin +
                               "\" \"" + s.dfxModeSource + "\" \"" +
                               p.muxName[static_cast<size_t>(i)] + "\"");
            } else {
                if (st == "replace") dels.push_back("delete_connection " + tgt);
                // EMA quirk: scalar create uses double space between args, bus single
                adds.push_back("create_connection " + ipPin + (p.width == 1 ? "  " : " ") + tgt);
            }
        }
    }
    // EMA golden is byte-sorted (C locale): plain std::string operator< IS that order.
    std::sort(dels.begin(), dels.end());
    std::sort(adds.begin(), adds.end());

    std::ostringstream o;
    o << "create_instance  " << inst << " -of_module " << mod << "\n";
    o << "create_connection  " << s.dfxModeSource << " " << inst << "/dfx_mode\n";
    o << "\n\n";  // 2 blank lines after header (EMA layout)
    if (!dels.empty()) {
        for (const auto& d : dels) o << d << "\n";
        o << "\n\n\n";  // 3 blank lines between delete and add blocks
    }
    for (const auto& a : adds) o << a << "\n";
    o << "\n\n";  // 2 trailing blank lines
    return o.str();
}

}  // namespace ctrlgen
