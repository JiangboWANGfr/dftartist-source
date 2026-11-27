// Clock structure as the familiar CTS-style schematic:
//
//   ▷ root ── CGC ── DIV-4 ─┬─ MUX ── CGC ──▶ (sink ×N)
//                           └─ DIV-8 ── CGC ──▶ (sink ×N)
//
// Deliberately NO module containers: nesting every instance produced hundreds of boxes and
// buried the thing you actually look for. The clock path is the subject; each leaf is one
// aggregated sink carrying the real register count, and each cell carries the condition that
// opens it (cg_en / mux select), because that is what decides where an OCC can go.

import { useMemo, useState } from "react";
import type { CrPathItem } from "../core-bridge/model.ts";
import { useCanvasView } from "./core/useCanvasView.ts";

/** Selected object per view id — module level so it outlives unmount. */
const selByView = new Map<string, string>();

interface DNode {
  key: string;
  kind: "root" | "cell" | "sink";
  /** What the node physically IS:
   *  ""      — a library cell instance (a real component in the code)
   *  "alias" — `assign a = b` / `wire a = b`: the SAME wire under another name → drawn as a
   *            net waypoint dot, never as a component box
   *  "gate"  — RTL `clk & en`: real gating logic (synthesizes to an ICG) → AND-gate symbol
   *  "inv"   — RTL `~clk`: real logic → inverter symbol */
  rtl: "" | "alias" | "gate" | "inv";
  role: string;          // icg | div | mux | buf | inv  (cells)
  label: string;         // CGC / DIV / MUX / the root net name
  sub: string;           // instance leaf name (cells) or "" (root)
  cond: string;          // cg_en=1 / sel=1 — what opens this stage
  flops: number;         // registers downstream of this node
  bad: number;
  value: string;
  clockName: string;
  target: string;        // hierarchical path -> the OCC target
  children: DNode[];
  item?: CrPathItem;
  x: number; y: number;
}

const COL = 150, ROW = 46, PAD = 40;
const CELL_W = 66, CELL_H = 30;

const roleLabel = (role: string): string =>
  role === "icg" ? "CGC" : role === "div" ? "DIV" : role === "mux" ? "MUX"
  : role === "inv" ? "INV" : role === "buf" ? "BUF" : role.toUpperCase();

const isOk = (v: string) => v === "010" || v === "101";
const wireColor = (v: string) => (isOk(v) ? "#5ad17f" : v === "0" || v === "1" ? "#d29922" : "#f85149");

