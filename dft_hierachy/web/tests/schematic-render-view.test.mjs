import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { withBrowser, cleanup } from "./schematic-render/browser.mjs";

const history = [];
await withBrowser(async (browser, url) => {
  for (const folded of [false, true]) await test(`A M7 schematic geometry ${folded ? "folded" : "flat"}: native layout, dynamic UI, task and projection fences`, async () => {
    const p = await browser.newPage(), errors = [];
    p.on("pageerror", e => errors.push(e.message));
    const record = (phase, value) => { history.push({ folded, phase, value }); return value; };
    try {
      await p.goto(url); await p.waitForFunction(() => window.geometry);
      const initial = record("initial", await p.evaluate(folded => window.geometry.setup(8, 2, folded), folded));
      assert.equal(initial.layout.status, "success"); assert.ok(initial.geometry.length > 8); assert.equal(initial.readonly, "false");
      await p.locator('[data-graph-key]').first().locator('.hier-schematic-view__node > rect').first().click({ position: { x: 8, y: 8 } });
      const focused = record("click", await p.evaluate(() => window.geometry.snapshot()));
      assert.ok(focused.selection.items.length); assert.ok(focused.details.includes("对象标注")); assert.ok(focused.focus);
      await p.keyboard.press("ArrowRight");
      const moved = record("keyboard", await p.evaluate(() => window.geometry.snapshot()));
      assert.notEqual(moved.focus, focused.focus); assert.deepEqual(moved.selection, focused.selection);
      for (const method of ["selectLast", "annotation", "rerender"]) {
        const next = record(method, await p.evaluate(method => window.geometry[method](), method));
        assert.deepEqual(next.geometry, initial.geometry); assert.deepEqual(next.layout, initial.layout); assert.equal(next.focus, moved.focus);
        if (method === "annotation") assert.ok(next.html.includes("CHANGED"));
      }
      if (!folded) {
        const custom = record("custom", await p.evaluate(() => window.geometry.custom()));
        assert.ok(custom.layout.result.nodes.every(n => n.width === 237 && n.height === 91));
        assert.ok(custom.geometry.some(s => s.includes('width="237" height="91"')));
        assert.ok(custom.layout.result.nodes.some(n => n.ports.some(p => p.width === 7 && p.height === 9)));
      }
      const latest = await p.evaluate(() => window.geometry.snapshot());
      const tasks = record("cancel", await p.evaluate(() => window.geometry.pendingCancel()));
      for (const state of [tasks.pending, tasks.cancelled]) { assert.equal(state.readonly, "true"); assert.deepEqual(state.geometry, latest.geometry); assert.ok(state.graph.every(n => n.disabled === "true")); }
      assert.equal(tasks.pending.layout.status, "pending"); assert.equal(tasks.cancelled.layout.status, "cancelled");
      await p.locator('[data-graph-key]').first().press("Enter");
      assert.deepEqual((await p.evaluate(() => window.geometry.snapshot())).selection, latest.selection);
      const retry = record("retry", await p.evaluate(() => window.geometry.retry()));
      assert.equal(retry.readonly, "false"); assert.notEqual(retry.layout.result.taskId, latest.layout.result.taskId);
      assert.equal(retry.focus, "canvas");
      const down = record("relayout", await p.evaluate(() => window.geometry.relayout()));
      assert.equal(down.layout.result.direction, "DOWN"); assert.notDeepEqual(down.geometry, retry.geometry);
      if (folded) {
        const expanded = record("expand", await p.evaluate(() => window.geometry.expand()));
        assert.equal(expanded.hidden.graph.length, 0); assert.ok(expanded.success.graph.length > initial.graph.length);
        assert.equal(expanded.success.readonly, "false"); assert.equal(expanded.success.focus, "canvas");
      }
      const beforeWithdraw = await p.evaluate(() => window.geometry.snapshot());
      const gone = record("withdraw", await p.evaluate(() => window.geometry.withdraw()));
      assert.equal(gone.graph.length, 0); assert.deepEqual(gone.selection, beforeWithdraw.selection);
    } finally {
      const closed = await p.evaluate(() => window.geometry.close()); assert.deepEqual(closed, cleanup); assert.deepEqual(errors, []); await p.close();
      if (process.env.HIER_A_GEOMETRY_EVIDENCE) fs.writeFileSync(path.join(process.env.HIER_A_GEOMETRY_EVIDENCE, "geometry-view.json"), JSON.stringify({ history, closed, errors }, null, 2) + "\n");
    }
  });
});
