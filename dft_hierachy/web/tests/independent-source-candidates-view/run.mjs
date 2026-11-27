import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
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
            reject(Error("B facility watchdog, NOT product timeout: " + label)),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
if (process.argv.includes("--list")) {
  console.log(JSON.stringify({ planned: cases.length, cases }, null, 2));
} else {
  const controls = process.argv.includes("--controls");
  const r = {
    kind: controls
      ? "B32-real-old-model/browser-facilities-NOT-candidates"
      : "B32-independent-candidate-DOM",
    planned: controls ? 12 : cases.length,
    executed: 0,
    passed: 0,
    failed: 0,
    blocked: controls ? 12 : cases.length,
    skipped: 0,
    stage: "build",
    results: [],
    exitCode: 0,
  };
  let server, browser;
  try {
    const P = process.env.HIER_B_PRODUCT_ROOT,
      T = process.env.HIER_B_BROWSER_TOOLS;
    assert.ok(P && T, "explicit fixed product/tools");
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
    r.buildInputs = Object.keys(out.metafile.inputs);
    r.bundleSha256 = createHash("sha256")
      .update(out.outputFiles[0].contents)
      .digest("hex");
    let cssEntry = null;
    const cssCommand = [
      process.execPath,
      "--input-type=module",
      "-e",
      'console.log(import.meta.resolve("@hier/views/source-candidates-view.css"))',
    ];
    r.cssResolution = { command: cssCommand, cwd: P + "/web" };
    try {
      const url = execFileSync(cssCommand[0], cssCommand.slice(1), {
        cwd: P + "/web",
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      cssEntry = fileURLToPath(url);
      r.cssResolution.url = url;
    } catch (e) {
      r.cssResolution.status = e.status;
      r.cssResolution.stderr = String(e.stderr ?? e);
    }
    r.cssEntry = cssEntry;
    const css = cssEntry ? fs.readFileSync(cssEntry) : Buffer.from("");
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
          '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{margin:0;height:1800px}#A,#B{width:680px;margin:16px}#parent{height:700px;overflow:auto}</style><input id="before" aria-label="B external before"><div id="parent"><div id="A"></div><div id="B"></div></div><input id="after" aria-label="B external after"><div id="control"></div><script type="module" src="/app.js"></script>',
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
        viewport: { width: 1100, height: 950 },
      });
      p.setDefaultTimeout(12000);
      await p.goto(url);
      await p.waitForFunction(() => window.BCV !== undefined);
      return p;
    }
    if (controls) {
      r.stage = "facilities";
      const page = await pageFor();
      try {
        const p = await bounded(
          page.evaluate(() => window.BCV.controlPrepare()),
          "controls prepare",
        );
        await page.mouse.click(p.click.x, p.click.y);
        assert.equal(
          (await page.evaluate(() => window.BCV.controlVerify())).pass,
          true,
        );
        r.results = [
          "real SDK/Navigation/Selection authority",
          "existing SourceView raw text",
          "trusted native click positive control",
        ].map((id) => ({ id, pass: true }));
        r.results.push(
          ...(await bounded(
            page.evaluate(() => window.BCV.premiseControls()),
            "eight public model premises",
          )),
        );
        await bounded(
          page.evaluate(() => window.BCV.sourceControlPrepare()),
          "real SourceView key preparation",
        );
        await page.keyboard.press("Alt+Enter");
        r.results.push(
          await bounded(
            page.evaluate(() => window.BCV.sourceControlVerify()),
            "real SourceView key query",
          ),
        );
        assert.equal(r.results.length, 12);
        r.executed = r.passed = 12;
        r.blocked = 0;
      } finally {
        try {
          r.cleanup = await bounded(
            page.evaluate(() => window.BCV.cleanup()),
            "controls cleanup",
          );
        } finally {
          await page.close();
        }
      }
      assert.deepEqual(r.cleanup.errors, []);
      assert.deepEqual(r.cleanup.unhandled, []);
      r.stage = "facilities";
    } else {
      // A capability gate is a single assertion, not every unexecuted case failing.
      const gate = await pageFor();
      try {
        r.stage = "public-component-capability";
        assert.equal(
          await gate.evaluate(() => window.BCV.capable),
          true,
          "missing production @hier/views SourceCandidatesView",
        );
        assert.equal(
          typeof cssEntry,
          "string",
          "missing public candidate CSS subpath",
        );
      } finally {
        await gate.close();
      }
      r.stage = "semantic-DOM";
      for (const c of cases) {
        const page = await pageFor();
        let e, cleanup;
        try {
          const p = await bounded(
            page.evaluate((id) => window.BCV.prepare(id), c.id),
            c.id + " prepare",
          );
          if (!p.done) {
            if (p.key) await page.keyboard.press(p.key);
            else if (p.click) await page.mouse.click(p.click.x, p.click.y);
            if (p.vertical) {
              const next = await bounded(
                page.evaluate(() => window.BCV.verticalContinue()),
                "vertical resolve",
              );
              await page.mouse.click(next.click.x, next.click.y);
              assert.equal(
                (await page.evaluate(() => window.BCV.verticalVerify())).pass,
                true,
              );
            } else
              assert.equal(
                (
                  await bounded(
                    page.evaluate(() => window.BCV.verify()),
                    c.id + " verify",
                  )
                ).pass,
                true,
              );
          }
        } catch (x) {
          e = String(x.stack ?? x);
        } finally {
          try {
            cleanup = await bounded(
              page.evaluate(() => window.BCV.cleanup()),
              c.id + " cleanup",
            );
            if (cleanup.errors.length || cleanup.unhandled.length)
              e ??= JSON.stringify(cleanup);
          } catch (x) {
            e ??= String(x);
          }
          await page.close();
        }
        r.executed++;
        r.blocked--;
        if (e) r.failed++;
        else r.passed++;
        r.results.push({ id: c.id, pass: !e, error: e ?? null, cleanup });
      }
      r.exitCode = r.failed ? 1 : 0;
    }
  } catch (e) {
    r.exitCode = 1;
    r.error = String(e.stack ?? e);
    if (controls) {
      r.executed = r.results.length;
      r.passed = r.results.filter((x) => x.pass === true).length;
      r.failed = r.executed - r.passed;
      r.blocked = r.planned - r.executed;
    }
  } finally {
    r.releaseErrors = [];
    if (browser)
      try {
        await bounded(browser.close(), "browser release");
      } catch (e) {
        r.releaseErrors.push(String(e.stack ?? e));
      }
    if (server)
      try {
        await bounded(
          new Promise((resolve, reject) =>
            server.close((e) => (e ? reject(e) : resolve())),
          ),
          "HTTP server release",
        );
      } catch (e) {
        r.releaseErrors.push(String(e.stack ?? e));
        server.closeAllConnections();
      }
    if (r.releaseErrors.length) r.exitCode = 1;
  }
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.exitCode;
}
