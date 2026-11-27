// B52: existing pointer-activation contract, not a device/performance framework.
// DESIGN 6.7.2/3. No implementation, private key callback, or C probe is used.
import assert from "node:assert/strict";
import { locateExpansionTarget } from "./observed-expansion.mjs";
export const cases = [];
for (const targetKind of ["instance", "expansion", "pending-status"])
  for (const input of ["right", "control-right", "control-primary"])
    cases.push({
      id: "B52-C102-" + targetKind + "-" + input,
      input: targetKind + " / native " + input,
      expected:
        input === "control-primary"
          ? "one explicit primary activation invokes only the target's original command"
          : "secondary-button input invokes no selection, expansion, paging or cancellation",
      basis: "DESIGN 6.7.2/3; C-102 concrete production regression",
      async run(page) {
        const pending = targetKind === "pending-status";
        await page.evaluate(
          (pending) => window.UI.setup(pending ? { hold: ["inst.roots"] } : {}),
          pending,
        );
        if (!pending) await page.evaluate(() => window.UI.seed());
        await page.evaluate(() => window.UI.mount());
        if (pending) await page.evaluate(() => window.UI.start("loadRoots"));
        await page.evaluate(() => window.UI.settle());
        const before = await page.evaluate(() => window.UI.state());
        assert.equal(before.root, pending ? "pending" : "success");
        const index = before.rows.findIndex((r) =>
          pending ? r.kind === "status" : r.ref === "B-mixed-root",
        );
        assert.ok(index >= 0, "original published source row");
        const rows = page.locator("#ui-view-1").getByRole("treeitem");
        assert.equal(await rows.count(), before.rows.length);
        const row = rows.nth(index);
        const target =
          targetKind === "expansion"
            ? locateExpansionTarget({ row, rowId: before.rows[index].id })
                .target
            : row;
        assert.equal(await target.count(), 1);
        await target.click({
          button: input === "control-primary" ? "left" : "right",
          modifiers: input.startsWith("control-") ? ["Control"] : [],
        });
        await page.evaluate(() => window.UI.settle());
        const after = await page.evaluate(() => window.UI.state());
        const calls = after.calls.slice(before.calls.length);
        const primary = input === "control-primary";
        assert.deepEqual(
          calls.map((c) => c.name),
          primary
            ? [
                pending
                  ? "cancel"
                  : targetKind === "expansion"
                    ? "setExpanded"
                    : "select",
              ]
            : [],
          input + " must not be promoted to a different button's activation",
        );
        assert.equal(after.callbacks.length, before.callbacks.length);
        assert.equal(after.unhandled, 0);
        assert.equal(after.unexpectedWindowErrors, 0);
        if (!primary) {
          assert.equal(after.root, before.root);
          assert.deepEqual(after.rows, before.rows);
          assert.deepEqual(after.selection, before.selection);
          assert.equal(after.back, before.back);
          assert.equal(after.forward, before.forward);
          assert.deepEqual(after.queries, before.queries);
        } else if (pending) {
          assert.deepEqual(calls[0].args, [null]);
          assert.equal(after.root, "cancelled");
          assert.deepEqual(after.selection, before.selection);
        } else if (targetKind === "expansion") {
          assert.deepEqual(calls[0].args, [before.rows[index].id, true]);
          assert.equal(
            after.rows.find((r) => r.id === before.rows[index].id).expanded,
            true,
          );
          assert.deepEqual(after.selection, before.selection);
        } else {
          assert.deepEqual(after.selection, {
            snapshotId: before.snapshotId,
            origin: "tree",
            items: [{ ref: before.rows[index].ref }],
          });
          assert.deepEqual(calls[0].args, [
            {
              snapshotId: before.snapshotId,
              origin: "tree",
              items: [{ ref: before.rows[index].ref }],
            },
          ]);
        }
      },
    });
