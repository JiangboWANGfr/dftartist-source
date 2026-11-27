// dp_shell — a Tcl shell over the elaborated design.
//
// Same interpreter that evaluates SDC, but with design-query and DFT-planning commands. It is
// the SINGLE backend for both the bottom shell panel and the schematic right-click actions
// (a menu item just runs the corresponding command), so the two can never drift apart.
//
// DFT points are USER-DECIDED, never inferred: the tool finds and records them, and persists
// OCC definition points to dfx_occ_def_point.tcl as replayable commands.
#pragma once

#include <string>
#include <vector>

#include "service/DesignDb.h"

namespace hdl::service {

class DesignDb;

/// A user-declared OCC clock-definition point.
struct OccPoint {
    std::string pin;      // hierarchical pin/port the OCC is defined on
    std::string clock;    // optional clock name it belongs to
    std::string comment;
};

/// A PLANNED DFX IP instantiation (dfx_dynamic_hyper_ctl / dfx_static_hyper_ctl_tdr / …).
/// We only RECORD it — actual instantiation happens in the user's insertion flow. The GUI's
/// DFX IP panel lists these and draws the planned control circuit around them.
struct DftIp {
    std::string module;     // IP module name (from the user's dfx_ip library)
    std::string instance;   // planned instance name
    std::string at;         // scope to instantiate in ("" = harden top)
    std::string comment;
};

/// A planned connection between two pins of PLANNED (virtually instantiated) DFX IPs, or a
/// constant tie. Nothing is written into the RTL — this is the model the
/// `create_instance` / `create_connection` script is generated from, which is how these IPs get
/// instantiated in the insertion flow.
struct DftConn {
    std::string from;      // driver pin, e.g. "u_dfx_static_hyper_ctl_tdr/dfx_scan_mode"
    std::string to;        // load pin — empty when this is a constant tie
    std::string constant;  // "0" / "1" — empty unless this IS a constant tie
    std::string comment;
};

/// A user-declared DFT control mux (we only RECORD it; insertion is the user's flow).
struct CtrlMux {
    std::string target;          // e.g. "u_core/rst_n" — the net/pin to make controllable
    std::string overrideSource;  // -override_source
    std::string select;          // -select (the mux select pin)
    std::string comment;
};

/// A user-declared clock (dp_shell `add_clocks`), independent of the SDC. `offState` is the
/// value the clock holds when not pulsing — it is what makes a clock controllable in test.
struct UserClock {
    std::string node;      // port/pin the clock is defined on
    std::string offState;  // "0" | "1"
    std::string label;
};

/// A user-declared DFT signal (scan_en / test_mode / …) and where it is driven from.
struct DftSignal {
    std::string name;
    std::string source;    // -source_nodes
    /// Value this signal is FORCED to in test mode (-value). The scan-mode pass of the DRC
    /// applies these on top of the functional set_case_analysis, so `scan_enable -value 1` is
    /// what makes the shift-mode analysis mean anything.
    int value = 1;
};

/// The three test phases a reset has to be correct in. They differ ONLY in what the DFT signals
/// are held at, so each is a constraint set layered on the session's own — one walk per phase,
/// same netlist, same calculus.
///   shift  — the chain is shifting: every reset MUST be inactive or nothing shifts
///   sac    — stuck-at capture: the reset may be either value; being CONTROLLABLE is the point
///   asc    — at-speed (transition) capture: inactive throughout, or the transition is destroyed
enum class TestPhase { Shift, StuckAtCapture, AtSpeedCapture };

/// User-declared value constraint on a pin/port for the DRC value calculus.
/// value is one of '0' '1' 'X' 'Z' — X clears a previous force, Z marks explicitly floating;
/// only 0/1 are applied as forces (X and Z analyze identically to "unconstrained").
struct PinConstraint {
    std::string pin;    // normalized '.'-separated
    char value = 'X';
};

struct DpResult {
    bool ok = true;
    std::string output;  // everything the commands printed
    std::string error;   // Tcl errorInfo when ok == false
};

class DpShell {
public:
    explicit DpShell(DesignDb& db);
    ~DpShell();
    DpShell(const DpShell&) = delete;
    DpShell& operator=(const DpShell&) = delete;

    /// Evaluate one command line or a whole script.
    DpResult eval(const std::string& script);
    /// Evaluate a file (DRC check scripts, or a previously written dfx_occ_def_point.tcl).
    DpResult sourceFile(const std::string& path);

