// 配对几何判定（模型 A 确认版）：
//  · 配对 = 两个 harden 在"相对的边"上紧贴（边重合 + 投影重叠）且接口兼容；与圆点初始距离无关。
//  · alignClientsToSecondaries：把 client 接口的 def offset 调到与 secondary 锚点重合（动接口不动盒子，
//    def 层 → 同 def 所有实例一起动）。
//  · reconcilePairs：把 open def 的连接对账成"恰好 = 当前几何配对集"（自动配对 + 自动解除）。
// 纯函数，可单测。

import type { BusConnection, BusInterface, GenConnDocument, HardenDef, HardenLibrary } from "./core/model.ts";
import { computeLayout, barAnchor, barSegment, outlineLocate, defOutline, invMapPoint, type BoxView, type BarView, type Side, type Rotation } from "./layout.ts";
import { compatible, effectivePd } from "./core/edit.ts";

const OPP: Record<Side, Side> = { left: "right", right: "left", top: "bottom", bottom: "top" };

const EDGE_TOL = 8; // 两条边视为"重合"的容差（px）
const MIN_OVERLAP = 6; // 投影重叠下限（px），避免只挨一个角也算
const DOT_TOL = 10; // 两接口圆点视为"连上"的距离（对齐后≈0；够不着/超出对边长则远超此值→断开）

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/** 两个接口所在的真实边是否"重合且投影重叠"（矩形/多边形通用：用各自的真实边线段）。 */
function edgesAbut(s: { a: { x: number; y: number }; b: { x: number; y: number }; side: Side }, c: typeof s): boolean {
  if (s.side === "left" || s.side === "right") {
    if (Math.abs(s.a.x - c.a.x) > EDGE_TOL) return false; // 同一条竖线
    return overlap(Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y), Math.min(c.a.y, c.b.y), Math.max(c.a.y, c.b.y)) >= MIN_OVERLAP;
  }
  if (Math.abs(s.a.y - c.a.y) > EDGE_TOL) return false; // 同一条横线
  return overlap(Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x), Math.min(c.a.x, c.b.x), Math.max(c.a.x, c.b.x)) >= MIN_OVERLAP;
}

export interface SnapPair {
  secInst: string;
  secIf: string;
  cliInst: string;
  cliIf: string;
}

/** 候选配对：open def 里"真实边重合 + 兼容"的 secondary→client（不看圆点是否已对上；对齐用）。 */
export function findEdgePairs(doc: GenConnDocument): SnapPair[] {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  if (!open) return [];
  const boxes = computeLayout(open, doc.library);
  const defs = new Map(doc.library.defs.map((d) => [d.id, d]));
  const instOf = (box: BoxView) => open.childInstances.find((i) => i.id === box.instanceId);
  const ifaceOf = (box: BoxView, ifId: string): BusInterface | undefined => {
    const inst = instOf(box);
    return inst ? defs.get(inst.hardenId)?.interfaces.find((f) => f.id === ifId) : undefined;
  };
  // 被提升的子接口端点（已馈通到本层边界）→ 不再参与内部兄弟配对。无提升 → 空集 → 行为不变。
  const portedEndpoints = new Set(
    open.interfaces.filter((i) => i.portedFrom).map((i) => `${i.portedFrom!.instanceId}/${i.portedFrom!.interfaceId}`),
  );
  const isPorted = (box: BoxView, ifId: string): boolean => portedEndpoints.has(`${box.instanceId}/${ifId}`);

  const cands: { sBox: BoxView; sBar: BarView; cBox: BoxView; cBar: BarView; d: number }[] = [];
  for (const sBox of boxes) {
    for (const sBar of sBox.bars) {
      if (sBar.role !== "secondary") continue;
      if (isPorted(sBox, sBar.interfaceId)) continue;
      const sIf = ifaceOf(sBox, sBar.interfaceId);
      if (!sIf) continue;
      const sSeg = barSegment(sBox, sBar);
      for (const cBox of boxes) {
        if (cBox.instanceId === sBox.instanceId) continue;
        for (const cBar of cBox.bars) {
          if (cBar.role !== "client" || cBar.side !== OPP[sBar.side]) continue;
          if (isPorted(cBox, cBar.interfaceId)) continue;
          if (!edgesAbut(sSeg, barSegment(cBox, cBar))) continue;
          const cIf = ifaceOf(cBox, cBar.interfaceId);
          if (!cIf || !compatible(sIf, cIf, effectivePd(instOf(sBox), sIf), effectivePd(instOf(cBox), cIf))) continue;
          const sa = barAnchor(sBox, sBar);
          const ca = barAnchor(cBox, cBar);
          const d = Math.hypot(sBox.x + sa.x - (cBox.x + ca.x), sBox.y + sa.y - (cBox.y + ca.y));
          cands.push({ sBox, sBar, cBox, cBar, d });
        }
      }
    }
  }
  cands.sort((a, b) => a.d - b.d);
  const usedS = new Set<string>();
  const usedC = new Set<string>();
  const out: SnapPair[] = [];
  for (const c of cands) {
    const sk = `${c.sBox.instanceId}/${c.sBar.interfaceId}`;
    const ck = `${c.cBox.instanceId}/${c.cBar.interfaceId}`;
    if (usedS.has(sk) || usedC.has(ck)) continue;
    usedS.add(sk);
    usedC.add(ck);
    out.push({ secInst: c.sBox.instanceId, secIf: c.sBar.interfaceId, cliInst: c.cBox.instanceId, cliIf: c.cBar.interfaceId });
  }
  return out;
}

