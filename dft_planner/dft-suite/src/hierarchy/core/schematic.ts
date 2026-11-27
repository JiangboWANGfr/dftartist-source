// Schematic graph model + ELK-input builder (pure, no React/elkjs). The schematic tab
// holds one of these per seed; trace grows it. See 2026-06-25-show-on-schematic.md §2.

import type { Direction, DriverSource, PortInfo } from "./model.ts";
import { splitDefId } from "./defId.ts";

export interface SchPort {
  name: string; direction: Direction; busLabel: string;
  /** SDC clock name(s) the clock-reset walk found flowing through THIS pin (crSchematic.ts).
   *  Usually one; more than one means the underlying net is a real mux target with several
   *  `-add`ed clock alternatives (e.g. mclk fed by both mclk_from_dco and mclk_from_lfxt) — the
   *  object-name bar lists all of them rather than silently picking one. */
  clocks?: string[];
}
export interface SchNode {
  id: string;                     // = hierarchicalPath (same id as tree/HDL -> cross-probe),
                                  //   or a synthetic `port:`/`logic:` id for behavioral sources
  instanceName: string;
  designName: string;
  definitionId?: string;          // `${designName}|${absFilePath}` — lets any node (even a
                                  //   drilled-in one not in the tree) open its HDL definition
  kind: "module" | "primitive" | "blackbox" | "port" | "logic";
  ports: SchPort[];
  loc?: { file: string; line: number };  // HDL location (behavioral source nodes -> double-click)
  isLeaf?: boolean;    // false 才画内侧菱形(module 且已知非 leaf);undefined = 不画(dfx 图等)
  parentId?: string;   // 往里 trace 落进的容器;根层节点无此字段(spec §3.1)
  /** P2: RTL primitive kind (and|or|xor|not|mux|dff|add|eq|…). Present only on cells produced
   *  by decompose-logic — makes the node render as a real gate symbol instead of a box. */
  prim?: string;
  /** DRC debug: this node IS the problem (violating flop group / point where the clock or
   *  reset is lost). Drawn with a red outline so the user's eye lands on it immediately. */
  alert?: boolean;
  /** Passes only BECAUSE of a planned fix — drawn YELLOW: designed, not inserted. Red means
   *  still broken; green/plain means fine as the netlist stands; this is the state between. */
  warn?: boolean;
  /** Short state annotation drawn under the symbol (reset DFFs carry the three-phase
   *  `s(1)-sac(0)/asc(0)` label here). */
  stateLabel?: string;
  /** The design object this node stands for when its id cannot carry it (a `logic:<file>:<line>`
   *  source node loses its NET name). The planned-mux overlay matches recorded targets against
   *  this — without it a mux recorded at `…/data_sync` had no landing point in the very view
   *  that shows the source, and the auto-fix looked like it had vanished. */
  realPath?: string;
  /** Register bits this node represents (DFF group symbols; summed up when a subtree is
   *  collapsed into a single box). */
  bits?: number;
  /** This box stands for an INTERNAL NET of the enclosing module, not a port. Decomposing a
   *  block gives every signal it reads a source tap; drawing those with the port symbol claimed
   *  e.g. `nodiv_mclk` was a port when it is a wire driven by another assign. Rendered as a net
   *  tag so the two can never be confused. */
  netTap?: boolean;
  /** This does NOT exist in the design — it is planned for insertion (an add_dft_ctrl_mux the
   *  user recorded). Drawn dashed in its own colour so a plan can never be mistaken for the
   *  netlist that was read: everything else on the canvas is what the RTL actually says. */
  planned?: boolean;
  /** This node IS an SDC-declared clock definition point (the root of a walked clock domain).
   *  Resolved via sdc-core/clockgen.cpp — period/master already have -divide_by/-multiply_by/
   *  -edges/-combinational math and master-clock inference applied, not just the raw SDC text. */
  clockInfo?: { period: number; generated: boolean; masterClock: string; masterInferred: boolean;
                file: string; line: number };
  /** Set when this clock-root node's SDC target is a real `-add` mux point: every clock name
   *  declared on that SAME target object (crSchematic.ts's clocksByTarget), not just the one the
   *  walk happened to attribute this node's flops to. `clockInfo` still describes only THIS
   *  node's own (walk-chosen) clock — the object-name bar re-resolves each alias's own period/
   *  master individually, since `-add` alternatives usually have different waveforms. */
  clockAliases?: string[];
  /** Collapsed-container bubble-up (collapseHierarchy): the SDC clock name(s) actually DEFINED
   *  somewhere inside this now-closed subtree (their `clk:` root node carried `clockInfo`) — so
   *  a box the user has not opened yet still says "there is a clock definition in here" instead
   *  of looking like a plain wire with nothing to find by expanding it. */
  definesClocks?: string[];
}

/** Gate families that get a distinctive IEEE shape (everything else = operator box). */
const GATE_SHAPES = new Set(["and", "nand", "or", "nor", "xor", "xnor", "not", "buf",
                             "land", "lor", "lnot", "rand", "ror", "rxor"]);
export const isGateShape = (prim: string): boolean => GATE_SHAPES.has(prim);

/** A MUX's select enters from the TOP, the way every schematic draws it — the data arms come in
 *  from the left and the control comes down onto the body, so "which is the select" is answered
 *  by the shape instead of by reading a pin name. */
export const isMuxSelect = (n: SchNode, portName: string): boolean =>
  n.prim === "mux" && portName === "s";

/** Pin geometry for a primitive cell: inputs spread down the left edge, output at mid-height.
 *  (Gates are small, so the PIN_ROW0/PIN_PITCH row grid used by module boxes doesn't fit.)
 *  The mux select is not on the left edge at all — see isMuxSelect. */
