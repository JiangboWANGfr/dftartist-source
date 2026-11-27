// Data model for the SDC linter.
//
// SDC *is* Tcl, so "is this SDC valid?" is really three questions stacked on top of each other,
// and a finding says which layer it came from:
//   L1 syntax   — Tcl itself rejects it (unbalanced {}/[]/"", bad continuation, `#` in a
//                 non-command position, undefined variable, bad expr).
//   L2 command  — it parses as Tcl but is not legal SDC: unknown command, unknown/misspelled
//                 option, missing required option, wrong value type, mutually exclusive options,
//                 or an option that only exists in a different vendor's dialect.
//   L3 design   — legal SDC that cannot mean anything on THIS netlist: get_ports matches nothing,
//                 a generated clock's -master_clock was never defined, a clock is redefined.
// Only L3 needs an elaborated design; L1/L2 run on the file alone.
#pragma once
#include <string>
#include <vector>

namespace sdc {

/// Which tool's command set to validate against. A file is checked against the UNION of the
/// selected dialects, and anything outside that union is reported — so selecting only Generic
/// turns every vendor extension into a portability warning, while selecting DC+Genus accepts
/// both and still flags a Genus-only option when the file also has to read into PrimeTime.
enum Dialect : unsigned {
    kGeneric = 1u << 0,  ///< SDC 1.x/2.x standard commands only
    kDcPt    = 1u << 1,  ///< Synopsys Design Compiler / PrimeTime
    kGenus   = 1u << 2,  ///< Cadence Genus (and the Innovus constraints it shares)
    kAll     = kGeneric | kDcPt | kGenus,
};

enum class Severity { Error, Warning, Info };

const char* severityName(Severity s);

/// One diagnostic. `line`/`column` are 1-based and point into `file`; column is 0 when the
/// finding is about the command as a whole rather than one word of it.
struct Finding {
    std::string rule;      ///< stable id, e.g. "SDC-SYNTAX", "SDC-OPT-UNKNOWN", "SDC-EMPTY-MATCH"
    Severity severity = Severity::Error;
    std::string file;
    int line = 0;
    int column = 0;
    std::string command;   ///< the SDC command this came from ("" for file-level findings)
    std::string message;   ///< what is wrong
    std::string hint;      ///< how to fix it ("" when there is nothing useful to say)
};

/// What the linter understood, so the caller can show "12 clocks, 3 generated" alongside errors
/// and so a caller that only wants the constraint inventory does not need a second parse.
struct Summary {
    int commands = 0;        ///< SDC commands evaluated (Tcl control flow not counted)
    int clocks = 0;          ///< create_clock
    int generatedClocks = 0; ///< create_generated_clock
    int exceptions = 0;      ///< false_path / multicycle / max_delay / min_delay
    int ioDelays = 0;        ///< set_input_delay / set_output_delay
    bool designAware = false; ///< true when an elaborated design backed the L3 checks
    bool tclAvailable = true; ///< false in a build without an embedded interpreter
};

/// One parsed clock definition (create_clock / create_generated_clock), resolved against the
/// real design when design-aware (targets/source are the actual matched object names, not raw
/// patterns). Exposed on LintReport so a caller can build derived artifacts — generated-clock
/// period/master inference, `add_clock` command generation — without re-parsing the SDC.
struct ResolvedClock {
    std::string name;
    std::vector<std::string> targets;   ///< create_clock's object list / create_generated_clock's target
    std::vector<std::string> source;    ///< create_generated_clock's -source (required); empty otherwise
    double period = 0.0;                ///< create_clock's -period; 0 (unresolved) for a generated clock
    bool generated = false;
    bool add = false;
    std::string masterClock;            ///< -master_clock, or "" if it must be inferred from -source
    bool hasDivideBy = false;
    long divideBy = 0;
    bool hasMultiplyBy = false;
    long multiplyBy = 0;
    bool hasEdges = false;               ///< true only when every -edges value parsed as numeric
    std::vector<double> edges;
    bool hasEdgeShift = false;
    bool invert = false;
    bool combinational = false;
    std::string file;
    int line = 0;
};

struct LintReport {
    std::vector<Finding> findings;
    Summary summary;
    std::vector<ResolvedClock> clocks;

    int count(Severity s) const;
    bool ok() const { return count(Severity::Error) == 0; }
};

/// Design objects the L3 checks resolve constraint patterns against. Empty => L3 is skipped
/// (the linter must not claim "port not found" when it was never told what the ports are).
struct DesignObjects {
    std::vector<std::string> ports;    ///< top-level primary I/O
    std::vector<std::string> inputs;   ///< top-level inputs  (all_inputs)
    std::vector<std::string> outputs;  ///< top-level outputs (all_outputs)
    std::vector<std::string> pins;     ///< hierarchical instance pins, '.'-separated
    std::vector<std::string> nets;     ///< hierarchical nets, '.'-separated
    std::vector<std::string> cells;    ///< hierarchical instance paths
    bool empty() const {
        return ports.empty() && pins.empty() && nets.empty() && cells.empty();
    }
};

}  // namespace sdc
