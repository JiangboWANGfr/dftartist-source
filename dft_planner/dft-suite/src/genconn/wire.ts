import type { BusConnection, BusInterface, BusWire, GenConnDocument, HardenDef, HardenInstance, Id } from "./core/model.ts";
import { computeLayout, dispDims, mapPoint, pointInPolygon, type BoxView } from "./layout.ts";
import { addInterface, mapOpenDef, removeInterface as editRemoveIface } from "./core/edit.ts";

export type Pt = { x: number; y: number };

const rid = () => crypto.randomUUID().slice(0, 8);

function pointInBox(box: BoxView, p: Pt): boolean {
  if (box.vertices?.length) return pointInPolygon(box.vertices, p.x - box.x, p.y - box.y);
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

/** 线段 a→b 与 c→d 的交点：返回 a→b 上归一化位置 t + 交点；无交/平行 → null。 */
function segSegHit(a: Pt, b: Pt, c: Pt, d: Pt): { t: number; p: Pt } | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null; // 平行/共线
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  const tc = Math.max(0, Math.min(1, t));
  return { t: tc, p: { x: a.x + rx * tc, y: a.y + ry * tc } };
}

/** 盒子边界线段（open def 坐标系）：多边形用真实轮廓，矩形用四边。 */
function boxEdges(box: BoxView): [Pt, Pt][] {
  if (box.vertices?.length) {
    const vs = box.vertices.map((v) => ({ x: box.x + v.x, y: box.y + v.y }));
    return vs.map((a, i) => [a, vs[(i + 1) % vs.length]] as [Pt, Pt]);
  }
  const x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
  return [
    [{ x: x0, y: y0 }, { x: x1, y: y0 }],
    [{ x: x1, y: y0 }, { x: x1, y: y1 }],
    [{ x: x1, y: y1 }, { x: x0, y: y1 }],
    [{ x: x0, y: y1 }, { x: x0, y: y0 }],
  ];
}

/** 折线与盒边的全部穿越（按行进顺序的弧长）；起/终点落在盒内也算端点穿越。 */
function boxHits(box: BoxView, points: Pt[]): { entryArc: number; entry: Pt; exit: Pt } | null {
  if (points.length === 0) return null; // 空折线 → 不穿过（守卫 points[0] 解引用）
  const crossings: { arc: number; p: Pt }[] = [];
  const edges = boxEdges(box);
  for (let i = 0; i < points.length - 1; i++) {
    for (const [c, d] of edges) {
      const hit = segSegHit(points[i], points[i + 1], c, d);
      if (hit) crossings.push({ arc: i + hit.t, p: hit.p });
    }
  }
  const startsInside = pointInBox(box, points[0]);
  const endsInside = pointInBox(box, points[points.length - 1]);
  if (crossings.length === 0 && !startsInside && !endsInside) return null;
  crossings.sort((a, b) => a.arc - b.arc);
  const entry = startsInside ? points[0] : (crossings[0]?.p ?? points[0]);
  const entryArc = startsInside ? 0 : (crossings[0]?.arc ?? 0);
  const exit = endsInside ? points[points.length - 1] : (crossings[crossings.length - 1]?.p ?? points[points.length - 1]);
  return { entryArc, entry, exit };
}

/** 折线在某实例盒边的"进/出"穿越点（进=client 落点，出=secondary 落点）。不穿过 → null。 */
export function instanceCrossings(box: BoxView, points: Pt[]): { entry: Pt; exit: Pt } | null {
  const h = boxHits(box, points);
  return h ? { entry: h.entry, exit: h.exit } : null;
}

/** 折线按行进顺序穿过的实例 id（每个实例取首次进入弧长排序）。 */
export function lineHitInstances(boxes: BoxView[], points: Pt[]): Id[] {
  if (points.length < 2) return [];
  const hit: { id: Id; arc: number }[] = [];
  for (const box of boxes) {
    const h = boxHits(box, points);
    if (h) hit.push({ id: box.instanceId, arc: h.entryArc });
  }
  return hit.sort((a, b) => a.arc - b.arc).map((h) => h.id);
}

type Edge = NonNullable<BusInterface["edge"]>;

/**
 * 两盒（u=上游 / d=下游）相邻或相对时，各自「朝对方」的边 + 对齐 offset（沿共享轴的重叠中心）。
 * 保证一条连接的 secondary(u 侧) 与 client(d 侧) 在共享边上对齐（像原来 snap 那样）。
 * 注：用显示盒坐标、矩形 offset；未处理实例旋转/多边形（data source 拉线一般在未旋转的矩形顶层）。
 */