export function primPinY(n: SchNode, portName: string, height: number): number {
  if (isMuxSelect(n, portName)) return 0;
  const ins = n.ports.filter((p) => p.direction !== "out" && !isMuxSelect(n, p.name));
  const idx = ins.findIndex((p) => p.name === portName);
  if (idx < 0) return height / 2;                       // output (or unknown) -> centered
  return Math.round((height * (idx + 1)) / (ins.length + 1));
}

/** X of a primitive's pin, relative to the box. Only the mux select leaves the edges: it sits
 *  a third of the way along the top, clear of the sloped trapezoid corners. */
export function primPinX(n: SchNode, portName: string, width: number): number {
  return isMuxSelect(n, portName) ? Math.round(width * 0.38) : 0;
}

/** Compact size for a primitive cell — gates stay small like a real schematic symbol. */
export function primDims(n: SchNode): { width: number; height: number } {
  const ins = Math.max(1, n.ports.filter((p) => p.direction !== "out").length);
  const prim = n.prim ?? "";
  if (prim === "dff" || prim === "dlatch") return { width: 66, height: Math.max(54, ins * 18 + 20) };
  if (prim === "mux") return { width: 46, height: Math.max(48, ins * 18 + 18) };
  // A single-input inverter/buffer is a compact triangle, not a full-width gate body.
  if (prim === "not" || prim === "buf" || prim === "lnot") return { width: 40, height: 32 };
  if (isGateShape(prim)) return { width: 58, height: Math.max(36, ins * 16 + 14) };
  // add/sub/eq/lt/concat/select/call… -> a labelled operator box (RTLvision style)
  const label = n.designName || prim;
  return { width: Math.max(50, label.length * 8 + 22), height: Math.max(38, ins * 18 + 16) };
}
export interface SchEdge {
  id: string;
  fromNode: string; fromPort: string;   // driver (output pin)
  toNode: string; toPort: string;       // load (input pin)
  netName: string; bus: boolean;
  /** HDL location of the statement that produced this wire (e.g. a `buf` alias's assign in the
   *  clock-tree view) — lets the net context menu jump to the real source text. */
  loc?: { file: string; line: number };
  /** Value-calculus state of this wire segment (curated clock/reset views): "0" | "1" | "X" |
   *  "Z" | "010" | "101". The reset DRC reads shift-mode controllability straight off these. */
  val?: string;
  /** Set when this edge enters/leaves a drilled-into container WITHOUT passing through one of
   *  that container's boundary ports — i.e. it is an abstract (elided) connection, not a wire
   *  that physically crosses the frame. Drawn dashed so it never reads as a real crossing. */
  crossing?: boolean;
}
export interface SchematicGraph {
  seedId: string;
  nodes: Record<string, SchNode>;
  edges: SchEdge[];
  expanded: Record<string, string[]>;   // nodeId -> ports traced WITH results (diamond greyed)
  empty: Record<string, string[]>;       // nodeId -> ports traced but with NO instance-level
                                          // source (primary I/O or behavioral logic): dead-end marker
  inExpanded: Record<string, string[]>;  // nodeId -> 已往里追过的引脚(内侧菱形置灰)
  inEmpty: Record<string, string[]>;     // nodeId -> 往里追为空的引脚(内部悬空死角)
  /** clockName -> every node id an item carrying that clock touched, root through flop sink
   *  (crSchematic.ts's notePortClock/noteClockNode) — powers "highlight this clock's WHOLE
   *  path", not just select its root box. Curated clock/reset views only. */
  clockPaths?: Record<string, string[]>;
}

export function newSchematic(seed: SchNode): SchematicGraph {
  return { seedId: seed.id, nodes: { [seed.id]: seed }, edges: [], expanded: {}, empty: {}, inExpanded: {}, inEmpty: {} };
}

/** Record a pin whose trace found nothing (no driver/load instance on its net). */
export function markEmpty(g: SchematicGraph, nodeId: string, port: string): SchematicGraph {
  const prev = g.empty[nodeId] ?? [];
  if (prev.includes(port)) return g;
  return { ...g, empty: { ...g.empty, [nodeId]: [...prev, port] } };
}

/** 内侧菱形死角:往里追无结构边也无行为源(spec §2.4)。 */
export function markInEmpty(g: SchematicGraph, nodeId: string, port: string): SchematicGraph {
  const prev = g.inEmpty[nodeId] ?? [];
  if (prev.includes(port)) return g;
  return { ...g, inEmpty: { ...g.inEmpty, [nodeId]: [...prev, port] } };
}

/** A pin has exactly one real driver. Re-tracing the SAME pin a second time (fanin on a node/
 * port that already has an incoming edge) can resolve a DIFFERENT-looking source for it (e.g. a
 * curated walk collapses an alias chain `assign a_scan = a;` down to the underlying gate, while
 * a later ordinary behavioral-fanin trace of that SAME pin reports the literal alias statement)
 * — that is a representational duplicate of THAT pin, not a second real driver, and drawing both
 * produces a false "multi-driven" look. Scoped to the EXACT pin being traced (targetNode/
 * targetPort): dropping a new edge into some OTHER, unrelated pin just because it happens to
 * already be driven (e.g. by a curated walk's own base construction, on a canvas that starts
 * pre-wired before any click) would wrongly block genuinely new detail — only a second
 * resolution of the SAME pin currently being expanded is a real duplicate. */
function dropDuplicateDrivers(existing: SchEdge[], incoming: SchEdge[], targetNode: string, targetPort: string): SchEdge[] {
  const alreadyDriven = existing.some((e) => e.toNode === targetNode && e.toPort === targetPort);
  if (!alreadyDriven) return incoming;
  return incoming.filter((e) => !(e.toNode === targetNode && e.toPort === targetPort));
}

