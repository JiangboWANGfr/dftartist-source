import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const web = path.resolve(import.meta.dirname, "..");
const evidence = process.env.HIER_A_CANDIDATE_EVIDENCE ?? fs.mkdtempSync(path.join(os.tmpdir(), "hier-candidate-page-view-"));
const aliases = Object.fromEntries(["views", "viewmodel", "client", "protocol-types"].map(n => [`@hier/${n}`, path.join(web, "packages", n, "dist/index.js")]));
if (process.env.HIER_A_VIEWMODEL_DIR) aliases["@hier/viewmodel"] = path.join(process.env.HIER_A_VIEWMODEL_DIR, "index.js");
const built = await build({ entryPoints: [path.join(web, "tests/candidate-page/fixture.jsx")], bundle: true, format: "esm", platform: "browser", target: "es2022", write: false, alias: aliases, nodePaths: [path.join(web, "node_modules")], define: { "process.env.NODE_ENV": JSON.stringify("development") } });
assert.deepEqual(built.warnings, []);
const server = createServer((q, s) => { s.setHeader("Content-Type", q.url === "/app.js" ? "application/javascript" : "text/html"); s.end(q.url === "/app.js" ? built.outputFiles[0].contents : '<div id="app"></div><script type="module" src="/app.js"></script>'); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
  await test("A M7 candidate page view: batch binding, native confirmation, rerender, cancel/retry and same-Reply reload", async () => {
    const p = await browser.newPage(), errors = [], history = [];
    p.on("pageerror", e => errors.push(e.message));
    try {
      await p.goto(`http://127.0.0.1:${server.address().port}`); await p.waitForFunction(() => window.candidate);
      const initial = await p.evaluate(() => window.candidate.setup()); history.push(initial);
      assert.equal(initial.rows.length, 32); assert.ok(initial.rows.every(r => !r.disabled));
      const n = initial.actions.length;
      const rerender = await p.evaluate(() => window.candidate.render()); history.push(rerender);
      assert.equal(rerender.actions.length, n);
      await p.locator("li button").last().click();
      const selected = await p.evaluate(() => window.candidate.snapshot()); history.push(selected);
      assert.deepEqual(selected.selection.items, [{ def: "A/opaque\u0000/尾/31" }]);
      const cancelled = await p.evaluate(() => window.candidate.cancel()); history.push(cancelled);
      assert.ok(cancelled.rows.every(r => r.disabled));
      const appended = await p.evaluate(() => window.candidate.append()); history.push(appended);
      assert.equal(appended.rows.length, 36); assert.ok(appended.rows.every(r => !r.disabled));
      await p.locator("li button").first().click(); history.push(await p.evaluate(() => window.candidate.snapshot()));
      const reloaded = await p.evaluate(() => window.candidate.reloadSame()); history.push(reloaded);
      assert.equal(reloaded.rows.length, 4); assert.ok(reloaded.rows.every(r => !r.disabled));
      await p.locator("li button").nth(1).click(); const final = await p.evaluate(() => window.candidate.snapshot()); history.push(final);
      assert.deepEqual(final.selection.items, [{ def: "A/opaque\u0000/尾/1" }]); assert.deepEqual(final.failures, []);
    } finally {
      const cleanup = await p.evaluate(() => window.candidate.close());
      assert.deepEqual(cleanup, { readyListeners: 0, subscriptions: 0, borrowedAlive: true, nodes: 0 });
      assert.deepEqual(errors, []);
      fs.writeFileSync(path.join(evidence, "candidate-view.json"), JSON.stringify({ history, cleanup, errors }, null, 2) + "\n");
      await p.close();
    }
  });
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
