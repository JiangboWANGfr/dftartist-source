import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

// A's private performance/ownership regressions, supplemental to B's unchanged
// public TreeModel oracle. The override runs these same cases on the old module.
const { TreeData } = await import(
  process.env.HIER_A_TREE_DATA_MODULE
    ? pathToFileURL(process.env.HIER_A_TREE_DATA_MODULE)
    : new URL("../../packages/viewmodel/dist/tree-data.js", import.meta.url)
);
const complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
function info(ref, path, childCount = 0, defName = "projection") {
  return Object.freeze({
    ref, name: path.at(-1), path: Object.freeze(path), pathText: path.join("."),
    kind: "module", def: "definition", defName, childCount,
    hasParamOverrides: false,
  });
}
function start(count) {
  const data = new TreeData();
  data.project(true);
  data.append(data.root, [info("top", ["top"], count)], complete);
  data.project(true);
  const top = data.nodes.get("top");
  data.setExpanded(data.rows[0].id, true, false);
  return { data, top };
}
const instance = (data, ref) => data.rows.find(
  (row) => row.kind === "instance" && row.instance.ref === ref,
);
const group = (data, path) => data.rows.find(
  (row) => row.kind === "scope" && JSON.stringify(row.scopePath) === JSON.stringify(path),
);
const labels = (data) => data.rows.map((row) =>
  row.kind === "instance" ? row.instance.name : row.kind === "scope" ? row.label : row.state.status,
);

test("A M7 tree projection: unchanged frozen rows survive page-state publications", () => {
  const { data, top } = start(2);
  data.append(top.page, [info("a", ["top", "a"])], complete, "tail");
  data.project(true);
  const original = data.rows, a = instance(data, "a"), owner = instance(data, "top");
  const status = data.rows.at(-1), originalText = JSON.stringify(original);
  data.setState(top.page, { status: "pending" });
  data.project(true);
  assert.equal(instance(data, "a"), a);
  assert.notEqual(instance(data, "top"), owner);
  assert.equal(instance(data, "top").children.status, "pending");
  assert.notEqual(data.rows.at(-1), status);
  assert.equal(data.rows.at(-1).id, status.id);
  data.append(top.page, [info("b", ["top", "b"])], complete);
  data.project(true);
  assert.equal(instance(data, "a"), a);
  assert.deepEqual(labels(data), ["top", "a", "b"]);
  assert.equal(JSON.stringify(original), originalText);
  assert.ok(Object.isFrozen(original) && Object.isFrozen(a) && Object.isFrozen(a.instance.path));
  assert.equal(data.visible.size, data.rows.length);
  for (const row of data.rows) assert.equal(data.visible.get(row.id), row);
});

test("A M7 tree projection: committed path prefixes are grouped once across publications", () => {
  const { data, top } = start(40);
  let slices = 0;
  const item = (i) => {
    const path = new Proxy(["top", "g", "nested", `u${i}`], {
      get(target, key, receiver) {
        if (key === "slice") return (...args) => { slices++; return target.slice(...args); };
        return Reflect.get(target, key, receiver);
      },
    });
    return info(`u${i}`, path);
  };
  for (let page = 0; page < 4; page++) {
    data.setState(top.page, { status: "pending" });
    data.project(true);
    data.append(top.page, Array.from({ length: 10 }, (_, i) => item(page * 10 + i)), complete,
      page === 3 ? undefined : `page${page}`);
    data.project(true);
    for (let repeat = 0; repeat < 3; repeat++) data.project(true);
  }
  assert.equal(slices, 40, "state-only publications must not rescan committed scope paths");
  assert.equal(data.rows.length, 43);
  assert.equal(group(data, ["g", "nested"]).depth, 2);
  assert.equal(instance(data, "u39").parentId, group(data, ["g", "nested"]).id);
});

test("A M7 tree projection: cross-page scopes retain first appearance and literal segments", () => {
  const { data, top } = start(6);
  data.append(top.page, [
    info("a", ["top", "a.b", "inner", "a"]),
    info("b", ["top", "__proto__", "b"]),
    info("c", ["top", "c"]),
  ], complete, "tail");
  data.project(true);
  const first = group(data, ["a.b"]), inner = group(data, ["a.b", "inner"]);
  const old = JSON.stringify(data.rows);
  data.append(top.page, [
    info("d", ["top", "a.b", "inner", "d"]),
    info("e", ["top", "__proto__", "e"]),
    info("f", ["top", "中文\\x", "f"]),
  ], complete);
  data.project(true);
  assert.deepEqual(labels(data), ["top", "a.b", "inner", "a", "d", "__proto__", "b", "e", "c", "中文\\x", "f"]);
  assert.equal(group(data, ["a.b"]).id, first.id);
  assert.equal(group(data, ["a.b", "inner"]).id, inner.id);
  assert.equal(instance(data, "d").depth, 3);
  assert.equal(JSON.stringify(first.scopePath), '["a.b"]');
  assert.ok(Object.isFrozen(inner.scopePath));
  assert.ok(old.includes('"next":"tail"'));
});