/** 合并一步"往里 trace":新节点已带 parentId(=容器);标记容器该引脚 inExpanded、清死角。 */
export function addTraceInto(g: SchematicGraph, containerId: string, port: string, newNodes: SchNode[], edges: SchEdge[]): SchematicGraph {
  const nodes = { ...g.nodes };
  for (const n of newNodes) if (!nodes[n.id]) nodes[n.id] = n;
  const have = new Set(g.edges.map((e) => e.id));
  const allEdges = [...g.edges, ...dropDuplicateDrivers(g.edges, edges.filter((e) => !have.has(e.id)), containerId, port)];
  const prev = g.inExpanded[containerId] ?? [];
  const inExpanded = { ...g.inExpanded, [containerId]: prev.includes(port) ? prev : [...prev, port] };
  const wasEmpty = g.inEmpty[containerId];
  const inEmpty = wasEmpty?.includes(port)
    ? { ...g.inEmpty, [containerId]: wasEmpty.filter((p) => p !== port) }
    : g.inEmpty;
  return { ...g, nodes, edges: allEdges, inExpanded, inEmpty };
}

/** 收起容器:递归移除全部后代节点、触及后代的边与标记;容器自身清 in 标记、外侧标记保留(spec §5.3)。 */
export function collapseInside(g: SchematicGraph, containerId: string): SchematicGraph {
  const doomed = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of Object.values(g.nodes))
      if (n.parentId && !doomed.has(n.id) && (n.parentId === containerId || doomed.has(n.parentId))) {
        doomed.add(n.id);
        grew = true;
      }
  }
  if (!doomed.size) return g;
  const nodes: Record<string, SchNode> = {};
  for (const [id, n] of Object.entries(g.nodes)) if (!doomed.has(id)) nodes[id] = n;
  const edges = g.edges.filter((e) => !doomed.has(e.fromNode) && !doomed.has(e.toNode));
  const strip = (m: Record<string, string[]>, alsoContainer: boolean): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const [id, ps] of Object.entries(m)) if (!doomed.has(id) && !(alsoContainer && id === containerId)) out[id] = ps;
    return out;
  };
  return { ...g, nodes, edges, expanded: strip(g.expanded, false), empty: strip(g.empty, false), inExpanded: strip(g.inExpanded, true), inEmpty: strip(g.inEmpty, true) };
}

export function makeNode(id: string, instanceName: string, definitionId: string, kind: SchNode["kind"], ports: PortInfo[],
                         opts: { isLeaf?: boolean; parentId?: string } = {}): SchNode {
  return {
    id, instanceName, kind, designName: splitDefId(definitionId).designName, definitionId,
    ports: ports.map((p) => ({ name: p.name, direction: p.direction, busLabel: p.busLabel })),
    ...(opts.isLeaf !== undefined ? { isLeaf: opts.isLeaf } : {}),
    ...(opts.parentId ? { parentId: opts.parentId } : {}),
  };
}

// UNIFORM assign rendering (same principle as the clock tree's inferred gates): a
// single-operator statement IS that gate — draw the symbol (dashed, "· primitive"), not a
// generic "assign" box. `a = b` aliases draw as a buf triangle; real blocks keep the box.
const PRIM_OF: Record<string, string> = { alias: "buf", inv: "not", and: "and", or: "or", xor: "xor" };
const SYM_OF: Record<string, string> = { alias: "buf", inv: "~", and: "&", or: "|", xor: "^" };

/**
 * SELF-HEAL a gate's pin list: drop PLACEHOLDER inputs (`a`, `i0`…) that carry no wire once the
 * gate has real, signal-named inputs.
 *
 * A gate source built before the daemon reported its RHS reads had one anonymous `a` input. That
 * node lives on in a saved graph, and a later trace adds the real pins beside it — leaving a
 * dangling stub wedged between them ("or gate 两个引脚中间还有一个引脚"). Nothing can ever
 * connect to it: it names no signal. Dropped here so an old graph repairs itself on load rather
 * than needing a Clear + re-trace.
 */
export function dropPlaceholderGatePins(g: SchematicGraph): SchematicGraph {
  const isPlaceholder = (name: string) => name === "a" || /^i\d+$/.test(name);
  let changed = false;
  const nodes: Record<string, SchNode> = {};
  for (const [id, n] of Object.entries(g.nodes)) {
    nodes[id] = n;
    if (!n.prim || !id.startsWith("logic:")) continue;
    const ins = n.ports.filter((p) => p.direction !== "out");
    const named = ins.filter((p) => !isPlaceholder(p.name));
    if (!named.length || named.length === ins.length) continue;   // nothing to drop
    const wired = new Set(g.edges.filter((e) => e.toNode === id).map((e) => e.toPort));
    const keep = n.ports.filter((p) => p.direction === "out" ||
                                       !isPlaceholder(p.name) || wired.has(p.name));
    if (keep.length === n.ports.length) continue;
    nodes[id] = { ...n, ports: keep };
    changed = true;
  }
  return changed ? { ...g, nodes } : g;
}

/** A behavioral fanin source (input port / assign / always) as a one-output source box. */
/** `drivenNet` = the signal this behavioral block drives (the register/net the trace came from).
 *  A logic node showing only "always_ff" is useless when a module has 30 of them — label it with
 *  the register it infers, which is what the user identifies it by. */
