// GenConnection MVP — 连接文件生成（对应 spec §6 / §6.0 / §7）。

import type {
  BusInterface,
  HardenDef,
  HardenInstance,
  HardenLibrary,
  Id,
} from "./model.ts";
import { basesOf, clientSignal, secondarySignal } from "./expand.ts";
import { expandDef } from "./order.ts";
import { validateDef } from "./validate.ts";
import { effectivePd } from "./edit.ts";
import { generateTcl } from "./tcl.ts";

export interface GenResult {
  /** 建议输出路径（见 §6.0 命名约定）。 */
  file: string;
  text: string;
}

function indexBy<T extends { id: Id }>(arr: T[]): Map<Id, T> {
  const m = new Map<Id, T>();
  for (const x of arr) m.set(x.id, x);
  return m;
}

function ifaceOf(def: HardenDef, id: Id): BusInterface {
  const i = def.interfaces.find((x) => x.id === id);
  if (!i) throw new Error(`interface '${id}' not found in def '${def.designName}'`);
  return i;
}

const UNCONNECTED = (p: string): string => `/* UNCONNECTED:${p} */`;

/** 端口清单：一行一个（缩进对齐、逗号结尾、最后一项分号）。空清单退化为 `label : ;`。 */
function fmtList(label: string, items: string[], indent: string): string[] {
  if (items.length === 0) return [`${indent}${label} : ;`];
  return [`${indent}${label} :`, ...items.map((it, i) => `${indent}  ${it}${i === items.length - 1 ? ";" : ","}`)];
}

/**
 * §6 + §6.0：为某层（root）生成连接文件。
 * 返回 null 表示本层没有 tiling 子块、不产文件（Tessent 自动连）。
 * 只描述 root 这一层（root.childInstances + root.connections）；只拼两端都是 tiling 的连接。
 */