function facingPlacement(u: BoxView, d: BoxView): { u: Edge; d: Edge } {
  const c01 = (v: number) => Math.max(0, Math.min(1, v));
  const ucx = u.x + u.w / 2, ucy = u.y + u.h / 2, dcx = d.x + d.w / 2, dcy = d.y + d.h / 2;
  if (Math.abs(dcx - ucx) >= Math.abs(dcy - ucy)) {
    const right = dcx > ucx; // d 在 u 右侧
    const y0 = Math.max(u.y, d.y), y1 = Math.min(u.y + u.h, d.y + d.h);
    const yc = y1 > y0 ? (y0 + y1) / 2 : (ucy + dcy) / 2; // 竖直重叠中心（无重叠取中点）
    return {
      u: { side: right ? "right" : "left", offset: c01((yc - u.y) / u.h) },
      d: { side: right ? "left" : "right", offset: c01((yc - d.y) / d.h) },
    };
  }
  const below = dcy > ucy; // d 在 u 下方
  const x0 = Math.max(u.x, d.x), x1 = Math.min(u.x + u.w, d.x + d.w);
  const xc = x1 > x0 ? (x0 + x1) / 2 : (ucx + dcx) / 2;
  return {
    u: { side: below ? "bottom" : "top", offset: c01((xc - u.x) / u.w) },
    d: { side: below ? "top" : "bottom", offset: c01((xc - d.x) / d.w) },
  };
}

/** 画线：新点**吸附到上一点的轴**（就近取纯横或纯竖），保证每段正交、点落在同一条线上。用于加点与实时预览。 */
export function orthAppend(points: Pt[], pt: Pt): Pt[] {
  const last = points[points.length - 1];
  if (!last) return [pt];
  const snapped = Math.abs(pt.x - last.x) >= Math.abs(pt.y - last.y) ? { x: pt.x, y: last.y } : { x: last.x, y: pt.y };
  return snapped.x === last.x && snapped.y === last.y ? points : [...points, snapped];
}

/**
 * 收线到引脚：保证最后一段**沿 axis 精确进入 at**（h=水平进，左右边引脚；v=垂直进，上下边引脚），
 * 线端不再像 orthAppend 那样落在偏移的轴上。上一段与修正方向同向 → 直接挪末点（零多余拐角）；
 * 否则在远端补一个角点。commit 与悬停预览共用。
 */
export function orthFinish(points: Pt[], at: Pt, axis: "h" | "v"): Pt[] {
  const pts = [...points];
  const last = pts[pts.length - 1];
  if (!last) return [at];
  if (axis === "h" ? last.y !== at.y : last.x !== at.x) {
    const prev = pts[pts.length - 2];
    const corner = axis === "h" ? { x: last.x, y: at.y } : { x: at.x, y: last.y };
    if (prev && (axis === "h" ? prev.x === last.x : prev.y === last.y)) {
      pts[pts.length - 1] = corner; // 上一段是同向直段 → 挪末点即对齐
      if (prev.x === corner.x && prev.y === corner.y) pts.splice(pts.length - 2, 1); // 挪成重合点 → 去重
    } else {
      pts.push(corner);
    }
  }
  const end = pts[pts.length - 1];
  if (end.x !== at.x || end.y !== at.y) pts.push(at);
  return pts;
}

/**
 * 端点绑定：把折线**末端**挪到 at，只动尾部、中间拐点不变（渲染时线跟随 DS 引脚用）。
 * 尾段沿其自身方向整体平移（连续共线 run 一起挪，保持正交），端点吸到 at；
 * 单点/尾段退化 → 直接落 at。
 */
export function bindWireEnd(points: Pt[], at: Pt): Pt[] {
  const n = points.length;
  if (n === 0) return [at];
  const last = points[n - 1];
  if (last.x === at.x && last.y === at.y) return points;
  if (n === 1) return [at];
  const pts = [...points];
  const prev = pts[n - 2];
  const vert = prev.x === last.x && prev.y !== last.y;   // 尾段竖直
  const horiz = prev.y === last.y && prev.x !== last.x;  // 尾段水平
  if (vert) {
    let i = n - 1;
    while (i > 0 && pts[i - 1].x === last.x) i--; // 尾部同 x 共线 run
    for (let j = i; j < n; j++) pts[j] = { x: at.x, y: pts[j].y };
    pts[n - 1] = at;
  } else if (horiz) {
    let i = n - 1;
    while (i > 0 && pts[i - 1].y === last.y) i--;
    for (let j = i; j < n; j++) pts[j] = { x: pts[j].x, y: at.y };
    pts[n - 1] = at;
  } else {
    pts.push(at); // 尾段退化/斜线（异常数据）→ 直接补端点
  }
  // 平移后与前一点重合 → 去重
  const m = pts.length;
  if (m >= 2 && pts[m - 1].x === pts[m - 2].x && pts[m - 1].y === pts[m - 2].y) pts.splice(m - 2, 1);
  return pts;
}

