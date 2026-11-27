// Independent requirements only; these cases mount only actual @hier/views.
import assert from "node:assert/strict";
import { rawKinds } from "./public-command-fault.mjs";
export const cases = [];
const settle = (page) => page.evaluate(() => window.B.settle());
async function run(page, input) {
  const initial = await page.evaluate(
    (input) => window.L02.setup(input),
    input,
  );
  await page.evaluate(() => window.L02.mount());
  await settle(page);
  const mounted = await page.evaluate(() => window.L02.state().viewWitness);
  if (input.transition) {
    assert.notEqual(
      mounted.rootId,
      null,
      "real pre-action React root required",
    );
    assert.notEqual(
      mounted.mountToken,
      null,
      "real pre-action mounted Frame required",
    );
    assert.equal(mounted.mounts, 1);
    assert.equal(mounted.cleanups, 0);
  }
  // Visible normative label, never product classes/data hooks or guessed control shape.
  const tree = page.getByRole("tree", { name: "B hierarchy", exact: true });
  assert.equal(await tree.count(), 1);
  const source = tree
    .getByRole("treeitem")
    .filter({ hasText: initial.sourceLabel });
  assert.equal(await source.count(), 1);
  await source.click();
  if (input.command === "loadRoots") {
    const pending = await page.evaluate(() => window.L02.state());
    assert.equal(pending.after.root, "pending");
    assert.equal(pending.callbacks.length, 0);
    assert.equal(pending.callCount, 1);
    if (input.transition) await page.evaluate(() => window.L02.transition());
    await page.evaluate(() => window.L02.release());
  }
  await settle(page);
  const s = await page.evaluate(() => window.L02.state());
  assert.equal(s.probes, 0, "zero reflection/getter/serialization of raw");
  assert.equal(s.callCount, 1);
  assert.equal(s.calls[0].injected, true);
  assert.equal(s.calls[0].delegateSucceeded, true);
  assert.equal(s.calls[0].inCall, false);
  assert.equal(s.calls[0].checkpoint, true);
  assert.equal(s.after.root, "success");
  if (input.command === "select") {
    assert.deepEqual(s.after.selection, {
      snapshotId: initial.before.selection.snapshotId,
      origin: "tree",
      items: [{ ref: "B-mixed-root" }],
    });
    assert.equal(s.after.back, true);
    assert.equal(s.after.forward, false);
    assert.deepEqual(s.after.queries, initial.before.queries);
  } else {
    assert.equal(
      s.calls[0].newPromise,
      true,
      "boundary Promise, not original ownership observation",
    );
    assert.equal(
      s.after.rows.some((r) => r.id === initial.sourceRowId),
      false,
      "source status removed after real commit",
    );
    assert.deepEqual(s.after.selection, initial.before.selection);
    assert.equal(s.after.back, initial.before.back);
    assert.equal(s.after.forward, initial.before.forward);
    assert.deepEqual(s.after.queries, ["inst.roots"]);
  }
  if (input.transition) {
    const w = s.transitionWitness;
    assert.ok(w, "actual transition witness required");
    assert.deepEqual(w.before, mounted);
    assert.equal(w.before.oldModel, true);
    assert.equal(w.sameRoot, input.transition === "replace");
    assert.equal(w.sameMount, input.transition === "replace");
    assert.equal(w.after.mounts, input.transition === "remount" ? 2 : 1);
    assert.equal(w.after.cleanups, input.transition === "replace" ? 0 : 1);
    assert.equal(
      w.after.oldModel,
      input.transition === "unmount" ? null : input.transition === "remount",
    );
    if (input.transition === "unmount") {
      assert.equal(w.after.rootId, null);
      assert.equal(w.after.mountToken, null);
    }
    assert.equal(s.callbacks.length, 0);
    assert.equal(s.boundary.length, 0);
    assert.equal(s.replacementCallbacks, 0);
    assert.equal(await page.getByText("操作失败", { exact: true }).count(), 0);
  } else if (input.mode === "absent") {
    assert.equal(s.callbacks.length, 0);
    assert.equal(s.boundary.length, 0);
    const error = page.getByText("操作失败", { exact: true });
    assert.equal(await error.count(), 1);
    assert.equal(await error.isVisible(), true);
  } else {
    assert.equal(s.callbacks.length, 1);
    assert.deepEqual(s.callbacks[0], {
      command: input.command,
      rowId: initial.sourceRowId,
      sameRaw: true,
      inEvent: false,
      inCall: false,
      checkpoint: true,
      notificationDepth: 0,
      delegateSucceeded: true,
    });
    if (input.mode === "throw") {
      assert.equal(s.boundary.length, 1);
      assert.deepEqual(s.boundary[0], {
        aggregate: true,
        count: 2,
        ownEntries: true,
        first: true,
        second: true,
      });
    } else assert.equal(s.boundary.length, 0);
  }
  assert.equal(s.unhandled, 0, "not proof of original L6 Promise consumption");
  assert.equal(s.unexpectedWindowErrors, 0);
  if (input.command === "select") {
    const history = await page.evaluate(() => window.L02.verifyHistory());
    assert.deepEqual(history.committed, s.after.selection);
    assert.deepEqual(history.back, initial.before.selection);
    assert.deepEqual(history.forward, s.after.selection);
    assert.equal(history.canGoForward, false);
  }
  return {
    sourceRowId: initial.sourceRowId,
    rawProbes: s.probes,
    callbacks: s.callbacks.length,
    realCommitted: true,
    historyPreserved: true,
    newBoundaryPromise: input.command === "loadRoots",
  };
}
for (const command of ["select", "loadRoots"])
  for (const kind of rawKinds)
    for (const mode of ["absent", "capture", "throw"]) {
      const input = { command, kind, mode };
      cases.push({
        id: `L02-${command}-${kind}-${mode}`,
        covers: [
          "L02",
          ...(mode === "absent" ? ["L03"] : ["L04"]),
          ...(mode === "throw" ? ["L05"] : []),
        ],
        input,
        expected:
          "one real delegated commit; direct raw identity; zero raw probes; correct source RowId and feedback timing; absent fixed visible text / capture once / throw undefined -> ordered two-entry AggregateError; exact descriptor finally restore",
        basis:
          "DESIGN 6.7.3; C approved B-UI-ADAPTER-01 (REVIEW_LOG 2026-10-15)",
        run: (page) => run(page, input),
      });
    }
for (const command of ["select", "loadRoots"])
  for (const transition of ["unmount", "replace", "remount"]) {
    const input = { command, kind: "proxy", mode: "throw", transition };
    cases.push({
      id: `L02-${command}-late-${transition}`,
      covers: ["L02"],
      input,
      expected:
        "real old-model commit preserved, no old/new callback, local error or boundary error after session invalidation; zero raw probes; cleanup restored (not original Promise ownership proof)",
      basis: "DESIGN 6.7.1/6.7.3; C approved B-UI-ADAPTER-01",
      run: (page) => run(page, input),
    });
  }
