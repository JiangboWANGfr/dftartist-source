// Agent B. Public L6 facts supporting the UI oracle questions, not UI tests.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const productRoot = path.resolve(
  process.env.HIER_B_PRODUCT_ROOT ?? path.join(import.meta.dirname, "../../.."),
);
const harnessPath = path.join(
  productRoot,
  "web/tests/independent-tree/harness.mjs",
);
const original = path.join(
  import.meta.dirname,
  "../independent-tree/harness.mjs",
);
const digest = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(
  digest(harnessPath),
  digest(original),
  "use the original B public Transport fixture",
);
const { model, vm, guard } = await import(pathToFileURL(harnessPath).href);

test(
  "BVP01: initial L6 roots are idle with a real status row, not no rows",
  guard,
  async (t) => {
    const c = await model(t);
    assert.deepEqual(c.tree.rootState, { status: "idle", loadedCount: 0 });
    assert.equal(c.tree.rows.length, 1);
    assert.equal(c.tree.rows[0].kind, "status");
    assert.equal(c.tree.rows[0].owner, null);
    assert.equal(c.tree.rows[0].state.status, "idle");
    assert.equal(c.wire.queries.length, 0);
  },
);

test(
  "BVP02: select observer failure is synchronous and leaves the committed selection",
  guard,
  async (t) => {
    const c = await model(t);
    const selection = new vm.SelectionModel({ snapshotId: c.tree.snapshotId });
    c.models.push(selection);
    const marker = { B: "select-observer" };
    selection.subscribe(() => {
      throw marker;
    });
    assert.throws(
      () =>
        selection.select({
          snapshotId: c.tree.snapshotId,
          origin: "tree",
          items: [{ ref: c.roots[0].ref }],
        }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [marker]);
        assert.equal(error.errors[0], marker);
        return true;
      },
    );
    assert.equal(selection.current.origin, "tree");
    assert.equal(selection.current.items[0].ref, c.roots[0].ref);
    assert.equal(selection.canGoBack, true);
    assert.equal(c.wire.queries.length, 0);
  },
);

test(
  "BVP03: successful select returns void, not a Promise",
  guard,
  async (t) => {
    const c = await model(t);
    const selection = new vm.SelectionModel({ snapshotId: c.tree.snapshotId });
    c.models.push(selection);
    const result = selection.select({
      snapshotId: c.tree.snapshotId,
      origin: "tree",
      items: [{ ref: c.roots[0].ref }],
    });
    assert.equal(result, undefined);
    assert.equal(c.wire.queries.length, 0);
  },
);

test(
  "BVP04: legacy unbound SelectionModel is legal L6 but has no snapshotId",
  guard,
  async (t) => {
    const c = await model(t);
    const selection = new vm.SelectionModel();
    c.models.push(selection);
    assert.equal(selection.snapshotId, undefined);
    assert.equal(typeof c.tree.snapshotId, "string");
    assert.equal(c.wire.queries.length, 0);
  },
);
