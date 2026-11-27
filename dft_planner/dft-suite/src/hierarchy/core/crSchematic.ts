// Clock/Reset walk -> REAL schematic graph. Every node/edge here is taken verbatim from the
// backend walk over the elaborated design (DesignDb::clockResetTree):
//   xup@inst:port   the signal ENTERS instance `inst` through its real input port `port`
//   xdn@inst:port   the signal LEAVES instance `inst` through its real output port `port`
//   buf@inst:net    RTL alias (`assign a = b`) — physically just a wire, so NO node is drawn;
//                   only the net name changes across it
//   inv@inst:net    RTL inverter (`assign a = ~b`) — drawn as a real NOT gate
//   icg@inst:net#en=E  RTL clock gate (`assign g = clk & en`) — drawn as a real AND gate
//   role@instPath[#why]|net=N|in=I|out=O|mod=M   cell-library instance with its REAL pin names
// Containers are the real instance hierarchy; ports on their frames are the real crossing
// ports listed above. Nothing is inferred by the UI — if it isn't in the walk, it isn't drawn.

import type { CrPathItem, SdcClockInfo } from "../../core-bridge/model.ts";
import type { SchEdge, SchematicGraph, SchNode, SchPort } from "./schematic.ts";
import { edgeId } from "./schematic.ts";

interface Elem { kind: string; inst: string; net: string; extra: string; kv: Record<string, string>; }

function parseElem(e: string): Elem {
  const [head, ...tail] = e.split("|");
  const kv: Record<string, string> = {};
  for (const t of tail) {
    const eq = t.indexOf("=");
    if (eq > 0) kv[t.slice(0, eq)] = t.slice(eq + 1);
  }
  const at = head.indexOf("@");
  const kind = head.slice(0, at);
  let rest = head.slice(at + 1);
  let extra = "";
  const hash = rest.indexOf("#");
  if (hash >= 0) { extra = rest.slice(hash + 1); rest = rest.slice(0, hash); }
  const colon = rest.indexOf(":");
  return {
    kind,
    inst: colon < 0 ? rest : rest.slice(0, colon),
    net: colon < 0 ? "" : rest.slice(colon + 1),
    extra, kv,
  };
}

/** Progressive disclosure for large circuits: any container NOT in `expanded` renders as a
 *  single closed box — its real boundary ports stay (wires keep their anchor points), its
 *  contents are removed, and the box label carries the summed register bits of everything
 *  inside. A red flag anywhere inside bubbles up so a collapsed box still shows "there is a
 *  violation in here". Double-click (wired by the view) toggles a container open/closed —
 *  the same drill-down flow every big-schematic tool uses, because a flat drawing of a
 *  full-chip clock tree is unreadable by construction. */
