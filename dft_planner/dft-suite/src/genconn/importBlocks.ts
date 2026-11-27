// 把 Hierarchyshower 导出的 *.blocks.json 增量并入当前文档（不替换画布）。
// 纯函数，组合 core 的已测编辑原语；**不改 src/core**。放 src/ui（非 core）便于单测。
//
// payload = generate() 真正读取的三样：designName / fileName? / instanceName?。
// 策略：按 designName 去重 —— 命中已有 def 则复用（addInstanceFromDef，镜像 RTL 一 def 多 instance，
// 也规避 updateDefAttrs 的重名抛错）；否则 addBlankHarden 新建后 updateDefAttrs 盖上真名+文件。
// 实例名冲突则保留自动名（不让 renameInstance 抛错）。

import type { GenConnDocument, HardenDef, Id } from "./core/model.ts";
import { addBlankHarden, addInstanceFromDef, updateDefAttrs, renameInstance, mapOpenDef } from "./core/edit.ts";

export interface BlockPayload {
  designName: string;
  fileName?: string;
  instanceName?: string;
  /** 来源设计层次节点 id（点分隔层次路径）；写到实例的 hierPath，DFX 配置需要。 */
  hierPath?: string;
}
export interface ImportResult {
  doc: GenConnDocument;
  added: number;
  skipped: string[];
}

function openDef(doc: GenConnDocument): HardenDef {
  const d = doc.library.defs.find((x) => x.id === doc.ui.openDefId);
  if (!d) throw new Error("open def not found");
  return d;
}
function lastInstId(doc: GenConnDocument): Id {
  const insts = openDef(doc).childInstances;
  return insts[insts.length - 1].id;
}

/** 解析 + 校验 *.blocks.json 文本为 payload 数组（坏数据抛清晰错误）。 */
export function parseBlocks(text: string): BlockPayload[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("blocks file must be a JSON array");
  return data.map((b, i) => {
    const o = b as Record<string, unknown>;
    if (!o || typeof o.designName !== "string" || !o.designName) {
      throw new Error(`block[${i}] is missing designName`);
    }
    return {
      designName: o.designName,
      fileName: typeof o.fileName === "string" ? o.fileName : undefined,
      instanceName: typeof o.instanceName === "string" ? o.instanceName : undefined,
    };
  });
}

/**
 * 落一个 block 到当前 open def 的指定位置（at 缺省则按数量错开摆放）。
 * 按 designName 去重：命中已有 def 则复用，否则新建并盖上真名+文件；实例名冲突保留自动名。
 * 坏情况抛清晰错误（空名 / 把当前层加进它自己）。供拖拽落点 与 批量导入 共用。
 */
export function addBlockAt(doc: GenConnDocument, p: BlockPayload, at?: { x: number; y: number }): GenConnDocument {
  if (!p.designName) throw new Error("(empty designName)");
  const existing = doc.library.defs.find((d) => d.designName === p.designName);
  if (existing) {
    if (existing.id === doc.ui.openDefId) throw new Error(`${p.designName} (current layer itself)`);
    doc = addInstanceFromDef(doc, existing.id, at);
  } else {
    doc = addBlankHarden(doc, at);
    const defId = doc.library.defs[doc.library.defs.length - 1].id;
    doc = updateDefAttrs(doc, defId, { designName: p.designName, fileName: p.fileName });
  }
  const instId = lastInstId(doc); // 两条路径（新建/复用 def）落下的实例都是最后一个
  if (p.instanceName) {
    const taken = openDef(doc).childInstances.some((i) => i.id !== instId && i.instanceName === p.instanceName);
    if (!taken) doc = renameInstance(doc, instId, p.instanceName);
  }
  if (p.hierPath) {
    const hierPath = p.hierPath;
    doc = mapOpenDef(doc, (def) => ({
      ...def,
      childInstances: def.childInstances.map((i) => (i.id === instId ? { ...i, hierPath } : i)),
    }));
  }
  return doc;
}

/** 把若干 block 增量并入 doc（落到当前 open def）。返回新 doc + 计数 + 跳过原因。 */
export function addBlocksFromHierarchy(doc: GenConnDocument, payloads: BlockPayload[]): ImportResult {
  let added = 0;
  const skipped: string[] = [];
  for (const p of payloads) {
    try {
      doc = addBlockAt(doc, p);
      added++;
    } catch (e) {
      skipped.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { doc, added, skipped };
}