test("A M7 tree projection: hidden-scope appends catch up and restore parents and depths", () => {
  const { data, top } = start(3);
  data.append(top.page, [info("a", ["top", "g", "a"])], complete, "tail");
  data.project(true);
  const scopeId = group(data, ["g"]).id, aId = instance(data, "a").id;
  data.project(false);
  const flat = instance(data, "a");
  assert.equal(flat.depth, 1);
  assert.equal(flat.parentId, instance(data, "top").id);
  data.append(top.page, [info("b", ["top", "g", "b"]), info("c", ["top", "h", "c"])], complete);
  data.project(false);
  assert.deepEqual(labels(data), ["top", "a", "b", "c"]);
  data.project(true);
  assert.deepEqual(labels(data), ["top", "g", "a", "b", "h", "c"]);
  assert.equal(group(data, ["g"]).id, scopeId);
  assert.equal(instance(data, "a").id, aId);
  assert.equal(instance(data, "a").depth, 2);
  assert.equal(instance(data, "a").parentId, scopeId);
  assert.equal(flat.depth, 1);
  data.setExpanded(scopeId, false, true);
  data.project(true);
  assert.deepEqual(labels(data), ["top", "g", "h", "c"]);
  assert.equal(data.visible.has(aId), false);
  data.project(false);
  assert.equal(instance(data, "a").id, aId);
  data.project(true);
  assert.equal(instance(data, "a"), undefined);
  data.setExpanded(scopeId, true, true);
  data.project(true);
  assert.equal(instance(data, "a").parentId, scopeId);
});

test("A M7 tree projection: reload drops old data while preserving semantic row identities", () => {
  const { data, top } = start(1);
  data.append(top.page, [info("a", ["top", "g", "a"])], complete);
  data.project(true);
  const oldRows = data.rows, oldText = JSON.stringify(oldRows);
  const ids = data.rows.map((row) => row.id);
  data.clear(data.root);
  data.project(true);
  assert.equal(data.nodes.size, 0);
  assert.equal(data.visible.size, 1);
  assert.equal(data.rows[0].state.status, "idle");
  data.append(data.root, [info("top", ["top"], 1, "new-top")], complete);
  const fresh = data.nodes.get("top");
  data.append(fresh.page, [info("a", ["top", "g", "a"], 1, "new-child")], complete);
  data.project(true);
  assert.deepEqual(data.rows.map((row) => row.id), ids);
  assert.equal(instance(data, "top").instance.defName, "new-top");
  assert.equal(instance(data, "a").instance.defName, "new-child");
  assert.equal(instance(data, "a").expandable, true);
  assert.equal(instance(data, "a").children.status, "idle");
  assert.equal(JSON.stringify(oldRows), oldText);
});

test("A M7 tree projection: rejected pages cannot poison the committed grouping", () => {
  const { data, top } = start(2);
  data.append(top.page, [info("a", ["top", "g", "a"])], complete, "tail");
  data.project(true);
  const before = JSON.stringify(data.rows), count = data.nodes.size;
  assert.throws(() => data.append(top.page, [info("a", ["top", "other", "a"])], complete), (e) => e.code === "inconsistent_reply");
  assert.throws(() => data.append(top.page, [info("b", ["top", "g", "b"])], complete, "tail"), (e) => e.code === "inconsistent_reply");
  data.project(true);
  assert.equal(data.nodes.size, count);
  assert.equal(JSON.stringify(data.rows), before);
  data.append(top.page, [info("b", ["top", "g", "b"])], complete);
  data.project(true);
  assert.deepEqual(labels(data), ["top", "g", "a", "b"]);
});

test("A M7 tree projection: failed/cancelled statuses and restored pages never reuse stale state", () => {
  const { data, top } = start(2);
  data.append(top.page, [info("a", ["top", "g", "a"])], complete, "tail");
  data.project(true);
  const first = data.rows.at(-1);
  for (const status of ["failed", "cancelled"]) {
    const error = new Error(status);
    const diagnostic = Object.freeze({ code: "cancelled", origin: "tree", message: status, data: Object.freeze({}) });
    data.setState(top.page, { status, error, diagnostic });
    data.project(true);
    assert.equal(data.rows.at(-1).state.error, diagnostic);
    assert.equal(instance(data, "top").children.error, diagnostic);
    assert.equal(data.rows.at(-1).id, first.id);
    assert.equal(data.rows.at(-1).state.loadedCount, 1);
    assert.equal(first.state.status, "success");
  }
  data.append(top.page, [info("b", ["top", "g", "b"])], complete);
  data.project(true);
  assert.deepEqual(labels(data), ["top", "g", "a", "b"]);
  assert.equal("error" in instance(data, "top").children, false);
});

test("A M7 tree projection: iterative deep projection and clear preserve retained snapshots", () => {
  const { data, top } = start(1);
  let parent = top, path = ["top"];
  for (let i = 0; i < 512; i++) {
    path = [...path, `n${i}`];
    data.append(parent.page, [info(`n${i}`, path, i === 511 ? 0 : 1)], complete);
    data.project(true);
    parent = data.nodes.get(`n${i}`);
    data.setExpanded(data.nodeId(parent), true, false);
  }
  data.project(true);
  const retained = data.rows, last = retained.at(-1);
  assert.equal(retained.length, 513);
  assert.equal(last.depth, 512);
  data.clear(top.page);
  data.project(true);
  assert.equal(data.nodes.size, 1);
  assert.equal(data.rows.length, 2);
  assert.equal(last.instance.ref, "n511");
  data.dispose();
  assert.equal(data.nodes.size, 0);
  assert.equal(data.visible.size, 0);
  assert.deepEqual(data.rows, []);
  assert.ok(Object.isFrozen(data.rows));
  assert.equal(retained.length, 513);
});
