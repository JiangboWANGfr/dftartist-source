#pragma once
// Tessent boundary-scan config generation (spec §9/§10).
#include <string>
#include <vector>

#include "model.h"

namespace pad {

// Output A: read_config_data auxiliary ports. Members: reuse assigned && func!="ssn" &&
// gpio resolved. "" if no members. Throws std::runtime_error on bad level/aux.
std::string generateAuxPorts(const std::vector<PadInstance>& rows, const GenOptions& opts);

// Output B: set_boundary_scan_port_options. -pad_io_ports = ALL pads with resolved gpio
// (8 per line); dont_touch line = bscan_en rows. "" if no pads.
std::string generatePortOptions(const std::vector<PadInstance>& rows);

}  // namespace pad
