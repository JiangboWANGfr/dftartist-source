// Clock / Reset structure + DFT-DRC, grouped by the HIERARCHY under the current harden top.
//
// Value calculus (backend): everything defaults to X; an unconstrained top input is Z at the
// port and X inside; only an SDC-defined clock point carries 010 (01 = leading, 10 = trailing);
// an inverter turns 010 into 101; set_case_analysis pins carry their constant.
// OCC / reset-mux points are USER-decided — the buttons here run the same dp_shell commands
// the console does, so both stay in sync.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store.ts";
import { useDesign } from "../store/design.ts";
import type { SchematicGraph } from "./core/schematic.ts";
import { dftDesign as hs } from "../core-bridge/client.ts";
import type { CrPathItem, ClockResetTreeResult, SdcLintResult, DpOccPoint } from "../core-bridge/model.ts";
import { ClockTopology } from "./ClockTopology.tsx";
import { ClockHierarchy } from "./ClockHierarchy.tsx";
import { ClockDiagram } from "./ClockDiagram.tsx";
import { SchematicTab } from "./schematic/SchematicTab.tsx";
import { SdcClocksPanel } from "./sdc/SdcClocksPanel.tsx";
import { buildCrSchematic, collapseHierarchy, containerIds } from "./core/crSchematic.ts";
import { splitDefId } from "./core/defId.ts";
import { crBaseGet, crBaseSet, crCacheGet, crCacheHas, crCacheSet, crExpandedGet, crExpandedSet } from "./core/crCache.ts";
import { askCtrlMuxDialog, ctrlMuxCommand } from "./CtrlMuxDialog.tsx";
import { askResetFix } from "./ResetFixDialog.tsx";
import { fixOutcome, type FixOutcome } from "./core/resetFix.ts";
import { notify } from "../common/notify.ts";
import { DYNAMIC_RE, STATIC_RE, dfxIpDir, scanIpLibrary } from "./core/dfxIpLib.ts";

const userPath = (p: string) => p.replace(/[.:]/g, "/");

type CrView = "sch" | "diagram" | "topology" | "hier";

// ---- undo/redo history for the exact-circuit schematic, per seed (module level so it
// survives tab/workspace switches). A snapshot pairs the graph with the expansion set —
// restoring one without the other desyncs the rebuild effect.
interface CrSnap { graph: SchematicGraph; open: Set<string> }
interface CrHist { past: CrSnap[]; future: CrSnap[]; last: CrSnap | null }
const crHist = new Map<string, CrHist>();
const histFor = (seed: string): CrHist => {
  let h = crHist.get(seed);
  if (!h) { h = { past: [], future: [], last: null }; crHist.set(seed, h); }
  return h;
};

/** dp_shell command recording an OCC definition point (renamed from add_to_occ_def_point). */
const occCmd = (target: string, clockName?: string) =>
  `add_occ_point ${userPath(target)}` + (clockName ? ` -clock ${clockName}` : "");


/** `mode` picks the workspace flavour:
 *   "clock" — clock-structure browsing (OCC planning), everything shown by default
 *   "drc"   — the check view: reset by default, violations-only pre-armed */
