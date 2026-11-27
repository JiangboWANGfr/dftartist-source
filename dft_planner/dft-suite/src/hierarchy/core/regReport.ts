// 寄存器统计 → TCL 可 source 数组文本(spec §5)。下游 `source` 后得 $reg_count(inst,field)。
// 实例 id 是 Verilog 层次路径(word 字符 + .),TCL 索引安全,无需 quote。
import type { RegCountResult } from "../../core-bridge/model.ts";
import { regRows } from "./regcount.ts";

export function formatRegReport(design: string, rc: RegCountResult): string {
  const rows = regRows(rc, { key: "subtree", dir: "desc" }, "");
  const totalMemory = rc.counts.reduce((s, c) => s + c.memoryBits, 0);
  const lines: string[] = [
    `# register count — ${design}`,
    `# fields: own / subtree / memory (per instance, keyed by full hier path)`,
    `set reg_count(${design},total_flops) ${rc.total}`,
    `set reg_count(${design},total_memory) ${totalMemory}`,
  ];
  for (const c of rows) {
    lines.push(`set reg_count(${c.instanceId},own) ${c.own}`);
    lines.push(`set reg_count(${c.instanceId},subtree) ${c.subtree}`);
    lines.push(`set reg_count(${c.instanceId},memory) ${c.memoryBits}`);
  }
  return lines.join("\n") + "\n";
}
