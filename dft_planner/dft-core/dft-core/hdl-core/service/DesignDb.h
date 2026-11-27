#pragma once
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "service/Netlist.h"       // LocalNetlist
#include "service/SlangHelpers.h"  // PortDict

namespace hdl::frontend {
struct Design;
}

namespace slang::ast {
class ValueSymbol;
class InstanceSymbol;
}

namespace hdl::service {

struct Meta {
    std::string id, instanceName, kind, definitionId;
    bool isLeaf = false;
    std::optional<int> subtreeSize;  // candidateTops only
};

struct ExpandResult {
    std::vector<std::string> childInstanceIds;
    std::vector<Meta> children;
};

struct PortsResult {
    std::vector<PortDict> ports;
    std::vector<std::pair<std::string, int>> portWidthOverrides;
};

struct SourceLoc {
    std::string file;
    int line = 0;
};

struct ParamInfo {
    std::string name, value, type;
    bool isLocal = false;
};

struct ParamsResult {
    std::vector<ParamInfo> parameters;
};

struct TraceEdge {
    std::string fromNode, fromPort, toNode, toPort, netName;
    bool bus = false;
};

struct TraceResult {
    std::vector<TraceEdge> edges;
    std::vector<Meta> nodes;
    bool truncated = false;
};

struct DriverSourceInfo {
    std::string kind;  // "port" | "logic" | "constant" | "instance"
    /// For a "logic" source: the SHAPE of the driving expression, so every view can render
    /// the same statement with the same symbol (统一三个界面的 assign 显示原理):
    /// "alias" (`a = b`) | "inv" | "and" | "or" | "xor" | "mux" | "" (a real block).
    std::string shape;
    std::string id, label, detail, file;
    /// The SIGNAL these drivers drive. traceLogic flattens the drivers of every signal a block
    /// reads into one list, so without this the caller cannot tell which input pin a source
    /// belongs to — a `logic` source's label is only the block kind ("assign"/"always_ff"),
    /// which is why several distinct fan-ins all rendered as an anonymous "assign".
    std::string net;
    int line = 0;
    bool bus = false;
    /// Reader statements only (trace-loads / trace-net-loads): the net this statement DRIVES
    /// (its LHS). This is what gives a load node an OUTPUT pin — without it every forward
    /// trace died at the first assign and its downstream registers stayed invisible.
    std::string drives;
    /// Gate-shaped logic sources only: the signal names the RHS actually READS — the gate's
    /// real input pins. Without them a 2-input OR drew with one generic `a` input and every
    /// traced driver piled onto it ("or gate 怎么只有一个输入").
    std::vector<std::string> reads;
};

struct DriversResult {
    std::vector<DriverSourceInfo> sources;
    std::string netName;
    bool bus = false;
};

// ---- P2: RTL logic primitives (RTLvision-style gate/mux/DFF view of a behavioral block) ----
// One input of a primitive cell. `ref` says where the value comes from:
//   "cell:<id>"  another cell's output (an internal net of the decomposition)
//   "sig:<name>" a signal/port the block reads (an external input)
//   "const:<v>"  a literal
struct LogicPin {
    std::string name;  // role of this input: "a","b","s","d","clk","rst",...
    std::string ref;
};

// One RTL primitive inferred from an expression/statement.
struct LogicCell {
    std::string id;     // "c0","c1",... unique within one decomposition
    std::string kind;   // gate:   and|or|xor|nand|nor|xnor|not|buf
                        // arith:  add|sub|mul|div|mod|shl|shr
                        // cmp:    eq|neq|lt|gt|le|ge
                        // reduce: rand|ror|rxor   logical: land|lor|lnot
                        // struct: mux|dff|dlatch|concat|select|const|call
    std::string label;  // display text: "&", "+", "==", "3'h5", "MUX", "DFF", ...
    std::vector<LogicPin> inputs;
    std::string outName;  // signal this cell drives ("" for an intermediate node)
    int width = 1;
    int line = 0;
};

struct DecomposeResult {
    std::vector<LogicCell> cells;
    std::vector<std::string> inputs;   // external signals read (targets of "sig:" refs)
    std::vector<std::string> outputs;  // signals the block drives
    std::string file;
    int line = 0;
    std::string blockKind;  // "assign"|"always_ff"|"always_comb"|"always_latch"|"always"
    bool truncated = false;
};

// trace-into: one inward step through a module boundary pin — structural child-instance
// edges + behavioral sources (out pin with no structural driver) in one response (spec §2).
struct TraceIntoResult {
    std::vector<TraceEdge> edges;
    std::vector<Meta> nodes;
    std::vector<DriverSourceInfo> sources;
    std::string netName;
    bool bus = false;
    bool truncated = false;
};

struct SeqEvent {
    std::string net;
    std::string edge;  // "posedge" | "negedge" | "both"
    /// Async control whose branch loads ONES: a SET/preset pin, not a reset. The fix picks
    /// dfx_set_scan_n/p for these instead of dfx_rst_scan_n/p — same question, other rail pair.
    bool set = false;
};

// One edge-triggered procedural block: its clock(s) and async reset(s) + location.
struct SeqElement {
    std::string ownerInstanceId;
    /// The owning instance itself. Resolving `ownerInstanceId` back to a symbol meant a lazy
    /// registration pass plus a std::map lookup keyed by the full hierarchical path — measured
    /// as ~200 ms of one-time cost inside the first clock walk on the 64-core stress SoC, and it
    /// grows with the design. The enumerator already holds the symbol, so it just carries it.
    const slang::ast::InstanceSymbol* ownerSym = nullptr;
    std::string file;
    int line = 0;
    int bits = 1;                       // REGISTER BITS this block infers (sum of written
                                        // packed variable widths) — a 16-bit reg is 16 flops
    std::vector<SeqEvent> clocks;       // best-effort (edge signals not in the leading if-cond)
    std::vector<SeqEvent> asyncResets;  // edge signals referenced in the leading if-cond
};

// Per-instance register (flip-flop) bit counts. own = flops declared directly in this
// instance body; subtree = own + all descendants. memoryBits = clock-driven unpacked
// arrays (RAM), excluded from own/subtree (not scan flops).
struct RegCount {
    std::string instanceId;  // = hierarchicalPath
    int own = 0;
    int subtree = 0;
    int memoryBits = 0;
};

struct RegCountResult {
    std::vector<RegCount> counts;  // pre-order over the elaborated hierarchy
    int total = 0;                 // sum of top-instance subtree = whole-design flop count
};

// ---- Clock / Reset structure (DFT planning: OCC + reset-mux insertion points) --------------
// One flop-group's clock (or reset) path, walked from the flop's pin back to its source.
// Value calculus (per DFT spec): everything defaults to X; an unconstrained top-level input is
// Z at the port and analyzed as X inside; only an SDC-defined clock point carries "010"
// (01 = leading edge, 10 = trailing edge); an inverter turns 010 into 101; set_case_analysis
// pins carry their constant. Any gate/cell the walk cannot see through yields X.
struct CrPathItem {
    std::string kind;        // "clock" | "reset"
    std::string ownerInstanceId;  // the flop's enclosing instance
    std::string net;         // the net at the flop pin
    std::string edge;        // clock: posedge/negedge of the event; reset: its active edge
    std::vector<std::string> path;   // "inst:net" hops, flop -> source
    std::vector<std::string> elems;  // symbols passed: "buf@inst:net" | "inv@inst:net"
    std::string terminus;    // "pi" | "logic" | "instance" | "undriven" | "sequential" | "blackbox"
    std::string detail;      // pi: "top.port"; logic: "assign"/"always"; instance: hier path
    /// sequential terminus only: WHERE the driving always block lives — lets the UI turn the
    /// terminus box into a real logic node (Show HDL / decompose / continue tracing).
    std::string terminusFile;
    int terminusLine = 0;
    std::string clockName;   // SDC clock covering this path ("" when unconstrained)
    std::string rootValue;   // value AT THE SOURCE: 010 | 0 | 1 | Z | X
    std::string value;       // value AT THE FLOP PIN after propagation: 010 | 101 | 0 | 1 | X
    std::string inactive;    // reset only: required inactive value "0" | "1"
    bool set = false;        // reset only: the async branch LOADS ones — a SET pin
    /// Odd number of inversions between the flop pin and the source. A value forced AT THE
    /// SOURCE arrives at the flop flipped when this is set — which is the difference between a
    /// reset being held inactive and being held asserted.
    bool inverted = false;
    bool ok = false;         // reset only: value == inactive
    /// Reset only: this group passes ONLY because a PLANNED control mux patches it. The plan is
    /// not the netlist, and a report that cannot tell them apart says the design is fixed when
    /// nothing has been inserted yet.
    bool plannedFix = false;
    /// The target of the planned mux that decided this group's value (nearest to the flop).
    /// Set even when the result FAILS — a mux driving a reset to its ACTIVE value is a plan
    /// bug, and naming the culprit is what lets the fixer propose deleting exactly it.
    std::string plannedMuxTarget;
    int flopCount = 0;       // flops sharing this exact (owner, net, kind) path
    std::string file;        // representative flop location
    int line = 0;

