// 编辑操作 —— 对 GenConnDocument 的纯变换（返回新 doc，不可变更新）。
// 放在 core 层（非 UI），无 React 依赖，可在 node:test 直接单测；store 只是薄封装。

import type { BusInterface, GenConnDocument, HardenDef, HardenInstance, HardenLibrary, Id } from "./model.ts";
import { findInstantiationCycle } from "./validate.ts";

/** 某实例某接口的「有效 pd」：实例按接口覆盖优先，否则回退接口自身的 powerDomain（仅用于 BISR 匹配，不进端口名）。 */
export function effectivePd(inst: HardenInstance | undefined, iface: BusInterface): string | undefined {
  return inst?.ifacePd?.[iface.id] ?? iface.powerDomain;
}

/**
 * 连接两端是否兼容（§8）：同 busType；BISR 同 pd 同 omitMemCtrl、BSCAN 同 variant、SSN 同 busWidth。
 * sPd/cPd = 两端的「有效 pd」（默认回退接口自身 powerDomain）；调用方有实例上下文时传 effectivePd(...)。
 */
export function compatible(s: BusInterface, c: BusInterface, sPd: string | undefined = s.powerDomain, cPd: string | undefined = c.powerDomain): boolean {
  if (s.busType !== c.busType) return false;
  if (s.busType === "BISR" && sPd !== cPd) return false;
  if (s.busType === "BISR" && !!s.omitMemCtrl !== !!c.omitMemCtrl) return false;
  if (s.busType === "BSCAN" && s.bscanVariant !== c.bscanVariant) return false;
  if (s.busType === "SSN" && (s.busWidth ?? 4) !== (c.busWidth ?? 4)) return false;
  return true;
}

const clientKey = (i: BusInterface): string =>
  i.busType === "BISR" ? `BISR:${i.powerDomain}` : i.busType === "SSN" ? `SSN:${i.interfaceName ?? ""}` : i.busType;

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function openDefOf(doc: GenConnDocument): HardenDef {
  const d = doc.library.defs.find((x) => x.id === doc.ui.openDefId);
  if (!d) throw new Error("open def not found");
  return d;
}

/** 库内未用过的 harden 名（harden1/2…）。 */
function uniqueDesignName(lib: HardenLibrary): string {
  const used = new Set(lib.defs.map((d) => d.designName));
  let n = 1;
  while (used.has(`harden${n}`)) n++;
  return `harden${n}`;
}

/** open def 内未用过的实例名（<base>_i1/2…）。 */
function nextInstanceName(def: HardenDef, base: string): string {
  const used = new Set(def.childInstances.map((i) => i.instanceName));
  let n = 1;
  while (used.has(`${base}_i${n}`)) n++;
  return `${base}_i${n}`;
}

/** 新实例的默认摆位（按已有数量错开，避免完全重叠）。 */
function placePos(def: HardenDef): { x: number; y: number } {
  const k = def.childInstances.length;
  return { x: 40 + (k % 6) * 40, y: 40 + Math.floor(k / 6) * 40 };
}

/** 对 open def 应用一个变换，返回新 doc（其余 def 原样保留）。 */
export function mapOpenDef(doc: GenConnDocument, fn: (def: HardenDef) => HardenDef): GenConnDocument {
  const openId = doc.ui.openDefId;
  return {
    ...doc,
    library: { ...doc.library, defs: doc.library.defs.map((d) => (d.id === openId ? fn(d) : d)) },
  };
}

/** 更新 open def 下某实例的摆放位置。 */
export function moveInstance(doc: GenConnDocument, instId: Id, pos: { x: number; y: number }): GenConnDocument {
  return mapOpenDef(doc, (def) => ({
    ...def,
    childInstances: def.childInstances.map((i) => (i.id === instId ? { ...i, position: pos } : i)),
  }));
}

