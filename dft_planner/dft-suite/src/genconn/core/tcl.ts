// 接口提升的馈通 TCL 脚本生成（对应 spec §5 / 设计文档"TCL 生成器"）。
// 一个模块 M 若有"提升（portedFrom）"的边界接口，则除了连接文件外，再产一份 <M>.tcl：
// 先全部 create_port，再全部 create_connection（把边界端口接到对应子块实例的同名端口，实现馈通）。

import type { HardenDef, HardenLibrary } from "./model.ts";
import { expandInterface } from "./expand.ts";
import type { GenResult } from "./generate.ts";

/**
 * 为某层(root)的"提升"边界接口产 TCL 馈通脚本；无提升接口则返回 null。
 * 端口名含 expandInterface 的 [W-1:0] 后缀；子实例名取 portedFrom.instanceId 对应实例名。
 */
export function generateTcl(root: HardenDef, _lib: HardenLibrary, isRoot: boolean): GenResult | null {
  const ported = root.interfaces.filter((i) => i.portedFrom);
  if (ported.length === 0) return null;

  const ports: string[] = [];
  const conns: string[] = [];
  for (const bi of ported) {
    const inst = root.childInstances.find((i) => i.id === bi.portedFrom!.instanceId);
    if (!inst) continue;
    for (const sig of expandInterface(bi)) {
      ports.push(`create_port ${sig.name}`);
      conns.push(`create_connection ${sig.name} ${inst.instanceName}/${sig.name}`);
    }
  }

  const fileBase = isRoot ? "top" : root.designName;
  return {
    file: `../../design/${root.designName}/${fileBase}.tcl`,
    text: [...ports, ...conns].join("\n") + "\n",
  };
}
