// Minimal SDC reader for DFT clock/reset structure analysis (NOT a full Tcl interpreter).
// Extracts exactly what the clock-tree view needs:
//   create_clock            -> clock definition points (ports/pins) + period/waveform
//   create_generated_clock  -> derived clock points + their -source
//   set_case_analysis       -> constant constraints (0/1) on ports/pins
// Everything else is ignored. Handles line continuations (\), [get_ports {...}],
// [get_pins {...}], [list ...], bare names, and # comments.
#pragma once

#include <string>
#include <vector>

namespace hdl::service {

struct SdcClock {
    std::string name;            // -name, or the first target when absent
    std::vector<std::string> targets;  // port/pin names the clock is defined on
    double period = 0.0;
    bool generated = false;
    std::string source;          // create_generated_clock: its -source target
};

struct SdcCase {                 // set_case_analysis <0|1> [get_ports ...]
    std::string target;
    int value = 0;
};

struct SdcInfo {
    std::vector<SdcClock> clocks;
    std::vector<SdcCase> cases;
    std::vector<std::string> errors;  // unparsable create_clock lines (reported, not fatal)
};

/// Parse an SDC file. Returns empty info (with an error note) when the file can't be read.
SdcInfo parseSdcFile(const std::string& path);

/// Parse SDC text (exposed for unit tests).
SdcInfo parseSdcText(const std::string& text);

}  // namespace hdl::service