/** 双端绑定：out=起点端锚点、in=收线端锚点（null=该端不绑）。 */
export function bindWire(points: Pt[], outAt: Pt | null, inAt: Pt | null): Pt[] {
  let pts = points;
  if (outAt) pts = bindWireEnd([...pts].reverse(), outAt).reverse();
  if (inAt) pts = bindWireEnd(pts, inAt);
  return pts;
}

/** 折线自交计数（相邻段不算；平行重叠不算，只数横穿）。绑定后「正常/换脚」二选一用。 */
export function selfCrossings(points: Pt[]): number {
  let n = 0;
  for (let i = 0; i < points.length - 1; i++)
    for (let j = i + 2; j < points.length - 1; j++)
      if (segSegHit(points[i], points[i + 1], points[j], points[j + 1])) n++;
  return n;
}

/**
 * 折线 points 在矩形盒 box 内**第一段「U 形凹口」**的几何。无凹口→null。用于「同 def 各实例凹口一致」的画线辅助（纯视图，不影响生成）。
 * - depth：垂直进入边、扎进盒里的最大距离；
 * - side：进入边（left/right/top/bottom）；
 * - entryPos / exitPos：进入点 / 出去点沿该边的归一化位置（left/right→高度 y 分数；top/bottom→x 分数）。
 * - complete：折线是否已从该盒**出去**（有内→外的收尾段）；未出去=正在画。
 */
export function notchDepth(box: { x: number; y: number; w: number; h: number }, points: Pt[]): { depth: number; entryIndex: number; side: WSide; entryPos: number; exitPos: number; complete: boolean } | null {
  const inside = (p: Pt) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
  for (let i = 1; i < points.length; i++) {
    if (!inside(points[i]) || inside(points[i - 1])) continue; // 只找「外→内」的进入段
    const prev = points[i - 1];
    const ins: Pt[] = [];
    let j = i;
    for (; j < points.length && inside(points[j]); j++) ins.push(points[j]);
    const complete = j < points.length; // 停在「内→外」的点上 = 已出去
    const last = ins[ins.length - 1];
    const horiz = Math.abs(points[i].x - prev.x) >= Math.abs(points[i].y - prev.y);
    if (horiz) {
      const side: WSide = prev.x <= box.x ? "left" : "right";
      const depth = side === "left" ? Math.max(...ins.map((p) => p.x)) - box.x : box.x + box.w - Math.min(...ins.map((p) => p.x));
      return { depth, entryIndex: i, side, entryPos: box.h ? (points[i].y - box.y) / box.h : 0.5, exitPos: box.h ? (last.y - box.y) / box.h : 0.5, complete };
    }
    const side: WSide = prev.y <= box.y ? "top" : "bottom";
    const depth = side === "top" ? Math.max(...ins.map((p) => p.y)) - box.y : box.y + box.h - Math.min(...ins.map((p) => p.y));
    return { depth, entryIndex: i, side, entryPos: box.w ? (points[i].x - box.x) / box.w : 0.5, exitPos: box.w ? (last.x - box.x) / box.w : 0.5, complete };
  }
  return null;
}

type WSide = "left" | "right" | "top" | "bottom";
const OPP_SIDE: Record<WSide, WSide> = { left: "right", right: "left", top: "bottom", bottom: "top" };

/** 矩形盒某条边的线段（显示坐标）。 */
function sideSeg(box: BoxView, side: WSide): [Pt, Pt] {
  const { x, y, w, h } = box;
  switch (side) {
    case "left": return [{ x, y }, { x, y: y + h }];
    case "right": return [{ x: x + w, y }, { x: x + w, y: y + h }];
    case "top": return [{ x, y }, { x: x + w, y }];
    default: return [{ x, y: y + h }, { x: x + w, y: y + h }];
  }
}

/**
 * 折线与盒某条边全部交点的沿边坐标中点（左右边→y、上下边→x）：一次穿越=穿越点本身，回环两次=两线中点。
 * 生成接口"跟线落位"用。无交/多边形盒 → null（与 facingPlacement 同样不处理多边形/旋转）。
 */
export function sideCrossMid(box: BoxView, points: Pt[], side: WSide): number | null {
  if (box.vertices?.length) return null;
  const [a, b] = sideSeg(box, side);
  const vals: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const hit = segSegHit(points[i], points[i + 1], a, b);
    if (hit) vals.push(side === "left" || side === "right" ? hit.p.y : hit.p.x);
  }
  if (!vals.length) return null;
  return (Math.min(...vals) + Math.max(...vals)) / 2;
}

