// DFT IP 节点配色单一真源（纯视图）：每类型 浅色填充/描边/文字 三色；缩写来自 catalog。
// 思路：pipeline 家族(RPP/PP/OPP)蓝色系相邻色；SSH 绿(源头)；MUX 橙(汇合点)；DI 灰(用户设计块)。
import { catalogEntry } from "./catalog.ts";
import type { DftIpType } from "../genconn/core/dft-model.ts";

export interface IpVisual { fill: string; stroke: string; text: string; }

const IP_COLORS: Record<DftIpType, IpVisual> = {
  ScanHost:               { fill: "#d1fae5", stroke: "#10b981", text: "#065f46" },
  Receiver1xPipeline:     { fill: "#e0f2fe", stroke: "#0ea5e9", text: "#075985" },
  Pipeline:               { fill: "#dbeafe", stroke: "#3b82f6", text: "#1e40af" },
  OutputPipeline:         { fill: "#e0e7ff", stroke: "#6366f1", text: "#3730a3" },
  Multiplexer:            { fill: "#fef3c7", stroke: "#f59e0b", text: "#92400e" },
  Fifo:                   { fill: "#ffe4e6", stroke: "#f43f5e", text: "#9f1239" },
  BusFrequencyDivider:    { fill: "#f3e8ff", stroke: "#a855f7", text: "#6b21a8" },
  BusFrequencyMultiplier: { fill: "#fae8ff", stroke: "#d946ef", text: "#86198f" },
  DesignInstance:         { fill: "#f1f5f9", stroke: "#64748b", text: "#334155" },
  Edt:                    { fill: "#ccfbf1", stroke: "#14b8a6", text: "#115e59" },
  EBScanPipeline:         { fill: "#ede9fe", stroke: "#9e77ed", text: "#5b21b6" },
  STapPipeline:               { fill: "#cffafe", stroke: "#0891b2", text: "#155e75" },
};

export function ipStyle(t: DftIpType): IpVisual & { abbr: string } {
  return { ...IP_COLORS[t], abbr: catalogEntry(t).abbr };
}
