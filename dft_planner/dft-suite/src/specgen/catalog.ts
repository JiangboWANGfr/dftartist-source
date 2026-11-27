// DFT IP 目录：SSN DataPath 可放置组件 + 端口（供 SpecGen 调色板 / 画布端口渲染）。
// 组件名取自 specgen schema 的 SSN.Datapath.blocks；端口为 Slice 1 渲染用的精简数据流端口，
// 完整端口 schema 到 Slice 3（拉线）/ Slice 2（配参）再接。
import type { DftIpType } from "../genconn/core/dft-model.ts";

export type PortSide = "left" | "right" | "top" | "bottom";
export interface DftPort { name: string; dir: "in" | "out"; side: PortSide; role?: "master" | "secondary" | "clock" | "data" | "chain"; bus?: "SSN" | "BSCAN" | "JTAG1838"; }
export interface DftCatalogEntry { ipType: DftIpType; label: string; abbr: string; group: "datapath" | "other"; bus?: "SSN" | "BSCAN" | "JTAG1838"; ports: DftPort[]; }

const DATA_IN: DftPort = { name: "bus_data_in", dir: "in", side: "left", role: "data" };
const DATA_OUT: DftPort = { name: "bus_data_out", dir: "out", side: "right", role: "data" };
const CLOCK: DftPort = { name: "bus_clock", dir: "in", side: "top", role: "clock" };
const simple = (t: DftIpType, abbr: string): DftCatalogEntry => ({ ipType: t, label: t, abbr, group: "datapath", ports: [DATA_IN, DATA_OUT, CLOCK] });

export const DFT_CATALOG: DftCatalogEntry[] = [
  {
    ipType: "ScanHost", label: "ScanHost", abbr: "SSH", group: "datapath",
    ports: [DATA_IN, DATA_OUT, CLOCK, { name: "chain_group_out", dir: "out", side: "bottom", role: "chain" }],
  },
  simple("Receiver1xPipeline", "RPP"),
  simple("OutputPipeline", "OPP"),
  simple("Pipeline", "PP"),
  {
    ipType: "Multiplexer", label: "Multiplexer", abbr: "MUX", group: "datapath",
    ports: [
      { name: "master_bus_data_in", dir: "in", side: "left", role: "master" },
      { name: "secondary_bus_data_in", dir: "in", side: "left", role: "secondary" },
      DATA_OUT, CLOCK,
    ],
  },
  {
    ipType: "Fifo", label: "Fifo", abbr: "FIFO", group: "datapath",
    ports: [
      DATA_IN, DATA_OUT,
      { name: "bus_in_clock", dir: "in", side: "top", role: "clock" },
      { name: "bus_out_clock", dir: "in", side: "top", role: "clock" },
    ],
  },
  simple("BusFrequencyDivider", "BFD"),
  simple("BusFrequencyMultiplier", "BFM"),
  { ipType: "DesignInstance", label: "DesignInstance", abbr: "DI", group: "datapath", ports: [
    { name: "bus_data_in",    dir: "in",  side: "left",  role: "data", bus: "SSN" },
    { name: "bus_data_out",   dir: "out", side: "right", role: "data", bus: "SSN" },
    { name: "bscan_scan_in",  dir: "in",  side: "left",  role: "data", bus: "BSCAN" },
    { name: "bscan_scan_out", dir: "out", side: "right", role: "data", bus: "BSCAN" },
  ] },
  {
    ipType: "Edt", label: "EDT", abbr: "EDT", group: "other",
    ports: [{ name: "ssh_chain_group_in", dir: "in", side: "top", role: "chain" }],
  },
  {
    ipType: "EBScanPipeline", label: "EBScanPipeline", abbr: "EBP", group: "datapath", bus: "BSCAN",
    ports: [
      { name: "scan_in", dir: "in", side: "left", role: "data" },
      { name: "scan_out", dir: "out", side: "right", role: "data" },
      { name: "bscan_clock", dir: "in", side: "top", role: "clock" },
    ],
  },
  {
    ipType: "STapPipeline", label: "STapPipeline", abbr: "SPP", group: "datapath", bus: "JTAG1838",
    ports: [
      { name: "scan_in", dir: "in", side: "left", role: "data" },
      { name: "scan_out", dir: "out", side: "right", role: "data" },
      { name: "tck", dir: "in", side: "top", role: "clock" },
    ],
  },
];

/** DFT IP 所属总线层（缺省 SSN）：给调色板分组 + 图层门控用。 */
export function catalogBus(ipType: DftIpType): "SSN" | "BSCAN" | "JTAG1838" {
  return catalogEntry(ipType).bus ?? "SSN";
}

export function catalogEntry(ipType: DftIpType): DftCatalogEntry {
  const e = DFT_CATALOG.find((x) => x.ipType === ipType);
  if (!e) throw new Error(`unknown DFT IP type: ${ipType}`);
  return e;
}

/** DFT IP 盒尺寸（def 帧）：普通 100×40；DesignInstance 120×40（module 名长）；Multiplexer 60×80 梯形外框。 */
export function dftIpSize(ipType: DftIpType): { w: number; h: number } {
  catalogEntry(ipType); // 校验 ipType 合法（未知则抛）
  if (ipType === "Multiplexer") return { w: 60, h: 80 };
  if (ipType === "DesignInstance") return { w: 120, h: 40 };
  return { w: 100, h: 40 };
}

/** 端口所属总线（DesignInstance 的 SSN/BSCAN 口用）；无标注或未知端口返回 undefined。 */
export function portBus(ipType: DftIpType, portName: string): "SSN" | "BSCAN" | "JTAG1838" | undefined {
  return catalogEntry(ipType).ports.find((p) => p.name === portName)?.bus;
}