const MIR: Record<WSide, WSide> = { left: "right", right: "left", top: "top", bottom: "bottom" };
const ROT90: Record<WSide, WSide> = { left: "top", top: "right", right: "bottom", bottom: "left" }; // 顺时针，与 mapPoint 一致
/** def 帧的边 → 实例 rotation(顺时针 0/90/180/270)+mirror(先做的水平翻) 后的显示帧边。 */
export function orientSide(side: WSide, rotation: 0 | 90 | 180 | 270, mirror: boolean): WSide {
  let s: WSide = mirror ? MIR[side] : side;
  for (let i = 0; i < ((rotation / 90) % 4); i++) s = ROT90[s];
  return s;
}

type Rot = 0 | 90 | 180 | 270;
/** def 帧矩形边 side 上 offset(0..1) 处的局部点。 */
function edgePt(side: WSide, off: number, w0: number, h0: number): Pt {
  switch (side) {
    case "left": return { x: 0, y: off * h0 };
    case "right": return { x: w0, y: off * h0 };
    case "top": return { x: off * w0, y: 0 };
    case "bottom": return { x: off * w0, y: h0 };
  }
}
/** def 帧边 (side,offset) 经 rotation+mirror 后在显示边上的 offset(0..1)；与 computeLayout 的 mapPoint 一致。 */
export function orientOffset(side: WSide, off: number, rot: Rot, mir: boolean, w0: number, h0: number): number {
  const lp = edgePt(side, off, w0, h0);
  const dp = mapPoint(lp.x, lp.y, rot, mir, w0, h0);
  const { w, h } = dispDims(rot, w0, h0);
  const d = orientSide(side, rot, mir);
  return d === "left" || d === "right" ? (h ? dp.y / h : 0) : (w ? dp.x / w : 0);
}

export interface AddWireResult { doc: GenConnDocument; error?: string; unresolved?: string[]; }

/**
 * 从 data source(client) 接口拉线：按折线**真实穿过的边界**生成 secondary→client(manual) 连接。
 * 折线经过哪些 harden、相邻穿过关系 → 无向图；从 DS(root) BFS 定树，父→子 = 上游→下游。
 * 每条树边 父→子：父生成 secondary（朝子）→ 子生成 client（朝父）；DS(root) 只生 secondary（client=DS 本体）。
 * 允许一个 harden 扇出到多个子（多个 secondary）。接口按 facingPlacement 放在相对边、对齐。
 */
// 各 def 的规范布局取自"参考实例"(子最多者，视为 rot0/未镜像的 def 帧)：
// client/secondary 的 side 与 offset 都按参考实例的真实几何(facingPlacement 重叠中心)算，
// 从而配对的 secondary/client 落到同一世界位置(参考实例对齐；其他实例朝向后仍用同一 def offset)。
type Layout = { clientEdge: WSide | null; clientOffset: number; secEdges: WSide[]; secOffsets: number[]; w0: number; h0: number };
const ORIENTS: [0 | 90 | 180 | 270, boolean][] = ([0, 90, 180, 270] as const).flatMap((rot) => [[rot, false], [rot, true]] as [0 | 90 | 180 | 270, boolean][]);

/** 折线密采样穿边界 → 依次经过的 harden 序列 → 无向图 → BFS from DS → 树边 [父,子]。少于 1 条 → error。 */
function buildDrawnTree(boxes: BoxView[], sourceInstId: Id, points: Pt[]): { treeEdges: [Id, Id][] } | { error: string } {
  const hardenAt = (p: Pt): Id | null => { for (const b of boxes) if (pointInBox(b, p)) return b.instanceId; return null; };
  const seq: Id[] = [];
  const visit = (h: Id | null) => { if (h && seq[seq.length - 1] !== h) seq.push(h); };
  for (let i = 0; i < points.length; i++) {
    visit(hardenAt(points[i]));
    if (i < points.length - 1) {
      const a = points[i], b = points[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let s = 1; s < steps; s++) visit(hardenAt({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps }));
    }
  }
  if (seq[0] !== sourceInstId) seq.unshift(sourceInstId); // 线从 DS 起
  const undirected = new Map<string, [Id, Id]>();
  const ekey = (a: Id, b: Id) => [a, b].sort().join("|");
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) undirected.set(ekey(seq[i - 1], seq[i]), [seq[i - 1], seq[i]]);
  const adj = new Map<Id, Id[]>();
  for (const [a, b] of undirected.values()) { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a); }
  const visited = new Set<Id>([sourceInstId]);
  const treeEdges: [Id, Id][] = [];
  const queue: Id[] = [sourceInstId];
  while (queue.length) {
    const u = queue.shift() as Id;
    for (const v of adj.get(u) ?? []) if (!visited.has(v)) { visited.add(v); treeEdges.push([u, v]); queue.push(v); }
  }
  if (treeEdges.length < 1) return { error: "The wire must cross at least 1 harden besides the DS" };
  return { treeEdges };
}

