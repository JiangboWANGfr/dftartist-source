// Clock / reset TOPOLOGY: all paths merged into one tree by shared prefix.
//
// The backend returns each flop-group's walk as `path` = ["inst:net", ...] ordered flop→source.
// Reversing it gives source→flop, so paths that share a driver share a prefix — inserting them
// into a trie reconstructs the actual clock tree: one root per source, branching where the net
// fans out, leaves = aggregated flop groups (NOT one row per register).

import { useMemo, useState } from "react";
import type { CrPathItem } from "../core-bridge/model.ts";
import { displayElems } from "./core/crSchematic.ts";
import { useCanvasView } from "./core/useCanvasView.ts";

/** Selected object per view id — module level so it outlives unmount. */
const selByView = new Map<string, string>();

interface TNode {
  key: string;              // full prefix (unique)
  hop: string;              // "inst:net", or "<role>@<instance>" for a cell stage
  cell?: string;            // set when this node IS a clock cell (icg/buf/inv/mux/…)
  isFlopLeaf?: boolean;     // the aggregated "DFF xN" terminal
  groups?: number;          // how many flop groups were merged into it
  children: TNode[];
  leaf?: CrPathItem;        // set when a path terminates here
  flops: number;            // total flops in this subtree
  bad: number;              // violating flop groups in this subtree
  value: string;            // propagated value on this net (from any path through it)
  // layout
  x: number; y: number;
}

const ROW = 30;      // vertical pitch per leaf
const COL = 190;     // horizontal pitch per hierarchy hop
const PAD = 26;

function valueColor(v: string): string {
  if (v === "010" || v === "101") return "#3fb950";
  if (v === "0" || v === "1") return "#d29922";
  return "#f85149";
}

/** Build the merged topology from a set of paths. */
function buildTree(items: CrPathItem[], isBad: (i: CrPathItem) => boolean): TNode[] {
  const roots: TNode[] = [];
  const mk = (key: string, hop: string): TNode =>
    ({ key, hop, children: [], flops: 0, bad: 0, value: "X", x: 0, y: 0 });

  for (const it of items) {
    // The clock STRUCTURE is: source -> the cells the clock passes through -> the flops.
    // Intermediate net hops are just hierarchy plumbing; including them explodes the tree into
    // one leaf per module. So the spine is [source] + [cells], and every flop group that ends
    // on the same spine is aggregated into ONE `DFF xN` leaf (per the requested rendering).
    // `path` and `elems` are both flop->source, so reverse to get source->flop.
    const netHops = [...it.path].reverse();
    const cells = displayElems(it.elems).reverse();   // "icg@top.u_icg1#TE=1" | "buf@top:clk_buf1"
    const seq: Array<{ hop: string; cell?: string }> = [];
    if (netHops.length) seq.push({ hop: netHops[0] });        // the clock source
    for (const c of cells) seq.push({ hop: c, cell: c });     // each stage cell

    let level = roots;
    let prefix = "";
    let node: TNode | undefined;
    for (const s of seq) {
      prefix = prefix ? prefix + "|" + s.hop : s.hop;
      let n = level.find((c) => c.key === prefix);
      if (!n) { n = mk(prefix, s.hop); n.cell = s.cell; level.push(n); }
      n.flops += it.flopCount;
      if (isBad(it)) n.bad += it.flopCount;
      node = n;
      level = n.children;
    }
    if (!node) continue;
    // Aggregate every flop group reaching this spine end into a single leaf.
    const leafKey = prefix + "|<flops>";
    let leaf = node.children.find((c) => c.key === leafKey);
    if (!leaf) {
      leaf = mk(leafKey, "<flops>");
      leaf.isFlopLeaf = true;
      leaf.value = it.value;
      node.children.push(leaf);
    }
    leaf.flops += it.flopCount;
    if (isBad(it)) leaf.bad += it.flopCount;
    leaf.groups = (leaf.groups ?? 0) + 1;
    // keep the worst value for the aggregate (X beats a good clock, so violations stay visible)
    if (it.value === "X" || leaf.value === "X") leaf.value = it.value === "X" ? "X" : leaf.value;
    leaf.leaf = it;
  }
  // propagate a representative value down from each leaf to its ancestors: a net that feeds a
  // 010 leaf carries a clock; only mark a branch red when nothing good flows through it.
  const fill = (n: TNode): string => {
    if (n.children.length === 0) return n.value;
    const vs = n.children.map(fill);
    n.value = vs.find((v) => v === "010" || v === "101") ?? vs.find((v) => v === "0" || v === "1") ?? vs[0] ?? "X";
    return n.value;
  };
  roots.forEach(fill);
  return roots;
}