export function generate(root: HardenDef, lib: HardenLibrary, isRoot: boolean): GenResult | null {
  const defs = indexBy(lib.defs);
  const insts = indexBy(root.childInstances);
  const defOf = (i: HardenInstance): HardenDef => {
    const d = defs.get(i.hardenId);
    if (!d) throw new Error(`def '${i.hardenId}' (instance '${i.instanceName}') not found in library`);
    return d;
  };
  const isTiling = (i: HardenInstance): boolean => defOf(i).designType === "tiling";

  // §8 结构校验：root 及其全部子 def（含 hierarchical 子块，模型仍须合法）。
  validateDef(root);
  for (const id of new Set(root.childInstances.map((i) => i.hardenId))) {
    const d = defs.get(id);
    if (d) validateDef(d);
  }

  // §6.0 门槛：本层至少有一个 tiling 子块才产文件。
  const tilingInsts = root.childInstances.filter(isTiling);
  if (tilingInsts.length === 0) return null;

  // 来源表：driver[instanceId][inputPortName] = "srcInst/srcPort"
  const driver = new Map<Id, Map<string, string>>();
  const put = (instId: Id, port: string, src: string): void => {
    let m = driver.get(instId);
    if (!m) {
      m = new Map();
      driver.set(instId, m);
    }
    const existing = m.get(port);
    // §8：一个 client 输入端口不可被多个 secondary 驱动（点对点）。
    if (existing !== undefined && existing !== src) {
      throw new Error(
        `port '${port}' on instance '${instId}' is driven by multiple secondaries ('${existing}' vs '${src}')`,
      );
    }
    m.set(port, src);
  };

  for (const conn of root.connections) {
    const A = insts.get(conn.secondaryInstanceId);
    const B = insts.get(conn.clientInstanceId);
    if (!A || !B) continue;
    if (!isTiling(A) || !isTiling(B)) continue; // 含 hierarchical 端点 → 交给 Tessent

    const S = ifaceOf(defOf(A), conn.secondaryInterfaceId);
    const C = ifaceOf(defOf(B), conn.clientInterfaceId);

    // §8 校验（pd 用「有效 pd」：实例按接口覆盖优先，否则接口自身 powerDomain）
    if (S.busType !== C.busType) throw new Error(`busType mismatch on connection '${conn.id}'`);
    if (S.busType === "BISR" && effectivePd(A, S) !== effectivePd(B, C))
      throw new Error(`powerDomain mismatch on connection '${conn.id}'`);
    if (S.busType === "BISR" && !!S.omitMemCtrl !== !!C.omitMemCtrl)
      throw new Error(`omitMemCtrl mismatch on connection '${conn.id}'`);
    if (S.busType === "BSCAN" && S.bscanVariant !== C.bscanVariant)
      throw new Error(`bscanVariant mismatch on connection '${conn.id}'`);
    if (S.busType === "SSN" && (S.busWidth ?? 4) !== (C.busWidth ?? 4))
      throw new Error(`busWidth mismatch on connection '${conn.id}'`);

    for (const b of basesOf(S)) {
      if (b.group === "down") {
        // client 输入 ← secondary 的 _to_ 输出
        put(B.id, clientSignal(C, b).name, `${A.instanceName}/${secondarySignal(S, b).name}`);
      } else {
        // secondary 的 _from_ 输入 ← client 输出
        put(A.id, secondarySignal(S, b).name, `${B.instanceName}/${clientSignal(C, b).name}`);
      }
    }
  }

  // 提升排除：root 的边界接口若带 portedFrom，则把它指向的子接口从对应 childDef 的端口展开里省略。
  // 无 portedFrom → 所有排除集为空 → 输出逐字不变（golden 安全）。
  const exclude = new Map<Id, Set<Id>>();
  for (const bi of root.interfaces) {
    if (!bi.portedFrom) continue;
    const inst = insts.get(bi.portedFrom.instanceId);
    if (!inst) continue;
    let s = exclude.get(inst.hardenId);
    if (!s) {
      s = new Set<Id>();
      exclude.set(inst.hardenId, s);
    }
    s.add(bi.portedFrom.interfaceId);
  }

  // §7 输出（只列 tiling 子块，按首次出现去重）
  const seen = new Set<Id>();
  const orderedDefs: HardenDef[] = [];
  for (const i of tilingInsts) {
    if (!seen.has(i.hardenId)) {
      seen.add(i.hardenId);
      orderedDefs.push(defOf(i));
    }
  }

  const lines: string[] = [];
  lines.push(`TopModuleConnections(${root.designName}) {`);
  for (const def of orderedDefs) {
    const { inputPorts, outputPorts } = expandDef(def, exclude.get(def.id));
    const fallback = `../../design/${def.designName}/${def.designName}.v`;
    lines.push(`  ChildBlock(${def.designName}) {`);
    lines.push(`    file_name : ${def.fileName ?? fallback};`);
    lines.push(...fmtList("input_ports", inputPorts.map((p) => p.name), "    "));
    lines.push(...fmtList("output_ports", outputPorts.map((p) => p.name), "    "));
    for (const inst of tilingInsts.filter((i) => i.hardenId === def.id)) {
      const dm = driver.get(inst.id) ?? new Map<string, string>();
      const sources = inputPorts.map((p) => dm.get(p.name) ?? UNCONNECTED(p.name));
      lines.push(`    Instance(${inst.instanceName}) {`);
      lines.push(...fmtList("input_port_sources", sources, "      "));
      lines.push(`    }`);
    }
    lines.push(`  }`);
  }
  lines.push(`}`);

  const fileBase = isRoot ? "top" : root.designName;
  return {
    file: `../../design/${root.designName}/${fileBase}.top_level_ports_and_connectionss`,
    text: lines.join("\n") + "\n",
  };
}

/** 覆盖整棵树：对每个含 tiling 子块的 def 各产一份连接文件；有提升接口的层再附一份 .tcl（spec §6.0 / 提升）。 */
export function generateAll(lib: HardenLibrary, rootId: Id): GenResult[] {
  const out: GenResult[] = [];
  for (const d of lib.defs) {
    const r = generate(d, lib, d.id === rootId);
    if (r) out.push(r);
    const tcl = generateTcl(d, lib, d.id === rootId);
    if (tcl) out.push(tcl);
  }
  return out;
}
