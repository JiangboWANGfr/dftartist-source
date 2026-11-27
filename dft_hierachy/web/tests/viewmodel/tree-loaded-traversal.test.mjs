import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { model, load, first, child, root, row, object, watch, local } from "../independent-tree/harness.mjs";
const { TreeData, TreeNode } = await import(process.env.HIER_A_TREE_DATA_MODULE
  ? pathToFileURL(process.env.HIER_A_TREE_DATA_MODULE)
  : new URL("../../packages/viewmodel/dist/tree-data.js", import.meta.url));
const complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
const info = (ref, path, childCount = 0) => Object.freeze({ ref, name: path.at(-1),
  path: Object.freeze(path), pathText: path.join("."), kind: "module", def: "d", defName: "loaded",
  childCount, hasParamOverrides: false });
const pageRefs = (pages) => [...pages].map((p) => p.owner?.info.ref ?? null);
async function locate(c, target, ancestors) {
  const pending = watch(c.tree.reveal(target)), lookup = await c.wire.next("obj.get");
  c.wire.ok(lookup, object(target)); const chain = await c.wire.next("inst.ancestors"); c.wire.ok(chain, ancestors);
  return { pending };
}
function forest() {
  const d = new TreeData(); d.append(d.root, [info("a", ["a"], 2), info("b", ["b"], 1)], complete);
  d.append(d.nodes.get("a").page, [info("x", ["a", "x"]), info("y", ["a", "y"])], complete);
  d.append(d.nodes.get("b").page, [info("z", ["b", "z"])], complete); return d;
}

test("A M7 loaded walk: default page traversal retains reverse sibling DFS order", () => {
  const d = forest(); assert.deepEqual(pageRefs(d.subtree(d.root)), [null, "b", "z", "a", "y", "x"]);
  assert.deepEqual(pageRefs(d.subtree(d.nodes.get("a").page)), ["a", "y", "x"]);
  assert.equal(new Set(d.nodes.values()).size, 5);
});

test("A M7 loaded walk: default iterator preserves LTR eager page access before reverse yields", (t) => {
  const d = forest(), original = Object.getOwnPropertyDescriptor(TreeNode.prototype, "page"), accesses = [];
  Object.defineProperty(TreeNode.prototype, "page", { ...original, get() { accesses.push(this.info.ref); return original.get.call(this); } });
  t.after(() => Object.defineProperty(TreeNode.prototype, "page", original));
  const it = d.subtree(d.root); assert.equal(it.next().value, d.root); assert.deepEqual(accesses, []);
  assert.equal(it.next().value.owner.info.ref, "b"); assert.deepEqual(accesses, ["a", "b"]);
  assert.equal(it.next().value.owner.info.ref, "z"); assert.deepEqual(accesses, ["a", "b", "z"]);
  assert.deepEqual(pageRefs(it), ["a", "y", "x"]); assert.deepEqual(accesses, ["a", "b", "z", "x", "y"]);
});

test("A M7 loaded walk: materialized traversal includes explicitly used leaf pages only", () => {
  const d = forest(); void d.nodes.get("x").page;
  assert.deepEqual(pageRefs(d.subtree(d.root, true)), [null, "b", "a", "x"]);
  assert.equal(d.nodes.get("y").materializedPage, undefined); assert.equal(d.nodes.get("z").materializedPage, undefined);
});

test("A M7 loaded walk: suspended traversal ignores newly appended siblings and observes cleared child lists", () => {
  const d = forest(), it = d.subtree(d.root); it.next(); const b = it.next().value;
  d.clear(b); d.append(d.root, [info("c", ["c"])], complete);
  assert.deepEqual(pageRefs(it), ["a", "y", "x"]); assert.equal(d.nodes.get("c").materializedPage, undefined);
  assert.equal(d.nodes.has("z"), false); assert.equal(d.nodes.has("c"), true);
});

test("A M7 loaded walk: clear deletion order, page reset, identities and retained snapshots stay compatible", () => {
  const d = forest(); for (const ref of ["a", "b"]) d.setExpanded(d.nodeId(d.nodes.get(ref)), true, false);
  d.project(true); const previous = d.rows, text = JSON.stringify(previous), aId = previous[0].id, deleted = [];
  const remove = d.nodes.delete; d.nodes.delete = function (ref) { deleted.push(ref); return remove.call(this, ref); };
  d.clear(d.root); assert.deepEqual(deleted, ["b", "z", "a", "y", "x"]);
  assert.deepEqual(d.root.items, []); assert.equal(d.root.error, undefined); assert.equal(d.root.cursors.size, 0);
  assert.deepEqual(d.root.state, { status: "idle", loadedCount: 0 }); d.project(true); assert.equal(d.rows.length, 1);
  d.append(d.root, [info("a", ["a"], 2)], complete); d.project(true); assert.equal(d.rows[0].id, aId);
  assert.equal(JSON.stringify(previous), text); d.dispose(); assert.deepEqual(d.rows, []);
});

