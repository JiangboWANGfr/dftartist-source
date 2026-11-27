import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
const { TreeData } = await import(process.env.HIER_A_TREE_DATA_MODULE
  ? pathToFileURL(process.env.HIER_A_TREE_DATA_MODULE)
  : new URL("../../packages/viewmodel/dist/tree-data.js", import.meta.url));
const complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
const info = (ref, path, childCount = 0) => Object.freeze({ ref, name: path.at(-1), path: Object.freeze(path),
  pathText: path.join("."), kind: "module", def: "d", defName: "append", childCount, hasParamOverrides: false });
const labels = (data) => data.rows.map((row) => row.kind === "instance" ? row.instance.name : row.kind === "scope" ? row.label : row.state.status);
const node = (data, ref) => data.nodes.get(ref);
const row = (data, ref) => data.rows.find((r) => r.kind === "instance" && r.instance.ref === ref);
const expand = (data, ref, value = true) => data.setExpanded(data.nodeId(node(data, ref)), value, false);
function check(data) {
  assert.ok(Object.isFrozen(data.rows) && data.rows.every(Object.isFrozen));
  assert.deepEqual([...data.visible.keys()], data.rows.map((r) => r.id));
  assert.deepEqual([...data.visible.values()], data.rows);
}
function setup(count, scoped = true) {
  const data = new TreeData(); data.project(scoped);
  data.append(data.root, [info("top", ["top"], 2)], complete); data.project(scoped); expand(data, "top");
  data.append(node(data, "top").page, [info("left", ["top", "left"], count), info("tail", ["top", "tail"])], complete);
  data.project(scoped); expand(data, "left"); data.project(scoped);
  return { data, page: node(data, "left").page };
}
function failed(data, page) {
  data.setState(page, { status: "failed", error: new Error("failure"),
    diagnostic: Object.freeze({ code: "cancelled", origin: "tree", message: "failure", data: Object.freeze({}) }) });
}

test("A M7 append projection: middle-page direct leaves preserve ordered index, prefix, tail and old snapshots", () => {
  const { data, page } = setup(3); const old = data.rows, text = JSON.stringify(old), tail = row(data, "tail"), top = row(data, "top");
  const statusId = old.find((r) => r.kind === "status").id;
  data.append(page, [info("a", ["top", "left", "a"]), info("b", ["top", "left", "b"])], complete, "last"); data.project(true);
  assert.deepEqual(labels(data), ["top", "left", "a", "b", "success", "tail"]);
  assert.equal(row(data, "top"), top); assert.equal(row(data, "tail"), tail); assert.equal(data.rows.at(-2).id, statusId);
  assert.deepEqual(data.rows.map((r) => r.depth), [0, 1, 2, 2, 2, 1]); check(data);
  const a = row(data, "a"), retained = data.rows, retainedText = JSON.stringify(retained);
  data.setState(page, { status: "pending" }); data.project(true); failed(data, page); data.project(true);
  data.append(page, [info("c", ["top", "left", "c"])], complete); data.project(true);
  assert.deepEqual(labels(data), ["top", "left", "a", "b", "c", "tail"]); assert.equal(row(data, "a"), a);
  assert.equal(JSON.stringify(old), text); assert.equal(JSON.stringify(retained), retainedText); check(data);
});

test("A M7 append projection: direct suffix after closed groups later merges an earlier scope correctly", () => {
  const { data, page } = setup(4);
  data.append(page, [info("a", ["top", "left", "g", "a"])], complete, "two"); data.project(true);
  const group = data.rows.find((r) => r.kind === "scope"); data.setExpanded(group.id, false, true); data.project(true);
  data.append(page, [info("b", ["top", "left", "b"])], complete, "three"); data.project(true);
  assert.deepEqual(labels(data), ["top", "left", "g", "b", "success", "tail"]);
  const b = row(data, "b"), old = data.rows, text = JSON.stringify(old);
  data.append(page, [info("c", ["top", "left", "g", "c"]), info("d", ["top", "left", "d"])], complete); data.project(true);
  assert.deepEqual(labels(data), ["top", "left", "g", "b", "d", "tail"]);
  data.setExpanded(group.id, true, true); data.project(true);
  assert.deepEqual(labels(data), ["top", "left", "g", "a", "c", "b", "d", "tail"]);
  assert.equal(row(data, "b"), b); assert.equal(data.rows[2].id, group.id); assert.equal(JSON.stringify(old), text); check(data);
});