    // ---- SCAN-MODE dimension (only filled when ScanModeInput is supplied) ----
    // The same path re-walked with the DFT signals forced (scan_enable=1, …). A scan chain only
    // shifts if EVERY flop's clock is controllable from an OCC, so this is what says whether the
    // declared OCC set is actually sufficient.
    bool scanChecked = false;
    std::string scanValue;   // value at the flop clock pin IN SCAN MODE
    std::string scanTerminus;
    std::string scanDetail;
    /// The scan-mode path passes through one of the user's declared OCC definition points.
    bool scanOcc = false;
    /// The OCC point it reached ("" when none) — what the user needs to see when it is wrong.
    std::string scanOccPoint;
};

/// User-declared DFT state for the scan-mode dimension. OCC points are USER-decided (recorded
/// via dp_shell `add_occ_point`); nothing here is inferred.
struct ScanModeInput {
    /// Hierarchical pins ('/' or '.' separated) the user declared as OCC definition points.
    std::vector<std::string> occPoints;
    /// DFT signals forced during scan, e.g. {"scan_enable", true}. Applied ON TOP of the SDC
    /// case analysis, so a functional constraint that contradicts test mode is overridden.
    std::vector<std::pair<std::string, bool>> forces;
    bool empty() const { return occPoints.empty() && forces.empty(); }
};

/// One row of the hierarchical summary: everything below a direct child of the queried scope,
/// rolled up. This is what a large chip's top level shows — a handful of rows instead of the
/// hundreds of thousands of groups a flat query would materialise.
struct CrScopeSummary {
    std::string instanceId;   // the child scope
    int groups = 0;           // clock/reset groups anywhere beneath it
    long long flopBits = 0;   // register bits beneath it
    int violations = 0;       // groups that fail their rule (clock not 010/101, reset not inactive)
    bool hasChildren = false; // worth drilling into
};

struct SdcClockInfo {
    std::string name;
    std::vector<std::string> targets;
    double period = 0.0;              // resolved (master-clock/-divide_by/-multiply_by/-edges/
                                       // -combinational math already applied), not just -period
    bool generated = false;
    std::string masterClock;          // as given, or as inferred; "" if neither
    bool masterInferred = false;
    double frequencyMhz = 0.0;        // 0 = undefined (period unresolved, or exactly 0)
    std::string file;                 // the SDC file the create_clock/-generated_clock line is in
    int line = 0;                     // 1-based line of that command
};

struct ClockResetTreeResult {
    std::vector<CrPathItem> items;
    std::vector<SdcClockInfo> clocks;   // parsed SDC clock points (echoed for the UI header)
    std::vector<std::string> sdcErrors;
    /// Roll-up per direct child of the queried scope (filled when CrQuery::summary is set).
    std::vector<CrScopeSummary> scopes;
    int totalGroups = 0;                // groups under the scope BEFORE any summary collapsing
    long long totalFlopBits = 0;
};

/// How much of the design to analyse, and how much detail to return. A flat full-chip query
/// materialises one path per register group; on a large SoC that is hundreds of thousands of
/// string vectors and hundreds of MB of JSON, which is the real scaling wall (measured: 64
/// cores -> 151040 path hops, 22 MB). Scoping the walk makes the cost proportional to what the
/// user is LOOKING AT, not to the chip.
struct CrQuery {
    /// Analyse only registers under this instance ("" = the whole harden top).
    std::string scope;
    /// Return the per-child roll-up and DROP the per-group paths/elements. The values are still
    /// computed (they decide the violation counts) — only the bulky detail is left out.
    bool summary = false;
    /// User pin constraints (dp_shell add_pin_constraint): (pin-or-port, 0|1) applied on top of
    /// the FUNCTIONAL set_case_analysis; the scan pass copies the functional index, so it
    /// inherits them too.
    std::vector<std::pair<std::string, int>> pinConstraints;
    /// PLANNED control muxes that make a net controllable in test (dp_shell add_dft_ctrl_mux).
    /// The analysis has to be able to answer "will this plan fix the DRC", not only "is the
    /// netlist broken today" — otherwise the fix cannot be checked until after it is inserted,
    /// which is the wrong end of the flow. `value` is what the net becomes in test mode; the
    /// caller resolves it (select held active, override source held at 0/1), because whether a
    /// mux is effective is a question about the DFT plan, not about the netlist.
    struct PlannedMux {
        std::string target;   // net or sink pin the mux is planned on
        std::string value;    // "0" | "1" — the value the override source is held at
    };
    std::vector<PlannedMux> plannedMuxes;
};

// ---- Wrapper-cell estimation (pre-insertion EDT sizing) ------------------------------------
// What a scan-insertion tool decides per core boundary port bit, computed BEFORE insertion:
// how many wrapper cells the core needs, and how many of those REUSE an existing functional flop
// (shared) versus have to be ADDED (dedicated).
//
// Why it has to be an estimate: EDT is configured one flow step before wrapper analysis runs, and
// the EXTEST EDT is sized by exactly this number — its chains hold nothing but wrapper cells. Its
// channel count is otherwise a guess that only the scan-insertion run can confirm.
//
// The rule is a BOUNDED cone count, which is what the real analysis does:
//   input  port bit -> forward combinational cone  -> flop D bits it reaches
//   output port bit -> backward combinational cone -> flop Q bits that drive it
// at most `*FlopThreshold` flops -> they become shared wrapper cells; more than that, or a cone
// deeper than `levelsThreshold`, -> the port needs a dedicated cell.
struct WrapperOptions {
    int inputFanoutFlopThreshold = 4;
    int outputFaninFlopThreshold = 4;
    /// Separate ceiling on the INTERNAL-FEEDBACK cells (see WrapperPortCell::flopsFeedback).
    int feedbackFlopThreshold = 4;
    int levelsThreshold = 32;
    /// An output with no driver still needs a cell to hold a safe value during EXTEST.
    bool registerUndrivenOutput = true;
    /// A port whose cone ends in a blackbox (memory, analog, encrypted IP) normally gets none.
    bool registerPortsReachingBlackboxes = false;
    /// Glob patterns over leaf port names that never get a wrapper cell. Clocks and resets that
    /// reach a flop's clock/reset pin are recognised by the walk itself; this list is for the
    /// ones only the user knows — scan_enable, test_mode, and other DFT signals.
    std::vector<std::string> excludePorts;
    /// Ports the user declares to be clocks. A clock never carries a wrapper cell — inserting one
    /// would put a flop in the clock path. The walk also infers clocks (a port that reaches a
    /// flop's clock pin), but only the user knows about a clock that never reaches one in RTL,
    /// or one that reaches a data pin as well and would otherwise look like data.
    std::vector<std::string> clockPorts;
    /// Infer clocks as above. Off only for the rare block where a genuine data port drives a
    /// clock pin through a mux and must still be wrapped.
    bool inferClockPorts = true;
    /// A port that runs from a core input to a core output with no sequential element between
    /// them. The cell would sit in the middle of a pass-through path, and both ends are already
    /// controlled and observed from the boundary either side of it.
    bool skipFeedthroughPorts = true;
    /// Per-port user overrides, the counterpart of `set_dedicated_wrapper_cell_options on|off`.
    /// Force a dedicated cell where the analysis would have shared or skipped …
    std::vector<std::string> forceDedicatedPorts;
    /// … or force sharing even where the thresholds say dedicated. Neither can conjure a cell out
    /// of nothing: a forced share with no flop in the cone falls back to dedicated and says so.
    std::vector<std::string> forceSharedPorts;
    /// Progress sink. The analysis is the kind of run a user starts and then goes back to doing
    /// something else, so it narrates itself instead of going quiet: options, boundary size, a
    /// line every few percent, and the summary. Left empty, nothing is emitted and nothing is
    /// spent formatting it. The caller decides where the lines go (a log file, a UI pane, both).
    std::function<void(const std::string& line)> log;
    /// Also log one line per port bit. Big boundaries make that a large file, so it is opt-in.
    bool logEveryPort = false;
};

/// One boundary port BIT and the wrapper cell it would get.
/// One flop the cone reached, and enough to navigate to it: the report label the user reads and
/// the instance path a schematic can be seeded from.
struct WrapperCandidate {
    std::string label;     // core-relative, as the report prints it: "GPIO_1/sync_cell/q[0]"
    std::string instance;  // full hierarchical path of the flop's INSTANCE, for a schematic seed
};

/// A cone can reach thousands of flops on a wide bus; the list exists to be read, so it is cut
/// well before that. `WrapperPortCell::flops` still carries the real total.
inline constexpr int kWrapMaxCandidates = 32;

struct WrapperPortCell {
    std::string port;      // "p1_din"
    std::string name;      // "p1_din[0]" — the report key
    int bit = 0;           // 0 for a scalar port
    std::string dir;       // "in" | "out" | "inout"
    std::string decision;  // "shared" | "dedicated" | "none"
    int flops = 0;         // flops identified in the cone (0 unless shared)
    /// Of `flops`, how many sit on a SEQUENTIAL LOOP inside the cone — their own output can come
    /// back round to a flop the same port reaches. One wrapper cell cannot set such a flop in a
    /// single shift, so they are counted against their own threshold. (This is our definition;
    /// a vendor tool reports the same split but does not publish its exact rule.)
    int flopsFeedback = 0;
    std::string cell;      // representative shared flop ("GPIO_1/p1_out[0]"), "" otherwise
    /// Clock net of `cell` — the column the vendor report prints beside the wrapper cell name.
    std::string clock;
    std::string reason;    // why it is not shared ("" when it is)
    /// Deepest combinational level the cone reached. The single most explanatory number behind a
    /// decision, and what Tessent's report calls "Max Logic Level".
    int levels = 0;
    /// EVERY flop the cone found, not just the representative one in `cell`. A decision without
    /// its candidates cannot be checked: "shared on data_sync[0]" says what was picked and
    /// nothing about what else was there, or how close the port came to the threshold.
    /// Capped — see kWrapMaxCandidates — with `flops` carrying the true total.
    std::vector<WrapperCandidate> candidates;
};

/// ---- the cone as a CIRCUIT, for one port bit -------------------------------------------------
/// The estimate answers "shared or dedicated"; this answers "along which path". Same walk, same
/// thresholds — the difference is only that the route is kept instead of discarded, which is why
/// it is a separate call: keeping it for all 4000 bits of a boundary would cost real memory.
struct WrapperConeNode {
    std::string id;        // "<instPath>|<net>|<bit>" — stable, and unique across the design
    /// "port" (the boundary) | "net" (a wire) | "gate" (what drives the next wire) | "flop".
    /// A picture of only the wires is a list of names joined by lines; the gates are the circuit.
    std::string kind;
    /// gate nodes: "and"|"or"|"xor"|"inv"|"mux"|"buf"|"latch"|"logic" — which symbol to draw.
    std::string elem;
    /// gate nodes: the statement it came from ("assign", "always_comb", …), for the tooltip.
    std::string detail;
    /// flop nodes: the net on its clock pin. A wrapper cell whose clock is unknown cannot be
    /// checked against the OCC plan, which is why the vendor report carries a Clock column too.
    std::string clock;
    std::string label;     // "p1_din[0]", "data_sync[0]"
    std::string instance;  // hierarchical path of the instance the net lives in
    std::string scope;     // instance path RELATIVE to the core, for grouping in the diagram
    int level = 0;         // hops from the port: the column the node belongs in
    std::string file;
    int line = 0;
};

struct WrapperConeEdge {
    std::string from, to;
};

struct WrapperCone {
    std::string core, port, name, dir, decision, reason;
    /// The flop the decision actually settled on ("" when none). The picture exists to explain
    /// a verdict, and "shared" is only half a verdict without saying shared ON WHAT.
    std::string cell;
    int bit = 0;
    std::vector<WrapperConeNode> nodes;
    std::vector<WrapperConeEdge> edges;
    bool truncated = false;   // the cone was larger than kWrapConeMaxNodes
};

/// A diagram nobody can read is not a diagram. Cones wider than this are cut, and say so.
inline constexpr int kWrapConeMaxNodes = 400;

struct WrapperEstimate {
    std::vector<WrapperPortCell> cells;     // one row per port bit, in port declaration order
    int inputBits = 0, outputBits = 0;      // boundary port bits analysed
    int sharedIn = 0, sharedOut = 0;        // wrapper cells that reuse an existing flop
    int dedicatedIn = 0, dedicatedOut = 0;  // wrapper cells the tool has to ADD
    int noneIn = 0, noneOut = 0;            // port bits that get no wrapper cell
    std::string core;                       // instance the estimate was run on
    long long coneNodes = 0;                // net bits visited across every cone (diagnostic)
    double analysisMs = 0;                  // wall clock of the analysis itself

