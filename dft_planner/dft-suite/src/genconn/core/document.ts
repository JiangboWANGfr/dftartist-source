// GenConnection MVP — 持久化：序列化 / 反序列化 / 版本迁移。
// 模型本身是纯 JSON 数据，序列化即 JSON；真正的活在 migrate + validateDocument。

import type { GenConnDocument } from "./model.ts";
import { validateDocument } from "./validate.ts";

export const CURRENT_SCHEMA_VERSION = 3;

/**
 * 把任意历史版本的原始对象迁移到当前 schema。
 * 以后加字段就在这里按 version 逐步升级。
 */
export function migrate(raw: unknown): GenConnDocument {
  if (raw === null || typeof raw !== "object") {
    throw new Error("document is not an object");
  }
  const v = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof v !== "number") {
    throw new Error("missing or invalid schemaVersion");
  }
  if (v > CURRENT_SCHEMA_VERSION) {
    throw new Error(`document schemaVersion ${v} is newer than supported ${CURRENT_SCHEMA_VERSION}`);
  }
  const doc = raw as GenConnDocument;
  if (v < 2) {
    // v1 -> v2: DFX ctrl fields (docs/specs §5.3); ??= below preserves any
    // pre-existing data (e.g. a v1-stamped example doc that carried v2 fields)
    doc.schemaVersion = 2;
  }
  if (v < 3) {
    // v2 -> v3: DFX 去画布化 (docs/specs §5;D11) — dfxInstances 由 ??= 兜底
    doc.schemaVersion = 3;
  }
  doc.ctrlIps ??= [];
  doc.dfxInstances ??= [];
  doc.moduleDsNext ??= 1;
  doc.muxDsNext ??= 1;
  return doc;
}

/** 文档 → 字符串（落盘 / localStorage）。 */
export function serialize(doc: GenConnDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** 字符串 → 文档：解析 → 迁移 → 完整性校验。坏数据抛清晰错误。 */
export function deserialize(text: string): GenConnDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`invalid JSON: ${(e as Error).message}`);
  }
  const doc = migrate(raw);
  validateDocument(doc);
  return doc;
}

/** 新建一份空文档：一个空的顶层 def 作为生成根。 */
export function emptyDocument(rootDesignName: string): GenConnDocument {
  const id = rootDesignName;
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    library: {
      defs: [
        {
          id,
          designName: rootDesignName,
          designLevel: "chip",
          designType: "hierarchical",
          interfaces: [],
          childInstances: [],
          connections: [],
        },
      ],
    },
    ui: { openDefId: id, rootDefId: id },
    ctrlIps: [],
    dfxInstances: [],
    moduleDsNext: 1,
    muxDsNext: 1,
  };
}
