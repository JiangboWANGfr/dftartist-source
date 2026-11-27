// Thin use of existing B esbuild + React + Playwright + finally cleanup pattern.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { uiCases } from "./cases.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT,
  T = process.env.HIER_B_BROWSER_TOOLS ?? P + "/web",
  controls = process.argv.includes("--controls");
assert(P && path.isAbsolute(P));
const r = {
  kind: controls ? "B87-real-model-Worker-input-control" : "B87-schematic-DOM",
  product: P,
  fixed: execFileSync("git", ["rev-parse", "HEAD"], { cwd: P, encoding: "utf8" }).trim(),
  planned: controls ? 1 : uiCases.length,
  executed: 0,
  passed: 0,
  failed: 0,
  blocked: controls ? 1 : uiCases.length,
  skipped: 0,
  results: [],
  cleanupErrors: [],
  stage: "setup",
  exitCode: 1,
};
let server, browser;
const pages = [];
async function bounded(p, label) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("B safety watchdog, not product SLA: " + label)),
          20000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
try {
  const req = createRequire(T + "/package.json"),
    { build } = req("esbuild"),
    { chromium } = req("playwright"),
    alias = Object.fromEntries(
      ["viewmodel", "views", "client", "protocol-types"].map((n) => [
        "@hier/" + n,
        P + "/web/packages/" + n + "/dist/index.js",
      ]),
    );
  for (const n of ["react", "react-dom"]) alias[n] = path.dirname(req.resolve(n + "/package.json"));
  const built = await build({
    entryPoints: [path.join(import.meta.dirname, "fixture.jsx")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    alias,
    nodePaths: [T + "/node_modules"],
    define: { "process.env.NODE_ENV": '"development"' },
  });
  assert.deepEqual(built.warnings, []);
  r.buildWarnings = [];
  let css = Buffer.alloc(0);
  try {
    const url = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'console.log(import.meta.resolve("@hier/views/schematic-view.css"))',
      ],
      { cwd: P + "/web", encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    r.css = fileURLToPath(url);
    css = fs.readFileSync(r.css);
    assert(css.length);
  } catch (e) {
    r.cssError = String(e.stderr ?? e);
  }
  const worker = fs.readFileSync(P + "/web/packages/viewmodel/dist/elk-worker.min.js");
  server = http.createServer((q, s) => {
    s.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'",
    );
    if (q.url === "/app.js") {
      s.setHeader("Content-Type", "text/javascript");
      s.end(built.outputFiles[0].contents);
    } else if (q.url === "/worker.js") {
      s.setHeader("Content-Type", "text/javascript");
      s.end(worker);
    } else if (q.url === "/crash.js") {
      s.setHeader("Content-Type", "text/javascript");
      s.end('throw new Error("B87 Worker crash")');
    } else if (q.url === "/stall.js") {
      s.setHeader("Content-Type", "text/javascript");
      s.end("onmessage=()=>{};");
    } else if (q.url === "/style.css") {
      s.setHeader("Content-Type", "text/css");
      s.end(css);
    } else {
      s.setHeader("Content-Type", "text/html");
      s.end(
        '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><input id="before"><div id="A"></div><div id="B"></div><input id="after"><script type="module" src="/app.js"></script>',
      );
    }
  });
  await new Promise((yes, no) => {
    server.once("error", no);
    server.listen(0, "127.0.0.1", yes);
  });
  browser = await chromium.launch({ headless: true });
  r.browser = browser.version();
  async function page() {
    const p = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    pages.push(p);
    p.setDefaultTimeout(12000);
    await p.goto("http://127.0.0.1:" + server.address().port);
    await p.waitForFunction(() => window.BS !== undefined);
    return p;
  }
  if (!controls) {
    r.stage = "public-capability";
    const p = await page();
    try {
      assert.equal(
        await p.evaluate(() => window.BS.capable),
        true,
        "production SchematicView/createGraphProjection/selectGraphElement absent",
      );
      assert(r.css, "public schematic-view.css missing");
    } finally {
      await p.close();
    }
  }
  r.stage = controls ? "input-control" : "semantic-DOM";
  for (const c of controls ? [{ id: "INPUT-real-models-native-ELK" }] : uiCases) {
    const p = await page(),
      errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    let error = null,
      clean = null;
    try {
      const result = controls
        ? await bounded(
            p.evaluate(() => window.BS.control()),
            c.id,
          )
        : await bounded(
            p.evaluate((id) => window.BS.run(id), c.id),
            c.id,
          );
      if (result?.keys)
        for (let i = 0; i < result.keys.length; i++) {
          await p.keyboard.press(result.keys[i]);
          assert.equal((await p.evaluate((i) => window.BS.verify(i), i)).pass, true);
        }
    } catch (e) {
      error = String(e.stack ?? e);
    } finally {
      try {
        clean = await bounded(
          p.evaluate(() => window.BS.cleanup()),
          "cleanup",
        );
        assert.deepEqual(clean.errors, []);
      } catch (e) {
        error ??= String(e.stack ?? e);
      }
      await p.close();
    }
    r.executed++;
    r.blocked--;
    if (error) r.failed++;
    else r.passed++;
    r.results.push({ id: c.id, pass: !error, error, pageErrors: errors, cleanup: clean });
  }
  r.exitCode = r.failed ? 1 : 0;
} catch (e) {
  r.setupError = String(e.stack ?? e);
} finally {
  for (const p of pages)
    if (!p.isClosed())
      try {
        await p.close();
      } catch (e) {
        r.cleanupErrors.push(String(e));
      }
  if (browser)
    try {
      await browser.close();
      r.browserDisconnected = !browser.isConnected();
    } catch (e) {
      r.cleanupErrors.push(String(e));
    }
  if (server)
    try {
      server.closeAllConnections();
      await new Promise((yes, no) => server.close((e) => (e ? no(e) : yes())));
      r.serverStopped = !server.listening;
    } catch (e) {
      r.cleanupErrors.push(String(e));
    }
  if (r.cleanupErrors.length) r.exitCode = 1;
}
console.log(JSON.stringify(r, null, 2));
process.exitCode = r.exitCode;
