// The schematic work-surface: ELK lays out the current SchematicGraph, Konva draws it.
// Click an input pin's diamond -> trace its driver (fanin); an output pin's -> its loads
// (fanout). Pan = drag canvas, zoom = wheel. See 2026-06-25-show-on-schematic.md §3.
//
// Perf hardening (Task 3.3):
// - Static content (wires + boxes) on a Layer with listening={false} → Konva skips hit graph.
// - Interactive pins on a separate listening Layer.
// - perfectDrawEnabled={false} on all small shapes → skip extra buffer pass.
// - Pan via rAF throttle: stage moved imperatively, no React setState per mousemove.
// - NodeBox wrapped in React.memo to prevent re-renders from parent state churn.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Group, Rect, Text, Line, RegularPolygon, Shape, Circle } from "react-konva";
import type Konva from "konva";
import { useStore } from "../store.ts";
import { dftDesign as hs } from "../../core-bridge/client.ts";
import { dropPlaceholderGatePins, isGateShape, isMuxSelect, parsePortId, portId, repairBoundaryCrossings, toElkGraph, type SchNode } from "../core/schematic.ts";
import { layout } from "./elkLayout.ts";
import { anchorTo, boundsOf, fitTransform, PIN_STUB, toLaid, type Box, type Laid } from "./laid.ts";
import { commonScope, fullNetPath as fullNetPathAbs, fullPin as fullPinAbs, realNodePath, userPath } from "./paths.ts";
import { promptText } from "../../genconn/promptDialog.tsx";
import { askCtrlMuxDialog, ctrlMuxCommand, ctrlMuxDefaults, hasCtrlMuxDefaults } from "../CtrlMuxDialog.tsx";
import { withPlannedMuxes, type PlannedConstraint, type PlannedIp, type PlannedMux } from "../core/plannedMux.ts";
import { muxCoveredGroups, muxRole } from "../core/resetFix.ts";
import { expandIpInternals } from "../core/ipInternals.ts";
import type { DfxIpConeResult } from "../../core-bridge/model.ts";
import { notify } from "../../common/notify.ts";

/** WHERE "Show HDL Definition" would jump for a node — a pure function of the node itself, so
 *  the same three-tier resolution backs BOTH the context-menu item and a double-click gesture:
 *    n.loc          -> the exact always/assign statement (flop groups, alias/gate sources)
 *    n.definitionId -> the module definition (any placed instance)
 *    ownerInst      -> resolve by hierarchical path (synthetic clock/reset nodes, net taps) */
export type HdlTarget =
  | { kind: "loc"; file: string; line: number; title: string }
  | { kind: "def"; defId: string; designName: string }
  | { kind: "path"; path: string };
/** Module-level guard for the crItems bootstrap fetch below: at most one in flight across
 *  every mounted SchematicTab instance. */
let crBootstrapPromise: Promise<void> | null = null;

export function hdlTargetFor(n: SchNode): HdlTarget | null {
  if (n.loc) return { kind: "loc", file: n.loc.file, line: n.loc.line, title: `${n.designName} ▸ ${n.instanceName}` };
  if (n.definitionId) return { kind: "def", defId: n.definitionId, designName: n.designName };
  const real = realNodePath(n.id);
  const ownerInst = real.includes(":") ? real.slice(0, real.indexOf(":")) : real;
  return ownerInst ? { kind: "path", path: ownerInst } : null;
}

// Per-seed position memory (module-level: survives tab switches AND unmounts, matching
// how the store keeps each seed's SchematicGraph alive). Keyed by seedNodeId — the reuse
// tab swaps content in place (same tab id, no React key) and the component instance is
// REUSED across schematic→schematic switches, so a tab-id key would leak seed A's coords
// into seed B. Keying by seedNodeId keeps each cone's positions independent (D12).
const prevPosBySeed = new Map<string, Record<string, { x: number; y: number }>>();

// The Konva stage transform (zoom + pan) and the current selection live on the stage / in
// component state, both of which die when the tab or workspace is switched. Persist them per
// seed, like the box positions above, so switching views never throws away the zoom the user
// set or the object they had highlighted.
/** Remembered zoom/pan per seed. `user` marks a view the USER made (wheel / drag): those are
 *  sticky. An auto-FITTED view is not — it only ever meant "show all of it at this size", so it
 *  is recomputed whenever the pane resizes or the circuit grows. Keeping a stale auto-fit is
 *  what left a full-page debug view with the drawing shrunk into one corner ("比例不协调"). */
const viewBySeed = new Map<string, { scale: number; x: number; y: number; user?: boolean }>();
const selBySeed = new Map<string, { node: string | null; wire: string | null }>();

/** Hierarchical instance path WITHOUT the leading top-module segment (per user request:
 *  don't include the current design's top). "top.u_a.u_b" -> "u_a.u_b". */



/** Strip the CURRENT HARDEN TOP from a hierarchical id. `roots` = the tops the tree is showing
 *  (store.rootInstanceIds); the one that actually prefixes this id wins, so a design hardened at
 *  e.g. `processor_core` yields `u_a.u_b` from `processor_core.u_a.u_b`. Falls back to dropping
 *  the first segment when no root matches (id not under a displayed top). The top itself keeps
 *  its own name — there is nothing above it to strip. */
const hierNoTop = (id: string, roots: readonly string[] = []): string => {
  for (const r of roots) {
    if (id === r) return id;
    if (id.startsWith(r + ".")) return id.slice(r.length + 1);
  }
  const i = id.indexOf(".");
  return i >= 0 ? id.slice(i + 1) : id;
};

/** True when `id` IS the current harden top (no instance prefix to qualify a pin with). */
const isTop = (id: string, roots: readonly string[] = []): boolean =>
  roots.includes(id) || !id.includes(".");

/** Hierarchical path of a PIN/PORT: instance path (harden top stripped) + "." + port name.
 *  On the harden top itself there is no instance prefix, so the port name alone is the path. */
const pinPath = (nodeId: string, port: string, roots: readonly string[] = []): string =>
  isTop(nodeId, roots) ? port : `${hierNoTop(nodeId, roots)}.${port}`;


/** Hierarchical path of a NET: its declaring scope (harden top stripped) + "." + net name.
 *  A net declared directly in the harden top has no scope prefix — just the net name. */
const netPath = (fromNode: string, toNode: string, net: string, roots: readonly string[] = []): string => {
  const scope = commonScope(fromNode, toNode);
  if (!scope || isTop(scope, roots)) return net;
  return `${hierNoTop(scope, roots)}.${net}`;
};

/** Allowed top-left rect for dragging `b` so its box stays wholly inside its parent container
 *  (per user: a child module must never be draggable out of its parent block). Returns undefined
 *  for root-level boxes (no parent → free drag). Insets reserve the parent's title bar + a margin. */
const parentClampBounds = (
  b: Box,
  byId: Map<string, Box>,
): { minX: number; minY: number; maxX: number; maxY: number } | undefined => {
  const pid = b.node.parentId;
  if (!pid) return undefined;
  const p = byId.get(pid);
  if (!p || !p.isContainer) return undefined;
  const insT = 30, insS = 8, insB = 8; // top reserves the container title band
  const minX = p.x + insS, minY = p.y + insT;
  const maxX = p.x + p.w - insS - b.w, maxY = p.y + p.h - insB - b.h;
  return { minX, minY, maxX, maxY };
};

/** Which test phase the value labels show. "all" = the full s()-sac()/asc() strings. */
export type PhaseSel = "s" | "sac" | "asc" | "all";
const PHASE3_RE = /s\(([^)]*)\)-sac\(([^)]*)\)\/asc\(([^)]*)\)/g;
/** Project every composite three-phase label in `t` onto the selected phase. Values keep
 *  their C prefix (C0/C1/CX = set by a user constraint, Tessent notation). */
export const phaseText = (t: string, ph: PhaseSel): string =>
  ph === "all" ? t : t.replace(PHASE3_RE, (_, sv: string, sacv: string, ascv: string) =>
    ph === "s" ? sv : ph === "sac" ? sacv : ascv);

/** One legend entry: a small colored swatch (solid or dashed, matching the actual stroke style
 *  it stands for) + label. Plain DOM, not Konva — the toolbar strip above the canvas is HTML. */
