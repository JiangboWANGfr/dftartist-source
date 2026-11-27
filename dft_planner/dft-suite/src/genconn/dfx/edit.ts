// DFX ctrl 的文档级编辑(纯函数;spec §5.3)。计数器语义:D3 双计数器相互独立,
// mux 号跨模块连续(A6),只增不回收。
import type { CtrlIpSpec, DocCtrlIp, GenConnDocument } from "../core/model.ts";
import { tclTarget } from "./judge.ts";

/** 终模块名 = dsIndex 存在时 base_dsN,否则 base(与 dft-core ctrlgen::moduleName 一致)。 */
export function moduleNameOf(spec: CtrlIpSpec): string {
  return spec.dsIndex != null ? `${spec.moduleBase}_ds${spec.dsIndex}` : spec.moduleBase;
}

export function allocModuleDs(doc: GenConnDocument): { doc: GenConnDocument; ds: number } {
  return { doc: { ...doc, moduleDsNext: doc.moduleDsNext + 1 }, ds: doc.moduleDsNext };
}

export function allocMuxDs(doc: GenConnDocument, n: number): { doc: GenConnDocument; ds: number[] } {
  const ds = Array.from({ length: n }, (_, i) => doc.muxDsNext + i);
  return { doc: { ...doc, muxDsNext: doc.muxDsNext + n }, ds };
}

export function ctrlIpByModule(doc: GenConnDocument, mod: string): DocCtrlIp | undefined {
  return doc.ctrlIps.find((c) => moduleNameOf(c.spec) === mod);
}

export function upsertCtrlIp(doc: GenConnDocument, entry: DocCtrlIp): GenConnDocument {
  const mod = moduleNameOf(entry.spec);
  const rest = doc.ctrlIps.filter((c) => moduleNameOf(c.spec) !== mod);
  return { ...doc, ctrlIps: [...rest, entry] };
}

export function removeCtrlIp(doc: GenConnDocument, mod: string): GenConnDocument {
  return { ...doc, ctrlIps: doc.ctrlIps.filter((c) => moduleNameOf(c.spec) !== mod) };
}

/** 编辑弹窗要展示的一个目标实例(从 spec.pins 反查得到)。 */
export interface DfxEditTarget {
  nodeId: string;
  instName: string;
  /** true = 未在 dfxInstances 命中,从 target 段兜底构造 nodeId(无顶层前缀,daemon 可能查不到端口)。 */
  fallback: boolean;
}

/** 编辑一条 V3 ctrlIp 时,从 spec.pins[].target(tcl 路径)反查目标实例列表(按 nodeId 去重,保序)。
 *  V3 去画布化后 DocCtrlIp.targets 已废弃(confirmCtrlIpV3 只写 spec),spec.pins 是目标的唯一
 *  真源;否则编辑弹窗引脚表空 + 再确认会把 spec 覆盖成空(数据丢失)。
 *  逆匹配:优先在 dfxInstances(图上实例 daemon nodeId)里找 nodeId 使 tclTarget(nodeId,pin)===target,
 *  拿到真 nodeId;匹配不到则从 target 的实例段兜底(fallback=true)。 */
export function targetsFromSpec(spec: CtrlIpSpec, dfxInstances: string[]): DfxEditTarget[] {
  const byNode = new Map<string, DfxEditTarget>();
  for (const pin of spec.pins) {
    const targets = pin.targets ?? (pin.target ? [pin.target] : []);
    for (const t of targets) {
      const pinName = t.slice(t.lastIndexOf("/") + 1);
      const hit = dfxInstances.find((n) => tclTarget(n, pinName) === t);
      const nodeId = hit ?? t.slice(0, t.lastIndexOf("/")).replace(/\//g, ".");
      if (!byNode.has(nodeId))
        byNode.set(nodeId, { nodeId, instName: nodeId.split(".").pop() ?? nodeId, fallback: !hit });
    }
  }
  return [...byNode.values()];
}

/** 把实例 nodeId 加入 DFX Ctrl tab(去重,M3/D11)。 */
export function addDfxInstance(doc: GenConnDocument, nodeId: string): GenConnDocument {
  if (doc.dfxInstances.includes(nodeId)) return doc;
  return { ...doc, dfxInstances: [...doc.dfxInstances, nodeId] };
}
export function removeDfxInstance(doc: GenConnDocument, nodeId: string): GenConnDocument {
  return { ...doc, dfxInstances: doc.dfxInstances.filter((n) => n !== nodeId) };
}
