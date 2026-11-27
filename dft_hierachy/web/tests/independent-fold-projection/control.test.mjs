// Same new input on old real models; no fold implementation or oracle substitute.
import test from "node:test";
import assert from "node:assert/strict";
import { vm, using, deep } from "./harness.mjs";
import { expectedItems, fullOptions, nodeKey, edgeKey } from "./input.mjs";
test("C01 B93 legal DTO and original projection/selection/annotation control", async () => {
  await using(async (c) => {
    const g = c.graph,
      s = c.selection,
      p = vm.createGraphProjection(g);
    assert.equal(p.nodes.length, 8);
    assert.equal(p.edges.length, 11);
    deep(p);
    assert.equal(p.state, g.state);
    assert.equal(fullOptions(g).groups.length, 2);
    for (const n of p.nodes) assert.deepEqual(n.items, expectedItems(n.member), nodeKey(n.member));
    for (const e of p.edges) assert.deepEqual(e.items, expectedItems(e.member), edgeKey(e.member));
    for (const member of [...g.state.nodes, ...g.state.edges]) assert(Object.isFrozen(member));
    const x = p.nodes.find((n) => nodeKey(n.member) === "B-x");
    vm.selectGraphElement(g, s, x.target);
    assert.deepEqual(s.current.items, expectedItems(x.member));
    const a = new vm.AnnotationLayer({
      snapshotId: g.state.snapshotId,
      id: "B93-control",
      label: "control",
    });
    c.models.push(a);
    a.set([{ ref: "B87:x<&>", mark: { badge: "control" } }]);
    assert.equal(
      vm.resolveObjectAnnotations(
        g.state.snapshotId,
        x.items.map((item) => item.ref),
        [a],
      )[0].entry.mark.badge,
      "control",
    );
    assert.equal(c.wire.sent.length, 0);
  });
});
