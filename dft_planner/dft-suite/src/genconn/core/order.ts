// GenConnection MVP — 端口确定性排序（对应 spec §5）。

import type { BusInterface, BusType, HardenDef, Id, InterfaceSignal } from "./model.ts";
import { expandInterface } from "./expand.ts";

const BUS_ORDER: BusType[] = ["BSCAN", "IJTAG", "JTAG1838", "BISR", "SSN"];

/**
 * §5：把一个 def 的接口排成确定顺序：
 * 按 busType 固定序（BSCAN→IJTAG→JTAG1838→BISR→SSN）；同 busType 内先 client（全部）再 secondary（按定义序）。
 */
export function orderInterfaces(def: HardenDef): BusInterface[] {
  const out: BusInterface[] = [];
  for (const bt of BUS_ORDER) {
    const ofType = def.interfaces.filter((i) => i.busType === bt);
    out.push(...ofType.filter((i) => i.role === "client"));
    out.push(...ofType.filter((i) => i.role === "secondary"));
  }
  return out;
}

export interface DefPorts {
  inputPorts: InterfaceSignal[];
  outputPorts: InterfaceSignal[];
}

/**
 * §5：展开 def 的全部接口，拆成 input/output 两列（各自保持上面的相对顺序）。
 * excludeIfIds：在展开前丢弃 id 命中的接口（用于"被提升"接口在下层连接文件里整段省略）。
 * 缺省/空集 → 与原行为逐字一致（golden 安全）。
 */
export function expandDef(def: HardenDef, excludeIfIds?: Set<Id>): DefPorts {
  const ordered = excludeIfIds && excludeIfIds.size > 0 ? orderInterfaces(def).filter((i) => !excludeIfIds.has(i.id)) : orderInterfaces(def);
  const all = ordered.flatMap(expandInterface);
  return {
    inputPorts: all.filter((s) => s.direction === "input"),
    outputPorts: all.filter((s) => s.direction === "output"),
  };
}
