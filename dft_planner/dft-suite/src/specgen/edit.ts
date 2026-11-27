// DFT 编辑纯函数：接收 doc + 目标 def id，返回新 doc（不可变）。逻辑属 DFT，不进 core/edit.ts。
import type { GenConnDocument, HardenDef, Id } from "../genconn/core/model.ts";
import type { DftIpInstance, DftIpType, DftConfig, DftEndpoint, DftWire } from "../genconn/core/dft-model.ts";
import type { BusType } from "../genconn/layers.ts";
import { dftIpSize, catalogEntry } from "./catalog.ts";

function newId(prefix: string): Id {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

/** 对指定 def 应用变换，返回新 doc（其余 def 原样）。 */
function mapDef(doc: GenConnDocument, defId: Id, fn: (def: HardenDef) => HardenDef): GenConnDocument {
  return { ...doc, library: { ...doc.library, defs: doc.library.defs.map((d) => (d.id === defId ? fn(d) : d)) } };
}

/** 该 def 内未用过的 IP 实例名 `<小写缩写>_1/2…`（ssh_1 / mux_2；dftspec 输出同名）。 */
function nextIpName(def: HardenDef, ipType: DftIpType): string {
  const prefix = catalogEntry(ipType).abbr.toLowerCase();
  const used = new Set((def.dftIps ?? []).map((i) => i.instanceName));
  let n = 1;
  while (used.has(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}

/** 按已有 IP 数量错开落点（与 core 的 placePos 同风格）。 */
function placeIp(def: HardenDef): { x: number; y: number } {
  const k = (def.dftIps ?? []).length;
  // 起点 x=140：离画布左缘留出边界接口块的空间。
  return { x: 140 + (k % 5) * 200, y: 60 + Math.floor(k / 5) * 160 };
}

/** 把一个 harden 标记为「加入 SpecGen」。 */
export function addToSpecgen(doc: GenConnDocument, defId: Id): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, inSpecgen: true }));
}

/** 往 defId 内加一个 DFT IP。pos 给定 = 从调色板拖放的落点（否则按已有数量错开自动落点）。
 *  跨层 IP（DesignInstance）从某图层视图拖入时，把该层位置也设为落点。 */
/** House defaults seeded into a NEW IP's config — visible and editable in the dialog, emitted in
 *  the spec, and deletable per instance. Seeding (rather than injecting at generation time) keeps
 *  the document the single source: what the dialog shows IS what generates, and an engineer who
 *  clears a field genuinely gets rid of it. */
const IP_CONFIG_DEFAULTS: Partial<Record<DftIpType, DftConfig>> = {
  ScanHost: {
    use_clock_shaper_cell: "on",
    support_from_scan_out_le_strobing: "off",
  },
};

export function addDftIp(doc: GenConnDocument, defId: Id, ipType: DftIpType, pos?: { x: number; y: number }, layer: BusType | null = null): GenConnDocument {
  return mapDef(doc, defId, (d) => {
    void dftIpSize(ipType); // 校验 ipType 合法（未知则抛）
    const position = pos ?? placeIp(d);
    const ip: DftIpInstance = { id: newId("dft"), ipType, instanceName: nextIpName(d, ipType), position };
    const defaults = IP_CONFIG_DEFAULTS[ipType];
    if (defaults) ip.config = { ...defaults };
    if (pos && layer && isCrossLayerIp(ip)) ip.layerPos = { [layer]: pos };
    return { ...d, dftIps: [...(d.dftIps ?? []), ip] };
  });
}

export function moveDftIp(doc: GenConnDocument, defId: Id, ipId: Id, pos: { x: number; y: number }, layer: BusType | null = null): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d,
    dftIps: (d.dftIps ?? []).map((i) => {
      if (i.id !== ipId) return i;
      if (layer && isCrossLayerIp(i)) return { ...i, layerPos: { ...(i.layerPos ?? {}), [layer]: pos } };
      return { ...i, position: pos };
    }),
    dftWires: clearWpForIp(d.dftWires, ipId),
  }));
}