/** Owner scope encoded in a source id: `logic:<scope>:<file>:<line>` -> scope, an instance
 *  path -> its parent. Callers that don't know the parent container use this so the source box
 *  lands INSIDE its real owner when that container is on the canvas — a scope-less source used
 *  to float at the canvas root with its wire dashed as a bogus boundary crossing. (A parentId
 *  naming a box that is not drawn is harmless: layout treats the node as a root.) */
function sourceOwnerScope(src: DriverSource): string | undefined {
  if (src.kind === "logic" && src.id.startsWith("logic:")) {
    const rest = src.id.slice("logic:".length);
    const c = rest.indexOf(":");
    if (c > 0) {
      const s = rest.slice(0, c);
      if (!s.includes("/") && !s.includes("\\")) return s;   // old ids have no scope segment
    }
    return undefined;
  }
  if (src.kind === "instance") {
    const i = src.id.lastIndexOf(".");
    if (i > 0) return src.id.slice(0, i);
  }
  return undefined;
}

export function makeSourceNode(src: DriverSource, parentId?: string, drivenNet?: string): SchNode {
  parentId = parentId ?? sourceOwnerScope(src);
  // An INSTANCE driver (`.per_dout(net)`) is a real placed module, not a behavioral tag:
  // build a real module box (solid frame, node menu, Show All Pins) with the driving output
  // pin under its real name, so a later port expansion merges instead of duplicating.
  if (src.kind === "instance") {
    return {
      id: src.id,                       // the child instance's hierarchical path
      instanceName: src.id.split(".").pop() ?? src.id,
      designName: src.detail,           // module name
      kind: "module",
      isLeaf: true,
      ports: [{ name: src.label, direction: "out", busLabel: src.net || src.label }],
      loc: { file: src.file, line: src.line },
      ...(parentId ? { parentId } : {}),
    };
  }
  const isLogic = src.kind === "logic";
  if (isLogic && src.shape && PRIM_OF[src.shape]) {
    return {
      id: src.id,
      instanceName: drivenNet || src.detail,     // the net it drives — the user's handle
      designName: SYM_OF[src.shape],
      kind: "logic",
      prim: PRIM_OF[src.shape],
      // REAL input pins when the daemon names them (the RHS-read signals): a 2-input OR
      // draws with por/wdt_reset pins and each traced driver lands on its own pin — the
      // single generic `a` made every multi-input gate look one-input ("或门只有一个输入").
      ports: [
        ...((src.reads?.length
          ? src.reads.map((rd) => ({ name: rd, direction: "in" as const, busLabel: rd }))
          : [{ name: "a", direction: "in" as const, busLabel: "" }])),
        { name: "y", direction: "out", busLabel: drivenNet || src.label },
      ],
      loc: { file: src.file, line: src.line },
      ...(parentId ? { parentId } : {}),
    };
  }
  return {
    id: src.id,
    // logic: the driven register name (falls back to the block kind when unknown)
    instanceName: isLogic && drivenNet ? drivenNet : src.detail,
    designName: src.label,             // net name (port) | block kind (logic)
    kind: isLogic ? "logic" : "port",  // "constant" renders like the const port tags
    ports: [{ name: "o", direction: "out", busLabel: drivenNet || src.label }],
    loc: { file: src.file, line: src.line },
    ...(parentId ? { parentId } : {}),
  };
}

/** Apply a user's visible-pin choice to a box: the chosen names plus every pin a wire on the
 *  canvas already uses (hiding a connected pin would dangle its wire). Order and direction
 *  come from the FULL list, so the box keeps declaration order. */
export function visiblePorts(
  full: Array<{ name: string; direction: string; busLabel: string }>,
  chosen: ReadonlySet<string>,
  connected: ReadonlySet<string>,
): SchPort[] {
  return full
    .filter((p) => chosen.has(p.name) || connected.has(p.name))
    .map((p) => ({ name: p.name, direction: p.direction as SchPort["direction"], busLabel: p.busLabel }));
}

/** A behavioral LOAD (a statement READING the traced net, or the chip's primary output) as a
 *  sink box: one signal-named INPUT pin — the same signal-pin scheme traceLogicInputs uses,
 *  so a later expansion of the block merges instead of duplicating pins. */
export function makeLoadNode(src: DriverSource, net: string, parentId?: string): SchNode {
  const pid = parentId ?? sourceOwnerScope(src);
  if (src.kind === "port") {   // primary output pentagon (po:)
    return {
      id: src.id, instanceName: src.detail, designName: src.label, kind: "port",
      ports: [{ name: "i", direction: "in", busLabel: net }],
      ...(pid ? { parentId: pid } : {}),
    };
  }
  if (src.kind === "instance") {
    // A child instance READING the net (trace-net-loads: `.rst(por)` on a sync cell). A real
    // module box with the real pin — the load a net-fanout must show, or a reset that feeds
    // registers looks like it feeds none ("没发现它 drive 寄存器").
    return {
      id: src.id,
      instanceName: src.id.split(".").pop() ?? src.id,
      designName: src.detail || "",
      kind: "module", isLeaf: true,
      realPath: src.id,
      ports: [{ name: src.label || net, direction: "in", busLabel: net }],
      ...(pid ? { parentId: pid } : {}),
    };
  }
  return {
    id: src.id,
    instanceName: net,                 // labeled by the net it consumes
    designName: src.label,             // assign | always | always_ff
    kind: "logic",
    //  = the LHS net this reader statement drives. WITH it the node gets an output
    // pin and the forward trace continues (trace-net-loads on that net); without it every
    // fanout died right here and downstream registers stayed invisible.
    ports: [{ name: net, direction: "in", busLabel: net },
            ...(src.drives ? [{ name: "o", direction: "out" as const, busLabel: src.drives }] : [])],
    loc: { file: src.file, line: src.line },
    ...(pid ? { parentId: pid } : {}),
  };
}

