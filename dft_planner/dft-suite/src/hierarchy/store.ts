// Zustand store (ui): thin wrapper over the daemon client + core reducers.
// Lazily-filled DesignHierarchy + selection + right-hand tabs + transient menu state.

import { create } from "zustand";
import type {
  BlockPayload, CandidateTop, DefState, Direction, DriverSource, NodeMeta, NodeState,
  ReadyResult, RegCountResult, ScanBudgetPlan, ScanBudgetResult, Tab, WrapperCellsParams, WrapperCellsResult,
  WrapperConeResult,
} from "./core/model.ts";
import type { CrPathItem, SdcClockInfo } from "../core-bridge/model.ts";
import { splitDefId } from "./core/defId.ts";
import { addTab, removeTab, upsertTab } from "./core/tabs.ts";
import {
  coreOf, defaultEdtDefaults, defaultFamilies, defaultWrapperOptions, familiesForEdt,
  parseScanPlan, serializeScanPlan, type Family,
  type EdtDefaults, type ScanPlan, type WrapperAnalysisOptions, familyTclOptions, extraFamiliesForEdt } from "./core/scanplan.ts";
import { useProject } from "../store/project.ts";

// Painting a family is click-heavy, so the plan is written back on a trailing debounce rather
// than on every click — but it IS written back, because losing the plan on restart is the
// failure this persistence exists to prevent.
// Hydrate whenever a different project becomes active. The dependency runs one way only —
// this store knows about the project, the project knows nothing about this store.
let hydratedFor: string | null = null;
useProject.subscribe((s) => {
  if (s.path === hydratedFor) return;
  hydratedFor = s.path;
  if (s.path) void useStore.getState().hydrateScanPlan();
});

/** The project document: the plan, the analysis options, and the cached results. One builder,
 *  used by the debounced autosave and by the explicit Save, so the two cannot write different
 *  documents. */
function scanPlanDoc(): string {
  const s = useStore.getState();
  return serializeScanPlan({
    version: 1, plan: s.scanPlan, edtDefaults: s.edtDefaults, wrapper: s.wrapperOptions,
    // Cache the RESULTS too: an analysis that has to be re-run on every launch is one the
    // engineer stops running, and the page then shows nothing about a design it has already
    // measured.
    results: {
      ...(s.wrapperCells ? { wrapper: { at: s.wrapperAt ?? "", data: s.wrapperCells } } : {}),
      ...(s.scanBudget ? { budget: { at: s.budgetAt ?? "", data: s.scanBudget } } : {}),
    },
  });
}

let scanPlanSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleScanPlanSave(): void {
  if (scanPlanSaveTimer) clearTimeout(scanPlanSaveTimer);
  scanPlanSaveTimer = setTimeout(() => {
    scanPlanSaveTimer = null;
    void useStore.getState().saveScanPlanNow();
  }, 800);
}
import {
  addNodeWithEdges, addTrace, addTraceInto, collapseInside as collapseInsideGraph, edgeId, keepInternalEdges,
  findDriverOutput, findExistingSource, makeLoadNode, makeNode, makeSourceNode, markEmpty, markInEmpty, newSchematic, portSourceBoundary, pruneOrphanSources, sourceNodeOutPort, sourceOutPort, visiblePorts, withBoundaryPin,
  type SchEdge, type SchematicGraph, type SchNode,
} from "./core/schematic.ts";
import { dftDesign as hs } from "../core-bridge/client.ts";
import { setPlanRevSink } from "../core-bridge/planRev.ts";
import { useDesign } from "../store/design.ts";
import { useStore as useGenconnStore } from "../genconn/store.ts";
import { chainGroupOf } from "../specgen/chaingroup.ts";
import { mergeCfg, overlayFromRows, type PadRow, type PadTableResult } from "./core/pad.ts";
import { dftPad } from "../core-bridge/pad.ts";

export interface ContextMenuState { nodeId: string; x: number; y: number; }

export interface AppState {
  status: "idle" | "opening" | "ready" | "error";
  error: string | null;
  loadedReady: ReadyResult | null; // tracks which design the store was loaded from (for idempotency)
  candidateTops: CandidateTop[]; // all top candidates (largest first) for the multi-top selector
  rootInstanceIds: string[];     // which tops are currently displayed at the tree's top level
  instances: Record<string, NodeState>;
  definitions: Record<string, DefState>;
  expanded: Record<string, boolean>;
  selectedId: string | null;

  tabs: Tab[];
  activeTabId: string | null;
  schematics: Record<string, SchematicGraph>; // keyed by seedNodeId (shared across the reuse tab + any new-tab; D12)
  regCounts: RegCountResult | null;
  regCountsError: string | null;
  wrapperCells: WrapperCellsResult | null;
  wrapperError: string | null;
  wrapperBusy: boolean;
  /** Chain families + EDT coverage. DESIGN-level, so they live here rather than on an EDT node:
   *  `create_scan_chain_family` defines a family once and every scan mode selects from the same
   *  set, and deleting a controller must not take a family definition with it. */
  scanPlan: ScanPlan;
  /** Defaults a newly placed EDT picks up, so the common case needs no typing at all. */
  edtDefaults: {
    int: EdtDefaults;
    ext: EdtDefaults;
  };
  /** What the wrapper analysis is told before it runs — thresholds and excluded ports. Saved
   *  with the project: they describe the block, not this session. */
  wrapperOptions: WrapperAnalysisOptions;
  setWrapperOptions: (d: Partial<WrapperAnalysisOptions>) => void;
  scanBudget: ScanBudgetResult | null;
  scanBudgetError: string | null;
  scanBudgetBusy: boolean;
  /** Bumped when the dp_shell session's recorded DFT plan changes. Anything analysing that plan
   *  (the clock/reset view above all) re-runs on it: the console and the buttons are one
   *  session, so `add_pin_constraint` in the console has to move the values on screen. */
  drcRev: number;
  /** Report a dp_shell reply's planRev; bumps drcRev when it differs from the last one seen. */
  notePlanRev: (rev: number | undefined) => void;
  /** The latest clock/reset analysis, published by the DRC page. The schematic reads it to
   *  answer "why is THIS planned mux here" on the box itself — which flop groups need it. A
   *  reset chain crosses several register outputs, so muxes drawn in series on one wire can
   *  each serve a different group, and only this data can tell them apart. */
  crItems: CrPathItem[];
  setCrItems: (items: CrPathItem[]) => void;
  /** The same analysis's resolved SDC clocks (period/master-clock/generated/inferred already
   *  computed) — published alongside crItems so the schematic's object-name bar can show a
   *  selected pin's SDC clock definition without a second query. */
  crClocks: SdcClockInfo[];
  setCrClocks: (clocks: SdcClockInfo[]) => void;
  /** "Click this add_clock/clock-info table row -> reveal its definition point on the
   *  schematic" (SdcClocksPanel row click, wired from ClockResetTab). `rev` makes the SAME
   *  nodeId request twice in a row still fire the effect that consumes it. */
  schematicFocusRequest: { seedId: string; nodeId: string; rev: number } | null;
  requestSchematicFocus: (seedId: string, nodeId: string) => void;
  /** "Highlight this clock's whole path" (crSchematic.ts's clockPaths) — sticky, not a one-shot
   *  request: stays highlighted while the engineer browses, until they pick another clock or
   *  clear it. */
  highlightedClock: { seedId: string; clockName: string } | null;
  setHighlightedClock: (seedId: string, clockName: string | null) => void;
  /** The violation whose circuit the DRC debug canvas is showing. Lets the schematic label a
   *  planned mux as THIS group's fix point vs one working for another branch. */
  crDebugItem: CrPathItem | null;
  setCrDebugItem: (item: CrPathItem | null) => void;
  padLib: string | null;          // celllib path (persisted to localStorage)
  padRows: PadRow[];              // editable working copy (manual columns live here)
  padWarnings: string[];
  padDropped: string[];           // cfg paths that no longer match any pad (spec §4.7)
  padLoading: boolean;
  padError: string | null;
  padSaveState: "idle" | "saving" | "saved";
  contextMenu: ContextMenuState | null;
  pendingBlocks: BlockPayload[];

  // Initialize tree state from the ALREADY-open shared daemon (no hs.open here).
  loadFromReady: (ready: ReadyResult) => void;
  reset: () => void;
  setDisplayedRoots: (ids: string[]) => void;
  toggleExpand: (id: string) => Promise<void>;
  /** Expand every ancestor of `nodeId` (lazy tree) and select it — used by the search box. */
  revealInstance: (nodeId: string) => Promise<void>;
  // Select a tree instance: mirror to the shared store + open/activate its ports tab.
  selectInstance: (ref: { nodeId: string; defId: string }) => void;