    int wrapperIn() const { return sharedIn + dedicatedIn; }
    int wrapperOut() const { return sharedOut + dedicatedOut; }
    int wrapperCells() const { return wrapperIn() + wrapperOut(); }
    /// Scan cells ADDED to the design — shared cells are already flops, dedicated ones are new.
    int addedScanCells() const { return dedicatedIn + dedicatedOut; }
};

// ---- Design object query (tree search box + dp_shell get_* commands) -----------------------
// One matched design object. `id` is what the UI navigates/copies with.
struct FoundObject {
    std::string kind;    // "instance" | "module" | "port" | "pin" | "net"
    std::string id;      // instance/pin/net: hierarchical path; module: defId
    std::string name;    // leaf name (what matched)
    std::string design;  // module name (instances/pins) — "" for modules themselves
    std::string parent;  // owning instance path ("" at top)
    std::string dir;     // ports/pins: in|out|inout
};

struct FindResult {
    std::vector<FoundObject> objects;
    int scanned = 0;      // instances visited (diagnostic)
    bool truncated = false;  // hit `limit`
};

/// Every name an SDC file could legally refer to, harvested in one walk. This is what turns the
/// SDC checker's "does get_ports clk_25m actually match anything?" from a guess into an answer.
/// `truncated` matters: on a partial list the checker must NOT claim a pattern matches nothing.
struct SdcObjectSet {
    std::vector<std::string> ports;    // top-level primary I/O (leaf names)
    std::vector<std::string> inputs;   // top-level inputs  -> all_inputs
    std::vector<std::string> outputs;  // top-level outputs -> all_outputs
    std::vector<std::string> pins;     // hierarchical instance pins, '.'-separated
    std::vector<std::string> nets;     // hierarchical nets, '.'-separated
    std::vector<std::string> cells;    // hierarchical instance paths
    int scanned = 0;
    bool truncated = false;
};

// Result of reverse-tracing a clock/reset net up the hierarchy toward a primary input.
struct NetSourceResult {
    std::string terminus;  // "pi" | "undriven" | "logic" | "instance"
    std::string detail;    // pi: "top.port"; logic: "assign"/"always_ff"; instance: child hierPath
    std::vector<std::string> path;  // ["inst:net", ...] from the flop's net up to the terminus
};

struct ReadyInfo {
    std::vector<Meta> candidateTops;  // ranked, with subtreeSize
    int defCount = 0;
};

struct DiagnosticsResult {
    int errorCount = 0;
    int totalDiagnostics = 0;
    bool truncated = false;
    std::string text;                       // formatted file:line messages (capped)
    std::vector<std::string> missingFiles;  // filelist paths that didn't exist (tolerated)
    std::vector<std::string> libraryFiles;  // files pulled in through the -y search path
    std::vector<std::string> missingLibDirs;  // -y dirs that don't exist (searched nothing)
};

// Stateful design database: holds the elaborated Compilation alive, registers candidate
// tops + definitions eagerly, lazily registers expanded children. Ports the Python daemon.
class DesignDb {
public:
    explicit DesignDb(std::unique_ptr<hdl::frontend::Design> design);
    ~DesignDb();