/** 确认配对：候选中两接口圆点已经"对上"（距离≤DOT_TOL）。圆点超出对边、够不着 → 不在内 → 断开。 */
export function findSnapPairs(doc: GenConnDocument): SnapPair[] {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  if (!open) return [];
  const boxes = computeLayout(open, doc.library);
  const boxOf = (id: string) => boxes.find((b) => b.instanceId === id);
  return findEdgePairs(doc).filter((p) => {
    const sBox = boxOf(p.secInst);
    const cBox = boxOf(p.cliInst);
    const sBar = sBox?.bars.find((b) => b.interfaceId === p.secIf);
    const cBar = cBox?.bars.find((b) => b.interfaceId === p.cliIf);
    if (!sBox || !cBox || !sBar || !cBar) return false;
    const sa = barAnchor(sBox, sBar);
    const ca = barAnchor(cBox, cBar);
    return Math.hypot(sBox.x + sa.x - (cBox.x + ca.x), sBox.y + sa.y - (cBox.y + ca.y)) <= DOT_TOL;
  });
}

const connKey = (cs: BusConnection[]) =>
  cs.map((c) => `${c.secondaryInstanceId}/${c.secondaryInterfaceId}>${c.clientInstanceId}/${c.clientInterfaceId}`).sort().join("|");

/** 把 open def 的连接对账成"恰好 = 当前几何配对集"（新增/解除）。无变化则返回原 doc。 */
export function reconcilePairs(doc: GenConnDocument): GenConnDocument {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  if (!open) return doc;
  const existing = open.connections;
  const conns: BusConnection[] = findSnapPairs(doc).map((p) => {
    const prev = existing.find(
      (e) =>
        e.secondaryInstanceId === p.secInst &&
        e.secondaryInterfaceId === p.secIf &&
        e.clientInstanceId === p.cliInst &&
        e.clientInterfaceId === p.cliIf,
    );
    return prev ?? { id: `k_${crypto.randomUUID().slice(0, 8)}`, secondaryInstanceId: p.secInst, secondaryInterfaceId: p.secIf, clientInstanceId: p.cliInst, clientInterfaceId: p.cliIf };
  });
  if (connKey(conns) === connKey(existing)) return doc;
  return { ...doc, library: { ...doc.library, defs: doc.library.defs.map((d) => (d.id === open.id ? { ...d, connections: conns } : d)) } };
}

/** 对齐锚点：被移动的一方（不传则默认 client 跟随 secondary）。 */
export interface AlignAnchor {
  instId?: string; // 被拖动的实例
  defIf?: { defId: string; ifId: string }; // 被拖动的接口（沿边拖接口条时）
}

/**
 * 配对后对齐：把 follower 接口移到与 anchor 锚点重合。矩形 follower 调 offset；多边形 follower
 * 沿轮廓投影调 perimeter（两侧都能跟随）。anchor = 被移动的一方（move 的实例 / 拖动的接口）；
 * 不传 anchor 时默认 client 跟随 secondary。动的是接口（def 层 → 同 def 所有实例一起动），盒子不动。
 * follower 够不着 anchor（投影/夹取后圆点对不上）时，由 reconcile 的 findSnapPairs(确认) 自动断开。
 * 同一 def 接口被多对牵动时取首个（避免来回跳）。无变化返回原 doc。
 */
