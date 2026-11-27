import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { model, load, first, row, scope, child, watch, local } from "../independent-tree/harness.mjs";

// A compatibility regressions; B's harness and frozen expectations are unchanged.
const { TreeData } = await import(process.env.HIER_A_TREE_DATA_MODULE
  ? pathToFileURL(process.env.HIER_A_TREE_DATA_MODULE)
  : new URL("../../packages/viewmodel/dist/tree-data.js", import.meta.url));
const complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
const info = (ref, path = [ref], childCount = 0) => Object.freeze({ ref, name: path.at(-1),
  path: Object.freeze(path), pathText: path.join("."), kind: "module", def: "d", defName: "pages",
  childCount, hasParamOverrides: false });
const instance = (data, ref) => data.rows.find((r) => r.kind === "instance" && r.instance.ref === ref);

test("A M7 pages: initial states stay distinct, frozen and identical on explicit page access", () => {
  const data = new TreeData();
  data.append(data.root, [info("a"), info("b"), info("branch", ["branch"], 1)], complete);
  data.project(true);
  const states = data.rows.map((r) => r.children), rows = data.rows;
  assert.deepEqual(states.map((s) => s.status), ["success", "success", "idle"]);
  assert.notEqual(states[0], states[1]);
  for (let i = 0; i < rows.length; ++i) {
    const node = data.nodes.get(rows[i].instance.ref), page = node.page;
    assert.equal(page, node.page); assert.equal(page.owner, node);
    assert.equal(page.state, states[i]); assert.ok(Object.isFrozen(states[i]));
    assert.deepEqual(page.items, []); assert.equal(page.cursors.size, 0);
  }
  data.project(true);
  assert.ok(data.rows.every((r, i) => r === rows[i]));
});

test("A M7 pages: leaf state updates replace only its row and preserve old values", () => {
  const data = new TreeData(); data.append(data.root, [info("a"), info("b")], complete); data.project(false);
  const old = data.rows, bytes = JSON.stringify(old), error = new Error("cancel"), diagnostic = Object.freeze({ code: "cancelled", origin: "tree", message: "cancel", data: Object.freeze({}) });
  data.setState(data.nodes.get("a").page, { status: "cancelled", error, diagnostic }); data.project(false);
  assert.notEqual(data.rows[0], old[0]); assert.equal(data.rows[1], old[1]);
  assert.equal(data.rows[0].id, old[0].id); assert.equal(data.rows[0].children.error, diagnostic);
  assert.equal(JSON.stringify(old), bytes); assert.equal(old[0].children.status, "success");
});

test("A M7 pages: append projection retains old leaf rows and complete page metadata", () => {
  const data = new TreeData(); data.append(data.root, [info("top", ["top"], 3)], complete);
  const top = data.nodes.get("top"); data.setExpanded(data.nodeId(top), true, false);
  data.append(top.page, [info("a", ["top", "a"])], complete, "next"); data.project(false);
  const a = instance(data, "a"), old = data.rows, bytes = JSON.stringify(old);
  data.append(top.page, [info("b", ["top", "b"]), info("c", ["top", "c"])], complete); data.project(false);
  assert.deepEqual(data.rows.map((r) => r.instance.ref), ["top", "a", "b", "c"]);
  assert.equal(instance(data, "a"), a); assert.equal(instance(data, "top").children.loadedCount, 3);
  assert.deepEqual(instance(data, "b").children.completeness, complete);
  assert.equal(JSON.stringify(old), bytes);
});

test("A M7 pages: default subtree still yields each page including untouched leaves", () => {
  const data = new TreeData(); data.append(data.root, [info("top", ["top"], 2)], complete);
  const top = data.nodes.get("top");
  data.append(top.page, [info("a", ["top", "a"]), info("b", ["top", "b"], 1)], complete);
  data.append(data.nodes.get("b").page, [info("x", ["top", "b", "x"])], complete);
  const pages = [...data.subtree(data.root)];
  assert.deepEqual(pages.map((p) => p.owner?.info.ref ?? null), [null, "top", "b", "x", "a"]);
  assert.equal(new Set(pages).size, 5);
});

