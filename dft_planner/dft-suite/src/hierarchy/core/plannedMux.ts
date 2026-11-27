// Planned control muxes, drawn on the schematic where they will be inserted.
//
// `add_dft_ctrl_mux` records an intention: a mux that does not exist yet. Until now the only
// evidence of one was a line in a report, so the schematic showed the design as it is and the
// plan lived somewhere else — and "did I already patch this reset?" had no answer on screen.
//
// This splices a PLANNED mux into the graph on every net whose target was recorded: the
// functional driver goes to the mux's `b` input, the mux output feeds what the driver used to
// feed, and the DFT side is drawn as the IP MODULES it really comes from — a
// dfx_dynamic_hyper_ctl box with its dfx_rst_scan_n pin, a dfx_static_hyper_ctl_tdr box with its
// dfx_scan_mode pin — because "which IP drives this" is the question the picture has to answer.
// Everything planned is flagged `planned`, which is what makes the renderer draw it dashed and
// in its own colour; nothing here can be mistaken for a cell the netlist actually contains.

import type { SchematicGraph, SchEdge, SchNode } from "./schematic.ts";

export interface PlannedMux {
  target: string; overrideSource: string; select: string;
  /** Who this mux is FOR, e.g. "5 flops · watchdog_0/por, sync_cell_lfxt_clk/rst". A reset
   *  chain crosses several register outputs and each one needs its own control point, so two
   *  muxes can sit in series on one drawn wire while serving disjoint flop groups. Without this
   *  on the box, the second one reads as a duplicate fix — which is exactly how it was read. */
  role?: string;
}
/** One port of a planned IP with its per-phase value — inputs from the constraint chain,
 *  outputs COMPUTED from the IP's own circuit (daemon `ipCircuits`); X = undecidable, with
 *  `stuck` naming why ("input:<port>" = first unconstrained input, "dead:<path>" = a register
 *  output inside the IP). */
export interface PlannedIpPort {
  port: string; dir: string; s: string; sac: string; asc: string; stuck?: string;
  /** value DECLARED on the pin (constraint/tie) rather than computed — starred in labels */
  declared?: boolean;
}
/** A planned DFX IP instantiation (dp_shell `add_dft_ip`), used to name the boxes. */
export interface PlannedIp { instance: string; module: string; at: string; ports?: PlannedIpPort[] }
/** A recorded pin constraint (dp_shell add_pin_constraint) — what the DFT side is HELD at. */
export interface PlannedConstraint { pin: string; value: string }

const userPath = (p: string) => p.replace(/[.:]/g, "/");
/** The last '/'-separated element — a pin name against a hierarchical path. */
const leaf = (p: string) => userPath(p).split("/").filter(Boolean).pop() ?? p;
const ipPath = (x: PlannedIp) => (x.at ? `${userPath(x.at)}/${x.instance}` : x.instance);

/** Does this edge carry the recorded target?
 *
 *  A target is written down in whichever way the engineer was looking at it: the sink pin, the
 *  driver pin, or the net. All three are accepted, in full or top-relative form (the schematic
 *  strips the top, dp_shell may not), because a plan that matched only one spelling drew nothing
 *  and looked like the feature was broken.
 *
 *  The net is matched on its LEAF only as a last resort and only when the target is itself a
 *  bare name — `rst_a` may legitimately mean "the net called rst_a here", but a full path must
 *  match a full path or nothing. */
/** How an edge relates to a recorded target. A mux is inserted in FRONT OF A LOAD, so the sink
 *  side is the real cut point; the other two are how the same wire gets named when someone is
 *  looking at the driver or at the net instead. */
type Hit = "sink" | "driver" | "net" | null;