export function collapseHierarchy(g: SchematicGraph, expanded: ReadonlySet<string>): SchematicGraph {
  const kids = new Map<string, string[]>();
  for (const n of Object.values(g.nodes))
    if (n.parentId && g.nodes[n.parentId]) {
      const a = kids.get(n.parentId);
      if (a) a.push(n.id); else kids.set(n.parentId, [n.id]);
    }
  if (kids.size === 0) return g;

  const keep: Record<string, SchNode> = {};
  const remap = new Map<string, string>();   // removed node id -> the collapsed box replacing it

  /** Sum bits / alert / warn / defined-clock-names over an entire (removed) subtree. */
  const gather = (
    id: string,
    into: { bits: number; alert: boolean; warn: boolean; defines: Set<string> },
    under: string,
  ): void => {
    for (const k of kids.get(id) ?? []) {
      const n = g.nodes[k];
      into.bits += n.bits ?? 0;
      into.alert = into.alert || !!n.alert;
      into.warn = into.warn || !!n.warn;
      if (n.clockInfo) for (const nm of n.clockAliases ?? [n.designName]) into.defines.add(nm);
      remap.set(k, under);
      gather(k, into, under);
    }
  };

  const walk = (id: string): void => {
    const n = g.nodes[id];
    const isContainer = kids.has(id);
    if (!isContainer) { keep[id] = n; return; }
    if (expanded.has(id)) {
      keep[id] = n;
      for (const k of kids.get(id)!) walk(k);
      return;
    }
    const agg = { bits: n.bits ?? 0, alert: !!n.alert, warn: !!n.warn, defines: new Set<string>() };
    gather(id, agg, id);
    keep[id] = {
      ...n,
      isLeaf: true,
      instanceName: agg.bits > 0 ? `${n.instanceName} · ×${agg.bits}` : n.instanceName,
      bits: agg.bits,
      // red wins over yellow: one failing group inside makes the collapsed box a failing box
      ...(agg.alert ? { alert: true } : agg.warn ? { warn: true } : {}),
      ...(agg.defines.size ? { definesClocks: [...agg.defines] } : {}),
    };
  };
  for (const n of Object.values(g.nodes)) if (!n.parentId || !g.nodes[n.parentId]) walk(n.id);

  const edges: SchEdge[] = [];
  const seen = new Set<string>();
  for (const e of g.edges) {
    // Interior edges of a collapsed subtree disappear with it; an edge with exactly one
    // removed endpoint re-anchors to the collapsed box (its boundary ports still exist).
    const from = keep[e.fromNode] ? e.fromNode : remap.get(e.fromNode);
    const to = keep[e.toNode] ? e.toNode : remap.get(e.toNode);
    if (!from || !to || from === to) continue;
    const fromPort = from === e.fromNode ? e.fromPort
      : keep[from].ports.find((p) => p.name === e.netName || p.name === e.fromPort)?.name;
    const toPort = to === e.toNode ? e.toPort
      : keep[to].ports.find((p) => p.name === e.netName || p.name === e.toPort)?.name;
    if (!fromPort || !toPort) continue;
    const id = edgeId(from, fromPort, to, toPort);
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ ...e, id, fromNode: from, fromPort, toNode: to, toPort });
  }
  return { ...g, nodes: keep, edges };
}

/** Container ids in a graph (nodes that have at least one child) — the double-clickable set. */
export function containerIds(g: SchematicGraph): Set<string> {
  const out = new Set<string>();
  for (const n of Object.values(g.nodes)) if (n.parentId && g.nodes[n.parentId]) out.add(n.parentId);
  return out;
}

/** Display form of the walk elements for the ABSTRACT views (tree/topology/per-path):
 *  boundary-crossing records (xup/xdn) removed, structured |k=v tails stripped. */
export function displayElems(elems: readonly string[]): string[] {
  return elems
    .map((e) => e.split("|")[0])
    .filter((e) => !e.startsWith("xup@") && !e.startsWith("xdn@"));
}

const last = (p: string): string => p.split(".").pop() ?? p;
const parentOf = (p: string): string => { const i = p.lastIndexOf("."); return i < 0 ? "" : p.slice(0, i); };

export interface CrSchOptions {
  seedId: string;
  /** Harden top(s): scopes equal to a root are the canvas itself, not drawn as containers. */
  roots: readonly string[];
  /** Which items count as violations — their flop group (and lost-signal point) turns red. */
  isBad?: (i: CrPathItem) => boolean;
  /** Optional: real module (definition) name for an instance path, when the tree knows it. */
  moduleNameOf?: (instId: string) => string | undefined;
  /** Resolved SDC clocks (period/master already computed) from the same clock-reset-tree
   *  response, matched onto a clock-root node by name — so an engineer sees the SDC definition
   *  right on the schematic, not only in the page's flat clock-list banner. */
  clocks?: SdcClockInfo[];
}

