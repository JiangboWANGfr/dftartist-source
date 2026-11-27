import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";

const web = path.resolve(import.meta.dirname, "../.."), alias = Object.fromEntries(["viewmodel", "views", "client", "protocol-types"].map(n => [`@hier/${n}`, path.join(web, "packages", n, "dist/index.js")]));
if (process.env.HIER_A_VIEWS_ENTRY) alias["@hier/views"] = process.env.HIER_A_VIEWS_ENTRY;
export async function withBrowser(run) {
  const built = await build({ entryPoints: [path.join(web, "tests/schematic-render/fixture.jsx")], bundle: true, format: "esm", platform: "browser", target: "es2022", write: false, alias, nodePaths: [path.join(web, "node_modules")], define: { "process.env.NODE_ENV": JSON.stringify("development") } });
  assert.deepEqual(built.warnings, []);
  const worker = fs.readFileSync(path.join(web, "packages/viewmodel/dist/elk-worker.min.js"));
  const server = createServer((q, s) => { s.setHeader("Content-Type", q.url.endsWith(".js") ? "application/javascript" : "text/html"); s.end(q.url === "/app.js" ? built.outputFiles[0].contents : q.url === "/worker.js" ? worker : '<div id="app"></div><script type="module" src="/app.js"></script>'); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try { return await run(browser, `http://127.0.0.1:${server.address().port}`); }
  finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
export const cleanup = { subscriptions: 0, workers: 0, nodes: 0, borrowedAlive: true, failures: 0 };
