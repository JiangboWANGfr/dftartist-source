import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { model, load, first, more, row, scope, child } from "../independent-tree/harness.mjs";

// A supplemental compatibility regressions. Existing A/B oracles stay unchanged.
const { TreeData } = await import(process.env.HIER_A_TREE_DATA_MODULE
  ? pathToFileURL(process.env.HIER_A_TREE_DATA_MODULE)
  : new URL("../../packages/viewmodel/dist/tree-data.js", import.meta.url));
const complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
const info = (ref, path, childCount = 0) => Object.freeze({ ref, name: path.at(-1),
  path: Object.freeze(path), pathText: path.join("."), kind: "module", def: "d", defName: "metadata",
  childCount, hasParamOverrides: false });
const instance = (d, ref) => d.rows.find((r) => r.kind === "instance" && r.instance.ref === ref);
const group = (d, path) => d.rows.find((r) => r.kind === "scope" && JSON.stringify(r.scopePath) === JSON.stringify(path));
const labels = (d) => d.rows.map((r) => r.kind === "instance" ? r.instance.name : r.kind === "scope" ? r.label : r.state.status);
function start(count) {
  const data = new TreeData(); data.project(true);
  data.append(data.root, [info("top", ["top"], count)], complete); data.project(true);
  const top = data.nodes.get("top"); data.setExpanded(data.nodeId(top), true, false);
  return { data, top };
}
function checkFacts(data, page, items) {
  assert.deepEqual(page.items.map((n) => n.info), items);
  assert.equal(data.visible.size, data.rows.length);
  for (const r of data.rows) { assert.equal(data.visible.get(r.id), r); assert.ok(Object.isFrozen(r)); }
}

test("A M7 projection metadata: adversarial refs retain independent instance, status and scope identities", () => {
  const data = new TreeData(); data.project(true); const rootStatus = data.rows[0].id;
  const refs = ["r", "i:x", "p:x", "g:[\"x\",[]]", "root", "", "a\0b", "__proto__", "quote\"\\", "中文", "é", "e\u0301"];
  const items = refs.map((ref, i) => info(ref, [`n${i}`], 1)); data.append(data.root, items, complete); data.project(true);
  const identities = new Map(data.rows.map((r) => [r.instance.ref, r.id]));
  assert.equal(new Set(identities.values()).size, refs.length); assert.ok(![...identities.values()].includes(rootStatus));
  const scopeIds = [];
  for (const ref of refs) {
    const node = data.nodes.get(ref); scopeIds.push(data.scopeId(node, ["x"]));
    data.setExpanded(identities.get(ref), true, false);
  }
  data.project(true);
  const all = [rootStatus, ...identities.values(), ...scopeIds, ...data.rows.filter((r) => r.kind === "status").map((r) => r.id)];
  assert.equal(new Set(all).size, all.length);
  data.clear(data.root); data.append(data.root, [...items].reverse(), complete); data.project(true);
  for (const [ref, id] of identities) assert.equal(instance(data, ref).id, id);
});

test("A M7 projection metadata: literal scope tuples cannot collide through punctuation or owner refs", () => {
  const data = new TreeData(); data.append(data.root, [info("a", ["a"]), info("a\",[\"x", ["b"])], complete);
  const a = data.nodes.get("a"), b = data.nodes.get("a\",[\"x");
  const paths = [["a.b"], ["a", "b"], [""], ["\0"], ["__proto__"], ["é"], ["e\u0301"], ["\"", "\\"]];
  const ids = paths.flatMap((path) => [data.scopeId(a, path), data.scopeId(b, path)]);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(paths.flatMap((path) => [data.scopeId(a, [...path]), data.scopeId(b, [...path])]), ids);
});

test("A M7 projection metadata: late first scope copies exactly the committed direct prefix", () => {
  const { data, top } = start(6);
  const items = [info("a", ["top", "a"]), info("b", ["top", "b"]), info("x", ["top", "g", "x"]), info("c", ["top", "c"]), info("y", ["top", "g", "y"]), info("z", ["top", "h", "z"])];
  data.append(top.page, items.slice(0, 2), complete, "second"); data.project(true);
  const a = instance(data, "a"), old = data.rows, text = JSON.stringify(old);
  data.append(top.page, items.slice(2, 4), complete, "third"); data.project(true);
  assert.deepEqual(labels(data), ["top", "a", "b", "g", "x", "c", "success"]);
  const g = group(data, ["g"]), x = instance(data, "x");
  data.append(top.page, items.slice(4), complete); data.project(true);
  assert.deepEqual(labels(data), ["top", "a", "b", "g", "x", "y", "c", "h", "z"]);
  assert.equal(instance(data, "a"), a); assert.equal(instance(data, "x"), x); assert.equal(group(data, ["g"]), g);
  checkFacts(data, top.page, items); assert.equal(JSON.stringify(old), text);
});

test("A M7 projection metadata: scope at the first item and nested reuse never duplicate page members", () => {
  const { data, top } = start(4), items = [info("x", ["top", "g", "inner", "x"]), info("a", ["top", "a"]), info("y", ["top", "g", "inner", "y"]), info("b", ["top", "b"])];
  data.append(top.page, items.slice(0, 2), complete, "last"); data.project(true);
  data.append(top.page, items.slice(2), complete); data.project(true);
  assert.deepEqual(labels(data), ["top", "g", "inner", "x", "y", "a", "b"]);
  assert.equal(instance(data, "y").parentId, group(data, ["g", "inner"]).id);
  for (let i = 0; i < 3; ++i) { data.project(false); data.project(true); checkFacts(data, top.page, items); }
});