  /** Surface a message in the workspace error banner (dp_shell menu failures, etc.). */
  setError: (msg: string | null) => void;
  openTab: (t: Tab) => void;
  /** Open/RETARGET the singleton HDL source tab (never stacks up duplicates). */
  openHdlTab: (t: Tab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  /** Open (or activate) the singleton DFX Ctrl schematic tab (M3/T3). */
  openDfxCtrlTab: () => void;
  /** Open (or activate) the singleton Register Count report tab; lazy-load counts on first open. */
  openRegCountTab: () => Promise<void>;
  runWrapperAnalysis: (params: WrapperCellsParams) => Promise<void>;
  /** The traced circuit behind one port bit, for the pop-up schematic. */
  /** Total from the PREVIOUS run, so a re-run can say whether it changed anything. Without it
   *  a run that produces the same number is indistinguishable from a run that never happened. */
  wrapperPrevCells: number | null;
  /** When the shown results were produced (ISO). Empty when they came from a cached document
   *  written before stamping existed; null when nothing has run. */
  wrapperAt: string | null;
  budgetAt: string | null;
  wrapperCone: WrapperConeResult | null;
  wrapperConeBusy: boolean;
  wrapperConeError: string | null;
  openWrapperCone: (port: string, bit: number) => Promise<void>;
  closeWrapperCone: () => void;
  setScanPlan: (p: ScanPlan) => void;
  hydrateScanPlan: () => Promise<void>;
  /** Write the plan + options + cached results to the project NOW and report it. Autosave runs
   *  on a debounce anyway; this is the explicit one, so "did that save?" has an answer. */
  saveScanPlanNow: () => Promise<boolean>;
  /** When the document was last written (ISO), for the Save button to show. */
  planSavedAt: string | null;
  setEdtDefaults: (kind: "int" | "ext", d: Partial<EdtDefaults>) => void;
  runScanBudget: (plan: ScanBudgetPlan) => Promise<void>;
  /** Recompute the budget from the current plan + the controllers on the canvas. */
  runScanBudgetFromPlan: () => Promise<void>;
  /** Copy the derived numbers into the EDT IPs on the canvas. Returns how many changed. */
  pushBudgetToEdtIps: () => number;
  /** Open (or activate) the singleton Clock/Reset structure + DFT-DRC tab. */
  openCrTreeTab: () => void;
  /** Open (or activate) the singleton Pad/BScan tab; lazy-load the table on first open. */
  openPadTab: () => Promise<void>;
  /** Open (or activate) the singleton DFX IP planner tab. */
  openDfxIpTab: () => void;
  setPadLib: (p: string) => Promise<void>;
  /** spawn `pad table --json` + merge pad_cfg.json into working rows. */
  refreshPadTable: () => Promise<void>;
  /** Patch manual columns on the given paths (single-cell edit passes one path). */
  patchPadRows: (paths: ReadonlySet<string> | string[], patch: Partial<Pick<PadRow, "bscanEn" | "reuse" | "func" | "enable">>) => void;
  openHdlDefinition: (nodeId: string) => Promise<void>;
  /** Open a definition directly by its defId (works for schematic nodes not in the tree). */
  openHdlDefinitionByDefId: (defId: string, title: string) => Promise<void>;
  /** Open the definition of any hierarchical instance path, revealing it first if needed. */
  openHdlForPath: (instPath: string) => Promise<void>;
  openHdlInstantiation: (nodeId: string) => Promise<void>;
  openSchematic: (nodeId: string, opts?: { newTab?: boolean }) => Promise<void>;
  addToSchematic: (nodeId: string) => Promise<void>;
  traceSchematic: (seedNodeId: string, nodeId: string, port: string, dir: "fanin" | "fanout") => Promise<void>;
  /** 内侧菱形:跨进 nodeId 内部一步(trace-into,结构边+行为源单响应)。 */
  traceInside: (seedNodeId: string, nodeId: string, port: string) => Promise<void>;
  /** 展开一个 logic 节点(always/assign)的输入信号:trace-through 到它读的端口/其它 logic。 */
  traceLogicInputs: (seedNodeId: string, logicId: string) => Promise<void>;
  /** 收起 Show RTL Primitives 展开的内部电路,恢复紧凑 logic 盒。 */
  hideLogicCells: (seedNodeId: string, logicId: string) => void;
  /** 用户选择一个盒子要显示哪些 pin(已连线的强制保留,否则线悬空)。 */
  setVisiblePins: (seedNodeId: string, nodeId: string, chosen: string[],
                   full: Array<{ name: string; direction: string; busLabel: string }>) => void;
  /** P2: expand a behavioral block into its RTL primitives (gates / MUX / DFF). */
  expandLogicCells: (seedNodeId: string, logicId: string) => Promise<void>;
  /** Clock Tree -> real schematic: reveal the instance, seed a schematic on it, trace `net`. */
  showClockInSchematic: (instanceId: string, net: string) => Promise<void>;
  /** Install a pre-built schematic graph (clock/reset exact-circuit views build their own). */
  putSchematic: (graph: SchematicGraph) => void;
  /** 一键清空:把该 schematic 重置为只剩根盒子(清掉所有 trace/add 出来的节点与边)。 */
  clearSchematic: (seedNodeId: string) => void;
  /** 右键容器"Collapse internals":递归移除内部、还原黑盒。 */
  collapseInside: (seedNodeId: string, nodeId: string) => void;
  openLocationHdl: (file: string, line: number, title: string) => void;

  openContextMenu: (nodeId: string, x: number, y: number) => void;
  closeContextMenu: () => void;

  addToGenConnection: (nodeId: string) => void;
  /** Register the instance in the shared genconn doc + open/activate the DFX Ctrl tab (M3/T5). */
  addToDfxCtrl: (nodeId: string) => void;
  clearPendingBlocks: () => void;
  exportPendingBlocks: () => Promise<void>;
}

/** Stable singleton id for the follow-selection ports tab (only one ports tab at a time). */
const PORTS_TAB_ID = "tab:ports";

/** Singleton HDL source view: every Show-HDL RETARGETS this one tab instead of opening a new
 *  tab per file:line (which buried the workspace in near-duplicate tabs). */
const HDL_TAB_ID = "tab:hdl";
/** Stable singleton id for the DFX Ctrl schematic tab (only one at a time; M3/T3). */
const DFX_CTRL_TAB_ID = "dfx:ctrl";
/** Stable singleton id for the Register Count report tab. */
const REGCOUNT_TAB_ID = "regcount";
/** Stable singleton id for the Clock/Reset structure + DFT-DRC tab. */
const CRTREE_TAB_ID = "crtree";
/** Stable singleton id for the Pad/BScan config tab. */
const PAD_TAB_ID = "pad";
const PAD_LIB_LS_KEY = "dft-suite.padLib";
const freshPadLib = (): string | null =>
  (typeof localStorage !== "undefined" && localStorage.getItem(PAD_LIB_LS_KEY)) || null;
/** Stable singleton id for the follow-selection (reuse) schematic tab. "Show on Schematic"
 *  updates this tab's seedNodeId in place; "…in New Tab" opens a dedicated `sch:${nodeId}` (D12). */
const SCHEMATIC_TAB_ID = "sch:__single";

export const useStore = create<AppState>()((set, get) => {
  const ensureDef = (defId: string): void => {
    if (get().definitions[defId]) return;
    const { designName, filePath } = splitDefId(defId);
    set((s) => ({ definitions: { ...s.definitions, [defId]: { id: defId, designName, filePath } } }));
  };
  const putNode = (m: NodeMeta, parentInstanceId: string | null): void => {
    set((s) => (s.instances[m.id]
      ? {}
      : { instances: { ...s.instances, [m.id]: { ...m, parentInstanceId, childrenLoaded: false, childInstanceIds: [] } } }));
    ensureDef(m.definitionId);
  };

  // Debounced pad_cfg.json autosave (spec §Task5): coalesces bursts of patchPadRows edits
  // into a single writeCfg 300ms after the last edit.
  let padSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelPadSave = (): void => {
    if (padSaveTimer) { clearTimeout(padSaveTimer); padSaveTimer = null; }
  };
  const schedulePadSave = (): void => {
    if (padSaveTimer) clearTimeout(padSaveTimer);
    set({ padSaveState: "saving" });
    padSaveTimer = setTimeout(() => {
      padSaveTimer = null;
      // A stale timer surviving a design switch must never wipe the old cfg: an empty
      // table never legitimately autosaves (writes only follow a patch on non-empty rows).
      if (!get().padRows.length) return;
      const filelist = useDesign.getState().filelist;
      if (!filelist) return;
      const overlay = overlayFromRows(get().padRows);
      dftPad.writeCfg(filelist, JSON.stringify(overlay, null, 2) + "\n")
        .then(() => set({ padSaveState: "saved" }))
        .catch((e) => set({ padError: e instanceof Error ? e.message : String(e), padSaveState: "idle" }));
    }, 300);
  };

  const blankState = {
    status: "idle" as const,
    error: null,
    loadedReady: null as ReadyResult | null,
    candidateTops: [] as CandidateTop[],
    rootInstanceIds: [] as string[],
    instances: {},
    definitions: {},
    expanded: {},
    selectedId: null,
    tabs: [] as Tab[],
    activeTabId: null,
    schematics: {},
    regCounts: null as RegCountResult | null,
    regCountsError: null as string | null,
    wrapperCells: null as WrapperCellsResult | null,
    wrapperError: null as string | null,
    wrapperBusy: false,
    wrapperPrevCells: null as number | null,
    planSavedAt: null as string | null,
    wrapperAt: null as string | null,
    budgetAt: null as string | null,
    wrapperCone: null as WrapperConeResult | null,
    wrapperConeBusy: false,
    wrapperConeError: null as string | null,
    scanPlan: { families: defaultFamilies(), coverage: {} } as ScanPlan,
    edtDefaults: defaultEdtDefaults(),
    wrapperOptions: defaultWrapperOptions(),
    scanBudget: null as ScanBudgetResult | null,
    scanBudgetError: null as string | null,
    scanBudgetBusy: false,
    drcRev: 0,
    crItems: [],
    setCrItems: (items: CrPathItem[]) => set({ crItems: items }),
    crClocks: [],
    setCrClocks: (clocks: SdcClockInfo[]) => set({ crClocks: clocks }),
    schematicFocusRequest: null,
    requestSchematicFocus: (seedId: string, nodeId: string) =>
      set((s) => ({ schematicFocusRequest: { seedId, nodeId, rev: (s.schematicFocusRequest?.rev ?? 0) + 1 } })),
    highlightedClock: null,
    setHighlightedClock: (seedId: string, clockName: string | null) =>
      set({ highlightedClock: clockName ? { seedId, clockName } : null }),
    crDebugItem: null,
    setCrDebugItem: (item: CrPathItem | null) => set({ crDebugItem: item }),
    lastPlanRev: -1,
    notePlanRev: (rev: number | undefined) => {
      if (rev === undefined) return;
      const s0 = useStore.getState() as unknown as { lastPlanRev: number; drcRev: number };
      if (s0.lastPlanRev === rev) return;
      // The FIRST reply of a session establishes the baseline; it is not a change. Treating it
      // as one re-ran the whole clock/reset analysis the moment any page opened the console.
      const first = s0.lastPlanRev < 0;
      set({ lastPlanRev: rev, drcRev: first ? s0.drcRev : s0.drcRev + 1 } as never);
    },
    padLib: freshPadLib(),
    padRows: [] as PadRow[],
    padWarnings: [] as string[],
    padDropped: [] as string[],
    padLoading: false,
    padError: null as string | null,
    padSaveState: "idle" as "idle" | "saving" | "saved",
    contextMenu: null,
    pendingBlocks: [],
  };

  return {
    ...blankState,

    // Consume the shared daemon's ready result (the design is already open — do NOT call
    // hs.open here). Just seed the candidate tops + initial displayed root; the tree then
    // lazy-expands via hs.expandChildren on demand.
    // Idempotent: if called again with the same ready object (e.g. remount after workspace
    // switch), return immediately so tabs + tree state are preserved.
    loadFromReady: (ready) => {
      if (get().loadedReady === ready) return;
      cancelPadSave();
      set({ ...blankState, padLib: freshPadLib() });
      for (const top of ready.candidateTops) putNode(top, null);
      const rootInstanceIds = ready.candidateTops.length ? [ready.candidateTops[0].id] : [];
      set({ status: "ready", loadedReady: ready, candidateTops: ready.candidateTops, rootInstanceIds });
      const top = ready.candidateTops[0];
      if (top) {
        get().selectInstance({ nodeId: top.id, defId: top.definitionId });
        // Default-open the first level so the tree isn't a lone collapsed root.
        void get().toggleExpand(top.id);
      }
    },

    reset: () => { cancelPadSave(); set({ ...blankState, padLib: freshPadLib() }); },

    setDisplayedRoots: (ids) => set({ rootInstanceIds: ids }),

    toggleExpand: async (id) => {
      const node = get().instances[id];
      if (!node || node.isLeaf) return;
      if (!node.childrenLoaded) {
        try {
          const res = await hs.expandChildren(id);
          for (const c of res.children) putNode(c, id);
          set((s) => ({ instances: { ...s.instances, [id]: { ...s.instances[id], childrenLoaded: true, childInstanceIds: res.childInstanceIds } } }));
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
          return;
        }
      }
      set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } }));
    },

    // Tree-row click: mark selection (tree highlight + shared store) and open/activate the
    // singleton ports tab in the center. There is at most ONE ports tab; selecting a different
    // instance updates it in place (follow-selection). Daemon-free — PortsTab re-fetches
    // whenever its nodeId changes.
    selectInstance: (ref) => {
      set({ selectedId: ref.nodeId });
      useDesign.getState().select(ref);
      const node = get().instances[ref.nodeId];
      const title = `Ports · ${node ? splitDefId(node.definitionId).designName : ref.nodeId}`;
      const newTab: Tab = { id: PORTS_TAB_ID, kind: "ports", title, nodeId: ref.nodeId, defId: ref.defId };
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.kind === "ports");
        if (idx >= 0) {
          // Replace the existing ports tab in-place (new object so React re-renders).
          const tabs = [...s.tabs];
          tabs[idx] = newTab;
          return { tabs, activeTabId: PORTS_TAB_ID };
        }
        return { tabs: [...s.tabs, newTab], activeTabId: PORTS_TAB_ID };
      });
    },

    // --- tabs (core reducers) ---
    setError: (msg) => set({ error: msg }),
    openCrTreeTab: () =>
      set((s) => (s.tabs.some((t) => t.id === CRTREE_TAB_ID)
        ? { activeTabId: CRTREE_TAB_ID }
        : addTab({ tabs: s.tabs, activeTabId: s.activeTabId },
                 { id: CRTREE_TAB_ID, kind: "crtree", title: "Clock / Reset" }))),
    openTab: (t) => set((s) => addTab({ tabs: s.tabs, activeTabId: s.activeTabId }, t)),
    openHdlTab: (t) => set((s) => upsertTab({ tabs: s.tabs, activeTabId: s.activeTabId }, t)),
    closeTab: (id) => set((s) => removeTab({ tabs: s.tabs, activeTabId: s.activeTabId }, id)),
    setActiveTab: (id) => set({ activeTabId: id }),

    // Singleton DFX Ctrl tab (ports-tab pattern): activate if present, else add. Its content
    // derives from the genconn store (doc.dfxInstances + doc.ctrlIps), so no graph is stored here.
    openDfxCtrlTab: () =>
      set((s) => (s.tabs.some((t) => t.id === DFX_CTRL_TAB_ID)
        ? { activeTabId: DFX_CTRL_TAB_ID }
        : addTab({ tabs: s.tabs, activeTabId: s.activeTabId }, { id: DFX_CTRL_TAB_ID, kind: "dfxctrl", title: "DFX Ctrl" }))),

    // Singleton Register Count tab (same pattern as DFX Ctrl): activate if present, else add.
    // Counts are fetched lazily on first open and cached in regCounts.
    openRegCountTab: async () => {
      set((s) => (s.tabs.some((t) => t.id === REGCOUNT_TAB_ID)
        ? { activeTabId: REGCOUNT_TAB_ID }
        : addTab({ tabs: s.tabs, activeTabId: s.activeTabId }, { id: REGCOUNT_TAB_ID, kind: "regcount", title: "Register Count" })));
      if (get().regCounts) return; // cached
      set({ regCountsError: null });
      try {
        const rc = await hs.getRegisterCounts();
        set({ regCounts: rc });
      } catch (e) {
        set({ regCountsError: e instanceof Error ? e.message : String(e) });
      }
    },

    setScanPlan: (p) => {
      const before = useStore.getState().scanPlan;
      set({ scanPlan: p });
      scheduleScanPlanSave();
      // NO AUTOMATIC RECOMPUTE HERE.
      //
      // It used to fire a debounced budget run whenever the families or a controller's settings
      // changed, so the numbers on screen always matched the settings on screen. That run ends by
      // writing into the SpecGen document (pushBudgetToEdtIps), and a store write that lands in
      // another store while views of both are mounted is a cycle waiting to happen — which is
      // what froze the app on a page switch. Recompute is explicit again: the Recompute button,
      // and "Compute budget now" in the EDT dialog.
      void before;
    },
    setWrapperOptions: (d) => {
      set((s) => ({ wrapperOptions: { ...s.wrapperOptions, ...d } }));
      scheduleScanPlanSave();
    },
    setEdtDefaults: (kind, d) => {
      set((s) => ({ edtDefaults: { ...s.edtDefaults, [kind]: { ...s.edtDefaults[kind], ...d } } }));
      scheduleScanPlanSave();
    },

    /** Pull the plan out of the open project. Called when a project is activated; a project
     *  without one (or with an unreadable one) keeps the defaults rather than failing. */
    saveScanPlanNow: async () => {
      if (scanPlanSaveTimer) { clearTimeout(scanPlanSaveTimer); scanPlanSaveTimer = null; }
      const ok = await useProject.getState().saveScanPlan(scanPlanDoc());
      if (ok) set({ planSavedAt: new Date().toISOString() });
      return ok;
    },

    hydrateScanPlan: async () => {
      const text = await useProject.getState().loadScanPlan();
      if (!text) return;
      const doc = parseScanPlan(text);
      set({
        scanPlan: doc.plan, edtDefaults: doc.edtDefaults, wrapperOptions: doc.wrapper,
        // Bring the cached analysis back with the plan, so opening a project lands on the
        // numbers rather than on "press Analyze".
        wrapperCells: doc.results?.wrapper?.data ?? null,
        wrapperAt: doc.results?.wrapper ? doc.results.wrapper.at : null,
        scanBudget: doc.results?.budget?.data ?? null,
        budgetAt: doc.results?.budget ? doc.results.budget.at : null,
        wrapperPrevCells: null,
      });
    },

    /** Build the budget request FROM THE PLAN and run it — the same derivation the Scan Planner
     *  uses, lifted into the store so the EDT dialog can trigger it too. A controller added or
     *  renamed on the canvas after the last run is simply not in the budget, and the dialog was
     *  reporting that as "no budget yet"; being able to recompute from where you noticed is the
     *  fix, not a longer error message. */
    runScanBudgetFromPlan: async () => {
      const s = useStore.getState();
      const rc = s.regCounts;
      if (!rc) { set({ scanBudgetError: "register counts are not loaded yet" }); return; }
      const core = coreOf(rc, useDesign.getState().top)?.instanceId ?? "";
      if (!core) { set({ scanBudgetError: "no elaborated top to budget" }); return; }

      const doc = useGenconnStore.getState().doc;
      // The chain group comes from the canvas, not from a house default: the controller's own
      // ssh_chain_group when it has one, its instance name otherwise. Sending it means the block
      // the Scan Planner writes and the block the canvas generates name the same group.
      const edts: { name: string; external: boolean; group: string }[] = [];
      for (const def of doc.library.defs)
        for (const ip of def.dftIps ?? [])
          if (ip.ipType === "Edt")
            edts.push({ name: ip.instanceName, external: /^ext/i.test(ip.instanceName),
                        group: chainGroupOf(ip) });
      if (!edts.length) {
        set({ scanBudgetError: "no EDT controllers on the DFTSpec Planner canvas" });
        return;
      }

      const plan = s.scanPlan;
      const defaults = s.edtDefaults;
      const fam = (kind: Family["kind"], name?: string) =>
        plan.families.find((x) => (name ? x.name === name : x.kind === kind));
      const globs = (kind: Family["kind"], name?: string) => {
        const f = fam(kind, name);
        return f ? [...f.globs.split(/[,\s]+/).filter(Boolean), ...f.instances] : [];
      };
      const ex = (kind: Family["kind"], name?: string) => fam(kind, name)?.excludes ?? [];

      await useStore.getState().runScanBudget({
        core, designName: core,
        occInstances: globs("normal", "OCC_CHAIN"),
        hyperInstances: globs("normal", "HYPER_CHAIN"),
        nonscanInstances: globs("nonscan"),
        occExcludes: ex("normal", "OCC_CHAIN"),
        hyperExcludes: ex("normal", "HYPER_CHAIN"),
        nonscanExcludes: ex("nonscan"),
        familyOptions: familyTclOptions(plan),
        edts: edts.map((e) => {
          const d = defaults[e.external ? "ext" : "int"];
          const fams = familiesForEdt(plan, defaults, e.name, e.external);
          return {
            name: e.name,
            external: e.external,
            instances: [],
            includeOcc: fams.includes("OCC_CHAIN"),
            includeHyper: fams.includes("HYPER_CHAIN"),
            includeWrapper: fams.includes("WRAPPER"),
            channels: d.channels,
            chainsPerChannel: d.chainsPerChannel,
            targetChainLength: d.targetChainLength,
            sshChainGroup: e.group,
            extraFamilies: extraFamiliesForEdt(plan, defaults, e.name, e.external),
          };
        }),
      });
    },

    /** Write the derived numbers into every matching EDT IP on the DFTSpec Planner canvas.
     *
     *  THREE VIEWS, ONE SOURCE. The numbers appear in the Scan Planner, in the EDT dialog and in
     *  the canvas `dftspec` preview, and until now only the dialog could put them into the
     *  document — and only if you opened it and pressed Save. That is why the preview showed
     *  `Controller (ext_edt) { }` while the dialog beside it showed 270, 330.
     *
     *  Only the four DERIVED fields are touched. Everything else in that IP's config — the
     *  Compactor, ShiftPowerOptions, the Connections with their ssh_chain_group and channel
     *  pipelines — is the engineer's and is left exactly as it is. */
    // WITHDRAWN. This wrote the derived numbers into the SpecGen document from the hierarchy
    // store, and doing that reproducibly black-screens the DFT Stream Planner: push, switch, dead.
    // A cross-store write into a document three other pages render is not something to keep
    // guessing at from a side that cannot load those pages — so it does nothing until it can be
    // exercised against the real renderer.
    //
    // Nothing is lost meanwhile: the EDT dialog fills its own fields from the budget on open, and
    // edt.spec in the Scan Planner carries the full Controller block.
    pushBudgetToEdtIps: () => 0,

    runScanBudget: async (plan) => {
      set({ scanBudgetBusy: true, scanBudgetError: null });
      try {
        set({ scanBudget: await hs.scanBudget(plan), budgetAt: new Date().toISOString() });
        scheduleScanPlanSave();
      } catch (e) {
        set({ scanBudgetError: e instanceof Error ? e.message : String(e) });
      } finally {
        set({ scanBudgetBusy: false });
      }
    },

    // Runs against the design the daemon already holds — there is no filelist to supply.
    // Asked for one port at a time, with the SAME options the estimate ran with — a picture
    // drawn under different thresholds would be a picture of a different decision.
    openWrapperCone: async (port, bit) => {
      const s0 = useStore.getState();
      set({ wrapperConeBusy: true, wrapperConeError: null, wrapperCone: null });
      try {
        set({ wrapperCone: await hs.wrapperCone({
          ...s0.wrapperOptions, core: s0.wrapperCells?.core ?? "", port, bit }) });
      } catch (e) {
        set({ wrapperConeError: e instanceof Error ? e.message : String(e) });
      } finally {
        set({ wrapperConeBusy: false });
      }
    },
    closeWrapperCone: () => set({ wrapperCone: null, wrapperConeError: null }),

    runWrapperAnalysis: async (params) => {
      const prev = useStore.getState().wrapperCells;
      set({ wrapperBusy: true, wrapperError: null,
            wrapperPrevCells: prev ? prev.wrapperIn + prev.wrapperOut : null });
      try {
        set({ wrapperCells: await hs.wrapperCells(params),
              wrapperAt: new Date().toISOString() });
        scheduleScanPlanSave();
      } catch (e) {
        set({ wrapperError: e instanceof Error ? e.message : String(e) });
      } finally {
        set({ wrapperBusy: false });
      }
    },

    // Singleton Pad/BScan tab (regcount pattern): activate if present, else add;
    // table is fetched lazily on first open when a lib is already known.
    openDfxIpTab: () => {
      set((s) => upsertTab(s, { id: "dfxip", kind: "dfxip", title: "DFX IP" }));
    },

    openPadTab: async () => {
      set((s) => (s.tabs.some((t) => t.id === PAD_TAB_ID)
        ? { activeTabId: PAD_TAB_ID }
        : addTab({ tabs: s.tabs, activeTabId: s.activeTabId }, { id: PAD_TAB_ID, kind: "pad", title: "Pad/BScan" })));
      if (get().padRows.length || get().padLoading) return; // cached / in flight
      if (get().padLib) await get().refreshPadTable();
    },

    setPadLib: async (p) => {
      if (typeof localStorage !== "undefined") localStorage.setItem(PAD_LIB_LS_KEY, p);
      set({ padLib: p });
      await get().refreshPadTable();
    },

    refreshPadTable: async () => {
      const lib = get().padLib;
      const filelist = useDesign.getState().filelist;
      if (!lib || !filelist) return;
      set({ padLoading: true, padError: null });
      try {
        const r: PadTableResult = await dftPad.table(filelist, lib);
        let rows = r.pads, dropped: string[] = [], warnings = r.warnings;
        const cfgText = await dftPad.readCfg(filelist);
        if (cfgText) {
          try {
            const cfg = JSON.parse(cfgText) as { pads?: Record<string, Record<string, string>> };
            const m = mergeCfg(r.pads, cfg);
            rows = m.rows; dropped = m.dropped;
          } catch {
            warnings = [...warnings, "Failed to parse pad_cfg.json, ignored (will be overwritten on next save)"];
          }
        }
        set({ padRows: rows, padWarnings: warnings, padDropped: dropped, padLoading: false });
      } catch (e) {
        set({ padLoading: false, padError: e instanceof Error ? e.message : String(e) });
      }
    },

    patchPadRows: (paths, patch) => {
      const sel = paths instanceof Set ? paths : new Set(paths as string[]);
      set((s) => ({
        padRows: s.padRows.map((r) => (sel.has(r.path) ? { ...r, ...patch } : r)),
      }));
      schedulePadSave();
    },

    openHdlDefinition: async (nodeId) => {
      const node = get().instances[nodeId];
      if (!node) return;
      const def = get().definitions[node.definitionId];
      try {
        const loc = await hs.sourceLocation({ kind: "definition", defId: node.definitionId });
        get().openHdlTab({ id: HDL_TAB_ID, kind: "hdl", title: `${def?.designName ?? "def"} ▸ def`, file: loc.file, line: loc.line, which: "definition", objectId: node.definitionId });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },
    // Open the HDL definition of ANY hierarchical instance path, even one that was never
    // expanded in the tree. The clock/reset exact-circuit views build their graphs straight
    // from the walk (no revealInstance), so their nodes are absent from `instances` and the
    // plain openHdlDefinition() silently did nothing — that is why Show HDL Definition
    // appeared dead there. Reveal first, then delegate.
    openHdlForPath: async (instPath) => {
      if (!instPath) return;
      try {
        if (!get().instances[instPath]) await get().revealInstance(instPath);
        if (!get().instances[instPath]) {
          set({ error: `not reachable from the displayed top(s): ${instPath}` });
          return;
        }
        await get().openHdlDefinition(instPath);
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },
    openHdlDefinitionByDefId: async (defId, title) => {
      if (!defId) return;
      try {
        const loc = await hs.sourceLocation({ kind: "definition", defId });
        get().openHdlTab({ id: HDL_TAB_ID, kind: "hdl", title: `${title} ▸ def`, file: loc.file, line: loc.line, which: "definition", objectId: defId });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },
    openHdlInstantiation: async (nodeId) => {
      const node = get().instances[nodeId];
      if (!node || node.parentInstanceId === null) return; // root has no instantiation site
      try {
        const loc = await hs.sourceLocation({ kind: "instantiation", nodeId });
        get().openHdlTab({ id: HDL_TAB_ID, kind: "hdl", title: `${node.instanceName} ▸ inst`, file: loc.file, line: loc.line, which: "instantiation", objectId: nodeId });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    // --- Show on (hierarchical) schematic: seed a graph from this instance's box, then
    // grow it by tracing pins (doc 2026-06-25-show-on-schematic.md §2-3). ---
    openSchematic: async (nodeId, opts) => {
      const node = get().instances[nodeId];
      if (!node) return;
      // Seed the graph once, keyed by seedNodeId. The reuse tab and any dedicated new-tab
      // showing the same instance share this one graph (identical content = identical cone).
      if (!get().schematics[nodeId]) {
        try {
          const { ports } = await hs.getPorts({ nodeId });
          const seed = makeNode(nodeId, node.instanceName, node.definitionId, node.kind, ports, { isLeaf: node.isLeaf });
          set((s) => ({ schematics: { ...s.schematics, [nodeId]: newSchematic(seed) } }));
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
          return;
        }
      }
      const title = `${node.instanceName} ▸ schematic`;
      if (opts?.newTab) {
        // Explicit "…in New Tab": a dedicated tab that coexists with the reuse tab.
        get().openTab({ id: `sch:${nodeId}`, kind: "schematic", title, seedNodeId: nodeId });
        return;
      }
      // Default: reuse the singleton schematic tab (ports-tab pattern) — update its
      // seedNodeId/title in place so a different instance replaces the content.
      const reuse: Tab = { id: SCHEMATIC_TAB_ID, kind: "schematic", title, seedNodeId: nodeId };
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === SCHEMATIC_TAB_ID);
        if (idx >= 0) {
          const tabs = [...s.tabs];
          tabs[idx] = reuse;
          return { tabs, activeTabId: SCHEMATIC_TAB_ID };
        }
        return { tabs: [...s.tabs, reuse], activeTabId: SCHEMATIC_TAB_ID };
      });
    },

    // --- Add to CURRENT schematic: composite this instance into the schematic the user is
    // looking at (the active schematic tab, else the reuse singleton), auto-wiring it to the
    // instances already on the graph. No schematic open yet → same as openSchematic (show). ---
    addToSchematic: async (nodeId) => {
      const st = get();
      const node = st.instances[nodeId];
      if (!node) return;
      const active = st.tabs.find((t) => t.id === st.activeTabId);
      let target = active && active.kind === "schematic" ? active : undefined;
      if (!target) {
        const reuse = st.tabs.find((t) => t.id === SCHEMATIC_TAB_ID);
        if (reuse && reuse.kind === "schematic") target = reuse;
      }
      // Nothing to add to yet → fall back to "show" (creates + seeds a schematic from this instance).
      if (!target || !st.schematics[target.seedNodeId]) { await get().openSchematic(nodeId); return; }
      const seedId = target.seedNodeId, targetId = target.id;
      // Already on this graph → just bring its tab forward (idempotent).
      if (st.schematics[seedId].nodes[nodeId]) { set({ activeTabId: targetId }); return; }
      try {
        const { ports } = await hs.getPorts({ nodeId });
        const bNode = makeNode(nodeId, node.instanceName, node.definitionId, node.kind, ports, { isLeaf: node.isLeaf });
        // Trace every pin; inout drives AND loads. Collect all reached edges, then keep only
        // those wiring this box to instances already on the graph (keepInternalEdges).
        const traced: SchEdge[] = [];
        for (const p of ports) {
          const dirs: ("fanin" | "fanout")[] =
            p.direction === "inout" ? ["fanin", "fanout"] : p.direction === "out" ? ["fanout"] : ["fanin"];
          for (const dir of dirs) {
            const res = dir === "fanin" ? await hs.traceFanin(nodeId, p.name) : await hs.traceFanout(nodeId, p.name);
            for (const e of res.edges) {
              traced.push({ id: edgeId(e.fromNode, e.fromPort, e.toNode, e.toPort), fromNode: e.fromNode, fromPort: e.fromPort, toNode: e.toNode, toPort: e.toPort, netName: e.netName, bus: e.bus });
            }
          }
        }
        const existingIds = new Set([...Object.keys(get().schematics[seedId].nodes), nodeId]);
        const edges = keepInternalEdges(existingIds, traced);
        // Blackbox box may lack the touched pin (daemon returns no ports) — synthesize it.
        const ensure = (n: SchNode, name: string, direction: Direction): void => {
          if (!n.ports.some((p) => p.name === name)) n.ports.push({ name, direction, busLabel: name });
        };
        for (const e of edges) {
          if (e.fromNode === nodeId) ensure(bNode, e.fromPort, "out");
          if (e.toNode === nodeId) ensure(bNode, e.toPort, "in");
        }
        set((s) => ({ schematics: { ...s.schematics, [seedId]: addNodeWithEdges(s.schematics[seedId], bNode, edges) }, activeTabId: targetId }));
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    // seedNodeId identifies WHICH cached graph to grow (the reuse tab passes its current
    // seed); nodeId is the clicked pin's owner within that cone.
    /** Source node for a PORT driver, by the display rule: the FLAG pentagon belongs to the
     *  DESIGN TOP's ports only ("一定只能是当前设计顶层才显示那样的 port"). A port of an inner
     *  module renders as that module's OUTLINE box with the port on its edge — the reader sees
     *  whose boundary the signal crossed, and realPath keeps Show HDL / Open in Schematic
     *  working so the trace continues one level up instead of dead-ending at a bare flag. */
    portAwareSourceNode: ((src: DriverSource, parentId: string | undefined, drivenNet: string): SchNode => {
      const pin = src.net || src.label;
      const ownerId = src.kind === "port" && src.id.startsWith("port:") && pin &&
                      src.id.endsWith("." + pin)
        ? src.id.slice("port:".length, src.id.length - pin.length - 1) : "";
      const roots = get().rootInstanceIds;
      if (ownerId && !roots.includes(ownerId)) {
        const defId = get().instances[ownerId]?.definitionId;
        return {
          id: src.id,
          instanceName: ownerId.split(".").pop() ?? ownerId,
          designName: defId ? splitDefId(defId).designName : "",
          kind: "module", isLeaf: true,
          realPath: ownerId,
          ports: [{ name: pin, direction: "out", busLabel: drivenNet || pin }],
          ...(parentId ? { parentId } : {}),
        };
      }
      return makeSourceNode(src, parentId, drivenNet);
    }) as never,

    traceSchematic: async (seedNodeId, nodeId, port, dir) => {
      const graph = get().schematics[seedNodeId];
      if (!graph) return;
      try {
        // An inner-module PORT source renders as the owner's outline box, whose node id is the
        // synthetic `port:<owner>.<pin>` — an id the daemon has never heard of, so asking it
        // about that id answered nothing and the pin died ("clock module 为什么不能 trace").
        // realPath carries the owner's REAL instance path: query THAT, keep drawing on the
        // synthetic node.
        const qNode = graph.nodes[nodeId]?.realPath ?? nodeId;
        // A `logic:` node is a STATEMENT, not an instance — trace-fanin/trace-drivers key on
        // (instance, port) and answer nothing for it, so the OR gate's input diamond was a
        // guaranteed dead end ("or gate 又无法往前 trace"). Its fan-in is trace-logic: the
        // signals the statement reads, with their drivers.
        const res = nodeId.startsWith("logic:")
          ? { edges: [], nodes: [], truncated: false }
          : dir === "fanin" ? await hs.traceFanin(qNode, port) : await hs.traceFanout(qNode, port);
        if (res.edges.length === 0) {
          // No sibling-instance driver/load: resolve BEHAVIORALLY — fanin via trace-drivers,
          // fanout via trace-loads (statements READING the net; primary outputs report
          // themselves). Only when that too is empty is the pin a real dead end.
          if (dir === "fanout") {
            // A `logic:` node is a STATEMENT — trace-loads keys on (instance, port) and knows
            // nothing about it, so every forward trace DIED at the first gate/assign and a
            // reset that feeds registers LOOKED like it feeds none ("trace netlist 并没有发现
            // 它 drive 寄存器"). Its fan-out is the loads of the NET it drives, asked of the
            // owning scope: child-instance pins, behavioral readers, the boundary exit.
            let dl;
            if (nodeId.startsWith("logic:") && !nodeId.includes("#")) {
              const rest = nodeId.slice(6);
              const c0 = rest.indexOf(":");
              const scope = c0 > 0 && !rest.slice(0, c0).includes("/") ? rest.slice(0, c0) : "";
              const netName = graph.nodes[nodeId]?.ports.find((p) => p.name === port)?.busLabel || port;
              dl = scope ? await hs.traceNetLoads(scope, netName)
                         : { sources: [], netName, bus: false };
            } else {
              dl = await hs.traceLoads(qNode, port);
            }
            if (dl.sources.length) {
              const net = dl.netName || port;
              const newNodes: SchNode[] = [];
              const edges: SchEdge[] = [];
              for (const src of dl.sources) {
                if (src.id === nodeId) continue;   // a statement is not its own load
                if (!graph.nodes[src.id] && !newNodes.some((n) => n.id === src.id))
                  newNodes.push(makeLoadNode(src, net));
                const toPort = src.kind === "port" ? "i"
                  : src.kind === "instance" ? (src.label || net) : net;
                edges.push({
                  id: edgeId(nodeId, port, src.id, toPort),
                  fromNode: nodeId, fromPort: port, toNode: src.id, toPort,
                  netName: net, bus: src.bus,
                });
              }
              set((s) => {
                const g0 = s.schematics[seedNodeId];
                if (!g0) return {};
                let g = addTrace(g0, nodeId, port, newNodes, edges);
                // A load landing on a box ALREADY on canvas may name a pin it does not show
                // yet — an edge to a nonexistent pin aborts the WHOLE ELK layout (the mclko
                // lesson), so graft the pin onto the box.
                const nodes = { ...g.nodes };
                let grafted = false;
                for (const e of edges) {
                  const n2 = nodes[e.toNode];
                  if (n2 && !n2.ports.some((p) => p.name === e.toPort)) {
                    nodes[e.toNode] = { ...n2, ports: [...n2.ports,
                      { name: e.toPort, direction: "in", busLabel: e.netName || e.toPort }] };
                    grafted = true;
                  }
                }
                if (grafted) g = { ...g, nodes };
                return { schematics: { ...s.schematics, [seedNodeId]: g } };
              });
              return;
            }
          }
          if (dir === "fanin") {
            const dr = nodeId.startsWith("logic:")
              ? await hs.traceLogic(nodeId)
              : await hs.traceDrivers(qNode, port);
            if (dr.sources.length) {
              // dr.netName = the signal these drivers drive -> label logic blocks with it.
              // A source the canvas ALREADY shows (same statement / same signal symbol) is
              // reused — repeated fanin traces used to stack duplicate pentagons/boxes.
              const newNodes: SchNode[] = [];
              const edges: SchEdge[] = [];
              // A STATEMENT node (gate) has one input pin per signal its RHS reads. trace-logic
              // answers for the whole statement, so the pins are rebuilt from the answer: each
              // driver lands on ITS OWN pin, and any placeholder pin from an older build (the
              // generic `a`, or `i0/i1`) disappears — that stale pin is the extra one the user
              // saw sitting between the OR's two real inputs.
              const isStmt = nodeId.startsWith("logic:") && !nodeId.includes("#");
              const sigPins: string[] = [];
              // Owner boxes that gain a boundary pin because a PORT source belongs to a module
              // ALREADY on the canvas (merged into state below).
              const patched: Record<string, SchNode> = {};
              // Where a newly created source box belongs: inside the same container as the node
              // being traced. Left undefined it landed at ROOT — outside the very module it is
              // a port of ("为什么这里 pin 都没有了": the pins had walked out of the container
              // onto free-floating duplicate boxes).
              const homeParent = graph.nodes[nodeId]?.parentId;
              for (const src of dr.sources) {
                // The owner module is on the canvas -> the wire must come from ITS boundary
                // pin, not from a second box standing for the same instance.
                const bp = portSourceBoundary(src, (id) => patched[id] ?? graph.nodes[id]);
                if (bp) {
                  patched[bp.ownerId] =
                    withBoundaryPin(patched[bp.ownerId] ?? graph.nodes[bp.ownerId]!, bp.pin);
                }
                const ex0 = bp ? null : findExistingSource(graph.nodes, src);
                const fromNode = bp ? bp.ownerId : ex0 ? ex0.nodeId : src.id;
                if (!bp && !ex0 && !graph.nodes[src.id] && !newNodes.some((n) => n.id === src.id))
                  newNodes.push((get() as unknown as {
                    portAwareSourceNode(s: DriverSource, p: string | undefined, n: string): SchNode;
                  }).portAwareSourceNode(src, homeParent, dr.netName || port));
                // The edge must name the pin the source NODE really has: an inner-module port
                // renders as the owner outline whose pin is the port name, not "o" — a
                // convention-only fromPort made ELK abort the whole layout (dead-click bug).
                const fromPort = bp ? bp.pin : ex0 ? ex0.port
                  : sourceNodeOutPort(graph.nodes[src.id] ?? newNodes.find((n) => n.id === src.id), sourceOutPort(src));
                const sig = src.net || src.label;
                const toPort = isStmt && sig ? sig : port;
                if (isStmt && sig && !sigPins.includes(sig)) sigPins.push(sig);
                edges.push({
                  id: edgeId(fromNode, fromPort, nodeId, toPort),
                  fromNode, fromPort, toNode: nodeId, toPort,
                  netName: sig || dr.netName, bus: src.bus,
                });
              }
              set((s) => {
                const g0 = s.schematics[seedNodeId];
                if (!g0) return {};
                let g = addTrace(g0, nodeId, port, newNodes, edges);
                const n = g.nodes[nodeId];
                if (isStmt && sigPins.length && n) {
                  const outs = n.ports.filter((pp) => pp.direction === "out");
                  const ins = sigPins.map((sig) => ({
                    name: sig, direction: "in" as const, busLabel: sig }));
                  g = { ...g, nodes: { ...g.nodes, [nodeId]: { ...n, ports: [...ins, ...outs] } } };
                }
                // Boundary pins gained by on-canvas owner modules — grafted onto the CURRENT
                // node (state may have moved during the await), never replacing it wholesale.
                if (Object.keys(patched).length) {
                  const nodes = { ...g.nodes };
                  for (const [id, pn] of Object.entries(patched)) {
                    const cur = nodes[id];
                    if (!cur) { nodes[id] = pn; continue; }
                    const add = pn.ports.filter((p) => !cur.ports.some((q) => q.name === p.name));
                    if (add.length) nodes[id] = { ...cur, ports: [...cur.ports, ...add] };
                  }
                  g = { ...g, nodes };
                }
                return { schematics: { ...s.schematics, [seedNodeId]: g } };
              });
              return;
            }
          }
          set((s) => ({ schematics: { ...s.schematics, [seedNodeId]: markEmpty(s.schematics[seedNodeId], nodeId, port) } }));
          return;
        }
        // Build a box (with full ports) for each newly-reached instance; synthesize the
        // touched pin if the instance is a blackbox (daemon returns no ports for it).
        const newNodes: SchNode[] = [];
        for (const m of res.nodes) {
          if (graph.nodes[m.id]) continue;
          const { ports } = await hs.getPorts({ nodeId: m.id });
          // Default = CONNECTED pins only (per user: a big module's full pin list drowns the
          // canvas). "Select Visible Pins…" on the box brings any of the rest back.
          const touched = ports.filter((p) => res.edges.some((e) =>
            (e.fromNode === m.id && e.fromPort === p.name) || (e.toNode === m.id && e.toPort === p.name)));
          newNodes.push(makeNode(m.id, m.instanceName, m.definitionId, m.kind, touched.length ? touched : ports, { isLeaf: m.isLeaf }));
        }
        const ensure = (n: SchNode, name: string, direction: Direction): void => {
          if (!n.ports.some((p) => p.name === name)) n.ports.push({ name, direction, busLabel: name });
        };
        const byId: Record<string, SchNode> = {};
        for (const n of newNodes) byId[n.id] = n;
        // Boxes ALREADY on canvas that an edge touches through a pin they do not show yet
        // (PROCESSOR_1 arrived showing only mclk; tracing CEN adds an edge from its pmem_cen).
        // ensure() on new nodes alone left that edge pointing at a nonexistent pin — ELK
        // aborts the WHOLE layout on it, and from then on every click LOOKS dead.
        const patched: Record<string, SchNode> = {};
        const graft = (id: string, name: string, direction: Direction): void => {
          const cur = patched[id] ?? graph.nodes[id];
          if (!cur || cur.ports.some((p) => p.name === name)) return;
          patched[id] = { ...cur, ports: [...cur.ports, { name, direction, busLabel: name }] };
        };
        const edges: SchEdge[] = res.edges.map((e) => {
          if (byId[e.fromNode]) ensure(byId[e.fromNode], e.fromPort, "out");
          else graft(e.fromNode, e.fromPort, "out");
          if (byId[e.toNode]) ensure(byId[e.toNode], e.toPort, "in");
          else graft(e.toNode, e.toPort, "in");
          return { id: edgeId(e.fromNode, e.fromPort, e.toNode, e.toPort), fromNode: e.fromNode, fromPort: e.fromPort, toNode: e.toNode, toPort: e.toPort, netName: e.netName, bus: e.bus };
        });
        set((s) => {
          const g0 = s.schematics[seedNodeId];
          if (!g0) return {};
          let g = addTrace(g0, nodeId, port, newNodes, edges);
          if (Object.keys(patched).length) {
            const nodes = { ...g.nodes };
            for (const [id, pn] of Object.entries(patched)) {
              const cur = nodes[id];
              if (!cur) { nodes[id] = pn; continue; }
              // graft onto the CURRENT node (state may have moved since the await)
              const add = pn.ports.filter((p) => !cur.ports.some((q) => q.name === p.name));
              if (add.length) nodes[id] = { ...cur, ports: [...cur.ports, ...add] };
            }
            g = { ...g, nodes };
          }
          return { schematics: { ...s.schematics, [seedNodeId]: g } };
        });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    // 内侧菱形:跨进 nodeId 内部一步(spec §2/§3.2)。sources 与结构边同响应,一次落图。
    traceInside: async (seedNodeId, nodeId, port) => {
      const graph = get().schematics[seedNodeId];
      if (!graph) return;
      try {
        // Same synthetic-id rule as traceSchematic: an outline box asks about its realPath.
        const res = await hs.traceInto(graph.nodes[nodeId]?.realPath ?? nodeId, port);
        if (res.edges.length === 0 && res.sources.length === 0) {
          set((s) => ({ schematics: { ...s.schematics, [seedNodeId]: markInEmpty(s.schematics[seedNodeId], nodeId, port) } }));
          return;
        }
        const newNodes: SchNode[] = [];
        for (const m of res.nodes) {
          if (graph.nodes[m.id]) continue;
          const { ports } = await hs.getPorts({ nodeId: m.id });
          const touched = ports.filter((p) => res.edges.some((e) =>
            (e.fromNode === m.id && e.fromPort === p.name) || (e.toNode === m.id && e.toPort === p.name)));
          newNodes.push(makeNode(m.id, m.instanceName, m.definitionId, m.kind, touched.length ? touched : ports, { isLeaf: m.isLeaf, parentId: nodeId }));
        }
        const ensure = (n: SchNode, name: string, direction: Direction): void => {
          if (!n.ports.some((p) => p.name === name)) n.ports.push({ name, direction, busLabel: name });
        };
        const byId: Record<string, SchNode> = {};
        for (const n of newNodes) byId[n.id] = n;
        // Same as traceSchematic: an edge touching an ON-CANVAS box through a pin it does not
        // show yet must graft that pin, or ELK aborts the whole layout.
        const patched: Record<string, SchNode> = {};
        const graft = (id: string, name: string, direction: Direction): void => {
          const cur = patched[id] ?? graph.nodes[id];
          if (!cur || cur.ports.some((p) => p.name === name)) return;
          patched[id] = { ...cur, ports: [...cur.ports, { name, direction, busLabel: name }] };
        };
        const edges: SchEdge[] = res.edges.map((e) => {
          if (byId[e.fromNode]) ensure(byId[e.fromNode], e.fromPort, "out");
          else if (e.fromNode !== nodeId) graft(e.fromNode, e.fromPort, "out");
          if (byId[e.toNode]) ensure(byId[e.toNode], e.toPort, "in");
          else if (e.toNode !== nodeId) graft(e.toNode, e.toPort, "in");
          return { id: edgeId(e.fromNode, e.fromPort, e.toNode, e.toPort), fromNode: e.fromNode, fromPort: e.fromPort, toNode: e.toNode, toPort: e.toPort, netName: e.netName, bus: e.bus };
        });
        // 行为源画进容器内:出脚的 sources 是内部驱动(边指向边界引脚);入脚的 sources 是
        // 内部读者(边从边界引脚指向读者)—— 纯 RTL 模块的输入以前在这里死路。
        const inPin = graph.nodes[nodeId]?.ports.find((q) => q.name === port)?.direction === "in";
        for (const src of res.sources) {
          if (inPin) {
            const net = res.netName || port;
            if (!graph.nodes[src.id] && !byId[src.id]) {
              const ln = makeLoadNode(src, net, nodeId);
              byId[ln.id] = ln;
              newNodes.push(ln);
            }
            const toPort = src.kind === "port" ? "i" : net;
            edges.push({ id: edgeId(nodeId, port, src.id, toPort), fromNode: nodeId, fromPort: port, toNode: src.id, toPort, netName: net, bus: src.bus });
            continue;
          }
          // Reuse an on-canvas twin (same statement / same source signal) before creating one.
          const ex0 = findExistingSource({ ...graph.nodes, ...byId }, src);
          if (ex0) {
            edges.push({ id: edgeId(ex0.nodeId, ex0.port, nodeId, port), fromNode: ex0.nodeId, fromPort: ex0.port, toNode: nodeId, toPort: port, netName: res.netName, bus: src.bus });
            continue;
          }
          if (!graph.nodes[src.id] && !byId[src.id]) {
            const sn = (get() as unknown as {
              portAwareSourceNode(s: DriverSource, p: string | undefined, n: string): SchNode;
            }).portAwareSourceNode(src, nodeId, res.netName || port);
            byId[sn.id] = sn;
            newNodes.push(sn);
          }
          const op = sourceNodeOutPort(byId[src.id] ?? graph.nodes[src.id], sourceOutPort(src));
          edges.push({ id: edgeId(src.id, op, nodeId, port), fromNode: src.id, fromPort: op, toNode: nodeId, toPort: port, netName: res.netName, bus: src.bus });
        }
        set((s) => {
          const g0 = s.schematics[seedNodeId];
          if (!g0) return {};
          let g = addTraceInto(g0, nodeId, port, newNodes, edges);
          if (Object.keys(patched).length) {
            const nodes = { ...g.nodes };
            for (const [id, pn] of Object.entries(patched)) {
              const cur = nodes[id];
              if (!cur) { nodes[id] = pn; continue; }
              const add = pn.ports.filter((p) => !cur.ports.some((q) => q.name === p.name));
              if (add.length) nodes[id] = { ...cur, ports: [...cur.ports, ...add] };
            }
            g = { ...g, nodes };
          }
          return { schematics: { ...s.schematics, [seedNodeId]: g } };
        });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    // trace-through:展开 logic 节点的输入 —— 每个输入源(端口/其它 logic)连到 logic 节点上
    // 新合成的输入引脚(i0,i1,…),logic 节点因此长出输入行、渲染成一个逻辑盒子。
    setVisiblePins: (seedNodeId, nodeId, chosen, full) =>
      set((s) => {
        const g = s.schematics[seedNodeId];
        const n = g?.nodes[nodeId];
        if (!g || !n) return {};
        const connected = new Set<string>();
        for (const e of g.edges) {
          if (e.fromNode === nodeId) connected.add(e.fromPort);
          if (e.toNode === nodeId) connected.add(e.toPort);
        }
        const ports = visiblePorts(full, new Set(chosen), connected);
        return { schematics: { ...s.schematics, [seedNodeId]: { ...g, nodes: { ...g.nodes, [nodeId]: { ...n, ports } } } } };
      }),

    hideLogicCells: (seedNodeId, logicId) =>
      set((s) => {
        const g = s.schematics[seedNodeId];
        const n = g?.nodes[logicId];
        if (!g || !n) return {};
        const inner = collapseInsideGraph(g, logicId);
        // Back to the compact pre-decompose form: output pins only, expand diamonds re-armed.
        const outs = n.ports.filter((p) => p.direction === "out");
        const okPins = new Set(outs.map((p) => p.name));
        const nodes = { ...inner.nodes, [logicId]: { ...n, ports: outs } };
        const edges = inner.edges.filter((e) =>
          (e.fromNode !== logicId || okPins.has(e.fromPort)) &&
          (e.toNode !== logicId || okPins.has(e.toPort)));
        const expanded = { ...inner.expanded };
        delete expanded[logicId];
        const empty = { ...inner.empty };
        delete empty[logicId];
        return { schematics: { ...s.schematics,
          [seedNodeId]: pruneOrphanSources({ ...inner, nodes, edges, expanded, empty }) } };
      }),

    traceLogicInputs: async (seedNodeId, logicId) => {
      const graph = get().schematics[seedNodeId];
      if (!graph) return;
      const logic = graph.nodes[logicId];
      if (!logic) return;
      try {
        const dr = await hs.traceLogic(logicId);
        // PIN IDENTITY = THE SIGNAL NAME — the same scheme Show RTL Primitives uses. The two
        // features used to disagree (this one named pins positionally `i0, i1…`, decompose named
        // them by signal); dedupe compares names, so running both on one block produced two pins
        // DISPLAYING the same signal — the "two dco_clk inputs" bug. One scheme, natural dedupe.
        // Outputs are preserved; boundary pins that feed the block's own internals (decompose
        // wired container-port -> cell) also survive, or those internal wires would dangle.
        const feedsInternals = new Set(
          graph.edges.filter((e) => e.fromNode === logicId).map((e) => e.fromPort));
        const inPorts = logic.ports.filter(
          (p) => p.direction === "out" || (feedsInternals.has(p.name) && !/^i\d+$/.test(p.name)));
        const freshSigs: string[] = [];
        const newNodes: SchNode[] = [];
        const byId: Record<string, SchNode> = {};
        const edges: SchEdge[] = [];
        // Owner boxes that gained a boundary pin for a port source (merged into state below).
        const patched: Record<string, SchNode> = {};
        // Constants never cross a DECOMPOSED box's boundary: the internals already show the
        // literal inline — an outer `1'b0` pentagon + fake pin would be the same value twice.
        const decomposed = Object.values(graph.nodes).some((x) => x.parentId === logicId);
        dr.sources.forEach((src, i) => {
          if (src.kind === "constant" && decomposed) return;
          const sig = src.net || src.label || `i${i}`;
          const pin = sig;
          if (!freshSigs.includes(sig)) freshSigs.push(sig);
          if (!inPorts.some((p) => p.name === pin))
            inPorts.push({ name: pin, direction: "in", busLabel: sig });
          // A "port" source whose owner box is on the canvas wires to that box's REAL boundary
          // pin — added if the box doesn't show it yet. The pin keeps its fanin diamond, so the
          // trace continues upward; a standalone pentagon would be a dead end.
          let fromNode = src.id, fromPort = sourceOutPort(src);
          const bp = portSourceBoundary(src, (id) => patched[id] ?? graph.nodes[id]);
          const ex0 = bp ? null : findExistingSource({ ...graph.nodes, ...byId }, src);
          if (bp) {
            patched[bp.ownerId] = withBoundaryPin(patched[bp.ownerId] ?? graph.nodes[bp.ownerId]!, bp.pin);
            fromNode = bp.ownerId;
            fromPort = bp.pin;
          } else if (ex0) {
            // The canvas already shows this statement/signal — wire from it, never duplicate.
            fromNode = ex0.nodeId;
            fromPort = ex0.port;
          } else if (src.kind === "instance") {
            // Instance driver already boxed on the canvas but not showing this output yet.
            const ex = patched[src.id] ?? graph.nodes[src.id];
            if (ex && !ex.ports.some((p) => p.name === src.label))
              patched[src.id] = { ...ex, ports: [...ex.ports, { name: src.label, direction: "out", busLabel: src.net || src.label }] };
          }
          if (fromNode === src.id && !graph.nodes[src.id] && !byId[src.id]) {
            // drivenNet = the signal, so the block box is named by what it drives
            // ("nodiv_mclk") instead of every one of them reading "assign".
            const sn = (get() as unknown as {
              portAwareSourceNode(s: DriverSource, p: string | undefined, n: string): SchNode;
            }).portAwareSourceNode(src, logic.parentId, src.net ?? "");
            byId[sn.id] = sn;
            newNodes.push(sn);
          }
          if (fromNode === src.id)
            fromPort = sourceNodeOutPort(byId[src.id] ?? graph.nodes[src.id], fromPort);
          edges.push({ id: edgeId(fromNode, fromPort, logicId, pin), fromNode, fromPort, toNode: logicId, toPort: pin, netName: sig, bus: src.bus });
        });
        const updatedLogic: SchNode = { ...logic, ports: inPorts };
        set((s) => {
          const g = s.schematics[seedNodeId];
          if (!g) return {};
          const nodes: Record<string, SchNode> = { ...g.nodes, [logicId]: updatedLogic };
          for (const n of newNodes) if (!nodes[n.id]) nodes[n.id] = n;
          // Boundary pins added for port sources: graft onto the CURRENT box (state may have
          // moved since the await), never replace it wholesale.
          for (const [id, pn] of Object.entries(patched)) {
            const cur = nodes[id];
            if (!cur) { nodes[id] = pn; continue; }
            const add = pn.ports.filter((p) => !cur.ports.some((q) => q.name === p.name));
            if (add.length) nodes[id] = { ...cur, ports: [...cur.ports, ...add] };
          }
          // Drop the wires this re-trace supersedes: everything into a legacy positional pin
          // (`i<n>` — the naming this function no longer produces) and everything into a signal
          // we just got fresh sources for. Wires into OTHER signal-named pins (e.g. a decompose
          // boundary pin this trace did not cover) stay connected.
          const rewired = new Set(freshSigs);
          const kept = g.edges.filter((e) =>
            e.toNode !== logicId || (!/^i\d+$/.test(e.toPort) && !rewired.has(e.toPort)));
          const have = new Set(kept.map((e) => e.id));
          const allEdges = [...kept, ...edges.filter((e) => !have.has(e.id))];
          // mark the logic node input-expanded (hides its expand diamond; dead-end if empty)
          const prevX = g.expanded[logicId] ?? [];
          const expanded = prevX.includes("in") ? g.expanded : { ...g.expanded, [logicId]: [...prevX, "in"] };
          const empty = dr.sources.length === 0
            ? { ...g.empty, [logicId]: [...(g.empty[logicId] ?? []), "in"] }
            : g.empty;
          // Rebuilding the wires can strand the source boxes an earlier trace created; drop the
          // ones nothing points at any more so a superseded source cannot linger on the canvas.
          const merged = pruneOrphanSources({ ...g, nodes, edges: allEdges, expanded, empty });
          return { schematics: { ...s.schematics, [seedNodeId]: merged } };
        });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    // P2: replace a behavioral block with the RTL primitives it infers to (gates / MUX / DFF).
    // Cells become nodes inside a container named after the block, wired by their pin refs:
    //   cell:<id> -> an edge from that cell's output pin
    //   sig:<n>   -> the module boundary pin when the owner is on the graph, else a port symbol
    //   const:<v> -> a small constant node
    expandLogicCells: async (seedNodeId, logicId) => {
      const graph = get().schematics[seedNodeId];
      if (!graph) return;
      const logic = graph.nodes[logicId];
      if (!logic) return;
      try {
        const dc = await hs.decomposeLogic(logicId);
        // Never fail silently — "nothing happened" is indistinguishable from a broken build.
        if (dc.cells.length === 0) {
          set({ error: `No RTL primitives inferred for ${logic.designName} (${logic.loc?.file ?? "?"}:${logic.loc?.line ?? "?"}). ` +
                       `The block may be empty, or the running dft-core may predate decompose-logic.` });
          return;
        }
        const nodes: Record<string, SchNode> = {};
        const edges: SchEdge[] = [];
        // Boxes already on the graph that gained a boundary pin for a port source; the merge
        // grafts their added pins onto the current state instead of skipping them.
        const patchedOwners = new Set<string>();
        const cellNodeId = (cid: string) => `${logicId}#${cid}`;

        // The block becomes the container holding its primitives, and gains a real boundary
        // port for every signal it reads. Without these, wires from the parent module would
        // cut through the container frame with no port to pass through (repairBoundaryCrossings
        // would then have to dash them). With them the structure is honest: parent pin ->
        // block boundary port -> cell pin.
        const ports = [...logic.ports];
        for (const sig of dc.inputs)
          if (!ports.some((p) => p.name === sig)) ports.push({ name: sig, direction: "in", busLabel: sig });
        const container: SchNode = { ...logic, ports };
        const owner = logic.parentId ? graph.nodes[logic.parentId] : undefined;
        // A constant bit-select arrives as "a[2:1]" — it still belongs to the parent's pin "a".
        const basePort = (s: string) => s.replace(/\[[^\]]*\]$/, "");
        // Signals whose fan-in is ALREADY wired on the canvas (a prior expand-inputs trace, now
        // that both features name pins by signal): re-wiring them would duplicate the wire.
        const alreadyWired = new Set(
          graph.edges.filter((e) => e.toNode === logicId).map((e) => e.toPort));
        for (const sig of dc.inputs) {
          if (alreadyWired.has(sig)) continue;
          const ownerPin = owner
            ? (owner.ports.some((q) => q.name === sig) ? sig
               : owner.ports.some((q) => q.name === basePort(sig)) ? basePort(sig) : null)
            : null;
          if (ownerPin) {
            // The signal is a boundary pin of the enclosing module -> wire it straight in.
            edges.push({
              id: edgeId(owner!.id, ownerPin, logicId, sig),
              fromNode: owner!.id, fromPort: ownerPin, toNode: logicId, toPort: sig,
              netName: sig, bus: false,
            });
            continue;
          }
          // An internal net of the enclosing module. FIRST look for the box that actually
          // drives it on the canvas — e.g. the sibling `assign nodiv_mclk` block one inch away.
          // Inventing a floating tap while the real driver is visible was the "floating
          // nodiv_mclk net" bug: the tap knew nothing of the true fan-in and connected nothing.
          const drv = findDriverOutput(graph.nodes, sig, { exclude: logicId, parentId: logic.parentId });
          if (drv) {
            edges.push({
              id: edgeId(drv.nodeId, drv.port, logicId, sig),
              fromNode: drv.nodeId, fromPort: drv.port, toNode: logicId, toPort: sig,
              netName: sig, bus: false,
            });
            continue;
          }
          // Not on the canvas: ASK THE DAEMON who drives this net in the real design and put
          // that source box in (an assign/always block, or a boundary port). The old behaviour
          // stopped here with an inert tap — a symbol with no pins, no menu, no trace, which is
          // why `nodiv_mclk` kept reading as a floating dead end no matter how its rendering
          // was polished. The tap below now only survives when the design truly has no driver.
          const ownerId = logic.parentId ?? (() => {
            // derive the owning instance from the per-instance id: logic:<scope>:<file>:<line>
            const rest = logicId.slice(6);
            const c0 = rest.indexOf(":");
            return c0 > 0 && !rest.slice(0, c0).includes("/") ? rest.slice(0, c0) : "";
          })();
          if (ownerId) {
            try {
              const dr = await hs.traceNet(ownerId, sig);
              if (dr.sources.length > 0) {
                for (const src of dr.sources) {
                  // "This net is an input port" -> wire from the owner box's real boundary
                  // pin (adding it if missing) so the fanin diamond keeps the trace alive.
                  // The sync_cell_puc clk/data_in/rst pentagons were exactly this dead end.
                  let fromNode = src.id, fromPort = sourceOutPort(src);
                  const bp = portSourceBoundary(src, (id) => nodes[id] ?? graph.nodes[id]);
                  const ex0 = bp ? null : findExistingSource({ ...graph.nodes, ...nodes }, src);
                  if (ex0 && !bp) {
                    // The canvas already shows this statement/signal — reuse, never duplicate.
                    fromNode = ex0.nodeId;
                    fromPort = ex0.port;
                    edges.push({
                      id: edgeId(fromNode, fromPort, logicId, sig),
                      fromNode, fromPort, toNode: logicId, toPort: sig,
                      netName: sig, bus: src.bus,
                    });
                    continue;
                  }
                  if (bp) {
                    patchedOwners.add(bp.ownerId);
                    nodes[bp.ownerId] = withBoundaryPin(nodes[bp.ownerId] ?? graph.nodes[bp.ownerId]!, bp.pin);
                    fromNode = bp.ownerId;
                    fromPort = bp.pin;
                  } else if (src.kind === "instance" && (nodes[src.id] || graph.nodes[src.id])) {
                    // Instance driver already boxed on the canvas but not showing this output.
                    const ex = nodes[src.id] ?? graph.nodes[src.id];
                    if (!ex.ports.some((p) => p.name === src.label)) {
                      patchedOwners.add(src.id);
                      nodes[src.id] = { ...ex, ports: [...ex.ports, { name: src.label, direction: "out", busLabel: src.net || sig }] };
                    }
                  } else if (!nodes[src.id] && !graph.nodes[src.id]) {
                    const sn = (get() as unknown as {
              portAwareSourceNode(s: DriverSource, p: string | undefined, n: string): SchNode;
            }).portAwareSourceNode(src, logic.parentId, src.net || sig);
                    nodes[sn.id] = sn;
                  }
                  if (fromNode === src.id)
                    fromPort = sourceNodeOutPort(nodes[src.id] ?? graph.nodes[src.id], fromPort);
                  edges.push({
                    id: edgeId(fromNode, fromPort, logicId, sig),
                    fromNode, fromPort, toNode: logicId, toPort: sig,
                    netName: sig, bus: src.bus,
                  });
                }
                continue;
              }
            } catch { /* daemon unavailable -> fall through to the tap */ }
          }
          // Genuinely undriven (or unreachable): a named source tap, rendered as a net tag.
          const tap = `${logicId}@${sig}`;
          if (!nodes[tap]) nodes[tap] = {
            // kind stays "port" so the layout treats it as a one-pin source, but netTap makes it
            // RENDER as a net tag: this is an internal wire of the enclosing module, and drawing
            // it with the port symbol told the user `nodiv_mclk` was a port when it is driven by
            // another assign a few lines up.
            id: tap, instanceName: sig, designName: sig, kind: "port", netTap: true,
            ...(logic.parentId ? { parentId: logic.parentId } : {}),
            ports: [{ name: "o", direction: "out", busLabel: sig }],
          };
          edges.push({
            id: edgeId(tap, "o", logicId, sig),
            fromNode: tap, fromPort: "o", toNode: logicId, toPort: sig,
            netName: sig, bus: false,
          });
        }

        for (const c of dc.cells) {
          const id = cellNodeId(c.id);
          nodes[id] = {
            id,
            instanceName: c.outName || c.id,
            designName: c.label || c.kind,
            kind: "primitive",
            prim: c.kind,          // drives the gate-symbol renderer (AND/OR/XOR/MUX/DFF/…)
            isLeaf: true,
            parentId: logicId,
            loc: dc.file ? { file: dc.file, line: c.line || dc.line } : undefined,
            ports: [
              ...c.inputs.map((p) => ({ name: p.name, direction: "in" as const, busLabel: p.name })),
              { name: "o", direction: "out" as const, busLabel: c.outName || (c.width > 1 ? `[${c.width - 1}:0]` : "o") },
            ],
          };
        }
        // Wire each cell input from whatever its ref names.
        const constNodeId = (v: string) => `${logicId}#const:${v}`;
        for (const c of dc.cells) {
          const toNode = cellNodeId(c.id);
          for (const p of c.inputs) {
            let fromNode = "", fromPort = "o", net = p.ref;
            if (p.ref.startsWith("cell:")) {
              const src = cellNodeId(p.ref.slice(5));
              if (!nodes[src]) continue;               // never emit a dangling edge
              fromNode = src;
              net = dc.cells.find((x) => x.id === p.ref.slice(5))?.outName || "";
            } else if (p.ref.startsWith("sig:")) {
              // Enter through the block's own boundary port (added above).
              const sig = p.ref.slice(4);
              fromNode = logicId; fromPort = sig; net = sig;
            } else if (p.ref.startsWith("const:")) {
              const v = p.ref.slice(6);
              fromNode = constNodeId(v);
              if (!nodes[fromNode]) nodes[fromNode] = {
                id: fromNode, instanceName: v, designName: v, kind: "port",
                parentId: logicId, ports: [{ name: "o", direction: "out", busLabel: v }],
              };
            } else continue;
            // A cell fed by a REGISTER'S OUTPUT reads a stored value — statically X, and the
            // wire must say so ("寄存器输出不是应该是X态么"): an unlabeled wire next to labeled
            // ones reads as an accident, an X reads as the truth.
            const srcCell = p.ref.startsWith("cell:")
              ? dc.cells.find((x) => x.id === p.ref.slice(5)) : undefined;
            const seqSrc = srcCell && (srcCell.kind === "dff" || srcCell.kind === "dlatch");
            edges.push({
              id: edgeId(fromNode, fromPort, toNode, p.name),
              fromNode, fromPort, toNode, toPort: p.name, netName: net, bus: c.width > 1,
              ...(seqSrc ? { val: "X" } : {}),
            });
          }
        }
        // The cell that drives the block's result feeds the block's existing output pin, so the
        // downstream wire already on the graph stays connected through the new internals.
        const outPin = logic.ports.find((p) => p.direction === "out");
        const driver = dc.cells.find((c) => c.outName && dc.outputs.includes(c.outName));
        if (outPin && driver)
          edges.push({
            id: edgeId(cellNodeId(driver.id), "o", logicId, outPin.name),
            fromNode: cellNodeId(driver.id), fromPort: "o", toNode: logicId, toPort: outPin.name,
            netName: driver.outName, bus: driver.width > 1,
            // The block's result comes straight out of a register: stored value, statically X.
            ...(driver.kind === "dff" || driver.kind === "dlatch" ? { val: "X" } : {}),
          });
        set((s) => {
          const g = s.schematics[seedNodeId];
          if (!g) return {};
          // The trace-through CONSTANT tag duplicates the literal the decomposition shows
          // inline (user: "重复显示") — drop the tag, its wire and its synthetic pin.
          const constId = "const:" + logicId;
          const constPins = new Set(g.edges.filter((e) => e.fromNode === constId).map((e) => e.toPort));
          const container2 = constPins.size
            ? { ...container, ports: container.ports.filter((p) => !constPins.has(p.name)) }
            : container;
          const merged: Record<string, SchNode> = { ...g.nodes, [logicId]: container2 };
          delete merged[constId];
          for (const [id, n] of Object.entries(nodes)) {
            if (!merged[id]) { merged[id] = n; continue; }
            if (!patchedOwners.has(id)) continue;
            const cur = merged[id];
            const add = n.ports.filter((p) => !cur.ports.some((q) => q.name === p.name));
            if (add.length) merged[id] = { ...cur, ports: [...cur.ports, ...add] };
          }
          const have = new Set(g.edges.map((e) => e.id));
          const allEdges = [...g.edges, ...edges.filter((e) => !have.has(e.id))]
            .filter((e) => e.fromNode !== constId);
          return { schematics: { ...s.schematics, [seedNodeId]: { ...g, nodes: merged, edges: allEdges } } };
        });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    // Reveal a (possibly deep, not-yet-loaded) instance: expand every ancestor in order, then
    // select it. The tree loads one body level at a time, so a search hit must be walked down
    // to — jumping straight to the id would land on a node the tree has never fetched.
    revealInstance: async (nodeId) => {
      const parts = nodeId.split(".");
      // ancestors, outermost first: "a", "a.b", ... (excluding the node itself)
      for (let i = 1; i < parts.length; i++) {
        const anc = parts.slice(0, i).join(".");
        if (!get().instances[anc]) continue;          // not under a displayed root — skip
        if (!get().expanded[anc]) await get().toggleExpand(anc);
      }
      const node = get().instances[nodeId];
      if (node) get().selectInstance({ nodeId, defId: node.definitionId });
      else set({ error: `not reachable from the displayed top(s): ${nodeId}` });
    },

    // Clock Tree -> the REAL schematic. The clock views draw an abstracted tree (symbols the
    // analysis inferred); this hands the same point to the schematic engine, which renders the
    // ACTUAL design objects: real instances, real ports, real nets, ELK-routed. `net` is traced
    // backwards from the owning instance so the user lands on the real clock cone.
    showClockInSchematic: async (instanceId, net) => {
      try {
        await get().revealInstance(instanceId);          // lazily expand the tree down to it
        if (!get().instances[instanceId]) {
          set({ error: `not reachable from the displayed top(s): ${instanceId}` });
          return;
        }
        await get().openSchematic(instanceId);
        // Only a PORT can be traced. Verified on the real design: clock_module_0/mclk is a port
        // (get_pins resolves it) but clock_module_0/nodiv_mclk is an internal net (it does not),
        // so tracing it blindly would fail. For an internal net just land on the instance —
        // the schematic shows its real contents and the user can trace from there.
        if (net) {
          const { ports } = await hs.getPorts({ nodeId: instanceId });
          if (ports.some((p) => p.name === net))
            await get().traceSchematic(instanceId, instanceId, net, "fanin");
        }
        useDesign.getState().setWorkspace("hierarchy");  // the schematic lives in that workspace
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    putSchematic: (graph) =>
      set((s) => ({ schematics: { ...s.schematics, [graph.seedId]: graph } })),

    clearSchematic: (seedNodeId) =>
      set((s) => {
        const g = s.schematics[seedNodeId];
        if (!g) return {};
        const seed = g.nodes[seedNodeId] ?? g.nodes[g.seedId];
        return { schematics: { ...s.schematics, [seedNodeId]: seed ? newSchematic(seed) : g } };
      }),

    collapseInside: (seedNodeId, nodeId) =>
      set((s) => (s.schematics[seedNodeId]
        ? { schematics: { ...s.schematics, [seedNodeId]: collapseInsideGraph(s.schematics[seedNodeId], nodeId) } }
        : {})),

    // Open an HDL tab straight at a file:line (behavioral source double-click — no slang object).
    openLocationHdl: (file, line, title) => {
      if (!file) return;
      get().openHdlTab({ id: HDL_TAB_ID, kind: "hdl", title, file, line, which: "definition", objectId: `${file}:${line}` });
    },

    openContextMenu: (nodeId, x, y) => set({ contextMenu: { nodeId, x, y } }),
    closeContextMenu: () => set({ contextMenu: null }),

    // --- Add to GenConnection: in-process handoff — build payload from node, push directly
    // into the genconn store's importBlocks action, then switch workspace. No file I/O. ---
    addToGenConnection: (nodeId) => {
      const s = get();
      const node = s.instances[nodeId];
      if (!node) return;
      const def = s.definitions[node.definitionId];
      const payload: BlockPayload = {
        designName: def?.designName ?? node.definitionId,
        ...(def?.filePath ? { fileName: def.filePath } : {}),
        instanceName: node.instanceName,
      };
      useGenconnStore.getState().importBlocks([payload]);
      useDesign.getState().setWorkspace("genconn");
    },

    // --- Add to DFX Ctrl: register the instance nodeId in the shared genconn doc's
    // dfxInstances (dedup, one undo) and open/activate the singleton DFX Ctrl tab. Stays in
    // the hierarchy workspace — the DFX Ctrl tab lives here, so no setWorkspace. ---
    addToDfxCtrl: (nodeId) => {
      if (!get().instances[nodeId]) return;
      useGenconnStore.getState().addDfxInstance(nodeId);
      get().openDfxCtrlTab();
    },
    clearPendingBlocks: () => set({ pendingBlocks: [] }),
    exportPendingBlocks: async () => {
      // No-op: replaced by in-process addToGenConnection above.
      set({ pendingBlocks: [] });
    },
  };
});

// Every dp_shell reply — from the console, a context menu, any page — feeds the plan revision
// here, which is what re-runs the analyses that depend on it. Installed once, at module load.
setPlanRevSink((rev) => useStore.getState().notePlanRev(rev));