export function alignPairs(doc: GenConnDocument, anchor?: AlignAnchor): GenConnDocument {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  if (!open) return doc;
  const boxes = computeLayout(open, doc.library);
  const boxOf = (id: string) => boxes.find((b) => b.instanceId === id);
  const instOf = (id: string) => open.childInstances.find((i) => i.id === id);
  const instDef = (id: string) => instOf(id)?.hardenId;
  const defById = new Map(doc.library.defs.map((d) => [d.id, d]));

  type Edge = NonNullable<BusInterface["edge"]>;
  // key=`${followerDefId}/${ifId}` → 目标 edge（矩形=side+offset；多边形=side+perimeter）
  const updates = new Map<string, { defId: string; ifId: string; edge: Edge }>();
  for (const p of findEdgePairs(doc)) {
    const secDefId = instDef(p.secInst);
    const cliDefId = instDef(p.cliInst);
    if (!secDefId || !cliDefId) continue;

    // client 是被移动方 → secondary 跟随；否则（含 secondary 被移动 / 无 anchor）→ client 跟随
    const matchCli =
      (anchor?.instId !== undefined && anchor.instId === p.cliInst) ||
      (anchor?.defIf !== undefined && anchor.defIf.defId === cliDefId && anchor.defIf.ifId === p.cliIf);

    const aInst = matchCli ? p.cliInst : p.secInst;
    const aIf = matchCli ? p.cliIf : p.secIf;
    const fInst = matchCli ? p.secInst : p.cliInst;
    const fIf = matchCli ? p.secIf : p.cliIf;
    const fDefId = matchCli ? secDefId : cliDefId;

    const aBox = boxOf(aInst);
    const fBox = boxOf(fInst);
    const aBar = aBox?.bars.find((b) => b.interfaceId === aIf);
    const fBar = fBox?.bars.find((b) => b.interfaceId === fIf);
    if (!aBox || !fBox || !aBar || !fBar) continue;

    const aa = barAnchor(aBox, aBar); // anchor 接口的世界锚点
    const aWorld = { x: aBox.x + aa.x, y: aBox.y + aa.y };
    const key = `${fDefId}/${fIf}`;
    if (updates.has(key)) continue;

    // follower 的朝向：把 anchor 的显示坐标点反变换回 follower 的 def 局部坐标，再在 def 帧里写 edge。
    // r=0&&!m 时 invMapPoint 是恒等，等价于旧逻辑（既有测试不受影响）。
    const fInstance = instOf(fInst);
    const r = (fInstance?.rotation ?? 0) as Rotation;
    const m = fInstance?.mirror ?? false;
    const fDef = defById.get(fDefId);
    const o0 = fDef ? defOutline(fDef) : { w: fBox.w, h: fBox.h, vertices: undefined as { x: number; y: number }[] | undefined };
    const dispLocal = { x: aWorld.x - fBox.x, y: aWorld.y - fBox.y };
    const lpDef = invMapPoint(dispLocal.x, dispLocal.y, r, m, o0.w, o0.h);

    if (o0.vertices?.length) {
      // 多边形 follower：把 def 局部点投影到 def 轮廓 → perimeter（够不着则投影会被夹到边端，
      // 圆点对不上 → reconcile 用 findSnapPairs(确认) 自动断开）
      const loc = outlineLocate(o0.vertices, lpDef.x, lpDef.y);
      updates.set(key, { defId: fDefId, ifId: fIf, edge: { side: loc.side, perimeter: loc.t } });
    } else {
      // 矩形 follower：据 def 局部点对 (w0,h0) 导出 side，沿该边取 offset
      const dl = Math.abs(lpDef.x), dr = Math.abs(o0.w - lpDef.x), dt = Math.abs(lpDef.y), db = Math.abs(o0.h - lpDef.y);
      const mn = Math.min(dl, dr, dt, db);
      const side: Side = mn === dl ? "left" : mn === dr ? "right" : mn === dt ? "top" : "bottom";
      const horiz = side === "left" || side === "right";
      let off = horiz ? (o0.h ? lpDef.y / o0.h : 0.5) : (o0.w ? lpDef.x / o0.w : 0.5);
      off = Math.min(1, Math.max(0, off));
      updates.set(key, { defId: fDefId, ifId: fIf, edge: { side, offset: off } });
    }
  }
  if (updates.size === 0) return doc;

  const byDef = new Map<string, { ifId: string; edge: Edge }[]>();
  for (const u of updates.values()) {
    const arr = byDef.get(u.defId) ?? [];
    arr.push({ ifId: u.ifId, edge: u.edge });
    byDef.set(u.defId, arr);
  }
  const approx = (a?: number, b?: number) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-6);
  const edgeEq = (a: Edge | undefined, b: Edge) => a?.side === b.side && approx(a?.offset, b.offset) && approx(a?.perimeter, b.perimeter);

  let changed = false;
  const defs = doc.library.defs.map((d) => {
    const ups = byDef.get(d.id);
    if (!ups) return d;
    let defChanged = false;
    const interfaces = d.interfaces.map((f) => {
      const u = ups.find((x) => x.ifId === f.id);
      if (!u || edgeEq(f.edge, u.edge)) return f;
      defChanged = true;
      return { ...f, edge: u.edge };
    });
    if (!defChanged) return d;
    changed = true;
    return { ...d, interfaces };
  });
  if (!changed) return doc;
  return { ...doc, library: { ...doc.library, defs } };
}