/** The output pin a source node drives from: instance drivers use their REAL port name (so a
 *  later Show-All-Pins merges), gate-shaped logic sources use the gate's "y", behavioral
 *  tags use the synthetic single output "o". */
export const sourceOutPort = (src: { kind: string; label: string; shape?: string }): string =>
  src.kind === "instance" ? src.label
  : src.kind === "logic" && src.shape && PRIM_OF[src.shape] ? "y"
  : "o";

/** An INNER module's port source renders as its owner's OUTLINE box (portAwareSourceNode),
 *  whose out pin is the PORT NAME — not the flag convention "o" that sourceOutPort assumes.
 *  An edge built from the convention alone references a pin the box does not have, and ELK
 *  aborts the WHOLE layout on it ("Referenced shape does not exist"), which on screen is a
 *  trace that silently does nothing (the sync_cell_taclk clk/data_in/rst dead clicks).
 *  Resolve the pin from the node actually on (or entering) the canvas. */
export const sourceNodeOutPort = (n: SchNode | undefined, fallback: string): string =>
  n && n.kind === "module" && n.id.startsWith("port:")
    ? (n.ports.find((p) => p.direction === "out")?.name ?? fallback)
    : fallback;

/** A "port:<scope>.<name>" trace source resolved to its owner box's REAL boundary pin.
 *  When the daemon answers "this net is an input port", the trace does not end — the driver
 *  lives at the parent's port connection, exactly what the owner box's pin fanin traces. So if
 *  the owner instance is on the canvas, the wire must come from that pin (adding it when the
 *  box doesn't show it yet); a standalone port pentagon is a dead end the user cannot continue
 *  from. Returns null when the source is not a port or its owner is not on the canvas. */
export function portSourceBoundary(
  src: { kind: string; id: string; label: string; net?: string },
  lookup: (id: string) => SchNode | undefined,
): { ownerId: string; pin: string } | null {
  const pin = src.net || src.label;
  if (src.kind !== "port" || !pin) return null;
  if (!src.id.startsWith("port:") || !src.id.endsWith("." + pin)) return null;
  const ownerId = src.id.slice("port:".length, src.id.length - pin.length - 1);
  return lookup(ownerId) ? { ownerId, pin } : null;
}

/** The owner box with `pin` present as an input boundary port (unchanged if already there). */
export function withBoundaryPin(owner: SchNode, pin: string): SchNode {
  if (owner.ports.some((p) => p.name === pin)) return owner;
  return { ...owner, ports: [...owner.ports, { name: pin, direction: "in", busLabel: pin }] };
}

/** A node ALREADY ON THE CANVAS that represents this trace source, so tracing reuses it
 *  instead of stacking a duplicate ("乱显示" in the DRC debug view: three reset_n pentagons,
 *  and `assign por_a = ~reset_n` drawn twice — once as the walk's gate symbol, once as a
 *  freshly created logic box).
 *    logic source — SAME STATEMENT: any node whose loc is this file:line (the walk's inferred
 *                   gate `g:...` carries the statement's location too);
 *    port source  — SAME SIGNAL from an existing SOURCE SYMBOL (a port/clock-root pentagon
 *                   already emitting that signal; net taps excluded — they are consumers').
 *  Returns the node + its output pin to wire from, or null to create a new node. */
export function findExistingSource(
  nodes: Record<string, SchNode>,
  src: { kind: string; id: string; label: string; net?: string; file?: string; line?: number },
): { nodeId: string; port: string } | null {
  const sig = src.net || src.label;
  for (const n of Object.values(nodes)) {
    if (n.id === src.id) continue;   // exact id reuse is the callers' existing path
    const op = n.ports.find((p) => p.direction === "out");
    if (!op) continue;
    if (src.kind === "logic" && src.file && src.line &&
        n.loc && n.loc.file === src.file && n.loc.line === src.line)
      return { nodeId: n.id, port: op.name };
    if (src.kind === "port" && n.kind === "port" && !n.netTap && sig &&
        (n.designName === sig || op.busLabel === sig))
      return { nodeId: n.id, port: op.name };
  }
  return null;
}

export const edgeId = (fromNode: string, fromPort: string, toNode: string, toPort: string): string =>
  `${fromNode}${fromPort}>${toNode}${toPort}`;

const SEP = "";
export const portId = (nodeId: string, port: string): string => `${nodeId}${SEP}${port}`;
export function parsePortId(pid: string): { nodeId: string; port: string } {
  const i = pid.indexOf(SEP);
  return { nodeId: pid.slice(0, i), port: pid.slice(i + 1) };
}

/** Pin-row geometry (FIXED_POS): a title band, then one row per pin in declaration order. */
export const PIN_ROW0 = 46;   // first pin-row center — leaves the two title lines clear
export const PIN_PITCH = 22;  // row pitch

/** Box size from #ports per side + label widths (rough; elk uses w/h, not the labels).
 *  Behavioral sources (port arrow / logic tag) get compact fixed shapes instead. */
