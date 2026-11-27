// Trace INTO a planned DFX IP: expand its box on the schematic with the real internal circuit.
//
// The planned IP box (plannedMux.ts) shows the module as a closed shape — input ports with
// their per-phase values, the used output pin with its computed value. That answers "what does
// it drive", but not the question the X raises: WHERE inside does the value come from? This
// module answers it with the daemon's `dfx-ip-cone` — the IP module's own gate-level netlist
// (the user's library Verilog, elaborated) — by splicing the DRIVER CONE of the used output
// pins into the box as child nodes: the persistent cells, the muxes, the flops, each wire
// carrying its s()-sac()/asc() value from the same calculus the DRC runs on.
//
// Only the cone is drawn, not the whole module: the box is expanded to explain specific pins
// (dfx_rst_scan_n), and 47 unrelated cells would bury the 6 that matter. Everything added is
// `planned` (dashed, violet) — none of it exists in the user's design netlist.

import type { DfxIpConeResult } from "../../core-bridge/model.ts";
import type { SchematicGraph, SchEdge, SchNode, SchPort } from "./schematic.ts";

/** Gate-ish classification from the library cell's MODULE name. Unrecognized cells stay
 *  plain boxes labeled with their module — honest beats pretty. */
export function primOfCellModule(module: string): string | undefined {
  const m = module.toLowerCase();
  // order matters: "nand" contains "and", "xnor" contains "nor"…
  if (/xnor/.test(m)) return "xnor";
  if (/xor/.test(m)) return "xor";
  if (/nand/.test(m)) return "nand";
  if (/nor/.test(m)) return "nor";
  if (/and/.test(m)) return "and";
  if (/\bor\d|_or\d|^or\d|_or_|or2|or3|or4/.test(m)) return "or";
  if (/inv|not/.test(m)) return "not";
  if (/buf/.test(m)) return "buf";
  if (/mux/.test(m)) return "mux";
  if (/dff|_ff|flop|latch/.test(m)) return "dff";
  return undefined;
}

/**
 * Expand the planned IP box `boxId` in `g` with the driver cone of `outPins` (the output
 * ports the schematic actually uses — e.g. the mux's override_source). Returns a NEW graph;
 * `g` itself when the cone resolves to nothing (unknown pins, empty netlist).
 *
 * Wiring rules, all from the daemon's netlist — nothing inferred:
 *   - a net's driver is the cell pin with dir=out on that net, or the module INPUT port
 *     bound to it (drawn as the box's own boundary port);
 *   - each cone cell becomes a child node (parentId = boxId) named by its instance,
 *     shaped by its cell module when recognizable;
 *   - each net becomes edges driver -> every cone load, labeled with the net's per-phase
 *     value (the composite `s()-sac()/asc()` string the whole tool speaks);
 *   - a constant tie is shown on the pin's busLabel instead of drawing a wire to nowhere.
 */
