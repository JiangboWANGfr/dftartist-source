import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { cases, resolved } from "./cases.mjs";
if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify(
      { kind: "B20 Q1Q2 inventory", count: cases.length, cases, resolved },
      null,
      2,
    ),
  );
} else {
  const P = process.env.HIER_B_PRODUCT_ROOT,
    T = process.env.HIER_B_BROWSER_TOOLS;
  assert.ok(P && T);
  const require = createRequire(path.join(T, "package.json")),
    { build } = require("esbuild"),
    { chromium } = require("playwright");
  for (const [n, v] of [
    ["react", "18.3.1"],
    ["react-dom", "18.3.1"],
    ["playwright", "1.64.1"],
    ["esbuild", "0.25.11"],
  ])
    assert.equal(require(n + "/package.json").version, v);
  const self = process.argv.includes("--self-check"),
    result = {
      kind: self ? "B20 facility-NOT-SourceView" : "B20 production Q1Q2",
      product: P,
      node: process.version,
      planned: cases.length,
      executed: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      results: [],
      stage: "browser-host",
      exitCode: 0,
    };
  let server, browser, page;
  try {
    const alias = Object.fromEntries(
      ["views", "client", "viewmodel", "protocol-types"].map((n) => [
        "@hier/" + n,
        path.join(P, "web/packages", n, "dist/index.js"),
      ]),
    );
    for (const n of ["react", "react-dom"])
      alias[n] = path.dirname(require.resolve(n + "/package.json"));
    const bundle = await build({
      entryPoints: [path.join(import.meta.dirname, "fixture.jsx")],
      bundle: true,
      outdir: path.join(import.meta.dirname, "B20-virtual"),
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      alias,
      nodePaths: [path.join(T, "node_modules")],
      define: { "process.env.NODE_ENV": '"development"' },
    });
    assert.deepEqual(bundle.warnings, []);
    result.buildWarnings = bundle.warnings;
    const pkg = JSON.parse(
        await fs.readFile(path.join(P, "web/packages/views/package.json")),
      ),
      exp = pkg.exports?.["./source-view.css"],
      target =
        typeof exp === "string"
          ? exp
          : (exp?.import ?? exp?.default ?? exp?.style);
    const css = target
      ? await fs.readFile(path.join(P, "web/packages/views", target))
      : null;
    server = http.createServer((req, res) => {
      if (req.url === "/app.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(
          bundle.outputFiles.find((f) => f.path.endsWith(".js")).contents,
        );
      } else if (req.url === "/style.css" && css) {
        res.setHeader("Content-Type", "text/css");
        res.end(css);
      } else if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><meta charset="utf-8"><title>B20 independent Q1Q2 host</title>' +
            (css ? '<link rel="stylesheet" href="/style.css">' : "") +
            '<style>#A,#B{width:420px}body{margin:0}</style><input id="outside" aria-label="B20 outside"><div id="A"></div><div id="B"></div><script type="module" src="/app.js"></script>',
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
    result.url = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ headless: true });
    result.browser = browser.version();
    async function open() {
      const p = await browser.newPage({
        viewport: { width: 900, height: 700 },
      });
      page = p;
      p.setDefaultTimeout(10000);
      await p.goto(result.url);
      await p.waitForFunction(() => window.B20 !== undefined);
      return p;
    }
    await open();
    result.productionCapable = await page.evaluate(() => window.B20.capable);
    if (self) {
      result.controls = await page.evaluate(() => window.B20.controls());
      assert.equal(result.controls.productMounted, false);
    } else {
      result.stage = "production-export-capability";
      assert.equal(
        result.productionCapable,
        true,
        "production SourceView absent; no Q1/Q2 product scenario executed",
      );
      result.stage = "public-style-capability";
      assert.ok(css, "public CSS absent");
      await page.close();
      page = undefined;
      result.stage = "product-semantics";
      const deadline = async (p, label) => {
        let timer;
        try {
          return await Promise.race([
            p,
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(Error("B facility watchdog " + label)),
                15000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };
      for (const c of cases) {
        const errors = [];
        let actual = null;
        try {
          await open();
          actual = await deadline(
            page.evaluate((id) => window.B20.runCase(id), c.id),
            c.id,
          );
          const invalid =
            c.kind === "className" &&
            !["omitted", "empty"].includes(c.input.value);
          if (!invalid)
            assert.equal(
              await page.getByRole("region").count(),
              c.kind === "multi" ? 2 : 1,
            );
        } catch (e) {
          errors.push(String(e.stack ?? e));
        } finally {
          if (page)
            try {
              const clean = await deadline(
                page.evaluate(() => window.B20.cleanup()),
                "cleanup",
              );
              assert.equal(clean.remainingRoots, 0);
              assert.equal(clean.unhandled, 0);
              assert.deepEqual(clean.errors, []);
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
          pass: errors.length === 0,
          errors,
          actual,
        });
      }
      if (result.failed) result.exitCode = 1;
    }
  } catch (e) {
    result.exitCode = 1;
    result.error = String(e.stack ?? e);
    result.capabilityFailures = [
      "production-export-capability",
      "public-style-capability",
    ].includes(result.stage)
      ? 1
      : 0;
    result.facilityFailure =
      result.capabilityFailures === 0 && result.executed === 0;
    result.blocked = self ? 0 : cases.length - result.executed;
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
