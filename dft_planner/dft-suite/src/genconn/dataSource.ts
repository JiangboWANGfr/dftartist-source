// data source 通道模型（纯函数，无 React/Konva）：把一个 data source 接口归一成"通道列表"。
// 每通道 = 一行「标签 + ▶out/◀in 一对」；bisr 与 tap 同构。pd/总线只挂 out，◀in 只是收线终点。

import type { BusInterface, HardenDef, Id } from "./core/model.ts";
import { BUS_COLOR, busTypeLabel } from "./layout.ts";

/** placement=other 卡片的顶部短标签（单一来源；CanvasView / Inspector 都从这里取）。 */
export const DS_LABEL: Record<BusInterface["busType"], string> = {
  SSN: "pad", IJTAG: "tap", BISR: "bisrController", BSCAN: "tap", JTAG1838: "tap",
};

export interface DsChannel {
  /** React key + 引脚唯一标识。 */
  key: string;
  /** 行标签：pd 名 / 总线短码 / DS_LABEL。 */
  label: string;
  /** 该通道所属总线色。 */
  color: string;
  /** 该通道的线从哪个接口起（onWirePin 的 ifId）。 */
  ifId: Id;
  /** 仅 BISR：out 线携带的 pd。 */
  pd?: string;
  /** 该通道所属总线（用于按各自 busType 做图层门控）。 */
  busType: BusInterface["busType"];
}

/** tap 家族：ijtag/1838/bscan。同一 def 里的内部(placement=other) tap 家族 data source 自动并成一张 tap 卡。 */
const TAP_FAMILY: BusInterface["busType"][] = ["IJTAG", "JTAG1838", "BSCAN"];
const isInternalTap = (f: BusInterface): boolean =>
  !!f.isDataSource && f.placement === "other" && TAP_FAMILY.includes(f.busType);

/** 该接口的渲染组：内部 tap 家族 → 同 def 里所有内部 tap 家族（自动合并，无需手动分组）；否则只有自身。 */
export function groupMembers(iface: BusInterface, def: HardenDef): BusInterface[] {
  if (isInternalTap(iface)) return def.interfaces.filter(isInternalTap);
  return [iface];
}

/** 该接口是否负责渲染卡片：非组成员恒 true；组成员仅"第一个"true（其余跳过，避免重复画）。 */
export function isPrimaryDataSource(iface: BusInterface, def: HardenDef): boolean {
  if (!iface.isDataSource || iface.placement !== "other") return false;
  return groupMembers(iface, def)[0]?.id === iface.id;
}

/** 归一成通道列表。优先级：BISR+pdList → 共享组 → 单通道。 */
export function dataSourceChannels(iface: BusInterface, def: HardenDef): DsChannel[] {
  if (iface.busType === "BISR" && iface.pdList?.length) {
    return iface.pdList.map((pd) => ({
      key: `${iface.id}:${pd}`, label: pd, color: BUS_COLOR.BISR, ifId: iface.id, pd, busType: "BISR",
    }));
  }
  const members = groupMembers(iface, def);
  if (members.length > 1) {
    return members.map((m) => ({
      key: m.id, label: busTypeLabel(m.busType, m.role), color: BUS_COLOR[m.busType], ifId: m.id, busType: m.busType,
    }));
  }
  return [{ key: iface.id, label: busTypeLabel(iface.busType, iface.role), color: BUS_COLOR[iface.busType], ifId: iface.id, busType: iface.busType }];
}

/** 收集全 doc 里已用过的 pd 名（powerDomain + ifacePd 覆盖值）——给 Inspector chip 输入做自动补全。 */
export function usedPdNames(defs: HardenDef[]): string[] {
  const set = new Set<string>();
  for (const d of defs) {
    for (const f of d.interfaces) if (f.powerDomain) set.add(f.powerDomain);
    for (const inst of d.childInstances) for (const pd of Object.values(inst.ifacePd ?? {})) set.add(pd);
  }
  return [...set].sort();
}
