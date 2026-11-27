// Flatten an ELK layout result into absolute-coordinate boxes + polyline wires
// (pure: no React/Konva — unit-testable). Diamond anchors sit PIN_STUB px OUTSIDE
// the box edge (Tessent-style pin stub); wires still terminate at the on-border
// ELK anchor, collinear with the pin stub (drawn by the view), so the joint stays seamless.

import type { LaidOutGraph } from "./elkLayout.ts";
import type { ElkLaidEdge, ElkLaidNode } from "elkjs/lib/elk.bundled.js";
import { portId, type SchEdge, type SchNode } from "../core/schematic.ts";

export const PIN_STUB = 10;

export interface Box {
  node: SchNode; x: number; y: number; w: number; h: number;
  /** 相对父容器的坐标(根层 = 布局系坐标)。位置记忆按父系回喂 ELK(spec §4-8)。 */
  rel: { x: number; y: number };
  ports: Record<string, { x: number; y: number }>;
  /** 镜像到边界内侧的锚点(内侧菱形 = 往里追,spec §5.1)。 */
  innerPorts: Record<string, { x: number; y: number }>;
  isContainer: boolean;
}
export interface Wire { id: string; points: number[]; bus: boolean; net: string; crossing?: boolean; val?: string; }
export interface Laid { boxes: Box[]; wires: Wire[]; }

export function toLaid(elk: LaidOutGraph, nodes: Record<string, SchNode>, edges: SchEdge[]): Laid {
  const boxes: Box[] = [];
  const hasKids = new Set<string>();
  for (const n of Object.values(nodes)) if (n.parentId) hasKids.add(n.parentId);
  // 每个容器坐标系的绝对原点;边 sections 相对其 container 节点(spec §4-5)
  const origin: Record<string, { x: number; y: number }> = { root: { x: 0, y: 0 } };

  const walk = (c: ElkLaidNode, ox: number, oy: number): void => {
    const node = nodes[c.id];
    if (!node) return;
    const rx = c.x ?? 0, ry = c.y ?? 0;
    const x = ox + rx, y = oy + ry;
    origin[c.id] = { x, y };
    const outIds = new Set(node.ports.filter((p) => p.direction === "out").map((p) => portId(node.id, p.name)));
    const ports: Record<string, { x: number; y: number }> = {};
    const innerPorts: Record<string, { x: number; y: number }> = {};
    for (const p of c.ports ?? []) {
      const cx = x + (p.x ?? 0) + (p.width ?? 6) / 2;
      const cy = y + (p.y ?? 0) + (p.height ?? 6) / 2;
      const out = outIds.has(p.id);
      ports[p.id] = { x: cx + (out ? PIN_STUB : -PIN_STUB), y: cy };
      innerPorts[p.id] = { x: cx + (out ? -PIN_STUB : PIN_STUB), y: cy };
    }
    // `|| ` (not `??`) so an ELK-returned 0 also falls back instead of drawing a 0-size box.
    boxes.push({ node, x, y, rel: { x: rx, y: ry }, w: c.width || 130, h: c.height || 52, ports, innerPorts, isContainer: hasKids.has(c.id) });
    for (const k of c.children ?? []) walk(k, x, y);
  };
  for (const c of elk.children ?? []) walk(c, 0, 0);

  const byId = new Map(edges.map((e) => [e.id, e]));
  const wires: Wire[] = [];
  const collect = (es: ElkLaidEdge[] | undefined, fallback: string): void => {
    for (const e of es ?? []) {
      const s = e.sections?.[0];
      if (!s) continue;
      const o = origin[e.container ?? fallback] ?? { x: 0, y: 0 };
      const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].flatMap((p) => [p.x + o.x, p.y + o.y]);
      const edge = byId.get(e.id);
      wires.push({ id: e.id, points: pts, bus: edge?.bus ?? false, net: edge?.netName ?? "", crossing: edge?.crossing, val: edge?.val });
    }
  };
  collect(elk.edges, "root");
  const walkEdges = (c: ElkLaidNode): void => {
    collect(c.edges, c.id);
    for (const k of c.children ?? []) walkEdges(k);
  };
  for (const c of elk.children ?? []) walkEdges(c);

  // A pin driven by multiple behavioral sources yields wires sharing an END point —
  // keep the net label on the first only (same net, they'd stack). Fanout wires end
  // at distinct pins, so every fanout wire keeps its label (spec §2.2).
  const seenEnd = new Set<string>();
  for (const w of wires) {
    const k = `${w.points[w.points.length - 2]},${w.points[w.points.length - 1]}`;
    if (seenEnd.has(k)) w.net = "";
    else seenEnd.add(k);
  }
  return { boxes, wires };
}

export interface Bounds { x: number; y: number; w: number; h: number; }

/** Content bounding box (boxes ∪ wire points), padded for stubs/labels. Null when empty. */
export function boundsOf(laid: Laid, pad = 20): Bounds | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of laid.boxes) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  for (const w of laid.wires)
    for (let i = 0; i < w.points.length; i += 2) {
      x0 = Math.min(x0, w.points[i]); y0 = Math.min(y0, w.points[i + 1]);
      x1 = Math.max(x1, w.points[i]); y1 = Math.max(y1, w.points[i + 1]);
    }
  if (!Number.isFinite(x0)) return null;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

/** Stage transform fitting `bounds` into `viewport`, centered; zooms out only (≤ maxScale). */
export function fitTransform(bounds: Bounds, viewport: { w: number; h: number }, padding = 40, maxScale = 1): { scale: number; x: number; y: number } {
  const scale = Math.max(0.05, Math.min(maxScale, (viewport.w - 2 * padding) / bounds.w, (viewport.h - 2 * padding) / bounds.h));
  return {
    scale,
    x: (viewport.w - bounds.w * scale) / 2 - bounds.x * scale,
    y: (viewport.h - bounds.h * scale) / 2 - bounds.y * scale,
  };
}

/** Translate the laid result so `anchorId` keeps its previous on-screen position (spec §2.4). */
export function anchorTo(laid: Laid, prev: Record<string, { x: number; y: number }> | null, anchorId: string): Laid {
  const a = laid.boxes.find((b) => b.node.id === anchorId);
  const p = prev?.[anchorId];
  if (!a || !p) return laid;
  const dx = p.x - a.x, dy = p.y - a.y;
  if (dx === 0 && dy === 0) return laid;
  const shift = (m: Record<string, { x: number; y: number }>): Record<string, { x: number; y: number }> =>
    Object.fromEntries(Object.entries(m).map(([k, pt]) => [k, { x: pt.x + dx, y: pt.y + dy }]));
  return {
    boxes: laid.boxes.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy, ports: shift(b.ports), innerPorts: shift(b.innerPorts) })),
    wires: laid.wires.map((w) => ({ ...w, points: w.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) })),
  };
}
