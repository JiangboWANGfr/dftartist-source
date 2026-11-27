// Read-only domain model (DesignHierarchy.md §1-4) + the daemon/IPC contract types.
// Pure types + the runtime cache shapes — no React, no window, zero runtime deps.
export type Direction = "in" | "out" | "inout";
export interface PortInfo {
  name: string;
  direction: Direction;
  width: number;
  busLabel: string;
 // pre-rendered "mix_mag[2:0]" (scalar -> bare name)
  type?: string;
    // declared HDL type ("logic", "wire [7:0]", …); present in get-ports
}
/** Tree-node metadata the daemon returns for one instance. */
export interface NodeMeta {
  id: string;
 // = hierarchicalPath (stable id, DesignHierarchy.md §2.1)
  instanceName: string;
  kind: "module" | "primitive" | "blackbox";
  definitionId: string;
 // = `${designName}|${absFilePath}`
  isLeaf: boolean;
}
export interface ExpandResult {
 childInstanceIds: string[];
 children: NodeMeta[];
 }
/** A top candidate: node meta + its (capped) subtree size, for the multi-top selector. */
export interface CandidateTop extends NodeMeta {
 subtreeSize: number;
 }
export interface ReadyResult {
 candidateTops: CandidateTop[];
 defCount: number;
 }
export interface SourceLocation {
 file: string;
 line: number;
 }
/** get-ports result: ports (per the queried instance/def) + sparse per-instance width overrides. */
export interface PortsResult {
 ports: PortInfo[];
 portWidthOverrides: Record<string, number>;
 }
/** A right-hand work-surface tab. Carries only object context/ids, never copied slang * data (architecture doc §3). id is the dedupe key. */
export type HdlTab = {
  id: string;
            // = `${file}:${line}`
  kind: "hdl";
  title: string;
  file: string;
  line: number;
  which: "definition" | "instantiation";
  objectId: string;
};
export type SchematicTabSpec = {
  id: string;
            // reuse tab: `sch:__single` (content follows seedNodeId); new-tab: `sch:${seedNodeId}`
  kind: "schematic";
  title: string;
  seedNodeId: string;
    // the graph key — schematics are cached by seedNodeId, not tab id (D12)
};
export type PortsTabSpec = {
  id: string;
            // = `ports:${nodeId}`
  kind: "ports";
  title: string;
  nodeId: string;
  defId: string;
};
/** The single DFX Ctrl schematic tab (M3/T3). Content derives from the genconn doc * (dfxInstances + ctrlIps), so the tab spec carries no ids of its own. */
export type DfxCtrlTabSpec = {
  id: "dfx:ctrl";
  kind: "dfxctrl";
  title: string;
};
/** The single Register Count report tab. Content derives from get-register-count. */
export type RegCountTabSpec = {
  id: "regcount";
  kind: "regcount";
  title: string;
};
/** The single Pad/BScan config-table tab. Content derives from `pad table` + user overlay. */
export type PadTabSpec = {
  id: "pad";
  kind: "pad";
  title: string;
};
/** The single Clock/Reset structure + DFT-DRC tab. */
export type CrTreeTabSpec = {
  id: "crtree";
  kind: "crtree";
  title: string;
};
/** The single DFX IP planner tab (planned IP instantiations + control circuits). */
export type DfxIpTabSpec = {
  id: "dfxip";
  kind: "dfxip";
  title: string;
};
export type Tab = HdlTab | SchematicTabSpec | PortsTabSpec | DfxCtrlTabSpec | RegCountTabSpec | PadTabSpec | CrTreeTabSpec | DfxIpTabSpec;
/** One trace edge (driver pin -> load pin) returned by trace-fanin/fanout. */
export interface TraceEdge {
  fromNode: string;
 fromPort: string;
  toNode: string;
 toPort: string;
  netName: string;
 bus: boolean;
}
export interface TraceResult {
 edges: TraceEdge[];
 nodes: NodeMeta[];
 truncated: boolean;
 }