function build(items: CrPathItem[], isBad: (i: CrPathItem) => boolean): DNode[] {
  const roots: DNode[] = [];
  const mk = (key: string, kind: DNode["kind"]): DNode =>
    ({ key, kind, rtl: "", role: "", label: "", sub: "", cond: "", flops: 0, bad: 0, value: "X",
       clockName: "", target: "", children: [], x: 0, y: 0 });

  for (const it of items) {
    const steps: Array<Partial<DNode> & { key: string; kind: DNode["kind"] }> = [];
    // The ROOT is the SDC clock definition (create_clock / create_generated_clock) the path
    // walks back to — NOT whatever module port the walk happened to stop on. Every module has
    // a clock port; treating each as a root produced hundreds of bogus trees. Paths that never
    // reach a definition are collected under one "unconstrained" root: that is a DRC finding,
    // not a clock source.
    const rootKey = it.clockName ? "clk:" + it.clockName : "unconstrained";
    steps.push({ key: rootKey, kind: "root",
                 label: it.clockName || "no create_clock reached",
                 target: it.clockName ? (it.detail || it.net) : "" });
    for (const raw of [...it.elems].reverse()) {
      const e = raw.split("|")[0];   // strip the structured |net=..|in=..|out=..|mod=.. tail
      const at = e.indexOf("@");
      const role = e.slice(0, at);
      // xup/xdn are boundary-crossing records for the exact-circuit schematic view; the
      // abstract tree already shows hierarchy as bands, so they are not extra symbols here.
      if (role === "xup" || role === "xdn") continue;
      const rest = e.slice(at + 1);
      const hash = rest.indexOf("#");
      const inst = hash < 0 ? rest : rest.slice(0, hash);
      // "inst:net" = an RTL construct (assign alias / RTL clock gate) — REAL in the source, but
      // NOT a buffer cell instance. Label it honestly with the net name + what it is, so it can
      // never be mistaken for an already-placed library buffer. Only cell-library hits
      // (no ':' — a real instance path) get the BUF/INV/ICG cell labels.
      const colon = inst.indexOf(":");
      const isRtl = colon >= 0;
      const netName = isRtl ? inst.slice(colon + 1) : "";
      steps.push({
        key: inst, kind: "cell",
        rtl: !isRtl ? "" : role === "icg" ? "gate" : role === "inv" ? "inv" : "alias",
        role,
        label: isRtl ? netName : roleLabel(role),
        sub: isRtl ? "" : (inst.split(".").pop() ?? inst),
        cond: hash < 0 ? "" : rest.slice(hash + 1),
        target: inst,
      });
    }
    let level = roots, key = "";
    let node: DNode | undefined;
    for (const s of steps) {
      key = key ? key + "|" + s.key : s.key;
      let n = level.find((c) => c.key === key);
      if (!n) { n = mk(key, s.kind); Object.assign(n, s, { key, children: n?.children ?? [] }); n.children = []; level.push(n); }
      n.flops += it.flopCount;
      if (isBad(it)) n.bad += it.flopCount;
      n.value = it.value;
      if (it.clockName) n.clockName = it.clockName;
      n.item = it;
      node = n;
      level = n.children;
    }
    if (!node) continue;
    // one aggregated SINK per branch end (all flop groups merged, like the K1..K6 clouds)
    const sk = key + "|<sink>";
    let sink = node.children.find((c) => c.key === sk);
    if (!sink) { sink = mk(sk, "sink"); sink.label = "sinks"; node.children.push(sink); }
    sink.flops += it.flopCount;
    if (isBad(it)) sink.bad += it.flopCount;
    sink.value = it.value;
    sink.target = `${it.owner}.${it.net}`;
    sink.item = it;
  }
  // Sort SIBLINGS by their owning instance first (so cells living in the same slang scope sit
  // on adjacent rows and can be framed as one hierarchy group), coverage second.
  const sort = (ns: DNode[]) => {
    ns.sort((a, b) => {
      const sa = scopeOfNode(a), sb = scopeOfNode(b);
      if (sa !== sb) return sa.localeCompare(sb);
      return b.flops - a.flops;
    });
    ns.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** Owning instance of a node = the slang scope its net/cell lives in.
 *  Cell targets look like "a.b.c:net" (RTL gate) or "a.b.c" (library cell instance). */
function scopeOfNode(n: DNode): string {
  if (n.kind !== "cell" && n.kind !== "sink") return "";
  const t = n.target;
  const colon = t.indexOf(":");
  if (colon > 0) return t.slice(0, colon);
  const dot = t.lastIndexOf(".");
  return dot > 0 ? t.slice(0, dot) : t;
}

function layoutTree(roots: DNode[]): { w: number; h: number } {
  let row = 0, maxD = 0;
  const place = (n: DNode, d: number) => {
    maxD = Math.max(maxD, d);
    n.x = PAD + d * COL;
    if (!n.children.length) { n.y = PAD + row * ROW; row++; return; }
    n.children.forEach((c) => place(c, d + 1));
    n.y = (n.children[0].y + n.children[n.children.length - 1].y) / 2;
  };
  roots.forEach((r) => place(r, 0));
  return { w: PAD * 2 + (maxD + 1) * COL + 90, h: PAD * 2 + row * ROW };
}

/** Split a walk target into the real design objects it names.
 *  "a.b.c:net" -> instance "a.b.c", net "net"   (an RTL alias / gate on that net)
 *  "a.b.c"     -> instance "a.b.c", net ""      (a library cell instance) */
function splitTarget(t: string): { inst: string; net: string } {
  const c = t.indexOf(":");
  return c < 0 ? { inst: t, net: "" } : { inst: t.slice(0, c), net: t.slice(c + 1) };
}

export function ClockDiagram({ items, strip, onOcc, occPoints = [], onSchematic }: {
  items: CrPathItem[];
  strip: (s: string) => string;
  onOcc?: (target: string, i: CrPathItem) => void;
  occPoints?: string[];   // already-defined OCC targets (normalized, '.'-separated)
  /** Open the REAL schematic (actual instances/ports/nets) at this point. */
  onSchematic?: (instanceId: string, net: string) => void;
}) {
  const isBad = (i: CrPathItem) => (i.kind === "reset" ? !i.ok : !isOk(i.value));
  const [minFlops, setMinFlops] = useState(0);
  // Right-click menu: OCC points are USER-defined — the menu offers copy + add, nothing is
  // ever auto-suggested.
  const [menu, setMenu] = useState<{ x: number; y: number; target: string; item?: CrPathItem } | null>(null);
  const selKey = `cdiag:${items[0]?.kind ?? ""}`;
  // Highlight survives view/tab switches (the component is unmounted by both).
  const [sel, setSelState] = useState(() => selByView.get(selKey) ?? "");
  const setSel = (t: string) => { selByView.set(selKey, t); setSelState(t); };   // selected object (highlighted; Ctrl+C copies it)
  // Ctrl+wheel zoom + drag-to-pan, shared with the topology view. Hooks MUST all run before
  // the early return below (Rules of Hooks — declaring them further down blanked the window).
  const view = useCanvasView(`cdiag:${items[0]?.kind ?? ""}`);
  const { zoom } = view;
  const { roots, size } = useMemo(() => {
    const r = build(items.filter((i) => i.flopCount >= minFlops), isBad);
    return { roots: r, size: layoutTree(r) };
  }, [items, minFlops]);

  if (items.length === 0) return <div className="muted pad">no clock structure</div>;

  const hasOcc = (t: string) => occPoints.includes(t);
  // Two renderings of the same target. Every separator (module dots AND the inst:net colon)
  // becomes '/', because that is the one form both dp_shell and the SDC world accept.
  //   fullPath -> processor_core/PROCESSOR_1/clock_module_0/mclk   (what we COPY / send to the shell)
  //   pinPath  -> PROCESSOR_1/clock_module_0/mclk                  (what we DISPLAY, top stripped)
  // MUST be declared before walk() below runs (walk uses pinPath while rendering).
  const fullPath = (t: string) => t.replace(/[.:]/g, "/");
  const pinPath = (t: string) => strip(t).replace(/[.:]/g, "/");
  /** Two OCCs on one branch CASCADE — the downstream one re-gates an already-controlled clock.
   *  Warn with the offending ancestor/descendant rather than silently creating the problem. */
  const cascadeWith = (n: DNode): string => {
    // ancestor already carries an OCC?
    for (const a of ancestorsOf(n)) if (hasOcc(a.target)) return a.target;
    // descendant already carries one?
    const stack = [...n.children];
    while (stack.length) {
      const c = stack.pop()!;
      if (hasOcc(c.target)) return c.target;
      stack.push(...c.children);
    }
    return "";
  };
  const parentOf = new Map<string, DNode>();
  const linkParents = (n: DNode) => n.children.forEach((c) => { parentOf.set(c.key, n); linkParents(c); });
  roots.forEach(linkParents);
  function ancestorsOf(n: DNode): DNode[] {
    const out: DNode[] = [];
    let p = parentOf.get(n.key);
    while (p) { out.push(p); p = parentOf.get(p.key); }
    return out;
  }
  const tryOcc = (n: DNode) => {
    if (!n.item || !onOcc) return;
    if (hasOcc(n.target)) return;                     // already defined here
    const clash = cascadeWith(n);
    if (clash && !window.confirm(
      `${strip(n.target)}\n\nAn OCC is already defined on the SAME clock branch:\n  ${strip(clash)}\n\n` +
      `Two OCCs on one branch cascade (the downstream one re-gates an already-controlled clock).\nAdd anyway?`))
      return;
    onOcc(n.target, n.item);
  };

  /** Half-width of each node's visual, so wires dock at the symbol edge. */
  const halfW = (n: DNode): number =>
    n.kind === "root" ? 26 : n.kind === "sink" ? 20
    : n.rtl === "alias" ? 6 : n.rtl === "inv" ? 16 : n.rtl === "gate" ? 24 : CELL_W / 2;

  const wires: React.ReactNode[] = [], boxes: React.ReactNode[] = [];
  // Hierarchy frames: bounding box per owning slang instance over its CELL nodes. Same-scope
  // siblings are adjacent (see sort), so each frame is one clean dashed box with the instance
  // path as its label — the buffers now read as "inside frontend_0", "inside register_file_0"…
  const bands = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  const noteBand = (n: DNode) => {
    const s = scopeOfNode(n);
    if (!s || n.kind !== "cell") return;
    const b = bands.get(s);
    const x0 = n.x - CELL_W / 2 - 6, y0 = n.y - CELL_H / 2 - 6;
    const x1 = n.x + CELL_W / 2 + 6, y1 = n.y + CELL_H / 2 + 12;
    if (!b) bands.set(s, { x0, y0, x1, y1 });
    else {
      b.x0 = Math.min(b.x0, x0); b.y0 = Math.min(b.y0, y0);
      b.x1 = Math.max(b.x1, x1); b.y1 = Math.max(b.y1, y1);
    }
  };
  const walk = (n: DNode) => {
    noteBand(n);
    for (const c of n.children) {
      const x0 = n.x + halfW(n);
      const x1 = c.x - halfW(c);
      const mid = x0 + (x1 - x0) * 0.5;
      wires.push(
        <path key={"w" + c.key} d={`M ${x0} ${n.y} H ${mid} V ${c.y} H ${x1}`}
              fill="none" stroke={wireColor(c.value)} strokeWidth={1.5} />,
      );
      // arrow head into the child
      wires.push(<path key={"a" + c.key} d={`M ${x1 - 6} ${c.y - 4} L ${x1} ${c.y} L ${x1 - 6} ${c.y + 4} Z`}
                       fill={wireColor(c.value)} />);
      walk(c);
    }
    if (n.kind === "root") {
      boxes.push(
        <g key={n.key} className="topo-n">
          <polygon points={`${n.x - 20},${n.y - 18} ${n.x + 24},${n.y} ${n.x - 20},${n.y + 18}`}
                   fill="#e3b45c" stroke="#a8823a" strokeWidth={1.2} />
          <text x={n.x - 22} y={n.y - 24} fontSize={11} fontWeight={700} fill="#dfe4ea" textAnchor="start">{n.label}</text>
          <text x={n.x - 22} y={n.y + 32} fontSize={8.5} fill="#8b95a3">{n.clockName || "unconstrained"}</text>
          <title>{strip(n.target)}</title>
        </g>,
      );
    } else if (n.kind === "cell" && n.rtl === "alias") {
      // `assign a = b` — the SAME wire under a new name. Drawn as a net waypoint dot with the
      // net name, NEVER as a component box: there is no buffer here to mistake.
      const col2 = wireColor(n.value);
      boxes.push(
        <g key={n.key} className={"topo-n" + (sel && sel === n.target ? " sel" : "")}
           onClick={(e) => { e.stopPropagation(); setSel(n.target); }}
           onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSel(n.target);
                                   setMenu({ x: e.clientX, y: e.clientY, target: n.target, item: n.item }); }}>
          <circle cx={n.x} cy={n.y} r={4} fill={col2} />
          <circle cx={n.x} cy={n.y} r={7.5} fill="transparent" />
          <text x={n.x} y={n.y - 8} textAnchor="middle" fontSize={8.5} fill="#9fb2c8">{n.label}</text>
          <title>{`net alias (assign): ${pinPath(n.target)}\nsame wire, renamed — no physical cell here\nright-click: copy hierarchical pin`}</title>
        </g>,
      );
    } else if (n.kind === "cell" && (n.rtl === "gate" || n.rtl === "inv")) {
      // Real RTL LOGIC on the clock path (synthesizes to an ICG / inverter) — drawn as the
      // logic symbol, not a library-cell box.
      const col2 = wireColor(n.value);
      const en = n.cond.startsWith("en=") ? n.cond.slice(3) : n.cond;
      boxes.push(
        <g key={n.key} className={"topo-n" + (sel && sel === n.target ? " sel" : "")}
           onClick={(e) => { e.stopPropagation(); setSel(n.target); }}
           onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSel(n.target);
                                   setMenu({ x: e.clientX, y: e.clientY, target: n.target, item: n.item }); }}>
          {n.rtl === "gate" ? (
            <>
              {/* AND-gate: flat back + round nose; the enable enters from below */}
              <path d={`M ${n.x - 20} ${n.y - 12} H ${n.x + 6} A 12 12 0 0 1 ${n.x + 6} ${n.y + 12} H ${n.x - 20} Z`}
                    fill="#182030" stroke={col2} strokeWidth={1.5} />
              {en && (
                <>
                  <line x1={n.x - 6} y1={n.y + 12} x2={n.x - 6} y2={n.y + 22} stroke="#7ee787" strokeWidth={1} />
                  <text x={n.x - 6} y={n.y + 31} textAnchor="middle" fontSize={8} fill="#7ee787">{en}</text>
                </>
              )}
            </>
          ) : (
            <>
              <polygon points={`${n.x - 14},${n.y - 11} ${n.x + 10},${n.y} ${n.x - 14},${n.y + 11}`}
                       fill="#182030" stroke={col2} strokeWidth={1.5} />
              <circle cx={n.x + 13.5} cy={n.y} r={3.5} fill="#182030" stroke={col2} strokeWidth={1.5} />
            </>
          )}
          {hasOcc(n.target) && (<rect x={n.x - 26} y={n.y - 20} width={52} height={40} rx={4}
                                      fill="none" stroke="#4fa3ff" strokeWidth={2} />)}
          <text x={n.x - 4} y={n.y - 16} textAnchor="middle" fontSize={8.5} fill="#9fb2c8">{n.label}</text>
          <text x={n.x + halfW(n) + 4} y={n.y + 20} fontSize={8} fill="#d0872b">{n.flops}</text>
          <title>{`${n.rtl === "gate" ? "RTL clock-gate (clk & en)" : "RTL inverter (~clk)"}: ${pinPath(n.target)}\ncovers ${n.flops} register(s)\nright-click: copy hierarchical pin / add OCC definition point`}</title>
        </g>,
      );
    } else if (n.kind === "cell") {
      // A LIBRARY CELL instance — the only thing that earns a component box, because it really
      // exists in the code. Path tail-ellipsized; full path in tooltip / right-click copy.
      const path = pinPath(n.target);
      const shown = path.length > 26 ? "…" + path.slice(-25) : path;
      boxes.push(
        <g key={n.key} className={"topo-n" + (sel && sel === n.target ? " sel" : "")}
           onClick={(e) => { e.stopPropagation(); setSel(n.target); }}
           onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSel(n.target);
                                   setMenu({ x: e.clientX, y: e.clientY, target: n.target, item: n.item }); }}>
          {n.cond && <text x={n.x} y={n.y - CELL_H / 2 - 12} fontSize={8.5} fill="#7ee787" textAnchor="middle">{n.cond}</text>}
          {n.cond && <line x1={n.x} y1={n.y - CELL_H / 2 - 9} x2={n.x} y2={n.y - CELL_H / 2}
                           stroke="#7ee787" strokeWidth={1} />}
          <rect x={n.x - CELL_W / 2} y={n.y - CELL_H / 2} width={CELL_W} height={CELL_H} rx={2}
                fill="#182030" stroke={wireColor(n.value)} strokeWidth={1.6} />
          {hasOcc(n.target) && (<rect x={n.x - CELL_W / 2 - 4} y={n.y - CELL_H / 2 - 4} width={CELL_W + 8} height={CELL_H + 8} rx={4} fill="none" stroke="#4fa3ff" strokeWidth={2} />)}
          {hasOcc(n.target) && (<text x={n.x - CELL_W / 2 - 6} y={n.y - CELL_H / 2 - 8} fontSize={8} fill="#4fa3ff">OCC</text>)}
          <text x={n.x} y={n.y + 1} textAnchor="middle" fontSize={12} fontWeight={700} fill="#e8eef6">{n.label}</text>
          <text x={n.x} y={n.y + 11} textAnchor="middle" fontSize={7} fill="#8b95a3">{shown}</text>
          <text x={n.x + CELL_W / 2 + 4} y={n.y + CELL_H / 2 + 9} fontSize={8} fill="#d0872b">{n.flops}</text>
          <title>{`${n.label}  ${path}\ncovers ${n.flops} register(s)${n.bad ? `, ${n.bad} without a clock` : ""}\nright-click: copy hierarchical pin / add OCC definition point`}</title>
        </g>,
      );
    } else {
      // sink cloud
      const cx = n.x + 16;
      boxes.push(
        <g key={n.key} className={"topo-n" + (sel && sel === n.target ? " sel" : "")}
           onClick={(e) => { e.stopPropagation(); setSel(n.target); }}
           onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSel(n.target);
                                   setMenu({ x: e.clientX, y: e.clientY, target: n.target, item: n.item }); }}>
          <path d={`M ${cx - 22} ${n.y + 6}
                    a 9 9 0 0 1 1 -15 a 11 11 0 0 1 19 -7 a 10 10 0 0 1 17 6
                    a 9 9 0 0 1 1 16 Z`}
                fill="#12202c" stroke={n.bad ? "#f85149" : "#5f7f9a"} strokeWidth={1.3} />
          <text x={cx + 8} y={n.y + 2} textAnchor="middle" fontSize={10} fontWeight={700}
                fill={n.bad ? "#ff9b95" : "#cfe3f2"}>{n.flops}</text>
          <title>{`${n.flops} register(s)${n.bad ? ` — ${n.bad} have no usable clock` : ""}\n${strip(n.target).replace(/\./g, "/")}`}</title>
        </g>,
      );
    }
  };
  roots.forEach(walk);

  // Copy the FULL path (top included), NOT the stripped one shown in the diagram.
  // Verified against the real design: dp_shell's get_nets/get_pins resolve
  //   processor_core/PROCESSOR_1/clock_module_0/mclk   -> hit
  //   PROCESSOR_1/clock_module_0/mclk                  -> nothing
  // and add_to_occ_def_point already sends the full form, so stripping here meant the copied
  // string could not be pasted back into the shell.
  const copyPin = (t: string) => {
    void navigator.clipboard?.writeText(fullPath(t));
  };

  return (
    <div className="cdwrap" onClick={() => { setMenu(null); setSel(""); }}>
      <div className="occhead">
        <span>{roots.length} clock root(s)</span>
        <span className="muted">right-click a cell: copy hierarchical pin / add OCC point · Ctrl+wheel: zoom</span>
        <span className="muted">{Math.round(zoom * 100)}%</span>
        <label className="crchk" style={{ marginLeft: "auto" }}>
          min flops
          <input type="number" min={0} value={minFlops} className="findinput" style={{ width: 70 }}
                 onChange={(e) => setMinFlops(Math.max(0, Number(e.target.value) || 0))} />
        </label>
      </div>
      <div className="cdscroll" {...view.bind}>
        <svg width={size.w * zoom} height={size.h * zoom}
             viewBox={`0 0 ${size.w} ${size.h}`}>
          {[...bands.entries()].map(([scope, b]) => (
            <g key={"band:" + scope}>
              <rect x={b.x0} y={b.y0 - 10} width={b.x1 - b.x0} height={b.y1 - b.y0 + 10}
                    rx={5} fill="rgba(120,150,190,.045)" stroke="#43506a" strokeWidth={1}
                    strokeDasharray="5 3" />
              <text x={b.x0 + 3} y={b.y0 - 14} fontSize={8.5} fill="#7f95b5">
                {strip(scope).replace(/\./g, "/")}
              </text>
            </g>
          ))}
          {wires}{boxes}
        </svg>
      </div>
      {menu && (
        <div className="cmenu" style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 50 }}
             onClick={(e) => e.stopPropagation()}>
          {(() => {
            const { inst, net } = splitTarget(menu.target);
            return (<>
              <div className="cmi" title={`copies ${fullPath(menu.target)} — resolves with get_nets in dp_shell`}
                   onClick={() => { copyPin(menu.target); setMenu(null); }}>
                Copy Hierarchical {net ? "Net" : "Instance"} Path
                &nbsp;<span className="muted">{pinPath(menu.target)}</span>
              </div>
              {net && (
                <div className="cmi" title={`copies ${fullPath(inst)}`}
                     onClick={() => { void navigator.clipboard.writeText(fullPath(inst)); setMenu(null); }}>
                  Copy Owning Instance &nbsp;<span className="muted">{pinPath(inst)}</span>
                </div>
              )}
              {onSchematic && (
                <div className="cmi" title="open the real schematic (actual instances, ports and nets) here"
                     onClick={() => { setMenu(null); onSchematic(inst, net); }}>
                  Show in Schematic (real design)
                </div>
              )}
            </>);
          })()}
          {menu.item && onOcc && (
            <div className="cmi" onClick={() => {
              const n = { target: menu.target, item: menu.item, children: [] } as unknown as DNode;
              setMenu(null);
              // reuse the cascade warning path
              const clash = cascadeWith(n);
              if (clash && !window.confirm(
                `An OCC is already defined on the SAME clock branch:\n  ${strip(clash)}\n\nAdd anyway?`)) return;
              onOcc(menu.target, menu.item!);
            }}>add_occ_point</div>
          )}
        </div>
      )}
    </div>
  );
}
