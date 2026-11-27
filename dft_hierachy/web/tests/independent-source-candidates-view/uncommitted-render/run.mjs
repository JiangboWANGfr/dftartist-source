import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { cases } from "./cases.mjs";
async function bounded(p, label) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error("B44 fixture watchdog, NOT product timeout: " + label),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
if (process.argv.includes("--list"))
  console.log(JSON.stringify({ planned: cases.length, cases }, null, 2));
else {
  const controls = process.argv.includes("--controls"),
    r = {
      kind: controls
        ? "B44-original-model-and-native-facilities-NOT-candidate-UI"
        : "B44-independent-uncommitted-render-DOM",
      planned: controls ? 5 : 3,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: controls ? 5 : 3,
      skipped: 0,
      stage: "fixture-build",
      results: [],
      exitCode: 0,
    };
  let browser, server;
  const pageErrors = new WeakMap();
  try {
    const P = process.env.HIER_B_PRODUCT_ROOT,
      T = process.env.HIER_B_BROWSER_TOOLS;
    assert.ok(
      P && T && path.isAbsolute(P) && path.isAbsolute(T),
      "explicit absolute fixed product/tools",
    );
    r.product = P;
    r.fixed = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: P,
      encoding: "utf8",
    }).trim();
    const require = createRequire(T + "/package.json"),
      { build } = require("esbuild"),
      { chromium } = require("playwright");
    for (const [n, v] of [
      ["react", "18.3.1"],
      ["react-dom", "18.3.1"],
      ["esbuild", "0.25.11"],
      ["playwright", "1.64.1"],
    ])
      assert.equal(require(n + "/package.json").version, v);
    const alias = Object.fromEntries(
      ["views", "viewmodel", "client", "protocol-types"].map((n) => [
        "@hier/" + n,
        P + "/web/packages/" + n + "/dist/index.js",
      ]),
    );
    for (const n of ["react", "react-dom"])
      alias[n] = path.dirname(require.resolve(n + "/package.json"));
    const out = await build({
      entryPoints: [path.join(import.meta.dirname, "fixture.jsx")],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      metafile: true,
      alias,
      nodePaths: [T + "/node_modules"],
      define: { "process.env.NODE_ENV": '"development"' },
    });
    assert.deepEqual(out.warnings, []);
    r.inputs = Object.keys(out.metafile.inputs);
    r.bundleSha256 = createHash("sha256")
      .update(out.outputFiles[0].contents)
      .digest("hex");
    let css = Buffer.from("");
    try {
      const url = execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          'console.log(import.meta.resolve("@hier/views/source-candidates-view.css"))',
        ],
        {
          cwd: P + "/web",
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      ).trim();
      r.cssPublicUrl = url;
      css = fs.readFileSync(fileURLToPath(url));
    } catch (e) {
      r.cssMissing = String(e.code ?? e);
    }
    server = http.createServer((req, res) => {
      if (req.url === "/app.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(out.outputFiles[0].contents);
      } else if (req.url === "/style.css") {
        res.setHeader("Content-Type", "text/css");
        res.end(css);
      } else {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{margin:12px}#root{width:660px}</style><input aria-label="B44 external"><div id="root"></div><script type="module" src="/app.js"></script>',
        );
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    browser = await chromium.launch({ headless: true });
    r.browser = browser.version();
    const url = "http://127.0.0.1:" + server.address().port;
    async function pageFor() {
      const p = await browser.newPage({
        viewport: { width: 1000, height: 850 },
      });
      p.setDefaultTimeout(15000);
      const errors = [];
      pageErrors.set(p, errors);
      p.on("pageerror", (error) => errors.push({ message: error.message }));
      await p.goto(url);
      await p.waitForFunction(() => window.B44 !== undefined);
      return p;
    }
    if (controls) {
      r.stage = "real-model-and-ordinary-React-Suspense-premises";
      const page = await pageFor();
      try {
        r.results.push(
          ...(await bounded(
            page.evaluate(() => window.B44.controls()),
            "real model and ordinary Suspense controls",
          )),
        );
      } finally {
        try {
          r.cleanup = await bounded(
            page.evaluate(() => window.B44.cleanup()),
            "controls cleanup",
          );
        } finally {
          r.controlPageErrors = pageErrors.get(page);
          await page.close();
        }
      }
      assert.deepEqual(r.cleanup, {
        errors: [],
        globalErrors: [],
        unhandled: [],
      });
      r.executed = r.passed = r.results.length;
      r.blocked = r.planned - r.executed;
      assert.equal(r.executed, 5);
      assert.deepEqual(r.controlPageErrors, []);
    } else {
      r.stage = "public-component-capability";
      const gate = await pageFor();
      try {
        assert.equal(
          await gate.evaluate(() => window.B44.capable),
          true,
          "missing production @hier/views SourceCandidatesView; uncommitted-render DOM not executed",
        );
        assert.ok(
          !r.cssMissing,
          "missing production public source-candidates-view.css",
        );
      } finally {
        r.gatePageErrors = pageErrors.get(gate);
        await gate.close();
        assert.deepEqual(r.gatePageErrors, []);
      }
      r.stage = "uncommitted-render-DOM";
      for (const c of cases) {
        const page = await pageFor();
        let error, cleanup, detail;
        try {
          detail = await bounded(
            page.evaluate((id) => window.B44.runCase(id), c.id),
            c.id + " run",
          );
          assert.equal(detail.pass, true);
        } catch (e) {
          error = String(e.stack ?? e);
        } finally {
          try {
            cleanup = await bounded(
              page.evaluate(() => window.B44.cleanup()),
              c.id + " cleanup",
            );
            if (
              cleanup.errors.length ||
              cleanup.globalErrors.length ||
              cleanup.unhandled.length
            )
              error ??= JSON.stringify(cleanup);
          } catch (e) {
            error ??= String(e.stack ?? e);
          }
          await page.close();
          if (pageErrors.get(page).length)
            error ??= "unexpected browser pageerror";
        }
        r.executed++;
        r.blocked--;
        if (error) r.failed++;
        else r.passed++;
        r.results.push({
          id: c.id,
          pass: !error,
          error: error ?? null,
          detail: detail ?? null,
          cleanup,
          pageErrors: pageErrors.get(page),
        });
      }
      r.exitCode = r.failed ? 1 : 0;
    }
  } catch (e) {
    r.exitCode = 1;
    r.error = String(e.stack ?? e);
    if (controls) {
      r.executed = r.results.length;
      r.passed = r.results.filter((x) => x.pass).length;
      r.failed = r.executed - r.passed;
      r.blocked = r.planned - r.executed;
    }
  } finally {
    r.releaseErrors = [];
    if (browser)
      try {
        await bounded(browser.close(), "browser release");
      } catch (e) {
        r.releaseErrors.push(String(e));
      }
    if (server)
      try {
        await bounded(
          new Promise((resolve, reject) =>
            server.close((e) => (e ? reject(e) : resolve())),
          ),
          "server release",
        );
      } catch (e) {
        r.releaseErrors.push(String(e));
      }
    if (r.releaseErrors.length) r.exitCode = 1;
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.exitCode;
  }
}