/** 拖「空白 harden」：新建临时 def（inLibrary:false，tiling，无接口）+ 一个实例落到 open def。at=显式落点（缺省错开摆放）。 */
export function addBlankHarden(doc: GenConnDocument, at?: { x: number; y: number }): GenConnDocument {
  const open = openDefOf(doc);
  const name = uniqueDesignName(doc.library);
  const def: HardenDef = {
    id: newId("def"),
    designName: name,
    designLevel: "sub_block",
    designType: "tiling",
    size: { w: 400, h: 340 }, // 默认 harden 放大 ~2.5×（原 BOX_W×BOX_H=160×140），给 data source 卡片留位
    interfaces: [],
    childInstances: [],
    connections: [],
    inLibrary: false,
  };
  const inst: HardenInstance = { id: newId("inst"), instanceName: nextInstanceName(open, name), hardenId: def.id, position: at ?? placePos(open) };
  const withDef: GenConnDocument = { ...doc, library: { ...doc.library, defs: [...doc.library.defs, def] } };
  return mapOpenDef(withDef, (d) => ({ ...d, childInstances: [...d.childInstances, inst] }));
}

/** 用画出的正交多边形新建一个临时 harden（顶点归一化到局部坐标，实例落在包围盒左上角）。 */
export function addPolygonHarden(doc: GenConnDocument, points: { x: number; y: number }[]): GenConnDocument {
  if (points.length < 3) return doc;
  const open = openDefOf(doc);
  const ox = Math.min(...points.map((p) => p.x));
  const oy = Math.min(...points.map((p) => p.y));
  const verts = points.map((p) => ({ x: p.x - ox, y: p.y - oy }));
  const name = uniqueDesignName(doc.library);
  const def: HardenDef = {
    id: newId("def"),
    designName: name,
    designLevel: "sub_block",
    designType: "tiling",
    interfaces: [],
    childInstances: [],
    connections: [],
    inLibrary: false,
    vertices: verts,
  };
  const inst: HardenInstance = { id: newId("inst"), instanceName: nextInstanceName(open, name), hardenId: def.id, position: { x: ox, y: oy } };
  const withDef: GenConnDocument = { ...doc, library: { ...doc.library, defs: [...doc.library.defs, def] } };
  return mapOpenDef(withDef, (d) => ({ ...d, childInstances: [...d.childInstances, inst] }));
}

/** 点库模块：在 open def 加一个引用该 def 的实例。at=显式落点（缺省错开摆放）。 */
export function addInstanceFromDef(doc: GenConnDocument, defId: Id, at?: { x: number; y: number }): GenConnDocument {
  if (defId === doc.ui.openDefId) throw new Error("Cannot instantiate the current layer into itself");
  const target = doc.library.defs.find((d) => d.id === defId);
  if (!target) throw new Error(`Unknown def '${defId}'`);
  const open = openDefOf(doc);
  const inst: HardenInstance = { id: newId("inst"), instanceName: nextInstanceName(open, target.designName), hardenId: defId, position: at ?? placePos(open) };
  return mapOpenDef(doc, (d) => ({ ...d, childInstances: [...d.childInstances, inst] }));
}

/** 保存到模块库：置 inLibrary=true（可顺带改名，重名拒绝）。 */
export function saveDefToLibrary(doc: GenConnDocument, defId: Id, name?: string): GenConnDocument {
  const def = doc.library.defs.find((d) => d.id === defId);
  if (!def) throw new Error(`Unknown def '${defId}'`);
  let designName = def.designName;
  if (name && name !== def.designName) {
    if (doc.library.defs.some((d) => d.id !== defId && d.designName === name)) throw new Error(`A module named '${name}' already exists`);
    designName = name;
  }
  return {
    ...doc,
    library: { ...doc.library, defs: doc.library.defs.map((d) => (d.id === defId ? { ...d, inLibrary: true, designName } : d)) },
  };
}

