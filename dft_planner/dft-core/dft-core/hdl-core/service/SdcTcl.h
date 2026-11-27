// SDC reader backed by a REAL embedded Tcl interpreter.
//
// SDC is Tcl. A hand-rolled parser silently mis-reads anything with variables, foreach/if,
// nested [...] or wildcard object queries — and a wrong clock tree is worse than no clock tree.
// So the constraint commands are registered as C callbacks and Tcl evaluates the file: variable
// substitution, control flow, `source`, and command nesting all come for free. Our callbacks
// receive ALREADY-EVALUATED arguments and resolve object patterns against the elaborated design.
#pragma once

#include <string>
#include <vector>

#include "service/SdcLite.h"  // SdcInfo / SdcClock / SdcCase (shared result shape)

namespace hdl::service {

/// Real object names from the elaborated design, so get_ports/get_pins can glob-match instead
/// of treating "*clk*" as a literal name.
struct SdcObjects {
    std::vector<std::string> ports;  // top-level port names (primary I/O)
    std::vector<std::string> pins;   // hierarchical instance pins: "u_a.u_b.clk"
    std::vector<std::string> inputs; // top-level INPUT ports only (for all_inputs)
};

/// True when this build has a Tcl interpreter compiled in.
bool sdcTclAvailable();

/// Evaluate an SDC file through Tcl. Unsupported-but-harmless constraint commands are accepted
/// and ignored; a genuine Tcl error (bad syntax, unknown command, missing file) is reported in
/// SdcInfo::errors — never silently swallowed.
SdcInfo parseSdcTcl(const std::string& path, const SdcObjects& objs);

/// Evaluate SDC *text* (unit tests).
SdcInfo parseSdcTclText(const std::string& text, const SdcObjects& objs);

}  // namespace hdl::service
