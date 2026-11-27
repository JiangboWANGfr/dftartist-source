// dft_lib_setting.yaml -> Tessent cell libraries -> CLOCK-CELL semantics.
//
// This is what makes a real clock-tree walk possible. slang is a language front-end: it knows
// a gate-level instance's module name and ports, but nothing about ICG / MUX / BUF, and above
// all it cannot tell WHICH input pin is the clock. A .tcelllib states both explicitly:
//   dft_cell_selection ( ... ) ( clock_gating_and = cgand; clock_mux = clock_mux21; ... )
//   model cgand (GCK, FE, TE, CK) ( cell_type = clock_gating_and;
//                                   input (CK) ( clock_in; )  output (GCK) ( clock_out; ) ... )
// so `clock_in` names the pin to keep walking through — no name-pattern guessing.
//
// LICENSING: the .tcelllib files are the USER's vendor-licensed content. They are read at
// runtime from the paths in their own dft_lib_setting.yaml and never copied into this repo.
#pragma once

#include <map>
#include <string>
#include <vector>

namespace hdl::service {

/// What a cell does on a clock path, derived from its declared cell_type / pin attributes.
struct ClockCell {
    std::string name;        // module name, as instantiated in the netlist
    std::string cellType;    // clock_gating_and | clock_mux | clock_buffer | clock_inverter | ...
    std::string role;        // normalized: "icg" | "mux" | "buf" | "inv" | "div" | "dff" | "other"
    std::vector<std::string> clockIn;   // pins attributed clock_in  (walk continues through these)
    std::string clockOut;               // pin attributed clock_out
    std::vector<std::string> enable;    // func_enable / test_enable pins (ICG: must be 1 to pass)
    std::vector<std::string> enableInv; // *_inv variants: must be 0 to pass
    std::string muxSel;                 // mux_select pin
    std::string muxIn0, muxIn1;         // mux_in0 / mux_in1 (select==0 / ==1)
    bool inverting = false;             // clock_inverter (or an inverting gating cell)
};

struct DftLibResult {
    std::map<std::string, ClockCell> cells;   // keyed by module name
    std::vector<std::string> libFiles;        // .tcelllib/.atpglib paths actually read
    std::vector<std::string> missing;         // referenced but unreadable (reported, not fatal)
    std::vector<std::string> errors;
};

/// Extract every `read_cell_library <path>` from a dft_lib_setting.yaml. Commented-out lines
/// (leading '#') are skipped; a path may contain a glob, which is expanded.
std::vector<std::string> cellLibPathsFromSetting(const std::string& yamlPath,
                                                 std::vector<std::string>& errors);

/// Parse one cell-library TEXT into clock-cell entries (exposed for unit tests).
void parseTcelllibText(const std::string& text, DftLibResult& out);

/// Full load: read the yaml, read each library it points at, build the clock-cell table.
DftLibResult loadDftLib(const std::string& yamlPath);

}  // namespace hdl::service