/** A behavioral (analysis-resolved) fanin source: a primary input port, an assign, or an * always block. Carries an HDL location for double-click navigation. */
export interface DriverSource {
  kind: "port" | "logic" | "instance" | "constant";
  /** logic sources: the driving expression's SHAPE, so every view renders the same statement   *  with the same symbol — "alias" | "inv" | "and" | "or" | "xor" | "mux" | "" (real block). */
  shape?: string;
  id: string;
                 // dedupe key (`port:<parent>.<net>` | `logic:<scope>:<file>:<line>` | instance path)
  label: string;
              // net name (port) | block kind (logic) | driving output pin (instance)
  detail: string;
             // "input port" | "assign" | "always_ff" | module name (instance) | ...
  /** The SIGNAL this source drives. traceLogic flattens the drivers of every signal a block   *  reads into one list, and a logic source's `label` is only the block kind ("assign"), so   *  this is the only field that identifies which fan-in a source actually is. */
  net?: string;
  /** Gate-shaped logic sources: the signal names the RHS actually reads — the gate's REAL
   *  input pins (a 2-input OR gets por/wdt_reset, not one generic `a`). */
  /** Reader statements (trace-loads / trace-net-loads): the net this statement DRIVES (its
   *  LHS) — what gives a load node an output pin so the forward trace can continue. */
  drives?: string;
  reads?: string[];
  file: string;
  line: number;
  bus: boolean;
}
export interface DriversResult {
 sources: DriverSource[];
 netName: string;
 bus: boolean;
 }
/** dp_shell (Tcl over the elaborated design). Shell state lives in the daemon. */
export interface DpOccPoint {
 pin: string;
 clock: string;
 comment: string;
 }
export interface DpCtrlMux {
 target: string;
 overrideSource: string;
 select: string;
 }
export interface DpShellResult {
  ok: boolean;
  output: string;
  error: string;
  /** Changes whenever the recorded DFT plan changes (OCC points, pin constraints, declared
   *  clocks/signals, …). The analyses re-run on it instead of guessing which commands matter. */
  planRev?: number;
  occPoints: DpOccPoint[];
  ctrlMuxes: DpCtrlMux[];
  /** add_dft_ip state — PLANNED DFX IP instantiations (dfx_dynamic_hyper_ctl, …). */
  // (see DfxIpConeResult for the INTERNAL circuit of one of these)
  dftIps: Array<{
 module: string;
 instance: string;
 at: string;
 comment: string;
 /** Port states computed from the IP library (read_dfx_ip): inputs resolve from the
  *  constraint chain, outputs from the IP's own circuit — X when undecidable, `stuck`
  *  naming why ("input:<port>" / "dead:<path>"). Absent until the library is loaded. */
 ports?: Array<{
   port: string;
   dir: string;
   s: string;
   sac: string;
   asc: string;
   stuck?: string;
   /** the value is DECLARED on the pin (constraint/tie), not computed from the circuit */
   declared?: boolean }>;
 }>;
  /** add_pin_constraint state; value is "0" | "1" | "Z" (X clears, so it never appears). */
  pinConstraints: Array<{
 pin: string;
 value: string }>;
  occTcl: string;
        // replayable dfx_occ_def_point.tcl contents
}
/** dfx-ip-cone — the INTERNAL circuit of one planned DFX IP: cells with their real pins, the
 *  module's port->net bindings, and every net's per-phase value from the same calculus
 *  report_dft_ip_circuit uses. Empty module ("") = unknown instance or no library loaded. */
export interface DfxIpConePin { port: string; dir: string; net: string; tie: string }
export interface DfxIpConeResult {
  instance: string;
  module: string;
  truncated: boolean;
  /** The IP module's own ports (dir is the port's direction, net its internal binding). */
  ports: DfxIpConePin[];
  /** `module` is the library cell's module name — or, for cells synthesized from an assign's
   *  slang decomposition, the primitive KIND (mux|and|eq|…) with `label` its display text. */
  cells: Array<{ name: string; module: string; label?: string; pins: DfxIpConePin[] }>;
  /** Per-phase value of every internal net ("" entries when values were skipped for size).
   *  `declared` = the value comes from a declaration on the same-named pin, not the circuit. */
  nets: Array<{ name: string; s: string; sac: string; asc: string; declared?: boolean }>;
}
/** memory-map — membistlib (*.tcd_memory) templates matched against the design's blackbox
 *  instances (MemoryBIST planning input). `matched` indexes into `templates`, -1 = none.
 *  `verilogModel`/`hdlPorts`: the library's `<CellName>.v` — PORT-ONLY recognition (the model
 *  body is never analyzed), giving the memory's own pin names/directions/widths. */
