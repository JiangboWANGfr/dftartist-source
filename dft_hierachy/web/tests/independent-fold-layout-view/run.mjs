// Same B esbuild/React/Playwright/native Worker finite runner pattern, not a new platform.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { uiCases, nativeCase } from "./cases.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT,
  T = process.env.HIER_B_BROWSER_TOOLS ?? P + "/web",
  controls = process.argv.includes("--controls"),
  native = process.argv.includes("--native");
assert(P && path.isAbsolute(P));
const cases = controls ? [{ id: "FC01" }] : native ? [nativeCase] : uiCases;
const r = {
  planned: cases.length,
  executed: 0,
  passed: 0,
  failed: 0,
  blocked: cases.length,
  skipped: 0,
  semanticExecuted: 0,
  kind: controls ? "input-control" : native ? "native-fold-roundtrip" : "folded-DOM",
  results: [],
  cleanupErrors: [],
  exitCode: 1,
};
let browser, server;
const pages = [];
const bounded = async (p, label) => {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, no) => {
        timer = setTimeout(() => no(Error("B safety watchdog, not product SLA: " + label)), 20000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
try {
  const tools = createRequire(T + "/package.json"),
    req = createRequire(P + "/web/package.json"),
    { build } = tools("esbuild"),
    { chromium } = tools("playwright");
  const alias = Object.fromEntries(
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
    nodePaths: [P + "/web/node_modules", T + "/node_modules"],
    define: { "process.env.NODE_ENV": '"development"' },
  });
  assert.deepEqual(built.warnings, []);
  r.buildWarnings = [];
  const cssFile = req.resolve("@hier/views/schematic-view.css"),
    css = fs.readFileSync(cssFile),
    worker = fs.readFileSync(P + "/web/packages/viewmodel/dist/elk-worker.min.js");
  const elkDir = path.dirname(req.resolve("elkjs/package.json")),
    original = fs.readFileSync(elkDir + "/lib/elk-worker.min.js");
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  assert.equal(hash(worker), hash(original));
  r.workerAsset = {
    bytes: worker.length,
    sha256: hash(worker),
    elk: JSON.parse(fs.readFileSync(elkDir + "/package.json")).version,
  };
  assert.equal(r.workerAsset.elk, "0.12.0");
  r.css = { file: cssFile, bytes: css.length, sha256: hash(css) };
  server = http.createServer((q, s) => {
    s.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'",
    );
    const routes = {
      "/app.js": ["text/javascript", built.outputFiles[0].contents],
      "/worker.js": ["text/javascript", worker],
      "/crash.js": ["text/javascript", 'throw new Error("B97 Worker failure")'],
      "/stall.js": ["text/javascript", "onmessage=()=>{}"],
      "/style.css": ["text/css", css],
    };
    if (routes[q.url]) {
      s.setHeader("Content-Type", routes[q.url][0]);
      s.end(routes[q.url][1]);
    } else {
      s.setHeader("Content-Type", "text/html");
      s.end(
        '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><input id="before"><div id="A"></div><input id="after"><script type="module" src="/app.js"></script>',
      );
    }
  });
  await new Promise((yes, no) => {
    server.once("error", no);
    server.listen(0, "127.0.0.1", yes);
  });
  browser = await chromium.launch({ headless: true });
  r.browser = browser.version();
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    pages.push(page);
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    let error = null,
      value,
      cleanup;
    try {
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page.waitForFunction(() => window.BF !== undefined, { timeout: 12000 });
      value = await bounded(
        page.evaluate(
          ({ id, controls, native }) =>
            controls ? window.BF.control() : native ? window.BF.native() : window.BF.run(id),
          { id: c.id, controls, native },
        ),
        c.id,
      );
      r.semanticExecuted++;
      if (!["FU09", "FU11"].includes(c.id))
        assert.deepEqual(pageErrors, [], "no unexpected page errors");
      else
        assert(
          pageErrors.every((e) =>
            c.id === "FU09" ? e.includes("AggregateError") : e.includes("TypeError"),
          ),
          "only specified error boundary paths",
        );
    } catch (e) {
      error = String(e.stack ?? e);
    } finally {
      try {
        cleanup = await bounded(
          page.evaluate(() => window.BF.cleanup()),
          "cleanup",
        );
        assert.deepEqual(cleanup.errors, []);
        assert.equal(cleanup.pendingViews, 0);
        assert.equal(cleanup.unhandled, 0);
      } catch (e) {
        r.cleanupErrors.push(String(e));
        error ??= String(e.stack ?? e);
      }
      await page.close();
    }
    r.executed++;
    r.blocked--;
    if (error) r.failed++;
    else r.passed++;
    r.results.push({
      ...c,
      pass: !error,
      error,
      value,
      pageErrors,
      cleanup,
      stage: error?.includes("missing production folded LayoutService.mode capability")
        ? "missing-folded-mode"
        : error
          ? "failure"
          : "semantic-complete",
    });
  }
  r.exitCode = r.failed ? 1 : 0;
} catch (e) {
  r.setupError = String(e.stack ?? e);
} finally {
  for (const page of pages)
    if (!page.isClosed())
      try {
        await page.close();
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
