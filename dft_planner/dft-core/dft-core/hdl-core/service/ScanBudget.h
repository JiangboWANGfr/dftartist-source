#pragma once

// ---------------------------------------------------------------------------
// Scan budget: how many scan cells each EDT ends up holding, and the three spec
// numbers that follow from it.
//
// WHY THIS EXISTS AS ITS OWN THING. The EDT controller block needs
// scan_chain_count / longest_chain_range / channel counts, and today those are
// typed by hand. A hand-typed set is not checked against the design until scan
// insertion runs, which is several steps later — the reference design in this
// tree carries `scan_chain_count: 4915` with `longest_chain_range: 360,440`,
// which implies ~1.8M scan cells in a design that has 5268. The result was 4915
// chains averaging 1.07 cells each. Nothing rejected it.
//
// Everything needed to compute it honestly is already here:
//   * DesignDb::getRegisterCounts()  — flop bits per instance subtree
//   * DesignDb::wrapperCells()       — the EXTEST EDT's payload
//   * the user's own chain-family rules (which instances are OCC / hyper)
//
// so this turns "which instance goes to which EDT" into the numbers, and emits
// BOTH artefacts that have to agree: the EDT spec block and the scan-insertion
// Tcl. They are generated from one model precisely because maintaining them
// separately is how they drift.
//
// What it does NOT model, and says so in its output rather than pretending:
// non-scan instances (`add_nonscan_instances` — lockups, channel pipelines)
// are not deducted, so a real chain is slightly shorter than budgeted.
// ---------------------------------------------------------------------------

#include <map>
#include <string>
#include <vector>

#include "json/JsonValue.h"
#include "service/DesignDb.h"