export function nodeDims(n: SchNode): { width: number; height: number } {
  if (n.prim) return primDims(n);   // P2 gate/mux/DFF symbol
  if (n.kind === "port") return { width: Math.max(60, n.designName.length * 6.5 + 24), height: 20 };
  if (n.kind === "logic") {
    // Un-expanded (only its output pin) = a compact tag. Once its inputs are traced it
    // grows input pin rows and renders as a box (RTLvision-style logic node).
    const li = n.ports.filter((p) => p.direction !== "out").length;
    if (li === 0) return { width: 150, height: 38 };
    const portW = Math.max(0, ...n.ports.map((p) => p.busLabel.length)) * 6.5;
    return { width: Math.max(160, n.instanceName.length * 7 + 30, portW + 60), height: PIN_ROW0 + Math.max(li, 1) * PIN_PITCH + 12 };
  }
  const ins = n.ports.filter((p) => p.direction !== "out").length;
  const outs = n.ports.filter((p) => p.direction === "out").length;
  const rows = Math.max(ins, outs, 1);
  const labelW = Math.max(n.designName.length, n.instanceName.length) * 7;
  const portW = Math.max(0, ...n.ports.map((p) => p.busLabel.length)) * 6.5;
  return { width: Math.max(130, labelW + 30, portW * 2 + 36), height: PIN_ROW0 + rows * PIN_PITCH + 12 };
}

/** Minimum size for a drilled-into (container) module: tall enough for its boundary
 *  pin rows and wide enough for the title + pin names. ELK grows it further to enclose
 *  the child instances (INCLUDE_CHILDREN); this only sets the floor so it never collapses. */
export function containerMinDims(n: SchNode): { width: number; height: number } {
  const ins = n.ports.filter((p) => p.direction !== "out").length;
  const outs = n.ports.filter((p) => p.direction === "out").length;
  const rows = Math.max(ins, outs, 1);
  const labelW = Math.max(n.designName.length, n.instanceName.length) * 7;
  const { left, right } = containerInsets(n);
  // Wide enough for BOTH pin-label columns + a clear channel for the children in between.
  return { width: Math.max(280, labelW + 80, left + right + 120), height: PIN_ROW0 + rows * PIN_PITCH + 24 };
}

/** Inner inset (px) each side must reserve for a container's pin-NAME labels. */
function containerInsets(n: SchNode): { left: number; right: number } {
  const CHAR = 6.5, STUB = 14, MARGIN = 20;
  const w = (dir: "in" | "out"): number => {
    const labels = n.ports.filter((p) => (dir === "out") === (p.direction === "out")).map((p) => p.busLabel.length);
    return labels.length ? Math.max(...labels) * CHAR : 0;
  };
  return { left: Math.round(w("in") + STUB + MARGIN), right: Math.round(w("out") + STUB + MARGIN) };
}

/** ELK padding string reserving the pin-label columns so children don't overlap the text. */
export function containerPadding(n: SchNode): string {
  const { left, right } = containerInsets(n);
  return `[top=46,left=${left},bottom=16,right=${right}]`;
}

// ---- ELK input (minimal shape; ui/elkLayout feeds it to elkjs) ----
export interface ElkInputPort { id: string; layoutOptions: Record<string, string>; x: number; y: number; width: number; height: number; }
export interface ElkInputNode { id: string; width: number; height: number; layoutOptions: Record<string, string>; ports: ElkInputPort[]; children?: ElkInputNode[]; }
export interface ElkInputEdge { id: string; sources: string[]; targets: string[]; }
export interface ElkGraphInput { id: string; layoutOptions: Record<string, string>; children: ElkInputNode[]; edges: ElkInputEdge[]; }

export function toElkGraph(g: SchematicGraph, prev?: Record<string, { x: number; y: number }>): ElkGraphInput {
  const kidsOf: Record<string, SchNode[]> = {};
  const roots: SchNode[] = [];
  for (const n of Object.values(g.nodes)) {
    if (n.parentId && g.nodes[n.parentId]) (kidsOf[n.parentId] ??= []).push(n);
    else roots.push(n);
  }
  const nested = Object.keys(kidsOf).length > 0;

  // 新增内部节点必须带"放到已 pin 兄弟下方"的位置提示,否则 ELK 抢占顶部把老盒挤走
  // (spec §4-7,probe F5/F7)。提示 y 只是排序键;x=18 仅作排序键。
  const hintFor = (n: SchNode): string | null => {
    if (!prev || prev[n.id] || !n.parentId) return null;
    const sib = (kidsOf[n.parentId] ?? []).map((s) => prev[s.id]).filter((p): p is { x: number; y: number } => !!p);
    if (!sib.length) return null;
    return `(18,${Math.max(...sib.map((p) => p.y)) + 100})`;
  };

  const build = (n: SchNode): ElkInputNode => {
    const inner = kidsOf[n.id];
    const isContainer = !!inner;
    // Leaves: an exact size + FIXED_POS pin rows (we own every pin coordinate).
    // Containers (drilled-into modules): a MINIMUM size + FIXED_SIDE, so ELK GROWS
    // the box to enclose its children and places boundary pins on the correct side.
    // (The old "size = 0 + FIXED_POS" left containers collapsed to 0×0, which stacked
    // the child box on top of the parent and squeezed every right-edge pin together.)
    const { width, height } = isContainer ? containerMinDims(n) : nodeDims(n);
    let inRow = 0, outRow = 0;
    // A "source symbol" (single midline pin) = a port, or a logic node NOT yet expanded
    // (only its output pin). An expanded logic node has input pins → use pin rows.
    const src = n.kind === "port" || (n.kind === "logic" && n.ports.every((p) => p.direction === "out"));
    // semiInteractive reads ONLY the elk.position option — NOT the x/y fields
    // (probe-verified 2026-07-06; x/y fields are silently ignored).
    const pos = prev?.[n.id] ? `(${prev[n.id].x},${prev[n.id].y})` : hintFor(n);
    return {
      id: n.id, width, height,
      layoutOptions: {
        "elk.portConstraints": isContainer ? "FIXED_SIDE" : "FIXED_POS",
        ...(pos ? { "elk.position": pos } : {}),
        ...(isContainer
          ? {
              // Reserve the pin-NAME label columns inside the frame so children never sit on
              // top of the boundary-pin text: left inset = widest INPUT label, right inset =
              // widest OUTPUT label (+ stub + margin). top=46 clears the two title lines.
              "elk.padding": containerPadding(n),
              // Treat the passed size as a floor and grow to fit children + boundary ports.
              "elk.nodeSize.constraints": "MINIMUM_SIZE PORTS",
              "elk.nodeSize.minimum": `(${width},${height})`,
              ...(prev ? { "elk.layered.crossingMinimization.semiInteractive": "true" } : {}),
            }
          : {}),
      },
      ports: n.ports.map((p) => {
        const out = p.direction === "out";
        const row = out ? outRow++ : inRow++;
        // Containers: ELK owns the exact position (FIXED_SIDE) — we only pin the side.
        // Leaves: FIXED_POS at the exact declaration-order row.
        const muxSel = isMuxSelect(n, p.name);
        return {
          id: portId(n.id, p.name),
          // NORTH for a mux select: ELK routes the wire down onto the top edge instead of
          // dragging it around to the left with the data arms.
          layoutOptions: { "elk.port.side": muxSel ? "NORTH" : out ? "EAST" : "WEST" },
          x: isContainer ? 0
             : muxSel ? primPinX(n, p.name, width) - 3
             : (out ? width - 3 : -3),
          y: isContainer ? 0
             : n.prim ? primPinY(n, p.name, height) - 3          // gate symbol: spread on the edge
             : src ? height / 2 - 3
             : PIN_ROW0 + row * PIN_PITCH - 3,
          width: 6, height: 6,
        };
      }),
      ...(inner ? { children: inner.map(build) } : {}),
    };
  };

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "150",
      "elk.spacing.edgeEdge": "16",
      "elk.spacing.edgeNode": "40",   // keep wires clear of box edges / pin-name labels
      "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
      "elk.layered.spacing.edgeNodeBetweenLayers": "40",
      ...(nested ? { "elk.hierarchyHandling": "INCLUDE_CHILDREN" } : {}),
      // Stability-lite (spec §2.4): previous on-screen coordinates act as same-layer
      // ordering tie-breaks, so unchanged graphs relayout with zero drift.
      ...(prev ? { "elk.layered.crossingMinimization.semiInteractive": "true" } : {}),
    },
    children: roots.map(build),
    // 边保持平铺:ELK 自动把内层边归入正确容器(spec §4-5,probe P1b)
    edges: g.edges.map((e) => ({ id: e.id, sources: [portId(e.fromNode, e.fromPort)], targets: [portId(e.toNode, e.toPort)] })),
  };
}