test("A M7 pages: clear removes nested data, restores identities and keeps old snapshots", () => {
  const data = new TreeData(); data.append(data.root, [info("top", ["top"], 1)], complete);
  const top = data.nodes.get("top"); data.setExpanded(data.nodeId(top), true, false);
  data.append(top.page, [info("a", ["top", "g", "a"])], complete); data.project(true);
  const old = data.rows, bytes = JSON.stringify(old), id = instance(data, "a").id;
  data.clear(top.page); data.project(true); assert.equal(data.nodes.has("a"), false);
  data.append(top.page, [info("a", ["top", "g", "a"])], complete); data.project(true);
  assert.equal(instance(data, "a").id, id); assert.equal(JSON.stringify(old), bytes);
  data.dispose(); assert.equal(data.nodes.size, 0); assert.equal(data.visible.size, 0); assert.deepEqual(data.rows, []);
  assert.equal(JSON.stringify(old), bytes);
});

test("A M7 pages: scope projection preserves state references across visibility modes", () => {
  const data = new TreeData(); data.append(data.root, [info("top", ["top"], 2)], complete);
  const top = data.nodes.get("top"); data.setExpanded(data.nodeId(top), true, false);
  data.append(top.page, [info("a", ["top", "g", "a"]), info("b", ["top", "h", "b"])], complete); data.project(true);
  const a = instance(data, "a"), state = a.children, group = data.rows.find((r) => r.kind === "scope");
  data.setExpanded(group.id, false, true); data.project(true); assert.equal(instance(data, "a"), undefined);
  data.project(false); assert.equal(instance(data, "a").children, state); assert.equal(instance(data, "a").id, a.id);
  data.project(true); data.setExpanded(group.id, true, true); data.project(true);
  assert.equal(instance(data, "a").children, state); assert.equal(instance(data, "a").parentId, group.id);
});

test("A M7 pages: public leaf expand/cancel remain no-ops but reload still queries", async (t) => {
  const c = await model(t, { childCount: 0 }); await load(c);
  const initial = row(c.tree, "B-root"), count = c.wire.queries.length;
  await c.tree.setExpanded(initial.id, true); await c.tree.cancel(initial.id);
  assert.equal(row(c.tree, "B-root"), initial); assert.equal(c.wire.queries.length, count);
  const pending = watch(c.tree.reload(initial.id)), request = await c.wire.next("inst.children");
  assert.equal(request.params.inst, "B-root"); assert.equal(row(c.tree, "B-root").children.status, "pending");
  c.wire.ok(request, { items: [] }); await pending;
  assert.equal(row(c.tree, "B-root").expanded, false); assert.equal(row(c.tree, "B-root").children.status, "success");
  assert.equal(initial.children.status, "success");
});

test("A M7 pages: scope collapse cancels requested descendants and ignores late replies", async (t) => {
  const c = await model(t, { childCount: 3 }); await load(c);
  await first(c, "B-root", [child("a", ["g", "a"], 1), child("b", ["g", "b"]), child("c", ["h", "c"])]);
  const pending = watch(c.tree.setExpanded(row(c.tree, "a").id, true)), request = await c.wire.next("inst.children");
  const old = c.tree.rows, bytes = JSON.stringify(old), group = scope(c.tree, ["g"]);
  await c.tree.setExpanded(group.id, false); await assert.rejects(pending, local("cancelled"));
  assert.ok(c.wire.cancels.some((q) => q.params.target === request.id));
  c.wire.ok(request, { items: [child("late", ["g", "a", "late"])] });
  await c.tree.setExpanded(group.id, true);
  assert.equal(row(c.tree, "a").children.status, "cancelled"); assert.ok(!c.tree.rows.some((r) => r.instance?.ref === "late"));
  assert.equal(row(c.tree, "b").children.status, "success"); assert.equal(JSON.stringify(old), bytes);
});