    ReadyInfo ready() const;
    DiagnosticsResult getDiagnostics() const;
    std::pair<std::vector<std::string>, int> ping() const;  // (candidate top ids, defCount)

    // throws std::out_of_range("unknown nodeId ...") if not registered
    ExpandResult expandChildren(const std::string& nodeId);
    PortsResult getPortsByDef(const std::string& defId);
    PortsResult getPortsByNode(const std::string& nodeId);
    ParamsResult getParametersByDef(const std::string& defId);
    ParamsResult getParametersByNode(const std::string& nodeId);
    SourceLoc getSourceLocation(const std::string& kind, const std::string& id);
    // wantDriver=true -> trace-fanin (drivers); false -> trace-fanout (loads)
    TraceResult trace(const std::string& nodeId, const std::string& port, bool wantDriver);
    // behavioral fanin (input port / assign / always) via AnalysisManager
    DriversResult traceDrivers(const std::string& nodeId, const std::string& port);
    // one inward step: boundary port -> internal net (port.internalSymbol) -> child
    // instance pins on it; out pin without a structural driver falls back to behavioral
    // sources (spec §2.1/§2.2). Leaf/blackbox/unknown port -> all-empty result.
    TraceIntoResult traceInto(const std::string& nodeId, const std::string& port);
    // Trace THROUGH a behavioral block: given a "logic:<file>:<line>" source id previously
    // emitted by traceInto/traceDrivers (an always/assign block), return the block's input
    // signals' drivers (its behavioral fan-in) as sources — so the logic node is expandable.
    // Covers port + behavioral(always/assign) drivers; structural (child-instance-output)
    // inputs are not resolved here (that is the port-connection scan's job).
    DriversResult traceLogic(const std::string& logicId);
    // Behavioral drivers of an arbitrary INTERNAL NET of `instanceId` (ports and always/assign
    // blocks) — lets a net tap in the schematic keep tracing backward. Unknown net -> empty.
    DriversResult traceNet(const std::string& instanceId, const std::string& netName);
    /// ALL loads of an internal net: child-instance input pins, behavioral readers, blackbox
    /// pins, and the boundary output port it leaves through — the forward counterpart of
    /// traceNet, so fanout can continue past a logic node instead of dead-ending.
    DriversResult traceNetLoads(const std::string& instanceId, const std::string& netName);
    // P2: decompose a behavioral block ("logic:<file>:<line>", as emitted by traceInto/
    // traceDrivers) into RTL primitives — expressions become gate/arith/cmp/mux cells; an
    // edge-triggered block wraps each driven variable's next-state cone in a DFF (with async
    // reset when the leading `if` tests a reset edge signal). Unknown logicId -> empty result.
    DecomposeResult decomposeLogic(const std::string& logicId);
    // L3: one level's local netlist (nets + port->net bindings)
    LocalNetlist getNetlist(const std::string& ownerInstanceId);
    // L4: every edge-triggered procedural block (flop) under the real roots, with its
    // clock/async-reset nets + edges + source location. Raw material for DFT-DRC.
    /// Cached: computed once per session (walks the whole elaboration). Reference, not a copy.
    const std::vector<SeqElement>& getSequential();
    // L4b: per-instance register (flop bit) count over the elaborated hierarchy.
    // Sums the declared bit-width of every variable driven by an edge-triggered block;
    // dedup per instance; unpacked arrays (RAM) go to memoryBits (excluded from own).
    RegCountResult getRegisterCounts();
    // DFT-DRC reverse reachability: trace a net inside `instanceId`'s body up through port
    // boundaries until a primary input ("pi"), an internal logic/instance driver, or a
    // dead end ("undriven"). Pure structural walk (no buffer-following — that's drc-core's job).
    NetSourceResult traceNetToSource(const std::string& instanceId, const std::string& netName);
    // Clock/Reset structure for DFT planning: every flop's clock and async-reset path walked to
    // its source (seeing through buffers/inverters), annotated with the X/Z/010 value calculus
    // driven by the SDC's create_clock / set_case_analysis. sdcFile may be "" (no constraints:
    // everything is X/Z — still useful to see the structure).
    // `dftLibSetting` = path to dft_lib_setting.yaml. With it the walk CONTINUES THROUGH clock
    // cells (ICG / buffer / inverter / shaper) by following the pin the cell library declares as
    // `clock_in`, so the result is a real multi-stage clock tree instead of stopping at the first
    // cell. Empty -> cells terminate the walk (previous behaviour).
    // `scan` (optional) adds the SCAN-MODE dimension: the same paths are re-walked with the DFT
    // signals forced, and each group reports whether its clock then reaches one of the declared
    // OCC definition points. That is the check that says a scan chain will actually shift.
    /// Behavioral LOADS of an output pin: the statements at the parent level that READ the
    /// connected net (`assign x = ~this_net`, always blocks) — the fanout counterpart of
    /// traceDrivers. A top instance's output reports itself as the primary output.
    DriversResult traceLoads(const std::string& nodeId, const std::string& port);
    ClockResetTreeResult clockResetTree(const std::string& sdcFile,
                                        const std::string& dftLibSetting = "",
                                        const ScanModeInput& scan = {},
                                        const CrQuery& q = {});
    // Glob search over the ELABORATED design (the tree is lazily loaded, so the UI cannot do
    // this itself). `kinds` is a comma list of instance/module/port/pin/net ("" = all).
    // Patterns use * ? [ ]; a pattern without '.' matches leaf names, one with '.' matches the
    // full hierarchical path. Also backs dp_shell's get_cells / get_ports / get_pins / get_nets.
    FindResult findObjects(const std::string& pattern, const std::string& kinds, int limit);
    /// Evaluate one net / output port of top instance `topModule` under BARE-PORT constraints
    /// (name -> 0/1); every other signal is X. Returns "0" / "1" / "X". This is the whole value
    /// model the DFT plan runs on: nothing unconstrained may pretend to a value — a signal
    /// nobody drives is X, and X at a reset is a violation, not a maybe.
    /// `stuckAt` (optional): when the answer is X, receives the first symbol the calculus had
    /// no driver for — a register output or an undriven net; the point to declare or fix.
    /// One continuous assign of a top module, classified for drawing: "buf" (pure alias),
    /// "inv" (~/!), or "expr" (anything else; `ins` = the named nets the RHS reads). The IP
    /// cone needs these because gate-level libraries still stitch their cells together with
    /// assigns — without them the driver chain of an output port breaks at the first alias.
    struct ModAssign {
        std::string lhs;
        std::string kind;   // buf | inv | expr
        std::vector<std::string> ins;
        /// kind=="expr" only: the RHS lowered to RTL primitives by the SAME slang decomposer
        /// "Show RTL Primitives" uses — a `sel ? a : b` is a MUX with s/a/b, not a blind box.
        std::vector<LogicCell> cells;
    };
    std::vector<ModAssign> moduleAssigns(const std::string& topModule);