/** 从模块库移除（仅置 inLibrary=false；def 与实例保留）。 */
export function removeFromLibrary(doc: GenConnDocument, defId: Id): GenConnDocument {
  return {
    ...doc,
    library: { ...doc.library, defs: doc.library.defs.map((d) => (d.id === defId ? { ...d, inLibrary: false } : d)) },
  };
}

/** 某 def 当前被多少实例引用（跨所有 def）。 */
export function usageCount(doc: GenConnDocument, defId: Id): number {
  return doc.library.defs.reduce((n, d) => n + d.childInstances.filter((i) => i.hardenId === defId).length, 0);
}

export type DefAttrs = Partial<Pick<HardenDef, "designName" | "designLevel" | "designType" | "fileName" | "hideChildren" | "color">>;

/** 改 def 属性（影响其所有实例）。designName 唯一；hierarchical 不得含 secondary。 */
export function updateDefAttrs(doc: GenConnDocument, defId: Id, patch: DefAttrs): GenConnDocument {
  const def = doc.library.defs.find((d) => d.id === defId);
  if (!def) throw new Error(`Unknown def '${defId}'`);
  if (patch.designName && patch.designName !== def.designName) {
    if (doc.library.defs.some((d) => d.id !== defId && d.designName === patch.designName)) {
      throw new Error(`A module named '${patch.designName}' already exists`);
    }
  }
  if (patch.designType === "hierarchical" && def.interfaces.some((i) => i.role === "secondary" && !i.portedFrom)) {
    throw new Error("hierarchical does not allow a secondary interface (please delete the secondary first)");
  }
  return {
    ...doc,
    library: { ...doc.library, defs: doc.library.defs.map((d) => (d.id === defId ? { ...d, ...patch } : d)) },
  };
}

/** 改 open def 下某实例名（同层唯一）。 */
export function renameInstance(doc: GenConnDocument, instId: Id, name: string): GenConnDocument {
  return mapOpenDef(doc, (def) => {
    if (def.childInstances.some((i) => i.id !== instId && i.instanceName === name)) {
      throw new Error(`Instance name '${name}' already exists`);
    }
    return { ...def, childInstances: def.childInstances.map((i) => (i.id === instId ? { ...i, instanceName: name } : i)) };
  });
}

/** 设/清某实例对某接口的 pd 覆盖（仅本实例、BISR 匹配用，不进端口名）。pd 空 → 删除该覆盖；覆盖清空则去掉 ifacePd。 */
export function setInstanceIfacePd(doc: GenConnDocument, instId: Id, ifId: Id, pd?: string): GenConnDocument {
  return mapOpenDef(doc, (def) => ({
    ...def,
    childInstances: def.childInstances.map((i) => {
      if (i.id !== instId) return i;
      const next = { ...(i.ifacePd ?? {}) };
      if (pd) next[ifId] = pd;
      else delete next[ifId];
      return { ...i, ifacePd: Object.keys(next).length ? next : undefined };
    }),
  }));
}

// ---- 配对（连接）----

/** 在 open def 里把一个 secondary 接口配对到一个 client 接口（§8 校验 + 点对点）。 */
export function pairInterfaces(doc: GenConnDocument, secInst: Id, secIf: Id, cliInst: Id, cliIf: Id): GenConnDocument {
  const open = openDefOf(doc);
  const A = open.childInstances.find((i) => i.id === secInst);
  const B = open.childInstances.find((i) => i.id === cliInst);
  if (!A || !B) throw new Error("Instance is not in the current layer");
  if (secInst === cliInst) throw new Error("Cannot pair with itself");
  const defs = new Map(doc.library.defs.map((d) => [d.id, d]));
  const S = defs.get(A.hardenId)?.interfaces.find((i) => i.id === secIf);
  const C = defs.get(B.hardenId)?.interfaces.find((i) => i.id === cliIf);
  if (!S || S.role !== "secondary") throw new Error("Start point is not a secondary interface");
  if (!C || C.role !== "client") throw new Error("End point is not a client interface");
  if (!compatible(S, C, effectivePd(A, S), effectivePd(B, C))) throw new Error(`Interface not compatible (${S.busType})`);
  const dup = open.connections.some(
    (c) =>
      (c.clientInstanceId === cliInst && c.clientInterfaceId === cliIf) ||
      (c.secondaryInstanceId === secInst && c.secondaryInterfaceId === secIf),
  );
  if (dup) throw new Error("This client or secondary is already paired (point-to-point)");
  const conn = { id: newId("k"), secondaryInstanceId: secInst, secondaryInterfaceId: secIf, clientInstanceId: cliInst, clientInterfaceId: cliIf };
  return mapOpenDef(doc, (d) => ({ ...d, connections: [...d.connections, conn] }));
}

