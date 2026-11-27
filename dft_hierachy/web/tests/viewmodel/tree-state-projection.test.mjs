import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

// A's private work/ownership checks supplement the unchanged public B oracle.
const { TreeData } = await import(
  process.env.HIER_A_TREE_DATA_MODULE
    ? pathToFileURL(process.env.HIER_A_TREE_DATA_MODULE)
    : new URL("../../packages/viewmodel/dist/tree-data.js", import.meta.url)
);
const complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
function info(ref, path, childCount = 0) {
  return Object.freeze({ ref, name: path.at(-1), path: Object.freeze(path),
    pathText: path.join("."), kind: "module", def: "definition", defName: "state",
    childCount, hasParamOverrides: false });
}
function fixture(count = 3, items = [info("a", ["top", "g", "a"]), info("b", ["top", "g", "b"])]) {
  const data = new TreeData();
  data.project(true);
  data.append(data.root, [info("top", ["top"], count)], complete);
  data.project(true);
  const top = data.nodes.get("top");
  data.setExpanded(data.nodeId(top), true, false);
  data.append(top.page, items, complete, items.length < count ? "tail" : undefined);
  data.project(true);
  return { data, top };
}
const instance = (data, ref) => data.rows.find((r) => r.kind === "instance" && r.instance.ref === ref);
const failure = (status) => ({ status, error: new Error(status),
  diagnostic: Object.freeze({ code: "cancelled", origin: "tree", message: status, data: Object.freeze({}) }) });
function observeIndex(data) {
  const work = { clears: 0, writes: 0 };
  data.visible.clear = () => { work.clears++; Map.prototype.clear.call(data.visible); };
  data.visible.set = (key, value) => { work.writes++; return Map.prototype.set.call(data.visible, key, value); };
  return work;
}
function indexed(data) {
  assert.equal(data.visible.size, data.rows.length);
  for (const row of data.rows) assert.equal(data.visible.get(row.id), row);
  assert.ok(Object.isFrozen(data.rows) && data.rows.every(Object.isFrozen));
}

test("A M7 state projection: pending/failure/cancel replace only the owner and status index entries", () => {
  const { data, top } = fixture();
  const retained = data.rows, text = JSON.stringify(retained), leaf = instance(data, "a");
  const oldStatus = retained.at(-1), work = observeIndex(data);
  for (const state of [{ status: "pending" }, failure("failed"), failure("cancelled")]) {
    data.setState(top.page, state);
    data.project(true);
    assert.equal(instance(data, "top").children, top.page.state);
    assert.equal(data.rows.at(-1).state, top.page.state);
    assert.equal(data.rows.at(-1).id, oldStatus.id);
    assert.equal(instance(data, "a"), leaf);
    assert.equal(data.rows.at(-1).state.next, "tail");
    assert.equal(data.rows.at(-1).state.loadedCount, 2);
    indexed(data);
  }
  assert.equal(work.clears, 0, "unchanged topology must not clear the visible index");
  assert.equal(work.writes, 6, "three transitions change two indexed rows each");
  assert.equal(JSON.stringify(retained), text);
});

test("A M7 state projection: concurrent page cancellations publish the whole batch", () => {
  const items = Array.from({ length: 12 }, (_, i) => info(`n${i}`, ["top", `n${i}`], 1));
  const { data } = fixture(12, items);
  for (const node of data.nodes.values()) data.setExpanded(data.nodeId(node), true, false);
  data.project(true);
  const before = data.rows, text = JSON.stringify(before), work = observeIndex(data);
  for (const node of data.nodes.values()) if (node.info.ref !== "top") data.setState(node.page, failure("cancelled"));
  data.project(true);
  for (const item of items) {
    const row = instance(data, item.ref);
    assert.equal(row.children.status, "cancelled");
    const status = data.rows.find((r) => r.kind === "status" && r.owner === row.id);
    assert.equal(status.state, row.children);
    assert.equal(status.depth, row.depth + 1);
  }
  assert.equal(work.clears, 0);
  assert.equal(work.writes, 24);
  assert.equal(JSON.stringify(before), text);
  indexed(data);
});

test("A M7 state projection: root status appearance and removal use the complete topology", () => {
  const { data } = fixture(0, []);
  const top = instance(data, "top"), work = observeIndex(data);
  data.setState(data.root, { status: "pending" });
  data.project(true);
  assert.equal(work.clears, 1);
  const status = data.rows.at(-1);
  assert.equal(status.kind, "status");
  assert.equal(status.owner, null);
  assert.equal(status.parentId, null);
  assert.equal(status.depth, 0);
  data.setState(data.root, failure("failed"));
  data.project(true);
  assert.equal(data.rows.at(-1).id, status.id);
  assert.equal(instance(data, "top"), top);
  data.append(data.root, [], complete);
  data.project(true);
  assert.deepEqual(data.rows.map((r) => r.id), [top.id]);
  indexed(data);
});

