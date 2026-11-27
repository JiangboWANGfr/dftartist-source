import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
const { TreeData } = await import(process.env.HIER_A_TREE_DATA_MODULE
  ? pathToFileURL(process.env.HIER_A_TREE_DATA_MODULE)
  : new URL("../../packages/viewmodel/dist/tree-data.js", import.meta.url));
const complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
const info = (ref, path, childCount = 0) => Object.freeze({ ref, name: path.at(-1),
  path: Object.freeze(path), pathText: path.join("."), kind: "module", def: "d", defName: "walk",
  childCount, hasParamOverrides: false });
const label = (row) => row.kind === "instance" ? row.instance.name : row.kind === "scope" ? row.label : row.state.status;
const labels = (data) => data.rows.map(label);
const node = (data, ref) => data.nodes.get(ref);
const instance = (data, ref) => data.rows.find((r) => r.kind === "instance" && r.instance.ref === ref);
function expand(data, ref) { data.setExpanded(data.nodeId(node(data, ref)), true, false); }
function setState(data, page, status) {
  const error = new Error(status), diagnostic = Object.freeze({ code: "cancelled", origin: "tree", message: status, data: Object.freeze({}) });
  data.setState(page, status === "pending" ? { status } : { status, error, diagnostic });
}
function checkVisible(data) {
  assert.equal(data.visible.size, data.rows.length);
  for (const row of data.rows) assert.equal(data.visible.get(row.id), row);
  assert.ok(Object.isFrozen(data.rows) && data.rows.every(Object.isFrozen));
}

test("A M7 tree traversal: forest subtrees and page statuses remain in depth-first order", () => {
  const data = new TreeData(); data.project(true);
  data.append(data.root, [info("r1", ["r1"], 2), info("r2", ["r2"], 1)], complete);
  data.append(node(data, "r1").page, [info("a", ["r1", "a"], 1), info("b", ["r1", "b"])], complete);
  for (const ref of ["r1", "a", "r2"]) expand(data, ref);
  setState(data, node(data, "a").page, "pending"); setState(data, node(data, "r2").page, "failed");
  data.project(true);
  assert.deepEqual(labels(data), ["r1", "a", "pending", "b", "r2", "failed"]);
  assert.deepEqual(data.rows.map((r) => r.depth), [0, 1, 2, 1, 0, 1]);
  const previous = data.rows, text = JSON.stringify(previous), aStatus = previous[2];
  assert.equal(aStatus.owner, instance(data, "a").id);
  data.append(node(data, "a").page, [info("x", ["r1", "a", "x"])], complete); data.project(true);
  assert.deepEqual(labels(data), ["r1", "a", "x", "b", "r2", "failed"]);
  assert.equal(JSON.stringify(previous), text); checkVisible(data);
});

test("A M7 tree traversal: cross-page grouping inserts into earlier scopes before owner status", () => {
  const data = new TreeData(); data.append(data.root, [info("top", ["top"], 3)], complete); expand(data, "top");
  const top = node(data, "top");
  data.append(top.page, [info("a", ["top", "g", "a"], 1), info("b", ["top", "h", "b"])], complete, "tail");
  expand(data, "a"); data.append(node(data, "a").page, [info("x", ["top", "g", "a", "x"])], complete);
  data.project(true);
  assert.deepEqual(labels(data), ["top", "g", "a", "x", "h", "b", "success"]);
  const old = data.rows, text = JSON.stringify(old), group = old[1], x = instance(data, "x");
  assert.equal(old.at(-1).owner, instance(data, "top").id);
  data.append(top.page, [info("c", ["top", "g", "c"])], complete); data.project(true);
  assert.deepEqual(labels(data), ["top", "g", "a", "x", "c", "h", "b"]);
  assert.equal(data.rows[1], group); assert.equal(instance(data, "x"), x);
  assert.equal(JSON.stringify(old), text); checkVisible(data);
});