export interface WireFromTreeResult { doc: GenConnDocument; addedConnIds: Id[]; error?: string; unresolved?: string[]; unmatched?: { instId: Id; reason: string }[]; }

/**
 * 给定树边 → 建 layoutByDef + findOrient + 共享接口(ensureSecSlot/ensureClient) + 写朝向 + manual 连接 + view-only BusWire。
 * dropUnresolved=false（addWire 用）：任一实例定不出朝向 → 返回 { unresolved }，doc 不变。
 * dropUnresolved=true（复制用）：定不出朝向的实例连同其在树里的后代被丢进 unmatched，用剩下的树照常材料化。
 */
export function wireFromTree(doc: GenConnDocument, sourceInstId: Id, sourceIfId: Id, treeEdges: [Id, Id][], points: Pt[], opts?: { dropUnresolved?: boolean; pd?: string; inEnd?: { instId: Id; ifId: Id } }): WireFromTreeResult {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId) as HardenDef;
  const srcDef = doc.library.defs.find((d) => d.id === open.childInstances.find((i) => i.id === sourceInstId)?.hardenId);
  const dsIf = srcDef?.interfaces.find((f) => f.id === sourceIfId) as BusInterface;
  const busType = dsIf.busType;
  const busWidth = busType === "SSN" ? (dsIf.busWidth ?? 4) : undefined;
  // BISR：pd 来自调用方（bisrController 的桩）或回退接口自身 powerDomain（pin 模式）。生成接口灌进 powerDomain，供 pdPrefix/clientKey 使用。
  const pd = busType === "BISR" ? (opts?.pd ?? dsIf.powerDomain) : undefined;

  const boxes = computeLayout(open, doc.library);
  const boxOf = (id: Id) => boxes.find((b) => b.instanceId === id) as BoxView;
  const instOf = (id: Id) => open.childInstances.find((i) => i.id === id) as HardenInstance;
  const defOfInst = (id: Id) => doc.library.defs.find((d) => d.id === instOf(id).hardenId) as HardenDef;
  const dirTo = (nodeInst: Id, nbrInst: Id): WSide => facingPlacement(boxOf(nodeInst), boxOf(nbrInst)).u.side as WSide;

  // 预检：生成 secondary 的结点（有子的父）def 不能 hierarchical；子结点 def 位宽兼容。
  for (const id of new Set(treeEdges.map((e) => e[0]))) {
    if (defOfInst(id).designType === "hierarchical") return { doc, addedConnIds: [], error: `'${instOf(id).instanceName}''s module is hierarchical, cannot generate secondary` };
  }
  for (const [, child] of treeEdges) {
    const cli = defOfInst(child).interfaces.find((f) => f.role === "client" && f.busType === busType);
    if (cli && busType === "SSN" && (cli.busWidth ?? 4) !== (busWidth ?? 4)) return { doc, addedConnIds: [], error: `'${defOfInst(child).designName}' already has an incompatible ${busType} client (width mismatch)` };
  }

  // 由一组树边算出：树结构 + 每 def 规范布局 + 每实例朝向；dead = 定不出朝向的实例。
  type Struct = { childrenOf: Map<Id, Id[]>; parentOf: Map<Id, Id>; nodes: Set<Id>; layoutByDef: Map<Id, Layout>; orientOf: Map<Id, { rot: 0 | 90 | 180 | 270; mir: boolean; slotOf: Map<Id, number> }>; dead: Id[] };
  const computeStruct = (edges: [Id, Id][]): Struct => {
    const childrenOf = new Map<Id, Id[]>();
    const parentOf = new Map<Id, Id>();
    for (const [p, c] of edges) { (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(c); parentOf.set(c, p); }
    const nodes = new Set<Id>([...childrenOf.keys(), ...parentOf.keys()]);
    const instsByDef = new Map<Id, Id[]>();
    for (const n of nodes) { const d = defOfInst(n).id; (instsByDef.get(d) ?? instsByDef.set(d, []).get(d)!).push(n); }
    const layoutByDef = new Map<Id, Layout>();
    for (const [defId, insts] of instsByDef) {
      const ref = insts.slice().sort((a, b) => (childrenOf.get(b)?.length ?? 0) - (childrenOf.get(a)?.length ?? 0))[0];
      const refBox = boxOf(ref);
      const pf = parentOf.has(ref) ? facingPlacement(refBox, boxOf(parentOf.get(ref)!)).u : null;
      // 落位跟线走：offset = 线与穿越边交点的中点，换算到 refBox 帧；取不到（多边形等）退回重叠中心。
      // 守卫：树里有多实例 def 时整树退回重叠中心——def 级接口只有一份 offset，跟单条线会打破镜像/槽位的 world 对齐。
      const followWire = [...instsByDef.values()].every((l) => l.length === 1);
      const c01 = (v: number) => Math.max(0, Math.min(1, v));
      const crossOffset = (measureBox: BoxView, side: WSide, fallback: number | undefined): number => {
        const cm = followWire ? sideCrossMid(measureBox, points, side) : null;
        if (cm == null) return fallback ?? 0.5;
        return side === "left" || side === "right" ? c01((cm - refBox.y) / refBox.h) : c01((cm - refBox.x) / refBox.w);
      };
      const clientOffset = pf ? crossOffset(refBox, pf.side as WSide, pf.offset) : 0.5;
      const secEdges: WSide[] = [];
      const secOffsets: number[] = [];
      for (const c of childrenOf.get(ref) ?? []) {
        const u = facingPlacement(refBox, boxOf(c)).u;
        secEdges.push(u.side as WSide);
        // secondary 与下游 client 用同一穿越坐标（量在子盒朝己边）→ 两侧对齐、自动配对不受影响
        secOffsets.push(crossOffset(boxOf(c), OPP_SIDE[u.side as WSide], u.offset));
      }
      layoutByDef.set(defId, { clientEdge: (pf?.side as WSide) ?? null, clientOffset, secEdges, secOffsets, w0: refBox.w, h0: refBox.h });
    }
    // 为实例找朝向(8 选 1)：client 边须对上父方向；子按几何位置配槽位(同边内 offset 就近)，避免镜像/旋转交叉。
    const findOrient = (inst: Id, lay: Layout): { rot: 0 | 90 | 180 | 270; mir: boolean; slotOf: Map<Id, number> } | null => {
      const wantClient = parentOf.has(inst) ? dirTo(inst, parentOf.get(inst)!) : null;
      const kids = childrenOf.get(inst) ?? [];
      const instBox = boxOf(inst);
      const kidFace = new Map(kids.map((c) => { const u = facingPlacement(instBox, boxOf(c)).u; return [c, { side: u.side as WSide, off: u.offset ?? 0.5 }]; }));
      for (const [rot, mir] of ORIENTS) {
        if (wantClient && lay.clientEdge && orientSide(lay.clientEdge, rot, mir) !== wantClient) continue;
        const slotDisp = lay.secEdges.map((e, i) => ({ i, side: orientSide(e, rot, mir), off: orientOffset(e, lay.secOffsets[i], rot, mir, lay.w0, lay.h0) }));
        const kidsBySide = new Map<WSide, Id[]>();
        for (const c of kids) { const s = kidFace.get(c)!.side; (kidsBySide.get(s) ?? kidsBySide.set(s, []).get(s)!).push(c); }
        const slotOf = new Map<Id, number>();
        let ok = true;
        for (const [side, cs] of kidsBySide) {
          const slots = slotDisp.filter((sd) => sd.side === side);
          if (slots.length < cs.length) { ok = false; break; }
          const used = new Set<number>();
          for (const c of cs.slice().sort((a, b) => kidFace.get(a)!.off - kidFace.get(b)!.off)) {
            let best = -1, bestD = Infinity;
            for (const sd of slots) if (!used.has(sd.i)) { const dd = Math.abs(sd.off - kidFace.get(c)!.off); if (dd < bestD) { bestD = dd; best = sd.i; } }
            if (best < 0) { ok = false; break; }
            used.add(best); slotOf.set(c, best);
          }
          if (!ok) break;
        }
        if (ok && slotOf.size === kids.length) return { rot, mir, slotOf };
      }
      return null;
    };
    const orientOf = new Map<Id, { rot: 0 | 90 | 180 | 270; mir: boolean; slotOf: Map<Id, number> }>();
    const dead: Id[] = [];
    for (const n of nodes) { const o = findOrient(n, layoutByDef.get(defOfInst(n).id)!); if (o) orientOf.set(n, o); else dead.push(n); }
    return { childrenOf, parentOf, nodes, layoutByDef, orientOf, dead };
  };

  let edges = treeEdges;
  let st = computeStruct(edges);
  const unmatched: { instId: Id; reason: string }[] = [];
  if (st.dead.length && !opts?.dropUnresolved) return { doc, addedConnIds: [], unresolved: st.dead.map((id) => instOf(id).instanceName) };
  while (st.dead.length) { // 仅 dropUnresolved 进入：丢掉定不出朝向的实例 + 其后代，重算直到稳定
    const dead = new Set(st.dead);
    let grew = true;
    while (grew) { grew = false; for (const [p, c] of edges) if (dead.has(p) && !dead.has(c)) { dead.add(c); grew = true; } }
    for (const id of dead) unmatched.push({ instId: id, reason: "Cannot automatically determine orientation for pairing" });
    edges = edges.filter(([p, c]) => !dead.has(p) && !dead.has(c));
    st = computeStruct(edges);
  }
  if (!edges.length) return { doc, addedConnIds: [], unmatched: unmatched.length ? unmatched : undefined };

  let work = doc;
  const sideCount = new Map<string, number>();
  const secIfByDefSlot = new Map<string, Id>();
  const cliIfByDef = new Map<Id, Id>();
  const createdIfs: { defId: Id; ifId: Id }[] = []; // 本次生成的接口 → 记到 wire 上（删线级联清理用）
  const ensureSecSlot = (defId: Id, lay: Layout, slotIdx: number): Id => {
    const key = `${defId}:${slotIdx}`;
    if (secIfByDefSlot.has(key)) return secIfByDefSlot.get(key)!;
    const side = lay.secEdges[slotIdx];
    const n = (sideCount.get(`${defId}:${side}`) ?? 0) + 1; sideCount.set(`${defId}:${side}`, n);
    const oldIds = new Set((work.library.defs.find((d) => d.id === defId) as HardenDef).interfaces.map((f) => f.id));
    work = addInterface(work, defId, { busType, role: "secondary", interfaceName: `${side}${n}`, busWidth, edge: { side, offset: lay.secOffsets[slotIdx] }, ...(pd ? { powerDomain: pd } : {}) });
    const created = (work.library.defs.find((d) => d.id === defId) as HardenDef).interfaces.find((f) => !oldIds.has(f.id)) as BusInterface;
    createdIfs.push({ defId, ifId: created.id });
    secIfByDefSlot.set(key, created.id); return created.id;
  };
  const ensureClient = (defId: Id, lay: Layout): Id => {
    if (cliIfByDef.has(defId)) return cliIfByDef.get(defId)!;
    const side = lay.clientEdge as WSide;
    const n = (sideCount.get(`${defId}:${side}`) ?? 0) + 1; sideCount.set(`${defId}:${side}`, n);
    const oldIds = new Set((work.library.defs.find((d) => d.id === defId) as HardenDef).interfaces.map((f) => f.id));
    void n; // 仍占用 sideCount 计数（保持 secondary 编号一致），但 client 不生成 interfaceName → 端口前缀为 <bus>_ 而非 <名>_<bus>_
    work = addInterface(work, defId, { busType, role: "client", busWidth, edge: { side, offset: lay.clientOffset }, ...(pd ? { powerDomain: pd } : {}) });
    const created = (work.library.defs.find((d) => d.id === defId) as HardenDef).interfaces.find((f) => !oldIds.has(f.id)) as BusInterface;
    createdIfs.push({ defId, ifId: created.id });
    cliIfByDef.set(defId, created.id); return created.id;
  };

  const conns: BusConnection[] = [];
  work = mapOpenDef(work, (d) => ({ ...d, childInstances: d.childInstances.map((i) => { const o = st.orientOf.get(i.id); return o ? { ...i, rotation: o.rot, mirror: o.mir } : i; }) }));
  for (const [parent, child] of edges) {
    const pLay = st.layoutByDef.get(defOfInst(parent).id)!;
    const slotIdx = st.orientOf.get(parent)!.slotOf.get(child)!;
    const secIf = ensureSecSlot(defOfInst(parent).id, pLay, slotIdx);
    const cLay = st.layoutByDef.get(defOfInst(child).id)!;
    const cliIf = child === sourceInstId ? sourceIfId : ensureClient(defOfInst(child).id, cLay);
    conns.push({ id: `k_${rid()}`, secondaryInstanceId: parent, secondaryInterfaceId: secIf, clientInstanceId: child, clientInterfaceId: cliIf, manual: true });
  }

  const wire: BusWire = {
    id: `w_${rid()}`, busType, busWidth, pd, sourceInstanceId: sourceInstId, sourceInterfaceId: sourceIfId, points,
    connectionIds: conns.map((c) => c.id),
    ...(createdIfs.length ? { createdIfs } : {}),
    ...(opts?.inEnd ? { inInstanceId: opts.inEnd.instId, inInterfaceId: opts.inEnd.ifId } : {}),
  };
  work = mapOpenDef(work, (d) => ({ ...d, connections: [...d.connections, ...conns], wires: [...(d.wires ?? []), wire] }));
  return { doc: work, addedConnIds: conns.map((c) => c.id), unmatched: unmatched.length ? unmatched : undefined };
}

