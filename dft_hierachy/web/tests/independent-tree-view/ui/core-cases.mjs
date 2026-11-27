// Genuine UI -> SDK -> B-only HTTP bridge -> NDJSON Core. No Electron claims.
import assert from "node:assert/strict";
export const coreCases = [
  {
    id: "UI-CORE-navigation-reveal",
    covers: ["E02", "E01", "I15", "S02"],
    basis: "DESIGN 6.7.2/6.7.4 and original B b_tree_navigation.sv KAT",
    input:
      "B's own Core, hand-written SV, first page then off-page deep port reveal",
    expected:
      "real UI queries/selection, correct owner path, original port bits/side, released process",
    async run(page) {
      await page.evaluate(() => window.UI.coreSetup());
      await page.evaluate(() => window.UI.mount());
      await page.evaluate(() => window.UI.settle());
      const host = page.locator("#ui-view-1"),
        t = host.getByRole("tree");
      assert.equal(await t.count(), 1);
      const initial = await page.evaluate(() => window.UI.state());
      assert.equal(initial.rows.length, 1);
      assert.equal(initial.rows[0].kind, "status");
      const idle = t.getByRole("treeitem");
      assert.equal(await idle.count(), 1);
      assert.ok((await idle.innerText()).includes("加载层次"));
      await idle.click();
      await page.waitForFunction(() => window.UI.state().root === "success");
      await page.evaluate(() => window.UI.settle());
      const roots = await page.evaluate(() => window.UI.state());
      assert.deepEqual(
        roots.rows.map((x) => x.name),
        ["b_tree_other", "b_tree_top"],
      );
      const index = roots.rows.findIndex((x) => x.name === "b_tree_top"),
        all = t.getByRole("treeitem");
      assert.equal(await all.count(), roots.rows.length);
      await all.nth(index).click();
      const selected = await page.evaluate(() => window.UI.state());
      assert.deepEqual(selected.selection.items, [
        { ref: roots.rows[index].ref },
      ]);
      assert.equal(selected.selection.origin, "tree");
      const target = await page.evaluate(() => window.UI.coreTarget());
      await page.evaluate(
        (x) =>
          window.UI.external([
            { ref: x.port, bits: { lsb: 0, width: 1 }, side: "outside" },
          ]),
        target,
      );
      const before = await page.evaluate(() => window.UI.state());
      await page.evaluate(
        (ref) => window.UI.command("reveal", ref),
        target.port,
      );
      await page.evaluate(() => window.UI.settle());
      const s = await page.evaluate(() => window.UI.state());
      assert.equal(s.reveal.status, "success");
      assert.equal(s.reveal.ref, target.port);
      const owner = s.rows.find((r) => r.id === s.reveal.rowId);
      assert.equal(owner.ref, target.owner);
      assert.deepEqual(owner.path, ["b_tree_top", "g[2]", "left", "child"]);
      assert.deepEqual(s.selection, before.selection);
      assert.equal(s.back, before.back);
      assert.equal(s.forward, before.forward);
      const commands = s.calls.filter((x) => x.name === "loadRoots");
      assert.equal(commands.length, 1);
      assert.equal(s.closed, false);
    },
  },
  {
    id: "UI-CORE-reopen",
    covers: ["E02", "E03", "L14"],
    basis: "DESIGN 6.7.1/7; no persistence",
    input: "close first real session then open same SV again",
    expected: "different snapshot, clean UI; no old handles or callbacks",
    async run(page) {
      await page.evaluate(() => window.UI.coreSetup());
      await page.evaluate(() => window.UI.seed());
      await page.evaluate(() => window.UI.mount());
      await page.evaluate(() => window.UI.settle());
      const first = await page.evaluate(() => window.UI.state());
      await page.evaluate(() => window.UI.shutdown());
      assert.equal(
        (await page.evaluate(() => window.UI.state())).all[0].closed,
        true,
      );
      await page.evaluate(() => window.UI.coreSetup());
      await page.evaluate(() => window.UI.mount());
      await page.evaluate(() => window.UI.settle());
      const second = await page.evaluate(() => window.UI.state());
      assert.notEqual(second.snapshotId, first.snapshotId);
      assert.equal(second.root, "idle");
      assert.equal(second.allCallbacks, 0);
      assert.equal(second.all[0].messageListeners, 0);
      assert.equal(second.all[0].closeListeners, 0);
    },
  },
];
