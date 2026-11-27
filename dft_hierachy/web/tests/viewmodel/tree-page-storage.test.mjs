import assert from "node:assert/strict";
import { test } from "node:test";
import { TreeData, TreeNode } from "../../packages/viewmodel/dist/tree-data.js";
import { model, load, first, row, scope, child, watch } from "../independent-tree/harness.mjs";

const complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
const info = (ref, path = [ref], childCount = 0) => Object.freeze({ ref, name: path.at(-1),
  path: Object.freeze(path), pathText: path.join("."), kind: "module", def: "d", defName: "pages",
  childCount, hasParamOverrides: false });

test("A M7 page storage: first use replaces initial state with one stable owning page", () => {
  for (const count of [0, 1]) {
    const node = new TreeNode(info("node", ["node"], count), null), state = node.childrenState;
    assert.equal(node.materializedPage, undefined); assert.ok(Object.isFrozen(state));
    const page = node.page; assert.equal(node.materializedPage, page); assert.equal(node.page, page);
    assert.equal(page.state, state); assert.equal(node.childrenState, state); assert.equal(page.owner, node);
    const pending = Object.freeze({ status: "pending", loadedCount: 0 }); page.state = pending;
    assert.equal(node.childrenState, pending); assert.equal(state.status, count ? "idle" : "success");
  }
});

test("A M7 page storage: 100000 visible leaves need no child containers on append, projection or disposal", () => {
  const data = new TreeData(); data.project(false);
  const items = Array.from({ length: 100000 }, (_, i) => info(`leaf-${i}`));
  data.append(data.root, items.slice(0, 50000), complete, "tail"); data.project(false);
  const previous = data.rows, first = previous[0];
  data.append(data.root, items.slice(50000), complete); data.project(false);
  const nodes = [...data.nodes.values()];
  assert.equal(data.rows.length, 100000); assert.equal(data.rows[0], first);
  assert.equal(nodes.filter((n) => n.materializedPage).length, 0);
  assert.equal(new Set(data.rows.map((r) => r.children)).size, 100000);
  assert.ok(data.rows.every((r, i) => r.instance === items[i] && r.children === nodes[i].childrenState));
  data.project(true); assert.equal(nodes.filter((n) => n.materializedPage).length, 0);
  for (let i = 0; i < 10; ++i) assert.equal(nodes[i].page.state, nodes[i].childrenState);
  assert.equal(nodes.filter((n) => n.materializedPage).length, 10);
  data.dispose(); assert.equal(data.nodes.size, 0); assert.equal(data.visible.size, 0);
  assert.equal(nodes.filter((n) => n.materializedPage).length, 10);
  assert.equal(previous[0], first); assert.equal(previous[0].children.status, "success");
});

test("A M7 page storage: materialized traversal visits requested descendants and leaves untouched branches alone", () => {
  const data = new TreeData(); data.append(data.root, [info("top", ["top"], 2)], complete);
  const top = data.nodes.get("top"); data.append(top.page, [info("a", ["top", "a"], 1), info("b", ["top", "b"], 1)], complete);
  const a = data.nodes.get("a"), b = data.nodes.get("b");
  data.append(a.page, [info("leaf", ["top", "a", "leaf"])], complete);
  const leaf = data.nodes.get("leaf"), old = a.page.state;
  assert.deepEqual([...data.subtree(data.root, true)].map((p) => p.owner?.info.ref ?? null), [null, "top", "a"]);
  assert.equal(b.materializedPage, undefined); assert.equal(leaf.materializedPage, undefined);
  data.clear(data.root); assert.equal(data.nodes.size, 0);
  assert.equal(b.materializedPage, undefined); assert.equal(leaf.materializedPage, undefined); assert.equal(a.page.state, old);
});

test("A M7 page storage: public cancel, collapse, root reload and dispose do not materialize loaded leaves", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(TreeNode.prototype, "page"); let allocations = 0;
  Object.defineProperty(TreeNode.prototype, "page", { ...descriptor, get() {
    if (!this.materializedPage) ++allocations;
    return descriptor.get.call(this);
  } });
  t.after(() => Object.defineProperty(TreeNode.prototype, "page", descriptor));
  const c = await model(t, { childCount: 100 }); await load(c);
  await first(c, "B-root", Array.from({ length: 100 }, (_, i) => child(`leaf-${i}`, ["g", `leaf-${i}`])));
  assert.equal(allocations, 1);
  await c.tree.cancel(null); await c.tree.setExpanded(scope(c.tree, ["g"]).id, false);
  await c.tree.setExpanded(row(c.tree, "B-root").id, false); assert.equal(allocations, 1);
  const pending = watch(c.tree.reload(null)), request = await c.wire.next("inst.roots");
  c.wire.ok(request, c.roots); await pending; assert.equal(allocations, 1);
  c.tree.dispose(); assert.equal(allocations, 1); assert.deepEqual(c.tree.rows, []);
});