export function ClockResetTab({ mode = "clock" }: { mode?: "clock" | "drc" }) {
  const roots = useStore((s) => s.rootInstanceIds);
  const setError = useStore((s) => s.setError);
  const showClockInSchematic = useStore((s) => s.showClockInSchematic);
  const sdc0 = localStorage.getItem("dft-suite.funcSdc") ?? "";
  const lib0 = localStorage.getItem("dft-suite.dftLib") ?? "";
  const [sdc, setSdc] = useState(sdc0);
  // Restore the previous analysis instead of re-running it (and losing the view) on remount.
  const [data, setData] = useState<ClockResetTreeResult | null>(() => crCacheGet(sdc0, lib0) ?? null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"clock" | "reset">(mode === "drc" ? "reset" : "clock");
  const [onlyBad, setOnlyBad] = useState(mode === "drc");
  // Default = the exact-circuit schematic (user 2026-07-27: clock structure should display in
  // the same real-circuit style as the reset debug view — that is what makes debugging work).
  // per-path / OCC-points / table views were retired at the user's request: the three graphical
  // views + hierarchy cover every question they answered, and each of them is selectable.
  const [view, setView] = useState<CrView>("sch");

  // dft_lib_setting.yaml — without it the walk stops at the first clock cell (slang cannot tell
  // which pin of an ICG is the clock), so every gated clock reads X. Remembered per session.
  const [lib, setLib] = useState(lib0);
  // OCC points already recorded in dp_shell — used to flag a CASCADING second OCC on a branch.
  const [occPoints, setOccPoints] = useState<string[]>([]);
  // The SAME points, in full (pin/clock/comment) — the "OCC Points" tab's own row needs `clock`
  // to jump straight to that point's SDC definition, which the bare pin-string list can't carry.
  const [occPointsFull, setOccPointsFull] = useState<DpOccPoint[]>([]);

  // Collapsible "generated files" drawer: the same resolved-clock/add_clock/tessent-mapping/
  // YAML text SdcTab's "6 · Clocks" panel shows, plus the OCC definition points, reachable
  // without leaving Clock Tree or losing the diagram — an engineer already has the func SDC
  // path typed in here, no reason to retype it in another tab (or lose the schematic view) just
  // to read dft_clock_define.tcl / dft_clock_mapping.tcl / clock_info_from_func_sdc.yaml /
  // dfx_occ_def_point.tcl. Collapsed by default so it never competes with the diagram for space.
  const [filesOpen, setFilesOpen] = useState(false);
  const [sdcLintData, setSdcLintData] = useState<SdcLintResult | null>(null);
  const [sdcLintFile, setSdcLintFile] = useState<string | null>(null);
  const [sdcLintBusy, setSdcLintBusy] = useState(false);
  const loadSdcLint = useCallback(async (file: string) => {
    setSdcLintFile(file);
    if (!file.trim()) { setSdcLintData(null); return; }
    setSdcLintBusy(true);
    try {
      const r = await hs.sdcLint({ sdcFile: file.trim(), dialects: "generic,dc,genus", design: true });
      setSdcLintData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSdcLintBusy(false);
    }
  }, [setError]);
  // "does the SDC's clock target actually exist in this design?" — real correctness checking
  // (SDC-EMPTY-MATCH), surfaced as a count on the drawer toggle so it's visible unopened.
  const designIssueCount = useMemo(
    () => sdcLintData?.findings.filter((f) => f.rule === "SDC-EMPTY-MATCH").length ?? 0,
    [sdcLintData]);
  const [occText, setOccText] = useState<string | null>(null);
  const [occBusy, setOccBusy] = useState(false);
  const loadOccText = useCallback(async () => {
    setOccBusy(true);
    try {
      const r = await hs.dpShell("report_occ_def_points");
      setOccText(r.output || "(no OCC definition points recorded yet — right-click a clock pin -> add_occ_point)");
      setOccPointsFull(r.occPoints);
      setOccPoints(r.occPoints.map((p) => p.pin));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOccBusy(false);
    }
  }, [setError]);

  const load = useCallback(async (file: string, libYaml: string) => {
    setBusy(true);
    try {
      // phases:true = two extra walks for the sac/asc columns the schematic labels.
      const r = await hs.clockResetTree(file, libYaml, [], [], [], true);
      crCacheSet(file, libYaml, r);
      setData(r);
      useStore.getState().setCrClocks(r.clocks);
      if (libYaml) localStorage.setItem("dft-suite.dftLib", libYaml);
      if (file) localStorage.setItem("dft-suite.funcSdc", file);
      return r;   // the auto-fix needs the fresh result to say what it achieved
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [setError]);

  // First paint only. Analyze with the REMEMBERED SDC — it is already shown in the input box,
  // so running with "" instead made every clock read unconstrained (all groups flagged as
  // violations) while the UI claimed the file was in use. Skip entirely when the cache already
  // holds this exact analysis, which is what keeps the expanded tree alive across tab switches.
  useEffect(() => {
    if (!crCacheHas(sdc, lib)) void load(sdc, lib);

  }, []);

  // Re-analyse when the dp_shell session's plan changes. The cache is keyed by (sdc, lib) and
  // knows nothing about pin constraints, so this deliberately re-runs and OVERWRITES it rather
  // than asking whether a result already exists.
  const drcRev = useStore((s) => s.drcRev);
  const firstRev = useRef(drcRev);
  useEffect(() => {
    if (drcRev === firstRev.current) return;   // mount, not a change
    void load(sdc, lib);
  }, [drcRev]);

  const items = useMemo(() => (data?.items ?? []).filter((i) => i.kind === tab), [data, tab]);
  const bad = (i: CrPathItem) => (i.kind === "reset" ? !i.ok : i.value !== "010" && i.value !== "101");

  // Muxes recorded, but the analysis credits none of them: either the daemon predates the
  // plan-aware DRC, or the mux's DFT pins are not held (a mux whose select is not 1 drives
  // nothing). Both are one-line fixes; guessing between them is not.
  const [planNote, setPlanNote] = useState<string | null>(null);
  useEffect(() => {
    if (!data) { setPlanNote(null); return; }
    const resets = data.items.filter((i) => i.kind === "reset");
    if (!resets.length) { setPlanNote(null); return; }
    let dead = false;
    void hs.dpShell("report_dft_ctrl_mux; report_pin_constraints; report_dft_ips")
      .then((r) => {
        if (dead) return;
        const muxes = r.ctrlMuxes ?? [];
        if (!muxes.length) { setPlanNote(null); return; }
        if (resets.some((i) => i.plannedFix)) { setPlanNote(null); return; }
        const cons = r.pinConstraints ?? [];
        const u = (x: string) => x.replace(/[.:]/g, "/");
        // A DFT-side pin is decided either by a USER constraint or by the value COMPUTED from
        // the IP's own circuit (the daemon reports both) — advising "add_pin_constraint the
        // select" for a select that computes 1 would be exactly the auto-constraint habit the
        // tool just dropped.
        const computed = new Map<string, string>();
        for (const ip of r.dftIps ?? [])
          for (const ps of ip.ports ?? [])
            computed.set(u(`${ip.at ? `${ip.at}/` : ""}${ip.instance}/${ps.port}`), ps.s);
        const held = (pin: string) => {
          const c = cons.find((x) => u(x.pin).endsWith(u(pin)))?.value;
          if (c) return c;
          for (const [k, v] of computed)
            if (k.endsWith(u(pin)) || u(pin).endsWith(k)) return v === "X" ? undefined : v;
          return undefined;
        };
        const unheld = muxes.filter((m) => held(m.select) !== "1" || !held(m.overrideSource));

        // Does the recorded TARGET name something the analysis knows as a reset? The schematic
        // and the walk can spell the same wire differently (the flop's output net vs the net the
        // walk stopped on), and a target that matches neither is spliced into the picture while
        // the DRC never sees it — values right, box still red.
        const known = new Set<string>();
        for (const i of resets) {
          known.add(u(`${i.owner}/${i.net}`));
          const src = u((i.detail ?? "").split(/\s/)[0] ?? "");
          if (src) known.add(src);
        }
        const matches = (t: string) =>
          [...known].some((k) => k === u(t) || k.endsWith("/" + u(t)) || u(t).endsWith("/" + k));
        const orphan = muxes.filter((m) => !matches(m.target));

        setPlanNote(
          orphan.length
            ? `${orphan.length} of ${muxes.length} recorded mux(es) name a target the reset ` +
              `analysis does not know: ${orphan.slice(0, 2).map((m) => m.target).join(", ")}` +
              `${orphan.length > 2 ? " …" : ""}. The picture splices them by wire, the DRC ` +
              `matches by reset net — record them on the net the DRC names as the source ` +
              `(the "src=" field of report_reset), or use Fix reset DRC, which uses that name.`
            : unheld.length
            ? `${unheld.length} of ${muxes.length} recorded mux(es) have an undecided DFT side — ` +
              `the select/source computes X from the IP circuit, so the analysis cannot credit ` +
              `it. Constrain the IP's INPUT pins (mode pins / scan_enable) so the value computes; ` +
              `report_dft_ip_circuit names the first missing input.`
            : `${muxes.length} mux(es) are recorded and constrained and name reset nets the ` +
              `analysis knows, yet no group reports being fixed by one. This daemon predates the ` +
              `plan-aware DRC — rebuild it (in the console, \`report_reset_states\`: an old ` +
              `daemon does not know that command).`);
      })
      .catch(() => setPlanNote(null));
    return () => { dead = true; };
  }, [data, drcRev]);
  const shown = useMemo(() => (onlyBad ? items.filter(bad) : items), [items, onlyBad]);

  // Exact-circuit schematic: built ONLY from the walked hops (real containers, real boundary
  // ports, real cell pins), then rendered by the same engine as the main schematic surface.
  // A full-chip clock tree drawn flat is unreadable, so it opens COLLAPSED: source + top-level
  // module boxes (summed reg bits, red bubble-up for violations). Double-click a box to open
  // that level; double-click an open frame to close it again.
  const schSeed = `crsch:${tab}`;
  const putSchematic = useStore((s) => s.putSchematic);
  // Expansion lives in crExpandedBySeed (module level) so it survives unmount; the state here
  // is just the render mirror. Swapping the Clock/Reset tab swaps in that seed's own set.
  const [schOpen, setSchOpenState] = useState<Set<string>>(() => crExpandedGet(`crsch:${tab}`));
  useEffect(() => { setSchOpenState(crExpandedGet(schSeed)); }, [schSeed]);
  const setSchOpen = useCallback((next: Set<string>) => {
    crExpandedSet(schSeed, next);
    setSchOpenState(next);
  }, [schSeed]);
  const fullSch = useMemo(() => {
    if (shown.length === 0) return null;
    const insts = useStore.getState().instances;
    return buildCrSchematic(shown, {
      seedId: schSeed, roots, isBad: bad,
      moduleNameOf: (id) => {
        const d = insts[id]?.definitionId;
        return d ? splitDefId(d).designName : undefined;
      },
      clocks: data?.clocks,
    });
    // `data?.clocks` deliberately NOT in the deps: `shown` already recomputes whenever `data`
    // does (items depends on data), so `data.clocks` is always current when this body reads it
    // via closure — adding it separately risked a second, later-settling recompute (the exact
    // graph-instance churn `__schPinProbe`'s callers rely on NOT happening once pins appear).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, schSeed, roots]);
  const schContainers = useMemo(() => (fullSch ? containerIds(fullSch) : new Set<string>()), [fullSch]);
  useEffect(() => {
    if (view !== "sch" || !fullSch) return;
    const built = collapseHierarchy(fullSch, schOpen);
    // CARRY USER ADDITIONS OVER. Traces pulled in through a container's inner diamonds live in
    // the store graph but not in the rebuilt one; replacing wholesale wiped them on every page
    // switch or expand toggle ("我trace出来的图，页面切换就没了"). Anything in the previous
    // graph that was NOT part of the previous BUILD is the user's — keep it, as long as its
    // anchor points still exist in the new build.
    const prev = useStore.getState().schematics[schSeed];
    const base = crBaseGet(schSeed);
    let merged = built;
    if (prev && base) {
      // A user addition whose parent container is COLLAPSED must be dropped for this build:
      // keeping it hangs children under a closed leaf box, which makes ELK treat the box as
      // an open container again — the graph flip-flops between the two shapes and the canvas
      // strobes (the "double-click to close → 闪屏/黑屏" report). It reappears when the
      // container is opened again only if re-traced — honest, and stable.
      const parentCollapsed = (pid: string | undefined): boolean =>
        !!pid && schContainers.has(pid) && !schOpen.has(pid);
      const extraNodes = Object.values(prev.nodes)
        .filter((n) => !base.nodes.has(n.id) && !built.nodes[n.id])
        .filter((n) => !parentCollapsed(n.parentId))
        .filter((n) => !n.parentId || built.nodes[n.parentId] || prev.nodes[n.parentId]);
      const nodes = { ...built.nodes };
      for (const n of extraNodes) if (!n.parentId || nodes[n.parentId]) nodes[n.id] = n;
      const haveEdge = new Set(built.edges.map((e) => e.id));
      const extraEdges = prev.edges.filter(
        (e) => !base.edges.has(e.id) && !haveEdge.has(e.id) && nodes[e.fromNode] && nodes[e.toNode]);
      merged = { ...built, nodes, edges: [...built.edges, ...extraEdges] };
    }
    crBaseSet(schSeed, new Set(Object.keys(built.nodes)), new Set(built.edges.map((e) => e.id)));
    putSchematic(merged);
  }, [view, fullSch, schOpen, schSeed, schContainers, putSchematic]);
  const toggleSchBox = (id: string) => {
    if (!schContainers.has(id)) return;   // only real hierarchy frames expand/collapse
    const n = new Set(schOpen);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSchOpen(n);
  };

  // "Click an add_clock/clock-info table row -> show its definition point on the schematic":
  // a three-phase handoff, because each step needs a render this same call cannot see yet.
  //   1) jumpToClock: switch to the clock tab + schematic view, remember the NAME.
  //   2) once `fullSch` reflects the (possibly just-switched) clock tab, expand every real
  //      container between the top and the clock's root box, remember its NODE ID.
  //   3) once that node actually exists in the rendered/collapsed graph, hand the request to
  //      SchematicTab via the store (requestSchematicFocus).
  const [pendingFocusName, setPendingFocusName] = useState<string | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const jumpToClock = useCallback((name: string) => {
    if (tab !== "clock") setTab("clock");
    if (view !== "sch") setView("sch");
    setPendingFocusName(name);
  }, [tab, view]);
  useEffect(() => {
    if (!pendingFocusName || tab !== "clock") return;   // wait for the tab switch to land
    const nodeId = "clk:" + pendingFocusName;
    const target = fullSch?.nodes[nodeId];
    if (!target) {
      notify(`${pendingFocusName}: not on the current clock walk (not reached from any flop in this analysis)`);
      setPendingFocusName(null);
      return;
    }
    const toOpen = new Set(schOpen);
    let p = target.parentId;
    while (p) { toOpen.add(p); p = fullSch?.nodes[p]?.parentId; }
    setSchOpen(toOpen);
    setPendingFocusNodeId(nodeId);
    // Highlight the clock's WHOLE path (root through every flop it reaches), not just select
    // its root box — "schematic 中相应的时钟 path 高亮".
    useStore.getState().setHighlightedClock(schSeed, pendingFocusName);
    setPendingFocusName(null);
  }, [pendingFocusName, tab, fullSch, schOpen, setSchOpen, schSeed]);

  // ---- undo / redo. Every observed change of the stored graph (expand/collapse rebuilds,
  // traces, decompositions) pushes the PREVIOUS state; restores are muted so they don't
  // record themselves. `histMute = 2` because a restore changes the graph twice: our
  // putSchematic, then the rebuild effect's own putSchematic for the restored open-set.
  const graphNow = useStore((s) => s.schematics[schSeed]);
  useEffect(() => {
    if (!pendingFocusNodeId || !graphNow?.nodes[pendingFocusNodeId]) return;
    useStore.getState().requestSchematicFocus(schSeed, pendingFocusNodeId);
    setPendingFocusNodeId(null);
  }, [pendingFocusNodeId, graphNow, schSeed]);
  const histMute = useRef(0);
  const [, setHistTick] = useState(0);
  useEffect(() => {
    const h = histFor(schSeed);
    if (!graphNow) { h.last = null; return; }
    if (histMute.current > 0) {
      histMute.current -= 1;
      h.last = { graph: graphNow, open: schOpen };
      return;
    }
    if (h.last && h.last.graph !== graphNow) {
      h.past.push(h.last);
      if (h.past.length > 60) h.past.shift();
      h.future = [];
      setHistTick((t) => t + 1);
    }
    h.last = { graph: graphNow, open: schOpen };
  }, [graphNow, schOpen, schSeed]);

  const applySnap = useCallback((snap: CrSnap) => {
    histMute.current = 2;
    crExpandedSet(schSeed, snap.open);
    setSchOpenState(snap.open);
    putSchematic(snap.graph);
    setHistTick((t) => t + 1);
  }, [schSeed, putSchematic]);
  const doUndo = useCallback(() => {
    const h = histFor(schSeed);
    const prev = h.past.pop();
    if (!prev || !h.last) return;
    h.future.push(h.last);
    h.last = prev;
    applySnap(prev);
  }, [schSeed, applySnap]);
  const doRedo = useCallback(() => {
    const h = histFor(schSeed);
    const next = h.future.pop();
    if (!next || !h.last) return;
    h.past.push(h.last);
    h.last = next;
    applySnap(next);
  }, [schSeed, applySnap]);

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z), ignored while typing in an input/textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); doRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  // Group by owning instance so the view follows the design hierarchy.
  const groups = useMemo(() => {
    const m = new Map<string, CrPathItem[]>();
    for (const i of shown) (m.get(i.owner) ?? m.set(i.owner, []).get(i.owner)!).push(i);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  const strip = (id: string) => {
    for (const r of roots) if (id === r) return id;
    for (const r of roots) if (id.startsWith(r + ".")) return id.slice(r.length + 1);
    return id;
  };

  /** Reset control point: we never insert the mux — the plan is recorded and the user's flow
   *  applies it. One dialog, roles named, pins picked (see CtrlMuxDialog). */
  const askMux = (target: string) => {
    void (async () => {
      const specs = await askCtrlMuxDialog(target);
      for (const spec of specs ?? []) await runDp(ctrlMuxCommand(spec));
    })();
  };

  /** Propose fixes for every failing reset, let the user review, then record what survives. */
  const [fixing, setFixing] = useState(false);
  const [fixReport, setFixReport] = useState<FixOutcome | null>(null);
  const doAutoFix = async () => {
    if (!data) return;
    setFixing(true);
    try {
      // What is already planned decides what NOT to propose: the IPs that exist, the nets that
      // already carry a mux. Read fresh — the plan may have moved since this page loaded.
      const st = await hs.dpShell("report_dft_ips; report_dft_ctrl_mux");
      const ips = (st.dftIps ?? []).map((x) => ({ instance: x.instance, module: x.module, at: x.at }));
      const patched = (st.ctrlMuxes ?? []).map((m) => m.target);
      let dynamicModule: string | undefined, staticModule: string | undefined;
      try {
        const lib = await scanIpLibrary(dfxIpDir(),
          (d) => (window as unknown as { dft: { project: { listDir(d: string): Promise<string[]> } } }).dft.project.listDir(d),
          (f) => hs.readSource(f));
        dynamicModule = lib.find((m) => DYNAMIC_RE.test(m.name))?.name;
        staticModule = lib.find((m) => STATIC_RE.test(m.name))?.name;
      } catch { /* no library scanned — fall back to the house names */ }

      const before = data.items.filter((i) => i.kind === "reset" && !i.ok).length;
      const picked = await askResetFix({ items: data.items, ips, patched, dynamicModule, staticModule,
        currentMuxes: st.ctrlMuxes ?? [] });
      if (!picked?.length) return;
      // In order: the IPs exist before a mux names their pins. A `#` row is a note the review
      // list shows (mixed reset polarities), never something to run.
      const cmds = picked.filter((a) => !a.command.startsWith("#"));
      for (const a of cmds) await runDp(a.command);
      // Re-run and REPORT: what the plan fixed, and what it could not. "12 recorded" says
      // nothing about whether the DRC is any better — this is the number that matters.
      const after = await load(sdc, lib);
      if (after) {
        const o = fixOutcome(before, after.items);
        setFixReport(o);
        notify(`${o.fixed} group(s) fixed by the plan · ${o.left} still failing`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setFixing(false); }
  };

  const runDp = async (cmd: string) => {
    try {
      const r = await hs.dpShell(cmd);
      if (!r.ok) setError(`dp_shell: ${r.error || cmd}`);
      setOccPoints(r.occPoints.map((p) => p.pin));
      setOccPointsFull(r.occPoints);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  // Runs alongside every Analyze (not gated on the drawer being open) — real SDC-vs-design
  // correctness checking is worth surfacing on the toggle button itself (a badge count), so an
  // engineer sees "2 clocks don't resolve in this design" without opening the drawer first.
  useEffect(() => {
    if (sdcLintFile !== sdc) void loadSdcLint(sdc);
  }, [sdc, sdcLintFile, loadSdcLint]);
  useEffect(() => {
    if (filesOpen && occText === null) void loadOccText();
  }, [filesOpen, occText, loadOccText]);

  const violations = items.filter(bad).length;

  return (
    <div className="crtab">
      <div className="crhead">
        <div className="crseg">
          <button className={"findbtn" + (tab === "clock" ? " on" : "")} data-on={tab === "clock" || undefined}
                  onClick={() => setTab("clock")}>Clock</button>
          <button className={"findbtn" + (tab === "reset" ? " on" : "")} data-on={tab === "reset" || undefined}
                  onClick={() => setTab("reset")}>Reset</button>
        </div>
        <div className="crseg">
          <button className="findbtn" title="Undo (Ctrl+Z)" data-btn="undo"
                  disabled={histFor(schSeed).past.length === 0} onClick={doUndo}>↶ Undo</button>
          <button className="findbtn" title="Redo (Ctrl+Y)" data-btn="redo"
                  disabled={histFor(schSeed).future.length === 0} onClick={doRedo}>↷ Redo</button>
          <button className="findbtn" data-btn="open-dfxip" title="planned DFX IPs — reset-fix mux sources"
                  onClick={() => useDesign.getState().setWorkspace("dfxip")}>DFX IP</button>
          {/* The whole reset DRC in one pass: work out which resets fail, propose the standard
              patch for each, and show it for review. Nothing is recorded until Apply.
              ALWAYS VISIBLE: hiding it on the clock tab meant "where is the button" — it now
              switches to the reset tab itself, which is where the answer is shown anyway. */}
          <button className="findbtn primary" data-btn="fix-reset" disabled={fixing || !data}
                  title="Propose a control mux for every failing reset — reviewed before anything is recorded"
                  onClick={() => { setTab("reset"); void doAutoFix(); }}>
            {fixing ? "…" : "Fix reset DRC…"}
          </button>
        </div>
        <input className="findinput" style={{ width: 260 }} placeholder="func SDC file (empty = no constraints)"
               value={sdc} spellCheck={false} title="create_clock / set_case_analysis drive the value calculus"
               onChange={(e) => setSdc(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") void load(sdc, lib); }} />
        <button className="findbtn" title="Pick an SDC/XDC file"
                onClick={() => void (async () => {
                  const p = await window.dft.design.pickSdc();
                  if (p) setSdc(p);
                })()}>
          Browse…
        </button>
        <input className="findinput" style={{ width: 260 }} placeholder="dft_lib_setting.yaml (cell library)"
               value={lib} spellCheck={false}
               title="Lets the walk climb THROUGH ICG/buffer/inverter cells (their clock_in pin). Without it a gated clock reads X."
               onChange={(e) => setLib(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") void load(sdc, lib); }} />
        <button className="findbtn" onClick={() => void load(sdc, lib)} disabled={busy}>{busy ? "…" : "Analyze"}</button>
        <select className="tsearch-kind" value={view} onChange={(e) => setView(e.target.value as CrView)}>
            <option value="sch">schematic (exact circuit)</option>
            <option value="diagram">diagram</option>
            <option value="topology">topology</option>
            <option value="hier">hierarchy</option>
          </select>
        {/* Collapsible, not a separate view: opening it must never cost the diagram — the whole
            point is reading the generated text WITHOUT losing the schematic underneath it. */}
        <button className="findbtn" data-btn="toggle-generated-files"
                title={designIssueCount > 0
                  ? `${designIssueCount} clock(s) target an object this design doesn't have — open to see which`
                  : "dft_clock_define.tcl / dft_clock_mapping.tcl / clock_info_from_func_sdc.yaml / dfx_occ_def_point.tcl"}
                onClick={() => setFilesOpen((v) => !v)}>
          {filesOpen ? "▾" : "▸"} Generated files
          {designIssueCount > 0 && <span className="crbad" data-badge="design-issues"> ⚠{designIssueCount}</span>}
        </button>
        <label className="crchk">
          <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} />
          violations only
        </label>
        <span className="crstat">
          {data ? `${items.length} ${tab} group(s)` : ""}
          {data && violations > 0 && <span className="crbad"> · {violations} violation(s)</span>}
        </span>
      </div>

      {/* THE TWO HALVES DISAGREEING. The wire values come from the plan overlay in this build;
          the red boxes come from the daemon's `ok`. When muxes are recorded and NO group reports
          plannedFix, those two are answering from different places — and the picture shows a
          reset arriving inactive next to a flop still flagged as violating. Say which it is
          instead of leaving it to be puzzled out. */}
      {planNote && (
        <div className="crfix">
          <b>⚠ the plan is not reaching the DRC.</b> {planNote}
        </div>
      )}
      {/* WHAT THE FIX ACHIEVED. "12 recorded" says nothing about whether the DRC is better;
          this is the number that matters, and what is LEFT is the work still to do. */}
      {fixReport && (
        <div className="crfix">
          <b>Auto-fix:</b> {fixReport.before} failing before ·{" "}
          <span className="crfix-fixed">{fixReport.fixed} fixed by the plan</span>
          {fixReport.fixedFlops > 0 && ` (${fixReport.fixedFlops} flops)`} ·{" "}
          <span className={fixReport.left ? "crfix-left" : "crfix-fixed"}>
            {fixReport.left} still failing
          </span>
          <button className="findbtn" style={{ marginLeft: 8 }} onClick={() => setFixReport(null)}>dismiss</button>
          {fixReport.remaining.length > 0 && (
            <div className="crfix-rest">
              still to decide — the plan could not solve these:
              {fixReport.remaining.slice(0, 8).map((r) => (
                <div key={r.target}><code>{r.target}</code> · {r.flops} flop(s) · {r.why}</div>
              ))}
              {fixReport.remaining.length > 8 &&
                <div>+{fixReport.remaining.length - 8} more source(s)</div>}
            </div>
          )}
        </div>
      )}
      {/* The old top-of-page "⚠ ignored unsupported SDC command" / "SDC clocks: ..." banners are
          gone — the drawer's own Clocks tab already covers every clock here, with period/master/
          design-check/defined-at in a real table instead of one run-on line. */}

      {/* Collapsible drawer: the diagram stays mounted underneath (it's a sibling, not a
          replacement), so opening this to read the generated text never costs the schematic.
          Fixed height (not max-height) — the panel's own "Clocks" tab is a flex split-pane that
          needs a real height to fill, not "however tall its content happens to be". */}
      {filesOpen && (
        <div className="crfilesdrawer" data-drawer="generated-files"
             style={{ borderTop: "1px solid #3c3c3c", borderBottom: "1px solid #3c3c3c",
                      height: "50vh", flexShrink: 0, overflow: "hidden" }}>
          {sdcLintBusy
            ? <div className="muted pad">checking…</div>
            : <SdcClocksPanel data={sdcLintData} sdcFile={sdc} onJumpToClock={jumpToClock}
                occ={{ text: occText, busy: occBusy, count: occPoints.length,
                       onRefresh: () => void loadOccText(), points: occPointsFull }} />}
        </div>
      )}

      <div className={"crbody" + (view === "diagram" || view === "sch" ? " diagram" : "")}>
        {data && view === "sch" && shown.length > 0 &&
          <SchematicTab seedNodeId={schSeed} onBoxDblClick={toggleSchBox} curated allowOcc={tab === "clock"} />}
        {!data && <div className="muted pad">analyzing…</div>}
        {data && groups.length === 0 && (
          <div className="muted pad">
            {onlyBad ? `no ${tab} violations` : `no ${tab} paths found`}
          </div>
        )}
        {data && view === "diagram" && shown.length > 0 && (
          <ClockDiagram items={shown} strip={strip} occPoints={occPoints}
            onOcc={tab === "clock" ? (target, i) => void runDp(occCmd(target, i.clockName)) : undefined}
            onSchematic={(inst, net) => void showClockInSchematic(inst, net)} />
        )}
        {/* HIERARCHY: the real instance tree slang elaborated; each level shows only
            its clock structure plus the REAL register count it drives. */}
        {data && view === "hier" && shown.length > 0 && (
          <ClockHierarchy items={shown} strip={strip} kind={tab}
            onOcc={(i) => void runDp(occCmd(`${i.owner}:${i.net}`, i.clockName))}
            onMux={(i) => askMux(`${userPath(i.owner)}/${i.net}`)} />
        )}
        {/* TOPOLOGY: one merged tree over ALL paths (not one drawing per register group). */}
        {data && view === "topology" && shown.length > 0 && (
          <ClockTopology items={shown} strip={strip} kind={tab} occPoints={occPoints}
                         onOcc={tab === "clock" ? (target, i) => void runDp(occCmd(target, i?.clockName)) : undefined} />
        )}
      </div>
    </div>
  );
}
