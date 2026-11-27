// 设计层次（DesignHierarchy）—— pyslang 离线导出的整棵实例树（形状沿用 Hierarchyshower 的 core/model）。
// 本期只读它：把树节点拖到画布即取 instanceName / 模块名 / 文件 三样，调 importBlocks 的去重落点逻辑。
// 纯模块（无 React/DOM），可 node:test 直接测；不碰 src/core。
//
// 留好接口缝：Phase 2 服务器实时解析时，只要返回同样形状的对象，树面板与拖拽逻辑一行都不用改。

import type { BlockPayload } from "./importBlocks.ts";

/** 一个实例节点：id=层次路径（稳定 id），definitionId 指向 definitions。 */
export interface HierarchyInstanceNode {
  id: string;
  instanceName: string;
  definitionId: string;
  parentInstanceId: string | null;
  childInstanceIds: string[];
  isLeaf: boolean;
}
/** 一个模块定义：designName=模块名，filePath=源文件（黑盒/原语可缺省）。 */
export interface HierarchyDef {
  id: string;
  designName: string;
  filePath?: string;
}
export interface DesignHierarchy {
  schemaVersion: number;
  rootInstanceIds: string[];
  instances: Record<string, HierarchyInstanceNode>;
  definitions: Record<string, HierarchyDef>;
}

function isDict(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 解析 + 校验层次 JSON（坏数据抛清晰错误；缺省字段做防御性补全）。 */
export function parseHierarchy(text: string): DesignHierarchy {
  const data: unknown = JSON.parse(text);
  if (!isDict(data)) throw new Error("Hierarchy file must be a JSON object");
  if (!isDict(data.instances)) throw new Error("Hierarchy file is missing the instances dictionary");
  if (!isDict(data.definitions)) throw new Error("Hierarchy file is missing the definitions dictionary");
  if (!Array.isArray(data.rootInstanceIds)) throw new Error("Hierarchy file is missing the rootInstanceIds array");

  const instances: Record<string, HierarchyInstanceNode> = {};
  for (const [k, raw] of Object.entries(data.instances)) {
    if (!isDict(raw) || typeof raw.instanceName !== "string" || typeof raw.definitionId !== "string") {
      throw new Error(`Instance '${k}' is missing instanceName/definitionId`);
    }
    // 去掉自指 child（实例把自己列为子）—— 否则层次树渲染会无限递归把浏览器搞崩。
    const kids = (Array.isArray(raw.childInstanceIds) ? raw.childInstanceIds.filter((x): x is string => typeof x === "string") : []).filter((cid) => cid !== k);
    instances[k] = {
      id: typeof raw.id === "string" ? raw.id : k,
      instanceName: raw.instanceName,
      definitionId: raw.definitionId,
      parentInstanceId: typeof raw.parentInstanceId === "string" ? raw.parentInstanceId : null,
      childInstanceIds: kids,
      isLeaf: typeof raw.isLeaf === "boolean" ? raw.isLeaf : kids.length === 0,
    };
  }

  const definitions: Record<string, HierarchyDef> = {};
  for (const [k, raw] of Object.entries(data.definitions)) {
    if (!isDict(raw) || typeof raw.designName !== "string") throw new Error(`Definition '${k}' is missing designName`);
    definitions[k] = {
      id: typeof raw.id === "string" ? raw.id : k,
      designName: raw.designName,
      filePath: typeof raw.filePath === "string" ? raw.filePath : undefined,
    };
  }

  return {
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    rootInstanceIds: data.rootInstanceIds.filter((x): x is string => typeof x === "string"),
    instances,
    definitions,
  };
}

/** 取一个实例节点的落块载荷：instanceName + 模块名 + 文件 + 层次路径。 */
export function nodeToPayload(h: DesignHierarchy, instId: string): BlockPayload {
  const node = h.instances[instId];
  if (!node) throw new Error(`Unknown instance '${instId}'`);
  const def = h.definitions[node.definitionId];
  return {
    designName: def?.designName ?? node.definitionId,
    fileName: def?.filePath,
    instanceName: node.instanceName,
    hierPath: instId,
  };
}

export interface HierHit {
  instId: string;
  /** 完整层次路径，点分隔（即 instId）。 */
  path: string;
  instanceName: string;
  designName: string;
}

/** 子串（大小写不敏感）+ `*` 通配；同时匹配实例名与模块名；上限截断（spec §5.1：200）。 */
export function searchHierarchy(h: DesignHierarchy, query: string, limit = 200): HierHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const re = q.includes("*")
    ? new RegExp(q.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"))
    : null;
  const match = (s: string) => {
    const t = s.toLowerCase();
    return re ? re.test(t) : t.includes(q);
  };
  const out: HierHit[] = [];
  for (const [id, inst] of Object.entries(h.instances)) {
    const def = h.definitions[inst.definitionId];
    const designName = def?.designName ?? "";
    if (match(inst.instanceName) || match(designName)) {
      out.push({ instId: id, path: id, instanceName: inst.instanceName, designName });
      if (out.length >= limit) break;
    }
  }
  return out;
}