/** 解除 open def 里的一条配对。 */
export function unpair(doc: GenConnDocument, connId: Id): GenConnDocument {
  return mapOpenDef(doc, (d) => ({ ...d, connections: d.connections.filter((c) => c.id !== connId) }));
}

// ---- 形状（视图，不影响生成）----

/** 调整某 def 的矩形尺寸（影响其所有实例）。 */
export function resizeDef(doc: GenConnDocument, defId: Id, w: number, h: number): GenConnDocument {
  const W = Math.max(80, Math.round(w));
  const H = Math.max(60, Math.round(h));
  return mapDef(doc, defId, (d) => ({ ...d, size: { w: W, h: H } }));
}

/**
 * 由"包围盒新坐标"调整某实例对应 def 的大小（四角 resize 用）。
 * 矩形→改 size；多边形→把顶点按新包围盒等比缩放。同时更新该实例位置（被拖角的对角作锚点由调用方算好）。
 */
export function resizeBox(doc: GenConnDocument, instId: Id, x: number, y: number, w: number, h: number): GenConnDocument {
  const openId = doc.ui.openDefId;
  const open = doc.library.defs.find((d) => d.id === openId);
  const inst = open?.childInstances.find((i) => i.id === instId);
  if (!inst) return doc;
  const W = Math.max(80, Math.round(w));
  const H = Math.max(60, Math.round(h));
  const X = Math.round(x);
  const Y = Math.round(y);
  const targetId = inst.hardenId;
  const defs = doc.library.defs.map((d) => {
    let nd = d;
    if (d.id === openId) {
      nd = { ...nd, childInstances: nd.childInstances.map((i) => (i.id === instId ? { ...i, position: { x: X, y: Y } } : i)) };
    }
    if (nd.id === targetId) {
      if (nd.vertices?.length) {
        const ow = Math.max(...nd.vertices.map((p) => p.x)) || 1;
        const oh = Math.max(...nd.vertices.map((p) => p.y)) || 1;
        nd = { ...nd, vertices: nd.vertices.map((p) => ({ x: Math.round((p.x * W) / ow), y: Math.round((p.y * H) / oh) })) };
      } else {
        nd = { ...nd, size: { w: W, h: H } };
      }
    }
    return nd;
  });
  return { ...doc, library: { ...doc.library, defs } };
}

/** 设/清多边形顶点（undefined = 回到矩形）。 */
export function setVertices(doc: GenConnDocument, defId: Id, verts: { x: number; y: number }[] | undefined): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, vertices: verts }));
}

/** 拖动一个顶点，保持 90° 正交（相邻边各保持原方向，跟着调整邻点共享坐标）。 */
export function moveVertex(doc: GenConnDocument, defId: Id, index: number, pos: { x: number; y: number }): GenConnDocument {
  return mapDef(doc, defId, (d) => {
    if (!d.vertices || index < 0 || index >= d.vertices.length) return d;
    const v = d.vertices.map((p) => ({ ...p }));
    const n = v.length;
    const old = v[index];
    const prev = v[(index - 1 + n) % n];
    const next = v[(index + 1) % n];
    if (prev.y === old.y) prev.y = pos.y;
    else if (prev.x === old.x) prev.x = pos.x;
    if (next.y === old.y) next.y = pos.y;
    else if (next.x === old.x) next.x = pos.x;
    v[index] = { x: pos.x, y: pos.y };
    return { ...d, vertices: v };
  });
}