export function addWire(doc: GenConnDocument, sourceInstId: Id, sourceIfId: Id, points: Pt[], pd?: string, inEnd?: { instId: Id; ifId: Id }): AddWireResult {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  if (!open) return { doc, error: "No def is open" };
  const srcInst = open.childInstances.find((i) => i.id === sourceInstId);
  const srcDef = doc.library.defs.find((d) => d.id === srcInst?.hardenId);
  const dsIf = srcDef?.interfaces.find((f) => f.id === sourceIfId);
  if (!srcInst || !srcDef || !dsIf || !dsIf.isDataSource) return { doc, error: "Start point is not a data source interface" };

  const boxes = computeLayout(open, doc.library);
  const t = buildDrawnTree(boxes, sourceInstId, points);
  if ("error" in t) return { doc, error: t.error };
  const r = wireFromTree(doc, sourceInstId, sourceIfId, t.treeEdges, points, { pd, inEnd });
  if (r.error) return { doc, error: r.error };
  if (r.unresolved?.length) return { doc, unresolved: r.unresolved };
  return { doc: applyBisrMatchOnly(r.doc), unresolved: [] };
}

/** 删一条 wire：删它建立的 manual 连接（按 connectionIds）+ 删 wire 记录。Slice 1 先做删连接+删 wire（不清孤儿接口）。 */
export function removeWire(doc: GenConnDocument, wireId: Id): GenConnDocument {
  let createdIfs: { defId: Id; ifId: Id }[] = [];
  let out = mapOpenDef(doc, (d) => {
    const w = (d.wires ?? []).find((x) => x.id === wireId);
    if (!w) return d;
    createdIfs = w.createdIfs ?? [];
    const ids = new Set(w.connectionIds);
    return { ...d, connections: d.connections.filter((c) => !ids.has(c.id)), wires: (d.wires ?? []).filter((x) => x.id !== wireId) };
  });
  // 本 wire 生成的接口：删线后已无任何连接引用 → 一并删（被其他线复用则保留）。老文档无 createdIfs → 不动。
  for (const { defId, ifId } of createdIfs) {
    const used = out.library.defs.some((d) => d.connections.some((c) => c.secondaryInterfaceId === ifId || c.clientInterfaceId === ifId));
    if (!used) out = editRemoveIface(out, defId, ifId);
  }
  return applyBisrMatchOnly(out);
}