export function expandIpInternals(
  g: SchematicGraph,
  boxId: string,
  cone: DfxIpConeResult,
  outPins: readonly string[],
): SchematicGraph {
  if (!cone.module || !cone.cells.length || !outPins.length) return g;
  const box = g.nodes[boxId];
  if (!box) return g;

  // An `assign a = b;` is a WIRE, not a gate — the daemon reports it as an assign_buf cell so
  // the chain is complete, and the drawing sees THROUGH it (crSchematic does the same with its
  // buf@ elems). Inverting assigns stay: an inverter must never be invisible.
  // Both spellings of a wire-in-disguise: whole-assign aliases (assign_buf) and the buf cells
  // the slang decomposition emits to name its output.
  const isBufThrough = (c: DfxIpConeResult["cells"][number]): boolean =>
    c.module === "assign_buf" || (c.module === "buf" && c.name.startsWith("assign@"));
  const bufIn = new Map<string, string>();
  for (const c of cone.cells)
    if (isBufThrough(c)) {
      const o = c.pins.find((p) => p.dir === "out")?.net;
      const i = c.pins.find((p) => p.dir !== "out")?.net;
      if (o && i) bufIn.set(o, i);
    }
  const resolve = (net: string): string => {
    const seen = new Set<string>();
    while (bufIn.has(net) && !seen.has(net)) { seen.add(net); net = bufIn.get(net)!; }
    return net;
  };

  // net -> driver (cell pin or module input port), net -> loads (cell pins)
  interface PinRef { cell?: string; port: string }
  const driverOf = new Map<string, PinRef>();
  const loadsOf = new Map<string, PinRef[]>();
  const cellByName = new Map(cone.cells.map((c) => [c.name, c]));
  for (const c of cone.cells) {
    if (isBufThrough(c)) continue;   // wired through, never a node
    for (const p of c.pins) {
      if (!p.net) continue;
      const net = resolve(p.net);
      if (p.dir === "out") driverOf.set(net, { cell: c.name, port: p.port });
      else {
        const a = loadsOf.get(net);
        if (a) a.push({ cell: c.name, port: p.port });
        else loadsOf.set(net, [{ cell: c.name, port: p.port }]);
      }
    }
  }
  // The module's own INPUT ports drive their bound nets; OUTPUT ports load theirs.
  const inPortOf = new Map<string, string>();   // net -> module input port name
  for (const p of cone.ports) {
    if (!p.net) continue;
    if (p.dir !== "out") {
      const net = resolve(p.net);
      if (!driverOf.has(net)) inPortOf.set(net, p.port);
    }
  }
  // Wire labels: the full three-phase string only when the phases DIFFER — `s(X)-sac(X)/asc(X)`
  // three times over is the "文字混乱"; a uniform value compresses to the single character the
  // main schematic writes ("X", "1"), same color rules.
  // A constrained value is written the Tessent way: C0 / C1 / CX.
  const mark = (v: string, d?: boolean) => (d ? "C" + v : v);
  const valOf = new Map(cone.nets.map((n) => [n.name,
    !(n.s || n.sac || n.asc) ? ""
    : n.s === n.sac && n.sac === n.asc ? mark(n.s, n.declared)
    : `s(${mark(n.s, n.declared)})-sac(${mark(n.sac, n.declared)})/asc(${mark(n.asc, n.declared)})`]));

  // The cone: walk backward from each used output pin's bound net.
  const outNetOf = new Map<string, string>();   // module output port -> its internal net
  for (const p of cone.ports) if (p.dir === "out" && p.net) outNetOf.set(p.port, p.net);
  const coneCells = new Set<string>();
  const coneNets = new Set<string>();
  const queue: string[] = [];
  for (const pin of outPins) {
    const net = resolve(outNetOf.get(pin) ?? pin);   // output ports usually bind a same-named net
    if (driverOf.has(net) || inPortOf.has(net)) queue.push(net);
  }
  while (queue.length) {
    const net = queue.pop()!;
    if (coneNets.has(net)) continue;
    coneNets.add(net);
    const d = driverOf.get(net);
    if (!d?.cell || coneCells.has(d.cell)) continue;
    coneCells.add(d.cell);
    for (const p of cellByName.get(d.cell)!.pins)
      if (p.dir !== "out" && p.net) queue.push(resolve(p.net));
  }
  if (!coneCells.size) return g;

  const nodes: Record<string, SchNode> = { ...g.nodes };
  const edges: SchEdge[] = [...g.edges];
  const childId = (cell: string) => `${boxId}#${cell}`;

  for (const name of coneCells) {
    const c = cellByName.get(name)!;
    const prim = primOfCellModule(c.module);
    const ports: SchPort[] = c.pins.map((p) => ({
      name: p.port,
      direction: p.dir === "out" ? "out" : "in",
      // a tie is a real connection with nothing to draw a wire to — say it on the pin
      busLabel: p.tie ? `${p.port} = ${p.tie}` : p.port,
    }));
    // An assign is a statement, not an instance: label it by the net it drives, the way the
    // main schematic captions its inferred primitives — "assign@x · assign_inv" said nothing.
    // A DECOMPOSED assign cell carries the primitive kind in `module` and its display text in
    // `label` ("MUX", "==", "&") — exactly what "Show RTL Primitives" renders elsewhere.
    const isAssign = c.module.startsWith("assign") || c.name.startsWith("assign@");
    const decomposed = c.name.startsWith("assign@") && !c.module.startsWith("assign");
    const driven = c.pins.find((p) => p.dir === "out")?.net ?? "";
    nodes[childId(name)] = {
      id: childId(name),
      instanceName: isAssign ? (driven.includes("#") ? "" : driven) : name,
      designName: decomposed ? (c.label ?? c.module)
                : isAssign ? (prim ? "" : "assign") : c.module,
      kind: "logic",
      ...(decomposed ? { prim: c.module } : prim ? { prim } : {}),
      isLeaf: true,
      planned: true,
      parentId: boxId,
      ports,
    };
  }
  // The box turns into a CONTAINER: children live inside its frame; its flat input list is
  // replaced by the boundary ports the cone actually crosses (the layout draws container
  // ports on the frame; dead ports would widen the frame for nothing). Port labels go back
  // to PLAIN PIN NAMES, the way the main schematic writes them — the values now ride the
  // wires as per-pin chips, and repeating them in the frame text was the "文字混乱".
  const usedInPorts = new Set<string>();
  for (const net of coneNets) {
    const ip = inPortOf.get(net);
    if (ip && !driverOf.has(net)) usedInPorts.add(ip);
  }
  nodes[boxId] = {
    ...box,
    isLeaf: false,
    ports: box.ports
      .filter((p) => p.direction === "out" || usedInPorts.has(p.name))
      .map((p) => ({ ...p, busLabel: p.name })),
  };

  let n = 0;
  const push = (fromNode: string, fromPort: string, toNode: string, toPort: string,
                net: string) => {
    edges.push({ id: `ipc:${boxId}:${n++}`, fromNode, fromPort, toNode, toPort,
                 netName: net, bus: false, ...(valOf.get(net) ? { val: valOf.get(net)! } : {}) });
  };
  for (const net of coneNets) {
    const d = driverOf.get(net);
    const from: { node: string; port: string } | undefined =
      d?.cell ? { node: childId(d.cell), port: d.port }
      : inPortOf.has(net) ? { node: boxId, port: inPortOf.get(net)! }
      : undefined;
    if (!from) continue;
    for (const l of loadsOf.get(net) ?? [])
      if (l.cell && coneCells.has(l.cell)) push(from.node, from.port, childId(l.cell), l.port, net);
  }
  // …and the used output pins themselves: internal driver -> the box's boundary port, so the
  // wire already leaving the box for the mux now starts at the real gate.
  for (const pin of outPins) {
    const net = resolve(outNetOf.get(pin) ?? pin);
    const d = driverOf.get(net);
    if (d?.cell && coneCells.has(d.cell)) push(childId(d.cell), d.port, boxId, pin, net);
  }
  return { ...g, nodes, edges };
}