    /// MemoryBIST planning input: the membistlib templates (*.tcd_memory) matched against the
    /// design's BLACKBOX instances (UninstantiatedDef — a memory macro's source is never in
    /// the filelist, which is also why the ordinary instance index cannot see them).
    struct MemPort {
        std::string name;       // "D[15:0]"
        std::string function;   // Clock | WriteEnable | Data | Address | ChipEnable | …
        std::string direction;  // Input | Output | ""
        std::string polarity;   // ActiveHigh | ActiveLow | ""
    };
    struct MemTemplate {
        std::string name;        // template / CellName
        std::string file;        // the .tcd_memory file
        std::string type;        // SRAM | ROM | …
        std::string algorithm;   // SMarchCHKBCil | …
        std::string words;       // NumberOfWords
        std::string ports;       // logicalPorts ("1rw")
        /// MilliWattsPerMegaHertz — the ONLY power figure the flow's per-step power budget
        /// uses (memory only: it excludes the controller and surrounding functional logic).
        std::string milliWattsPerMhz;
        std::string operationSet;   // OperationSet (SCR2)
        std::string dataOutStage;   // DataOutStage (SCR9)
        std::string transparentMode;
        int bitGrouping = 0;        // BitGrouping / bit slice (SCR7); 0 = unspecified
        /// LogicalAddressMap widths (SCR4 / dimension compatibility): "RowAddress[8:0]" -> 9.
        int rowAddrBits = 0, colAddrBits = 0, bankAddrBits = 0;
        std::vector<MemPort> pins;
        /// The memory's VERILOG MODEL (`<CellName>.v` beside the templates), when present.
        /// slang parses it, so `hdlPorts` carries the model's OWN port declaration —
        /// names/directions/widths as written, the authoritative pin list for the blackbox.
        std::string verilogModel;
        std::vector<PortDict> hdlPorts;
    };
    struct MemInstance {
        std::string path;        // hierarchical instance path
        std::string module;      // definition name (blackbox)
        int matched = -1;        // index into templates, -1 = no template of this name
        /// PLACEMENT from a DEF (COMPONENTS … + PLACED/FIXED ( x y ) N): micron coordinates
        /// (DEF units divided by UNITS DISTANCE MICRONS). placed=false when no DEF was read
        /// or the instance is absent from it.
        bool placed = false;
        double x = 0, y = 0;
        std::string orient;
        /// MBIST controller group this memory was assigned to (-1 = not grouped yet).
        int group = -1;
    };
    struct MemoryMapResult {
        std::vector<MemTemplate> templates;
        std::vector<MemInstance> instances;   // matched memories first, then other blackboxes
        std::vector<std::string> errors;
        /// Groups produced by groupMemories(): each is the controller's member index list plus
        /// its bounding box / centroid, so the GUI can draw and the report can explain them.
        struct MemGroup {
            std::vector<int> members;         // indices into `instances`
            double cx = 0, cy = 0;            // centroid (micron)
            double x0 = 0, y0 = 0, x1 = 0, y1 = 0;  // bounding box
        };
        std::vector<MemGroup> groups;
        std::string defFile;                  // the DEF that supplied the placement ("" = none)
        int placedCount = 0;
        /// DIEAREA from the DEF (micron) and its diagonal — the physical clustering threshold
        /// is a PERCENTAGE of this diagonal, so it is reported with the groups.
        double dieX0 = 0, dieY0 = 0, dieX1 = 0, dieY1 = 0, dieDiagonal = 0;
    };
    /// Parse every *.tcd_memory under `libDir` and match CellName against the design's
    /// blackbox instances. Blackboxes with no template stay listed (candidates to cover).
    /// `defFile` (optional) adds physical placement from a DEF's COMPONENTS section.
    MemoryMapResult memoryMap(const std::string& libDir, const std::string& defFile = "");
    /// One MemoryBIST plan: which controller tests which memories, in which steps, and what
    /// that costs. Built from what the RTL + memory library ALWAYS provide — memory type,
    /// algorithm, dimensions, and the CLOCK each memory's clock pin actually resolves to.
    /// A DEF/UPF only REFINES the partition (extra split keys); they are never required.
    struct MbistMemory {
        std::string path;          // hierarchical instance path
        std::string module;        // cell name
        std::string type;          // SRAM | ROM | …
        std::string algorithm;     // from the tcd_memory template
        std::string operationSet;
        std::string clockPin;      // the template pin whose Function is Clock
        std::string clockNet;      // net at that pin
        std::string clockDomain;   // the clock ROOT the net resolves to — the partition key
        double periodNs = 0;       // clock period (from -period, else the default)
        long long words = 0;
        int width = 0;             // data width from the model's widest data port
        double mwPerMhz = 0;       // MilliWattsPerMegaHertz from the template
        double powerMw = 0;        // mwPerMhz * frequency
        long long cycles = 0;      // algorithm cycles for this memory's depth
        int controller = -1;
        int step = -1;
        std::string interfaceId;   // m1, m2, … within the controller
        bool placed = false;
        double x = 0, y = 0;
        // --- the attributes the compatibility rules actually compare ---
        std::string dataOutStage;      // SCR9
        int bitGrouping = 0;           // SCR7
        int rowAddrBits = 0, colAddrBits = 0, bankAddrBits = 0;   // SCR4 / CCR2
        std::string powerDomain;       // CCR3 (from UPF/CPF or set_memory_instance_options)
        std::string physicalCluster;   // CCR3 (DEF clustering / -physical_cluster_override)
        std::string partitioningGroup; // CCR4 (user-forced split)
        std::string forcedController;  // -controller <name>: user put it here explicitly
        int forcedStep = -1;           // -step <n>
    };
    struct MbistStep {
        int controller = -1;
        int index = 0;                     // step number within the controller
        std::vector<int> members;          // indices into MbistPlan::memories
        double powerMw = 0;                // memories tested in parallel add up
        long long cycles = 0;              // the slowest memory in the step
        double runtimeNs = 0;
        std::string comparator = "per_interface";
        /// WHY this step exists: the SCR that stopped its first memory from joining an
        /// existing step ("" for the controller's first step).
        std::string ruleId, ruleWhy;
    };
    struct MbistController {
        std::string name;                  // <top>_mbist_c<N>
        std::string clockDomain;
        double periodNs = 0;
        std::string type;                  // the one memory type it tests (CCR1)
        std::vector<int> steps;            // indices into MbistPlan::steps
        std::vector<int> memories;
        double powerMw = 0;                // peak = worst step
        long long cycles = 0;              // steps run in sequence -> sum
        double runtimeNs = 0;
        int flops = 0;                     // rough controller register estimate
        std::string physicalCluster;       // "" unless a DEF split it
        std::string powerDomain;
        std::string partitioningGroup;
        /// WHY this controller exists: the CCR that separated it from the previous one.
        std::string ruleId, ruleWhy;
        /// true when the USER assigned these memories here (set_memory_instance_options
        /// -controller). Rule violations are then reported, never silently "fixed".
        bool userDefined = false;
        std::vector<std::string> violations;   // CCR breaches inside a user-defined controller
    };
    /// One compatibility rule and what it did to THIS design.
    struct MbistRuleHit {
        std::string id;        // CCR1 … CCR4, SCR1 … SCR11
        std::string title;     // what the rule requires
        int splits = 0;        // how many controllers/steps this rule caused here
        bool applies = false;  // false when the design has nothing the rule can act on
    };
    struct MbistPlan {
        std::vector<MbistMemory> memories;
        std::vector<MbistStep> steps;
        std::vector<MbistController> controllers;
        std::vector<MbistRuleHit> rules;   // the CCR/SCR ledger for this partition
        std::vector<std::string> notes;    // why the partition came out this way
        std::vector<std::string> errors;
        double totalRuntimeNs = 0;         // controllers run concurrently -> the slowest one
        double peakPowerMw = 0;
    };
    /// Budgets and knobs. Defaults mirror the insertion flow's own defaults.
    struct MbistPlanOptions {
        std::string libDir;                 // membistlib ("" = the cached one)
        std::string defFile;                // OPTIONAL placement
        double clusterSizeRatio = -1;       // <0 = do not split by placement
        double defaultPeriodNs = 10;        // when no SDC/-period is known
        double maxPowerPerStepMw = 500;     // flow default
        int maxMemoriesPerStep = 0;         // 0 = unlimited (flow default)
        int maxStepsPerController = 0;      // 0 = unlimited (flow default)
        double maxTestTimePerControllerMs = 500;  // flow default
        /// Clock period per clock-root name, e.g. {"dco_clk", 10.0} — from add_clock/SDC.
        std::vector<std::pair<std::string, double>> clockPeriods;
        /// Per-instance overrides (set_memory_instance_options). Path may be a glob.
        struct InstanceOption {
            std::string pattern;
            std::string partitioningGroup;    // CCR4
            std::string physicalCluster;      // CCR3 (-physical_cluster_override)
            std::string powerDomain;          // CCR3 (stands in for UPF/CPF)
            std::string clockDomain;          // CCR3 (-test_clock_override)
            bool exclude = false;             // -use_in_memory_bist_dft_specification off
            /// DIRECT controller assignment ("put these memories on this controller"). The
            /// rules still run: the plan reports any CCR the forced grouping breaks instead of
            /// silently emitting a controller that cannot be built (e.g. two clock domains).
            std::string controller;
            int stepIndex = -1;               // optional: force the step within that controller
        };
        std::vector<InstanceOption> instanceOptions;
    };
    MbistPlan mbistPlan(const MbistPlanOptions& opt);
    /// Session-wide memory instance options (dp_shell `set_memory_instance_options`). Held on
    /// the design so the CONSOLE and the GUI plan the same partition — a plan that depended on
    /// which entry point asked would be two different answers to one question.
    void setMemoryInstanceOptions(std::vector<MbistPlanOptions::InstanceOption> opts);
    const std::vector<MbistPlanOptions::InstanceOption>& memoryInstanceOptions() const;
    /// The clock ROOT `netName` (inside `scopeId`) resolves to: descends into driving
    /// instances, crosses up through input ports and sees through alias assigns. This is what
    /// makes the MBIST clock-domain partition derivable from RTL alone — no SDC required.
    std::string clockRootOf(const std::string& scopeId, const std::string& netName);

