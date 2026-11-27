#include "gen.h"

#include <algorithm>
#include <sstream>
#include <stdexcept>

namespace pad {

namespace {

[[noreturn]] void fail(const std::string& why) { throw std::runtime_error("pad gen: " + why); }

std::string join(const std::vector<std::string>& v, const std::string& sep) {
    std::string out;
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) out += sep;
        out += v[i];
    }
    return out;
}

}  // namespace

std::string generateAuxPorts(const std::vector<PadInstance>& rows, const GenOptions& opts) {
    std::string wrapper, cat;
    if (opts.level == "chip") {
        wrapper = "BoundaryScan";
        cat = "internal";
    } else if (opts.level == "phy" || opts.level == "sub") {
        wrapper = "EmbeddedBoundaryScan";
        if (opts.aux != "external" && opts.aux != "internal")
            fail("level " + opts.level + " requires --aux external|internal");
        cat = opts.aux;
    } else {
        fail("level must be chip|phy|sub");
    }

    std::vector<std::string> ins, outs;
    for (const auto& r : rows) {
        if (r.reuse.empty() || r.func == "ssn" || r.gpio.empty()) continue;  // spec §9
        (r.reuse == "in" ? ins : outs).push_back(r.gpio);
    }
    if (ins.empty() && outs.empty()) return "";

    std::ostringstream o;
    o << "read_config_data -in_wrapper $dftspec/" << wrapper << " -rep -from_string {\n";
    o << "   AuxiliaryInputOutputPorts {\n";
    if (!ins.empty())
        o << "     " << cat << "_auxiliary_input_ports : " << join(ins, ", ") << ";\n";
    if (!outs.empty())
        o << "     " << cat << "_auxiliary_output_ports : " << join(outs, ", ") << ";\n";
    o << "   }\n";
    o << " }\n";
    return o.str();
}

std::string generatePortOptions(const std::vector<PadInstance>& rows) {
    std::vector<std::string> all, dt;
    for (const auto& r : rows) {
        if (r.gpio.empty()) continue;
        all.push_back(r.gpio);
        if (r.bscanEn) dt.push_back(r.gpio);
    }
    if (all.empty()) return "";

    std::ostringstream o;
    o << "set_boundary_scan_port_options -pad_io_ports { \\\n";
    for (size_t i = 0; i < all.size(); i += 8) {
        size_t end = std::min(all.size(), i + 8);
        o << "   ";
        for (size_t j = i; j < end; ++j) {
            if (j > i) o << ' ';
            o << all[j];
        }
        o << (end == all.size() ? "}\n" : " \\\n");
    }
    if (!dt.empty())
        o << "set_boundary_scan_port_options [get_ports [list " << join(dt, " ")
          << "]] -cell_options dont_touch\n";
    return o.str();
}

}  // namespace pad
