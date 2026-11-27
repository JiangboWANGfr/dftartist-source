// Generated-clock resolution and Tessent add_clock/clock-mapping command generation.
//
// A faithful behavioral port of parse_sdc_to_yaml's clock-resolution stage
// (toolpack/dftartist_runtime/lnx-x86/gen_dft.pl, ~line 6164-6378), built on top of
// sdc-core/lint.cpp's already design-validated ResolvedClock list instead of re-parsing the SDC:
// infer a generated clock's master when -master_clock was not given, resolve its period from
// that master's -divide_by/-multiply_by/-edges/-combinational, then emit one add_clock command
// per target object (auto-labelled, with PAD/DFT-clock objects commented out) plus a
// tessent_clock_mapping command per named clock.
#pragma once
#include <string>
#include <vector>

#include "model.h"

namespace sdc {

/// One target object's generated add_clock line, kept separate from the raw command text so a
/// caller can tell a commented-out (PAD/DFT-clock/superseded) line from a live one.
struct AddClockCmd {
    std::string clockName;      ///< the clock this line came from
    std::string objectExpr;     ///< the target object this line constrains
    std::string label;          ///< -label value (the clock name, or an auto-generated one)
    std::string text;           ///< the full `add_clock ...` line, INCLUDING a leading "# " if commented
    bool commented = false;
    std::string reason;         ///< why it is commented ("" when live: "PAD signal", "DFT clock", "superseded")
};

/// One clock after generation: the same identity as ResolvedClock, plus what was computed.
struct GeneratedClock {
    std::string name;
    bool generated = false;
    double period = 0.0;        ///< 0 = still unresolved
    double frequencyMhz = 0.0;  ///< 0 = undefined (period unresolved, or exactly 0)
    std::string masterClock;    ///< as given, or as inferred; "" if neither
    bool masterInferred = false;
    std::vector<std::string> targets;
    std::string tessentClockMappingCmd;   ///< "" for an unnamed clock
    std::string file;           ///< the SDC file the create_clock/create_generated_clock line is in
    int line = 0;               ///< 1-based line of that command — "where is this clock defined"
};

struct ClockGenResult {
    std::vector<GeneratedClock> clocks;
    std::vector<AddClockCmd> addClockCmds;       ///< in clock-definition order, one per target
    std::vector<std::string> tessentMappingCmds; ///< one per named clock, in the same order
    std::vector<std::string> warnings;
};

/// Run master-clock inference + period resolution + add_clock/mapping-command generation over
/// clocks already parsed by sdc::lintFile/lintText (LintReport::clocks).
ClockGenResult generateClocks(const std::vector<ResolvedClock>& clocks);

}  // namespace sdc