/** Merge a trace step that FOUND results (new nodes carry ports; edges deduped). Mark the
 * traced pin expanded, and clear any prior dead-end mark on it (more context resolved it). */
export function addTrace(g: SchematicGraph, fromNode: string, fromPort: string, newNodes: SchNode[], edges: SchEdge[]): SchematicGraph {
  const have = new Set(g.edges.map((e) => e.id));
  const keptEdges = dropDuplicateDrivers(g.edges, edges.filter((e) => !have.has(e.id)), fromNode, fromPort);
  // A new node whose only edge got dropped as a duplicate driver would otherwise land on
  // canvas as a disconnected, unexplained box — skip it too.
  const referenced = new Set(keptEdges.flatMap((e) => [e.fromNode, e.toNode]));
  const nodes = { ...g.nodes };
  for (const n of newNodes) if (!nodes[n.id] && referenced.has(n.id)) nodes[n.id] = n;
  const allEdges = [...g.edges, ...keptEdges];
  const prev = g.expanded[fromNode] ?? [];
  const expanded = { ...g.expanded, [fromNode]: prev.includes(fromPort) ? prev : [...prev, fromPort] };
  const wasEmpty = g.empty[fromNode];
  const empty = wasEmpty?.includes(fromPort)
    ? { ...g.empty, [fromNode]: wasEmpty.filter((p) => p !== fromPort) }
    : g.empty;
  return { ...g, nodes, edges: allEdges, expanded, empty };
}

/** Composite "添加到当前原理图": drop one more instance box + its wires into an existing
 *  graph (node & edges deduped). Unlike addTrace it marks no pin expanded — the added box
 *  keeps every diamond live so its other cones can still be traced. */
export function addNodeWithEdges(g: SchematicGraph, node: SchNode, edges: SchEdge[]): SchematicGraph {
  // No single pin is "being traced" here (every port of the new box resolves at once), so
  // there is no sensible (targetNode, targetPort) to scope a duplicate-driver check to — plain
  // edge-id dedup only, same as before the multi-driven fix (which never targeted this path).
  const nodes = g.nodes[node.id] ? g.nodes : { ...g.nodes, [node.id]: node };
  const have = new Set(g.edges.map((e) => e.id));
  const allEdges = [...g.edges, ...edges.filter((e) => !have.has(e.id))];
  return { ...g, nodes, edges: allEdges };
}

/** Container ancestors of a node inside the schematic, innermost first. */
function containerChain(g: SchematicGraph, id: string): string[] {
  const out: string[] = [];
  let c = g.nodes[id]?.parentId;
  while (c && g.nodes[c]) { out.push(c); c = g.nodes[c].parentId; }
  return out;
}

/** A wire must never appear to punch through a container frame (user: 线没有经过 port 就穿出去了).
 *  For every edge, find the containers that enclose exactly ONE endpoint — those are frames the
 *  edge crosses. For each such container:
 *    • if the container has exactly one boundary port carrying this net (name match on the net or
 *      on the far pin), SPLIT the edge so it genuinely runs through that port;
 *    • otherwise mark it `crossing` so the view draws it dashed instead of as a solid wire
 *      slicing through the frame. We never invent a port that isn't there.
 *  Pure: returns a new graph; the stored graph is untouched. */