const approxEq = (a?: number, b?: number): boolean => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-6);
const edgeEq = (a: BusInterface["edge"], b: NonNullable<BusInterface["edge"]>): boolean =>
  a?.side === b.side && approxEq(a?.offset, b.offset) && approxEq(a?.perimeter, b.perimeter);

/** 把局部点 (lx,ly) 投影到 outline 边界：矩形→最近边 + 归一化 offset；多边形→outlineLocate 周长。 */
function edgeFromProjection(o: { w: number; h: number; vertices?: { x: number; y: number }[] }, lx: number, ly: number): NonNullable<BusInterface["edge"]> {
  if (o.vertices?.length) {
    const loc = outlineLocate(o.vertices, lx, ly);
    return { side: loc.side, perimeter: loc.t };
  }
  const dl = Math.abs(lx), dr = Math.abs(o.w - lx), dt = Math.abs(ly), db = Math.abs(o.h - ly);
  const mn = Math.min(dl, dr, dt, db);
  const side: Side = mn === dl ? "left" : mn === dr ? "right" : mn === dt ? "top" : "bottom";
  const horiz = side === "left" || side === "right";
  let off = horiz ? (o.h ? ly / o.h : 0.5) : (o.w ? lx / o.w : 0.5);
  off = Math.min(1, Math.max(0, off));
  return { side, offset: off };
}

/** 正向核心（B 跟 X）：以 owner 为坐标系，把源子接口的世界锚点投影到 owner 边界。 */
function portedEdgeFor(lib: HardenLibrary, owner: HardenDef, childInstId: string, childIfId: string): BusInterface["edge"] {
  const box = computeLayout(owner, lib).find((b) => b.instanceId === childInstId);
  const bar = box?.bars.find((b) => b.interfaceId === childIfId);
  if (!box || !bar) return undefined;
  const a = barAnchor(box, bar);
  return edgeFromProjection(defOutline(owner), box.x + a.x, box.y + a.y); // owner 边界原点在 (0,0)，世界锚点即局部点
}

/** 反向核心（X 跟 B）：以 owner 为坐标系，把边界接口 B 的世界锚点投影回它的源子块轮廓（经 invMapPoint 处理朝向）。 */
function portedSourceEdgeFor(lib: HardenLibrary, owner: HardenDef, B: BusInterface): BusInterface["edge"] {
  if (!B.portedFrom) return undefined;
  const childInst = owner.childInstances.find((i) => i.id === B.portedFrom!.instanceId);
  const childDef = lib.defs.find((d) => d.id === childInst?.hardenId);
  const cbox = computeLayout(owner, lib).find((b) => b.instanceId === B.portedFrom!.instanceId);
  if (!childInst || !childDef || !cbox) return undefined;
  const o = defOutline(owner);
  const outlineBox = { w: o.w, h: o.h, vertices: o.vertices } as unknown as BoxView;
  const bbar = { interfaceId: B.id, busType: B.busType, role: B.role, side: B.edge?.side ?? "left", t: B.edge?.perimeter ?? B.edge?.offset ?? 0.5, perimeter: B.edge?.perimeter, label: "" } as BarView;
  const ba = barAnchor(outlineBox, bbar);
  const r = (childInst.rotation ?? 0) as Rotation;
  const m = childInst.mirror ?? false;
  const o0 = defOutline(childDef);
  const lp = invMapPoint(ba.x - cbox.x, ba.y - cbox.y, r, m, o0.w, o0.h);
  return edgeFromProjection(o0, lp.x, lp.y);
}