test("A M7 projection metadata: hidden flat appends catch up with a late scope and preserve direct row ids", () => {
  const { data, top } = start(4), items = [info("a", ["top", "a"]), info("b", ["top", "b"]), info("x", ["top", "g", "x"]), info("y", ["top", "g", "y"])];
  data.append(top.page, items.slice(0, 2), complete, "tail"); data.project(true); const a = instance(data, "a");
  data.project(false); data.append(top.page, items.slice(2), complete); data.project(false);
  const flat = data.rows, text = JSON.stringify(flat); assert.deepEqual(labels(data), ["top", "a", "b", "x", "y"]);
  data.project(true); assert.deepEqual(labels(data), ["top", "a", "b", "g", "x", "y"]);
  assert.equal(instance(data, "a").id, a.id); assert.equal(instance(data, "x").parentId, group(data, ["g"]).id);
  checkFacts(data, top.page, items); assert.equal(JSON.stringify(flat), text);
});

test("A M7 projection metadata: clearing a grouped page restores the direct representation before regrouping", () => {
  const { data, top } = start(2); data.append(top.page, [info("x", ["top", "g", "x"]), info("a", ["top", "a"])], complete); data.project(true);
  const previous = data.rows, text = JSON.stringify(previous), gId = group(data, ["g"]).id, aId = instance(data, "a").id;
  data.clear(top.page); data.project(true); assert.deepEqual(labels(data), ["top", "idle"]);
  data.append(top.page, [info("a", ["top", "a"])], complete, "tail"); data.project(true); assert.equal(instance(data, "a").id, aId);
  data.append(top.page, [info("x", ["top", "g", "x"])], complete); data.project(true);
  assert.deepEqual(labels(data), ["top", "a", "g", "x"]); assert.equal(group(data, ["g"]).id, gId);
  assert.equal(JSON.stringify(previous), text); data.dispose(); assert.deepEqual(data.rows, []);
});

test("A M7 projection metadata: closed scopes retain order and owner status across mixed appends", () => {
  const { data, top } = start(4), items = [info("a", ["top", "a"]), info("x", ["top", "g", "x"]), info("y", ["top", "g", "y"]), info("b", ["top", "b"])];
  data.append(top.page, items.slice(0, 2), complete, "tail"); data.project(true); const g = group(data, ["g"]);
  data.setExpanded(g.id, false, true); data.project(true);
  data.append(top.page, items.slice(2), complete); data.project(true); assert.deepEqual(labels(data), ["top", "a", "g", "b"]);
  data.setExpanded(g.id, true, true); data.project(true); assert.deepEqual(labels(data), ["top", "a", "g", "x", "y", "b"]); checkFacts(data, top.page, items);
});

test("A M7 projection metadata: a wide direct branch list remains immutable across complete projections", () => {
  const { data, top } = start(4000), items = Array.from({ length: 4000 }, (_, i) => info(`n${i}`, ["top", `n${i}`], 1));
  data.append(top.page, items, complete); data.project(true); const previous = data.rows, text = JSON.stringify(previous);
  assert.equal(data.rows.length, 4001); assert.ok(!data.rows.some((r) => r.kind === "scope"));
  for (let i = 0; i < 3; ++i) { data.project(false); data.project(true); checkFacts(data, top.page, items); }
  assert.equal(JSON.stringify(previous), text); assert.equal(top.page.items.length, 4000);
});

test("A M7 projection metadata: separate model row ids stay disjoint while reload ids stay stable", () => {
  const contexts = [start(1), start(1)];
  for (const { data, top } of contexts) { data.append(top.page, [info("x", ["top", "g", "x"])], complete); data.project(true); }
  const [a, b] = contexts.map((c) => c.data.rows.map((r) => r.id));
  assert.equal(new Set([...a, ...b]).size, a.length + b.length);
  const { data, top } = contexts[0]; data.clear(top.page); data.append(top.page, [info("x", ["top", "g", "x"])], complete); data.project(true);
  assert.deepEqual(data.rows.map((r) => r.id), a);
});

test("A M7 projection metadata: public SDK pagination changes modes without extra queries or fact duplicates", async (t) => {
  const c = await model(t, { childCount: 4, options: { pageSize: 2 } }); await load(c);
  await first(c, "B-root", [child("a"), child("b")], "last"); const a = row(c.tree, "a"), previous = c.tree.rows, text = JSON.stringify(previous);
  await c.tree.setShowGenerateScopes(false);
  await more(c, "B-root", [child("x", ["g", "x"]), child("y", ["g", "y"])], undefined, "last");
  await c.tree.setShowGenerateScopes(true);
  assert.equal(c.wire.queries.length, 3); assert.equal(row(c.tree, "a").id, a.id);
  assert.equal(row(c.tree, "x").parentId, scope(c.tree, ["g"]).id); assert.equal(row(c.tree, "B-root").children.loadedCount, 4);
  assert.equal(new Set(c.tree.rows.map((r) => r.id)).size, c.tree.rows.length); assert.equal(JSON.stringify(previous), text);
});
