import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
const { projectTreeRows: project } = await import(process.env.HIER_A_ARIA_MODULE
  ? pathToFileURL(process.env.HIER_A_ARIA_MODULE)
  : new URL("../../packages/views/dist/hierarchy-tree-projection.js", import.meta.url));
const page = (status = "success", next) => Object.freeze({ status, loadedCount: 0,
  completeness: Object.freeze({ status: "complete", reasons: Object.freeze([]) }),
  ...(next === undefined ? {} : { next }) });
const leaf = page();
const instance = (id, parentId, children = leaf) => Object.freeze({ kind: "instance", id, parentId, depth: 0,
  children, expanded: children !== leaf, expandable: children !== leaf,
  instance: Object.freeze({ ref: id, name: id, path: Object.freeze([id]), pathText: id, kind: "module",
    def: "d", defName: "lookup", childCount: children === leaf ? 0 : 1, hasParamOverrides: false }) });
const scope = (id, parentId) => Object.freeze({ kind: "scope", id, parentId, depth: 1,
  owner: "branch", scopePath: Object.freeze([id]), label: id, expanded: true });
const entry = (projection, id) => projection.byId.get(id);

test("A M7 presentation lookup: wide siblings preserve positions beyond 65535 and root/child page distinction", () => {
  const root = page("pending"), children = page(), top = instance("0", null, children);
  const rows = Object.freeze([top, ...Array.from({ length: 70000 }, (_, i) => instance(`n${i}`, top.id))]);
  const p = project(rows, root);
  assert.equal(p.byId.size, 70001); assert.equal(p.byId.has("0"), true); assert.equal(p.byId.has("missing"), false);
  assert.equal(entry(p, "missing"), undefined); assert.equal(entry(p, "0").page, root);
  for (const i of [0, 65534, 65535, 65536, 69999]) {
    const e = entry(p, `n${i}`); assert.equal(e.index, i + 1); assert.equal(e.position, i + 1);
    assert.equal(e.row, rows[i + 1]); assert.equal(e.page, children);
  }
  assert.equal(p.counts.get(top.id), 70000); assert.equal(p.counts.get(null), 1);
});

test("A M7 presentation lookup: late instance owner indices and nested scope inheritance do not truncate", () => {
  const root = page(), children = page("pending", "tail"), branch = instance("branch", null, children);
  const prefix = Array.from({ length: 65540 }, (_, i) => instance(`root${i}`, null));
  const rows = Object.freeze([...prefix, branch, scope("g.dot", branch.id), scope("inner", "g.dot"),
    instance("leaf", "inner"), Object.freeze({ kind: "status", id: "more", owner: branch.id, parentId: branch.id, depth: 1, state: children })]);
  const p = project(rows, root);
  assert.equal(entry(p, "branch").index, 65540); assert.equal(entry(p, "branch").page, root);
  for (const id of ["g.dot", "inner", "leaf", "more"]) assert.equal(entry(p, id).page, children);
  assert.equal(entry(p, "g.dot").position, 1); assert.equal(entry(p, "more").position, 2);
  assert.equal(p.counts.get(null), 65541); assert.equal(p.counts.get(branch.id), 2);
});

test("A M7 presentation lookup: retained projections and extracted values stay tied to their original rows and root", () => {
  const root = page("pending"), children = page("pending", "next");
  const rows = Object.freeze([instance("top", null, children), scope("g", "top"), instance("a", "g")]);
  const prior = project(rows, root), captured = entry(prior, "a"), top = entry(prior, "top");
  const nextChildren = page(), nextRows = Object.freeze([instance("top", null, nextChildren), rows[1], rows[2]]);
  const nextRoot = page(), current = project(nextRows, nextRoot);
  assert.equal(entry(current, "a").page, nextChildren); assert.equal(entry(current, "top").page, nextRoot);
  assert.equal(entry(prior, "a").page, children); assert.equal(entry(prior, "top").page, root);
  assert.equal(captured.row, rows[2]); assert.equal(captured.page, children); assert.equal(top.row, rows[0]);
  const empty = project(Object.freeze([]), page()); assert.equal(empty.byId.size, 0);
  assert.equal(empty.byId.has("a"), false); assert.equal(entry(empty, "a"), undefined);
  assert.equal(entry(prior, "a").position, 1); assert.equal(entry(prior, "a").index, 2);
});

test("A M7 presentation lookup: literal identifiers, forest roots and status rows remain independent", () => {
  const root = page(), firstPage = page("cancelled"), secondPage = page();
  const rows = Object.freeze([instance("__proto__", null, firstPage), scope("中文\\g.dot", "__proto__"),
    instance("a[0]", "中文\\g.dot"), instance("constructor", null, secondPage),
    instance("toString", "constructor"), Object.freeze({ kind: "status", id: "status", owner: "constructor", parentId: "constructor", depth: 1, state: secondPage })]);
  const p = project(rows, root);
  assert.equal(entry(p, "a[0]").page, firstPage); assert.equal(entry(p, "toString").page, secondPage);
  assert.equal(entry(p, "status").page, secondPage); assert.equal(entry(p, "constructor").page, root);
  assert.equal(entry(p, "constructor").position, 2); assert.equal(entry(p, "status").position, 2);
  assert.equal(p.counts.get("constructor"), 2); assert.equal(p.byId.size, 6);
});
