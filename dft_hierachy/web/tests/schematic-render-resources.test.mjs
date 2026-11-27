import assert from "node:assert/strict";
import test from "node:test";
import { withBrowser, cleanup } from "./schematic-render/browser.mjs";

await test("A M7 schematic geometry reuses immutable current result for ordinary, selection and annotation renders", async () => {
  await withBrowser(async (browser, url) => {
    for (const folded of [false, true]) {
      const p = await browser.newPage(), errors = [];
      p.on("pageerror", e => errors.push(e.message));
      try {
        await p.goto(url); await p.waitForFunction(() => window.geometry); await p.evaluate(folded => window.geometry.setup(24, 2, folded, false), folded);
        for (const method of ["rerender", "selectLast", "annotation"]) {
          await p.evaluate(method => window.geometry[method](), method);
          const measured = await p.evaluate(() => window.geometry.measure());
          assert.deepEqual(measured.iterations, { nodes: 0, edges: 0, ports: 0, sections: 0, points: 0 });
          assert.equal(measured.snapshot.layout.status, "success"); assert.deepEqual(measured.snapshot.failures, []);
        }
      } finally { assert.deepEqual(await p.evaluate(() => window.geometry.close()), cleanup); assert.deepEqual(errors, []); await p.close(); }
    }
  });
});