/** Tidy-tree layout: each leaf gets its own row, a parent centres on its children. */
function layout(roots: TNode[]): { w: number; h: number } {
  let row = 0;
  let maxDepth = 0;
  const place = (n: TNode, depth: number): void => {
    maxDepth = Math.max(maxDepth, depth);
    n.x = PAD + depth * COL;
    if (n.children.length === 0) { n.y = PAD + row * ROW; row++; return; }
    for (const c of n.children) place(c, depth + 1);
    n.y = (n.children[0].y + n.children[n.children.length - 1].y) / 2;
  };
  roots.forEach((r) => place(r, 0));
  return { w: PAD * 2 + (maxDepth + 1) * COL, h: PAD * 2 + row * ROW };
}

export function ClockTopology({ items, strip, onPick, kind, onOcc, occPoints = [] }: {
  items: CrPathItem[];
  strip: (s: string) => string;
  kind: "clock" | "reset";
  onPick?: (item: CrPathItem) => void;
  /** Right-click → add_occ_point on this hierarchical object (USER-decided, never suggested). */
  onOcc?: (target: string, item?: CrPathItem) => void;
  occPoints?: string[];
}) {
  const isBad = (i: CrPathItem) =>
    i.kind === "reset" ? !i.ok : i.value !== "010" && i.value !== "101";

  // Selection + right-click, same contract as the diagram view: every node names a REAL
  // object (instance / net / cell pin), so copy yields a path dp_shell resolves.
  const selKey = `ctopo:${items[0]?.kind ?? ""}`;
  // Highlight survives view/tab switches (the component is unmounted by both).
  const [sel, setSelState] = useState(() => selByView.get(selKey) ?? "");
  const setSel = (t: string) => { selByView.set(selKey, t); setSelState(t); };
  const [menu, setMenu] = useState<{ x: number; y: number; target: string; item?: CrPathItem } | null>(null);
  const view = useCanvasView(`ctopo:${items[0]?.kind ?? ""}`);
  const { zoom } = view;

  const { roots, size } = useMemo(() => {
    const r = buildTree(items, isBad);
    return { roots: r, size: layout(r) };
  }, [items]);

  if (items.length === 0) return <div className="muted pad">no {kind} paths</div>;

  // Full path (top included) is what dp_shell / SDC accept; the label keeps the top stripped.
  const fullPath = (t: string) => t.replace(/[.:]/g, "/");
  const dispPath = (t: string) => strip(t).replace(/[.:]/g, "/");
  const pick = (target: string, item?: CrPathItem) => ({
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); setSel(target); if (item) onPick?.(item); },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      setSel(target);
      setMenu({ x: e.clientX, y: e.clientY, target, item });
    },
  });

  const edges: React.ReactNode[] = [];
  const nodes: React.ReactNode[] = [];
  // Hierarchy bands: every node belongs to an owning INSTANCE. Grouping the nodes by that
  // instance and drawing a labelled frame behind them shows the clock tree the way the design
  // is actually built (this is what the PRE_ICG / PRE_DIV / CLK_CORE bands are in practice).
  const bands = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  const noteBand = (scope: string, x: number, y: number, w: number, h: number) => {
    if (!scope) return;
    const b = bands.get(scope);
    const nx0 = x, ny0 = y, nx1 = x + w, ny1 = y + h;
    if (!b) bands.set(scope, { x0: nx0, y0: ny0, x1: nx1, y1: ny1 });
    else {
      b.x0 = Math.min(b.x0, nx0); b.y0 = Math.min(b.y0, ny0);
      b.x1 = Math.max(b.x1, nx1); b.y1 = Math.max(b.y1, ny1);
    }
  };
  /** Owning instance of a node: a cell lives in its instance's PARENT scope; a net hop's
   *  scope is the instance the net is declared in. */
  const scopeOf = (n: TNode): string => {
    if (n.isFlopLeaf) return "";
    if (n.cell) {
      const inst = n.hop.slice(n.hop.indexOf("@") + 1).split("#")[0];
      const dot = inst.lastIndexOf(".");
      return dot > 0 ? inst.slice(0, dot) : inst;
    }
    const colon = n.hop.indexOf(":");
    return colon > 0 ? n.hop.slice(0, colon) : "";
  };

  const walk = (n: TNode): void => {
    const col = valueColor(n.value);
    for (const c of n.children) {
      // orthogonal elbow: out of the parent, down/up, into the child
      const midX = n.x + COL * 0.55;
      edges.push(
        <path key={"e" + c.key}
              d={`M ${n.x + 8} ${n.y} H ${midX} V ${c.y} H ${c.x - 8}`}
              fill="none" stroke={valueColor(c.value)} strokeWidth={1.5} />,
      );
      walk(c);
    }
    const isLeaf = n.children.length === 0;
    // A cell stage is "<role>@<instance>"; a net hop is "<instance>:<net>".
    const isCell = !!n.cell;
    const role = isCell ? n.hop.slice(0, n.hop.indexOf("@")) : "";
    const cellInst = isCell ? n.hop.slice(n.hop.indexOf("@") + 1) : "";
    const [inst, net] = isCell ? [cellInst, role] : n.hop.split(":");
    const label = net ?? n.hop;
    noteBand(scopeOf(n), n.x - 26, n.y - 18, 72, 36);
    if (isCell) {
      // draw the clock cell as a labelled box — this is the ICG / DIV / MUX stage
      const W = 46, Hh = 20;
      nodes.push(
        <g key={n.key} className={"topo-n" + (sel === cellInst ? " sel" : "")} {...pick(cellInst, n.leaf)}>
          <rect x={n.x - W / 2} y={n.y - Hh / 2} width={W} height={Hh} rx={4}
                fill="#3a3416" stroke={occPoints.includes(cellInst) ? "#5ad17f" : col}
                strokeWidth={occPoints.includes(cellInst) ? 2.4 : 1.4} />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#e3b45c">
            {role.toUpperCase()}
          </text>
          <text x={n.x} y={n.y - 14} textAnchor="middle" fontSize={8.5} fill="#8b95a3">
            {strip(cellInst).split(".").pop()}
          </text>
          <title>{`${role} cell: ${strip(cellInst)}\nvalue=${n.value}  flops=${n.flops}\nright-click: copy path / add_occ_point`}</title>
        </g>,
      );
      return;
    }
    // A net hop names a REAL hierarchical net ("<instance>:<net>"); a leaf names the flop
    // group's clock/reset pin. Either way the target is a genuine design object.
    const nodeTarget = isLeaf && n.leaf ? `${n.leaf.owner}:${n.leaf.net}` : n.hop;
    nodes.push(
      <g key={n.key} className={"topo-n" + (sel === nodeTarget ? " sel" : "")} {...pick(nodeTarget, n.leaf)}>
        {isLeaf ? (
          // ONE flip-flop symbol + the flop count for everything this branch drives —
          // the structure view is about the clock path, not an enumeration of registers.
          <>
            <rect x={n.x - 6} y={n.y - 12} width={34} height={24} rx={2}
                  fill="#20262e" stroke={n.bad ? "#f85149" : "#93a7bf"} strokeWidth={n.bad ? 2 : 1.3} />
            {/* clock wedge on the left edge = it IS a flop */}
            <polyline points={`${n.x - 6},${n.y + 1} ${n.x + 1},${n.y + 6} ${n.x - 6},${n.y + 11}`}
                      fill="none" stroke="#93a7bf" strokeWidth={1.2} />
            <text x={n.x + 11} y={n.y - 1} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#c6d2e0">
              {kind === "clock" ? "DFF" : "DFF"}
            </text>
            {kind === "reset" && (
              <text x={n.x + 11} y={n.y + 9} textAnchor="middle" fontSize={7} fill="#8b95a3">R</text>
            )}
            <text x={n.x + 34} y={n.y + 4} fontSize={11} fontWeight={700} fill="#dfe4ea">
              &nbsp;×{n.flops}
            </text>
            <text x={n.x + 34} y={n.y - 9} fontSize={8.5} fill={col}>
              &nbsp;{n.value}{n.bad ? `  ⚠${n.bad}` : ""}
            </text>
          </>
        ) : (
          <circle cx={n.x} cy={n.y} r={5} fill="#20262e" stroke={col} strokeWidth={1.8} />
        )}
        {!isLeaf && <text x={n.x + 10} y={n.y - 10} fontSize={9.5} fill="#dfe4ea">{label}</text>}
        {!isLeaf && (
          <text x={n.x + 10} y={n.y + 11} fontSize={8.5} fill="#8b95a3">
            {strip(inst ?? "")}{n.flops ? `  ×${n.flops}` : ""}
          </text>
        )}
        <title>{isLeaf
          ? `${n.flops} flop(s) in ${n.groups ?? 1} group(s)\nvalue=${n.value}${n.bad ? `  violations=${n.bad}` : ""}`
          : `${strip(inst ?? "")} : ${label}\nvalue=${n.value}  flops=${n.flops}${n.bad ? `  violations=${n.bad}` : ""}`}</title>
      </g>,
    );
  };
  roots.forEach(walk);

  // Bands are drawn FIRST (behind wires and cells) and sorted largest-first so an outer module
  // never hides the inner ones nested in it.
  const bandEls = [...bands.entries()]
    .filter(([s]) => s)
    .sort((a, b) => (b[1].x1 - b[1].x0) * (b[1].y1 - b[1].y0) - (a[1].x1 - a[1].x0) * (a[1].y1 - a[1].y0))
    .map(([scope, b], i) => (
      <g key={"band:" + scope}>
        <rect x={b.x0 - 8} y={b.y0 - 16} width={b.x1 - b.x0 + 16} height={b.y1 - b.y0 + 24}
              rx={6} fill={i % 2 ? "rgba(120,150,190,.05)" : "rgba(160,140,80,.06)"}
              stroke="#4a5260" strokeWidth={1} strokeDasharray="4 3" />
        <text x={b.x0 - 4} y={b.y0 - 20} fontSize={9} fill="#8b95a3">{strip(scope) || scope}</text>
      </g>
    ));

  const W = size.w + 20, H = size.h + 24;
  return (
    <div className="cdwrap" onClick={() => { setMenu(null); setSel(""); }}>
      <div className="occhead">
        <span>{roots.length} {kind} root(s)</span>
        <span className="muted">click to select · right-click: copy path / add_occ_point · Ctrl+wheel: zoom · drag: pan</span>
        <span className="muted">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="cdscroll" {...view.bind}>
        <svg width={W * zoom} height={H * zoom} viewBox={`0 0 ${W} ${H}`}>
          {bandEls}
          {edges}
          {nodes}
        </svg>
      </div>
      {menu && (
        <div className="cmenu" style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 50 }}
             onClick={(e) => e.stopPropagation()}>
          <div className="cmi" title={`copies ${fullPath(menu.target)}`}
               onClick={() => { void navigator.clipboard?.writeText(fullPath(menu.target)); setMenu(null); }}>
            Copy Hierarchical Path &nbsp;<span className="muted">{dispPath(menu.target)}</span>
          </div>
          {onOcc && (
            <div className="cmi" title="record this point as an OCC definition point (dp_shell)"
                 onClick={() => { const t = menu.target, i = menu.item; setMenu(null); onOcc(t, i); }}>
              add_occ_point
            </div>
          )}
        </div>
      )}
    </div>
  );
}