export interface MemoryMapResult {
  templates: Array<{
    name: string; file: string; type: string; algorithm: string; words: string;
    logicalPorts: string;
    pins: Array<{ name: string; function: string; direction: string; polarity: string }>;
    verilogModel: string;
    hdlPorts: Array<{ name: string; direction: string; width: number }>;
  }>;
  /** `placed`/`x`/`y` come from a DEF's COMPONENTS section; `group` is the MemoryBIST
   *  controller candidate the physical clustering assigned it to (-1 = not grouped). */
  instances: Array<{
    path: string; module: string; matched: number;
    placed: boolean; x: number; y: number; orient: string; group: number;
  }>;
  errors: string[];
  /** Controller candidates: member indices into `instances`, centroid and bounding box. */
  groups: Array<{ members: number[]; cx: number; cy: number;
                  x0: number; y0: number; x1: number; y1: number }>;
  defFile: string;
  placedCount: number;
  die: { x0: number; y0: number; x1: number; y1: number; diagonal: number };
}
/** mbist-plan — the MemoryBIST partition: which controller tests which memories, in which
 *  steps, and what that costs. Derived from the RTL + memory library alone; a DEF/UPF only
 *  refines it. Steps inside a controller run in SEQUENCE, memories inside a step in PARALLEL. */
export interface MbistPlanResult {
  memories: Array<{
    path: string; module: string; type: string; algorithm: string; operationSet: string;
    clockPin: string; clockNet: string; clockDomain: string; periodNs: number;
    words: number; width: number; powerMw: number; cycles: number;
    controller: number; step: number; interfaceId: string;
    placed: boolean; x: number; y: number;
    dataOutStage: string; bitGrouping: number;
    rowAddrBits: number; colAddrBits: number; bankAddrBits: number;
    powerDomain: string; physicalCluster: string; partitioningGroup: string;
  }>;
  /** `ruleId`/`ruleWhy`: the SCR that forced this step to exist ("" for a first step). */
  steps: Array<{
    controller: number; index: number; members: number[];
    powerMw: number; cycles: number; runtimeNs: number; comparator: string;
    ruleId: string; ruleWhy: string;
  }>;
  /** `ruleId`/`ruleWhy`: the CCR that separated this controller from the previous one. */
  controllers: Array<{
    name: string; clockDomain: string; periodNs: number; type: string;
    steps: number[]; memories: number[];
    powerMw: number; cycles: number; runtimeNs: number; flops: number;
    physicalCluster: string; powerDomain: string; partitioningGroup: string;
    ruleId: string; ruleWhy: string;
    /** The user assigned these memories here; `violations` are the CCRs that grouping breaks
     *  (honoured as asked, but it cannot be inserted until they are resolved). */
    userDefined: boolean; violations: string[];
  }>;
  /** The CCR/SCR ledger: what each rule requires, whether this design gives it anything to
   *  act on (`applies`), and how many controllers/steps it caused (`splits`). */
  rules: Array<{ id: string; title: string; splits: number; applies: boolean }>;
  notes: string[];
  errors: string[];
  totalRuntimeNs: number;
  peakPowerMw: number;
}
/** Budgets and knobs for mbist-plan; every field optional (the defaults mirror the flow's). */
export interface MbistPlanOpts {
  defFile?: string;
  clusterSizeRatio?: number;
  defaultPeriodNs?: number;
  maxPowerPerStepMw?: number;
  maxMemoriesPerStep?: number;
  maxStepsPerController?: number;
  maxTestTimePerControllerMs?: number;
  clockPeriods?: Array<{ clock: string; periodNs: number }>;
}
/** find-objects — glob search over the elaborated design (tree search box). */
export interface FoundObject {
  kind: "instance" | "module" | "port" | "pin" | "net";
  id: string;
 name: string;
 design: string;
 parent: string;
 dir: string;
}
export interface FindObjectsResult {
 objects: FoundObject[];
 scanned: number;
 truncated: boolean;
 }