/** Build the exact circuit of the walked clock/reset paths as a SchematicGraph. */
export function buildCrSchematic(items: CrPathItem[], opts: CrSchOptions): SchematicGraph {
  const nodes: Record<string, SchNode> = {};
  const edges: SchEdge[] = [];
  const edgeSeen = new Set<string>();

  const isRoot = (scope: string): boolean => !scope || opts.roots.includes(scope);
  const clocksByName = new Map<string, SdcClockInfo>((opts.clocks ?? []).map((c) => [c.name, c]));
  // Which clock NAMES share a given literal SDC target object — a real `-add` mux point (e.g.
  // mclk fed by both `-add`ed mclk_from_dco and mclk_from_lfxt) declares more than one here. The
  // WALK only ever attributes a flop group's clockName to ONE of them (its own SdcIndex is a
  // single-valued map, not a list), so without this a mux-shared clock silently read as if only
  // its walk-chosen alternative existed — this recovers the rest straight from the full resolved
  // clock list, independent of what the walk happened to pick.
  const clocksByTarget = new Map<string, string[]>();
  for (const c of opts.clocks ?? [])
    for (const t of c.targets) (clocksByTarget.get(t) ?? clocksByTarget.set(t, []).get(t)!).push(c.name);
  // A resolved clock's `targets` is scoped to the SDC (no harden-top prefix: "PROCESSOR_1.
  // clock_module_0.mclk"), while a walked item's `detail` is the FULL path INCLUDING the harden
  // top ("processor_core.PROCESSOR_1.clock_module_0.mclk") — an exact-string lookup between the
  // two always misses. Strip the root the same way the page's own `strip()` does before using
  // `detail` as a clocksByTarget key.
  const stripRoot = (p: string): string => {
    for (const r of opts.roots) if (p === r) return p;
    for (const r of opts.roots) if (p.startsWith(r + ".")) return p.slice(r.length + 1);
    return p;
  };

  /** Real-hierarchy container chain down to `scope` (harden top excluded). */
  const ensureContainer = (scope: string): string | undefined => {
    if (isRoot(scope)) return undefined;
    if (!nodes[scope]) {
      const parent = ensureContainer(parentOf(scope));
      nodes[scope] = {
        id: scope,
        instanceName: last(scope),
        designName: opts.moduleNameOf?.(scope) ?? "",
        kind: "module",
        ports: [],
        isLeaf: false,
        ...(parent ? { parentId: parent } : {}),
      };
    }
    return scope;
  };

  const addPort = (nodeId: string, name: string, direction: SchPort["direction"]): void => {
    const n = nodes[nodeId];
    if (!n || n.ports.some((p) => p.name === name)) return;
    n.ports = [...n.ports, { name, direction, busLabel: name }];
  };

  // Which SDC clock(s) the walk found actually flowing through a given (node, port) — keyed
  // separately from the node/port objects themselves so a port created before its clock is
  // known (or touched again by a SECOND clock sharing the same `-add` target) still picks it
  // up; merged onto the real SchPort objects in one pass just before returning.
  const portClockSets = new Map<string, Set<string>>();
  const notePortClock = (nodeId: string, port: string, clockName?: string): void => {
    if (!clockName) return;
    const key = `${nodeId} ${port}`;
    let s = portClockSets.get(key);
    if (!s) { s = new Set(); portClockSets.set(key, s); }
    s.add(clockName);
  };

  // Every node id a clock's own items actually touch (root through flop sink) — "highlight this
  // clock's whole path", not just its root box. Populated per-item below via noteClockNode
  // (defined inside the loop, closing over that item's itemClockNames).
  const nodesByClock = new Map<string, Set<string>>();

  let curVal = "";   // value-calculus state of the CURRENT wire segment (set per item below)
  const addEdge = (fromNode: string, fromPort: string, toNode: string, toPort: string, netName: string,
                   loc?: { file: string; line: number }): void => {
    const id = edgeId(fromNode, fromPort, toNode, toPort);
    if (edgeSeen.has(id)) return;
    edgeSeen.add(id);
    edges.push({ id, fromNode, fromPort, toNode, toPort, netName, bus: false,
                 ...(loc ? { loc } : {}), ...(curVal ? { val: curVal } : {}) });
  };
  /** an inverter flips the propagated state (X/Z stay unknowable) */
  const flip = (v: string): string =>
    v === "0" ? "1" : v === "1" ? "0" : v === "010" ? "101" : v === "101" ? "010" : v;

  for (const it of items) {
    const bad = opts.isBad?.(it) ?? false;
    // Net name at the source = the last walk hop's net (path is flop -> source).
    const lastHop = it.path[it.path.length - 1] ?? "";
    const lc = lastHop.indexOf(":");
    let curNet = lc < 0 ? it.net : lastHop.slice(lc + 1);
    // Source location of the statement behind the CURRENT wire segment (set by alias hops,
    // consumed by the next edge) — powers Show HDL on a wire.
    let curLoc: { file: string; line: number } | undefined;
    // Per-user: the reset DRC must show EVERY signal's state (X/Z/0/1) — start each path at
    // the walk's root value and flip through inverters; the final segment carries the
    // authoritative flop-pin value from the backend.
    // Z is a PORT state, not a wire state: an unconstrained top input reads Z at the pin and
    // is ANALYZED AS X past it (the calculus rule the whole tool runs on). Painting interior
    // segments Z contradicted the X the final segment truthfully showed — the source box
    // still says "unconstrained (Z)", the wires say what the analysis uses.
    curVal = it.rootValue === "Z" ? "X" : (it.rootValue || it.value || "");

    // ---- source node: SDC clock root, unconstrained primary input, or the point where the
    //      signal is LOST (terminus logic/instance/undriven) — the latter is the DRC culprit.
    let src: SchNode;
    // Every clock name that actually applies to THIS item's hops/sink — normally just
    // it.clockName, but a real `-add` mux target names more (see clocksByTarget above).
    let itemClockNames: string[] = it.clockName ? [it.clockName] : [];
    const noteClockNode = (nodeId: string): void => {
      for (const nm of itemClockNames) {
        let s = nodesByClock.get(nm);
        if (!s) { s = new Set(); nodesByClock.set(nm, s); }
        s.add(nodeId);
      }
    };
    if (it.clockName) {
      const ci = clocksByName.get(it.clockName);
      // Where the SDC actually declares this clock: a real top-level primary port (dco_clk) has
      // none (parentOf resolves to the harden root); a generated clock whose target is an
      // INTERNAL net (mclk_from_dco -> clock_module_0.mclk) lives wherever that net actually is.
      // Placing the root there — same fix already applied to the terminus/logic branch below for
      // the identical symptom — keeps same-scope fan-out (sync_cell_lfxt_clk, the DFF, …) on an
      // ordinary same-container wire instead of a dashed "crossed a boundary with no port" edge
      // implying a boundary crossing that was never really there.
      const defScope = it.detail ? parentOf(it.detail) : "";
      const parent = ensureContainer(defScope);
      if (it.detail) itemClockNames = clocksByTarget.get(stripRoot(it.detail)) ?? [it.clockName];
      src = nodes["clk:" + it.clockName] ?? {
        id: "clk:" + it.clockName, instanceName: it.detail || curNet, designName: it.clockName,
        kind: "port", ports: [{ name: "o", direction: "out", busLabel: curNet }],
        ...(parent ? { parentId: parent } : {}),
        ...(ci ? { clockInfo: {
          period: ci.period, generated: ci.generated,
          masterClock: ci.masterClock, masterInferred: ci.masterInferred,
          file: ci.file, line: ci.line,
        } } : {}),
      };
      if (itemClockNames.length > 1) src.clockAliases = itemClockNames;
    } else if (it.terminus === "pi") {
      src = nodes["pi:" + it.detail] ?? {
        id: "pi:" + it.detail, instanceName: "unconstrained (Z)", designName: last(it.detail.replace(/:/g, ".")),
        kind: "port", ports: [{ name: "o", direction: "out", busLabel: curNet }], alert: true,
      };
    } else {
      // signal lost here: strip any " [reason]" / " <- flop…" annotation to recover the path
      const rawDetail = it.detail || it.terminus;
      const instPath = rawDetail.split(" [")[0].split(" <-")[0];
      // Scope = the instance the walk was in when the signal was lost. detail carries a path
      // for sequential/instance termini; for a bare `assign`/`always`/undriven it does NOT —
      // those used to resolve to "" and the culprit box floated OUTSIDE every container, its
      // wire dashed as a bogus boundary crossing. The walk path's last hop ("<inst>:<net>")
      // always names the right instance.
      const hopInst = lc > 0 ? lastHop.slice(0, lc) : "";
      const scope = instPath.includes(".") ? parentOf(instPath) : hopInst;
      const parent = ensureContainer(scope);
      if ((it.terminus === "sequential" || it.terminus === "logic") && it.terminusFile && it.terminusLine) {
        // The walk KNOWS the statement behind a sequential/logic terminus — so this box is a
        // REAL logic node, not a dead marker: its id is the block's per-instance logic id,
        // which gives it Show HDL (loc), Show RTL Primitives (decompose), Show All Pins
        // (scope) and onward tracing for free.
        const lid = `logic:${scope}:${it.terminusFile}:${it.terminusLine}`;
        src = nodes[lid] ?? {
          id: lid,
          instanceName: it.terminus === "sequential"
            ? (rawDetail.includes("<-") ? rawDetail.slice(rawDetail.indexOf("<-")) : "flop")
            : (curNet || rawDetail),
          designName: it.terminus === "sequential" ? "sequential" : rawDetail,
          kind: "logic", ports: [{ name: "o", direction: "out", busLabel: curNet || last(instPath) }],
          loc: { file: it.terminusFile, line: it.terminusLine },
          alert: true,
          // The path the DRC names this source by — what a recorded mux target matches against.
          realPath: instPath,
          ...(parent ? { parentId: parent } : {}),
        };
      } else {
        src = nodes["term:" + instPath] ?? {
          id: "term:" + instPath,
          instanceName: rawDetail.includes(" [") ? rawDetail.slice(rawDetail.indexOf(" [")) : it.terminus,
          designName: last(instPath),
          kind: "logic", ports: [{ name: "o", direction: "out", busLabel: curNet || "X" }],
          alert: true,
          realPath: instPath,
          ...(parent ? { parentId: parent } : {}),
        };
      }
    }
    nodes[src.id] = src;
    noteClockNode(src.id);

    let cur = { node: src.id, port: src.ports.find((p) => p.direction === "out")?.name ?? "o" };

    // ---- walk elems source -> flop (elems are recorded flop -> source; reverse them)
    for (const raw of [...it.elems].reverse()) {
      const e = parseElem(raw);
      if (e.kind === "xup" || e.kind === "xdn") {
        // real boundary crossing: thread the wire through the container's real port
        ensureContainer(e.inst);
        if (nodes[e.inst]) {
          addPort(e.inst, e.net, e.kind === "xup" ? "in" : "out");
          for (const nm of itemClockNames) notePortClock(e.inst, e.net, nm);
          noteClockNode(e.inst);
          if (cur.node === e.inst && cur.port !== e.net) {
            // Entered AND left the SAME container with only alias hops in between (`assign
            // mclk = nodiv_mclk` chains): a direct edge would be a SELF-EDGE between the
            // container's own in/out ports — ELK drops it or routes it AROUND the expanded
            // frame, so mclk/dbg_clk boundary pins floated unconnected inside clock_module_0
            // (and the wire showed up as a giant loop around the canvas). A pass-through net
            // waypoint INSIDE the container turns it into two ordinary segments and names
            // the internal net honestly; the alias's source location powers Show HDL.
            // id carries <inst>:<net> so copy / the object bar resolve to the REAL internal
            // net (same scheme as g: gates); same inst+net = the same net -> shared waypoint.
            const wid = `thru:${e.inst}:${curNet}`;
            if (!nodes[wid]) nodes[wid] = {
              id: wid, instanceName: curNet, designName: curNet, kind: "port", netTap: true,
              parentId: e.inst,
              ports: [{ name: "i", direction: "in", busLabel: curNet },
                      { name: "o", direction: "out", busLabel: curNet }],
              ...(curLoc ? { loc: curLoc } : {}),
            };
            noteClockNode(wid);
            addEdge(cur.node, cur.port, wid, "i", curNet, curLoc);
            addEdge(wid, "o", e.inst, e.net, curNet);
          } else {
            addEdge(cur.node, cur.port, e.inst, e.net, curNet, curLoc);
          }
          curLoc = undefined;
          cur = { node: e.inst, port: e.net };
        }
        curNet = e.net;
        continue;
      }
      const isRtl = e.net !== "";           // inst:net = RTL construct in that instance's body
      if (e.kind === "buf" && isRtl) {      // alias: physically a wire — only the name changes
        curNet = e.net;
        // Remember WHERE the rename happens: an alias has no box to right-click, yet it is real
        // source text — the wire's context menu offers Show HDL through this location.
        const aliasLn = Number(e.kv["line"] ?? 0);
        if (e.kv["file"] && aliasLn > 0) curLoc = { file: e.kv["file"], line: aliasLn };
        continue;
      }
      if (isRtl) {
        // RTL gate (inv / icg): a real gate in the source at inst, driving net e.net
        const gid = "g:" + e.inst + ":" + e.net;
        const parent = ensureContainer(e.inst);
        const enPin = e.extra.startsWith("en=") ? e.extra.slice(3) : "";
        if (!nodes[gid]) {
          // The backend hands us the exact source of the driving `assign`, so Show HDL
          // Definition on this gate lands on the statement, not just its module.
          const line = Number(e.kv["line"] ?? 0);
          nodes[gid] = {
            id: gid, instanceName: e.net, designName: e.kind === "inv" ? "~" : "&",
            kind: "logic", prim: e.kind === "inv" ? "not" : "and",
            ports: [
              { name: "a", direction: "in", busLabel: "" },
              ...(e.kind === "icg" ? [{ name: "en", direction: "in" as const, busLabel: enPin }] : []),
              { name: "y", direction: "out", busLabel: e.net },
            ],
            ...(e.kv["file"] && line > 0 ? { loc: { file: e.kv["file"], line } } : {}),
            ...(parent ? { parentId: parent } : {}),
          };
        }
        noteClockNode(gid);
        addEdge(cur.node, cur.port, gid, "a", curNet, curLoc);
        curLoc = undefined;
        if (e.kind === "inv") curVal = flip(curVal);
        cur = { node: gid, port: "y" };
        curNet = e.net;
        continue;
      }
      // Cell-library instance: a real placed instance with its REAL pin names from the lib.
      const inPin = e.kv["in"] || "in";
      const outPin = e.kv["out"] || "out";
      const parent = ensureContainer(parentOf(e.inst));
      if (!nodes[e.inst]) {
        // ICG "why" (e.g. "TE=1") names the real enable pin that opened the gate.
        const why = e.extra;
        const enPin = why.includes("=") && e.kind !== "mux" ? why.slice(0, why.indexOf("=")) : "";
        nodes[e.inst] = {
          id: e.inst, instanceName: last(e.inst), designName: e.kv["mod"] || e.kind.toUpperCase(),
          kind: "blackbox", isLeaf: true,
          ports: [
            { name: inPin, direction: "in", busLabel: inPin },
            ...(enPin && enPin !== inPin ? [{ name: enPin, direction: "in" as const, busLabel: `${why}` }] : []),
            ...(e.kind === "mux" ? [{ name: "S", direction: "in" as const, busLabel: `S=${why}` }] : []),
            { name: outPin, direction: "out", busLabel: outPin },
          ],
          ...(parent ? { parentId: parent } : {}),
        };
      }
      noteClockNode(e.inst);
      addEdge(cur.node, cur.port, e.inst, inPin, curNet, curLoc);
      curLoc = undefined;
      cur = { node: e.inst, port: outPin };
      curNet = e.kv["net"] || curNet;
    }

    // ---- flop sink: ONE DFF symbol per (kind, owner, net) group with the real bit count
    const fid = `ff:${it.kind}:${it.owner}:${it.net}`;
    const parent = ensureContainer(it.owner);
    for (const nm of itemClockNames) notePortClock(fid, it.net, nm);
    noteClockNode(fid);
    // THREE STATES, drawn apart: red = still failing, YELLOW = passes only because a planned
    // mux patches it (designed, not inserted), plain = fine as the netlist stands. And the
    // reset's per-phase state written under the symbol — s(shift)-sac(..)/asc(..) — because
    // "controllable" is a claim about all three phases, not one number.
    const warn = it.kind === "reset" && !bad && !!it.plannedFix;
    const stateLabel = it.kind === "reset"
      ? `s(${it.value})` +
        (it.sacValue !== undefined || it.ascValue !== undefined
          ? `-sac(${it.sacValue ?? it.value})/asc(${it.ascValue ?? it.value})` : "")
      : undefined;
    if (!nodes[fid]) {
      nodes[fid] = {
        id: fid, instanceName: `×${it.flopCount}`, bits: it.flopCount,
        designName: it.kind === "clock" ? `${it.edge ?? ""}` : `rst ${it.edge ?? ""}`,
        kind: "logic", prim: "dff",
        ports: [{ name: it.net, direction: "in", busLabel: it.net }],
        loc: it.file ? { file: it.file, line: it.line } : undefined,
        ...(bad ? { alert: true } : warn ? { warn: true } : {}),
        ...(stateLabel ? { stateLabel } : {}),
        ...(parent ? { parentId: parent } : {}),
      };
    } else if (bad && !nodes[fid].alert) {
      // red wins over yellow: one failing group on this net is a failing net
      const { warn: _w, ...rest } = nodes[fid];
      nodes[fid] = { ...rest, alert: true, ...(stateLabel ? { stateLabel } : {}) };
    } else if (warn && !nodes[fid].alert && !nodes[fid].warn) {
      nodes[fid] = { ...nodes[fid], warn: true, ...(stateLabel ? { stateLabel } : {}) };
    }
    // The LAST segment (into the flop pin) carries the backend's authoritative value; for a
    // reset with the phases run, the wire INTO the flop carries the whole per-phase state —
    // s(shift)-sac(..)/asc(..) — not a bare digit. "Is this reset controllable" is a claim
    // about all three phases, and the wire at the pin is where the eye asks it.
    curVal = it.value || curVal;
    if (it.kind === "reset" && (it.sacValue !== undefined || it.ascValue !== undefined))
      curVal = `s(${it.value})-sac(${it.sacValue ?? it.value})/asc(${it.ascValue ?? it.value})`;
    else if (it.kind === "reset" && it.scanChecked && it.scanValue)
      curVal = `${curVal}‖shift:${it.scanValue}`;
    addEdge(cur.node, cur.port, fid, it.net, it.net, curLoc);
  }

  // Merge the collected per-pin clock names onto the real SchPort objects — one pass, after
  // every item (and every possible SECOND `-add` clock re-touching the same port) is in.
  if (portClockSets.size) {
    for (const n of Object.values(nodes)) {
      for (const p of n.ports) {
        const s = portClockSets.get(`${n.id} ${p.name}`);
        if (s && s.size) p.clocks = [...s];
      }
    }
  }

  const clockPaths: Record<string, string[]> = {};
  for (const [nm, s] of nodesByClock) clockPaths[nm] = [...s];

  return { seedId: opts.seedId, nodes, edges, expanded: {}, empty: {}, inExpanded: {}, inEmpty: {}, clockPaths };
}