/** 由尺寸生成一个 L 形（右下角缺口）的正交多边形顶点。 */
export function lShapeVerts(w: number, h: number): { x: number; y: number }[] {
  const cx = Math.round(w * 0.6);
  const cy = Math.round(h * 0.6);
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: cy },
    { x: cx, y: cy },
    { x: cx, y: h },
    { x: 0, y: h },
  ];
}

/** 旋转 open def 下某实例（纯视图，不影响生成）：cw +90 / ccw +270，归一到 0|90|180|270。 */
export function rotateInstance(doc: GenConnDocument, instId: Id, dir: "cw" | "ccw"): GenConnDocument {
  return mapOpenDef(doc, (def) => ({
    ...def,
    childInstances: def.childInstances.map((i) =>
      i.id === instId ? { ...i, rotation: (((i.rotation ?? 0) + (dir === "cw" ? 90 : 270)) % 360) as 0 | 90 | 180 | 270 } : i,
    ),
  }));
}

/** 镜像 open def 下某实例（纯视图）：h 翻 mirror；v = 翻 mirror 且 +180 旋转。 */
export function mirrorInstance(doc: GenConnDocument, instId: Id, axis: "h" | "v"): GenConnDocument {
  return mapOpenDef(doc, (def) => ({
    ...def,
    childInstances: def.childInstances.map((i) => {
      if (i.id !== instId) return i;
      const mirror = !(i.mirror ?? false);
      if (axis === "h") return { ...i, mirror };
      return { ...i, mirror, rotation: (((i.rotation ?? 0) + 180) % 360) as 0 | 90 | 180 | 270 };
    }),
  }));
}

/** 一个待粘贴项（来自剪贴板）：引用某 def + 携带摆位/朝向 + 命名基。 */
export interface PasteItem {
  hardenId: Id;
  position?: { x: number; y: number };
  rotation?: 0 | 90 | 180 | 270;
  mirror?: boolean;
  baseName: string;
}

/** 粘贴：在 open def 追加引用同 hardenId 的新实例（唯一名 + 偏移 dx/dy）；跳过会成环的项。返回新 doc + 新实例 id。 */
export function pasteInstances(doc: GenConnDocument, items: PasteItem[], dx: number, dy: number): { doc: GenConnDocument; newIds: Id[] } {
  const openId = doc.ui.openDefId;
  let out = doc;
  const newIds: Id[] = [];
  for (const it of items) {
    if (it.hardenId === openId) continue; // 自我实例化 → 跳过
    const open = openDefOf(out);
    const inst: HardenInstance = {
      id: newId("inst"),
      instanceName: nextInstanceName(open, it.baseName),
      hardenId: it.hardenId,
      position: { x: (it.position?.x ?? 0) + dx, y: (it.position?.y ?? 0) + dy },
      rotation: it.rotation,
      mirror: it.mirror,
    };
    const tentative = mapOpenDef(out, (d) => ({ ...d, childInstances: [...d.childInstances, inst] }));
    if (findInstantiationCycle(tentative.library)) continue; // 间接成环 → 跳过
    out = tentative;
    newIds.push(inst.id);
  }
  return { doc: out, newIds };
}

/** 删除 open def 下的一个实例，并级联清理引用它的连接 + 指向它的悬空提升边界接口。 */
export function deleteInstance(doc: GenConnDocument, instId: Id): GenConnDocument {
  const next = mapOpenDef(doc, (def) => ({ ...def, childInstances: def.childInstances.filter((i) => i.id !== instId) }));
  return pruneInvalidConnections(pruneDanglingPorts(next));
}