test("A M7 tree traversal: closed scopes skip their lists and flat mode restores actual parents", () => {
  const data = new TreeData(); data.append(data.root, [info("top", ["top"], 2)], complete); expand(data, "top");
  data.append(node(data, "top").page, [info("a", ["top", "g", "a"], 1), info("b", ["top", "g", "b"])], complete);
  data.append(node(data, "a").page, [info("x", ["top", "g", "a", "x"])], complete); expand(data, "a");
  data.project(true); const group = data.rows.find((r) => r.kind === "scope"), aId = instance(data, "a").id;
  data.setExpanded(group.id, false, true); data.project(true);
  assert.deepEqual(labels(data), ["top", "g"]); assert.equal(data.visible.has(aId), false);
  data.project(false); const flat = data.rows, text = JSON.stringify(flat);
  assert.deepEqual(labels(data), ["top", "a", "x", "b"]);
  assert.deepEqual(flat.map((r) => r.depth), [0, 1, 2, 1]);
  data.project(true); assert.deepEqual(labels(data), ["top", "g"]);
  data.setExpanded(group.id, true, true); data.project(true);
  assert.deepEqual(labels(data), ["top", "g", "a", "x", "b"]);
  assert.equal(instance(data, "a").id, aId); assert.equal(JSON.stringify(flat), text); checkVisible(data);
});

test("A M7 tree traversal: empty lists, leaf roots, reload and dispose finish without phantom status", () => {
  const data = new TreeData(); data.project(true); assert.deepEqual(labels(data), ["idle"]);
  data.append(data.root, [], complete); data.project(true); assert.deepEqual(data.rows, []); checkVisible(data);
  data.clear(data.root); data.project(true); assert.deepEqual(labels(data), ["idle"]);
  data.append(data.root, [info("leaf", ["leaf"])], complete); data.project(true);
  const previous = data.rows; assert.deepEqual(labels(data), ["leaf"]); assert.equal(previous[0].expanded, false);
  data.clear(data.root); data.project(true); assert.deepEqual(labels(data), ["idle"]);
  data.dispose(); assert.deepEqual(data.rows, []); assert.equal(data.visible.size, 0);
  assert.equal(previous[0].instance.name, "leaf"); assert.ok(Object.isFrozen(data.rows));
});

test("A M7 tree traversal: deep instance lists stay iterative through clear and retained snapshots", () => {
  const data = new TreeData(); data.append(data.root, [info("top", ["top"], 1)], complete);
  let parent = node(data, "top"), path = ["top"];
  for (let i = 0; i < 768; i++) {
    expand(data, parent.info.ref); path = [...path, `n${i}`];
    data.append(parent.page, [info(`n${i}`, path, i === 767 ? 0 : 1)], complete); parent = node(data, `n${i}`);
  }
  data.project(true); const previous = data.rows, text = JSON.stringify(previous);
  assert.equal(previous.length, 769); assert.equal(previous.at(-1).depth, 768);
  data.clear(node(data, "n383").page); data.project(true);
  assert.equal(data.rows.at(-1).kind, "status"); assert.equal(data.rows.at(-1).depth, 385);
  assert.equal(data.rows.at(-1).owner, instance(data, "n383").id);
  assert.equal(JSON.stringify(previous), text); checkVisible(data); data.dispose();
  assert.equal(previous.at(-1).instance.name, "n767");
});

test("A M7 tree traversal: mixed nested and pending siblings keep separate status owners", () => {
  const data = new TreeData(), count = 80;
  data.append(data.root, [info("top", ["top"], count)], complete); expand(data, "top");
  data.append(node(data, "top").page, Array.from({ length: count }, (_, i) => info(`b${i}`, ["top", `b${i}`], 2)), complete);
  const expected = ["top"];
  for (let i = 0; i < count; i++) {
    expand(data, `b${i}`); expected.push(`b${i}`);
    if (i % 4 === 0) { setState(data, node(data, `b${i}`).page, "pending"); expected.push("pending"); }
    else {
      data.append(node(data, `b${i}`).page, [info(`a${i}`, ["top", `b${i}`, `a${i}`], 1), info(`c${i}`, ["top", `b${i}`, `c${i}`])], complete);
      expand(data, `a${i}`); setState(data, node(data, `a${i}`).page, "cancelled");
      expected.push(`a${i}`, "cancelled", `c${i}`);
    }
  }
  data.project(true); assert.deepEqual(labels(data), expected);
  for (const row of data.rows.filter((r) => r.kind === "status")) {
    const owner = data.visible.get(row.owner); assert.equal(row.parentId, owner.id);
    assert.equal(row.depth, owner.depth + 1); assert.equal(row.state, owner.children);
  }
  checkVisible(data);
});