function edgeHit(e: SchEdge, target: string, pathOf: (n: string, p: string) => string,
                 nodeOf?: (id: string) => SchNode | undefined): Hit {
  // Cut at the first whitespace: the clock/reset views name their SOURCE nodes with the walk's
  // human tail attached ("…/sync_cell_puc/data_sync <- flop @clk, …"), and matching against the
  // whole string is why the mux recorded at that source never appeared in the picture — the DRC
  // said fixed (yellow, s(0)) while the schematic showed X wires and no mux to explain the 0.
  const clean = (x: string) => userPath(x).split(/\s/)[0] ?? "";
  const t = clean(target);
  const sameOrSuffix = (full: string) =>
    !!full && (full === t || full.endsWith("/" + t) || t.endsWith("/" + full));
  if (sameOrSuffix(clean(pathOf(e.toNode, e.toPort)))) return "sink";
  // A source node's id may not carry its net (`logic:<file>:<line>`); its realPath does.
  const drv = nodeOf?.(e.fromNode)?.realPath ?? pathOf(e.fromNode, e.fromPort);
  // realPath names the node's OWN output net — so a driver hit through it is only sound for
  // edges leaving an OUT port. A decomposed block is a CONTAINER whose boundary passes its
  // INPUTS through (edges leave in-direction ports for data_in/clk/rst), and matching those
  // spliced the data_sync mux onto every one of them, "driving" the clock with the reset rail
  // and labeling functional inputs 1 ("图片中 pin/port/net 值还是不对").
  const fromDir = nodeOf?.(e.fromNode)?.ports.find((p) => p.name === e.fromPort)?.direction;
  if (fromDir !== "in" && sameOrSuffix(clean(drv))) return "driver";
  if (!e.netName) return null;
  const net = clean(e.netName);
  // A BARE net name must be SCOPED before a full-path target may match it: every reset
  // synchroniser calls its net `data_sync`, and matching `…/sync_cell_puc/data_sync`
  // against the bare leaf spliced that mux into every OTHER synchroniser's picture too
  // ("schematic 显示的也不对" — a foreign mux with the wrong rail on this view's wire).
  // The driver pin's directory is the net's scope.
  if (!net.includes("/")) {
    const dir = clean(drv).split("/").slice(0, -1).join("/");
    if (dir && sameOrSuffix(`${dir}/${net}`)) return "net";
    // bare name vs bare name — never a full path against a leaf
    return !t.includes("/") && leaf(net) === t ? "net" : null;
  }
  if (sameOrSuffix(net)) return "net";
  return !t.includes("/") && leaf(net) === t ? "net" : null;
}

/**
 * The edges to cut for one target.
 *
 * ONE kind of hit is used, most specific first. Mixing them is what produced a loop: a target
 * that names a net matches both the edge arriving at a node and the edge leaving it, and cutting
 * both puts the node on each side of the mux — feeding it and fed by it. Within the chosen kind
 * a chain is broken the same way: an edge whose driver is another chosen edge's sink is dropped,
 * so the mux is inserted at one point on the wire, never at two points in series.
 */
function cutEdges(edges: readonly SchEdge[], target: string,
                  pathOf: (n: string, p: string) => string,
                  nodeOf?: (id: string) => SchNode | undefined): SchEdge[] {
  const by: Record<string, SchEdge[]> = { sink: [], driver: [], net: [] };
  for (const e of edges) {
    const h = edgeHit(e, target, pathOf, nodeOf);
    if (h) by[h].push(e);
  }
  const chosen = by.sink.length ? by.sink : by.driver.length ? by.driver : by.net;
  // A chain of matching edges is ONE wire crossing container boundaries. Cut its
  // DOWNSTREAM-most segment — the mux belongs after the source has left its module, right in
  // front of the real loads (the reference sketch: data_out ── MUX ── inverter ── puc_rst),
  // not on the internal hop before a boundary port. Electrically identical, and the drawing
  // stops climbing into the source's container.
  const drivers = new Set(chosen.map((e) => e.fromNode));
  const inner = chosen.filter((e) => !drivers.has(e.toNode));
  // …and the wire usually CONTINUES past the matched segment under a different net name
  // (data_sync becomes data_out at the boundary), so the match alone still lands one hop too
  // early. A boundary port re-exports the wire through the SAME port name (in via `data_out`,
  // out via `data_out`); a real cell never does (in `a`, out `y`). Follow those pass-throughs
  // to the outermost segments — the ones feeding real consumers.
  const out: SchEdge[] = [];
  const seen = new Set<string>();
  const push = (e: SchEdge) => { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } };
  const follow = (e: SchEdge, depth: number): void => {
    const next = edges.filter((x) => x.fromNode === e.toNode && x.fromPort === e.toPort);
    if (!next.length || depth > 8) { push(e); return; }
    for (const x of next) follow(x, depth + 1);
  };
  for (const e of inner) follow(e, 0);
  return out;
}

