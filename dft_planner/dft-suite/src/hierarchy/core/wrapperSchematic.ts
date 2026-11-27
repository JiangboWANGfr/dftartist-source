// Wrapper cone -> REAL schematic graph, so it renders through the same canvas as everything
// else: ELK layout, Konva symbols, containers, zoom/pan, the object bar, Show HDL.
//
// Follows crSchematic.ts exactly, and for the same reason: a second hand-rolled renderer means
// a second set of symbol conventions to keep in step, and the first attempt at one drew every
// node as an identical rounded box — a flow chart, not a circuit.
//
// The one structural decision here: NET BITS ARE WIRES, NOT NODES. The daemon's cone alternates
// net -> gate -> net, because a net bit is what the walk actually steps through. A schematic
// draws that net as the wire between two symbols and puts its name on it, so every net node
// collapses into the edge that carries its name.

import type { WrapperConeResult, WrapperConeNode } from "../../core-bridge/model.ts";
import type { SchEdge, SchematicGraph, SchNode, SchPort } from "./schematic.ts";
import { edgeId } from "./schematic.ts";

/** Engine element -> the renderer's primitive vocabulary (`prim` picks the symbol). */
const PRIM: Record<string, string> = {
  and: "and", or: "or", xor: "xor", inv: "not", mux: "mux",
  buf: "buf", latch: "dlatch", dff: "dff",
};
const GLYPH: Record<string, string> = {
  and: "&", or: "≥1", xor: "=1", not: "~", mux: "MUX", dlatch: "DLAT", dff: "DFF", buf: "1",
};

const last = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

export interface WrapperSchOptions {
  /** Instance path of the core; its own scope is the drawing's root, not a container. */
  core: string;
  /** Graph key the store caches this drawing under. */
  seedId: string;
  moduleNameOf?: (instancePath: string) => string | undefined;
}

