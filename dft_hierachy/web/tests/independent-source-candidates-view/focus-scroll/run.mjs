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
              Error("B41 fixture watchdog, NOT product timeout: " + label),
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
        ? "B41-original-model-and-native-facilities-NOT-candidate-UI"
        : "B41-independent-focus-scroll-DOM",
      planned: controls ? 5 : 6,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: controls ? 5 : 6,
      skipped: 0,
      stage: "fixture-build",
      results: [],
      exitCode: 0,
    };
  let browser, server;
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
    let css = Buffer.from(
      fs.readFileSync(P + "/web/packages/views/source-view.css"),
    );
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
      css = Buffer.concat([css, fs.readFileSync(fileURLToPath(url))]);
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
          '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{margin:0;width:1600px;height:2600px;padding-top:150px}#before{position:absolute;top:0;left:0}#outer{margin-left:60px;width:900px;height:540px;overflow:auto}#canvas{position:relative;width:1300px;height:1600px}#sourceHost{position:absolute;left:80px;top:30px;width:400px;height:90px;overflow:auto}#sourcePad{width:650px;height:400px}#source{width:450px}#candidate0,#candidate1{position:absolute;top:240px;width:300px}#candidate0{left:150px}#candidate1{left:500px}#plain{position:absolute;left:850px;top:20px;width:100px;height:90px;overflow:auto}</style><input id="before" aria-label="B41 external"><div id="outer"><div id="canvas"><div id="sourceHost"><div id="sourcePad"><div id="source"></div></div></div><div id="candidate0"></div><div id="candidate1"></div><div id="plain"></div></div></div><input id="after" aria-label="B41 after"><script type="module" src="/app.js"></script>',
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
      await p.goto(url);
      await p.waitForFunction(() => window.B41 !== undefined);
      return p;
    }
    async function runCase(page, id) {
      await page.evaluate((id) => window.B41.prepare(id), id);
      const stage = (name) =>
        page.evaluate((name) => window.B41.stage(name), name);
      const status = () => stage("status");
      async function entry(key = "Tab") {
        for (let i = 0; i < 100; i++) {
          await page.keyboard.press(key);
          const x = await status();
          if (x.focused >= 0) return x;
        }
        throw Error("list not reached by native Tab traversal");
      }
      if (id === "F01") {
        assert.equal((await entry()).focused, 0, "first entry first row");
        await page.keyboard.press("End");
        assert.equal((await status()).legacy, true);
        for (let i = 0; i < 100; i++) {
          await page.keyboard.press("Tab");
          if ((await status()).focused < 0) break;
          if (i === 99) throw Error("native Tab cannot leave list");
        }
        assert.equal(
          (await entry("Shift+Tab")).focused,
          39,
          "remembered logical row",
        );
      } else if (["F02", "F03", "F04"].includes(id)) {
        await stage(id + "-transition");
        if (id === "F03") await page.keyboard.press("ArrowDown");
        if (id === "F04")
          assert.equal((await entry()).focused, 0, "fresh model first entry");
      } else {
        if (id === "F06") {
          for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
          await stage("F06-remember");
        }
        for (let i = 0; i < 34; i++) {
          await page.keyboard.press("ArrowDown");
          assert.equal(
            (await status()).focused,
            i + 1,
            "one logical step per native key",
          );
        }
      }
      return stage("finish");
    }
    if (controls) {
      r.stage = "real-model-SourceView-geometry-premises";
      const page = await pageFor();
      try {
        r.results.push(
          ...(await bounded(
            page.evaluate(() => window.B41.controls()),
            "model and actual SourceView controls",
          )),
        );
      } finally {
        try {
          r.cleanup = await bounded(
            page.evaluate(() => window.B41.cleanup()),
            "controls cleanup",
          );
        } finally {
          await page.close();
        }
      }
      assert.deepEqual(r.cleanup, { errors: [], unhandled: [] });
      r.executed = r.passed = r.results.length;
      r.blocked = r.planned - r.executed;
      assert.equal(r.executed, 5);
    } else {
      r.stage = "public-component-capability";
      const gate = await pageFor();
      try {
        assert.equal(
          await gate.evaluate(() => window.B41.capable),
          true,
          "missing production @hier/views SourceCandidatesView; focus-scroll DOM not executed",
        );
        assert.ok(
          !r.cssMissing,
          "missing production public source-candidates-view.css",
        );
      } finally {
        await gate.close();
      }
      r.stage = "focus-scroll-DOM";
      for (const c of cases) {
        const page = await pageFor();
        let error, cleanup, detail;
        try {
          detail = await bounded(runCase(page, c.id), c.id + " native DOM run");
          assert.equal(detail.pass, true);
        } catch (e) {
          error = String(e.stack ?? e);
        } finally {
          try {
            cleanup = await bounded(
              page.evaluate(() => window.B41.cleanup()),
              c.id + " cleanup",
            );
            if (cleanup.errors.length || cleanup.unhandled.length)
              error ??= JSON.stringify(cleanup);
          } catch (e) {
            error ??= String(e.stack ?? e);
          }
          await page.close();
        }
        const premiseBlocked =
          !!error && error.includes("B41 fixture premise:");
        if (!premiseBlocked) {
          r.executed++;
          r.blocked--;
          if (error) r.failed++;
          else r.passed++;
        }
        if (premiseBlocked) r.exitCode = 1;
        r.results.push({
          id: c.id,
          pass: !error,
          fixturePremiseBlocked: premiseBlocked,
          error: error ?? null,
          detail: detail ?? null,
          cleanup,
        });
      }
      r.exitCode = r.failed || r.blocked ? 1 : 0;
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