/**
 * Splice every planned mux into `g`. Returns a NEW graph when anything was inserted, and `g`
 * itself when nothing matched — a schematic with no planned mux on it must not re-layout.
 *
 * `pathOf(node, port)` renders the full hierarchical path of a pin, which the caller already has.
 * `ips` are the planned DFX IPs, so a driver pin can be drawn on the module it belongs to.
 */
export function withPlannedMuxes(
  g: SchematicGraph,
  muxes: readonly PlannedMux[],
  pathOf: (node: string, port: string) => string,
  ips: readonly PlannedIp[] = [],
  /** Filled with the targets that matched nothing in this view, so the UI can say so instead of
   *  leaving the user to wonder whether the plan was recorded at all. */
  unmatched?: string[],
  /** Recorded pin constraints, so the planned wires carry the value they are HELD at. Without
   *  them the DFT side drew blank and "did the constraint take?" had no answer on the picture. */
  constraints: readonly PlannedConstraint[] = [],
): SchematicGraph {
  if (!muxes.length) return g;
  const nodes: Record<string, SchNode> = { ...g.nodes };
  let edges: SchEdge[] = [...g.edges];
  let n = 0;
  /** Mux outputs whose value is known, to be carried downstream. */
  const forward: Array<{ node: string; value: string }> = [];

  /**
   * The node a DFT-side driver pin hangs off, created on first use.
   *
   * When the pin sits under a planned DFX IP it is drawn as THAT MODULE — box named for the
   * module, captioned with the instance, carrying the pins actually referenced. Otherwise the
   * path is split at its last element and the box stands for whatever holds that pin; a net tag
   * would lose the "which IP is this" that makes the picture worth drawing.
   */
  /** `s(0)-sac(1)/asc(X)` — the label grammar the rest of the tool speaks. A value that comes
   *  from a user constraint is written the Tessent way: C0 / C1 / CX. An X-fed IP whose output
   *  pin reads 1 must say where the 1 comes from, or the picture contradicts itself. */
  const mark = (v: string, d?: boolean) => (d ? "C" + v : v);
  const phase3 = (ps: PlannedIpPort) =>
    `s(${mark(ps.s, ps.declared)})-sac(${mark(ps.sac, ps.declared)})/asc(${mark(ps.asc, ps.declared)})`;
  /** The daemon-computed port state for a full pin path, when the IP library gave us one. */
  const stateOf = (full: string): PlannedIpPort | undefined => {
    const p = userPath(full);
    const owner = ips.find((x) => p.startsWith(ipPath(x) + "/"));
    if (!owner?.ports) return undefined;
    const pin = p.slice(ipPath(owner).length + 1);
    return owner.ports.find((x) => x.port === pin);
  };

  const driverPin = (full: string, role: string): { node: string; port: string } => {
    const p = userPath(full);
    const owner = ips.find((x) => p.startsWith(ipPath(x) + "/"));
    const inst = owner ? ipPath(owner) : p.split("/").slice(0, -1).join("/");
    const pin = owner ? p.slice(ipPath(owner).length + 1) : leaf(p);
    const id = `planip:${inst || p}`;
    const st = stateOf(full);
    const port = { name: pin, direction: "out" as const,
                   busLabel: `${pin} · ${role}${st ? ` · ${phase3(st)}` : ""}` };
    const cur = nodes[id];
    if (cur) {
      // One box per IP even when it drives both the source and the select.
      if (!cur.ports.some((x) => x.name === pin)) nodes[id] = { ...cur, ports: [...cur.ports, port] };
    } else {
      // THE INPUT CIRCUIT, on the box: every input port of the IP with what each phase holds
      // it at (X = nobody constrains it). This is what "trace into the IP and show me" looks
      // like on the schematic — which inputs decide the pin, and what they are per phase.
      const inputs = (owner?.ports ?? [])
        .filter((x) => x.dir !== "out")
        .map((x) => ({ name: x.port, direction: "in" as const,
                       busLabel: `${x.port} · ${phase3(x)}` }));
      nodes[id] = {
        id,
        instanceName: inst || p,
        designName: owner ? owner.module : (inst ? leaf(inst) : p),
        kind: "module",
        isLeaf: true,
        planned: true,
        ports: [...inputs, port],
      };
    }
    return { node: id, port: pin };
  };

  /** The value a planned pin is held at, by either spelling. */
  const heldAt = (pin: string): string | undefined => {
    const p = userPath(pin);
    const hit = constraints.find((c) => {
      const q = userPath(c.pin);
      return q === p || q.endsWith("/" + p) || p.endsWith("/" + q);
    });
    return hit && (hit.value === "0" || hit.value === "1") ? hit.value : undefined;
  };

  for (const m of muxes) {
    const hits = cutEdges(edges, m.target, pathOf, (id) => nodes[id]);
    if (!hits.length) { unmatched?.push(m.target); continue; }
    const id = `planmux:${m.target}`;
    if (nodes[id]) continue;                       // already spliced (two views, one plan)
    // Live in the same container as the load it feeds. Left parentless it laid out beside the
    // whole design and its wires wrapped around the canvas to get back in.
    const parentId = nodes[hits[0].toNode]?.parentId;
    nodes[id] = {
      id,
      ...(parentId ? { parentId } : {}),
      instanceName: `planned · ${leaf(m.select)}`,
      // The caption answers "why is this mux here" in place: which flops need it. A mux whose
      // groups all sit on ANOTHER branch says so, instead of looking like a repeat of the one
      // downstream of it.
      designName: m.role ? `dmux2_1 — ${m.role}` : "dmux2_1",
      kind: "logic",
      prim: "mux",
      planned: true,
      ports: [
        { name: "s", direction: "in", busLabel: `select ${leaf(m.select)}` },
        { name: "a", direction: "in", busLabel: `test ${leaf(m.overrideSource)}` },
        { name: "b", direction: "in", busLabel: "functional" },
        { name: "o", direction: "out", busLabel: leaf(m.target) },
      ],
    };
    const src = driverPin(m.overrideSource, "override_source");
    const sel = driverPin(m.select, "select");
    // The daemon's computed per-phase state is the authoritative value when the IP library is
    // loaded (it already applies constraint-beats-circuit precedence); heldAt is the fallback
    // for a session without the library.
    const selSt = stateOf(m.select);
    const srcSt = stateOf(m.overrideSource);
    const selVal = selSt?.s ?? heldAt(m.select);
    const srcVal = srcSt?.s ?? heldAt(m.overrideSource);
    edges.push({ id: `pe${n}s`, fromNode: sel.node, fromPort: sel.port, toNode: id, toPort: "s",
                 netName: userPath(m.select), bus: false,
                 ...(selSt ? { val: phase3(selSt) } : selVal ? { val: selVal } : {}) });
    edges.push({ id: `pe${n}a`, fromNode: src.node, fromPort: src.port, toNode: id, toPort: "a",
                 netName: userPath(m.overrideSource), bus: false,
                 ...(srcSt ? { val: phase3(srcSt) } : srcVal ? { val: srcVal } : {}) });
    // Cut each hit edge: driver -> mux.b, mux.o -> the original sink. The walk painted the
    // whole path with its FINAL value (the planned result, e.g. 0) — that value belongs
    // DOWNSTREAM of the mux only. The functional arm upstream is the source's own output
    // (a register: statically unknown), so its inherited val is STRIPPED — labeling d0 with
    // the post-fix 0 claimed the register itself delivers 0, which it does not.
    edges = edges.map((e) => {
      if (!hits.includes(e)) return e;
      const { val: _stale, ...rest } = e;
      return { ...rest, id: e.id + ":f", toNode: id, toPort: "b" };
    });
    // With the select held at 1 the mux passes its TEST arm, so the patched net takes the
    // override source's value. That is the whole point of the plan, and it is a local
    // deduction about PLANNED wires only — the real netlist still reads whatever it reads
    // until the mux is actually inserted. Per phase when both states are known: a select of 1
    // passes the test arm, 0 leaves the functional path, X drives X.
    const outPhase = (s?: string, a?: string) =>
      s === "1" ? (a ?? "X") : s === "0" ? "" : s ? "X" : "";
    let outVal: string | undefined;
    if (selSt || srcSt) {
      const o = {
        s: outPhase(selSt?.s ?? selVal, srcSt?.s ?? srcVal),
        sac: outPhase(selSt?.sac, srcSt?.sac),
        asc: outPhase(selSt?.asc, srcSt?.asc),
      };
      outVal = (o.s || o.sac || o.asc)
        ? `s(${o.s || "-"})-sac(${o.sac || "-"})/asc(${o.asc || "-"})`
        : undefined;
    } else {
      outVal = selVal === "1" ? srcVal : undefined;
    }
    for (const h of hits)
      edges.push({ id: `pe${n}o:${h.id}`, fromNode: id, fromPort: "o",
                   toNode: h.toNode, toPort: h.toPort, netName: h.netName, bus: h.bus,
                   ...(outVal ? { val: outVal } : {}) });
    if (outVal) forward.push({ node: id, value: outVal });
    n++;
  }
  if (!n) return g;

  // CARRY THE VALUE DOWNSTREAM. Everything past the mux still showed its pre-plan value, so an
  // inverter sat between a `1` and a `1` and the picture contradicted itself.
  //
  // "Can this value pass through?" is answered by the node's IN-DEGREE, not by its port list.
  // The clock/reset views are full of synthetic hops — net taps, boundary waypoints — whose
  // ports carry only an output, so a port-count test stopped the propagation at the first hop
  // and the inverter never got its turn. One driver in, the value is determined; two, it is not.
  // An inverter flips 0<->1 and leaves X alone — including inside a composite
  // `s(0)-sac(1)/asc(X)` label, where each phase flips independently.
  const flip1 = (v: string) => (v === "1" ? "0" : v === "0" ? "1" : v);
  const flip = (v: string) =>
    v.includes("(") ? v.replace(/\(([^)]*)\)/g, (_, x: string) => `(${flip1(x)})`) : flip1(v);
  const inDeg = new Map<string, number>();
  for (const e of edges) inDeg.set(e.toNode, (inDeg.get(e.toNode) ?? 0) + 1);

  const seen = new Set<string>();
  while (forward.length) {
    const { node, value } = forward.pop()!;
    if (seen.has(node)) continue;      // cycles and re-visits stop here
    seen.add(node);
    edges = edges.map((e) => {
      if (e.fromNode !== node) return e;
      const nx = nodes[e.toNode];
      // A flop ENDS the propagation: its output is a stored value, not this wire's.
      const isFlop = nx?.prim === "dff" || nx?.prim === "dlatch";
      // BOTH tests, because each alone is wrong: a declared second input means the result
      // depends on something this does not know (an AND with an unconnected arm is still an
      // AND), and a second incoming edge means the same even when the ports say otherwise.
      const ins = nx ? nx.ports.filter((p) => p.direction !== "out").length : 0;
      const passes = nx && !isFlop && ins <= 1 && (inDeg.get(e.toNode) ?? 0) <= 1;
      if (passes)
        forward.push({ node: e.toNode, value: nx.prim === "not" ? flip(value) : value });
      return { ...e, val: value };
    });
  }
  return { ...g, nodes, edges };
}
