// GenConnection MVP — 接口信号展开（对应 spec §4）。
// 数据驱动：每个 busType 一张 base 表 + 三个命名前缀（client / secondary _to_ / secondary _from_）。

import type { BusInterface, BusType, InterfaceSignal } from "./model.ts";

/** 一个信号 base：name + 方向组（down=下行，up=上行）+ 是否用 busWidth 位宽。 */
export interface Base {
  name: string;
  group: "down" | "up";
  /** true = 位宽取 busWidth（仅 SSN 数据总线）；否则 1 bit。 */
  wide?: boolean;
  /** 叶名前的限定段（仅 JTAG1838 reset/ce/se/ue = "ijtag_"）；位于 stap_/接口名 与 to_/from_/叶名 之间。 */
  qual?: string;
}

interface Desc {
  clientPrefix: (i: BusInterface) => string;
  toPrefix: (i: BusInterface, b?: Base) => string;
  fromPrefix: (i: BusInterface, b?: Base) => string;
  /** 接口名后缀：仅 SSN 且 ifNamePlacement==="postfix" 时把 interfaceName 放到 base 之后。 */
  ifSuffix?: (i: BusInterface) => string;
  bases: (i: BusInterface) => Base[];
}

const down = (name: string, wide?: boolean): Base => ({ name, group: "down", wide });
const up = (name: string, wide?: boolean): Base => ({ name, group: "up", wide });

/** BISR 电源域前缀：有 pd 且非 pdMatchOnly → `${pd}_`；未指定或 pdMatchOnly → 空（信号名不带 <pd>_）。 */
const pdPrefix = (i: BusInterface): string => (i.powerDomain && !i.pdMatchOnly ? `${i.powerDomain}_` : "");

const DESC: Record<BusType, Desc> = {
  SSN: {
    // postfix：接口名放末尾（前缀只剩 ssn_to_/ssn_from_，由 ifSuffix 补名）；prefix（默认）：原行为。
    clientPrefix: (i) => (i.interfaceName ? `${i.interfaceName}_ssn_` : "ssn_"),
    toPrefix: (i) => (i.ifNamePlacement === "postfix" ? "ssn_to_" : `${i.interfaceName}_ssn_to_`),
    fromPrefix: (i) => (i.ifNamePlacement === "postfix" ? "ssn_from_" : `${i.interfaceName}_ssn_from_`),
    ifSuffix: (i) => (i.ifNamePlacement === "postfix" ? `_${i.interfaceName}` : ""),
    bases: () => [down("bus_clock"), down("bus_data_in", true), up("bus_data_out", true)],
  },
  IJTAG: {
    clientPrefix: () => "ijtag_",
    toPrefix: (i) => `${i.interfaceName}_ijtag_to_`,
    fromPrefix: (i) => `${i.interfaceName}_ijtag_from_`,
    bases: () => [
      down("tck"), down("reset"), down("ce"), down("se"), down("ue"), down("sel"), down("si"),
      up("so"),
    ],
  },
  BISR: {
    // pd 可选：指定则前缀含 `${pd}_`，不指定则省略该段。
    clientPrefix: (i) => `${pdPrefix(i)}bisr_`,
    toPrefix: (i) => `${pdPrefix(i)}${i.interfaceName}_bisr_to_`,
    fromPrefix: (i) => `${pdPrefix(i)}${i.interfaceName}_bisr_from_`,
    bases: (i) => [
      ...(i.omitMemCtrl ? [] : [down("mem_chain_select")]),
      down("shift_en"), down("clk"),
      ...(i.omitMemCtrl ? [] : [down("mem_disable")]),
      down("reset"), down("si"), up("so"),
    ],
  },
  BSCAN: {
    clientPrefix: () => "bscan_",
    toPrefix: (i) => `${i.interfaceName}_bscan_to_`,
    fromPrefix: (i) => `${i.interfaceName}_bscan_from_`,
    bases: (i) => [
      down("select"), down("force_disable"), down("select_jtag_input"), down("select_jtag_output"),
      down("clock"), down("capture_en"), down("shift_en"), down("update_en"), down("scan_in"),
      ...(i.bscanVariant === "AC" ? [down("ac_init_clk0"), down("ac_signal"), down("ac_mode_en")] : []),
      up("scan_out"),
    ],
  },
  JTAG1838: {
    clientPrefix: () => "stap_",
    toPrefix: (i, b) => `${i.interfaceName ?? ""}_${b?.qual ?? ""}to_`,
    fromPrefix: (i, b) => `${i.interfaceName ?? ""}_${b?.qual ?? ""}from_`,
    bases: () => [
      down("tck"), down("tms"), down("trst"),
      { name: "reset", group: "down", qual: "ijtag_" },
      { name: "ce", group: "down", qual: "ijtag_" },
      { name: "se", group: "down", qual: "ijtag_" },
      { name: "ue", group: "down", qual: "ijtag_" },
      down("tdi"),
      up("tdo"),
    ],
  },
};

const SSN_DEFAULT_WIDTH = 4;

function widthOf(i: BusInterface, b: Base): number {
  return b.wide ? i.busWidth ?? SSN_DEFAULT_WIDTH : 1;
}
function suffix(w: number): string {
  return w > 1 ? `[${w - 1}:0]` : "";
}

/** 某接口（按其 busType+variant）的 base 列表，自上而下。 */
export function basesOf(i: BusInterface): Base[] {
  return DESC[i.busType].bases(i);
}

/** client 端某 base 的信号。 */
export function clientSignal(i: BusInterface, b: Base): InterfaceSignal {
  const w = widthOf(i, b);
  return {
    name: DESC[i.busType].clientPrefix(i) + (b.qual ?? "") + b.name + suffix(w),
    direction: b.group === "down" ? "input" : "output",
    width: w,
  };
}

/** secondary 端某 base 的信号（down→_to_ 输出；up→_from_ 输入）。 */
export function secondarySignal(i: BusInterface, b: Base): InterfaceSignal {
  const w = widthOf(i, b);
  const d = DESC[i.busType];
  const prefix = b.group === "down" ? d.toPrefix(i, b) : d.fromPrefix(i, b);
  const ifSuf = d.ifSuffix ? d.ifSuffix(i) : "";
  return {
    name: prefix + b.name + ifSuf + suffix(w),
    direction: b.group === "down" ? "output" : "input",
    width: w,
  };
}

/** 把一个接口展开成有序信号列表（按角色取 client / secondary 名）。 */
export function expandInterface(i: BusInterface): InterfaceSignal[] {
  return basesOf(i).map((b) => (i.role === "client" ? clientSignal(i, b) : secondarySignal(i, b)));
}