export function repairBoundaryCrossings(g: SchematicGraph): SchematicGraph {
  let touched = false;
  const out: SchEdge[] = [];
  for (const e of g.edges) {
    const fa = containerChain(g, e.fromNode), ta = containerChain(g, e.toNode);
    const fset = new Set(fa), tset = new Set(ta);
    // Frames crossed = enclose one endpoint but not the other, and are not an endpoint themselves.
    const crossed = [...fa.filter((c) => !tset.has(c)), ...ta.filter((c) => !fset.has(c))]
      .filter((c) => c !== e.fromNode && c !== e.toNode);
    if (crossed.length === 0) { out.push(e); continue; }

    // Only an unambiguous single crossing can be repaired by threading a boundary port.
    const cid = crossed.length === 1 ? crossed[0] : null;
    const cont = cid ? g.nodes[cid] : undefined;
    const fromInside = cid ? fset.has(cid) : false;   // driver sits inside the crossed container
    const wanted = [e.netName, fromInside ? e.toPort : e.fromPort].filter(Boolean);
    const hits = cont ? cont.ports.filter((p) => wanted.includes(p.name)) : [];
    if (cont && cid && hits.length === 1) {
      const bp = hits[0].name;
      touched = true;
      // inside → boundary port → outside (or the reverse), so the wire really uses the port.
      if (fromInside) {
        out.push({ ...e, id: edgeId(e.fromNode, e.fromPort, cid, bp), toNode: cid, toPort: bp });
        out.push({ ...e, id: edgeId(cid, bp, e.toNode, e.toPort), fromNode: cid, fromPort: bp });
      } else {
        out.push({ ...e, id: edgeId(e.fromNode, e.fromPort, cid, bp), toNode: cid, toPort: bp });
        out.push({ ...e, id: edgeId(cid, bp, e.toNode, e.toPort), fromNode: cid, fromPort: bp });
      }
      continue;
    }
    touched = true;
    out.push({ ...e, crossing: true });   // honest: dashed, not a solid wire through the wall
  }
  if (!touched) return g;
  const seen = new Set<string>();
  return { ...g, edges: out.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))) };
}

/** Find a node already ON THE CANVAS whose output drives `sig` — the sibling `assign` box, an
 *  instance pin, etc. Decompose used to check only the enclosing module's boundary ports and
 *  then invent a floating net tap, even when the box driving that exact signal sat one inch
 *  away; this is the lookup it was missing. Matches the port NAME (instances) or its busLabel
 *  (logic blocks expose one out pin named "o" labelled with the driven net). A netTap is never
 *  a driver (it is itself a stand-in), and the block's own internals are excluded. A node in
 *  the same scope (`parentId`) wins over any other match. */
export function findDriverOutput(
  nodes: Record<string, SchNode>, sig: string,
  opts: { exclude?: string; parentId?: string } = {},
): { nodeId: string; port: string } | null {
  let best: { nodeId: string; port: string } | null = null;
  for (const n of Object.values(nodes)) {
    if (n.netTap) continue;
    if (opts.exclude &&
        (n.id === opts.exclude || n.id.startsWith(opts.exclude + "#") || n.id.startsWith(opts.exclude + "@")))
      continue;
    const p = n.ports.find((q) => q.direction === "out" && (q.name === sig || q.busLabel === sig));
    if (!p) continue;
    const hit = { nodeId: n.id, port: p.name };
    if (opts.parentId !== undefined && n.parentId === opts.parentId) return hit;
    best ??= hit;
  }
  return best;
}

/** Drop SYNTHETIC source boxes (`port:` / `logic:` ids — the behavioural fan-in symbols) that no
 *  longer have a single edge. Re-tracing a block rebuilds its pins and therefore its wires; the
 *  boxes the previous trace had created were never removed, so a superseded source kept floating
 *  on the canvas as an orphan. That is what showed `nodiv_mclk` as a green PORT symbol long after
 *  the analysis had correctly re-resolved it to the `assign` block that drives it.
 *  Real instances are never touched — the user placed those deliberately. Pure. */
export function pruneOrphanSources(g: SchematicGraph): SchematicGraph {
  const wired = new Set<string>();
  for (const e of g.edges) { wired.add(e.fromNode); wired.add(e.toNode); }
  const doomed = Object.values(g.nodes).filter(
    (n) => n.id !== g.seedId && !wired.has(n.id) &&
           (n.id.startsWith("port:") || n.id.startsWith("logic:")));
  if (doomed.length === 0) return g;
  const gone = new Set(doomed.map((n) => n.id));
  const nodes: Record<string, SchNode> = {};
  for (const [id, n] of Object.entries(g.nodes)) if (!gone.has(id)) nodes[id] = n;
  const strip = (m: Record<string, string[]>): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const [id, ps] of Object.entries(m)) if (!gone.has(id)) out[id] = ps;
    return out;
  };
  return { ...g, nodes,
           expanded: strip(g.expanded), empty: strip(g.empty),
           inExpanded: strip(g.inExpanded), inEmpty: strip(g.inEmpty) };
}

/** Auto-wire filter: keep only edges whose BOTH endpoints already sit on the graph. Adding
 *  an instance draws just its direct links to instances already shown — never pulls in the
 *  foreign neighbors a raw trace would surface. */
export function keepInternalEdges(existingIds: ReadonlySet<string>, edges: SchEdge[]): SchEdge[] {
  return edges.filter((e) => existingIds.has(e.fromNode) && existingIds.has(e.toNode));
}