test("A M7 state projection: a folded owner updates its children state without showing its status", () => {
  const { data, top } = fixture();
  data.setExpanded(data.nodeId(top), false, false);
  data.project(true);
  const before = data.rows, work = observeIndex(data);
  data.setState(top.page, { status: "pending" });
  data.project(true);
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].children.status, "pending");
  assert.equal(data.rows[0].expanded, false);
  assert.equal(before[0].children.status, "success");
  assert.equal(work.clears, 0);
  assert.equal(work.writes, 1);
  data.setExpanded(data.nodeId(top), true, false);
  data.project(true);
  assert.equal(data.rows.at(-1).state.status, "pending");
  indexed(data);
});

test("A M7 state projection: hidden page and reveal-only publications retain new array snapshots", () => {
  const { data } = fixture(1, [info("a", ["top", "g", "a"], 1)]);
  const scope = data.rows.find((r) => r.kind === "scope");
  const a = data.nodes.get("a");
  data.setExpanded(scope.id, false, true);
  data.project(true);
  const before = data.rows, text = JSON.stringify(before), work = observeIndex(data);
  data.setState(a.page, failure("cancelled"));
  data.project(true);
  assert.notEqual(data.rows, before);
  assert.equal(JSON.stringify(data.rows), text);
  assert.equal(work.clears, 0);
  assert.equal(work.writes, 0);
  const hidden = data.rows;
  data.project(true); // TreeModel also publishes reveal-state-only changes.
  assert.notEqual(data.rows, hidden);
  assert.equal(JSON.stringify(data.rows), text);
  data.setExpanded(scope.id, true, true);
  data.project(true);
  assert.equal(instance(data, "a").children.status, "cancelled");
  indexed(data);
});

test("A M7 state projection: append, scope mode and expansion changes cannot take a stale state shortcut", () => {
  const { data, top } = fixture();
  const a = instance(data, "a"), scope = data.rows.find((r) => r.kind === "scope");
  data.setState(top.page, { status: "pending" });
  data.append(top.page, [info("c", ["top", "h", "c"])], complete);
  data.project(false);
  assert.deepEqual(data.rows.map((r) => r.instance.name), ["top", "a", "b", "c"]);
  assert.equal(instance(data, "a").depth, 1);
  assert.equal(instance(data, "a").id, a.id);
  data.project(true);
  assert.equal(instance(data, "a").parentId, scope.id);
  data.setExpanded(scope.id, false, true);
  data.project(true);
  assert.equal(instance(data, "a"), undefined);
  assert.equal(data.rows.at(-1).instance.ref, "c");
  indexed(data);
});

test("A M7 state projection: clear and reload revoke changed pages before rebuilding identities", () => {
  const { data, top } = fixture();
  const before = data.rows, text = JSON.stringify(before), topId = data.nodeId(top);
  const old = instance(data, "a");
  data.setState(top.page, { status: "pending" });
  data.clear(top.page);
  data.append(top.page, [info("a", ["top", "g", "a"], 1), info("x", ["top", "x"])], complete, "new-tail");
  data.project(true);
  assert.equal(data.nodeId(top), topId);
  assert.equal(instance(data, "a").id, old.id);
  assert.notEqual(instance(data, "a").instance, old.instance);
  assert.equal(instance(data, "a").expandable, true);
  assert.equal(data.nodes.has("b"), false);
  assert.equal(data.rows.at(-1).state.next, "new-tail");
  assert.equal(JSON.stringify(before), text);
  indexed(data);
});

test("A M7 state projection: dispose discards unpublished page changes and keeps old snapshots owned", () => {
  const { data, top } = fixture();
  const before = data.rows, text = JSON.stringify(before);
  data.setState(top.page, failure("failed"));
  data.dispose();
  assert.deepEqual(data.rows, []);
  assert.equal(data.visible.size, 0);
  assert.equal(data.nodes.size, 0);
  assert.equal(JSON.stringify(before), text);
  assert.ok(Object.isFrozen(data.rows));
});

test("A M7 state projection: a later topology mismatch cannot publish earlier page patches", () => {
  const { data } = fixture(2, [info("a", ["top", "a"], 1), info("b", ["top", "b"], 1)]);
  const a = data.nodes.get("a"), b = data.nodes.get("b");
  data.setExpanded(data.nodeId(a), true, false);
  data.setExpanded(data.nodeId(b), true, false);
  data.append(a.page, [info("leaf", ["top", "a", "leaf"])], complete);
  data.project(true);
  const before = data.rows, text = JSON.stringify(before), work = observeIndex(data);
  data.setState(b.page, { status: "pending" }); // Existing status can be patched.
  data.setState(a.page, { status: "pending" }); // A new status requires full projection.
  data.project(true);
  assert.equal(work.clears, 1);
  assert.equal(work.writes, data.rows.length, "no patch was committed before the fallback");
  for (const node of [a, b]) {
    const current = instance(data, node.info.ref);
    assert.equal(current.children.status, "pending");
    assert.equal(data.rows.find((r) => r.kind === "status" && r.owner === current.id).state, node.page.state);
  }
  assert.equal(JSON.stringify(before), text);
  indexed(data);
});