namespace hdl::service {

/// One EDT controller the user placed, plus what they assigned to it.
struct EdtPlan {
    std::string name = "INT_EDT";
    /// EXTEST controller. At most one may be external — that is a design rule of the flow,
    /// not a limitation here, and it is reported as an error rather than silently accepted.
    bool external = false;
    /// Instance paths ('.' or '/' separated) whose subtrees this EDT covers. Empty on an
    /// internal EDT means "everything not claimed by another one".
    std::vector<std::string> instances;
    bool includeOcc = true;
    bool includeHyper = true;
    /// EXTEST chains hold the wrapper cells; internal ones hold them too, but as ordinary
    /// flops already counted inside their instance's subtree, so this only adds them once.
    bool includeWrapper = false;
    /// CUSTOM chain families this controller carries, beyond the OCC/HYPER/INT model — the ones
    /// declared through familyOptions. They join the mode's -include_chain_families verbatim.
    std::vector<std::string> extraFamilies;
    /// input_channel_count = output_channel_count. Leave at 0 to DERIVE it, which is what the
    /// flow's own Run Analysis does:
    ///
    ///     longest_chain_range = target ± tolerance
    ///     scan_chain_count    = ceil(cells / longest_max)
    ///     channel_count       = ceil(chains / chainsPerChannel) + (separate control ? 1 : 0)
    ///
    /// Deriving it in that order is also what makes the result self-consistent. Taking the
    /// channel count as an INPUT and the chain count from the target length independently is how
    /// this file once emitted `scan_chain_count: 4` beside `input_channel_count: 8` — a
    /// decompressor drives at least one chain per channel, so that spec cannot be built.
    int channels = 0;
    /// The user's INTENT, from which scan_chain_count and longest_chain_range are derived.
    /// Storing the intent rather than the derived number is what lets a re-run track a design
    /// that grew, instead of leaving a stale count behind.
    int targetChainLength = 0;
    /// Emitted as `separate_control_data_channels`. -1 = the house default for this kind: on for
    /// an internal controller, off for an external one, which is what the reference specs carry.
    /// It also feeds the +1 in the channel derivation ONLY when set explicitly — the reference
    /// INT_EDT has separate control on with 7 channels for 975 chains (ceil(975/150) = 7, no +1),
    /// so tying the arithmetic to the emitted flag would contradict the design it came from.
    int separateControlDataChannels = -1;
    /// Chains one channel is expected to carry, when the channel count is derived. The reference
    /// flow uses 150 — a house number, not a tool limit, so it is a knob rather than a constant.
    int chainsPerChannel = 150;
    /// leaf_instance_name for the channel pipeline stages. Empty = the house default,
    /// `dfx_<int|ext>_edt_channels_<in|out>_pipe`, which is what the reference specs use.
    std::string channelInPipe;
    std::string channelOutPipe;
    /// `Connections { ssh_chain_group: … }`. Empty = omitted — NOT a house name like `edt_gp`:
    /// a fixed default puts every controller in one group whether or not it is wired that way.
    /// The planner passes the group inferred from the canvas (the controller's own
    /// ssh_chain_group, else its instance name); several controllers may name the same group.
    std::string sshChainGroup;
    /// `Compactor { pipeline_logic_levels_in_compactor: N }`. -1 = omit the block.
    int pipelineLogicLevelsInCompactor = 2;
    /// `ShiftPowerOptions`. -1 = omit the block; otherwise `present: on` with this threshold.
    int minSwitchingThresholdPercentage = 5;
};

struct ScanBudgetOptions {
    std::string core;                          // "" = largest candidate top
    std::vector<std::string> occInstances;     // globs, e.g. "*tessent_occ*"
    std::vector<std::string> hyperInstances;   // globs, e.g. "*dfx_*hyper*"
    /// Instances excluded from scan (`add_nonscan_instances`: lockups, EDT channel pipelines,
    /// analog wrappers). Their flops exist but never join a chain, so counting them makes every
    /// chain come out longer on paper than it will be in silicon.
    std::vector<std::string> nonscanInstances;
    /// Subtrees that must NOT join the family above them, whatever the rule says. A rule plus a
    /// short exception list is how a real hierarchy is described — "everything matching *_ctl
    /// except the one that is really a memory wrapper" cannot be written as a glob, and forcing
    /// it to be one is what pushes people back to hand-written lists that go stale. An exception
    /// applies to the whole subtree beneath it and the bits are returned to the remainder.
    std::vector<std::string> occExcludes, hyperExcludes, nonscanExcludes;
    /// Extra switches for the generated Tcl, by family name then option name (without the
    /// leading dash) — e.g. {"OCC_CHAIN": {"ssh_instance": "...", "ssh_chain_groups": "occ_chain"}}.
    /// `create_scan_chain_family` has 33 switches and `add_scan_mode` 36; we derive a handful and
    /// only the engineer knows the rest, so a generator that cannot carry them produces a script
    /// that has to be hand-edited afterwards — which is how the generated and the real script
    /// drift apart. Values are RAW TCL, so `[get_instance …]` and `[list …]` pass through.
    std::map<std::string, std::map<std::string, std::string>> familyOptions;
    /// Same, by scan-mode name ("int_edt_mode" / "ext_edt_mode").
    std::map<std::string, std::map<std::string, std::string>> scanModeOptions;
    std::vector<EdtPlan> edts;
    WrapperOptions wrapper;                    // feeds the EXTEST cell count
    /// ±this percent around targetChainLength becomes longest_chain_range. The reference
    /// spec in this tree uses 360,440 around 400 and 270,330 around 300 — 10% both times.
    int chainLengthTolerancePercent = 10;
    std::string designName;                    // DftSpecification(<design>,<scope>)
    std::string specScope = "logic_test";
    std::function<void(const std::string& line)> log;
};

/// One instance's contribution to an EDT, so every number can be traced back to where it
/// came from. A budget nobody can audit is a budget nobody acts on.
struct BudgetContribution {
    std::string instance;
    long long bits = 0;
    long long memoryBits = 0;
};

struct EdtBudget {
    std::string name;
    bool external = false;
    long long cellsCore = 0;     // ordinary scan flops from the assigned subtrees
    long long cellsOcc = 0;
    long long cellsHyper = 0;
    long long cellsWrapper = 0;
    long long memoryBits = 0;    // excluded from the cell count; shown so it is not a mystery
    long long nonscanBits = 0;   // deducted from cellsCore by the add_nonscan_instances rules
    int channels = 0;
    int chainCount = 0;
    /// ceil(cells / chainCount) — what the longest chain will really be. longestMin/Max are
    /// this ± the tolerance, so the range always contains an achievable answer.
    int achievedLength = 0;
    int longestMin = 0, longestMax = 0;
    double compression = 0.0;    // chainCount / channels
    std::vector<BudgetContribution> contributions;
    std::vector<std::string> warnings;
    /// EDT-Aborted (EAB) risk advice, from the OCC sub-chain stitching rules in the TestKompress
    /// manual. Every value a pattern must FORCE on a scan cell — OCC clock-control bits, cell
    /// constraints — eats decompressor encoding capacity, and cells that land on the same shift
    /// cycle across many chains cluster and blow the encoding. That is what produces EAB faults
    /// and the coverage loss with them, and it is decided by how the chain families are cut,
    /// which is exactly what this page plans. Advisory, never fatal.
    std::vector<std::string> eabAdvice;
    /// occBits / achievedLength. The manual's thresholds are 25% (fits one compressed chain)
    /// and 75% / over one chain (use an uncompressed chain instead).
    double occChainRatio = 0.0;

    long long cells() const { return cellsCore + cellsOcc + cellsHyper + cellsWrapper; }
};

struct ScanBudgetResult {
    std::string core;
    std::vector<EdtBudget> edts;
    long long coreRegisterBits = 0;   // everything under the core
    long long coreMemoryBits = 0;
    long long occBits = 0, hyperBits = 0;
    long long nonscanBits = 0;        // deducted, not counted
    int wrapperIn = 0, wrapperOut = 0;
    long long unassignedBits = 0;     // scan flops no EDT claimed
    std::vector<std::string> errors;  // overlapping assignments, >1 external EDT, …
    std::vector<std::string> notes;   // things the model knowingly does not account for
    std::string edtSpec;              // the `EDT { Controller(...) … }` block
    std::string scanTcl;              // register_attribute / create_scan_chain_family / add_scan_mode
    double analysisMs = 0;
};

/// Pure analysis: reads the elaborated design, writes nothing.
ScanBudgetResult computeScanBudget(DesignDb& db, const ScanBudgetOptions& opt);

/// Parse a plan out of JSON. Shared by the CLI (`--config plan.json`) and the daemon's
/// `scan-budget` method so the GUI, the canvas and a hand-written script cannot drift into
/// three subtly different readings of the same document.
ScanBudgetOptions scanBudgetOptionsFromJson(const json::Value& cfg);

}  // namespace hdl::service
