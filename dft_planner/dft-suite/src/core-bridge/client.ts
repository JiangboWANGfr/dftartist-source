// Typed wrapper over window.dft.design.query (the daemon methods).
// Renderer-only: depends on window, do not import in Node contexts.

import { reportPlanRev } from "./planRev.ts";
import type {
  ClockResetTreeResult,
  DecomposeResult,
  DfxIpConeResult,
  MbistPlanOpts,
  MbistPlanResult,
  MemoryMapResult,
  DpShellResult,
  FindObjectsResult,
  DriversResult,
  ExpandResult,
  NetlistResult,
  OpenOpts,
  PortsResult,
  ReadyResult,
  RegCountResult,
  ScanBudgetPlan,
  ScanBudgetResult,
  SdcLintResult,
  SourceLocation,
  TraceIntoResult,
  TraceResult,
  WrapperCellsParams,
  WrapperConeResult,
  WrapperCellsResult,
} from "./model.ts";
import "./dft.d.ts";

/** True only inside the Electron shell, where preload exposed the native bridge. */
export const hasBridge = (): boolean =>
  typeof window !== "undefined" && !!window.dft;

export const dftDesign = {
  open: (opts: OpenOpts): Promise<ReadyResult> =>
    window.dft.design.open(opts),

  dump: (): Promise<unknown> =>
    window.dft.design.dump(),

  expandChildren: (nodeId: string): Promise<ExpandResult> =>
    window.dft.design.query("expand-children", { nodeId }) as Promise<ExpandResult>,

  getPorts: (params: { defId: string } | { nodeId: string }): Promise<PortsResult> =>
    window.dft.design.query("get-ports", params) as Promise<PortsResult>,

  getNetlist: (p: { ownerInstanceId: string }): Promise<NetlistResult> =>
    window.dft.design.query("get-netlist", p) as Promise<NetlistResult>,

  getRegisterCounts: (): Promise<RegCountResult> =>
    window.dft.design.query("get-register-count", {}) as Promise<RegCountResult>,

  sourceLocation: (p: {
    kind: "definition" | "instantiation";
    defId?: string;
    nodeId?: string;
  }): Promise<SourceLocation> =>
    window.dft.design.query("get-source-location", p) as Promise<SourceLocation>,

  traceFanin: (nodeId: string, port: string): Promise<TraceResult> =>
    window.dft.design.query("trace-fanin", { nodeId, port }) as Promise<TraceResult>,

  traceFanout: (nodeId: string, port: string): Promise<TraceResult> =>
    window.dft.design.query("trace-fanout", { nodeId, port }) as Promise<TraceResult>,

  traceDrivers: (nodeId: string, port: string): Promise<DriversResult> =>
    window.dft.design.query("trace-drivers", { nodeId, port }) as Promise<DriversResult>,

  /** Behavioural LOADS of an output pin (statements reading the connected net) — the fanout
   *  counterpart of traceDrivers, so an output feeding only assigns is not a dead end. */
  traceLoads: (nodeId: string, port: string): Promise<DriversResult> =>
    window.dft.design.query("trace-loads", { nodeId, port }) as Promise<DriversResult>,

  /** Behavioural drivers of an INTERNAL net of `nodeId` — what lets a net tap keep tracing
   *  backward instead of being a dead end. */
  traceNet: (nodeId: string, net: string): Promise<DriversResult> =>
    window.dft.design.query("trace-net", { nodeId, net }) as Promise<DriversResult>,

  /** ALL loads of an INTERNAL net of `nodeId` — child-instance input pins, behavioral readers,
   *  and the boundary port it leaves through. The forward counterpart of traceNet: what lets
   *  fanout continue past a gate/assign node instead of dead-ending there. */
  traceNetLoads: (nodeId: string, net: string): Promise<DriversResult> =>
    window.dft.design.query("trace-net-loads", { nodeId, net }) as Promise<DriversResult>,

  traceInto: (nodeId: string, port: string): Promise<TraceIntoResult> =>
    window.dft.design.query("trace-into", { nodeId, port }) as Promise<TraceIntoResult>,

  // Trace THROUGH a behavioral block (always/assign): its input signals' drivers.
  traceLogic: (id: string): Promise<DriversResult> =>
    window.dft.design.query("trace-logic", { id }) as Promise<DriversResult>,

  // P2: RTL primitives (gates / MUX / DFF) a behavioral block infers to.
  // NOTE: the daemon only knows a logic id once a trace surfaced it, so this must follow a
  // trace-into / trace-drivers on the same session (same contract as trace-logic).
  decomposeLogic: (id: string): Promise<DecomposeResult> =>
    window.dft.design.query("decompose-logic", { id }) as Promise<DecomposeResult>,

  // dp_shell: run a command/script (or `source` a file). Shell state (OCC points, ctrl muxes)
  // lives in the daemon and accumulates across calls — it IS the user's DFT plan.
  // Every reply carries the plan revision; reporting it HERE is what makes a command run from a
  // context menu refresh the views, exactly as one typed in the console does.
  dpShell: (script: string, file?: string): Promise<DpShellResult> =>
    (window.dft.design.query("dp-shell", { script, file: file ?? "" }) as Promise<DpShellResult>)
      .then((r) => { reportPlanRev(r.planRev); return r; }),

  /** The MemoryBIST partition (controller / step / memory + power, cycles, runtime). Only the
   *  memory library is required: clock domains come from the RTL, sizes and power from the
   *  templates. `opts.defFile` merely splits controllers further by placement. */
  mbistPlan: (libDir: string, opts: MbistPlanOpts = {}): Promise<MbistPlanResult> =>
    window.dft.design.query("mbist-plan", { libDir, ...opts }) as Promise<MbistPlanResult>,

  /** membistlib templates matched against the design's blackbox instances — which memories
   *  the design contains, with their BIST algorithm/geometry ("设计中有哪些 memory"). */
  /** `defFile` adds DEF placement; `clusterSizeRatio` (percent of the die diagonal, the
   *  `physical_cluster_size_ratio` model — 20 is the flow's default) partitions the placed
   *  memories into MemoryBIST controller candidates. */
  memoryMap: (libDir: string, opts: { defFile?: string; clusterSizeRatio?: number;
                                      maxPerController?: number } = {}): Promise<MemoryMapResult> =>
    window.dft.design.query("memory-map", {
      libDir,
      defFile: opts.defFile ?? "",
      ...(opts.clusterSizeRatio != null ? { clusterSizeRatio: opts.clusterSizeRatio } : {}),
      ...(opts.maxPerController ? { maxPerController: opts.maxPerController } : {}),
    }) as Promise<MemoryMapResult>,

  /** The INTERNAL circuit of one planned DFX IP (add_dft_ip + read_dfx_ip): its cells with
   *  real pins, the module's port bindings, and every net's per-phase value from the same
   *  calculus report_dft_ip_circuit uses. Drawn when the user traces INTO a planned IP pin. */
  dfxIpCone: (instance: string): Promise<DfxIpConeResult> =>
    window.dft.design.query("dfx-ip-cone", { instance }) as Promise<DfxIpConeResult>,

  // Glob search over the elaborated design (the tree is lazily loaded, so this must be backend).
  findObjects: (pattern: string, kinds = "", limit = 500): Promise<FindObjectsResult> =>
    window.dft.design.query("find-objects", { pattern, kinds, limit }) as Promise<FindObjectsResult>,

  // Clock/reset structure + X/Z/010 value calculus. `sdcFile` may be "".
  // `dftLibSetting` (dft_lib_setting.yaml) lets the walk climb THROUGH ICG/buffer/inverter
  // cells via the clock_in pin their cell library declares — without it the walk stops at the
  // first cell and every downstream clock reads as X.
  /** `occPoints` / `scanForces` add the SCAN-MODE dimension: each clock path is re-walked with
   *  the DFT signals forced, and reports whether it then reaches a declared OCC point. */
  clockResetTree: (sdcFile: string, dftLibSetting = "",
                   occPoints: string[] = [],
                   scanForces: Array<{ pin: string; value: number }> = [],
                   pinConstraints: Array<{ pin: string; value: string }> = [],
                   phases = false): Promise<ClockResetTreeResult> =>
    window.dft.design.query("clock-reset-tree",
      { sdcFile, dftLibSetting, occPoints, scanForces, pinConstraints, phases }) as Promise<ClockResetTreeResult>,

  /** Check an SDC file for syntax, command and design errors.
   *
   *  Pass `sdcFile` to check a file on disk, or `sdcText` to check unsaved editor content
   *  (`sdcFile` then only labels the findings). `dialects` is a comma list of
   *  generic|dc|genus ("" = accept all three); narrowing it turns the other vendors'
   *  extensions into portability warnings.
   *
   *  `design` (default true) resolves get_ports/get_pins patterns against the elaborated
   *  hierarchy, which is what catches constraints that parse but match nothing. It needs a
   *  design to be open; with none, the syntax and command layers still run.
   */
  sdcLint: (opts: { sdcFile?: string; sdcText?: string; dialects?: string; design?: boolean } = {}):
    Promise<SdcLintResult> =>
    window.dft.design.query("sdc-lint", {
      sdcFile: opts.sdcFile ?? "",
      sdcText: opts.sdcText ?? "",
      dialects: opts.dialects ?? "",
      design: opts.design ?? true,
    }) as Promise<SdcLintResult>,

  /** Wrapper cells the core's boundary needs, from the elaborated RTL. Runs on the design that
   *  is already open — there is no filelist to pick, because the daemon is holding it. */
  wrapperCells: (params: WrapperCellsParams = {}): Promise<WrapperCellsResult> =>
    window.dft.design.query("wrapper-cells", params as unknown as Record<string, unknown>) as Promise<WrapperCellsResult>,

  /** The traced cone behind one port bit, as a graph that can be drawn. Separate from
   *  wrapperCells because keeping the route for all 4000 bits of a boundary would cost real
   *  memory — this is asked for one port at a time, when someone clicks it. */
  wrapperCone: (params: { core?: string; port: string; bit: number } & WrapperCellsParams): Promise<WrapperConeResult> =>
    window.dft.design.query("wrapper-cone", params as unknown as Record<string, unknown>) as Promise<WrapperConeResult>,

  /** Size an EDT from the LIVE design: send a plan (which instances / families a controller
   *  covers, plus the target chain length) and get back scan_chain_count, longest_chain_range
   *  and the cell breakdown behind them. Same engine the Scan Chain / EDT page and the
   *  `hdl scanbudget` CLI use, so the canvas cannot disagree with them. */
  scanBudget: (plan: ScanBudgetPlan): Promise<ScanBudgetResult> =>
    window.dft.design.query("scan-budget", plan as unknown as Record<string, unknown>) as Promise<ScanBudgetResult>,

  readSource: (file: string): Promise<string> =>
    window.dft.design.readSource(file),
};
