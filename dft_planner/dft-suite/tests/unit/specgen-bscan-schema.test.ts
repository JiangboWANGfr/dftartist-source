import { test } from "node:test";
import assert from "node:assert/strict";
import { componentSchema } from "../../src/specgen/schema.ts";

// 回归：EBScanPipeline 不在 datapath.schema.json，componentSchema 必须走 bscan.schema.json 兜底而非抛错
// （否则 DftConfigDialog 双击 BScan 节点崩溃）。
test("componentSchema：EBScanPipeline 走 bscan.schema 兜底（不抛，含 props）", () => {
  const s = componentSchema("EBScanPipeline");
  assert.equal(s.name, "EBScanPipeline");
  assert.ok((s.props ?? []).some((p) => p.name === "so_retiming"), "应含 so_retiming 属性");
});

// 现有 datapath 类型不受影响
test("componentSchema：ScanHost 仍从 datapath.schema 取", () => {
  const s = componentSchema("ScanHost");
  assert.equal(s.name, "ScanHost");
});
