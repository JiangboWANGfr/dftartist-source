import assert from "node:assert/strict";
import { vm, using as graphUsing, deep, tick } from "../independent-graph-session/harness.mjs";
import { content, nodeKey, edgeKey } from "./input.mjs";
export { vm, deep, tick };
export async function using(fn, empty = false) {
  return graphUsing(async (c) => {
    c.selection = new vm.SelectionModel({ snapshotId: c.graph.state.snapshotId });
    c.models.push(c.selection);
    c.source = c.graph.registerSource({ origin: "analysis", label: "B93 fixture" });
    if (!empty) await c.source.replace(content(c.graph.state.snapshotId));
    return fn(c);
  });
}
export function capability() {
  for (const k of [
    "createFoldedGraphProjection",
    "selectFoldedGraphElement",
    "FoldedGraphProjection",
    "FoldProjectionError",
  ])
    assert.equal(typeof Reflect.get(vm, k), "function", "missing production fold export " + k);
}
export const err = (code) => (e) => {
  assert(e instanceof vm.FoldProjectionError);
  assert.equal(e.code, code);
  return true;
};
export const shownNode = (p, key) => p.nodes.find((n) => n.members.some((m) => nodeKey(m) === key));
export const shownEdge = (p, key) => p.edges.find((e) => e.members.some((m) => edgeKey(m) === key));
export function partition(p) {
  deep(p);
  const state = p.state;
  const ns = p.nodes.flatMap((n) => n.members),
    es = [...p.edges.flatMap((e) => e.members), ...p.nodes.flatMap((n) => n.internalEdges)];
  assert.equal(ns.length, state.nodes.length);
  assert.equal(new Set(ns).size, ns.length);
  assert.equal(es.length, state.edges.length);
  assert.equal(new Set(es).size, es.length);
  for (const n of state.nodes) assert(ns.includes(n), "original node reference");
  for (const e of state.edges) assert(es.includes(e), "original edge reference");
  const nodeOrder = p.nodes.map((n) => state.nodes.indexOf(n.members[0]));
  const edgeOrder = p.edges.map((e) => state.edges.indexOf(e.members[0]));
  assert.deepEqual(
    nodeOrder,
    [...nodeOrder].sort((a, b) => a - b),
  );
  assert.deepEqual(
    edgeOrder,
    [...edgeOrder].sort((a, b) => a - b),
  );
  for (const [kind, list, original] of [
    ["node", p.nodes, state.nodes],
    ["edge", p.edges, state.edges],
  ])
    for (const x of list) {
      assert.equal(x.target.kind, kind);
      assert.equal(x.target.projectionId, p.id);
      const order = x.members.map((m) => original.indexOf(m));
      assert.deepEqual(
        order,
        [...order].sort((a, b) => a - b),
      );
      if (x.kind === "member") {
        assert.equal(x.members.length, 1);
        assert.equal("groupKey" in x, false);
      }
      if (kind === "node") {
        if (x.kind === "member") assert.deepEqual(x.internalEdges, []);
        const ie = x.internalEdges.map((e) => state.edges.indexOf(e));
        assert.deepEqual(
          ie,
          [...ie].sort((a, b) => a - b),
        );
      } else {
        assert(p.nodes.some((n) => n.target.id === x.from));
        assert(p.nodes.some((n) => n.target.id === x.to));
        if (x.kind === "bus") assert(x.members.length >= 2);
      }
    }
}