const endpointRefsIp = (ep: DftEndpoint, ipId: Id): boolean => ep.kind === "ip" && ep.ipId === ipId;

/** 该 IP 的位置/朝向变了 → 引用它的连线的手动折点(绝对坐标)已失效，清掉回自动避障（无折点的线不动）。 */
const clearWpForIp = (wires: DftWire[] | undefined, ipId: Id): DftWire[] | undefined =>
  wires?.map((w) => ((endpointRefsIp(w.from, ipId) || endpointRefsIp(w.to, ipId)) && w.waypoints?.length ? { ...w, waypoints: undefined } : w));

export function deleteDftIp(doc: GenConnDocument, defId: Id, ipId: Id): GenConnDocument {
  return mapDef(doc, defId, (d) => {
    const dftIps = (d.dftIps ?? []).filter((i) => i.id !== ipId);
    if (!d.dftWires?.length) return { ...d, dftIps };
    // 级联删掉涉及该 IP 的连线，避免残留孤儿线占着目标 in 口（fan-in）。
    return { ...d, dftIps, dftWires: d.dftWires.filter((w) => !endpointRefsIp(w.from, ipId) && !endpointRefsIp(w.to, ipId)) };
  });
}

/** 写入某 DFT IP 的参数 config（整体替换）。 */
export function setDftIpConfig(doc: GenConnDocument, defId: Id, ipId: Id, config: DftConfig): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, dftIps: (d.dftIps ?? []).map((i) => (i.id === ipId ? { ...i, config } : i)) }));
}

/** 改组件 ID（instanceName）。空名或与同 def 内其它 IP 重名 → 原样返回（拒绝重命名）。
 *  连线用内部 id（非 instanceName），故改 ID 不断线；生成的 dftspec 用新名。 */
export function renameDftIp(doc: GenConnDocument, defId: Id, ipId: Id, newName: string): GenConnDocument {
  const name = newName.trim();
  if (!name) return doc;
  return mapDef(doc, defId, (d) => {
    const ips = d.dftIps ?? [];
    if (ips.some((i) => i.id !== ipId && i.instanceName === name)) return d;  // 重名拒绝
    return { ...d, dftIps: ips.map((i) => (i.id === ipId ? { ...i, instanceName: name } : i)) };
  });
}

export function addDftWire(doc: GenConnDocument, defId: Id, from: DftEndpoint, to: DftEndpoint): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, dftWires: [...(d.dftWires ?? []), { id: newId("dw"), from, to }] }));
}
export function removeDftWire(doc: GenConnDocument, defId: Id, wireId: Id): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, dftWires: (d.dftWires ?? []).filter((w) => w.id !== wireId) }));
}

/** 批量设置 DFT IP 位置（自动排列用，一步 undo）。 */
export function setDftIpPositions(doc: GenConnDocument, defId: Id, positions: Record<Id, { x: number; y: number }>, layer: BusType | null = null): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, dftIps: (d.dftIps ?? []).map((i) => {
    const p = positions[i.id];
    if (!p) return i;
    if (layer && isCrossLayerIp(i)) return { ...i, layerPos: { ...(i.layerPos ?? {}), [layer]: p } };
    return { ...i, position: p };
  }) }));
}

export function rotateDftIp(doc: GenConnDocument, defId: Id, ipId: Id, dir: 1 | -1 = 1): GenConnDocument {
  const ip = doc.library.defs.find((d) => d.id === defId)?.dftIps?.find((i) => i.id === ipId);
  if (ip?.ipType === "DesignInstance") return doc; // 跨层节点 rotation 非按层字段，禁止旋转以免污染别层几何
  return mapDef(doc, defId, (d) => ({ ...d,
    dftIps: (d.dftIps ?? []).map((i) => (i.id === ipId ? { ...i, rotation: (((i.rotation ?? 0) + (dir === 1 ? 90 : 270)) % 360) as 0 | 90 | 180 | 270 } : i)),
    dftWires: clearWpForIp(d.dftWires, ipId),
  }));
}