export function buildWrapperSchematic(cone: WrapperConeResult,
                                      opts: WrapperSchOptions): SchematicGraph {
  const nodes: Record<string, SchNode> = {};
  const edges: SchEdge[] = [];
  const seen = new Set<string>();

  // ---- containers: the real instance hierarchy the cone passes through --------------------
  // `scope` is already relative to the core, so "" is the core itself and needs no box.
  const ensureContainer = (scope: string): string | undefined => {
    if (!scope) return undefined;
    if (!nodes[scope]) {
      const parent = ensureContainer(parentOf(scope));
      nodes[scope] = {
        id: scope,
        instanceName: last(scope),
        designName: opts.moduleNameOf?.(`${opts.core}.${scope.replace(/\//g, ".")}`) ?? "",
        kind: "module",
        ports: [],
        isLeaf: false,
        ...(parent ? { parentId: parent } : {}),
      };
    }
    return scope;
  };

  // ---- which cone nodes become symbols, and which are only wire ---------------------------
  const byId = new Map(cone.nodes.map((n) => [n.id, n] as const));
  const isSymbol = (n: WrapperConeNode) => n.kind !== "net";

  // WALK ORDER IS NOT SIGNAL FLOW. An input cone is walked FORWARD (port -> logic -> flop D),
  // so walk order already is the direction the signal travels. An output cone is walked
  // BACKWARD from the port to whatever drives it, so every hop points against the signal:
  // drawn as-is it showed the output port driving the flop's D pin, which is the circuit
  // inside out. Reversing the adjacency here puts the whole builder in signal-flow order, and
  // the pin assignment below then falls out correctly for both directions.
  const forward = cone.dir === "in";
  const fanout = new Map<string, string[]>();
  for (const e of cone.edges) {
    const [from, to] = forward ? [e.from, e.to] : [e.to, e.from];
    fanout.set(from, [...(fanout.get(from) ?? []), to]);
  }

  /** From a symbol, follow wire until the next symbols. Returns each with the net name the
   *  wire carried — the LAST net before the symbol, which is the one printed on a schematic. */
  const downstream = (fromId: string): { to: string; net: string }[] => {
    const out: { to: string; net: string }[] = [];
    const walked = new Set<string>();
    const stack: { id: string; net: string }[] =
      (fanout.get(fromId) ?? []).map((id) => ({ id, net: "" }));
    while (stack.length) {
      const { id, net } = stack.pop()!;
      if (walked.has(id)) continue;
      walked.add(id);
      const n = byId.get(id);
      if (!n) continue;
      if (isSymbol(n)) { out.push({ to: id, net }); continue; }
      for (const nx of fanout.get(id) ?? []) stack.push({ id: nx, net: n.label });
    }
    return out;
  };

  // ---- ids ---------------------------------------------------------------------------------
  // The canvas reads a node id AS A DESIGN PATH (realNodePath / instPath drive the object-name
  // bar and copy). Our daemon ids are `<inst>|<net>|<bit>`, which the bar printed verbatim —
  // "processor_core|p6_sel1|2" is not a path anything can resolve. These are the prefixes the
  // rest of the tool already uses, so the bar reports a real object again.
  const schId = (n: WrapperConeNode): string =>
    n.kind === "port" ? `port:${n.instance}.${n.label}`
    : n.kind === "flop" ? `ff:wrap:${n.instance}:${n.label}`
    : n.kind === "gate" ? `g:${n.instance}:${n.label}`
    : n.id;
  const idOf = new Map(cone.nodes.map((n) => [n.id, schId(n)] as const));
  const sch = (coneId: string) => idOf.get(coneId) ?? coneId;

  // ---- symbols -----------------------------------------------------------------------------
  const chosen = cone.cell;
  const isChosen = (n: WrapperConeNode) =>
    n.kind === "flop" && `${n.scope}/${n.label}`.replace(/^\//, "") === chosen;

  const inputPins = new Map<string, number>();   // node id -> how many inputs are wired so far

  for (const n of cone.nodes) {
    if (!isSymbol(n)) continue;
    const parent = ensureContainer(n.scope);

    const nid = sch(n.id);
    if (n.kind === "port") {
      // PortSourceSym draws `designName` inside the pentagon, so that is where the port BIT
      // NAME belongs. Putting the direction there instead labelled every boundary "input".
      //
      // An INPUT port is a source (its pin is an output, driving into the core); an OUTPUT port
      // is a SINK (its pin is an input, driven by whatever the walk found). Giving both an
      // output pin is what let a wire land on the port the wrong way round.
      nodes[nid] = {
        id: nid,
        instanceName: forward ? "input port" : "output port",
        designName: cone.name,
        kind: "port",
        ports: forward
          ? [{ name: "o", direction: "out", busLabel: cone.name }]
          : [{ name: "i", direction: "in", busLabel: cone.name }],
      };
      continue;
    }

    if (n.kind === "flop") {
      // The flop the verdict landed on is the whole point of the drawing; `alert` gives it the
      // heavier outline the DRC views use for "this is the node you came here to see".
      nodes[nid] = {
        id: nid,
        instanceName: n.label,
        designName: n.clock ? `${n.label}  clk ${n.clock}` : n.label,
        kind: "logic",
        prim: "dff",
        ports: [
          { name: "d", direction: "in", busLabel: "" },
          { name: "clk", direction: "in", busLabel: "" },
          { name: "q", direction: "out", busLabel: n.label },
        ],
        ...(isChosen(n) ? { alert: true } : {}),
        ...(parent ? { parentId: parent } : {}),
      };
      continue;
    }

    // gate
    const prim = PRIM[n.elem] ?? "buf";
    const arity = Math.max(1, (cone.edges.filter((e) => e.to === n.id)).length);
    const pins: SchPort[] = [];
    const names = ["a", "b", "c", "d", "e", "f"];
    for (let i = 0; i < Math.min(arity, names.length); i++)
      pins.push({ name: names[i], direction: "in", busLabel: "" });
    pins.push({ name: "y", direction: "out", busLabel: "" });
    nodes[nid] = {
      id: nid,
      instanceName: GLYPH[prim] ?? n.elem,
      designName: n.detail || n.elem,
      kind: "logic",
      prim,
      ports: pins,
      ...(parent ? { parentId: parent } : {}),
    };
  }

  // ---- wires --------------------------------------------------------------------------------
  const inPinOf = (id: string): string => {
    const n = nodes[id];
    if (!n) return "a";
    if (n.prim === "dff" || n.prim === "dlatch") return "d";
    const used = inputPins.get(id) ?? 0;
    const ins = n.ports.filter((p) => p.direction !== "out");
    inputPins.set(id, used + 1);
    return (ins[Math.min(used, ins.length - 1)] ?? ins[0])?.name ?? "a";
  };

  for (const n of cone.nodes) {
    const nid = sch(n.id);
    if (!isSymbol(n) || !nodes[nid]) continue;
    const outPin = nodes[nid].ports.find((p) => p.direction === "out")?.name ?? "y";
    for (const { to, net } of downstream(n.id)) {
      const tid = sch(to);
      if (!nodes[tid]) continue;
      const toPin = inPinOf(tid);
      const id = edgeId(nid, outPin, tid, toPin);
      if (seen.has(id)) continue;
      seen.add(id);
      edges.push({ id, fromNode: nid, fromPort: outPin, toNode: tid, toPort: toPin,
                   netName: net || n.label, bus: false });
    }
  }

  // ---- a DEDICATED cell: draw the cell that gets ADDED --------------------------------------
  // The cone of a dedicated port is the REASON (the flops that made sharing impossible); on its
  // own it shows everything except the answer. The cell does not exist in the RTL yet, so it is
  // drawn as what it is: a new flop tapping the boundary, flagged and named as an addition.
  if (cone.decision === "dedicated") {
    const portNode = cone.nodes.find((n) => n.kind === "port");
    if (portNode) {
      const pid = sch(portNode.id);
      const nid = `ff:wrap:new:${cone.core}:${cone.name}`;
      nodes[nid] = {
        id: nid,
        instanceName: cone.name,
        designName: "+ dedicated wrapper cell (added here)",
        kind: "logic",
        prim: "dff",
        alert: true,
        ports: [
          { name: "d", direction: "in", busLabel: cone.name },
          { name: "clk", direction: "in", busLabel: "" },
          { name: "q", direction: "out", busLabel: "to the wrapper chain" },
        ],
      };
      // An input cell TAPS the port; an output cell taps whatever drives the port. Either way it
      // observes the boundary rather than sitting in the functional path — which is why it is
      // drawn as a tap and not spliced into the wire.
      const src = forward
        ? { node: pid, port: "o" }
        : (() => {
            const drv = edges.find((e) => e.toNode === pid);
            return drv ? { node: drv.fromNode, port: drv.fromPort } : { node: pid, port: "i" };
          })();
      const eid = edgeId(src.node, src.port, nid, "d");
      if (!seen.has(eid)) {
        seen.add(eid);
        edges.push({ id: eid, fromNode: src.node, fromPort: src.port, toNode: nid, toPort: "d",
                     netName: cone.name, bus: false });
      }
    }
  }

  // ---- the clock that shifts the wrapper cell -----------------------------------------------
  // A wrapper cell is only a wrapper cell if it shifts on the clock the scan plan assumes, so a
  // drawing that leaves the D pin wired and the CLK pin dangling is missing half the answer.
  for (const n of cone.nodes) {
    if (n.kind !== "flop" || !n.clock) continue;
    const fid = sch(n.id);
    const cid = `clk:${n.instance}.${n.clock}`;
    if (!nodes[cid]) {
      nodes[cid] = {
        id: cid, instanceName: "clock", designName: n.clock, kind: "port",
        ports: [{ name: "o", direction: "out", busLabel: n.clock }],
      };
    }
    const eid = edgeId(cid, "o", fid, "clk");
    if (!seen.has(eid)) {
      seen.add(eid);
      edges.push({ id: eid, fromNode: cid, fromPort: "o", toNode: fid, toPort: "clk",
                   netName: n.clock, bus: false });
    }
  }

  return { seedId: opts.seedId, nodes, edges,
           expanded: {}, empty: {}, inExpanded: {}, inEmpty: {} };
}
