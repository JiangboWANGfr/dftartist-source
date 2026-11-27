import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
const web = path.resolve(import.meta.dirname, ".."), evidence = process.env.HIER_A_ANNOTATION_EVIDENCE ?? fs.mkdtempSync(path.join(os.tmpdir(), "hier-annotation-view-"));
const alias = Object.fromEntries(["viewmodel", "views", "client", "protocol-types"].map(n => [`@hier/${n}`, path.join(web, "packages", n, "dist/index.js")]));
if (process.env.HIER_A_VIEWS_ENTRY) alias["@hier/views"] = process.env.HIER_A_VIEWS_ENTRY;
const built = await build({ entryPoints: [path.join(web, "tests/annotation-render/fixture.jsx")], bundle: true, format: "esm", platform: "browser", target: "es2022", write: false, alias, nodePaths: [path.join(web, "node_modules")], define: { "process.env.NODE_ENV": JSON.stringify("development") } });
assert.deepEqual(built.warnings, []);
const worker = fs.readFileSync(path.join(web, "packages/viewmodel/dist/elk-worker.min.js"));
const server = createServer((q, s) => { s.setHeader("Content-Type", q.url.endsWith(".js") ? "application/javascript" : "text/html"); s.end(q.url === "/app.js" ? built.outputFiles[0].contents : q.url === "/worker.js" ? worker : '<div id="app"></div><script type="module" src="/app.js"></script>'); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true }), history = [];
try {
  for (const folded of [false, true]) await test(`A M7 annotation ${folded ? "folded" : "flat"} view: ordered marks, focus, native selection, updates, visible tree and cleanup`, async () => {
    const p = await browser.newPage(), errors = [];
    p.on("pageerror", e => errors.push(e.message));
    try {
      await p.goto(`http://127.0.0.1:${server.address().port}`); await p.waitForFunction(() => window.annotation);
      const initial = await p.evaluate(folded => window.annotation.setup(8, 3, folded), folded); history.push({ folded, phase: "initial", value: initial });
      const reverse = initial.graph.find(n => n.title?.startsWith("reverse b,a"));
      assert.ok(reverse.title.indexOf("A/mark/b") < reverse.title.indexOf("A/mark/a"));
      assert.ok(reverse.title.indexOf("layer 0") < reverse.title.indexOf("layer 1"));
      assert.ok(initial.tree.length < 64); assert.equal(initial.graph.find(n => n.title === "no target").title, "no target");
      await p.locator('[data-graph-key]').first().locator('.hier-schematic-view__node > rect').first().click({ position: { x: 8, y: 8 } }); const focused = await p.evaluate(() => window.annotation.snapshot());
      assert.ok(focused.selection.items.length); assert.ok(focused.details.includes("对象标注"));
      history.push({ folded, phase: "focused", value: focused });
      for (const method of ["change", "clear", "reorder", "disposeLayer", "rerender"]) {
        const next = await p.evaluate(method => window.annotation[method](), method); history.push({ folded, phase: method, value: next });
        assert.equal(next.focus, focused.focus); assert.deepEqual(next.selection, focused.selection);
        assert.deepEqual(next.layout, initial.layout); assert.deepEqual(next.calls, initial.calls);
      }
      await p.locator('[role="tree"]').evaluate(el => { el.scrollTop = 800; });
      await p.waitForFunction(() => [...document.querySelectorAll('[role="treeitem"]')].some(n => n.textContent.includes("root-33")));
      history.push({ folded, phase: "scroll", value: await p.evaluate(() => window.annotation.snapshot()) });
      history.push({ folded, phase: "withdraw", value: await p.evaluate(() => window.annotation.withdraw()) });
    } finally {
      assert.deepEqual(await p.evaluate(() => window.annotation.close()), { subscriptions: 0, workers: 0, nodes: 0, borrowedAlive: true, failures: 0 });
      assert.deepEqual(errors, []); await p.close();
      fs.writeFileSync(path.join(evidence, "annotation-view.json"), JSON.stringify({ history, cleanup: { subscriptions: 0, workers: 0, nodes: 0 }, errors }, null, 2) + "\n");
    }
  });
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