/** clock-reset-tree — one flop-group's clock or async-reset path, walked to its source. */
export interface CrPathItem {
  kind: "clock" | "reset";
  owner: string;
 net: string;
 edge: string;
  path: string[];
        // "inst:net" hops, flop -> source
  elems: string[];
       // "buf@inst:net" | "inv@inst:net"
  /** "sequential" = the net comes straight out of a flip-flop: a registered value *  cannot be forced combinationally, so it is uncontrollable during scan shift. *  "blackbox" = driven by an instance whose module/cell model is not in the filelist. */
  terminus: "pi" | "logic" | "instance" | "undriven" | "sequential" | "blackbox";
  detail: string;
  /** sequential terminus only: source location of the driving always block. */
  terminusFile?: string;
  terminusLine?: number;
  clockName: string;
  rootValue: string;
     // 010 | 0 | 1 | Z | X   (at the source)
  value: string;
         // 010 | 101 | 0 | 1 | X (at the flop pin)
  inactive: string;
      // reset only: required inactive value
  /** reset only: the async branch LOADS ones — a SET/preset pin. The fix uses
   *  dfx_set_scan_n/p for these instead of dfx_rst_scan_n/p. */
  set?: boolean;
  ok: boolean;
           // reset only: value == inactive
  /** Reset only: passes ONLY because a PLANNED control mux patches it. The plan is not the
   *  netlist — nothing has been inserted yet, and the two must not read the same. */
  plannedFix?: boolean;
  /** The mux that decided this group's value (nearest to the flop) — set even when the result
   *  FAILS, so a mux driving a reset to its ACTIVE value can be named and deleted. */
  plannedMuxTarget?: string;
  /** Odd number of inversions between the flop pin and the source. A mux placed AT THE SOURCE
   *  must be driven with the OPPOSITE value — ignoring this plans a fix that holds the reset
   *  asserted. */
  inverted?: boolean;
  /** Three-phase reset state (requested with phases:true): the value in stuck-at capture and
   *  at-speed capture. `value` itself is the shift phase. */
  sacValue?: string;
  ascValue?: string;
  flopCount: number;
  file: string;
 line: number;
  /** SCAN-MODE dimension — only populated when occPoints/scanForces were supplied. */
  scanChecked?: boolean;
  scanValue?: string;
      // value at the flop clock pin with the DFT signals forced
  scanTerminus?: string;
  scanDetail?: string;
  scanOcc?: boolean;
       // the scan path runs through a declared OCC definition point
  scanOccPoint?: string;
   // which one ("" when none)
}
export interface SdcClockInfo {
 name: string;
 targets: string[];
 /** resolved (master-clock/-divide_by/-multiply_by/-edges/-combinational math already applied) */
 period: number;
 generated: boolean;
 /** as given, or as inferred; "" if neither */
 masterClock: string;
 masterInferred: boolean;
 /** 0 = undefined (period unresolved, or exactly 0) */
 frequencyMhz: number;
 /** the SDC file the create_clock/create_generated_clock line is in — "where is this defined" */
 file: string;
 /** 1-based line of that command; 0 if unknown */
 line: number;
 }
export interface ClockResetTreeResult {
  items: CrPathItem[];
  clocks: SdcClockInfo[];
  sdcErrors: string[];
}

/** One SDC checker diagnostic. `rule` is stable and groupable; `line` points into `file`. */
export interface SdcFinding {
  /** SDC-SYNTAX | SDC-CONT-WS | SDC-COMMENT | SDC-BUS-BRACKET | SDC-VAR-UNDEF | SDC-CMD-UNKNOWN
   *  | SDC-OPT-UNKNOWN | SDC-OPT-AMBIGUOUS | SDC-OPT-MISSING | SDC-OPT-CONFLICT | SDC-VALUE
   *  | SDC-DIALECT | SDC-OPT-DIALECT | SDC-CLK-* | SDC-EMPTY-MATCH | ... */
  rule: string;
  severity: "error" | "warning" | "info";
  file: string;
  line: number;
  column: number;
  /** the SDC command it came from ("" for file-level findings) */
  command: string;
  message: string;
  /** how to fix it ("" when there is nothing useful to add) */
  hint: string;
}

export interface SdcLintSummary {
  commands: number;
  clocks: number;
  generatedClocks: number;
  exceptions: number;
  ioDelays: number;
  /** true when the elaborated design backed the object-resolution checks */
  designAware: boolean;
  /** false in a daemon built without an embedded Tcl interpreter — nothing was checked */
  tclAvailable: boolean;
  /** the design was too large to enumerate, so design-aware checks were skipped */
  designTruncated: boolean;
  errors: number;
  warnings: number;
}