/**
 * 把 open def 下的实例 instId 重新归属到 targetDefId（拖进某个更大的 harden 内部）。
 * relPos = 在新父内部的相对坐标。会拒绝产生实例化环；并级联清理旧层失效连接。
 */
export function reparentInstance(doc: GenConnDocument, instId: Id, targetDefId: Id, relPos: { x: number; y: number }): GenConnDocument {
  const openId = doc.ui.openDefId;
  if (targetDefId === openId) return doc;
  const open = doc.library.defs.find((d) => d.id === openId);
  const inst = open?.childInstances.find((i) => i.id === instId);
  if (!inst) return doc;
  const moved: HardenInstance = { ...inst, position: relPos };
  const defs = doc.library.defs.map((d) => {
    if (d.id === openId) return { ...d, childInstances: d.childInstances.filter((i) => i.id !== instId) };
    if (d.id === targetDefId) return { ...d, childInstances: [...d.childInstances, moved] };
    return d;
  });
  const next: GenConnDocument = { ...doc, library: { ...doc.library, defs } };
  if (findInstantiationCycle(next.library)) return doc; // 拒绝成环
  return pruneInvalidConnections(pruneDanglingPorts(next));
}

// ---- 接口 ----

function mapDef(doc: GenConnDocument, defId: Id, fn: (d: HardenDef) => HardenDef): GenConnDocument {
  return { ...doc, library: { ...doc.library, defs: doc.library.defs.map((d) => (d.id === defId ? fn(d) : d)) } };
}

/** 删除任何 def 中已失效的连接（接口缺失 / 角色不符 / 不再兼容）。接口增删改后调用以级联清理。 */
export function pruneInvalidConnections(doc: GenConnDocument): GenConnDocument {
  const defs = new Map(doc.library.defs.map((d) => [d.id, d]));
  return {
    ...doc,
    library: {
      ...doc.library,
      defs: doc.library.defs.map((P) => {
        const instById = new Map(P.childInstances.map((i) => [i.id, i]));
        const kept = P.connections.filter((c) => {
          const A = instById.get(c.secondaryInstanceId);
          const B = instById.get(c.clientInstanceId);
          if (!A || !B) return false;
          const S = defs.get(A.hardenId)?.interfaces.find((i) => i.id === c.secondaryInterfaceId);
          const C = defs.get(B.hardenId)?.interfaces.find((i) => i.id === c.clientInterfaceId);
          if (!S || !C || S.role !== "secondary" || C.role !== "client") return false;
          return compatible(S, C, effectivePd(A, S), effectivePd(B, C));
        });
        return kept.length === P.connections.length ? P : { ...P, connections: kept };
      }),
    },
  };
}

/** 删除"悬空提升"：带 portedFrom 但其 (实例 / 该实例 def 的接口) 已不存在的边界接口（跨所有 def）。
 *  迭代到不动点：清掉一层提升可能让更上层的提升也悬空（多级馈通链）。 */
export function pruneDanglingPorts(doc: GenConnDocument): GenConnDocument {
  let cur = doc;
  for (;;) {
    const next = pruneDanglingPortsOnce(cur);
    if (next === cur) return cur;
    cur = next;
  }
}

function pruneDanglingPortsOnce(doc: GenConnDocument): GenConnDocument {
  const defs = new Map(doc.library.defs.map((d) => [d.id, d]));
  let changed = false;
  const out = doc.library.defs.map((P) => {
    const kept = P.interfaces.filter((i) => {
      if (!i.portedFrom) return true;
      const inst = P.childInstances.find((c) => c.id === i.portedFrom!.instanceId);
      if (!inst) return false;
      return !!defs.get(inst.hardenId)?.interfaces.some((f) => f.id === i.portedFrom!.interfaceId);
    });
    if (kept.length === P.interfaces.length) return P;
    changed = true;
    return { ...P, interfaces: kept };
  });
  return changed ? { ...doc, library: { ...doc.library, defs: out } } : doc;
}