/** 显示帧变换（mirror 先于 rotation 作用在 def 帧）：FlipX∘R(r)∘Mx^m = R(-r)∘Mx^(m+1)、FlipY = R(180)∘Mx。 */
const flipped = (d: HardenDef, ipId: Id, rot: (r: number) => number): HardenDef => ({ ...d,
  dftIps: (d.dftIps ?? []).map((i) => (i.id === ipId ? { ...i, rotation: rot(i.rotation ?? 0) as 0 | 90 | 180 | 270, mirror: !i.mirror } : i)),
  dftWires: clearWpForIp(d.dftWires, ipId),
});

/** 左右镜像（显示帧）：MUX 转向（左进右出 ↔ 右进左出）。 */
export function flipDftIpH(doc: GenConnDocument, defId: Id, ipId: Id): GenConnDocument {
  return mapDef(doc, defId, (d) => flipped(d, ipId, (r) => (360 - r) % 360));
}
/** 上下镜像（显示帧）：MUX 的 M/S 对调。 */
export function flipDftIpV(doc: GenConnDocument, defId: Id, ipId: Id): GenConnDocument {
  return mapDef(doc, defId, (d) => flipped(d, ipId, (r) => (180 - r + 360) % 360));
}
export function setDftWireWaypoints(doc: GenConnDocument, defId: Id, wireId: Id, waypoints: { x: number; y: number }[]): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, dftWires: (d.dftWires ?? []).map((w) =>
    w.id === wireId ? { ...w, waypoints } : w) }));
}

/** 同步 DesignInstance：为 scope 的**直接** physical_block 子实例自动建/更新(改名跟随)/删对应 DesignInstance；
 *  用户手动加的(无 sourceChildId)不动；进/出线由用户手动接。无变化返回原 doc（不触发 undo/dirty）。 */
export function syncDesignInstances(doc: GenConnDocument, defId: Id): GenConnDocument {
  const scope = doc.library.defs.find((d) => d.id === defId);
  if (!scope) return doc;
  const defOf = (hardenId: Id): HardenDef | undefined => doc.library.defs.find((d) => d.id === hardenId);
  const pb = scope.childInstances.filter((ci) => defOf(ci.hardenId)?.designLevel === "physical_block");
  const wantById = new Map(pb.map((ci) => [ci.id, ci]));
  const existing = scope.dftIps ?? [];
  let changed = false;
  const kept: DftIpInstance[] = [];
  const removed: Id[] = [];
  for (const ip of existing) {
    if (!ip.sourceChildId) { kept.push(ip); continue; }        // 手动加的，不动
    const ci = wantById.get(ip.sourceChildId);
    if (!ci) { changed = true; removed.push(ip.id); continue; } // 源子块没了/不再 physical_block → 删(连线级联删)
    const mod = defOf(ci.hardenId)!.designName;
    if (ip.instanceName !== ci.instanceName || ip.moduleName !== mod) { changed = true; kept.push({ ...ip, instanceName: ci.instanceName, moduleName: mod }); }
    else kept.push(ip);
  }
  const have = new Set(kept.filter((ip) => ip.sourceChildId).map((ip) => ip.sourceChildId));
  let k = existing.length;
  const added: DftIpInstance[] = [];
  for (const ci of pb) {
    if (have.has(ci.id)) continue;
    added.push({ id: newId("dft"), ipType: "DesignInstance", instanceName: ci.instanceName,
      moduleName: defOf(ci.hardenId)!.designName, sourceChildId: ci.id,
      position: { x: 140 + (k % 5) * 200, y: 60 + Math.floor(k / 5) * 160 } }); // 与 placeIp 同风格
    k++; changed = true;
  }
  if (!changed) return doc;
  const rm = new Set(removed);
  const refsRm = (ep: DftEndpoint): boolean => ep.kind === "ip" && rm.has(ep.ipId);
  return mapDef(doc, defId, (d) => ({ ...d,
    dftIps: [...kept, ...added],
    // 删掉被移除的 DesignInstance 上的连线，避免残留孤儿线占着目标 in 口（fan-in）。
    dftWires: rm.size ? (d.dftWires ?? []).filter((w) => !refsRm(w.from) && !refsRm(w.to)) : d.dftWires,
  }));
}