/** A clock after generation: master-clock inference + period resolution
 *  (parse_sdc_to_yaml, gen_dft.pl:6164-6275) applied on top of the design-validated clock list. */
export interface SdcResolvedClock {
  name: string;
  generated: boolean;
  /** 0 = unresolved (see clockgenWarnings for why) */
  period: number;
  /** 0 = undefined (period unresolved, or exactly 0) */
  frequencyMhz: number;
  /** as given, or as inferred; "" if neither */
  masterClock: string;
  masterInferred: boolean;
  targets: string[];
  /** "" for an unnamed clock */
  tessentClockMappingCmd: string;
  /** the SDC file the create_clock/create_generated_clock line is in — "where is this defined" */
  file: string;
  /** 1-based line of that command; 0 if unknown */
  line: number;
}

/** One target object's generated add_clock line (parse_sdc_to_yaml's finalize_clocks,
 *  gen_dft.pl:6277-6378) — PAD-named and DFT-clock-named objects come back already commented
 *  out, and an earlier duplicate on the same object is commented out as "superseded". */
export interface SdcAddClockCmd {
  clockName: string;
  objectExpr: string;
  label: string;
  /** the full `add_clock ...` line, INCLUDING a leading "# " when `commented` */
  text: string;
  commented: boolean;
  /** "" when live: "PAD signal" | "DFT clock" | "superseded" */
  reason: string;
}

export interface SdcLintResult {
  findings: SdcFinding[];
  summary: SdcLintSummary;
  resolvedClocks: SdcResolvedClock[];
  addClockCmds: SdcAddClockCmd[];
  tessentMappingCmds: string[];
  clockgenWarnings: string[];
}
/** P2 — RTL primitives a behavioral block infers to (decompose-logic). A pin `ref` is one of *  `cell:<id>` (another cell's output), `sig:<name>` (a signal the block reads) or *  `const:<value>` (a literal). */
export interface LogicPin {
 name: string;
 ref: string;
 }
export interface LogicCell {
  id: string;
  /** and|or|xor|nand|nor|xnor|not|buf | add|sub|mul|div|mod|shl|shr | eq|neq|lt|gt|le|ge   *  | rand|ror|rxor | land|lor|lnot | mux|dff|dlatch|concat|select|const|call */
  kind: string;
  label: string;
          // "&", "+", "==", "MUX", "DFF", ...
  outName: string;
        // signal it drives ("" for an intermediate node)
  width: number;
  line: number;
  inputs: LogicPin[];
}
export interface DecomposeResult {
  cells: LogicCell[];
  inputs: string[];
       // external signals read
  outputs: string[];
      // signals driven
  file: string;
  line: number;
  blockKind: string;
      // "assign" | "always_ff" | "always_comb" | "always_latch" | "always"
  truncated: boolean;
}
/** trace-into 单响应:结构边 + 内部子实例 + 行为源(输出引脚无结构驱动时)。spec §2.3 */
export interface TraceIntoResult {
  edges: TraceEdge[];
  nodes: NodeMeta[];
  sources: DriverSource[];
  netName: string;
  bus: boolean;
  truncated: boolean;
}
/** One pin-level connection row returned by get-netlist. */
export interface NetConnection {
  instanceId: string;
  port: string;
  direction: "in" | "out" | "inout";
  net: string;
  /** 常量 tie 字面量("1'b0"/"4'b101");非常量或悬空为 ""(M0 tie 补丁) */
  tie: string;
}
export interface NetlistResult {
  ownerInstanceId: string;
  nets: {
 name: string;
 width: number;
 busLabel?: string;
 netKind?: string }[];
  connections: NetConnection[];
  truncated?: boolean;
}
/** Per-instance register (flop bit) count from get-register-count. */
export interface RegCount {
  instanceId: string;
  own: number;
  subtree: number;
  memoryBits: number;
}
export interface RegCountResult {
 counts: RegCount[];
 total: number;
 }
