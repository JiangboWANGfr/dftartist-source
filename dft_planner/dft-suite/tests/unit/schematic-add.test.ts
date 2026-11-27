import { test } from "node:test";
import assert from "node:assert/strict";
import { newSchematic, makeNode, addNodeWithEdges, keepInternalEdges, type SchEdge } from "../../src/hierarchy/core/schematic.ts";

const port = (name: string, direction: "in" | "out") => ({ name, direction, width: 1, busLabel: name });
const edge = (id: string, from: string, to: string): SchEdge =>
  ({ id, fromNode: from, fromPort: "o", toNode: to, toPort: "i", netName: "n", bus: false });

test("addNodeWithEdges 追加第二个实例+连线，节点/边都去重", () => {
  const a = makeNode("top.a", "a", "A|/a.v", "module", [port("o", "out")]);
  const b = makeNode("top.b", "b", "B|/b.v", "module", [port("i", "in")]);
  const g0 = newSchematic(a);
  const g1 = addNodeWithEdges(g0, b, [edge("e1", "top.a", "top.b")]);
  assert.equal(Object.keys(g1.nodes).length, 2);
  assert.equal(g1.edges.length, 1);
  // 幂等：同节点同边再加一次不重复
  const g2 = addNodeWithEdges(g1, b, [edge("e1", "top.a", "top.b")]);
  assert.equal(Object.keys(g2.nodes).length, 2);
  assert.equal(g2.edges.length, 1);
  // 追加不该动 expanded（新框保留可 trace 的菱形）
  assert.deepEqual(g1.expanded, {});
});

test("keepInternalEdges 只保留两端都已在图上的边", () => {
  const ids = new Set(["top.a", "top.b"]);
  const kept = keepInternalEdges(ids, [
    edge("e1", "top.a", "top.b"),   // 两端都在 → 留
    edge("e2", "top.a", "top.c"),   // c 不在图上 → 丢
    edge("e3", "top.x", "top.b"),   // x 不在图上 → 丢
  ]);
  assert.deepEqual(kept.map((e) => e.id), ["e1"]);
});