/** 老自动实例名一次性迁移：`<Type>_<n>` 精确模式 → `<小写缩写>_<n>`（占用则顺延 n）。
 *  手动改过的名字（不匹配模式）与 DesignInstance（名来自子实例同步）不动。无变化返回原 doc。 */
export function migrateLegacyIpNames(doc: GenConnDocument, defId: Id): GenConnDocument {
  const scope = doc.library.defs.find((d) => d.id === defId);
  if (!scope) return doc;
  const ips = scope.dftIps ?? [];
  if (!ips.length) return doc;
  const used = new Set(ips.map((i) => i.instanceName));
  let changed = false;
  const renamed = ips.map((ip) => {
    if (ip.ipType === "DesignInstance") return ip; // 名来自子实例同步，显式跳过
    const m = new RegExp(`^${ip.ipType}_(\\d+)$`).exec(ip.instanceName);
    if (!m) return ip; // 手动改过的名字，不匹配老自动模式
    const abbr = catalogEntry(ip.ipType).abbr.toLowerCase();
    let n = Number(m[1]);
    let name = `${abbr}_${n}`;
    while (used.has(name)) { n++; name = `${abbr}_${n}`; }
    used.delete(ip.instanceName);
    used.add(name);
    changed = true;
    return { ...ip, instanceName: name };
  });
  if (!changed) return doc;
  return mapDef(doc, defId, (d) => ({ ...d, dftIps: renamed }));
}

export function applyAutoLayout(doc: GenConnDocument, defId: Id,
  layout: { positions: Record<Id, { x: number; y: number }>; mirror: Record<Id, boolean> },
  layer: BusType | null = null): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, dftIps: (d.dftIps ?? []).map((i) => {
    const p = layout.positions[i.id];
    const mir = layout.mirror[i.id] ?? i.mirror;
    if (!p) return i.mirror === mir ? i : { ...i, mirror: mir };
    if (layer && isCrossLayerIp(i)) return { ...i, layerPos: { ...(i.layerPos ?? {}), [layer]: p }, mirror: mir };
    return { ...i, position: p, mirror: mir };
  }) }));
}

/** 跨层节点：在每个图层都显示，需每层各存一份坐标（当前只有 DesignInstance）。 */
export const isCrossLayerIp = (ip: DftIpInstance): boolean => ip.ipType === "DesignInstance";

/** IP 在给定活动层下的有效坐标：跨层节点在具体层用 layerPos 覆盖，否则用 position（含「全部」只读视图）。 */
export function ipPosIn(ip: DftIpInstance, layer: BusType | null): { x: number; y: number } {
  if (layer && isCrossLayerIp(ip)) return ip.layerPos?.[layer] ?? ip.position;
  return ip.position;
}

/** 清空该 scope 的全部 DFT IP + 连线（DesignInstance 会随 syncDesignInstances 自动重建）。 */
export function clearDftScope(doc: GenConnDocument, defId: Id): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, dftIps: [], dftWires: [] }));
}

/** 移出 SpecGen：inSpecgen=false；内容保留以便再「加入 SpecGen」时恢复。 */
export function removeFromSpecgen(doc: GenConnDocument, defId: Id): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, inSpecgen: false }));
}