test("A M7 loaded walk: early iterator close does not materialize an unvisited child list", () => {
  const d = forest(), it = d.subtree(d.root); it.next(); assert.equal(it.next().value.owner.info.ref, "b");
  it.return(); assert.equal(d.nodes.get("z").materializedPage, undefined);
  assert.equal(d.nodes.get("x").materializedPage, undefined); assert.equal(d.nodes.get("y").materializedPage, undefined);
});

test("A M7 loaded locate: an already loaded prefix target does not request the remaining cursor", async (t) => {
  const c = await model(t, { childCount: 4, options: { pageSize: 2 } }); await load(c);
  await first(c, "B-root", [child("a"), child("target")], "tail"); const previous = c.tree.rows, text = JSON.stringify(previous), target = row(c.tree, "target");
  const { pending } = await locate(c, "target", c.roots); await pending;
  assert.equal(c.wire.queries.filter((q) => q.method === "inst.children").length, 1);
  assert.equal(c.tree.revealState.rowId, target.id); assert.equal(row(c.tree, "B-root").children.next, "tail");
  assert.equal(JSON.stringify(previous), text);
});

test("A M7 loaded locate: a target present under another owner cannot satisfy the requested page", async (t) => {
  const c = await model(t, { childCount: 2 }); await load(c);
  const left = child("left", ["left"], 1), right = child("right", ["right"], 1);
  await first(c, "B-root", [left, right]); await first(c, "right", [child("target", ["right", "target"])]);
  const old = c.tree.rows, text = JSON.stringify(old), { pending } = await locate(c, "target", [root(2), left]);
  const request = await c.wire.next("inst.children", (q) => q.params.inst === "left");
  c.wire.ok(request, { items: [child("actual", ["left", "actual"])] });
  await assert.rejects(pending, local("inconsistent_reply")); assert.equal(c.tree.revealState.status, "failed");
  assert.equal(c.wire.queries.filter((q) => q.method === "inst.children" && q.params.inst === "left").length, 1);
  assert.equal(row(c.tree, "target").parentId, row(c.tree, "right").id); assert.equal(JSON.stringify(old), text);
});

test("A M7 loaded locate: missing target keeps page cursor and request order until the final prefix", async (t) => {
  const c = await model(t, { childCount: 5, options: { pageSize: 2 } }); await load(c);
  const { pending } = await locate(c, "target", c.roots);
  for (const [cursor, items, next] of [["", [child("a"), child("b")], "p2"], ["p2", [child("c"), child("d")], "p4"], ["p4", [child("target")], undefined]]) {
    const request = await c.wire.next("inst.children"); assert.equal(request.params.cursor, cursor);
    c.wire.ok(request, { items, ...(next === undefined ? {} : { next }) });
  }
  await pending; assert.equal(c.tree.revealState.rowId, row(c.tree, "target").id);
  assert.equal(row(c.tree, "B-root").children.loadedCount, 5); assert.equal(c.wire.queries.filter((q) => q.method === "inst.children").length, 3);
});

test("A M7 loaded locate: root reload removes old nodes and a cancelled late page cannot revive them", async (t) => {
  const c = await model(t); await load(c); const initial = row(c.tree, "B-root").id;
  const firstLocate = await locate(c, "target", c.roots), oldPage = await c.wire.next("inst.children");
  const reloading = watch(c.tree.reload(null)), roots = await c.wire.next("inst.roots");
  await assert.rejects(firstLocate.pending, local("cancelled")); c.wire.ok(roots, c.roots); await reloading;
  c.wire.ok(oldPage, { items: [child("target")] }); assert.ok(!c.tree.rows.some((r) => r.instance?.ref === "target"));
  assert.equal(row(c.tree, "B-root").id, initial);
  const fresh = await locate(c, "target", c.roots), page = await c.wire.next("inst.children");
  assert.equal(page.params.cursor, ""); c.wire.ok(page, { items: [child("target")] }); await fresh.pending;
  assert.equal(c.tree.revealState.rowId, row(c.tree, "target").id);
});
