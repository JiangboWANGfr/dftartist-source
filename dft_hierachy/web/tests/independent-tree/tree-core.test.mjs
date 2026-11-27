// B independently frozen real Tree -> SDK -> Node -> Core consumers, DESIGN6.6.
import assert from "node:assert/strict";
import { test } from "node:test";
import { guard, frozen, local } from "./harness.mjs";
import { real, full, paths, topRow, targetRow, resolve } from "./real-core.mjs";
test(
  "B Tree Core: two roots and a true leaf; first-page scope, frozen rows and prefix count",
  guard,
  async (t) => {
    const c = await real(t, true);
    assert.equal(c.model.rows[0].kind, "status");
    await c.model.loadRoots();
    assert.deepEqual(
      c.model.rows
        .filter((r) => r.kind === "instance")
        .map((r) => r.instance.name),
      ["b_tree_other", "b_tree_top"],
    );
    await c.model.setExpanded(topRow(c).id, true);
    assert.equal(topRow(c).children.loadedCount, 1);
    assert.deepEqual(
      c.model.rows.filter((r) => r.kind === "scope").map((r) => r.scopePath),
      [["g[0]"]],
    );
    const left = targetRow(c, ["b_tree_top", "g[0]", "left"]);
    assert.equal(left.expanded, false);
    assert.equal(left.children.status, "idle");
    await c.model.loadMore(topRow(c).id);
    const right = targetRow(c, ["b_tree_top", "g[0]", "right"]);
    assert.equal(right.expandable, false);
    assert.equal(right.children.status, "success");
    frozen(c.model.rows);
  },
);
test(
  "B Tree Core: full one-at-a-time pagination merges scopes and preserves escaped/array path segments",
  guard,
  async (t) => {
    const c = await real(t, true);
    await c.model.loadRoots();
    await c.model.setExpanded(topRow(c).id, true);
    const originalScope = c.model.rows.find((r) => r.kind === "scope").id;
    for (let n = 1; n < 10; n++) await c.model.loadMore(topRow(c).id);
    assert.equal(topRow(c).children.loadedCount, 10);
    assert.equal(Object.hasOwn(topRow(c).children, "next"), false);
    const direct = c.model.rows.filter(
      (r) =>
        r.kind === "instance" &&
        r.instance.path[0] === "b_tree_top" &&
        r.depth > 0,
    );
    assert.deepEqual(
      direct.map((r) => r.instance.path),
      paths.map((p) => ["b_tree_top", ...p]),
    );
    const groups = c.model.rows.filter((r) => r.kind === "scope");
    assert.deepEqual(
      groups.map((g) => g.scopePath),
      [["g[0]"], ["g[1]"], ["g[2]"]],
    );
    assert.equal(groups[0].id, originalScope);
    assert.equal(c.model.rows.filter((r) => r.kind === "status").length, 0);
  },
);
test(
  "B Tree Core: reveal deep later-page target and keep target collapsed",
  guard,
  async (t) => {
    const c = await real(t, true),
      ref = await resolve(c, "b_tree_top/g[2]/left/child");
    await c.model.reveal(ref);
    const target = targetRow(c, ["b_tree_top", "g[2]", "left", "child"]);
    assert.deepEqual(c.model.revealState, {
      status: "success",
      ref,
      rowId: target.id,
    });
    assert.equal(target.expanded, false);
    assert.equal(target.expandable, false);
    assert.equal(targetRow(c, ["b_tree_top", "g[2]", "left"]).expanded, true);
    assert.equal(
      c.model.rows.some(
        (r) => r.kind === "scope" && r.scopePath[0] === "g[2]" && r.expanded,
      ),
      true,
    );
  },
);
test(
  "B Tree Core: port reveal keeps port ref and locates its real instance, never parses ref encoding",
  guard,
  async (t) => {
    const c = await real(t, true),
      inst = await resolve(c, "b_tree_top/g[2]/left/child");
    const port = full(await c.client.ports(inst)).find((p) => p.name === "d");
    await c.model.reveal(port.ref);
    const target = targetRow(c, ["b_tree_top", "g[2]", "left", "child"]);
    assert.equal(c.model.revealState.ref, port.ref);
    assert.equal(c.model.revealState.rowId, target.id);
  },
);
test(
  "B Tree Core: grouping switch and fold/reopen retain loaded instance identities",
  guard,
  async (t) => {
    const c = await real(t, true);
    await c.model.loadRoots();
    await c.model.setExpanded(topRow(c).id, true);
    await c.model.loadMore(topRow(c).id);
    const ids = new Map(
      c.model.rows
        .filter((r) => r.kind === "instance")
        .map((r) => [r.instance.ref, r.id]),
    );
    const rootId = topRow(c).id,
      group = c.model.rows.find((r) => r.kind === "scope").id;
    await c.model.setExpanded(rootId, false);
    await c.model.setExpanded(rootId, true);
    await c.model.setShowGenerateScopes(false);
    assert.equal(
      c.model.rows.some((r) => r.kind === "scope"),
      false,
    );
    for (const r of c.model.rows.filter((r) => r.kind === "instance"))
      assert.equal(r.id, ids.get(r.instance.ref));
    await c.model.setShowGenerateScopes(true);
    assert.equal(c.model.rows.find((r) => r.kind === "scope").id, group);
    assert.equal(topRow(c).children.loadedCount, 2);
  },
);
test(
  "B Tree Core: disposing model releases only tree; actual SDK remains live until independently closed",
  guard,
  async (t) => {
    const c = await real(t, true);
    await c.model.loadRoots();
    const old = c.model.rows;
    c.model.dispose();
    c.model.dispose();
    assert.deepEqual(c.model.rows, []);
    frozen(old);
    assert.deepEqual(
      full(await c.client.roots()).map((r) => r.name),
      ["b_tree_other", "b_tree_top"],
    );
    await c.close(); // Actual public exited promise, no fake EOF/force-close callback.
  },
);
test(
  "B Tree Core: same-source reopen has new snapshot and model, old RowId is rejected without poisoning new",
  guard,
  async (t) => {
    const old = await real(t, true);
    await old.model.loadRoots();
    const id = topRow(old).id,
      oldRows = old.model.rows;
    await old.close();
    const fresh = await real(t, true);
    await fresh.model.loadRoots();
    assert.notEqual(fresh.snap.snapshotId, old.snap.snapshotId);
    assert.equal(fresh.snap.inputHash, old.snap.inputHash);
    let p;
    assert.doesNotThrow(() => {
      p = fresh.model.setExpanded(id, true);
    });
    await assert.rejects(p, local("invalid_row"));
    assert.equal(topRow(fresh).expanded, false);
    frozen(oldRows);
    assert.equal(old.model.disposed, true);
    await fresh.close();
  },
);
