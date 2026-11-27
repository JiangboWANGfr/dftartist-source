// GenConnection MVP — 最小一致性检查（spec §8 中"结构型"的几条；连接型的在 generate 里）。
// 另含文档级引用完整性 + 实例化环检测（持久化用）。

import type { GenConnDocument, HardenDef, HardenLibrary, Id } from "./model.ts";

/** 校验单个 def 的结构不变式（§3 / §8）。违反则抛错。 */
export function validateDef(def: HardenDef): void {
  // §3/§8：designType=hierarchical 不允许 secondary 接口——但放过"提升(portedFrom)"上来的 secondary（馈通，合法）
  if (def.designType === "hierarchical") {
    const sec = def.interfaces.find((i) => i.role === "secondary" && !i.portedFrom);
    if (sec) {
      throw new Error(
        `hierarchical def '${def.designName}' must not have a secondary interface ('${sec.id}')`,
      );
    }
  }
  // §3/§8：同一 busType（BISR 按 powerDomain）最多 1 个 client
  const seen = new Set<string>();
  for (const i of def.interfaces) {
    if (i.placement === "other" && !((i.isDataSource && i.role === "client") || (i.busType === "JTAG1838" && i.role === "secondary"))) {
      throw new Error(`def '${def.designName}': placement=other is only allowed for data source client or JTAG1838 secondary (interface '${i.id}')`);
    }
    if (i.role !== "client") continue;
    const key = i.busType === "BISR" ? `BISR:${i.powerDomain}` : i.busType === "SSN" ? `SSN:${i.interfaceName ?? ""}` : i.busType;
    if (seen.has(key)) {
      throw new Error(`def '${def.designName}' has multiple clients for '${key}'`);
    }
    seen.add(key);
  }
}

/** 校验整个库的所有 def。 */
export function validateLibrary(lib: HardenLibrary): void {
  for (const d of lib.defs) validateDef(d);
}

/**
 * 检测实例化是否成环（def 直接/间接实例化自己）。
 * 返回成环路径（如 ['a','b','a']）或 null。悬空 hardenId 不在此处理（见 validateDocument）。
 */
export function findInstantiationCycle(lib: HardenLibrary): Id[] | null {
  const byId = new Map(lib.defs.map((d) => [d.id, d]));
  const VISITING = 0;
  const DONE = 1;
  const state = new Map<Id, number>();
  const stack: Id[] = [];
  let cycle: Id[] | null = null;

  const visit = (id: Id): boolean => {
    const d = byId.get(id);
    if (!d) return false; // 悬空引用，交给 validateDocument
    const s = state.get(id);
    if (s === DONE) return false;
    if (s === VISITING) {
      cycle = stack.slice(stack.indexOf(id)).concat(id);
      return true;
    }
    state.set(id, VISITING);
    stack.push(id);
    for (const inst of d.childInstances) {
      if (visit(inst.hardenId)) return true;
    }
    stack.pop();
    state.set(id, DONE);
    return false;
  };

  for (const d of lib.defs) {
    if (visit(d.id)) break;
  }
  return cycle;
}

/**
 * 文档级完整性校验：唯一性 + 每个 def 结构(§8) + 引用解析 + ui 引用 + 无环。
 * 违反则抛错。读回外部 JSON 时务必先跑这一步。
 */
export function validateDocument(doc: GenConnDocument): void {
  const lib = doc.library;

  // 1. designName / def id 全局唯一
  const ids = new Set<Id>();
  const names = new Set<string>();
  for (const d of lib.defs) {
    if (ids.has(d.id)) throw new Error(`duplicate def id '${d.id}'`);
    ids.add(d.id);
    if (names.has(d.designName)) throw new Error(`duplicate designName '${d.designName}'`);
    names.add(d.designName);
  }

  // 2. 每个 def 结构合法（§3/§8）
  validateLibrary(lib);

  // 3. 引用解析：实例 → def；连接端点 → 实例 + 角色正确的接口
  const defById = new Map(lib.defs.map((d) => [d.id, d]));
  for (const d of lib.defs) {
    const instById = new Map<Id, { hardenId: Id; instanceName: string }>();
    for (const inst of d.childInstances) {
      if (instById.has(inst.id)) {
        throw new Error(`duplicate instance id '${inst.id}' in def '${d.designName}'`);
      }
      instById.set(inst.id, inst);
      if (!defById.has(inst.hardenId)) {
        throw new Error(`instance '${inst.instanceName}' in def '${d.designName}' references unknown def '${inst.hardenId}'`);
      }
    }
    for (const conn of d.connections) {
      const A = instById.get(conn.secondaryInstanceId);
      const B = instById.get(conn.clientInstanceId);
      if (!A) throw new Error(`connection '${conn.id}' in '${d.designName}': unknown secondary instance '${conn.secondaryInstanceId}'`);
      if (!B) throw new Error(`connection '${conn.id}' in '${d.designName}': unknown client instance '${conn.clientInstanceId}'`);
      const defA = defById.get(A.hardenId);
      const defB = defById.get(B.hardenId);
      const S = defA?.interfaces.find((i) => i.id === conn.secondaryInterfaceId);
      const C = defB?.interfaces.find((i) => i.id === conn.clientInterfaceId);
      if (!S || S.role !== "secondary") {
        throw new Error(`connection '${conn.id}': '${conn.secondaryInterfaceId}' is not a secondary interface`);
      }
      if (!C || C.role !== "client") {
        throw new Error(`connection '${conn.id}': '${conn.clientInterfaceId}' is not a client interface`);
      }
    }
  }

  // 4. ui 引用
  if (!defById.has(doc.ui.openDefId)) throw new Error(`ui.openDefId '${doc.ui.openDefId}' not in library`);
  if (!defById.has(doc.ui.rootDefId)) throw new Error(`ui.rootDefId '${doc.ui.rootDefId}' not in library`);

  // 5. 无实例化环
  const cyc = findInstantiationCycle(lib);
  if (cyc) throw new Error(`instantiation cycle: ${cyc.join(" -> ")}`);
}