export interface OpenOpts {
  filelist: string;
  vars?: Record<string, string>;
  substs?: [string, string][];
  top?: string | null;
}
/** The minimal payload crossing the bridge to GenConnection (architecture doc §4). */
export interface BlockPayload {
  designName: string;
  fileName?: string;
  instanceName?: string;
}
/** Exposed by electron/preload.cjs as window.hs (the renderer↔daemon contract). */
export interface HsBridge {
  open(opts: OpenOpts): Promise<ReadyResult>;
  query(method: string, params: Record<string, unknown>): Promise<unknown>;
  readSource(file: string): Promise<string>;
  pickFilelist(): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  exportBlocks(payloads: BlockPayload[]): Promise<string | null>;
}
// ---- runtime cache shapes (filled lazily by the store) ----
export interface NodeState extends NodeMeta {
  parentInstanceId: string | null;
  childrenLoaded: boolean;
  childInstanceIds: string[];
  /** ports whose width differs from the def's representative (parameterized instances). */
  portWidthOverrides?: Record<string, number>;
}
export interface DefState {
  id: string;
  designName: string;
  filePath: string;
}
// ---- wrapper cells: the EXTEST EDT's payload (daemon method "wrapper-cells") ----
// Computed from the elaborated RTL, not from an insertion report, so it is available BEFORE
// scan insertion — which is when the EDT has to be configured.
export interface WrapperCellsParams {
  /** "" = the largest elaborated top. */
  core?: string;
  /** Leaf port-name globs that never get a cell — DFT signals. Clocks and resets are found by   *  the walk itself (they land on a flop's clock/reset pin), so they do not belong here. */
  excludePorts?: string[];
  inputFanoutFlopThreshold?: number;
  outputFaninFlopThreshold?: number;
  /** Separate ceiling on internal-feedback cells — flops that feed back into their own cone. */
  feedbackFlopThreshold?: number;
  levelsThreshold?: number;
  registerUndrivenOutput?: boolean;
  registerPortsReachingBlackboxes?: boolean;
  /** Clocks never get a cell — one there sits in the clock path. Beats every other setting. */
  clockPorts?: string[];
  /** Infer a clock from the walk (a port reaching a flop clock pin). */
  inferClockPorts?: boolean;
  /** A core input wired to a core output with no flop between them gets no cell. */
  skipFeedthroughPorts?: boolean;
  /** Per-port overrides — Tessent's set_dedicated_wrapper_cell_options on / off. */
  forceDedicatedPorts?: string[];
  forceSharedPorts?: string[];
  /** Emit one transcript line per boundary port bit. Off by default — the per-port detail is
   *  what you want when one port's decision looks wrong, and noise otherwise. */
  logEveryPort?: boolean;
}
export interface WrapperPortCell {
  name: string;
      // "p1_din[0]"
  port: string;
  bit: number;
  dir: "in" | "out" | "inout";
  decision: "shared" | "dedicated" | "none";
  flops: number;
  flopsFeedback: number;
  cell: string;
      // the flop it would reuse, "" when there is none
  /** Clock net of that flop — the vendor report prints this as its own column, and it is the
   *  only way to tell whether a wrapper cell lands on the clock domain the OCC plan assumes. */
  clock: string;
  reason: string;
  /** Deepest combinational level the cone reached — Tessent's "Max Logic Level". */
  levels: number;
  /** Every flop the cone found, capped at 32 — `flops` carries the real total. A decision
   *  without its candidates cannot be checked; `instance` is what seeds a schematic. */
  candidates: Array<{ label: string; instance: string }>;
}
export interface WrapperCellsResult {
  core: string;
  inputBits: number;
  outputBits: number;
  sharedIn: number;
  sharedOut: number;
  dedicatedIn: number;
  dedicatedOut: number;
  noneIn: number;
  noneOut: number;
  wrapperIn: number;
  wrapperOut: number;
  wrapperCells: number;
  addedScanCells: number;
  coneNodes: number;
  analysisMs: number;
  cells: WrapperPortCell[];
  /** The run's own transcript — the options in force, the progress, the closing summary.
   *  Capped at 4000 lines by the daemon. */
  log: string[];
}
// ---- wrapper cone: the traced circuit behind ONE port bit (daemon method "wrapper-cone") ----
// Same walk as wrapper-cells with its route kept. Nodes are NET BITS plus the flops the cone
// lands on, so the picture is of the path the analysis actually took.
export interface WrapperConeNode {
  id: string;
  /** "port" (the boundary) | "net" (a wire) | "gate" (what drives the next wire) | "flop". */
  kind: "port" | "net" | "gate" | "flop";
  /** gate nodes: which symbol to draw — and/or/xor/inv/mux/buf/latch/logic. */
  elem: string;
  /** gate nodes: the statement it came from ("assign", "always_comb", …). */
  detail: string;
  label: string;
      // "p1_din[0]", "data_sync[0]"
  instance: string;
   // full hierarchical path of the instance the net lives in
  scope: string;
      // the same, relative to the core — what to show under the label
  /** flop nodes: the net on its clock pin. */
  clock: string;
  level: number;
      // hops from the port: the column it belongs in
}
export interface WrapperConeResult {
  core: string;
  port: string;
  name: string;
  bit: number;
  dir: "in" | "out" | "inout";
  decision: string;
  reason: string;
  /** The flop the decision settled on — "shared" is half a verdict without shared ON WHAT. */
  cell: string;
  truncated: boolean;
  nodes: WrapperConeNode[];
  edges: Array<{ from: string; to: string }>;
}

