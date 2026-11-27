import test from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { heapGraph, reactions, delta } from "./heap.mjs";
// Synthetic heap-parser data only. Never used as model, Promise or candidate UI.
const promise = { id: "p", type: "object", name: "Promise", edges: [] };
function graph(extra = []) {
  const reaction = {
    id: "r",
    type: "native",
    name: "system / PromiseReaction",
    edges: [{ type: "hidden", name: 1, to: promise }, ...extra],
  };
  const root = {
    id: "1",
    type: "object",
    name: "Promise",
    edges: [{ type: "internal", name: "reactions_or_result", to: reaction }],
  };
  return { byID: new Map([["1", root]]), reaction };
}
test("B46 inventory has twelve pending and two explicitly unsupported settled controls", () => {
  assert.equal(cases.length, 14);
  assert.equal(
    cases.filter((c) => c.expected.status === "pending-structure-only").length,
    12,
  );
  assert.equal(
    cases.filter((c) => c.expected.status === "unsupported-settled").length,
    2,
  );
});
test("B46 empty forwarding structure remains empty, not directly dual", () => {
  const g = graph();
  assert.equal(reactions(g, "1", "pending").reactions[0].closures.length, 0);
});
test("B46 two explicit closure targets retained without handler-name inference", () => {
  const g = graph(
    [0, 1].map((i) => ({
      type: "hidden",
      name: i + 2,
      to: { id: "c" + i, type: "closure", name: "" },
    })),
  );
  assert.equal(reactions(g, "1", "pending").reactions[0].closures.length, 2);
});
test("B46 missing original heap identity rejected", () =>
  assert.throws(() => reactions(graph(), "missing", "pending")));
test("B46 unknown inspector state is not unsupported-settled success", () =>
  assert.throws(() => reactions(graph(), "1", "mystery")));
test("B46 unknown hidden target cannot be a negative empty-handler green", () => {
  const g = graph([
    {
      type: "hidden",
      name: 2,
      to: { id: "unknown", type: "object", name: "ExoticHandler" },
    },
  ]);
  assert.throws(() => reactions(g, "1", "pending"));
});
test("B46 unknown snapshot schema rejected", () =>
  assert.throws(() =>
    heapGraph({
      snapshot: { meta: { node_fields: [], edge_fields: [] } },
      nodes: [],
      edges: [],
      strings: [],
    }),
  ));
test("B46 reaction cycle rejected", () => {
  const g = graph();
  g.reaction.edges.push({ type: "hidden", name: 2, to: g.reaction });
  assert.throws(() => reactions(g, "1", "pending"));
});
test("B46 changed baseline reaction identity or closures rejected", () => {
  const before = {
    status: "pending-structure-only",
    original: "1",
    reactions: [
      { id: "r", closures: [{ id: "c", type: "closure", name: "original" }] },
    ],
  };
  const after = structuredClone(before);
  after.reactions[0].closures[0].id = "replacement";
  assert.throws(() => delta(before, after));
});
test("B46 settled originals explicitly unsupported, not judged unobserved", () => {
  for (const state of ["fulfilled", "rejected"])
    assert.equal(reactions(graph(), "1", state).status, "unsupported-settled");
});
