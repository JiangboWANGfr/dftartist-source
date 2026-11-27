import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { cases } from "./cases.mjs";
if (process.argv.includes("--list"))
  console.log(JSON.stringify({ cases, count: cases.length }, null, 2));
else {
  const P = process.env.HIER_B_PRODUCT_ROOT,
    T = process.env.HIER_B_BROWSER_TOOLS;
  assert.ok(P && T);
  const require = createRequire(path.join(T, "package.json")),
    { build } = require("esbuild"),
    { chromium } = require("playwright");
  for (const [n, v] of [
    ["react", "18.3.1"],
    ["react-dom", "18.3.1"],
    ["esbuild", "0.25.11"],
    ["playwright", "1.64.1"],
  ])
    assert.equal(require(n + "/package.json").version, v);
  let server, browser, page;
  const result = {
    kind: "B independent scaled-host SourceView",
    product: P,
    planned: 9,
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    results: [],
    exitCode: 0,
    stage: "fixture-build",
  };
  try {
    const alias = Object.fromEntries(
      ["views", "client", "viewmodel", "protocol-types"].map((n) => [
        "@hier/" + n,
        path.join(P, "web/packages", n, "dist/index.js"),
      ]),
    );
    for (const n of ["react", "react-dom"])
      alias[n] = path.dirname(require.resolve(n + "/package.json"));
    const built = await build({
      entryPoints: [path.join(import.meta.dirname, "fixture.jsx")],
      bundle: true,
      outdir: path.join(import.meta.dirname, "B-scale-virtual"),
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      alias,
      nodePaths: [T + "/node_modules"],
      define: { "process.env.NODE_ENV": '"development"' },
    });
    assert.deepEqual(built.warnings, []);
    const manifest = JSON.parse(
        await fs.readFile(P + "/web/packages/views/package.json"),
      ),
      target = manifest.exports?.["./source-view.css"];
    assert.equal(typeof target, "string");
    const css = await fs.readFile(path.join(P, "web/packages/views", target));
    server = http.createServer((req, res) => {
      if (req.url === "/app.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(built.outputFiles.find((f) => f.path.endsWith(".js")).contents);
      } else if (req.url === "/style.css") {
        res.setHeader("Content-Type", "text/css");
        res.end(css);
      } else if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{margin:0;height:2000px}#parent{margin-top:230px;margin-left:35px;position:relative;width:850px;height:500px;overflow:auto}#pad{height:60px}#reserved{height:600px;width:760px}#slot{width:450px;height:280px;transform-origin:top left}#tail{height:700px}</style><input id="outside" aria-label="B scale outside"><span id="selection">B independent selection</span><div id="parent"><div id="pad"></div><div id="reserved"><div id="slot"></div></div><div id="tail"></div></div><script type="module" src="/app.js"></script>',
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const url = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ headless: true });
    result.browser = browser.version();
    result.stage = "product-scale-semantics";
    for (const c of cases) {
      const errors = [];
      let actual;
      try {
        page = await browser.newPage({
          viewport: { width: 1100, height: 800 },
        });
        page.setDefaultTimeout(10000);
        await page.goto(url);
        await page.waitForFunction(() => window.BScale !== undefined);
        assert.equal(await page.evaluate(() => window.BScale.capable), true);
        actual = await page.evaluate((id) => window.BScale.run(id), c.id);
      } catch (e) {
        errors.push(String(e.stack ?? e));
      } finally {
        if (page)
          try {
            const r = await page.evaluate(() => window.BScale.cleanup());
            assert.equal(r.remainingRoots, 0);
            assert.deepEqual(r.errors, []);
          } catch (e) {
            errors.push("fixture cleanup " + String(e));
          }
        try {
          await page?.close();
        } catch (e) {
          errors.push("page close " + String(e));
        }
        page = undefined;
      }
      result.executed++;
      if (errors.length) result.failed++;
      else result.passed++;
      result.results.push({
        id: c.id,
        input: c.input,
        pass: errors.length === 0,
        actual,
        errors,
      });
    }
    if (result.failed) result.exitCode = 1;
  } catch (e) {
    result.exitCode = 1;
    result.error = String(e.stack ?? e);
    result.blocked = 9 - result.executed;
  } finally {
    const errors = [];
    for (const [name, close] of [
      ["page", () => page?.close()],
      ["browser", () => browser?.close()],
      [
        "server",
        () =>
          server
            ? new Promise((resolve, reject) =>
                server.close((e) => (e ? reject(e) : resolve())),
              )
            : undefined,
      ],
    ])
      try {
        await close();
      } catch (e) {
        errors.push({ name, error: String(e) });
      }
    result.cleanupErrors = errors;
    if (errors.length) result.exitCode = 1;
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}