// ---- scan budget: EDT sizing derived from the design (daemon method "scan-budget") ----
// The plan carries INTENT — which instances and families a controller covers, and how long its
// chains should be. The numbers that go in the spec are derived from it, never typed, so a
// design that grows is tracked instead of leaving a stale scan_chain_count behind.
export interface ScanBudgetEdtPlan {
  name: string;
  external?: boolean;
  /** Instance paths this controller covers. Empty on an external controller, which takes the   *  wrapper/OCC/HYPER families rather than a slice of the core's own flops. */
  instances?: string[];
  includeOcc?: boolean;
  includeHyper?: boolean;
  includeWrapper?: boolean;
  /** Custom chain families (beyond OCC/HYPER/INT/WRAPPER) this controller carries; they join
   *  the mode's -include_chain_families verbatim. */
  extraFamilies?: string[];
  channels?: number;
  targetChainLength?: number;
  separateControlDataChannels?: boolean;
  channelInPipe?: string;
  channelOutPipe?: string;
  /** The ScanHost chain group this controller joins. Several controllers may name the same one. */
  sshChainGroup?: string;
}
export interface ScanBudgetPlan {
  core?: string;
  designName?: string;
  specScope?: string;
  occInstances?: string[];
  hyperInstances?: string[];
  /** add_nonscan_instances globs — their flops exist but never join a chain. */
  nonscanInstances?: string[];
  /** Subtrees held OUT of the family above, whatever its rules match. A rule plus a short
   *  exception list is how a hierarchy is actually described; without it a rule is a one-way
   *  door and the only escape is to keep narrowing the glob. Applies to the whole subtree, and
   *  the bits go back to the remainder family. */
  occExcludes?: string[];
  hyperExcludes?: string[];
  nonscanExcludes?: string[];
  chainLengthTolerancePercent?: number;
  /** create_scan_chain_family switches per ENGINE family name (OCC_CHAIN, WRAPPER_CHAIN, a
   *  custom name…), passed through verbatim; a user switch overrides the derived default. */
  familyOptions?: Record<string, Record<string, string>>;
  edts: ScanBudgetEdtPlan[];
}
export interface ScanBudgetEdt {
  name: string;
  external: boolean;
  cells: number;
  cellsCore: number;
  cellsOcc: number;
  cellsHyper: number;
  cellsWrapper: number;
  /** 0 = derive from the chain count (what Run Analysis does). */
  channels: number;
  /** Chains per channel when the count is derived; the reference flow uses 150. */
  chainsPerChannel?: number;
  chainCount: number;
  achievedLength: number;
  longestMin: number;
  longestMax: number;
  compression: number;
  warnings: string[];
  /** EDT-Aborted risk advice derived from the OCC sub-chain stitching rules. Advisory only. */
  eabAdvice: string[];
  /** OCC bits as a percentage of the achieved chain length (25 / 75 are the manual's marks). */
  occChainRatio: number;
}
export interface ScanBudgetResult {
  core: string;
  coreRegisterBits: number;
  occBits: number;
  hyperBits: number;
  nonscanBits: number;
  wrapperIn: number;
  wrapperOut: number;
  unassignedBits: number;
  edtSpec: string;
  scanTcl: string;
  errors: string[];
  notes: string[];
  edts: ScanBudgetEdt[];
  /** Transcript of the budget run — the assignment decisions and the arithmetic behind each
   *  controller's chain count. Capped at 4000 lines by the daemon. */
  log: string[];
}