function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
      <span style={{
        width: 10, height: 10, borderRadius: 2,
        border: `1.5px solid ${color}`, background: dashed ? "transparent" : color,
        ...(dashed ? { backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 4px)` } : {}),
      }} />
      {label}
    </span>
  );
}

export function SchematicTab({ seedNodeId, onBoxDblClick, curated = false, allowOcc = true }: {
  seedNodeId: string;
  /** Optional: double-click on a module/blackbox box (clock/reset exact-circuit views use it
   *  to expand/collapse a hierarchy level). Source symbols keep their open-HDL double-click. */
  onBoxDblClick?: (nodeId: string) => void;
  /** This graph is BUILT BY THE VIEW (clock/reset exact circuit), not grown by tracing.
   *  Affects the INNER (into-container) diamonds and default double-click only — pin tracing
   *  itself stays on everywhere, because a schematic that cannot be grown past the walk's edge
   *  is not a schematic of the design. */
  curated?: boolean;
  /** Offer add_occ_point in the context menus. An OCC controls CLOCKS; on a reset view the
   *  command is a category error, so the reset pages pass false. Defaults on. */
  allowOcc?: boolean;
}) {
  const rawGraph = useStore((s) => s.schematics[seedNodeId]);
  // Thread every boundary-crossing edge through the container's real port (or mark it dashed).
  const repaired = useMemo(
    () => (rawGraph ? dropPlaceholderGatePins(repairBoundaryCrossings(rawGraph)) : rawGraph),
    [rawGraph]);
  // PLANNED control muxes, drawn where they will go. Re-read whenever the dp_shell plan moves.
  const drcRev = useStore((s) => s.drcRev);
  const [planned, setPlanned] = useState<PlannedMux[]>([]);
  // The planned DFX IPs too, so a driver pin can be drawn on the module it belongs to rather
  // than as a bare net name.
  const [plannedIps, setPlannedIps] = useState<PlannedIp[]>([]);
  const [plannedCons, setPlannedCons] = useState<PlannedConstraint[]>([]);
  // The latest DRC analysis + the violation this canvas debugs (both published by the DRC
  // page). Subscribed — not read once — so the roles appear the moment an analysis lands.
  const crItems = useStore((s) => s.crItems);
  const crDebug = useStore((s) => s.crDebugItem);
  const crClocks = useStore((s) => s.crClocks);
  const schematicFocusRequest = useStore((s) => s.schematicFocusRequest);
  const highlightedClock = useStore((s) => s.highlightedClock);
  useEffect(() => {
    let dead = false;
    void hs.dpShell("report_dft_ctrl_mux; report_dft_ips")
      .then((r) => {
        if (dead) return;
        // Replace the state only when the CONTENT differs. A fresh array on every poll changes
        // the memo identity, which re-runs the ELK layout for a plan that did not move.
        // `role` = which failing reset groups need this mux. On a DRC debug canvas the current
        // violation is known, so the role also says whether the mux is THIS group's fix point
        // or works for another branch (the "duplicate fix" that is not one).
        const forItem = seedNodeId.startsWith("drcsch:") ? crDebug ?? undefined : undefined;
        const ms = (r.ctrlMuxes ?? []).map((m) => ({
          target: m.target, overrideSource: m.overrideSource, select: m.select,
          ...(crItems.length ? { role: muxRole(crItems, m.target, forItem) } : {}) }));
        const xs = (r.dftIps ?? []).map((x) => ({
          instance: x.instance, module: x.module, at: x.at,
          // Per-phase port states computed by the daemon from the IP library — the box on the
          // schematic shows the IP's INPUT CIRCUIT with them (absent until read_dfx_ip).
          ...(x.ports ? { ports: x.ports } : {}),
        }));
        setPlanned((p) => (JSON.stringify(p) === JSON.stringify(ms) ? p : ms));
        setPlannedIps((p) => (JSON.stringify(p) === JSON.stringify(xs) ? p : xs));
        const cs = r.pinConstraints ?? [];
        setPlannedCons((p) => (JSON.stringify(p) === JSON.stringify(cs) ? p : cs));
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [drcRev, crItems, crDebug, seedNodeId]);
  // SELF-SUFFICIENT role captions: a planned mux's "本组的修复点 / 其他分支 / 无复位组需要它"
  // caption needs crItems, which only existed because the DRC page happened to have run once
  // THIS session. A schematic opened before that (or in a session where DRC is never visited)
  // showed muxes with NO explanation at all — the plain "planned · dfx_scan_mode" caption a
  // user reads as "this looks redundant" ("会让用户觉得多余"), when the tool simply never
  // computed an answer. A bare reset walk (no SDC/OCC/forces — those are the CLOCK/scan
  // dimension, irrelevant to reset attribution) is enough; visiting DRC later overwrites this
  // with the full analysis. Fetched AT MOST ONCE per session (module-level guard: several
  // schematic tabs can be mounted at once, and only one of them should ask).
  useEffect(() => {
    if (planned.length === 0 || crItems.length > 0 || crBootstrapPromise) return;
    crBootstrapPromise = hs.clockResetTree("", "", [], [], [], true)
      .then((r) => { useStore.getState().setCrItems(r.items); useStore.getState().setCrClocks(r.clocks); })
      .catch(() => { /* daemon not ready yet — the next mount with a planned mux retries */ })
      .finally(() => { crBootstrapPromise = null; });
  }, [planned.length, crItems.length]);
  // TRACE INTO the planned IPs: their internal circuit is shown BY DEFAULT — the whole point
  // of drawing the box is answering "where does this value come from", so the answer must not
  // hide behind a menu ("你还是没有显示…里面的电路"). The cone comes from the IP library's own
  // elaboration (dfx-ip-cone) and re-fetches on plan changes, because the per-net values
  // depend on the constraints in force. Right-click a box to collapse it back to the flat
  // port list; `ipClosed` remembers that choice.
  const [ipClosed, setIpClosed] = useState<ReadonlySet<string>>(new Set<string>());
  /** Planned-mux target whose covered register groups are being shown ("" = closed). */
  const [muxInfo, setMuxInfo] = useState("");
  /** Mux targets whose covered REGISTER GROUPS are drawn ON the canvas (click the mux output
   *  pin, or the node menu). One more click folds them away. */
  const [muxRegs, setMuxRegs] = useState<ReadonlySet<string>>(new Set<string>());
  const toggleMuxRegs = (target: string) => setMuxRegs((prev) => {
    const nx = new Set(prev);
    if (nx.has(target)) nx.delete(target); else nx.add(target);
    return nx;
  });
  // Which phase the VALUE LABELS show. All three at once is the truthful default nobody can
  // read ("同时显示…很麻烦") — so one phase at a time, a dropdown to switch, "all" available.
  const [phaseSel, setPhaseSel] = useState<PhaseSel>(
    () => (localStorage.getItem("dft-suite.phaseView") as PhaseSel) || "s");
  const pickPhase = useCallback((v: PhaseSel) => {
    setPhaseSel(v);
    localStorage.setItem("dft-suite.phaseView", v);
  }, []);
  const [ipCones, setIpCones] = useState<ReadonlyMap<string, DfxIpConeResult>>(new Map());
  // The overlay's boxes exist BEFORE any expansion — build the base graph first, list its
  // planip boxes, fetch their cones, then expand. No circularity.
  const baseGraph = useMemo(
    () => {
      if (!repaired) return repaired;
      // The overlay is an ANNOTATION — a failure in it must degrade to the plain circuit,
      // never to a blank pane ("circuit schematic 显示不出来了" must not have this cause).
      try {
        return withPlannedMuxes(repaired, planned, fullPinAbs, plannedIps, undefined, plannedCons);
      } catch (err) {
        console.error("planned-mux overlay failed; showing base circuit", err);
        return repaired;
      }
    },
    [repaired, planned, plannedIps, plannedCons]);
  const ipBoxIds = useMemo(
    () => (baseGraph
      ? Object.keys(baseGraph.nodes).filter((id) => id.startsWith("planip:") && !id.includes("#"))
      : []),
    [baseGraph]);
  useEffect(() => {
    // values move with the plan — refresh every visible cone on drcRev
    let dead = false;
    void (async () => {
      const next = new Map<string, DfxIpConeResult>();
      for (const boxId of ipBoxIds) {
        if (ipClosed.has(boxId)) continue;
        const ip = plannedIps.find((x) =>
          boxId === `planip:${x.at ? `${x.at.replace(/[.:]/g, "/")}/${x.instance}` : x.instance}`);
        if (!ip) continue;
        try { next.set(boxId, await hs.dfxIpCone(ip.instance)); }
        catch { /* no library loaded — the box stays flat, which is the honest picture */ }
      }
      if (!dead && next.size) setIpCones((p) => {
        const merged = new Map(p);
        for (const [k, v] of next) merged.set(k, v);
        return merged;
      });
    })();
    return () => { dead = true; };
  }, [ipBoxIds, ipClosed, plannedIps, drcRev]);
  const graph = useMemo(
    () => {
      if (!baseGraph) return baseGraph;
      let g = baseGraph;
      for (const boxId of ipBoxIds) {
        if (ipClosed.has(boxId)) continue;
        const cone = ipCones.get(boxId);
        const box = g.nodes[boxId];
        if (!cone || !box) continue;
        // expand toward the pins this schematic actually uses (the box's out-role ports)
        const outPins = box.ports.filter((p) => p.direction === "out").map((p) => p.name);
        g = expandIpInternals(g, boxId, cone, outPins);
      }
      // COVERED REGISTERS on demand: for each toggled planned mux, draw the register groups
      // it serves as DFF boxes hanging off its output (dashed = abstract, the wire crosses
      // hierarchy the cone does not draw). Each box carries the FULL story: owner instance,
      // reset net, bit count, active edge, required inactive value and the three-phase values
      // — red = still failing, yellow = held by this plan.
      if (muxRegs.size && crItems.length) {
        const nodes2 = { ...g.nodes };
        const edges2 = [...g.edges];
        let touched = false;
        for (const t of muxRegs) {
          const muxId = `planmux:${t}`;
          const muxNode = nodes2[muxId];
          if (!muxNode) continue;
          // Biggest first, CAPPED: the puc mux serves 113 groups and drawing them all buries
          // the canvas. The tail folds into one summary box; the full list stays one
          // right-click away ("此 mux 服务的寄存器组…").
          const all = muxCoveredGroups(crItems, t);
          const MAX = 12;
          for (const cg of all.slice(0, MAX)) {
            const cid = `covreg:${t}:${cg.owner}:${cg.net}`;
            if (nodes2[cid]) continue;
            const phases = cg.sac ? `s(${cg.s})-sac(${cg.sac})/asc(${cg.asc})` : `s(${cg.s})`;
            nodes2[cid] = {
              id: cid,
              instanceName: `${cg.owner.split("/").pop() ?? cg.owner}/${cg.net}`,
              designName: `${cg.flops} bit · ${cg.set ? "set" : "rst"} ${cg.edge} · inactive=${cg.inactive}`,
              kind: "logic", prim: "dff", bits: cg.flops,
              realPath: cg.owner,
              stateLabel: `${cg.set ? "set" : "rst"} ${phases}`,
              alert: !cg.held,
              warn: cg.held,
              ports: [{ name: cg.set ? "set" : "rst", direction: "in", busLabel: cg.net }],
              ...(muxNode.parentId ? { parentId: muxNode.parentId } : {}),
            };
            edges2.push({
              id: `covreg-e:${cid}`,
              fromNode: muxId, fromPort: "o", toNode: cid, toPort: cg.set ? "set" : "rst",
              netName: cg.net, bus: false, crossing: true,
            });
            touched = true;
          }
          if (all.length > MAX) {
            const rest = all.slice(MAX);
            const restFlops = rest.reduce((n, x) => n + x.flops, 0);
            const mid = `covreg:${t}:__more`;
            if (!nodes2[mid]) {
              nodes2[mid] = {
                id: mid,
                instanceName: `+${rest.length} 组 · ${restFlops} flop`,
                designName: "其余寄存器组 — 右键 mux →『此 mux 服务的寄存器组…』看全表",
                kind: "logic", prim: "dff", bits: restFlops,
                warn: rest.every((x) => x.held),
                alert: rest.some((x) => !x.held),
                ports: [{ name: "rst", direction: "in", busLabel: "…" }],
                ...(muxNode.parentId ? { parentId: muxNode.parentId } : {}),
              };
              edges2.push({
                id: `covreg-e:${mid}`,
                fromNode: muxId, fromPort: "o", toNode: mid, toPort: "rst",
                netName: "…", bus: false, crossing: true,
              });
              touched = true;
            }
          }
        }
        if (touched) g = { ...g, nodes: nodes2, edges: edges2 };
      }
      // e2e handle: the FINAL graph the canvas draws (planned muxes spliced, IP internals
      // expanded). Invariants like "no pin has two drivers" have to be checked on THIS, not on
      // the pre-overlay graph — the overlay is exactly where a second driver could appear.
      (window as unknown as { __graphForTest?: Record<string, unknown> }).__graphForTest = {
        ...(window as unknown as { __graphForTest?: Record<string, unknown> }).__graphForTest,
        [seedNodeId]: g,
      };
      return g;
    },
    [baseGraph, ipBoxIds, ipClosed, ipCones, seedNodeId, muxRegs, crItems]);

  // Node ids the highlighted clock's own items actually touch (crSchematic.ts's clockPaths) —
  // null when nothing is highlighted OR the highlight belongs to a DIFFERENT seed (Clock vs
  // Reset tab each have their own schematic seed).
  const highlightedNodeIds = useMemo(() => {
    if (!highlightedClock || highlightedClock.seedId !== seedNodeId) return null;
    const ids = graph?.clockPaths?.[highlightedClock.clockName];
    return ids && ids.length ? new Set(ids) : null;
  }, [highlightedClock, seedNodeId, graph]);
  // A wire is "on the highlighted path" when BOTH its endpoints are — an edge connecting two
  // path nodes really is a segment of that clock's own route, not just incidentally touching it.
  const highlightedEdgeIds = useMemo(() => {
    if (!highlightedNodeIds || !graph) return null;
    const ids = new Set<string>();
    for (const e of graph.edges)
      if (highlightedNodeIds.has(e.fromNode) && highlightedNodeIds.has(e.toNode)) ids.add(e.id);
    return ids;
  }, [highlightedNodeIds, graph]);

  // "点击occ定义点可以找到sdc相应的clock定义" needs a clock name RECORDED on the point in the
  // first place — an add_occ_point with no `-clock` has nothing to look up. The right-click menus
  // below already sit on a pin/node the clock/reset analysis has already tied to a clock (SchPort
  // .clocks per pin, clockPaths per node); auto-filling `-clock` from that is recording what the
  // user already picked, not suggesting a NEW point — so it stays silent (no suffix) whenever the
  // pin/node is genuinely ambiguous (shared by more than one clock's path) rather than guess.
  const clockSuffixForNode = useCallback((nodeId: string): string => {
    const cp = graph?.clockPaths;
    if (!cp) return "";
    const hits = Object.keys(cp).filter((clk) => cp[clk]?.includes(nodeId));
    return hits.length === 1 ? ` -clock ${hits[0]}` : "";
  }, [graph]);
  const clockSuffixForPort = useCallback((nodeId: string, port: string): string => {
    const clocks = graph?.nodes[nodeId]?.ports.find((q) => q.name === port)?.clocks;
    if (clocks?.length === 1) return ` -clock ${clocks[0]}`;
    // Same net, same clock, even when only the DRIVING end (e.g. the clock-root symbol) got
    // tagged during the walk — an input pin fed straight off it is just as valid a point.
    // `SchPort.clocks` is only ever set on flop-adjacent pins deep in the walk, so a boundary
    // pin like this one needs the coarser but far more complete node-level `clockPaths` too —
    // the clock root symbol itself is a singleton member of exactly one clock's path.
    const wire = graph?.edges.find((e) =>
      (e.fromNode === nodeId && e.fromPort === port) || (e.toNode === nodeId && e.toPort === port));
    if (wire) {
      const otherNode = wire.fromNode === nodeId ? wire.toNode : wire.fromNode;
      const otherPort = wire.fromNode === nodeId ? wire.toPort : wire.fromPort;
      const other = graph?.nodes[otherNode]?.ports.find((q) => q.name === otherPort)?.clocks;
      if (other?.length === 1) return ` -clock ${other[0]}`;
      const otherNodeSuffix = clockSuffixForNode(otherNode);
      if (otherNodeSuffix) return otherNodeSuffix;
    }
    return clockSuffixForNode(nodeId);
  }, [graph, clockSuffixForNode]);

  const trace = useStore((s) => s.traceSchematic);
  const openHdl = useStore((s) => s.openLocationHdl);
  const traceInside = useStore((s) => s.traceInside);
  const traceLogicInputs = useStore((s) => s.traceLogicInputs);
  const openDefByDef = useStore((s) => s.openHdlDefinitionByDefId);
  const openHdlForPath = useStore((s) => s.openHdlForPath);
  // Dispatches a resolved hdlTargetFor() result to whichever store action it needs — shared by
  // the context menu and the box double-click gesture so the two can never disagree.
  const openHdlTarget = useCallback((t: HdlTarget) => {
    if (t.kind === "loc") openHdl(t.file, t.line, t.title);
    else if (t.kind === "def") void openDefByDef(t.defId, t.designName);
    else void openHdlForPath(t.path);
  }, [openHdl, openDefByDef, openHdlForPath]);
  const showInSchematic = useStore((s) => s.showClockInSchematic);
  const selectInstance = useStore((s) => s.selectInstance);
  const addToGen = useStore((s) => s.addToGenConnection);
  const addToDfx = useStore((s) => s.addToDfxCtrl);
  const clearSchematic = useStore((s) => s.clearSchematic);
  const collapse = useStore((s) => s.collapseInside);
  const expandCells = useStore((s) => s.expandLogicCells);   // P2: block -> gates/MUX/DFF
  const hideCells = useStore((s) => s.hideLogicCells);       // collapse the P2 view again
  // The tops the tree currently shows = the harden top(s). Paths strip THIS prefix, so a
  // design hardened at e.g. processor_core copies as `u_a.u_b`, not `processor_core.u_a.u_b`.
  const roots = useStore((s) => s.rootInstanceIds);
  // Tessent-convention command paths: the harden TOP module name is implicit
  // (`PROCESSOR_1/clock_module_0/mclk`, never `processor_core/...`). dp_shell resolves both
  // spellings (top-relative fallback in findObjects), so DISPLAY and COPY both drop the top —
  // what you see is what you copy, and both forms execute.
  const stripTop = (p: string): string => {
    const i = p.indexOf("/");
    return i > 0 && roots.includes(p.slice(0, i)) ? p.slice(i + 1) : p;
  };
  const fullPin = (n: string, po: string): string => stripTop(fullPinAbs(n, po));
  const fullNetPath = (f: string, t: string, net: string): string => {
    const p = fullNetPathAbs(f, t, net);
    const i = p.indexOf(".");
    return i > 0 && roots.includes(p.slice(0, i)) ? p.slice(i + 1) : p;
  };
  /** Top-relative INSTANCE path of a node ('' when it names no design object). */
  const instPath = (id: string): string => {
    const r = realNodePath(id);
    return r ? stripTop(userPath(r)) : "";
  };
  const setError = useStore((s) => s.setError);

  // Run a dp_shell command from a menu item. Same backend as the console panel, so whatever the
  // menu records appears there (and in dfx_occ_def_point.tcl) immediately — only FAILURES are
  // surfaced here; the dp_shell panel is where the confirmation text belongs.
  const runDp = useCallback(async (cmd: string) => {
    try {
      const r = await hs.dpShell(cmd);
      if (!r.ok) setError(`dp_shell: ${r.error || cmd}`);
      // Success TOAST — without it a recorded constraint looked like "没有用" (the dp_shell
      // panel may be collapsed and pin constraints only bite on the next Run DRC).
      else notify(`✓ ${cmd}`);
    } catch (e) {
      setError(`dp_shell failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [setError]);

  // add_dft_ctrl_mux is asked for in ONE dialog that names the roles and lets each pin be
  // picked from the design — see CtrlMuxDialog for why two blind text prompts did not work.
  const askCtrlMux = useCallback(async (target: string) => {
    const specs = await askCtrlMuxDialog(target);
    if (!specs) return;
    for (const spec of specs) await runDp(ctrlMuxCommand(spec));
  }, [runDp]);
  /** The recorded mux on this target, if there is one. Matched the way the plan is written down:
   *  either spelling, either separator. */
  const muxOn = useCallback((target: string): PlannedMux | undefined => {
    const t = target.replace(/[.:]/g, "/");
    return planned.find((m) => {
      const q = m.target.replace(/[.:]/g, "/");
      return q === t || q.endsWith("/" + t) || t.endsWith("/" + q);
    });
  }, [planned]);
  const removeMux = useCallback(async (target: string) => {
    await runDp(`delete_dft_ctrl_mux ${target}`);
  }, [runDp]);

  /** Record straight from the menu with the remembered DFT pair — the second mux onward needs
   *  no dialog, because the answer has not changed since the first one. */
  const quickCtrlMux = useCallback(async (target: string) => {
    const d = ctrlMuxDefaults();
    await runDp(ctrlMuxCommand({ target, overrideSource: d.overrideSource, select: d.select }));
  }, [runDp]);
  const [selectedNode, setSelectedNode] = useState<string | null>(() => selBySeed.get(seedNodeId)?.node ?? null);
  // Right-click target: a module box, a pin/port, or a wire (net).
  const [ctxMenu, setCtxMenu] = useState<
    | { x: number; y: number; kind: "node"; nodeId: string }
    | { x: number; y: number; kind: "pin"; nodeId: string; port: string }
    | { x: number; y: number; kind: "net"; wireId: string }
    | null
  >(null);
  const [selectedWire, setSelectedWire] = useState<string | null>(() => selBySeed.get(seedNodeId)?.wire ?? null);
  // LEFT-CLICK pin selection ("选中"): highlight a pin/port without opening a menu — the pin
  // stays highlighted after the menu closes too (right-click sets it as well).
  const [selPin, setSelPin] = useState<{ node: string; port: string } | null>(null);
  // "Click a clock-table row -> reveal its definition point": select the node the moment it
  // exists on THIS canvas. ClockResetTab expands the container chain down to it first, which
  // takes a render cycle — the request keeps re-checking (cheap) each time `graph` changes until
  // the node appears, then a ref marks the rev consumed so it never re-fires on a LATER,
  // unrelated graph change and steals the user's own selection back.
  const focusConsumedRev = useRef(0);
  useEffect(() => {
    const req = schematicFocusRequest;
    if (!req || req.seedId !== seedNodeId || req.rev === focusConsumedRev.current) return;
    const node = graph?.nodes[req.nodeId];
    if (!node) return;   // ancestors not expanded/rendered yet — try again on the next graph update
    focusConsumedRev.current = req.rev;
    setSelectedWire(null);
    // BOTH at once (normal clicks keep these exclusive; a jump is not a normal click): selPin
    // drives the object-name bar's SDC clock text, selectedNode drives the box's own blue
    // highlight outline (PortSourceSym/StaticBox) — a jump needs the strong visual, not just the
    // small pin diamond a plain pin-click leaves.
    setSelectedNode(req.nodeId);
    const port = node.ports.find((p) => p.direction === "out")?.name;
    setSelPin(port ? { node: req.nodeId, port } : null);
  }, [schematicFocusRequest, graph, seedNodeId]);
  // "Select Visible Pins…" panel: full pin list + current selection + search filter.
  const [pinPicker, setPinPicker] = useState<{
    nodeId: string; x: number; y: number;
    ports: Array<{ name: string; direction: string; busLabel: string }>;
    sel: Set<string>; q: string;
  } | null>(null);
  const setVisiblePins = useStore((s) => s.setVisiblePins);
  // The cap that keeps "show every pin" from ever being able to bury the canvas: a handful of
  // library cells and generated wrappers genuinely carry hundreds of ports, and drawing them
  // all defeats the point of a schematic. 200 is generous for everything in this design (the
  // biggest real box, omsp_frontend, has 43) while still refusing the pathological case.
  const MAX_SHOWN_PINS = 200;
  // Shared by "Show All Pins" and "Show Pins on Box": fetch the instance's REAL full port list
  // (falling back to whatever the box already shows for a synthetic node) and put every one of
  // them on the box, unless that would exceed the cap. Returns whether it actually drew them,
  // so a caller doing something ELSE too (opening the Ports tab) can still do that regardless.
  const revealAllPinsOnBox = useCallback(async (id: string, node: SchNode): Promise<boolean> => {
    let full = node.ports.map((p) => ({ name: p.name, direction: p.direction as string, busLabel: p.busLabel }));
    if (realNodePath(id) === id) {
      try { full = (await hs.getPorts({ nodeId: id })).ports; } catch { /* keep on-canvas list */ }
    }
    if (full.length > MAX_SHOWN_PINS) {
      notify(`${node.instanceName}: ${full.length} pins — 超过 ${MAX_SHOWN_PINS} 上限,未在图上展开(仍可用 Select Visible Pins… 挑选)`);
      return false;
    }
    setVisiblePins(seedNodeId, id, full.map((p) => p.name), full);
    return true;
  }, [seedNodeId, setVisiblePins, realNodePath]);
  // Highlight persistence, both directions. Two distinct lifecycles meet here:
  //   * workspace switch (Clock Tree -> DRC -> back): the component REMOUNTS, the useState
  //     initialisers above restore from selBySeed;
  //   * seed switch on a LIVE instance (Clock<->Reset tab, DRC debug tabs): no remount, so the
  //     state must be swapped by hand — and the swap must run BEFORE the mirror write, or the
  //     old seed's selection gets written under the new seed and permanently clobbers it
  //     (that was the "switching pages loses the trace highlight" report).
  const selSeedRef = useRef(seedNodeId);
  useEffect(() => {
    if (selSeedRef.current !== seedNodeId) {
      selSeedRef.current = seedNodeId;
      setSelectedNode(selBySeed.get(seedNodeId)?.node ?? null);
      setSelectedWire(selBySeed.get(seedNodeId)?.wire ?? null);
      return;   // do NOT mirror on this pass — the state still holds the old seed's values
    }
    selBySeed.set(seedNodeId, { node: selectedNode, wire: selectedWire });
  }, [seedNodeId, selectedNode, selectedWire]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [ctxMenu]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [laid, setLaid] = useState<Laid | null>(null);
  // User-dragged absolute box positions (override the ELK layout for those nodes).
  const [manualPos, setManualPos] = useState<Record<string, { x: number; y: number }>>({});

  // WIRE ROUTING BELONGS TO ELK. Measured head-to-head on a 4-module openMSP430-shaped graph
  // (scratchpad/layout_probe.mjs): ELK's orthogonal router → 0 box crossings, 0 pin-column
  // rides, 0 wire-wire overlaps, max 4 bends. A hand-rolled greedy A* router → 29 overlaps and
  // 10-12 bend staircases, because sequential per-wire routing cannot do the GLOBAL channel
  // assignment + nudging that ELK does across all edges at once. So we never rewrite points.
  //
  // A manual drag only MOVES a box (+ its pins) for immediate feedback; the wires it touches
  // get a temporary straight path during the drag, and on release we re-run ELK (settleTick)
  // so the whole diagram is re-routed globally and cleanly.
  const laidAdj = useMemo<Laid | null>(() => {
    if (!laid || !graph || Object.keys(manualPos).length === 0) return laid;
    const shift = (m: Record<string, { x: number; y: number }>, dx: number, dy: number) =>
      Object.fromEntries(Object.entries(m).map(([k, p]) => [k, { x: p.x + dx, y: p.y + dy }]));
    const boxes = laid.boxes.map((b) => {
      const p = manualPos[b.node.id];
      if (!p) return b;
      const dx = p.x - b.x, dy = p.y - b.y;
      return { ...b, x: p.x, y: p.y, ports: shift(b.ports, dx, dy), innerPorts: shift(b.innerPorts, dx, dy) };
    });
    // Only wires touching a moved box need a provisional path (ELK's bend points are stale for
    // those until the post-drag relayout lands). Every other wire keeps ELK's clean routing.
    const byId = new Map(boxes.map((b) => [b.node.id, b]));
    const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
    const moved = new Set(Object.keys(manualPos));
    const wires = laid.wires.map((w) => {
      const e = edgeById.get(w.id);
      if (!e || (!moved.has(e.fromNode) && !moved.has(e.toNode))) return w;
      const s = byId.get(e.fromNode)?.ports[portId(e.fromNode, e.fromPort)];
      const t = byId.get(e.toNode)?.ports[portId(e.toNode, e.toPort)];
      if (!s || !t) return w;
      const mx = (s.x + t.x) / 2;
      return { ...w, points: [s.x, s.y, mx, s.y, mx, t.y, t.x, t.y] };
    });
    return { boxes, wires };
  }, [laid, manualPos, graph]);

  // Absolute-box lookup used to clamp a dragged child inside its parent container.
  const boxById = useMemo(() => new Map((laidAdj?.boxes ?? []).map((b) => [b.node.id, b])), [laidAdj]);

  // E2E probe: CLIENT-space pin anchors of the currently mounted schematic. Playwright clicks
  // these real pixels, so a test exercises the whole Konva hit stack (layer order included) —
  // exactly the stack that silently broke pin selection once before (wire hit layer on top).
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__schPinProbe = () => {
      const stage = stageRef.current;
      if (!stage || !laidAdj) return [];
      const rect = stage.container().getBoundingClientRect();
      const s = stage.scaleX();
      const out: Array<{ node: string; port: string; x: number; y: number }> = [];
      for (const b of laidAdj.boxes)
        for (const [pid, pt] of Object.entries(b.ports)) {
          const { port } = parsePortId(pid);
          // Same on-border offset the marker rendering applies (pt is the stub anchor).
          const isOut = b.node.ports.find((q) => q.name === port)?.direction === "out";
          const mx = pt.x + (isOut ? -PIN_STUB : PIN_STUB);
          out.push({ node: b.node.id, port,
                     x: rect.left + stage.x() + mx * s,
                     y: rect.top + stage.y() + pt.y * s });
        }
      return out;
    };
  });

  // Stability-lite (spec §2.4): feed each box's remembered on-screen position (prevPosBySeed)
  // to the next layout as ordering tie-breaks and re-anchor the result on the seed box.
  const [relayoutTick, setRelayoutTick] = useState(0);

  // Remember the current zoom/pan for this seed (called after every fit / wheel / pan).
  const saveView = useCallback((user = false) => {
    const stage = stageRef.current;
    if (!stage) return;
    viewBySeed.set(seedNodeId, { scale: stage.scaleX(), x: stage.x(), y: stage.y(), user });
    // e2e handle: current stage transform, so a spec can convert laid coords to pixels.
    (window as unknown as { __stageViewForTest?: Record<string, unknown> }).__stageViewForTest = {
      ...(window as unknown as { __stageViewForTest?: Record<string, unknown> }).__stageViewForTest,
      [seedNodeId]: { scale: stage.scaleX(), x: stage.x(), y: stage.y() },
    };
  }, [seedNodeId]);

  const applyFit = useCallback((l: Laid) => {
    const stage = stageRef.current;
    const b = boundsOf(l);
    if (!stage || !b || stage.width() <= 0 || stage.height() <= 0) return;   // ★ zero-size guard (hidden/unmeasured tab)
    const t = fitTransform(b, { w: stage.width(), h: stage.height() });
    stage.scale({ x: t.scale, y: t.scale });
    stage.position({ x: t.x, y: t.y });
    stage.batchDraw();
    saveView();
  }, [saveView]);

  /** "Reveal on screen": zoom+pan so ONE box sits centered, at a comfortable reading scale —
   *  same fitTransform the Fit button uses, just fed a tiny bounds around this box (padded so
   *  its immediate neighbors give context) instead of the whole diagram. */
  const centerOnNode = useCallback((nodeId: string) => {
    const stage = stageRef.current;
    const box = boxById.get(nodeId);
    if (!stage || !box || stage.width() <= 0 || stage.height() <= 0) return;
    const pad = 220;
    const bounds = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
    const t = fitTransform(bounds, { w: stage.width(), h: stage.height() }, 40, 1.4);
    stage.scale({ x: t.scale, y: t.scale });
    stage.position({ x: t.x, y: t.y });
    stage.batchDraw();
    saveView(true);
  }, [boxById, saveView]);

  // Second phase of the same jump request: `boxById` only has this node once its container(s)
  // have actually gone through an ELK layout pass, which lands a render or two AFTER the
  // selection effect above (that only needed the node to exist in `graph`, not be laid out yet).
  // A separate consumed-rev ref because the two effects clear on different preconditions.
  const focusCenteredRev = useRef(0);
  useEffect(() => {
    const req = schematicFocusRequest;
    if (!req || req.seedId !== seedNodeId || req.rev === focusCenteredRev.current) return;
    if (!boxById.has(req.nodeId)) return;   // not laid out yet — try again once ELK finishes
    focusCenteredRev.current = req.rev;
    centerOnNode(req.nodeId);
  }, [schematicFocusRequest, boxById, seedNodeId, centerOnNode]);

  /** Re-apply the zoom/pan this seed was left at. Returns false when there is none saved. */
  const restoreView = useCallback((): boolean => {
    const stage = stageRef.current;
    const v = viewBySeed.get(seedNodeId);
    if (!stage || !v) return false;
    stage.scale({ x: v.scale, y: v.scale });
    stage.position({ x: v.x, y: v.y });
    stage.batchDraw();
    return true;
  }, [seedNodeId]);

  // rAF state for pan throttling — track pending pan and rAF handle.
  const panRaf = useRef<number | null>(null);
  const panDelta = useRef<{ dx: number; dy: number } | null>(null);

  // Dep on !!graph: when the graph arrives AFTER mount (clock/reset views putSchematic() from
  // an effect), the first render early-returns WITHOUT .schwrap — wrapRef is null here and an
  // empty dep list would never re-attach the observer, freezing the stage at the 800×600
  // default (user saw the canvas clipped at ~800px). Re-running on graph arrival fixes it.
  const hasGraph = !!rawGraph;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // NEVER zero. A container that is momentarily collapsed (a docked console dragged over the
    // whole column, a tab rendered while hidden) gave Konva a 0x0 layer, and drawing one throws
    // `drawImage … width or height of 0` — which took the whole workspace down with it. A 1px
    // stage draws nothing and recovers the instant the container has room again.
    const measure = () =>
      setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasGraph]);

  // Re-layout whenever the graph changes. Old boxes keep their on-screen positions
  // (semiInteractive tie-breaks + seed anchoring); first layout / 重排 auto-fits.
  useEffect(() => {
    if (!graph) { setLaid(null); return; }
    let alive = true;
    const prev = prevPosBySeed.get(seedNodeId) ?? null;
    void layout(toElkGraph(graph, prev ?? undefined)).then((elk) => {
      if (!alive) return;
      const anchored = anchorTo(toLaid(elk, graph.nodes, graph.edges), prev, seedNodeId);
      // 位置记忆:嵌套子盒存相对父系坐标(spec §4-8),根层盒存锚定后屏幕坐标(现状)
      prevPosBySeed.set(seedNodeId, Object.fromEntries(anchored.boxes.map((b) => [b.node.id, b.node.parentId ? b.rel : { x: b.x, y: b.y }])));
      setLaid(anchored);
      // e2e handle: the REAL pin geometry, so a spec can aim a REAL mouse click at a marker
      // (the store-only test missed a dead click-hit-area; pixels are the truth).
      (window as unknown as { __laidForTest?: Record<string, Laid> }).__laidForTest = {
        ...(window as unknown as { __laidForTest?: Record<string, Laid> }).__laidForTest,
        [seedNodeId]: anchored,
      };
      // A view the user set is theirs — restore it. Anything else (never touched, or an
      // earlier auto-fit for a different pane size / smaller circuit) is re-fitted, so the
      // drawing always fills the space it has.
      if (viewBySeed.get(seedNodeId)?.user) restoreView();
      else applyFit(anchored);
    });
    return () => { alive = false; };
  }, [graph, relayoutTick, applyFit, restoreView, seedNodeId]);

  // The pane's size is part of "fit": the DRC debug view is a narrow strip in the table and the
  // whole page when opened, and the divider moves at will. Re-fit on every size change unless
  // the user has zoomed/panned this seed themselves.
  const laidAdjRef = useRef<Laid | null>(null);
  laidAdjRef.current = laidAdj;
  useEffect(() => {
    if (viewBySeed.get(seedNodeId)?.user) return;
    const l = laidAdjRef.current;
    if (l) applyFit(l);
  }, [size.w, size.h, seedNodeId, applyFit]);

  // rAF-throttled wheel zoom: apply imperatively to the stage ref.
  const onWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const old = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const to = { x: (pointer.x - stage.x()) / old, y: (pointer.y - stage.y()) / old };
    const next = e.evt.deltaY < 0 ? old * 1.08 : old / 1.08;
    const scale = Math.max(0.05, Math.min(3, next));
    stage.scale({ x: scale, y: scale });
    stage.position({ x: pointer.x - to.x * scale, y: pointer.y - to.y * scale });
    stage.batchDraw();
    saveView(true);
  }, [saveView]);

  // rAF-throttled drag pan: coalesce mousemove events, apply one position update per frame.
  // We leverage Konva's built-in `draggable` for the mouse-down/up state, but intercept
  // dragmove to throttle position updates via rAF.
  const onDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return;   // a node is being dragged, not the canvas
    const stage = e.target as Konva.Stage;
    // Accumulate delta (Konva already moves the stage during drag; we just need batchDraw).
    panDelta.current = { dx: stage.x(), dy: stage.y() };
    if (panRaf.current !== null) return; // already scheduled
    panRaf.current = requestAnimationFrame(() => {
      panRaf.current = null;
      if (panDelta.current && stageRef.current) {
        stageRef.current.batchDraw();
        saveView(true);   // keep the pan across tab/workspace switches
      }
      panDelta.current = null;
    });
  }, [saveView]);

  if (!graph) return <div className="muted pad" data-tab-kind="schematic">Schematic not loaded</div>;

  return (
    <div ref={wrapRef} className="schwrap" data-tab-kind="schematic">
      <div className="schtools">
        <button data-btn="fit" title="Zoom to fit content (and follow the pane size again)"
                onClick={() => { const l = laidAdj ?? laid; if (l) applyFit(l); }}>Fit</button>
        <button data-btn="relayout" title="Fresh layout (discards position memory)" onClick={() => { prevPosBySeed.delete(seedNodeId); setManualPos({}); setRelayoutTick((t) => t + 1); }}>Relayout</button>
        <button data-btn="clear" title="Clear the schematic (reset to the root box)" onClick={() => { clearSchematic(seedNodeId); setManualPos({}); setSelectedWire(null); setSelectedNode(null); }}>Clear</button>
        <select data-btn="phase-view" value={phaseSel}
                title="值标签显示的测试相位 — shift / stuck-at capture / at-speed capture / 三相全显"
                onChange={(e) => pickPhase(e.target.value as PhaseSel)}
                style={{ marginLeft: 6 }}>
          <option value="s">shift</option>
          <option value="sac">stuck-at capture</option>
          <option value="asc">at-speed capture</option>
          <option value="all">s-sac-asc</option>
        </select>
        <span style={{ fontSize: 10, opacity: 0.65, alignSelf: "center", marginLeft: 4 }}
              title="C0/C1/CX = 用户 add_pin_constraint / set_phase_constraint 约束的值;其余全部由电路真实计算(X=不可判定)">C0/C1=约束值</span>
        {/* A schematic tool without a legend makes the engineer memorize the palette by trial and
            error — curated (clock/reset) views carry meanings (violation / fixed-by-plan /
            planned-not-inserted / highlighted clock path / SDC clock definition) a plain "blue =
            selected" convention doesn't cover. */}
        {curated && (
          <span style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: 10,
                         fontSize: 10, opacity: 0.8, flexWrap: "wrap" }}>
            <LegendDot color="#4fa3ff" label="selected" />
            <LegendDot color="#f85149" label="violation" />
            <LegendDot color="#e0a93b" label="fixed by plan" />
            <LegendDot color="#c678dd" dashed label="planned" />
            <LegendDot color="#ffd23f" dashed label="highlighted path" />
            <LegendDot color="#5be8a0" label="SDC clock def" />
          </span>
        )}
      </div>
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        draggable
        onWheel={onWheel}
        onDragMove={onDragMove}
        onClick={(e) => { if (e.target === e.target.getStage()) { setSelectedWire(null); setSelectedNode(null); setSelPin(null); } }}
      >
        {/* Static layer: listening={false} skips Konva hit-graph computation for every shape.
            Z-ORDER: wires FIRST (bottom) → container frames → leaf boxes. Drawing wires under
            everything guarantees no wire ever paints on top of a pin/box label. */}
        <Layer listening={false}>
          {laidAdj?.wires.map((w) => {
            const sel = w.id === selectedWire;
            const hi = !sel && !!highlightedEdgeIds?.has(w.id);
            return (
              <Group key={w.id}>
                <Line
                  points={w.points}
                  stroke={sel ? "#f85149" : hi ? "#ffd23f" : w.crossing ? "#a9772f" : "#6b7785"}
                  strokeWidth={sel ? (w.bus ? 3.4 : 2.8) : hi ? (w.bus ? 3.2 : 2.6) : (w.bus ? 2.2 : 1.4)}
                  // A connection we could NOT thread through a real boundary port is drawn
                  // dashed, so it never reads as a solid wire cutting through a container frame.
                  dash={w.crossing ? [7, 5] : undefined}
                  perfectDrawEnabled={false}
                />
                {/* Selection feedback = the highlight alone; the NAME shows only in the
                    Object-name bar (per user: net/pin/instance/port 都只在 object_name 显示). */}
                {/* value chips render PER PIN (below), not per wire — on-wire chips stacked
                    at fan-out points and sat on container frames. */}
              </Group>
            );
          })}
          {laidAdj?.boxes.filter((b) => b.isContainer).map((b) => (
            <StaticBox key={b.node.id} box={b} isSeed={b.node.id === seedNodeId} selected={b.node.id === selectedNode} />
          ))}
          {laidAdj?.boxes.filter((b) => !b.isContainer).map((b) => (
            <StaticBox key={b.node.id} box={b} isSeed={b.node.id === seedNodeId} selected={b.node.id === selectedNode} />
          ))}
          {/* "Highlight this clock's whole path" (jump-to-clock from the Generated files
              drawer): a bright dashed ring around every box the clock's own items touch — a
              generic overlay rather than threading a new prop through every box kind (port
              pentagon / gate symbol / DFF / plain module), so ANY node on the path lights up
              the same way regardless of how it renders. */}
          {highlightedNodeIds && laidAdj?.boxes.filter((b) => highlightedNodeIds.has(b.node.id)).map((b) => (
            <Rect key={"hl:" + b.node.id}
                  x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12}
                  cornerRadius={6} stroke="#ffd23f" strokeWidth={2.5} dash={[8, 4]}
                  listening={false} perfectDrawEnabled={false} />
          ))}
          {/* Per-PIN value annotations (X/Z/0/1/010/101, curated clock/reset views): every
              pin shows the value of the wire on it, right at the pin — RTLvision style.
              Pins are layout-spaced, so labels can never pile up the way per-wire chips did. */}
          {laidAdj?.boxes.map((b) => {
            // An OPEN container's frame ports are pass-throughs, not loads: the wire continues
            // inside to a real pin that carries the label. Labelling the frame too printed the
            // SAME value twice within a few pixels of the border ("文字有点混乱").
            if (b.isContainer) return null;
            const vals: Array<{ x: number; y: number; v: string; out: boolean; north?: boolean }> = [];
            for (const p of b.node.ports) {
              // EVERY pin shows its simulated state ("在每一个 pin 上显示仿真的值"): loads
              // read their incoming wire, drivers their outgoing one. Driver chips sit to the
              // RIGHT of the pin (on the wire), load chips to the LEFT — same wire, same
              // value, each end readable where the eye lands.
              const pt = b.ports[portId(b.node.id, p.name)];
              if (!pt) continue;
              if (p.direction === "out") {
                const e0 = graph.edges.find((e) =>
                  (e.fromNode === b.node.id && e.fromPort === p.name) && e.val);
                if (e0?.val) vals.push({ x: pt.x, y: pt.y, v: e0.val, out: true });
                continue;
              }
              const e0 = graph.edges.find((e) =>
                (e.toNode === b.node.id && e.toPort === p.name) && e.val);
              if (!e0?.val) continue;
              // A MUX select enters from the TOP: the left-of-pin placement meant for
              // horizontal wires floated its chip up the vertical stub, a bend away from the
              // pin ("C0 与 select pin 距离太远"). Anchor it right beside the pin instead.
              const north = b.node.prim === "mux" && isMuxSelect(b.node, p.name);
              vals.push({ x: pt.x, y: pt.y, v: e0.val, out: false, north });
            }
            if (!vals.length) return null;
            return (
              <Group key={"pv:" + b.node.id} listening={false}>
                {vals.map((t, k) => {
                  // Labels show ONE phase at a time (the dropdown); "all" keeps the composite.
                  const txt = phaseText(t.v, phaseSel).replace("‖", " ");
                  // Colour by the shown value ("all": by the SHIFT part — the phase the reset
                  // DRC judges). A CONSTRAINED value (C0/C1/CX) is blue: it is the user's
                  // constraint speaking, not the circuit.
                  const phase = /^s\(([^)]*)\)/.exec(txt)?.[1];
                  const main = (phase ?? txt.split(" ")[0]).replace(/^C/, "");
                  const col = /C[01X]/.test(txt) ? "#58a6ff"
                            : main === "010" || main === "101" ? "#3fb950"
                            : main === "0" || main === "1" ? "#d29922"
                            : main === "Z" ? "#e0a93b" : "#f85149";
                  const tw = txt.length * 6 + 4;
                  // A short chip ("0", "010") sits above the wire like before. A LONG one (the
                  // three-phase label) goes BELOW it — above, it fought the net name and the
                  // neighbouring hop's chip and ran across container borders.
                  // DRIVER-end chips take the OPPOSITE side of load-end chips: on a short wire
                  // the two ends sit pixels apart, and same-side rendering read as one doubled
                  // value ("感觉是11"). Opposite sides keep both ends labeled and unambiguous.
                  const below = t.out ? txt.length <= 6 : txt.length > 6;
                  return (
                    <Text key={k}
                          x={t.north ? t.x + 4 : t.out ? t.x + 4 : t.x - tw - 4}
                          y={t.north ? t.y + 2 : below ? t.y + 5 : t.y - 13}
                          width={tw} align={t.north || t.out ? "left" : "right"} wrap="none"
                          text={txt} fontSize={9.5} fontStyle="bold"
                          fill={col} perfectDrawEnabled={false} />
                  );
                })}
              </Group>
            );
          })}
        </Layer>

        {/* Wire hit layer: transparent wide-hit lines so a thin wire is easy to click-select.
            MUST render BELOW the interactive layer — its 12px hit stroke ends exactly at the
            pin anchors, so on top it swallowed every click on a CONNECTED pin (in the clock
            tree every pin is connected → "无法选中 pin"). Pin beats wire, like any EDA tool. */}
        <Layer>
          {laidAdj?.wires.map((w) => (
            <Line
              key={"hit:" + w.id}
              points={w.points}
              stroke="transparent"
              strokeWidth={2}
              hitStrokeWidth={12}
              onClick={(e) => { e.cancelBubble = true; setSelectedWire(w.id); }}
              onTap={(e) => { e.cancelBubble = true; setSelectedWire(w.id); }}
              onContextMenu={(e) => {
                e.evt.preventDefault(); e.cancelBubble = true;
                setSelectedWire(w.id); setSelectedNode(null);
                setCtxMenu({ x: e.evt.clientX, y: e.evt.clientY, kind: "net", wireId: w.id });
              }}
              onMouseEnter={cursorPointer}
              onMouseLeave={cursorDefault}
              perfectDrawEnabled={false}
            />
          ))}
        </Layer>

        {/* Interactive layer: pin diamonds + double-click rects. Separate layer so Konva's
            hit detection only scans these shapes (O(pins) instead of O(all shapes)). */}
        <Layer>
          {laidAdj?.boxes.map((b) => (
            <InteractiveBox
              key={b.node.id}
              box={b}
              bounds={parentClampBounds(b, boxById)}
              isSeed={b.node.id === seedNodeId}
              expanded={graph.expanded[b.node.id] ?? []}
              empty={graph.empty[b.node.id] ?? []}
              inExpanded={graph.inExpanded[b.node.id] ?? []}
              inEmpty={graph.inEmpty[b.node.id] ?? []}
              selectedPin={ctxMenu?.kind === "pin" && ctxMenu.nodeId === b.node.id ? ctxMenu.port
                           : selPin?.node === b.node.id ? selPin.port : undefined}
              curated={curated}
              onPin={(port, dir) => void trace(seedNodeId, b.node.id, port, dir)}
              onPinSelect={(port) => {
                // Clicking a PLANNED MUX's output = show/hide the register groups it serves,
                // drawn as DFF boxes ("点击 fanout 显示对应的寄存器"). Other pins keep the
                // normal select behaviour.
                if (b.node.id.startsWith("planmux:") &&
                    b.node.ports.find((q) => q.name === port)?.direction === "out") {
                  toggleMuxRegs(b.node.id.slice("planmux:".length));
                  return;
                }
                setSelectedNode(null); setSelectedWire(null); setSelPin({ node: b.node.id, port });
              }}
              onPinInside={(port) => void traceInside(seedNodeId, b.node.id, port)}
              onPinCtx={(port, x, y) => { setSelectedNode(null); setSelectedWire(null); setSelPin({ node: b.node.id, port }); setCtxMenu({ x, y, kind: "pin", nodeId: b.node.id, port }); }}
              onLogicExpand={() => void traceLogicInputs(seedNodeId, b.node.id)}
              onSelect={() => { setSelectedNode(b.node.id); setSelectedWire(null); setSelPin(null); }}
              onMove={(nx, ny, final) => {
                setManualPos((m) => ({ ...m, [b.node.id]: { x: nx, y: ny } }));
                if (!final) return;
                // On drop: remember the new position and re-run ELK, so ELK re-routes EVERY
                // wire globally (clean channels, no overlaps) instead of us hand-routing.
                const parent = b.node.parentId ? boxById.get(b.node.parentId) : undefined;
                const remembered = parent ? { x: nx - parent.x, y: ny - parent.y } : { x: nx, y: ny };
                prevPosBySeed.set(seedNodeId, { ...(prevPosBySeed.get(seedNodeId) ?? {}), [b.node.id]: remembered });
                setManualPos({});
                setRelayoutTick((t) => t + 1);
              }}
              // Double-click a box's body -> straight to its RTL, same three-tier resolution
              // as the right-click "Show HDL Definition" item ("如何快速找到对应的 RTL" — the
              // fastest path should not need a menu). `undefined` (nothing resolves, OR this is
              // a planned IP whose double-click already means "toggle internal circuit") lets
              // InteractiveBox fall through to onDbl's other gestures.
              onOpenHdl={!b.node.id.startsWith("planip:") && hdlTargetFor(b.node)
                ? () => openHdlTarget(hdlTargetFor(b.node)!) : undefined}
              onDbl={b.node.id.startsWith("planip:")
                // Double-click on a planned IP toggles its internal circuit — the same gesture
                // that expands/collapses hierarchy containers everywhere else in the schematic.
                ? () => {
                    const boxId = b.node.id.includes("#")
                      ? b.node.id.slice(0, b.node.id.indexOf("#")) : b.node.id;
                    setIpClosed((p) => {
                      const nx = new Set(p);
                      if (nx.has(boxId)) nx.delete(boxId); else nx.add(boxId);
                      return nx;
                    });
                  }
                : onBoxDblClick ? () => onBoxDblClick(b.node.id) : undefined}
              onCtx={(x, y) => setCtxMenu({ x, y, kind: "node", nodeId: b.node.id })}
            />
          ))}
        </Layer>

      </Stage>
      {/* Object-name status bar (RTLvision-style): the SELECTED pin/net/instance's full
          command path — the '/'-separated form dp_shell resolves. Click to copy. */}
      {(() => {
        let kind = "", text = "";
        if (selPin) {
          const wire = graph.edges.find((e) =>
            (e.fromNode === selPin.node && e.fromPort === selPin.port) ||
            (e.toNode === selPin.node && e.toPort === selPin.port));
          kind = "pin";
          text = realNodePath(selPin.node) !== ""
            ? fullPin(selPin.node, selPin.port)
            : wire && wire.netName ? userPath(fullNetPath(wire.fromNode, wire.toNode, wire.netName)) : selPin.port;
        } else if (selectedNode) {
          const n = graph.nodes[selectedNode];
          if (n?.netTap) {
            // A net waypoint IS a net — report it as one (thru: ids resolve via realNodePath;
            // plain taps reconstruct scope.net from their parent container).
            kind = "net";
            const r = selectedNode.startsWith("thru:") ? realNodePath(selectedNode)
              : n.parentId ? `${n.parentId}.${n.designName}` : n.designName;
            text = stripTop(userPath(r));
          } else {
            kind = "instance";
            text = instPath(selectedNode);
          }
        } else if (selectedWire) {
          const e0 = graph.edges.find((e) => e.id === selectedWire);
          if (e0) {
            kind = "net";
            text = userPath(fullNetPath(e0.fromNode, e0.toNode, e0.netName || e0.toPort || e0.fromPort));
          }
        }
        if (!text) return null;
        // Is the selected object an SDC clock definition point? The clock-root node (crSchematic.ts)
        // already carries the resolved info as `clockInfo` — check that FIRST (exact, no string
        // matching). Only as a fallback, for a pin/net elsewhere that happens to spell one of the
        // SDC's declared targets, try a literal path match (either separator spelling) — no
        // upstream tracing, so this can miss a clock buried deeper in the fanout.
        const selNodeId = selPin?.node ?? (selectedNode && !graph.nodes[selectedNode]?.netTap ? selectedNode : undefined);
        const nodeClockInfo = selNodeId ? graph.nodes[selNodeId]?.clockInfo : undefined;
        const nodeClockName = selNodeId?.startsWith("clk:") ? selNodeId.slice(4) : undefined;
        // The clock-root node ITSELF is a real `-add` mux point (clockAliases, from
        // clocksByTarget) — re-resolve every alias's OWN crClocks entry rather than the single
        // one this node's clockInfo carries, since `-add` alternatives usually differ (period,
        // master) even though they share the same target object.
        const nodeAliases = selNodeId ? graph.nodes[selNodeId]?.clockAliases : undefined;
        // A regular pin the walk actually crossed (crSchematic.ts's notePortClock) names its
        // clock(s) DIRECTLY — no string matching, and no upstream-tracing miss. More than one
        // name here is not a bug: it means this exact net is a real `-add` mux target (e.g.
        // `mclk` fed by both mclk_from_dco and mclk_from_lfxt) — list every one rather than
        // silently picking a winner, which is what made the wire's actual clock unreadable.
        const portClockNames = selPin?.node && selPin.port
          ? graph.nodes[selPin.node]?.ports.find((p) => p.name === selPin.port)?.clocks
          : undefined;
        const slashed = text.replace(/\./g, "/");
        const dotted = text.replace(/\//g, ".");
        const clks = nodeAliases?.length
          ? nodeAliases.map((nm) => crClocks.find((c) => c.name === nm)).filter((c): c is NonNullable<typeof c> => !!c)
          : nodeClockInfo && nodeClockName
          ? [{ name: nodeClockName, ...nodeClockInfo }]
          : portClockNames?.length
          ? portClockNames
              .map((nm) => crClocks.find((c) => c.name === nm))
              .filter((c): c is NonNullable<typeof c> => !!c)
          : (() => {
              const c = crClocks.find((c) => c.targets.some((t) => t === text || t === slashed || t === dotted));
              return c ? [c] : [];
            })();
        return (
          <div className="schstatus" title="Click to copy" data-status="objname"
               onClick={() => void navigator.clipboard?.writeText(text)}>
            <span className="schstatus-k">Object name ({kind}):</span> {text}
            {clks.length > 0 && (
              <span className="schstatus-k" style={{ marginLeft: 10 }} data-status="sdcclock">
                {clks.length > 1 ? "SDC clocks (mux-shared): " : "SDC clock: "}
                {clks.map((clk, i) => (
                  <span key={clk.name}>
                    {i > 0 ? "  |  " : ""}
                    {clk.name}
                    {clk.period > 0 ? ` · ${clk.period}ns` : ""}
                    {clk.generated ? " · generated" : ""}
                    {clk.masterClock ? ` · master ${clk.masterClock}${clk.masterInferred ? " (inferred)" : ""}` : ""}
                    {clk.file ? ` · defined at ${clk.file.split(/[\\/]/).pop()}:${clk.line}` : ""}
                  </span>
                ))}
              </span>
            )}
          </div>
        );
      })()}
      {/* "Select Visible Pins…" panel. Connected pins are locked on — hiding one would
          leave its wire dangling. */}
      {pinPicker && (() => {
        const p = pinPicker;
        const connected = new Set<string>();
        for (const e of graph.edges) {
          if (e.fromNode === p.nodeId) connected.add(e.fromPort);
          if (e.toNode === p.nodeId) connected.add(e.toPort);
        }
        const q = p.q.toLowerCase();
        const shown = q ? p.ports.filter((x) => x.name.toLowerCase().includes(q)) : p.ports;
        const toggle = (name: string) => setPinPicker((cur) => {
          if (!cur) return cur;
          const sel = new Set(cur.sel);
          if (sel.has(name)) sel.delete(name); else sel.add(name);
          return { ...cur, sel };
        });
        return (
          <div className="pinpicker" data-panel="pin-picker"
               style={{ left: Math.min(p.x, window.innerWidth - 280), top: Math.min(p.y, window.innerHeight - 380) }}
               onClick={(e) => e.stopPropagation()}>
            <div className="pinpicker-h">Visible pins · {p.sel.size + [...connected].filter((c) => !p.sel.has(c)).length}/{p.ports.length}</div>
            <input className="findinput" placeholder="filter…" value={p.q} autoFocus spellCheck={false}
                   onChange={(e) => setPinPicker((cur) => cur ? { ...cur, q: e.target.value } : cur)} />
            <div className="pinpicker-list">
              {shown.map((x) => {
                const locked = connected.has(x.name);
                return (
                  <label key={x.name} className={"pinpicker-row" + (locked ? " locked" : "")}
                         title={locked ? "connected — always shown" : x.busLabel}>
                    <input type="checkbox" disabled={locked} checked={locked || p.sel.has(x.name)}
                           onChange={() => toggle(x.name)} />
                    <span className="pp-dir">{x.direction}</span> {x.name}
                  </label>
                );
              })}
            </div>
            <div className="pinpicker-btns">
              <button className="findbtn" onClick={() => setPinPicker((c) => c ? { ...c, sel: new Set(c.ports.map((x) => x.name)) } : c)}>All</button>
              <button className="findbtn" onClick={() => setPinPicker((c) => c ? { ...c, sel: new Set() } : c)}>None</button>
              <button className="findbtn" data-btn="pins-apply" style={{ marginLeft: "auto" }}
                      onClick={() => { setVisiblePins(seedNodeId, p.nodeId, [...p.sel], p.ports); setPinPicker(null); }}>Apply</button>
              <button className="findbtn" onClick={() => setPinPicker(null)}>Cancel</button>
            </div>
          </div>
        );
      })()}
      {/* PIN/PORT menu — copy the pin's name / hierarchical path / owning instance path. */}
      {ctxMenu?.kind === "pin" && (() => {
        const n = graph.nodes[ctxMenu.nodeId];
        const p = n?.ports.find((q) => q.name === ctxMenu.port);
        if (!n) return null;
        const copy = (t: string) => { void navigator.clipboard?.writeText(t); setCtxMenu(null); };
        const path = pinPath(ctxMenu.nodeId, ctxMenu.port, roots);
        // Net on this pin = the net of any wire that terminates on it.
        const wire = graph.edges.find((e) =>
          (e.fromNode === ctxMenu.nodeId && e.fromPort === ctxMenu.port) ||
          (e.toNode === ctxMenu.nodeId && e.toPort === ctxMenu.port));
        // The pin's command path. Nodes that name no design object themselves (an SDC clock
        // root — realNodePath "") fall back to the CONNECTED NET's full path, so the clock
        // pentagon's pin still copies / add_occ_points something dp_shell resolves.
        //
        // A PLANNED IP box is its own case: the instance does not exist in the design, but
        // dp_shell resolves `<inst>/<pin>` against the plan (add_dft_ip + read_dfx_ip) — this
        // is exactly how the user constrains the IP's INPUT pins so the outputs COMPUTE.
        // Without it the fallback built a nonsense net path (or nothing), the recorded
        // constraint matched nothing, and right-click → add_pin_constraint did… nothing.
        // Internal cone cells (`planip:…#cell`) stay un-targetable: a constraint on an
        // internal net does not enter the calculus — the box boundary is where to constrain.
        const planIpPin = ctxMenu.nodeId.startsWith("planip:") && !ctxMenu.nodeId.includes("#")
          ? `${ctxMenu.nodeId.slice("planip:".length)}/${ctxMenu.port}` : "";
        const pinTarget = planIpPin ? planIpPin
          : realNodePath(ctxMenu.nodeId) !== ""
          ? fullPin(ctxMenu.nodeId, ctxMenu.port)
          : wire && wire.netName ? netPath(wire.fromNode, wire.toNode, wire.netName, roots) : "";
        return (
          <div className="cmenu" style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
            <div className="cmi disabled" style={{ opacity: 0.7 }}>{p?.busLabel ?? ctxMenu.port} ({p?.direction ?? "?"})</div>
            <div className="cmsep" />
            {/* TRACE from the menu — works in every view, including the curated clock/reset/DRC
                circuits, where left-click is reserved for selection. A statement node (an OR
                built from `assign puc_a = por | wdt_reset`) resolves its fan-in through
                trace-logic; a symbol with no instance behind it (flag/const/tap) has nothing to
                query and is left out. */}
            {(() => {
              const n2 = graph.nodes[ctxMenu.nodeId];
              const stmt = ctxMenu.nodeId.startsWith("logic:") && !ctxMenu.nodeId.includes("#");
              if (!n2 || n2.kind === "port" || (n2.prim && !stmt)) return null;
              const dir = p?.direction === "out" ? "fanout" : "fanin";
              return (
                <>
                  <div className="cmi" data-menu="trace-pin"
                       title={dir === "fanin" ? "把驱动这个引脚的电路加到图上 (fan-in)"
                                              : "把这个引脚驱动的负载加到图上 (fan-out)"}
                       onClick={() => { void trace(seedNodeId, ctxMenu.nodeId, ctxMenu.port, dir); setCtxMenu(null); }}>
                    {dir === "fanin" ? "Trace drivers (fan-in)" : "Trace loads (fan-out)"}
                  </div>
                  <div className="cmi" data-menu="trace-pin-rev"
                       title="反方向追踪这个引脚"
                       onClick={() => { void trace(seedNodeId, ctxMenu.nodeId, ctxMenu.port,
                                                   dir === "fanin" ? "fanout" : "fanin"); setCtxMenu(null); }}>
                    {dir === "fanin" ? "Trace loads (fan-out)" : "Trace drivers (fan-in)"}
                  </div>
                  <div className="cmsep" />
                </>
              );
            })()}
            {/* DFT planning — these run the SAME dp_shell commands the console exposes, so the
                menu and the shell can never disagree about what was recorded. */}
            {allowOcc && pinTarget && (() => {
              const cmd = `add_occ_point ${pinTarget}${clockSuffixForPort(ctxMenu.nodeId, ctxMenu.port)}`;
              return (
                <div className="cmi" data-menu="add-occ" title={cmd}
                     onClick={() => { void runDp(cmd); setCtxMenu(null); }}>
                  add_occ_point
                </div>
              );
            })()}
            {pinTarget && (
              <>
                {muxOn(pinTarget) && (
                  <div className="cmi danger" data-menu="del-ctrl-mux"
                       title={`delete_dft_ctrl_mux ${pinTarget}`}
                       onClick={() => { void removeMux(pinTarget); setCtxMenu(null); }}>
                    Delete planned mux <span className="muted">delete_dft_ctrl_mux</span>
                  </div>
                )}
                {!muxOn(pinTarget) && hasCtrlMuxDefaults() && (
                  <div className="cmi" data-menu="quick-ctrl-mux"
                       title={`add_dft_ctrl_mux ${pinTarget} -override_source ${ctrlMuxDefaults().overrideSource} -select ${ctrlMuxDefaults().select}`}
                       onClick={() => { void quickCtrlMux(pinTarget); setCtxMenu(null); }}>
                    Make controllable in test
                    <span className="muted"> · {ctrlMuxDefaults().select.split("/").pop()}</span>
                  </div>
                )}
                <div className="cmi" data-menu="add-ctrl-mux"
                     title="Plan a mux so test mode can drive this pin (add_dft_ctrl_mux). Nothing is inserted — the plan is recorded."
                     onClick={() => { void askCtrlMux(pinTarget); setCtxMenu(null); }}>
                  {hasCtrlMuxDefaults() ? "Make controllable in test — other driver…"
                                        : "Make controllable in test…"}
                  <span className="muted"> add_dft_ctrl_mux</span>
                </div>
              </>
            )}
            {/* Pin/port value constraint for the DRC calculus — same dp_shell command the
                console runs; 0/1 force, X clears, Z marks floating. Re-run Run DRC to apply. */}
            {pinTarget && (
              <div className="cmi cmi-row" data-menu="pin-constraint"
                   title={`add_pin_constraint ${pinTarget} <v> — 0/1 force the pin for run_drc; X clears; Z = floating`}
                   onClick={(e) => e.stopPropagation()}>
                add_pin_constraint
                {(["0", "1", "X", "Z"] as const).map((v) => (
                  <button key={v} className="findbtn" data-btn={"pincon-" + v}
                          onClick={() => { void runDp(`add_pin_constraint ${pinTarget} ${v}`); setCtxMenu(null); }}>{v}</button>
                ))}
              </div>
            )}
            <div className="cmsep" />
            {/* copies the FULL path (top included) — the top-stripped form does not resolve in dp_shell */}
            {pinTarget && (
              <div className="cmi" data-menu="copy-pin-path" title={pinTarget}
                   onClick={() => copy(pinTarget)}>Copy Hierarchical Pin Path</div>
            )}
            <div className="cmi" data-menu="copy-pin-name" title={ctxMenu.port} onClick={() => copy(ctxMenu.port)}>Copy Pin Name</div>
            {realNodePath(ctxMenu.nodeId) !== "" && (
              <div className="cmi" data-menu="copy-pin-instance" title={instPath(ctxMenu.nodeId)}
                   onClick={() => copy(instPath(ctxMenu.nodeId))}>Copy Instance Path</div>
            )}
            {wire && wire.netName && (
              <>
                <div className="cmsep" />
                <div className="cmi" data-menu="copy-pin-net" title={netPath(wire.fromNode, wire.toNode, wire.netName, roots)}
                     onClick={() => copy(netPath(wire.fromNode, wire.toNode, wire.netName, roots))}>Copy Hierarchical Net Path</div>
                <div className="cmi" data-menu="copy-pin-netname" title={wire.netName} onClick={() => copy(wire.netName)}>Copy Net Name</div>
              </>
            )}
          </div>
        );
      })()}

      {/* NET menu — right-click a wire. */}
      {ctxMenu?.kind === "net" && (() => {
        const e0 = graph.edges.find((e) => e.id === ctxMenu.wireId);
        if (!e0) return null;
        const copy = (t: string) => { void navigator.clipboard?.writeText(t); setCtxMenu(null); };
        const net = e0.netName || e0.fromPort;
        const path = netPath(e0.fromNode, e0.toNode, net, roots);
        return (
          <div className="cmenu" style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
            <div className="cmi disabled" style={{ opacity: 0.7 }}>net {net}{e0.bus ? " [bus]" : ""}</div>
            <div className="cmsep" />
            {/* An alias wire carries the location of the assign that produced it — the wire IS
                that statement, and there is no box to right-click for it. */}
            {e0.loc && (
              <div className="cmi" data-menu="net-hdl" title={`${e0.loc.file}:${e0.loc.line}`}
                   onClick={() => { openHdl(e0.loc!.file, e0.loc!.line, `net ${net}`); setCtxMenu(null); }}>
                Show HDL Definition
              </div>
            )}
            {/* the net's DRIVER pin is the point an OCC would be defined on */}
            {allowOcc && (() => {
              const cmd = `add_occ_point ${fullPin(e0.fromNode, e0.fromPort)}` +
                clockSuffixForPort(e0.fromNode, e0.fromPort);
              return (
                <div className="cmi" data-menu="add-occ" title={cmd}
                     onClick={() => { void runDp(cmd); setCtxMenu(null); }}>
                  add_occ_point <span className="muted">(driver)</span>
                </div>
              );
            })()}
            {hasCtrlMuxDefaults() && (
              <div className="cmi" data-menu="quick-ctrl-mux"
                   title={`add_dft_ctrl_mux ${fullPin(e0.toNode, e0.toPort)} -override_source ${ctrlMuxDefaults().overrideSource} -select ${ctrlMuxDefaults().select}`}
                   onClick={() => { void quickCtrlMux(fullPin(e0.toNode, e0.toPort)); setCtxMenu(null); }}>
                Make controllable in test
                <span className="muted"> · {ctrlMuxDefaults().select.split("/").pop()}</span>
              </div>
            )}
            <div className="cmi" data-menu="add-ctrl-mux"
                 title="Plan a mux so test mode can drive this net (add_dft_ctrl_mux). Nothing is inserted — the plan is recorded."
                 onClick={() => { void askCtrlMux(fullPin(e0.toNode, e0.toPort)); setCtxMenu(null); }}>
              {hasCtrlMuxDefaults() ? "Make controllable in test — other driver…"
                                    : "Make controllable in test…"}
              <span className="muted"> add_dft_ctrl_mux</span>
            </div>
            <div className="cmsep" />
            <div className="cmi" data-menu="copy-net-path" title={userPath(fullNetPath(e0.fromNode, e0.toNode, net))}
                 onClick={() => copy(userPath(fullNetPath(e0.fromNode, e0.toNode, net)))}>Copy Hierarchical Net Path</div>
            <div className="cmi" data-menu="copy-net-name" title={net} onClick={() => copy(net)}>Copy Net Name</div>
            <div className="cmsep" />
            <div className="cmi" data-menu="copy-net-driver" title={fullPin(e0.fromNode, e0.fromPort)}
                 onClick={() => copy(fullPin(e0.fromNode, e0.fromPort))}>Copy Driver Pin Path</div>
            <div className="cmi" data-menu="copy-net-load" title={fullPin(e0.toNode, e0.toPort)}
                 onClick={() => copy(fullPin(e0.toNode, e0.toPort))}>Copy Load Pin Path</div>
          </div>
        );
      })()}

      {/* "此 mux 服务的寄存器组" — the daemon walk's own answer to "这个 mux 没 drive 任何
          寄存器?". The covered groups usually branch off OUTSIDE the drawn cone, so a list is
          the only honest proof. `held` = the group currently passes BECAUSE this mux holds it. */}
      {muxInfo && (() => {
        const groups = muxCoveredGroups(useStore.getState().crItems, muxInfo);
        const total = groups.reduce((n, g) => n + g.flops, 0);
        return (
          <div data-panel="mux-covered"
               style={{ position: "absolute", right: 12, top: 44, width: 420, maxHeight: "70%",
                        display: "flex", flexDirection: "column", zIndex: 30,
                        background: "#1d232b", border: "1px solid #4a5568", borderRadius: 6,
                        boxShadow: "0 6px 24px rgba(0,0,0,0.5)", fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                          borderBottom: "1px solid #333a44" }}>
              <b style={{ flex: 1 }}>此 mux 服务的寄存器组 · {groups.length} 组 / {total} flop</b>
              <button className="findbtn" onClick={() => setMuxInfo("")}>✕</button>
            </div>
            <div className="muted" style={{ padding: "4px 10px", fontSize: 11 }}>
              {muxInfo} — 复位链每级寄存器输出都是独立 X 源;这些组多在本图走查锥之外分叉。
            </div>
            <div style={{ overflow: "auto", minHeight: 0, padding: "2px 0 6px" }}>
              {groups.length === 0 && (
                <div className="muted" style={{ padding: "6px 10px" }}>
                  无复位组需要它 — 这颗 mux 可删(delete_dft_ctrl_mux)。
                </div>
              )}
              {groups.map((g, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "2px 10px" }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                                 whiteSpace: "nowrap" }} title={`${g.owner}/${g.net}`}>
                    {g.owner.split("/").slice(-2).join("/")}/{g.net}
                  </span>
                  <span className="muted">×{g.flops}</span>
                  <span style={{ color: g.held ? "#e0c34a" : "#f37f72", width: 58 }}>
                    {g.held ? "已保持" : "待修复"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {ctxMenu?.kind === "node" && (() => {
        const n = graph.nodes[ctxMenu.nodeId];
        if (!n) return null;
        const isContainer = laidAdj?.boxes.find((b) => b.node.id === ctxMenu.nodeId)?.isContainer ?? false;
        const copy = (t: string) => { void navigator.clipboard?.writeText(t); setCtxMenu(null); };
        // Real design path behind this node (maps the clock/reset views' synthetic ids back).
        const real = realNodePath(ctxMenu.nodeId);
        // The instance that OWNS this object: a `<inst>:<net>` target names a net inside `inst`;
        // a plain path IS the instance. This is what "show me the RTL" should open.
        const ownerInst = real.includes(":") ? real.slice(0, real.indexOf(":")) : real;
        // "Show RTL Primitives" decomposes a behavioral block; it needs a daemon block id
        // (`logic:<file>:<line>`). Synthetic clock/reset nodes have none, so offering it there
        // would be a dead menu item — we offer "Open in Schematic" instead, where the real
        // block (and the full P2 machinery) is reachable.
        const canDecompose = n.kind === "logic" && ctxMenu.nodeId.startsWith("logic:");
        // A PLANNED mux is not a design object — the only useful thing to do to it is take it
        // out, and the box you are pointing at is the obvious place to ask.
        const plannedTarget = ctxMenu.nodeId.startsWith("planmux:")
          ? ctxMenu.nodeId.slice("planmux:".length) : "";
        // A planned IP box (or one of its internal cells) — trace INTO it: expand the box
        // with the library module's real gate circuit behind the pins this view uses.
        const planIpBox = ctxMenu.nodeId.startsWith("planip:")
          ? (ctxMenu.nodeId.includes("#") ? ctxMenu.nodeId.slice(0, ctxMenu.nodeId.indexOf("#"))
                                          : ctxMenu.nodeId)
          : "";
        return (
          <div className="cmenu" style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
            {plannedTarget && (
              <>
                <div className="cmi disabled" style={{ opacity: 0.7 }}>planned mux · {plannedTarget}</div>
                {/* The PROOF behind the role caption: list the exact register groups this mux
                    serves. The drawn cone often shows none of them ("没 drive 任何寄存器"),
                    because they branch off the reset net OUTSIDE this violation's walked path —
                    the daemon's full walk is the authority, and this shows its answer. */}
                {crItems.length > 0 && (
                  <div className="cmi" data-menu="mux-covered"
                       title="列出以此 mux 为控制点的全部寄存器组(来自守护进程的全设计复位走查)"
                       onClick={() => { setMuxInfo(plannedTarget); setCtxMenu(null); }}>
                    此 mux 服务的寄存器组…
                  </div>
                )}
                {crItems.length > 0 && (
                  <div className="cmi" data-menu="mux-covered-draw"
                       title="把这些寄存器组画到图上(DFF 盒子,虚线接到 mux 输出);再点一次收起。点 mux 的输出引脚同样有效"
                       onClick={() => { toggleMuxRegs(plannedTarget); setCtxMenu(null); }}>
                    {muxRegs.has(plannedTarget) ? "收起它驱动的寄存器组" : "在图上展开它驱动的寄存器组"}
                  </div>
                )}
                <div className="cmi danger" data-menu="del-ctrl-mux"
                     title={`delete_dft_ctrl_mux ${plannedTarget}`}
                     onClick={() => { void removeMux(plannedTarget); setCtxMenu(null); }}>
                  Delete planned mux
                </div>
                <div className="cmsep" />
              </>
            )}
            {planIpBox && (
              <>
                <div className="cmi disabled" style={{ opacity: 0.7 }}>
                  planned IP · {planIpBox.slice("planip:".length)}</div>
                <div className="cmi" data-menu="trace-inside-ip"
                     title="the internal circuit shows by default when the library is loaded; this collapses the box back to its flat port list (and re-opens it)"
                     onClick={() => {
                       setIpClosed((p) => {
                         const nx = new Set(p);
                         if (nx.has(planIpBox)) nx.delete(planIpBox); else nx.add(planIpBox);
                         return nx;
                       });
                       setCtxMenu(null);
                     }}>
                  {ipClosed.has(planIpBox) ? "Show IP internal circuit" : "Hide IP internal circuit"}
                </div>
                <div className="cmsep" />
              </>
            )}
            {/* Show HDL Definition for EVERY node that resolves to something real:
                  n.loc          -> the exact always/assign statement (flop groups carry this)
                  n.definitionId -> the module definition
                  ownerInst      -> resolve by hierarchical path (reveals the instance first) */}
            {(n.loc || n.definitionId || ownerInst) && (
              <>
                <div className="cmi" data-menu="hdl-definition"
                     title={n.loc ? `${n.loc.file}:${n.loc.line}` : (ownerInst || n.designName)}
                     onClick={() => {
                       // Same resolution the box's double-click uses — one path, never two
                       // answers to "where is this in the RTL".
                       const t = hdlTargetFor(n);
                       if (t) openHdlTarget(t);
                       setCtxMenu(null);
                     }}>Show HDL Definition</div>
                {canDecompose && !Object.values(graph.nodes).some((x) => x.parentId === ctxMenu.nodeId) && (
                  <div className="cmi" data-menu="expand-logic-cells" title="Infer gates / MUX / DFF from this always/assign block"
                       onClick={() => { void expandCells(seedNodeId, ctxMenu.nodeId); setCtxMenu(null); }}>Show RTL Primitives</div>
                )}
                {canDecompose && Object.values(graph.nodes).some((x) => x.parentId === ctxMenu.nodeId) && (
                  <div className="cmi" data-menu="hide-logic-cells" title="collapse the inferred internals back to the compact block"
                       onClick={() => { hideCells(seedNodeId, ctxMenu.nodeId); setCtxMenu(null); }}>Hide RTL Primitives</div>
                )}
                {!canDecompose && ownerInst && ownerInst.includes(".") && (
                  <div className="cmi" data-menu="open-in-schematic"
                       title="open the full schematic at this instance (trace, RTL primitives, …)"
                       onClick={() => {
                         const net = real.includes(":") ? real.slice(real.indexOf(":") + 1) : "";
                         void showInSchematic(ownerInst, net);
                         setCtxMenu(null);
                       }}>Open in Schematic</div>
                )}
                <div className="cmsep" />
              </>
            )}
            {/* Every pin of this instance, INCLUDING the ones no wire on the canvas touches —
                the schematic only ever shows the pins something is connected to by default.
                Opens the Ports tab (the full table, searchable) AND draws every pin onto the
                box itself, capped at MAX_SHOWN_PINS so a library cell with hundreds of ports
                cannot bury the canvas ("show all pin 也在图中显示...引脚数量不超过200"). */}
            {realNodePath(ctxMenu.nodeId) && n.definitionId && (
              <div className="cmi" data-menu="show-all-pins"
                   title={`list every port of this instance, and draw them on the box (up to ${MAX_SHOWN_PINS})`}
                   onClick={() => {
                     const id = ctxMenu.nodeId;
                     const real = realNodePath(id);
                     const defId = n.definitionId ?? "";
                     setCtxMenu(null);
                     selectInstance({ nodeId: real, defId });
                     void revealAllPinsOnBox(id, n);
                   }}>Show All Pins</div>
            )}
            {/* Canvas-only twin of the item above: same cap, same source, but no Ports tab —
                for when the box is all the user wants touched. */}
            {(n.kind === "module" || n.kind === "blackbox") && (
              <div className="cmi" data-menu="show-pins-on-box"
                   title={`在图上显示该实例的全部引脚(上限 ${MAX_SHOWN_PINS};已连接的引脚始终保留)`}
                   onClick={() => {
                     const id = ctxMenu.nodeId;
                     setCtxMenu(null);
                     void revealAllPinsOnBox(id, n);
                   }}>Show Pins on Box <span className="muted">全部引脚上图</span></div>
            )}
            {(n.kind === "module" || n.kind === "blackbox") && (
              <div className="cmi" data-menu="hide-unconnected-pins"
                   title="只保留画布上有连线的引脚(收起其余)"
                   onClick={() => {
                     setVisiblePins(seedNodeId, ctxMenu.nodeId, [],
                       n.ports.map((p) => ({ name: p.name, direction: p.direction as string, busLabel: p.busLabel })));
                     setCtxMenu(null);
                   }}>Hide Unconnected Pins</div>
            )}
            {/* Big modules drown the canvas when every pin shows — let the user pick.
                Full pin list comes fresh from the daemon (real instances) so pins hidden
                earlier can be brought back. */}
            {(n.kind === "module" || n.kind === "blackbox") && (
              <div className="cmi" data-menu="select-pins"
                   title="choose which pins this box displays (connected pins always stay)"
                   onClick={() => {
                     const id = ctxMenu.nodeId;
                     const mx = ctxMenu.x, my = ctxMenu.y;
                     setCtxMenu(null);
                     void (async () => {
                       let full = n.ports.map((p) => ({ name: p.name, direction: p.direction as string, busLabel: p.busLabel }));
                       if (realNodePath(id) === id) {
                         try { full = (await hs.getPorts({ nodeId: id })).ports; } catch { /* keep on-canvas list */ }
                       }
                       setPinPicker({ nodeId: id, x: mx, y: my, ports: full,
                                      sel: new Set(n.ports.map((p) => p.name)), q: "" });
                     })();
                   }}>Select Visible Pins…</div>
            )}
            <div className="cmi" data-menu="copy-module" title={n.designName} onClick={() => copy(n.designName)}>Copy Module Name</div>
            <div className="cmi" data-menu="copy-instance" title={n.instanceName} onClick={() => copy(n.instanceName)}>Copy Instance Name (leaf)</div>
            {/* FULL path — the top-stripped form does not resolve in dp_shell (verified) */}
            <div className="cmi" data-menu="copy-hier-instance" title={instPath(ctxMenu.nodeId)}
                 onClick={() => copy(instPath(ctxMenu.nodeId))}>Copy Hierarchical Instance</div>
            {/* A node that names a real object (a cell, or a flop group's clock/reset pin) can
                itself be the OCC definition point the user picks. */}
            {allowOcc && realNodePath(ctxMenu.nodeId) && (() => {
              const cmd = `add_occ_point ${instPath(ctxMenu.nodeId)}${clockSuffixForNode(ctxMenu.nodeId)}`;
              return (
                <div className="cmi" data-menu="add-occ-node" title={cmd}
                     onClick={() => { void runDp(cmd); setCtxMenu(null); }}>
                  add_occ_point
                </div>
              );
            })()}
            {(n.kind === "module" || n.kind === "primitive" || n.kind === "blackbox") && (
              <>
                <div className="cmsep" />
                <div className="cmi" data-menu="add-to-gen" onClick={() => { addToGen(ctxMenu.nodeId); setCtxMenu(null); }}>Add to DFT Stream Planner</div>
                <div className="cmi" data-menu="add-to-dfx" onClick={() => { addToDfx(ctxMenu.nodeId); setCtxMenu(null); }}>Add to DFX Ctrl</div>
              </>
            )}
            {isContainer && (
              <>
                <div className="cmsep" />
                <div className="cmi" data-menu="collapse-inside" onClick={() => { collapse(seedNodeId, ctxMenu.nodeId); setCtxMenu(null); }}>Collapse internals</div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

const FILL: Record<SchNode["kind"], string> = {
  module: "#23262d", primitive: "#22282b", blackbox: "#2b2230",
  port: "#1c3a33", logic: "#3a2f1c",
};

const basename = (f: string): string => f.split("/").pop() ?? f;

/** Behavioral fanin source: parent-module INPUT PORT, drawn as a flat Tessent-style
 *  port arrow (designName = the port/net name). No trace diamond — the id is
 *  synthetic (`port:`), the daemon cannot trace it. */
/** An INTERNAL NET of the enclosing module, tapped as a source for a decomposed block.
 *  Deliberately NOT the port pentagon: it is a wire someone else drives, and conflating the two
 *  is what made `nodiv_mclk` read as a port. Drawn as a wire stub with a net-name tag. */
function NetTapSym({ box }: { box: Box }) {
  const { node, x, y, w, h } = box;
  const midY = y + h / 2;
  // Pass-through waypoint (in + out): the wire runs straight through — a centered junction
  // dot with the net name above it, nothing else (the offset dot + stray "net" caption read
  // as clutter). Single-pin taps keep the tag form: they mark a dead-ended internal net.
  const thru = node.ports.length > 1;
  if (thru) {
    return (
      <Group>
        <Line points={[x - PIN_STUB, midY, x + w + PIN_STUB, midY]} stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false} />
        <Circle x={x + w / 2} y={midY} radius={3} fill="#7d8fa6" perfectDrawEnabled={false} />
        <Text x={x - 20} y={midY - 17} width={w + 40} align="center" wrap="none"
              text={node.designName} fontSize={10} fill="#a8bdd4"
              listening={false} perfectDrawEnabled={false} />
      </Group>
    );
  }
  return (
    <Group>
      {/* the wire itself, running through a small junction dot */}
      <Line points={[x, midY, x + w, midY]} stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false} />
      <Circle x={x + 9} y={midY} radius={3} fill="#7d8fa6" perfectDrawEnabled={false} />
      <Text x={x + 16} y={midY - 12} text={node.designName} fontSize={10} fill="#a8bdd4"
            listening={false} perfectDrawEnabled={false} />
      <Text x={x + 16} y={midY + 1} text="net" fontSize={8} fill="#6b7785"
            listening={false} perfectDrawEnabled={false} />
      <Line points={[x + w, midY, x + w + PIN_STUB, midY]} stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false} />
    </Group>
  );
}

/** PLANNED, not present: an add_dft_ctrl_mux the user recorded. Its own colour (violet) and a
 *  dashed outline everywhere it is drawn — the rest of the canvas is the netlist as read, and a
 *  plan must never be able to pass for it. */
const PLANNED_STROKE = "#c678dd";

function PortSourceSym({ box, selected }: { box: Box; selected?: boolean }) {
  const { node, x, y, w, h } = box;
  // A flagged source (clock/reset views: an UNCONSTRAINED primary input, value Z) must never
  // wear the same healthy green as a real SDC-defined clock — that reads as "clock is fine"
  // when it is exactly the opposite.
  const bad = !!node.alert;
  return (
    <Group>
      <Line
        points={[x, y, x + w - 12, y, x + w, y + h / 2, x + w - 12, y + h, x, y + h]}
        closed fill={node.planned ? "#2a1f33" : bad ? "#3a1d1d" : "#1c3a33"}
        stroke={node.planned ? PLANNED_STROKE : selected ? "#4fa3ff" : bad ? "#f85149" : "#2f8f6b"}
        dash={node.planned ? [6, 4] : undefined}
        strokeWidth={selected ? 2.2 : bad || node.planned ? 2 : 1.2} perfectDrawEnabled={false}
      />
      <Text x={x} y={y + h / 2 - 5} width={w - 10} align="center" text={node.designName} fontSize={10}
            fill={node.planned ? "#e3c9f0" : bad ? "#ffc9c4" : "#bfe8da"} listening={false} perfectDrawEnabled={false} />
      <Line points={[x + w, y + h / 2, x + w + PIN_STUB, y + h / 2]} stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false} />
      {/* SDC clock definition badge: this box IS a create_clock/create_generated_clock target,
          resolved period/master already computed (sdc-core/clockgen.cpp) — glanceable without
          needing to click the pin and read the object-name bar. */}
      {node.clockInfo && (
        <Text x={x - 10} y={y + h + 3} width={w + 20} align="center"
              text={clockBadgeText(node.clockInfo)}
              fontSize={8} fill="#5be8a0" listening={false} perfectDrawEnabled={false} />
      )}
    </Group>
  );
}

function clockBadgeText(ci: NonNullable<SchNode["clockInfo"]>): string {
  const period = ci.period > 0 ? `${ci.period}ns` : "period?";
  const gen = ci.generated ? " gen" : "";
  const master = ci.masterClock ? ` ← ${ci.masterClock}${ci.masterInferred ? " (inf)" : ""}` : "";
  return `${period}${gen}${master}`;
}

/** Behavioral fanin source: always/assign block, drawn as a compact tag with its
 *  HDL location. Double-click (hit-rect in InteractiveBox) opens the source. */
function LogicSourceTag({ box, selected }: { box: Box; selected?: boolean }) {
  const { node, x, y, w, h } = box;
  return (
    <Group>
      {/* dashed like every other RTL-statement (non-hierarchical) box */}
      <Rect x={x} y={y} width={w} height={h} cornerRadius={4} fill="#2f2716"
            stroke={selected ? "#4fa3ff" : "#a8823a"} strokeWidth={selected ? 2 : 1.2}
            dash={[5, 3]} perfectDrawEnabled={false} />
      {/* Line 1 = the REGISTER/net this block drives (what the user identifies it by);
          line 2 = the block kind + source position. */}
      <Text x={x + 10} y={y + 6} width={w - 16} wrap="none" ellipsis text={node.instanceName}
            fontSize={10} fontStyle="bold" fill="#e3b45c" listening={false} perfectDrawEnabled={false} />
      <Text x={x + 10} y={y + 19} width={w - 16} wrap="none" ellipsis
            text={node.designName + (node.loc ? `  ${basename(node.loc.file)}:${node.loc.line}` : "")}
            fontSize={8.5} fill="#9aa2ad" listening={false} perfectDrawEnabled={false} />
      <Line points={[x + w, y + h / 2, x + w + PIN_STUB, y + h / 2]} stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false} />
    </Group>
  );
}

// ---- P2: RTL primitive symbols (IEEE distinctive shapes, RTLvision-style) ------------------

const GATE_FILL = "#20262e";
const GATE_STROKE = "#93a7bf";
const WIRE = "#6b7785";
const BUBBLE_R = 3.8;   // inversion bubble on the output of nand/nor/xnor/not/lnot

/** Inverting families -> {base shape it decorates}. */
const INVERTING: Record<string, string> = {
  nand: "and", nor: "or", xnor: "xor", not: "buf", lnot: "buf",
};
/** Every gate prim -> the distinctive shape used to draw it. */
const SHAPE_OF: Record<string, "and" | "or" | "xor" | "buf"> = {
  and: "and", nand: "and", land: "and", rand: "and",
  or: "or", nor: "or", lor: "or", ror: "or",
  xor: "xor", xnor: "xor", rxor: "xor",
  not: "buf", buf: "buf", lnot: "buf",
};

/** Body width: the shape stops short of the bubble so the OUTPUT still emerges exactly at x+w. */
const bodyW = (prim: string, w: number): number => (prim in INVERTING ? w - 2 * BUBBLE_R : w);

/** X of the gate's BACK edge at height `py` — the concave arc of OR/XOR bulges right, so input
 *  wires must stop on the curve, not float at the bounding box. The back arc is a quadratic
 *  Bezier P0=(bx,y) P1=(bx+0.28*bw, midY) P2=(bx,y+h); its y(t) is linear in t, so t=(py-y)/h
 *  and x(t)=bx+2(1-t)t(0.28*bw) is exact. */
function gateBackX(shape: string, x: number, y: number, h: number, bw: number, py: number): number {
  if (shape !== "or" && shape !== "xor") return x;
  const t = h <= 0 ? 0.5 : Math.min(1, Math.max(0, (py - y) / h));
  return x + 2 * (1 - t) * t * (0.28 * bw);
}

/** Draw a gate body (and optionally XOR's second back arc) into the Konva context. */
function gateBody(ctx: Konva.Context, s: Konva.Shape, shape: string,
                  x: number, y: number, bw: number, h: number): void {
  const midY = y + h / 2;
  ctx.beginPath();
  if (shape === "and") {
    const r = h / 2, flat = x + bw - r;
    ctx.moveTo(x, y);
    ctx.lineTo(flat, y);
    ctx.arc(flat, midY, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  } else if (shape === "or" || shape === "xor") {
    const bx = shape === "xor" ? x + 5 : x;   // XOR body sits right of its extra arc
    ctx.moveTo(bx, y);
    ctx.quadraticCurveTo(bx + bw * 0.5, y + h * 0.05, x + bw, midY);
    ctx.quadraticCurveTo(bx + bw * 0.5, y + h * 0.95, bx, y + h);
    ctx.quadraticCurveTo(bx + bw * 0.28, midY, bx, y);
    ctx.closePath();
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + bw, midY);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }
  ctx.fillStrokeShape(s);
  if (shape === "xor") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + bw * 0.28, midY, x, y + h);
    ctx.strokeShape(s);
  }
}

/** A primitive cell drawn as a real schematic symbol, with its own pin stubs. */
function PrimSymbol({ box, selected, phase = "all" }: { box: Box; selected?: boolean; phase?: PhaseSel }) {
  const { node, x, y, w, h } = box;
  const prim = node.prim ?? "";
  const stroke = node.alert ? "#f85149"
              : node.planned ? PLANNED_STROKE
              : node.warn ? "#e0a93b"
              : selected ? "#4fa3ff" : GATE_STROKE;
  const sw = node.alert || selected || node.planned || node.warn ? 2 : 1.3;
  // Inferred symbols (kind "logic" = an RTL expression, not a placed cell) draw dashed —
  // the outline form of the "· primitive" caption. DFF/DLAT stand for real registers: solid.
  // A PLANNED cell is dashed whatever it is: it does not exist yet.
  const dash = node.planned ? [6, 4]
             : node.kind === "logic" && prim !== "dff" && prim !== "dlatch" ? [5, 3] : undefined;
  const midY = y + h / 2;
  const ins = node.ports.filter((p) => p.direction !== "out");
  const outP = node.ports.find((p) => p.direction === "out");
  const outPt = outP ? box.ports[portId(node.id, outP.name)] : undefined;

  /** Input stub from the body edge out to the pin anchor. `edgeAt` gives the body x at that y.
   *  A mux select sits on the TOP edge, so its stub is vertical — drawing it horizontally put
   *  the control wire in among the data arms, which is exactly what the shape is meant to keep
   *  apart. */
  const stubs = (edgeAt: (py: number) => number) =>
    ins.map((p) => {
      const pt = box.ports[portId(node.id, p.name)];
      if (!pt) return null;
      const pts = isMuxSelect(node, p.name)
        ? [pt.x, pt.y, pt.x, y + h * 0.1]
        : [edgeAt(pt.y), pt.y, pt.x, pt.y];
      return (
        <Line key={"s:" + p.name} points={pts}
              stroke={WIRE} strokeWidth={1} perfectDrawEnabled={false} />
      );
    });
  const outStub = (fromX: number) =>
    outPt ? <Line points={[fromX, midY, outPt.x, midY]} stroke={WIRE} strokeWidth={1} perfectDrawEnabled={false} /> : null;

  // ---- distinctive-shape gates
  if (isGateShape(prim)) {
    const shape = SHAPE_OF[prim] ?? "and";
    const bw = bodyW(prim, w);
    const inverted = prim in INVERTING;
    const reduction = prim === "rand" || prim === "ror" || prim === "rxor";
    return (
      <Group>
        {stubs((py) => gateBackX(shape, x, y, h, bw, py))}
        <Shape sceneFunc={(ctx, s) => gateBody(ctx, s, shape, x, y, bw, h)}
               fill={GATE_FILL} stroke={stroke} strokeWidth={sw} dash={dash} perfectDrawEnabled={false} />
        {inverted && (
          <Circle x={x + bw + BUBBLE_R} y={midY} radius={BUBBLE_R}
                  fill={GATE_FILL} stroke={stroke} strokeWidth={sw} dash={dash} perfectDrawEnabled={false} />
        )}
        {outStub(x + w)}
        {/* reduction ops (&a, |a, ^a) share the gate shape — tag them so they don't read as binary */}
        {reduction && (
          <Text x={x + bw * 0.18} y={midY - 5} text="R" fontSize={8} fill="#7f8b99"
                listening={false} perfectDrawEnabled={false} />
        )}
      </Group>
    );
  }

  // ---- MUX: trapezoid. Label the select AND both data inputs (RTLvision shows sel/d0/d1):
  //      pin "a" is the TRUE arm  -> d1 (taken when sel = 1)
  //      pin "b" is the FALSE arm -> d0 (taken when sel = 0)
  if (prim === "mux") {
    const MUX_PIN: Record<string, string> = { s: "S", a: "d1", b: "d0" };
    return (
      <Group>
        {stubs(() => x)}
        <Line points={[x, y, x + w, y + h * 0.18, x + w, y + h * 0.82, x, y + h]}
              closed fill={GATE_FILL} stroke={stroke} strokeWidth={sw} dash={dash} perfectDrawEnabled={false} />
        <Text x={x} y={midY - 6} width={w} align="center" text="MUX" fontSize={9} fontStyle="bold"
              fill="#c6d2e0" listening={false} perfectDrawEnabled={false} />
        {ins.map((p) => {
          const pt = box.ports[portId(node.id, p.name)];
          if (!pt) return null;
          const t = MUX_PIN[p.name] ?? p.name;
          const sel = isMuxSelect(node, p.name);
          return (
            <Text key={"ml:" + p.name} x={sel ? pt.x + 3 : x + 5} y={sel ? y + h * 0.12 : pt.y - 4}
                  text={t} fontSize={8}
                  fill={sel ? "#e0a93b" : "#95a2b2"}
                  listening={false} perfectDrawEnabled={false} />
          );
        })}
        {outStub(x + w)}
      </Group>
    );
  }

  // ---- DFF / latch: box, clock wedge at the clk pin, D/Q labels
  if (prim === "dff" || prim === "dlatch") {
    const at = (n: string) => box.ports[portId(node.id, n)];
    const clk = at("clk");
    return (
      <Group>
        {stubs(() => x)}
        <Rect x={x} y={y} width={w} height={h} cornerRadius={2}
              fill={GATE_FILL} stroke={stroke} strokeWidth={sw} perfectDrawEnabled={false} />
        <Text x={x} y={y + 4} width={w} align="center" text={prim === "dff" ? "DFF" : "DLAT"}
              fontSize={9} fontStyle="bold" fill="#c6d2e0" listening={false} perfectDrawEnabled={false} />
        {/* pin-name labels: few and short, so they read like a real symbol */}
        {ins.map((p) => {
          const pt = at(p.name);
          if (!pt) return null;
          const t = p.name === "d" ? "D" : p.name === "clk" ? "" : p.name === "rst" ? "R" : p.name === "rval" ? "RV" : p.name;
          return t ? (
            <Text key={"l:" + p.name} x={x + 10} y={pt.y - 4} text={t} fontSize={8} fill="#8b95a3"
                  listening={false} perfectDrawEnabled={false} />
          ) : null;
        })}
        {clk && (
          <Line points={[x, clk.y - 5, x + 9, clk.y, x, clk.y + 5]}
                stroke={stroke} strokeWidth={1.2} perfectDrawEnabled={false} />
        )}
        <Text x={x + w - 13} y={midY - 4} text="Q" fontSize={8} fill="#8b95a3"
              listening={false} perfectDrawEnabled={false} />
        {/* Per-phase RESET-PIN state, s(shift)-sac(..)/asc(..), in the node's own state colour —
            the whole claim "controllable" is these three values, so they live on the symbol.
            Prefixed "rst" and kept small: unlabeled under the box it read as the REGISTER's
            state, which it is not (它是 reset pin 的状态,不是寄存器的状态). */}
        {node.stateLabel && (
          <Text x={x - 30} y={y + h + 3} width={w + 60} align="center"
                text={`rst ${phaseText(node.stateLabel, phase)}`}
                fontSize={7} fontStyle="normal"
                fill={node.alert ? "#f85149" : node.warn ? "#e0a93b" : "#7ee787"}
                listening={false} perfectDrawEnabled={false} />
        )}
        {outStub(x + w)}
      </Group>
    );
  }

  // ---- operator box (add/sub/eq/lt/shl/concat/select/call…) with its symbol centred
  return (
    <Group>
      {stubs(() => x)}
      <Rect x={x} y={y} width={w} height={h} cornerRadius={3}
            fill={GATE_FILL} stroke={stroke} strokeWidth={sw} dash={dash} perfectDrawEnabled={false} />
      <Text x={x} y={midY - 7} width={w} align="center" text={node.designName || prim}
            fontSize={12} fontStyle="bold" fill="#c6d2e0" listening={false} perfectDrawEnabled={false} />
      {outStub(x + w)}
    </Group>
  );
}

/** Static portion of a node: box rect, text labels, pin stubs + pin-name labels.
 *  Rendered in the non-listening layer → zero hit-graph cost. */
const StaticBox = memo(function StaticBox({ box, isSeed, selected, phase = "all" }: { box: Box; isSeed: boolean; selected?: boolean; phase?: PhaseSel }) {
  const { node } = box;
  // P2 cells draw as real schematic symbols (gate outline / MUX trapezoid / DFF), with their
  // own pin stubs — they must NOT fall through to the generic module-box renderer.
  if (node.prim) {
    // A gate symbol standing for an RTL STATEMENT (kind "logic": `assign g = clk & en`, `~x`…)
    // is an INFERENCE — synthesis decides the real cell later. In the clock-tree schematic that
    // distinction decides where an OCC can go, so these carry an explicit caption
    // "<net> · primitive" and can never be mistaken for a placed library buffer (those render
    // as named instance boxes with their real cell pins). DFF group symbols represent real
    // registers, not an inference, so they are not tagged.
    const inferred = node.kind === "logic" && node.prim !== "dff" && node.prim !== "dlatch";
    return (
      <Group>
        <PrimSymbol box={box} selected={selected} />
        {inferred && (
          <Text x={box.x - 24} y={box.y + box.h + 3} width={box.w + 48} align="center"
                text={`${node.instanceName} · primitive`} fontSize={8.5} fill="#9aa7b8"
                listening={false} perfectDrawEnabled={false} />
        )}
        {/* A PLANNED mux answers "why am I here" ON the canvas: which flop groups need it
            (role, carried in designName after the "—"). Two muxes in series on one wire serve
            DISJOINT groups — without this line the upstream one reads as a duplicate fix,
            because in the drawn cone its own beneficiaries may not appear at all. */}
        {node.planned && node.designName.includes("—") && (
          <Text x={box.x - 60} y={box.y + box.h + (inferred ? 24 : 3)} width={box.w + 120}
                align="center" text={node.designName.split("—").slice(1).join("—").trim()}
                fontSize={8} fill="#c9a0e8" listening={false} perfectDrawEnabled={false} />
        )}
      </Group>
    );
  }
  if (node.netTap) return <NetTapSym box={box} />;
  if (node.kind === "port") return <PortSourceSym box={box} selected={selected} />;
  // Un-expanded logic (only its output pin) = compact tag. Once inputs are traced it has
  // input pins → fall through to the box renderer (amber fill from FILL["logic"]).
  // ...unless it has been expanded into RTL primitives (P2), in which case it is a container
  // and must draw as a frame — ELK sized it to enclose its children, not as a compact tag.
  if (node.kind === "logic" && !box.isContainer && node.ports.every((p) => p.direction === "out"))
    return <LogicSourceTag box={box} selected={selected} />;
  const { x, y, w, h } = box;
  const stroke = node.alert ? "#f85149"
              : node.planned ? PLANNED_STROKE
              : node.warn ? "#e0a93b"
              : selected ? "#4fa3ff" : isSeed ? "#e0a93b" : "#48505c";
  const showInner = node.kind === "module" && node.isLeaf === false;
  // Only real HIERARCHICAL instances get a solid frame. A "logic" box is an RTL statement
  // (`assign …`, an always block) — not a placed instance, its pins are not hierarchical pins —
  // so it draws DASHED, the same convention that tags inferred gate symbols "· primitive".
  const dashed = node.kind === "logic" || !!node.planned;
  return (
    <Group>
      <Rect
        x={x} y={y} width={w} height={h} cornerRadius={4}
        fill={box.isContainer ? "rgba(122,132,144,0.06)" : FILL[node.kind]} stroke={stroke} strokeWidth={node.alert || selected ? 2.5 : isSeed ? 2 : 1}
        dash={dashed ? [6, 4] : undefined}
        perfectDrawEnabled={false}
      />
      <Text x={x} y={y + 5} width={w} align="center" text={node.designName} fontSize={11} fontStyle="bold" fill="#dfe4ea" listening={false} perfectDrawEnabled={false} />
      <Text x={x} y={y + 19} width={w} align="center" text={node.instanceName} fontSize={9} fill="#8b95a3" listening={false} perfectDrawEnabled={false} />
      {/* "there IS a clock definition inside, expand me" — the collapsed-box equivalent of the
          clock-root badge, so a closed clock_module_0 does not read as an empty pass-through
          wire when it is actually where mclk_from_dco/mclk_from_lfxt/… are declared. */}
      {node.definesClocks && node.definesClocks.length > 0 && (
        <Text x={x - 10} y={y + h + 3} width={w + 20} align="center"
              text={`defines: ${node.definesClocks.join(", ")}`}
              fontSize={8} fill="#5be8a0" listening={false} perfectDrawEnabled={false} />
      )}
      {node.ports.map((p) => {
        const pid = portId(node.id, p.name);
        const pt = box.ports[pid];
        if (!pt) return null;
        const ipt = box.innerPorts[pid];
        const out = p.direction === "out";
        return (
          <Group key={p.name}>
            <Line
              points={out ? [x + w, pt.y, pt.x, pt.y] : [pt.x, pt.y, x, pt.y]}
              stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false}
            />
            {showInner && ipt && (
              <Line
                points={out ? [x + w, pt.y, ipt.x, ipt.y] : [x, pt.y, ipt.x, ipt.y]}
                stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false}
              />
            )}
            {out
              ? <Text x={x} y={pt.y - 5} width={w - 7 - (showInner ? PIN_STUB + 4 : 0)} align="right" text={phaseText(p.busLabel, phase)} fontSize={9.5} fill="#cdd4dc" listening={false} perfectDrawEnabled={false} />
              : <Text x={x + 7 + (showInner ? PIN_STUB + 4 : 0)} y={pt.y - 5} text={phaseText(p.busLabel, phase)} fontSize={9.5} fill="#cdd4dc" listening={false} perfectDrawEnabled={false} />}
          </Group>
        );
      })}
    </Group>
  );
});

/** Interactive portion of a node: transparent hit-rect for dblclick + pin diamonds.
 *  Rendered in the listening layer. */
const InteractiveBox = memo(function InteractiveBox({ box, bounds, isSeed: _isSeed, expanded, empty, inExpanded, inEmpty, selectedPin, curated, onPin, onPinSelect, onPinInside, onPinCtx, onOpenHdl, onDbl, onLogicExpand, onSelect, onMove, onCtx }: {
  box: Box; bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  isSeed: boolean; expanded: string[]; empty: string[]; inExpanded: string[]; inEmpty: string[];
  selectedPin?: string;
  curated?: boolean;
  onPin: (port: string, dir: "fanin" | "fanout") => void;
  /** Left-click on a NON-traceable pin (curated views, gates, source symbols): select it. */
  onPinSelect: (port: string) => void;
  onPinInside: (port: string) => void;
  onPinCtx: (port: string, x: number, y: number) => void;
  /** undefined = this node resolves to no RTL location (nothing to jump to). */
  onOpenHdl?: () => void;
  onDbl?: () => void;
  onLogicExpand: () => void;
  onSelect: () => void;
  onMove: (x: number, y: number, final: boolean) => void;
  onCtx: (x: number, y: number) => void;
}) {
  const { node, x, y, w, h } = box;
  const src = node.kind === "port" || node.kind === "logic";
  // EVERY kind is selectable (single-click highlight + right-click node menu + drag) — the
  // clock-root port pentagons were the one holdout, which made "选中 port" impossible in the
  // clock tree. `logic` also carries the P2 "Show RTL Primitives" action.
  const selectable = node.kind === "module" || node.kind === "primitive" ||
                     node.kind === "blackbox" || node.kind === "logic" || node.kind === "port";
  // Keep a child inside its parent container (per user: a child must never be dragged out
  // of its parent block). bounds is the parent's allowed top-left rect for this box.
  const clampMove = (final: boolean) => (e: Konva.KonvaEventObject<DragEvent>) => {
    let px = e.target.x(), py = e.target.y();
    if (bounds) {
      px = Math.min(Math.max(px, bounds.minX), Math.max(bounds.minX, bounds.maxX));
      py = Math.min(Math.max(py, bounds.minY), Math.max(bounds.minY, bounds.maxY));
      if (px !== e.target.x() || py !== e.target.y()) e.target.position({ x: px, y: py });
    }
    onMove(px, py, final);
  };
  // onDbl wins when the box HAS a native double-click gesture of its own (a curated view's
  // expand/collapse via onBoxDblClick, or a planned IP's internal-circuit toggle) — falling
  // through to "jump to HDL" only when there is none. This used to be backwards (onOpenHdl
  // first), which silently broke Clock Tree's double-click-to-expand for every real instance
  // box: hdlTargetFor resolves for almost any placed instance, so onOpenHdl was defined nearly
  // always and PERMANENTLY shadowed onBoxDblClick's toggleSchBox call ("点击无法展开clock tree
  // 的详细结构"). onBoxDblClick is only ever passed by the curated Clock/Reset view
  // (ClockResetTab.tsx) — the free schematic (TabArea.tsx) never sets it, so this ordering
  // still lets double-click open HDL there exactly as before ("如何快速找到对应的 RTL").
  const dblClick = onDbl ?? onOpenHdl;
  return (
    <>
      {/* Hit shape: single-click selects; DRAG moves the box; double-click per dblClick above.
          CONTAINERS hit ONLY on their border line (hitStrokeWidth) — a full-area hit made the
          frame swallow every click aimed at children/pins/wires inside, and per the user an
          instance should select by clicking its boundary, like RTLvision. Leaves keep the
          full-body hit (they are small and have no interior content). */}
      <Rect
        x={x} y={y} width={w} height={h}
        fill={box.isContainer ? undefined : "transparent"}
        fillEnabled={!box.isContainer}
        stroke="transparent"
        strokeWidth={box.isContainer ? 1 : 0}
        hitStrokeWidth={box.isContainer ? 14 : 0}
        draggable={selectable}
        onDragStart={(e) => { e.cancelBubble = true; onSelect(); }}
        onDragMove={selectable ? clampMove(false) : undefined}
        onDragEnd={selectable ? clampMove(true) : undefined}
        onClick={selectable ? (e) => { e.cancelBubble = true; onSelect(); } : undefined}
        onTap={selectable ? (e) => { e.cancelBubble = true; onSelect(); } : undefined}
        onDblClick={dblClick}
        onDblTap={dblClick}
        onMouseEnter={(src || selectable) ? cursorPointer : undefined}
        onMouseLeave={(src || selectable) ? cursorDefault : undefined}
        onContextMenu={selectable
          ? (e) => { e.evt.preventDefault(); onSelect(); onCtx(e.evt.clientX, e.evt.clientY); } : undefined}
        perfectDrawEnabled={false}
      />
      {/* Every laid-out pin gets a RIGHT-CLICK hit area — the pin menu (copy hierarchical
          pin / add_occ_point) must work on clock-root ports, assign/logic boxes and gate
          symbols too, not just module boxes ("抓不到 hierarchical pin/port" was exactly
          this gap). TRACE clicks stay where they always were: module-ish nodes outside
          curated views — P2 cells / curated graphs would merge daemon results wrongly. */}
      {node.ports.map((p) => {
        // A net tap's i/o pins are SYNTHETIC (the waypoint is a wire, not a component):
        // no markers — copying "thru:.../i" would be garbage. The wire itself is selectable.
        if (node.netTap) return null;
        const pt = box.ports[portId(node.id, p.name)];
        if (!pt) return null;
        // LEFT-CLICK is SELECT in the curated views (the object-name bar the clock tree needs)
        // and TRACE in the free-explore schematic — unchanged. Tracing is available in EVERY
        // view through the pin's RIGHT-CLICK menu (Trace drivers / Trace loads), so a curated
        // circuit can still be grown past the walk's edge without hijacking selection.
        const traceable = !src && !node.prim && !curated;
        const out = p.direction === "out";
        const dir = out ? "fanout" : "fanin";
        const done = expanded.includes(p.name);
        const dead = !done && empty.includes(p.name);
        const solid = done ? "#5a6470" : out ? "#d98a2b" : "#3aa98a";
        // Marker sits CENTERED ON the box border (per user / RTLvision), not out at the stub
        // anchor: pt is PIN_STUB outside the edge, so step back onto the border line.
        const mx = pt.x + (out ? -PIN_STUB : PIN_STUB);
        const pinCtx = (e: Konva.KonvaEventObject<PointerEvent>) => {
          e.evt.preventDefault(); e.cancelBubble = true;
          onPinCtx(p.name, e.evt.clientX, e.evt.clientY);
        };
        const selected = selectedPin === p.name;
        // ONE pin, ONE behaviour, applied to the WHOLE 18x18 hit area — not just the 5px
        // diamond. The generous Rect used to carry only the right-click handler, so a left
        // click landing anywhere in it but off the tiny diamond was swallowed dead — at normal
        // zoom that is MOST clicks, which is what every "引脚无法 trace" report since has
        // actually been. Double-click is TRACE in every view (curated included, where single
        // click stays selection for the object-name bar).
        const pinClick = (e: Konva.KonvaEventObject<MouseEvent | Event>) => {
          e.cancelBubble = true;
          if (traceable) onPin(p.name, dir); else onPinSelect(p.name);
        };
        const pinDbl = (e: Konva.KonvaEventObject<MouseEvent | Event>) => {
          e.cancelBubble = true;
          if (!node.prim || (node.id.startsWith("logic:") && !node.id.includes("#")))
            onPin(p.name, dir);
        };
        return (
          <Group key={p.name}>
            <Rect
              x={mx - 9} y={pt.y - 9} width={18} height={18} fill="transparent"
              onClick={pinClick} onTap={pinClick}
              onDblClick={pinDbl} onDblTap={pinDbl}
              onContextMenu={pinCtx}
              onMouseEnter={cursorPointer} onMouseLeave={cursorDefault}
              perfectDrawEnabled={false}
            />
            <RegularPolygon
              x={mx} y={pt.y} sides={4} radius={dead ? 4 : selected ? 7 : traceable ? 5 : 4} rotation={45}
              fill={dead ? undefined : selected ? "#4fa3ff" : traceable ? solid : "#55606e"}
              stroke={selected ? "#dfe9f5" : dead ? "#6b7785" : undefined}
              strokeWidth={selected ? 1.5 : dead ? 1.3 : undefined}
              onClick={pinClick} onTap={pinClick}
              onDblClick={pinDbl} onDblTap={pinDbl}
              onContextMenu={pinCtx}
              onMouseEnter={cursorPointer} onMouseLeave={cursorDefault}
              perfectDrawEnabled={false}
            />
          </Group>
        );
      })}
      {/* Inner trace diamonds (trace INTO the container) belong to the free-explore schematic
          only. In a CURATED graph the circuit is the walk's exact answer — merging a daemon
          trace into it corrupts the view, and a failed attempt left a dead hollow marker
          floating on the frame (the red-circle bug).
          Offered for EVERY module — including RTL-only LEAF modules: slang fully parses their
          insides (registers, assigns), and gating on isLeaf made `rst_s` on a pure-RTL
          synchronizer a dead end while the daemon had the answer all along. */}
      {!curated && !src && node.kind === "module" && node.ports.map((p) => {
        const ipt = box.innerPorts[portId(node.id, p.name)];
        if (!ipt) return null;
        const done = inExpanded.includes(p.name);
        const dead = !done && inEmpty.includes(p.name);
        const out = p.direction === "out";
        const solid = done ? "#5a6470" : out ? "#8a5a20" : "#2c7a64";
        return (
          <RegularPolygon
            key={"in:" + p.name}
            x={ipt.x} y={ipt.y} sides={4} radius={dead ? 4 : 5} rotation={45}
            fill={dead ? undefined : solid}
            stroke={dead ? "#6b7785" : undefined} strokeWidth={dead ? 1.3 : undefined}
            onClick={() => onPinInside(p.name)} onTap={() => onPinInside(p.name)}
            onMouseEnter={cursorPointer} onMouseLeave={cursorDefault}
            perfectDrawEnabled={false}
          />
        );
      })}
      {/* Logic node (always/assign) not yet expanded: a left diamond → trace its inputs.
          Gate-SHAPED logic sources (uniform assign rendering: buf/~/&/|) carry a placeholder
          "a" pin, so they qualify via their unexpanded state instead of the all-out test —
          expanding replaces the placeholder with the real signal pins. Once the gate carries
          REAL named in-pins (reads: por/wdt_reset), the diamond must NOT appear: centered on
          the left edge it sits exactly between the two pins and reads as a phantom third
          input ("or gate 两个引脚中间还有一个引脚"). Each named pin traces itself. */}
      {node.kind === "logic" &&
       (node.ports.every((p) => p.direction === "out") ||
        (!!node.prim && node.id.startsWith("logic:") && !expanded.includes("in") &&
         node.ports.filter((p) => p.direction !== "out").every((p) => /^(a|i\d+)$/.test(p.name)))) && (() => {
        const dead = empty.includes("in");
        return (
          <>
            <Line points={[x - PIN_STUB, y + h / 2, x, y + h / 2]} stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false} />
            <RegularPolygon
              x={x - PIN_STUB} y={y + h / 2} sides={4} radius={dead ? 4 : 5} rotation={45}
              fill={dead ? undefined : "#3aa98a"}
              stroke={dead ? "#6b7785" : undefined} strokeWidth={dead ? 1.3 : undefined}
              // dead stays CLICKABLE: an empty answer may have been transient (daemon
              // restart, stale session) — a retry either recovers or re-confirms empty.
              onClick={onLogicExpand} onTap={onLogicExpand}
              onMouseEnter={cursorPointer} onMouseLeave={cursorDefault}
              perfectDrawEnabled={false}
            />
          </>
        );
      })()}
    </>
  );
});

const cursorPointer = (e: Konva.KonvaEventObject<MouseEvent>) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "pointer"; };
const cursorDefault = (e: Konva.KonvaEventObject<MouseEvent>) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "default"; };
