// F3 — 纯布局计算：把 open def 转成画布图元（盒子 + 接口条）。无 React/Konva 依赖，可单测。

import type { BusInterface, HardenDef, HardenLibrary, Id } from "./core/model.ts";

export const BOX_W = 160; // 20px 网格的倍数（保证默认 harden 落在网格上）
export const BOX_H = 140;
const GRID_COLS = 4;
const GAP = 40;

export type Side = "top" | "bottom" | "left" | "right";

export type Pt = { x: number; y: number };

// ——— 正交多边形轮廓几何（接口沿整条周长定位）———

export function pointInPolygon(verts: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y, xj = verts[j].x, yj = verts[j].y;
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const segLen = (a: Pt, b: Pt): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // 正交边
const outline = (verts: Pt[]): { a: Pt; b: Pt; len: number }[] =>
  verts.map((a, i) => { const b = verts[(i + 1) % verts.length]; return { a, b, len: segLen(a, b) }; });

/** 边 a→b 的外法线朝向（正交边）：用内部点判定。 */
function outwardSide(verts: Pt[], a: Pt, b: Pt): Side {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  if (a.x === b.x) return pointInPolygon(verts, a.x + 1, my) ? "left" : "right"; // 内部在右→外朝左
  return pointInPolygon(verts, mx, a.y + 1) ? "top" : "bottom"; // 内部在下→外朝上（y 向下）
}

/** 轮廓上弧长分数 t(0..1) 对应的点 + 该边外朝向。 */
export function outlinePoint(verts: Pt[], t: number): { x: number; y: number; side: Side } {
  const edges = outline(verts);
  const P = edges.reduce((s, e) => s + e.len, 0) || 1;
  let target = (((t % 1) + 1) % 1) * P;
  for (const e of edges) {
    if (target <= e.len || e === edges[edges.length - 1]) {
      const r = e.len ? target / e.len : 0;
      return { x: e.a.x + (e.b.x - e.a.x) * r, y: e.a.y + (e.b.y - e.a.y) * r, side: outwardSide(verts, e.a, e.b) };
    }
    target -= e.len;
  }
  return { x: verts[0].x, y: verts[0].y, side: outwardSide(verts, edges[0].a, edges[0].b) };
}

/** 弧长分数 t 所在的那条轮廓边（端点 + 外朝向）。 */
export function outlineEdgeAt(verts: Pt[], t: number): { a: Pt; b: Pt; side: Side } {
  const edges = outline(verts);
  const P = edges.reduce((s, e) => s + e.len, 0) || 1;
  let target = (((t % 1) + 1) % 1) * P;
  for (const e of edges) {
    if (target <= e.len || e === edges[edges.length - 1]) return { a: e.a, b: e.b, side: outwardSide(verts, e.a, e.b) };
    target -= e.len;
  }
  const e0 = edges[0];
  return { a: e0.a, b: e0.b, side: outwardSide(verts, e0.a, e0.b) };
}

/** 把任意点投影到最近的轮廓边，返回投影点 + 弧长分数 t + 该边外朝向（拖动用）。 */
export function outlineLocate(verts: Pt[], x: number, y: number): { x: number; y: number; t: number; side: Side } {
  const edges = outline(verts);
  const P = edges.reduce((s, e) => s + e.len, 0) || 1;
  let acc = 0;
  let best = { d: Infinity, x: 0, y: 0, t: 0, side: "left" as Side };
  for (const e of edges) {
    let px: number, py: number, along: number;
    if (e.a.x === e.b.x) { // 垂直边
      px = e.a.x;
      py = Math.min(Math.max(y, Math.min(e.a.y, e.b.y)), Math.max(e.a.y, e.b.y));
      along = Math.abs(py - e.a.y);
    } else { // 水平边
      py = e.a.y;
      px = Math.min(Math.max(x, Math.min(e.a.x, e.b.x)), Math.max(e.a.x, e.b.x));
      along = Math.abs(px - e.a.x);
    }
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { d, x: px, y: py, t: (acc + along) / P, side: outwardSide(verts, e.a, e.b) };
    acc += e.len;
  }
  return best;
}

/** 实例名标签的内部角：取"右下方为实心"的顶点中最上、再最左的（多边形用，避免落在凹口空白）。 */
export function labelCorner(verts: Pt[]): Pt {
  const inside = verts.filter((v) => pointInPolygon(verts, v.x + 1, v.y + 1));
  const pool = inside.length ? inside : verts;
  return pool.reduce((best, v) => (v.y < best.y || (v.y === best.y && v.x < best.x) ? v : best), pool[0]);
}

const bboxSidePoint = (side: Side, t: number, w: number, h: number): Pt => {
  switch (side) {
    case "left": return { x: 0, y: t * h };
    case "right": return { x: w, y: t * h };
    case "top": return { x: t * w, y: 0 };
    case "bottom": return { x: t * w, y: h };
  }
};

// ——— 实例朝向变换（纯视图）：rotation(顺时针 0/90/180/270) + mirror(先于旋转的水平镜像) ———

export type Rotation = 0 | 90 | 180 | 270;

/** 旋转后显示尺寸：0/180 不换 w/h；90/270 互换。 */
export function dispDims(r: Rotation, w0: number, h0: number): { w: number; h: number } {
  return r === 90 || r === 270 ? { w: h0, h: w0 } : { w: w0, h: h0 };
}

/**
 * resize 时由"显示盒尺寸"反推应写回 def 的尺寸（dispDims 的逆）。
 * 因为 computeLayout 会对 90/270 再次互换 w/h，要得到显示 (w,h)，def 须存 (h,w)。0/180 不换；镜像不影响尺寸。
 */
export function defResizeDims(r: Rotation, w: number, h: number): { w: number; h: number } {
  return r === 90 || r === 270 ? { w: h, h: w } : { w, h };
}

/** def 局部坐标 → 显示局部坐标（先镜像后旋转）。 */
export function mapPoint(px: number, py: number, r: Rotation, m: boolean, w0: number, h0: number): Pt {
  const x = m ? w0 - px : px;
  const y = py;
  switch (r) {
    case 0: return { x, y };
    case 90: return { x: h0 - y, y: x };
    case 180: return { x: w0 - x, y: h0 - y };
    case 270: return { x: y, y: w0 - x };
  }
}

/** 显示局部坐标 → def 局部坐标（mapPoint 的逆）。 */
export function invMapPoint(dx: number, dy: number, r: Rotation, m: boolean, w0: number, h0: number): Pt {
  let x: number, y: number;
  switch (r) {
    case 0: x = dx; y = dy; break;
    case 90: x = dy; y = h0 - dx; break;
    case 180: x = w0 - dx; y = h0 - dy; break;
    case 270: x = w0 - dy; y = dx; break;
  }
  if (m) x = w0 - x;
  return { x, y };
}

export interface BarView {
  interfaceId: Id;
  busType: BusInterface["busType"];
  role: BusInterface["role"];
  side: Side;
  t: number; // 矩形：0..1 沿 side；多边形：= perimeter
  perimeter?: number; // 多边形：沿外轮廓的归一化弧长 0..1（有则锚点走轮廓）
  label: string;
  paired: boolean;
  unconnected: boolean; // client 未配对
  isDataSource?: boolean; // SpecGen data source 接口 → 画布显示 ◆ 标记
  dsFlip?: boolean; // SpecGen 边界接口块进/出脚翻转（纯视图）
}

export interface BoxView {
  instanceId: Id;
  instanceName: string;
  designName: string;
  hardenId: Id;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 多边形顶点（相对盒子原点）；无则为矩形。 */
  vertices?: { x: number; y: number }[];
  /** 实例朝向（纯视图）；嵌套预览据此整体旋转/镜像。 */
  rotation: Rotation;
  mirror: boolean;
  bars: BarView[];
}

function barLabel(i: BusInterface): string {
  const parts: string[] = [];
  if (i.powerDomain) parts.push(i.powerDomain);
  if (i.interfaceName) parts.push(i.interfaceName);
  parts.push(i.busType);
  return parts.join(" ");
}

/** 数据源/接口显示名：JTAG1838 按 role 显示 PTAP(client)/STAP(secondary)；其余回退 busType。纯视图，不影响生成。 */
export function busTypeLabel(busType: BusInterface["busType"], role: BusInterface["role"]): string {
  if (busType === "JTAG1838") return role === "client" ? "PTAP" : "STAP";
  return busType;
}

/** 缺省分边：client→左，secondary→右；显式 edge.side 优先。 */
function resolveSide(i: BusInterface): Side {
  return i.edge?.side ?? (i.role === "client" ? "left" : "right");
}

/** 计算 open def 这一层的盒子与接口条。 */
export function computeLayout(def: HardenDef, lib: HardenLibrary): BoxView[] {
  const defById = new Map(lib.defs.map((d) => [d.id, d]));

  const used = new Set<string>();
  for (const c of def.connections) {
    used.add(`${c.secondaryInstanceId}/${c.secondaryInterfaceId}`);
    used.add(`${c.clientInstanceId}/${c.clientInterfaceId}`);
  }

  return def.childInstances.map((inst, idx) => {
    const idef = defById.get(inst.hardenId);
    const x = inst.position?.x ?? (idx % GRID_COLS) * (BOX_W + GAP);
    const y = inst.position?.y ?? Math.floor(idx / GRID_COLS) * (BOX_H + GAP);
    const ifaces = idef?.interfaces ?? [];

    // 盒子尺寸 = 该 def 的外轮廓（size / 多边形包围盒 / 子块包围盒 / 默认），与下钻轮廓一致
    const o = idef ? defOutline(idef) : { w: BOX_W, h: BOX_H, vertices: undefined as { x: number; y: number }[] | undefined };
    const w0 = o.w;
    const h0 = o.h;
    const verts0 = o.vertices;

    // 实例朝向（纯视图）：先把 def 局部几何变换到显示坐标，再据此导出 side/t/perimeter。
    const r = (inst.rotation ?? 0) as Rotation;
    const m = inst.mirror ?? false;
    const { w, h } = dispDims(r, w0, h0);
    const verts = verts0?.map((p) => mapPoint(p.x, p.y, r, m, w0, h0));

    const grouped: Record<Side, BusInterface[]> = { top: [], bottom: [], left: [], right: [] };
    for (const f of ifaces) { if (f.placement === "other") continue; grouped[resolveSide(f)].push(f); }

    const eps = 1e-6;
    const bars: BarView[] = [];
    (Object.keys(grouped) as Side[]).forEach((side) => {
      const group = grouped[side];
      group.forEach((f, gi) => {
        const key = `${inst.id}/${f.id}`;
        const paired = used.has(key);
        const tDefault = f.edge?.offset ?? (gi + 1) / (group.length + 1);
        if (verts0 && verts) {
          // 多边形：def 局部锚点 → 显示坐标点 → 投影回显示轮廓得 side/perimeter
          const bp = bboxSidePoint(side, tDefault, w0, h0);
          const per0 = f.edge?.perimeter ?? outlineLocate(verts0, bp.x, bp.y).t;
          const lp = outlinePoint(verts0, per0);
          const dp = mapPoint(lp.x, lp.y, r, m, w0, h0);
          const loc = outlineLocate(verts, dp.x, dp.y);
          bars.push({ interfaceId: f.id, busType: f.busType, role: f.role, side: loc.side, t: loc.t, perimeter: loc.t, label: barLabel(f), paired, unconnected: f.role === "client" && !paired && !f.isDataSource, isDataSource: f.isDataSource, dsFlip: f.dsFlip });
        } else {
          // 矩形：def 局部锚点 → 显示坐标点 → 据显示尺寸导出 side/t
          const lp = bboxSidePoint(side, tDefault, w0, h0);
          const dp = mapPoint(lp.x, lp.y, r, m, w0, h0);
          let dSide: Side;
          let t: number;
          if (Math.abs(dp.x) <= eps) { dSide = "left"; t = h ? dp.y / h : 0; }
          else if (Math.abs(dp.x - w) <= eps) { dSide = "right"; t = h ? dp.y / h : 0; }
          else if (Math.abs(dp.y) <= eps) { dSide = "top"; t = w ? dp.x / w : 0; }
          else { dSide = "bottom"; t = w ? dp.x / w : 0; }
          bars.push({ interfaceId: f.id, busType: f.busType, role: f.role, side: dSide, t, label: barLabel(f), paired, unconnected: f.role === "client" && !paired && !f.isDataSource, isDataSource: f.isDataSource, dsFlip: f.dsFlip });
        }
      });
    });

    return {
      instanceId: inst.id,
      instanceName: inst.instanceName,
      designName: idef?.designName ?? "?",
      hardenId: inst.hardenId,
      x,
      y,
      w,
      h,
      vertices: verts,
      rotation: r,
      mirror: m,
      bars,
    };
  });
}

/** def 自身边界接口在其外轮廓上的排布（仅用于下钻视图显示，不参与配对）。 */
export function selfBars(def: HardenDef): Omit<BarView, "paired" | "unconnected">[] {
  const o = defOutline(def);
  const verts = o.vertices;
  const grouped: Record<Side, BusInterface[]> = { top: [], bottom: [], left: [], right: [] };
  for (const f of def.interfaces) grouped[resolveSide(f)].push(f);
  const out: Omit<BarView, "paired" | "unconnected">[] = [];
  (Object.keys(grouped) as Side[]).forEach((side) => {
    const g = grouped[side];
    g.forEach((f, gi) => {
      const tDefault = f.edge?.offset ?? (gi + 1) / (g.length + 1);
      if (verts) {
        const bp = bboxSidePoint(side, tDefault, o.w, o.h);
        const per = f.edge?.perimeter ?? outlineLocate(verts, bp.x, bp.y).t;
        out.push({ interfaceId: f.id, busType: f.busType, role: f.role, side: outlinePoint(verts, per).side, t: per, perimeter: per, label: barLabel(f), dsFlip: f.dsFlip });
      } else {
        out.push({ interfaceId: f.id, busType: f.busType, role: f.role, side, t: tDefault, label: barLabel(f), dsFlip: f.dsFlip });
      }
    });
  });
  return out;
}

/** 计算一个 def 的外轮廓尺寸：显式 size / 多边形包围盒 / 子块包围盒 / 默认。 */
export function defOutline(def: HardenDef): { w: number; h: number; vertices?: { x: number; y: number }[] } {
  if (def.vertices?.length) {
    return { w: Math.max(...def.vertices.map((p) => p.x)), h: Math.max(...def.vertices.map((p) => p.y)), vertices: def.vertices };
  }
  if (def.size) return { w: def.size.w, h: def.size.h };
  // 子块包围盒 + 边距
  const PAD = 60;
  let mx = 0;
  let my = 0;
  for (const i of def.childInstances) {
    mx = Math.max(mx, (i.position?.x ?? 0) + BOX_W);
    my = Math.max(my, (i.position?.y ?? 0) + BOX_H);
  }
  if (mx > 0) return { w: mx + PAD, h: my + PAD };
  return { w: BOX_W, h: BOX_H };
}

/** 接口条相对盒子原点的锚点（盒子作为一个可拖动 Group，内部用相对坐标）。 */
export function barAnchor(box: BoxView, bar: BarView): { x: number; y: number } {
  if (box.vertices && bar.perimeter != null) {
    const p = outlinePoint(box.vertices, bar.perimeter);
    return { x: p.x, y: p.y };
  }
  switch (bar.side) {
    case "left":
      return { x: 0, y: bar.t * box.h };
    case "right":
      return { x: box.w, y: bar.t * box.h };
    case "top":
      return { x: bar.t * box.w, y: 0 };
    case "bottom":
      return { x: bar.t * box.w, y: box.h };
  }
}

/** 接口所在边的世界坐标线段（端点 + 朝向）；矩形=包围盒对应边，多边形=真实轮廓边。配对判定用。 */
export function barSegment(box: BoxView, bar: BarView): { a: Pt; b: Pt; side: Side } {
  if (box.vertices && bar.perimeter != null) {
    const e = outlineEdgeAt(box.vertices, bar.perimeter);
    return { a: { x: box.x + e.a.x, y: box.y + e.a.y }, b: { x: box.x + e.b.x, y: box.y + e.b.y }, side: e.side };
  }
  switch (bar.side) {
    case "left": return { a: { x: box.x, y: box.y }, b: { x: box.x, y: box.y + box.h }, side: "left" };
    case "right": return { a: { x: box.x + box.w, y: box.y }, b: { x: box.x + box.w, y: box.y + box.h }, side: "right" };
    case "top": return { a: { x: box.x, y: box.y }, b: { x: box.x + box.w, y: box.y }, side: "top" };
    case "bottom": return { a: { x: box.x, y: box.y + box.h }, b: { x: box.x + box.w, y: box.y + box.h }, side: "bottom" };
  }
}

export const BUS_COLOR: Record<BusInterface["busType"], string> = {
  SSN: "#2e90fa",
  IJTAG: "#12b76a",
  BISR: "#f79009",
  BSCAN: "#9e77ed",
  JTAG1838: "#06aed4",
};

/** def 快捷色板（检查器一键选）。任意色用原生取色器。 */
export const DEF_PALETTE: string[] = ["#f04438", "#f79009", "#eab308", "#12b76a", "#06aed4", "#2e90fa", "#9e77ed", "#667085"];

/** 把 hex 朝白色混合 t（0=原色，1=纯白）→ 浅色填充。非法输入回退 "#ffffff"。 */
export function hexTint(hex: string, t = 0.85): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return "#" + ch.map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, "0")).join("");
}

/** 三角脚顶点：root=脚根，d=方向单位向量，inward=true 尖朝 d（out 脚），false 尖朝 root（in 脚）；len=脚长，halfW=半宽。 */
export function triPoints(root: { x: number; y: number }, d: { dx: number; dy: number }, inward: boolean, len: number, halfW: number): number[] {
  const tip = inward ? { x: root.x + d.dx * len, y: root.y + d.dy * len } : root;
  const base = inward ? root : { x: root.x + d.dx * len, y: root.y + d.dy * len };
  const px = -d.dy, py = d.dx;
  return [base.x + px * halfW, base.y + py * halfW, base.x - px * halfW, base.y - py * halfW, tip.x, tip.y];
}