test("A M7 append projection: flat-mode additions regroup by original path fragments on mode change", () => {
  const { data, page } = setup(3, false);
  data.append(page, [info("a", ["top", "left", "g.dot", "a"])], complete, "two"); data.project(false);
  data.append(page, [info("b", ["top", "left", "g.dot", "b"]), info("c", ["top", "left", "other", "c"])], complete); data.project(false);
  const ids = ["a", "b", "c"].map((ref) => row(data, ref).id); data.project(true);
  assert.deepEqual(labels(data), ["top", "left", "g.dot", "a", "b", "other", "c", "tail"]);
  assert.deepEqual(["a", "b", "c"].map((ref) => row(data, ref).id), ids); check(data);
});

test("A M7 append projection: same-page batches retain the first prefix and unrelated page changes remain atomic", () => {
  const { data, page } = setup(4);
  data.append(page, [info("a", ["top", "left", "a"])], complete, "two");
  data.append(page, [info("b", ["top", "left", "b"])], complete, "three"); data.project(true);
  assert.deepEqual(labels(data), ["top", "left", "a", "b", "success", "tail"]); check(data);
  data.append(page, [info("c", ["top", "left", "c"])], complete, "four");
  failed(data, data.root); data.project(true);
  assert.deepEqual(labels(data), ["top", "left", "a", "b", "c", "success", "tail", "failed"]);
  data.append(page, [info("d", ["top", "left", "d"])], complete);
  data.append(data.root, [info("second", ["second"])], complete); data.project(true);
  assert.deepEqual(labels(data), ["top", "left", "a", "b", "c", "d", "tail", "second"]); check(data);
});

test("A M7 append projection: hidden pages update owners, expansion revokes candidates, non-leaf intent survives reload", () => {
  const { data, page } = setup(1); expand(data, "left", false); data.project(true);
  const old = data.rows, text = JSON.stringify(old);
  data.append(page, [info("branch", ["top", "left", "branch"], 1)], complete); data.project(true);
  assert.deepEqual(labels(data), ["top", "left", "tail"]); assert.equal(row(data, "left").children.loadedCount, 1);
  expand(data, "left"); data.project(true); expand(data, "branch"); data.project(true);
  const id = row(data, "branch").id; assert.deepEqual(labels(data), ["top", "left", "branch", "idle", "tail"]);
  data.clear(page); data.project(true);
  data.append(page, [info("branch", ["top", "left", "branch"], 1)], complete); data.project(true);
  assert.equal(row(data, "branch").id, id); assert.equal(row(data, "branch").expanded, true);
  assert.deepEqual(labels(data), ["top", "left", "branch", "idle", "tail"]);
  assert.equal(JSON.stringify(old), text); check(data);
});

test("A M7 append projection: bad pages cannot alter a pending valid prefix, clear and dispose revoke unpublished appends", () => {
  const { data, page } = setup(3);
  data.append(page, [info("a", ["top", "left", "a"])], complete, "two");
  assert.throws(() => data.append(page, [info("a", ["top", "left", "a"])], complete, "three"), /more than once/);
  data.project(true); assert.deepEqual(labels(data), ["top", "left", "a", "success", "tail"]); check(data);
  const old = data.rows, text = JSON.stringify(old);
  data.append(page, [info("b", ["top", "left", "b"])], complete, "three"); data.clear(page);
  data.append(page, [info("x", ["top", "left", "x"]), info("y", ["top", "left", "y"]), info("z", ["top", "left", "z"])], complete);
  data.project(true); assert.deepEqual(labels(data), ["top", "left", "x", "y", "z", "tail"]);
  assert.equal(data.nodes.has("a"), false); assert.equal(data.nodes.has("b"), false); check(data);
  data.dispose(); assert.deepEqual(data.rows, []); assert.equal(data.nodes.size, 0); assert.equal(data.visible.size, 0);
  assert.equal(JSON.stringify(old), text);
});

test("A M7 append projection: roots and empty terminal prefixes preserve status identity and fresh arrays", () => {
  const data = new TreeData(); data.project(true); const initial = data.rows;
  data.append(data.root, [info("r", ["r"])], complete); data.project(true);
  assert.deepEqual(labels(data), ["r"]); check(data); assert.equal(initial[0].state.status, "idle");
  const id = row(data, "r").id, old = data.rows; data.append(data.root, [], complete); data.project(true);
  assert.notEqual(data.rows, old); assert.equal(row(data, "r").id, id); check(data);
  data.clear(data.root); data.project(true); data.append(data.root, [info("r", ["r"])], complete); data.project(true);
  assert.equal(row(data, "r").id, id); check(data);
});