/**
 * 派生 BISR 数据源线生成接口的 pdMatchOnly（决定 pd 进不进端口名）：
 *  - 源实例（data source 本实例）的接口 → false（总是进名）。
 *  - 下游实例的接口 → 本实例经过的"不同 pd 个数" == 1 ? true(只匹配) : false(进名)。
 * 只改「由 BISR wire 连接引用」的接口（排除 DS 源接口本体）；纯函数，与画线顺序无关。
 */
export function applyBisrMatchOnly(doc: GenConnDocument): GenConnDocument {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId) as HardenDef | undefined;
  if (!open) return doc;
  const wires = (open.wires ?? []).filter((w) => w.busType === "BISR");
  if (!wires.length) return doc;
  const connById = new Map(open.connections.map((c) => [c.id, c]));
  const defIdOf = (instId: Id) => open.childInstances.find((i) => i.id === instId)?.hardenId;

  const instPds = new Map<Id, Set<string>>();
  const addPd = (instId: Id, pd?: string) => { if (!pd) return; (instPds.get(instId) ?? instPds.set(instId, new Set()).get(instId)!).add(pd); };
  for (const w of wires) for (const cid of w.connectionIds) {
    const c = connById.get(cid); if (!c) continue;
    addPd(c.secondaryInstanceId, w.pd); addPd(c.clientInstanceId, w.pd);
  }

  const want = new Map<string, boolean>();
  for (const w of wires) for (const cid of w.connectionIds) {
    const c = connById.get(cid); if (!c) continue;
    for (const [instId, ifId] of [[c.secondaryInstanceId, c.secondaryInterfaceId], [c.clientInstanceId, c.clientInterfaceId]] as const) {
      if (ifId === w.sourceInterfaceId) continue;
      const defId = defIdOf(instId); if (!defId) continue;
      const own = instId === w.sourceInstanceId;
      want.set(`${defId}:${ifId}`, own ? false : (instPds.get(instId)?.size ?? 1) === 1);
    }
  }

  return {
    ...doc,
    library: { ...doc.library, defs: doc.library.defs.map((d) => {
      if (!d.interfaces.some((f) => want.has(`${d.id}:${f.id}`))) return d;
      return { ...d, interfaces: d.interfaces.map((f) => {
        const mo = want.get(`${d.id}:${f.id}`);
        return mo === undefined || f.busType !== "BISR" ? f : { ...f, pdMatchOnly: mo };
      }) };
    }) },
  };
}