/** 正向（B 跟 X），以 open def 为 owner。portInterface 初次摆位 / 测试用。 */
export function portedEdge(doc: GenConnDocument, childInstId: string, childIfId: string): BusInterface["edge"] {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  return open ? portedEdgeFor(doc.library, open, childInstId, childIfId) : undefined;
}

/** 反向（X 跟 B），以 open def 为 owner。测试用。 */
export function portedSourceEdge(doc: GenConnDocument, boundaryIfId: string): BusInterface["edge"] {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  const B = open?.interfaces.find((i) => i.id === boundaryIfId);
  return open && B ? portedSourceEdgeFor(doc.library, open, B) : undefined;
}

/**
 * 提升对互跟（def-centric）：
 *  - 反向：被拖的是某 def(M) 上的提升边界接口 B（anchor.defIf 命中 portedFrom 接口）→ M 内源接口 X 跟随。
 *    M 既可是 open def（M 视图拖虚线框上的 B），也可是父层里的子块 def（父层拖 M 盒上的 B）。用 M 自己的几何。
 *  - 正向：否则 → open def 的每个边界提升接口 B 跟随它的源 X（拖 X / 移动子块 / 无 anchor）。
 * 与 alignPairs 同 anchor 语义；无更新 → 原样返回。X/B 均为 def 级编辑。
 */
export function reconcilePortedEdges(doc: GenConnDocument, anchor?: AlignAnchor): GenConnDocument {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  if (!open) return doc;

  // 反向触发：anchor 指向的接口是某 def 上的 portedFrom 边界接口 → 以该 def 为 owner 让其源接口跟随。
  const aDef = anchor?.defIf ? doc.library.defs.find((d) => d.id === anchor.defIf!.defId) : undefined;
  const aB = aDef?.interfaces.find((i) => i.id === anchor!.defIf!.ifId);
  const reverseOwner = aB?.portedFrom ? aDef : undefined;

  const openEdge = new Map<string, NonNullable<BusInterface["edge"]>>(); // open def 的 B.id → edge（正向）
  const childEdge = new Map<string, NonNullable<BusInterface["edge"]>>(); // `${childDefId}/${X.id}` → edge（反向）

  if (reverseOwner && aB) {
    const childInst = reverseOwner.childInstances.find((i) => i.id === aB.portedFrom!.instanceId);
    const childDef = doc.library.defs.find((d) => d.id === childInst?.hardenId);
    const X = childDef?.interfaces.find((i) => i.id === aB.portedFrom!.interfaceId);
    if (childInst && childDef && X) {
      const e = portedSourceEdgeFor(doc.library, reverseOwner, aB);
      if (e) childEdge.set(`${childDef.id}/${X.id}`, e);
    }
  } else {
    for (const B of open.interfaces) {
      if (!B.portedFrom) continue;
      const e = portedEdgeFor(doc.library, open, B.portedFrom.instanceId, B.portedFrom.interfaceId);
      if (e) openEdge.set(B.id, e);
    }
  }
  if (openEdge.size === 0 && childEdge.size === 0) return doc;

  let changed = false;
  const defs = doc.library.defs.map((d) => {
    let dc = false;
    const interfaces = d.interfaces.map((f) => {
      const e = d.id === open.id ? openEdge.get(f.id) : childEdge.get(`${d.id}/${f.id}`);
      if (e && !edgeEq(f.edge, e)) { dc = true; return { ...f, edge: e }; }
      return f;
    });
    if (!dc) return d;
    changed = true;
    return { ...d, interfaces };
  });
  return changed ? { ...doc, library: { ...doc.library, defs } } : doc;
}