/** 在某 def 边上加接口。校验 hierarchical 不得有 secondary、同类型 client 唯一。 */
/** Same checks `addInterface` throws on, surfaced as a reason string instead — so the Instance
 *  panel's "+ Interface" button can disable itself with an explanation BEFORE the click, rather
 *  than only reacting with a toast after. Single source of truth: `addInterface` calls this too,
 *  so the two can never drift apart. */
export function canAddInterface(def: HardenDef, spec: Omit<BusInterface, "id">): string | null {
  if (spec.role === "secondary" && def.designType === "hierarchical") {
    return "hierarchical def does not allow a secondary interface";
  }
  if (spec.placement === "other" && !(spec.isDataSource && spec.role === "client")) {
    return "other placement is only available for a data source's client";
  }
  if (spec.role === "client") {
    const k = clientKey(spec as BusInterface);
    if (def.interfaces.some((i) => i.role === "client" && clientKey(i) === k)) {
      return `A client of this type already exists (${k})`;
    }
  }
  return null;
}

export function addInterface(doc: GenConnDocument, defId: Id, spec: Omit<BusInterface, "id">): GenConnDocument {
  const def = doc.library.defs.find((d) => d.id === defId);
  if (!def) throw new Error(`Unknown def '${defId}'`);
  const reason = canAddInterface(def, spec);
  if (reason) throw new Error(reason);
  const iface: BusInterface = { ...spec, id: newId("if") };
  return mapDef(doc, defId, (d) => ({ ...d, interfaces: [...d.interfaces, iface] }));
}

/** 改接口参数；改完级联清理因此失效的配对。 */
export function updateInterface(doc: GenConnDocument, defId: Id, ifId: Id, patch: Partial<BusInterface>): GenConnDocument {
  const def = doc.library.defs.find((d) => d.id === defId);
  if (!def) throw new Error(`Unknown def '${defId}'`);
  const next = mapDef(doc, defId, (d) => ({
    ...d,
    interfaces: d.interfaces.map((i) => (i.id === ifId ? { ...i, ...patch } : i)),
  }));
  return pruneInvalidConnections(next);
}

/** 删接口；级联删除引用它的连接 + 指向它的悬空提升边界接口（跨所有 def 的所有实例）。 */
export function removeInterface(doc: GenConnDocument, defId: Id, ifId: Id): GenConnDocument {
  const next = mapDef(doc, defId, (d) => ({ ...d, interfaces: d.interfaces.filter((i) => i.id !== ifId) }));
  return pruneInvalidConnections(pruneDanglingPorts(next));
}

/** 设接口在边上的位置（矩形：side+offset，视图，不级联）。 */
export function setInterfaceEdge(doc: GenConnDocument, defId: Id, ifId: Id, side: NonNullable<BusInterface["edge"]>["side"], offset: number): GenConnDocument {
  return mapDef(doc, defId, (d) => ({
    ...d,
    interfaces: d.interfaces.map((i) => (i.id === ifId ? { ...i, edge: { side, offset } } : i)),
  }));
}

/** 设接口在多边形轮廓上的位置（perimeter 0..1；side 为导出朝向，配对用）。 */
export function setInterfacePerimeter(doc: GenConnDocument, defId: Id, ifId: Id, side: NonNullable<BusInterface["edge"]>["side"], perimeter: number): GenConnDocument {
  return mapDef(doc, defId, (d) => ({
    ...d,
    interfaces: d.interfaces.map((i) => (i.id === ifId ? { ...i, edge: { side, perimeter } } : i)),
  }));
}