    /// Cluster PLACED memories into MemoryBIST controller candidates the way the flow does:
    /// memories of different TYPE never share a controller, and within a type they agglomerate
    /// while the cluster's bounding-box DIAGONAL stays within `clusterSizeRatio` percent of the
    /// die diagonal (the `set_memory_instance_options -physical_cluster_size_ratio` model;
    /// 0 = one controller per memory, 100 = one cluster). `maxPerGroup` > 0 additionally caps
    /// a group's size. Fills `res.groups` and each instance's `group`.
    static void groupMemories(MemoryMapResult& res, double clusterSizeRatio,
                              int maxPerGroup = 0);

    std::string evalNet(const std::string& topModule, const std::string& net,
                        const std::vector<std::pair<std::string, int>>& ports,
                        std::string* stuckAt = nullptr);
    /// Names of the elaborated top instances. Hierarchical paths in this flow are TOP-RELATIVE
    /// (Tessent convention: `PROCESSOR_1/clock_module_0`, not `processor_core/PROCESSOR_1/...`),
    /// so callers need to know which prefix is the implicit one.
    std::vector<std::string> topNames();
    /// Full-hierarchy inventory of ports/pins/nets/cells for the SDC checker's design-aware
    /// layer. Unlike findObjects this matches nothing — it enumerates — so the checker can
    /// resolve constraint patterns itself. `limit` caps the total; hitting it sets `truncated`.
    SdcObjectSet sdcObjects(int limit = 200000);
    // Wrapper-cell estimate for the boundary of `coreInstanceId` ("" = the largest candidate
    // top). Pure structural analysis of the elaborated RTL — nothing is inserted or modified.
    WrapperEstimate wrapperCells(const std::string& coreInstanceId = "",
                                 const WrapperOptions& opt = {});
    /// The traced cone behind ONE port bit, as a graph that can be drawn. Runs the same walk with
    /// the same options, so the picture is of the decision that was actually made and not of a
    /// second, differently-configured analysis.
    WrapperCone wrapperCone(const std::string& coreInstanceId, const std::string& port, int bit,
                            const WrapperOptions& opt = {});

private:
    // Lazily register an instance path: expand every ancestor prefix (and optionally
    // the node itself, so its children register too). Already-registered nodes are skipped.
    void ensureRegistered(const std::string& id, bool expandSelf);

    // shared tail of traceDrivers/traceInto: AnalysisManager-resolved behavioral drivers
    // of `vs`, appended to `out` (deduped by id). scopeId scopes the "port:" source id.
    void collectBehavioralSources(const slang::ast::ValueSymbol& vs, const std::string& scopeId,
                                  bool bus, std::vector<DriverSourceInfo>& out);

    struct Impl;
    std::unique_ptr<Impl> p_;
};

}  // namespace hdl::service
