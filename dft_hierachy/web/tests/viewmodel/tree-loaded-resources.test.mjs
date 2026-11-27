import assert from "node:assert/strict";
import { test } from "node:test";
import { TreeData } from "../../packages/viewmodel/dist/tree-data.js";
import { model, load, first, child, row, scope, watch, local } from "../independent-tree/harness.mjs";

function observe(t) {
  const original = TreeData.prototype.subtree, seen = []; let calls = 0;
  TreeData.prototype.subtree = function* (...args) {
    ++calls;
    for (const page of original.apply(this, args)) { seen.push(page.owner?.info.ref ?? null); yield page; }
  };
  t.after(() => { TreeData.prototype.subtree = original; });
  return { seen, calls: () => calls };
}

test("A M7 loaded resources: successful idle data is not traversed by cancel, scope collapse or reload", async (t) => {
  const observed = observe(t), c = await model(t, { childCount: 1000 }); await load(c);
  await first(c, "B-root", Array.from({ length: 1000 }, (_, i) => child(`leaf${i}`, ["g", `leaf${i}`])));
  await c.tree.cancel(null); await c.tree.setExpanded(scope(c.tree, ["g"]).id, false);
  await c.tree.setExpanded(row(c.tree, "B-root").id, false); assert.equal(observed.calls(), 0);
  const pending = watch(c.tree.reload(null)), request = await c.wire.next("inst.roots");
  c.wire.ok(request, c.roots); await pending; assert.equal(observed.calls(), 0);
  assert.equal(c.wire.cancels.length, 0); assert.equal(c.tree.rootState.status, "success");
});

test("A M7 loaded resources: cancellation stops walking after the last task and still ignores its late reply", async (t) => {
  const c = await model(t, { childCount: 2 }); await load(c);
  await first(c, "B-root", [child("left", ["left"], 1), child("right", ["right"], 1)]);
  await first(c, "left", [child("left-leaf", ["left", "left-leaf"])]);
  const pending = watch(c.tree.setExpanded(row(c.tree, "right").id, true)), request = await c.wire.next("inst.children");
  const observed = observe(t); await c.tree.cancel(null); await assert.rejects(pending, local("cancelled"));
  assert.deepEqual(observed.seen, [null, "B-root", "right"]); assert.equal(observed.calls(), 1);
  assert.equal(row(c.tree, "left").children.status, "success"); assert.equal(row(c.tree, "right").children.status, "cancelled");
  assert.ok(c.wire.cancels.some((q) => q.params.target === request.id));
  c.wire.ok(request, { items: [child("late", ["right", "late"])] });
  assert.ok(!c.tree.rows.some((r) => r.instance?.ref === "late"));
});
