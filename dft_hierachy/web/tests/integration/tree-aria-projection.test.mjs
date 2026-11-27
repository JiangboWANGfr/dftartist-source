import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import { TreeModel } from "@hier/viewmodel";

// A presentation integration tests, supplemental to B's unchanged tree UI oracle.
// The override compares the same semantic assertions with the original function.
const module = await import(process.env.HIER_A_ARIA_MODULE
  ? pathToFileURL(process.env.HIER_A_ARIA_MODULE)
  : new URL("../../packages/views/dist/hierarchy-tree-projection.js", import.meta.url));
const project = module.projectTreeRows ?? module.project;
const complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
const page = (status = "success", next) => Object.freeze({ status, loadedCount: 0,
  completeness: complete, ...(next === undefined ? {} : { next }) });
const leafPage = page();
const instance = (id, parentId, children = leafPage, depth = 0) => Object.freeze({
  kind: "instance", id, parentId, depth, children, expanded: children !== leafPage,
  expandable: children !== leafPage,
  instance: Object.freeze({ ref: id, name: id, path: Object.freeze([id]), pathText: id,
    kind: "module", def: "d", defName: "leaf", childCount: children === leafPage ? 0 : 2,
    hasParamOverrides: false }),
});
const scope = (id, parentId, depth) => Object.freeze({ kind: "scope", id, parentId,
  depth, owner: "top", scopePath: Object.freeze([id]), label: id, expanded: true });
const status = (id, owner, state, depth = 0) => Object.freeze({ kind: "status", id,
  parentId: owner, depth, owner, state });
function entry(projection, id) {
  const location = projection.byId.get(id);
  if (!location) return undefined;
  // Old and current private layouts differ; observable fields do not.
  const aria = projection.metadata?.get(id) ?? location;
  return { row: location.row, index: location.index, position: aria.position, page: aria.page,
    setSize: aria.page.status !== "success" || aria.page.next !== undefined
      ? -1 : projection.counts.get(location.row.parentId) };
}
function expect(projection, rows, values) {
  assert.equal(projection.byId.size, rows.length);
  assert.deepEqual(rows.map((row) => {
    const e = entry(projection, row.id);
    assert.equal(e.row, row); assert.equal(e.index, rows.indexOf(row));
    return [row.id, e.position, e.setSize];
  }), values);
}

test("A M7 ARIA projection: empty and roots status retain unknown totals", () => {
  const idle = page("idle");
  const empty = project(Object.freeze([]), idle);
  assert.equal(empty.byId.size, 0); assert.equal(empty.counts.size, 0);
  const rows = Object.freeze([status("roots", null, idle)]), p = project(rows, idle);
  expect(p, rows, [["roots", 1, -1]]);
  assert.equal(entry(p, "roots").page, idle);
});

test("A M7 ARIA projection: root siblings use the roots page, never their own child state", () => {
  const root = page(), pendingChildren = page("pending");
  const rows = Object.freeze([instance("a", null, pendingChildren), instance("b", null)]);
  const p = project(rows, root);
  expect(p, rows, [["a", 1, 2], ["b", 2, 2]]);
  assert.equal(entry(p, "a").page, root); assert.equal(entry(p, "b").page, root);
  const nextRoot = page("success", "more-roots"), q = project(rows, nextRoot);
  expect(q, rows, [["a", 1, -1], ["b", 2, -1]]);
  assert.equal(entry(q, "a").page, nextRoot);
});

test("A M7 ARIA projection: nested scopes inherit their actual instance page and count status siblings", () => {
  const root = page(), topPage = page("pending", "tail"), childPage = page();
  const rows = Object.freeze([instance("top", null, topPage), scope("g", "top", 1),
    scope("g.inner", "g", 2), instance("a", "g.inner", leafPage, 3),
    instance("branch", "g", childPage, 2), instance("nested", "branch", leafPage, 3),
    instance("direct", "top", leafPage, 1), status("more", "top", topPage, 1)]);
  const p = project(rows, root);
  expect(p, rows, [["top", 1, 1], ["g", 1, -1], ["g.inner", 1, -1], ["a", 1, -1],
    ["branch", 2, -1], ["nested", 1, 1], ["direct", 2, -1], ["more", 3, -1]]);
  for (const id of ["g", "g.inner", "a", "branch", "direct", "more"])
    assert.equal(entry(p, id).page, topPage);
  assert.equal(entry(p, "nested").page, childPage);
});

test("A M7 ARIA projection: completion and state publications cannot mutate retained metadata", () => {
  const root = page(), pending = page("pending", "tail");
  const rows = Object.freeze([instance("top", null, pending), scope("g", "top", 1),
    instance("child", "g", leafPage, 2), status("more", "top", pending, 1)]);
  const previous = project(rows, root), prior = rows.map((r) => entry(previous, r.id));
  const success = page(), completed = Object.freeze([instance("top", null, success), rows[1], rows[2]]);
  const current = project(completed, root);
  expect(current, completed, [["top", 1, 1], ["g", 1, 1], ["child", 1, 1]]);
  assert.equal(entry(current, "child").page, success);
  assert.equal(entry(current, "more"), undefined);
  assert.deepEqual(rows.map((r) => entry(previous, r.id)), prior);
  assert.equal(entry(previous, "child").page, pending);
  assert.equal(entry(previous, "child").setSize, -1);
});