    const std::vector<OccPoint>& occPoints() const;
    /// One port of a planned DFX IP instance with its per-phase value. Inputs resolve from the
    /// constraint chain (phase constraint > pin constraint > dft connection); outputs are
    /// COMPUTED from the IP's circuit under those inputs — X when the calculus cannot decide,
    /// with `stuck` naming why ("input:<port>" = first unconstrained input, "dead:<path>" =
    /// a register output / undriven net inside the IP).
    struct IpPortState {
        std::string port;            // port name
        std::string dir;             // "in" | "out" | "inout"
        std::string s, sac, asc;     // "0" / "1" / "X" per phase
        std::string stuck;           // only on outputs that compute X
        /// The value came from a DECLARATION on the pin (add_pin_constraint /
        /// set_phase_constraint / add_dft_connection -constant), not from the circuit.
        /// The GUI marks these — an X-fed pin showing 1 must say WHY it is 1.
        bool declared = false;
    };
    struct IpCircuit {
        std::string instance;        // planned instance name
        std::string module;          // IP module
        std::vector<IpPortState> ports;
    };
    /// Every planned IP with its port states — empty when no library is loaded (read_dfx_ip).
    /// This is the schematic's data for drawing the IP's input circuit.
    std::vector<IpCircuit> ipCircuits() const;

    /// The INTERNAL circuit of one planned IP: the module's local netlist (cells with their
    /// real pins and nets, boundary port bindings) plus every net's per-phase value from the
    /// same calculus report_dft_ip_circuit uses. This is what "trace INTO dfx_rst_scan_n"
    /// draws — the persistent cell the X is stuck at included.
    struct IpConePin {
        std::string port;   // pin/port name
        std::string dir;    // "in" | "out" | "inout"
        std::string net;    // resolved net ("" when composite/unconnected)
        std::string tie;    // constant tie literal ("1'b0"), "" otherwise
    };
    struct IpConeCell {
        std::string name;    // instance name inside the IP module
        std::string module;  // cell/module name — or the primitive KIND for decomposed assigns
        std::string label;   // decomposed assigns only: display text ("MUX", "==", "&", …)
        std::vector<IpConePin> pins;
    };
    struct IpConeNet {
        std::string name;
        std::string s, sac, asc;   // per-phase value; "" when values were skipped (too big)
        bool declared = false;     // value comes from a declaration on the same-named pin
    };
    struct IpCone {
        std::string instance;         // the planned instance (add_dft_ip)
        std::string module;           // the IP module
        std::vector<IpConeCell> cells;
        std::vector<IpConePin> ports; // the module's own port -> net bindings
        std::vector<IpConeNet> nets;
        bool truncated = false;
    };
    /// Empty result (module == "") when the instance is unknown or no library is loaded.
    IpCone ipCone(const std::string& instance) const;
    const std::vector<CtrlMux>& ctrlMuxes() const;
    const std::vector<PinConstraint>& pinConstraints() const;
    const std::vector<DftIp>& dftIps() const;
    const std::vector<DftConn>& dftConns() const;

    /// The `create_instance` / `create_connection` script for every planned DFX IP and the
    /// connections between them — a VIRTUAL instantiation: the RTL is never edited, the flow
    /// replays this script.
    std::string renderInstantiationTcl() const;

    /// dfx_occ_def_point.tcl contents: replayable `add_to_occ_def_point ...` lines.
    std::string renderOccTcl() const;
    /// Same for the recorded control muxes.
    std::string renderCtrlMuxTcl() const;
    /// Write `renderOccTcl()`; false + err on I/O failure.
    bool writeOccTcl(const std::string& path, std::string& err) const;

    /// One-line help for every registered command (also `help` inside the shell).
    static std::string helpText();

    /// A number that changes whenever the recorded DFT plan changes — OCC points, control muxes,
    /// pin constraints, declared clocks/signals, the SDC or library in use, DRC severities.
    /// Derived from the state itself rather than bumped by hand, so a new command that records
    /// something cannot forget to report it. The GUI re-runs its analysis when this moves, which
    /// is what makes `add_pin_constraint` in the console show up in the clock/reset view.
    std::size_t planRev() const;

    /// The pin constraints / OCC points / DFT-signal forces this session has recorded, for the
    /// analyses the GUI runs directly against DesignDb. The console and the buttons are one
    /// session; without this they were two, and the console's constraints were simply not
    /// applied to what the user was looking at.
    std::vector<std::pair<std::string, int>> drcPinConstraints() const;
    /// Per-phase extra constraints (set_phase_constraint), on top of the session's own.
    std::vector<std::pair<std::string, int>> phaseConstraints(TestPhase p) const;
    std::vector<std::string> drcOccPoints() const;
    std::vector<std::pair<std::string, bool>> drcForces() const;

    /// The DRC query for ONE test phase: the session's constraints with that phase's
    /// set_phase_constraint values layered on top, and the planned muxes re-resolved against
    /// them. This is what makes s()/sac()/asc() three real answers instead of one repeated.
    CrQuery drcPhaseQuery(const std::string& phase) const;

    /// Planned control muxes that are EFFECTIVE for the DRC: the select is held active and the
    /// override source is held at a definite value, so in test mode the target takes that value.
    /// A mux whose DFT side is not constrained changes nothing and is deliberately not returned —
    /// the analysis must not credit a plan that would not actually drive anything.
    std::vector<std::pair<std::string, std::string>> drcPlannedMuxes() const;

    struct Impl;   // public: the Tcl command callbacks are free functions and need to reach state

private:
    Impl* p_;
};

}  // namespace hdl::service
