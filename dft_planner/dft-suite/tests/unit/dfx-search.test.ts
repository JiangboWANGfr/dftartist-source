// Unit test: 层次搜索（spec §5.1）—— searchHierarchy 纯匹配器 + hierPath 透传。
// 纯函数：无 daemon、无 React、无 Zustand。

import { test } from "node:test";
import assert from "node:assert/strict";
import { searchHierarchy, nodeToPayload, type DesignHierarchy } from "../../src/genconn/hierarchy.ts";
import { addBlockAt } from "../../src/genconn/importBlocks.ts";
import { emptyDocument } from "../../src/genconn/core/document.ts";

// 最小层次 fixture（字段名与 parseHierarchy 输出一致）。
const H: DesignHierarchy = {
  schemaVersion: 1,
  rootInstanceIds: ["top"],
  instances: {
    "top": { id: "top", instanceName: "top", definitionId: "d_top", parentInstanceId: null, childInstanceIds: ["top.PLL_1", "top.PLL_2", "top.u_core"], isLeaf: false },
    "top.PLL_1": { id: "top.PLL_1", instanceName: "PLL_1", definitionId: "d_pll", parentInstanceId: "top", childInstanceIds: [], isLeaf: true },
    "top.PLL_2": { id: "top.PLL_2", instanceName: "PLL_2", definitionId: "d_pll", parentInstanceId: "top", childInstanceIds: [], isLeaf: true },
    "top.u_core": { id: "top.u_core", instanceName: "u_core", definitionId: "d_core", parentInstanceId: "top", childInstanceIds: [], isLeaf: true },
  },
  definitions: {
    d_top: { id: "d_top", designName: "soc_top" },
    d_pll: { id: "d_pll", designName: "pll_wrap", filePath: "/rtl/pll.v" },
    d_core: { id: "d_core", designName: "core_cluster" },
  },
};

test("searchHierarchy: 子串大小写不敏感，匹配实例名", () => {
  const hits = searchHierarchy(H, "pll_1");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].instId, "top.PLL_1");
  assert.equal(hits[0].path, "top.PLL_1");
  assert.equal(hits[0].instanceName, "PLL_1");
  assert.equal(hits[0].designName, "pll_wrap");
});

test("searchHierarchy: 也按模块名匹配", () => {
  // "core" 命中 u_core（实例名 + 模块名皆含）；"cluster" 只可能来自模块名 core_cluster。
  assert.deepEqual(searchHierarchy(H, "core").map((x) => x.instId), ["top.u_core"]);
  assert.deepEqual(searchHierarchy(H, "cluster").map((x) => x.instId), ["top.u_core"]);
});

test("searchHierarchy: * 通配 + limit 截断", () => {
  const hits = searchHierarchy(H, "PLL_*");
  assert.deepEqual(hits.map((x) => x.instId).sort(), ["top.PLL_1", "top.PLL_2"]);
  assert.equal(searchHierarchy(H, "PLL_*", 1).length, 1);
});

test("searchHierarchy: 空白 query 返回 []", () => {
  assert.deepEqual(searchHierarchy(H, ""), []);
  assert.deepEqual(searchHierarchy(H, "   "), []);
});

test("nodeToPayload 带 hierPath（=instId）", () => {
  const p = nodeToPayload(H, "top.PLL_1");
  assert.equal(p.hierPath, "top.PLL_1");
  assert.equal(p.designName, "pll_wrap");
  assert.equal(p.instanceName, "PLL_1");
});

test("addBlockAt 把 hierPath 写到实例（新建 def 与复用 def 两条路径）", () => {
  let doc = emptyDocument("chip");
  // 路径 1：新建 def
  doc = addBlockAt(doc, nodeToPayload(H, "top.PLL_1"));
  // 路径 2：复用已有 def（同 designName pll_wrap）
  doc = addBlockAt(doc, nodeToPayload(H, "top.PLL_2"));

  const openDef = doc.library.defs.find((d) => d.id === doc.ui.openDefId)!;
  assert.equal(openDef.childInstances.length, 2);
  assert.equal(openDef.childInstances[0].hierPath, "top.PLL_1");
  assert.equal(openDef.childInstances[1].hierPath, "top.PLL_2");
});