test("A M7 ARIA projection: reorder and flat/scope modes keep exact indices and literal identities", () => {
  const root = page(), children = page();
  const top = instance("top", null, children), group = scope("__proto__.中文\\g", "top", 1);
  const a = instance("a.b[0]", group.id, leafPage, 2), b = instance("b", group.id, leafPage, 2);
  const grouped = Object.freeze([top, group, a, b]), old = project(grouped, root);
  const flat = Object.freeze([top, instance("b", "top", leafPage, 1), instance("a.b[0]", "top", leafPage, 1)]);
  const p = project(flat, root);
  expect(p, flat, [["top", 1, 1], ["b", 1, 2], ["a.b[0]", 2, 2]]);
  assert.equal(entry(p, group.id), undefined);
  expect(old, grouped, [["top", 1, 1], [group.id, 1, 1], ["a.b[0]", 1, 2], ["b", 2, 2]]);
});

test("A M7 ARIA projection: deep loaded chain stays iterative and preserves parent pages", () => {
  const root = page(), pages = Array.from({ length: 4096 }, () => page());
  const rows = Object.freeze(pages.map((p, i) => instance(String(i), i === 0 ? null : String(i - 1), p, i)));
  const p = project(rows, root);
  assert.equal(p.byId.size, 4096);
  for (const i of [0, 1, 2048, 4095]) {
    const current = entry(p, String(i));
    assert.equal(current.index, i); assert.equal(current.position, 1); assert.equal(current.setSize, 1);
    assert.equal(current.page, i === 0 ? root : pages[i - 1]);
  }
});

test("A M7 ARIA projection: clearing or another tree cannot rewrite an earlier projection", () => {
  const root = page(), rows = Object.freeze([instance("old", null)]), prior = project(rows, root);
  const empty = project(Object.freeze([]), root), otherRows = Object.freeze([instance("other", null)]);
  const other = project(otherRows, page("pending"));
  assert.equal(empty.byId.size, 0); assert.equal(entry(empty, "old"), undefined);
  assert.equal(entry(other, "old"), undefined); assert.equal(entry(other, "other").setSize, -1);
  assert.equal(entry(prior, "old").row, rows[0]); assert.equal(entry(prior, "old").setSize, 1);
});

for (const showGenerateScopes of [false, true]) {
  test(`A M7 ARIA projection: actual SDK/Core pages, nested branches, cancellation and reload (scopes=${showGenerateScopes})`,
    { timeout: 20000 }, async (t) => {
      assert.ok(process.env.HIER_BIN, "HIER_BIN must name this checkout's actual Core");
      const directory = await mkdtemp(join(tmpdir(), "hier-a-aria-core-")), file = join(directory, "aria.sv");
      await writeFile(file, `module aria_leaf; endmodule
module aria_branch; aria_leaf a(); aria_leaf b(); endmodule
module aria_top; aria_branch direct();
  for (genvar i=0; i<2; i++) begin : g
    aria_branch branch();
  end
endmodule\n`);
      const transport = createProcessTransport({ command: resolve(process.env.HIER_BIN), args: ["serve", file, "--top", "aria_top"] });
      const client = new HierClient(transport, { cacheEntries: 0 }); let tree;
      t.after(async () => { tree?.dispose(); client.dispose();
        assert.deepEqual(await transport.exited, { code: 0, signal: null });
        await rm(directory, { recursive: true }); });
      await client.ready; tree = new TreeModel(client, { pageSize: 1, showGenerateScopes });
      await tree.loadRoots(); const top = tree.rows[0]; await tree.setExpanded(top.id, true);
      const direct = tree.rows.find((r) => r.kind === "instance" && r.instance.name === "direct");
      let p = project(tree.rows, tree.rootState);
      assert.equal(entry(p, direct.id).position, 1); assert.equal(entry(p, direct.id).setSize, -1);
      assert.equal(entry(p, direct.id).page, tree.rows[0].children);
      const pending = tree.loadMore(top.id); void pending.catch(() => {});
      p = project(tree.rows, tree.rootState); const retained = p, oldRows = tree.rows;
      assert.equal(entry(p, direct.id).page.status, "pending");
      await tree.cancel(top.id); await assert.rejects(pending, (error) => error.code === "cancelled");
      assert.equal(entry(project(tree.rows, tree.rootState), direct.id).page.status, "cancelled");
      assert.equal(entry(retained, direct.id).page.status, "pending");
      while (tree.rows[0].children.next) await tree.loadMore(top.id);
      p = project(tree.rows, tree.rootState);
      const branches = tree.rows.filter((r) => r.kind === "instance" && r.id !== top.id);
      assert.equal(branches.length, 3);
      for (const branch of branches) assert.equal(entry(p, branch.id).setSize, showGenerateScopes ? (branch.id === direct.id ? 3 : 1) : 3);
      await tree.setExpanded(direct.id, true);
      p = project(tree.rows, tree.rootState);
      const a = tree.rows.find((r) => r.kind === "instance" && r.instance.name === "a");
      assert.equal(entry(p, a.id).position, 1); assert.equal(entry(p, a.id).setSize, -1);
      const currentDirect = tree.rows.find((r) => r.id === direct.id);
      assert.equal(entry(p, a.id).page, currentDirect.children);
      await tree.loadMore(direct.id);
      p = project(tree.rows, tree.rootState);
      const b = tree.rows.find((r) => r.kind === "instance" && r.instance.name === "b");
      assert.equal(entry(p, a.id).setSize, 2); assert.equal(entry(p, b.id).position, 2);
      await tree.reload(null);
      p = project(tree.rows, tree.rootState);
      assert.equal(entry(p, a.id), undefined); assert.equal(entry(p, direct.id), undefined);
      assert.equal(entry(p, top.id).setSize, 1);
      assert.equal(entry(retained, direct.id).row, oldRows.find((r) => r.id === direct.id));
      tree.dispose(); assert.equal(project(tree.rows, tree.rootState).byId.size, 0);
      assert.equal((await client.roots()).result[0].ref, top.instance.ref);
    });
}