/** 设接口摆放 pin/other（纯视图）。other 限 data source client 或 JTAG1838 secondary；切到 other 且无 innerPos 时给默认位。 */
export function setInterfacePlacement(doc: GenConnDocument, defId: Id, ifId: Id, placement: "pin" | "other"): GenConnDocument {
  const iface = doc.library.defs.find((d) => d.id === defId)?.interfaces.find((i) => i.id === ifId);
  if (placement === "other" && !((iface?.isDataSource && iface?.role === "client") || (iface?.busType === "JTAG1838" && iface?.role === "secondary"))) throw new Error("other placement is limited to data source client or JTAG1838 secondary");
  return mapDef(doc, defId, (d) => ({
    ...d,
    interfaces: d.interfaces.map((i) =>
      i.id === ifId ? { ...i, placement, innerPos: placement === "other" ? i.innerPos ?? { x: 40, y: 40 } : i.innerPos } : i,
    ),
  }));
}

/** 设 other 接口在盒内的位置（纯视图）。 */
export function setInterfaceInnerPos(doc: GenConnDocument, defId: Id, ifId: Id, pos: { x: number; y: number }): GenConnDocument {
  return mapDef(doc, defId, (d) => ({
    ...d,
    interfaces: d.interfaces.map((i) => (i.id === ifId ? { ...i, innerPos: pos } : i)),
  }));
}

/** 标记/取消 data source（纯视图）。取消时把 other 复位为边上（清 placement）。 */
export function setDataSource(doc: GenConnDocument, defId: Id, ifId: Id, isDataSource: boolean): GenConnDocument {
  return mapDef(doc, defId, (d) => ({
    ...d,
    interfaces: d.interfaces.map((i) =>
      i.id === ifId ? { ...i, isDataSource, placement: !isDataSource && i.placement === "other" ? "pin" : i.placement } : i,
    ),
  }));
}

// ---- 接口提升（porting / 馈通）----

/**
 * 把 open def(M) 下某子块实例(childInstId)的接口(childIfId)提升到 M 的边界：
 * 在 M 上新建一个同款 BusInterface（复制 busType/role/interfaceName/powerDomain/busWidth/bscanVariant/pdMatchOnly/omitMemCtrl），
 * 带 portedFrom 链接；默认 edge 摆位 client→左 / secondary→右（同 resolveSide 约定）。
 * 子块自身接口不动。已存在同 (childInstId,childIfId) 的提升边界接口则幂等不变。
 */
export function portInterface(doc: GenConnDocument, childInstId: Id, childIfId: Id, edge?: BusInterface["edge"]): GenConnDocument {
  const open = openDefOf(doc);
  if (open.interfaces.some((i) => i.portedFrom?.instanceId === childInstId && i.portedFrom?.interfaceId === childIfId)) {
    return doc; // 幂等
  }
  const inst = open.childInstances.find((i) => i.id === childInstId);
  if (!inst) throw new Error("Sub-block instance is not in the current layer");
  const childDef = doc.library.defs.find((d) => d.id === inst.hardenId);
  const src = childDef?.interfaces.find((i) => i.id === childIfId);
  if (!src) throw new Error("Sub-interface does not exist");
  const iface: BusInterface = {
    id: newId("if"),
    busType: src.busType,
    role: src.role,
    interfaceName: src.interfaceName,
    powerDomain: src.powerDomain,
    busWidth: src.busWidth,
    bscanVariant: src.bscanVariant,
    pdMatchOnly: src.pdMatchOnly,
    omitMemCtrl: src.omitMemCtrl,
    // 提升位置：传入则用之（UI 把源子接口位置投影到边界算好）；否则默认 client→左 / secondary→右
    edge: edge ?? { side: src.role === "client" ? "left" : "right" },
    portedFrom: { instanceId: childInstId, interfaceId: childIfId },
  };
  return mapOpenDef(doc, (d) => ({ ...d, interfaces: [...d.interfaces, iface] }));
}

/** 取消提升：删除 open def 上某个带 portedFrom 的边界接口。 */
export function unportInterface(doc: GenConnDocument, boundaryIfId: Id): GenConnDocument {
  return mapOpenDef(doc, (d) => ({
    ...d,
    interfaces: d.interfaces.filter((i) => !(i.id === boundaryIfId && i.portedFrom)),
  }));
}
