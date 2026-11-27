import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cases } from "./cases.mjs";
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error("B facility watchdog (not a product timeout): " + label),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const controls = process.argv.includes("--controls"),
  trusted = process.argv.includes("--trusted-only");
const selected = trusted
  ? cases.filter((c) => c.group.startsWith("trusted-"))
  : cases;
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify({ count: selected.length, cases: selected }, null, 2),
  );
else {
  const P = process.env.HIER_B_PRODUCT_ROOT,
    T = process.env.HIER_B_BROWSER_TOOLS;
  assert.ok(P && T, "explicit fixed product/tools");
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
  const result = {
    kind: controls
      ? "B SPI native facility NOT SourceView"
      : "B independent SourceView position interaction",
    product: P,
    fixed: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: P,
      encoding: "utf8",
    }).trim(),
    planned: controls ? 8 : selected.length,
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    realInputPlanned: controls
      ? 0
      : selected.filter((c) => c.group.startsWith("trusted-")).length,
    packageViews: process.env.HIER_B_PACKAGE_VIEWS_ENTRY ?? null,
    productMounted: !controls,
    results: [],
    stage: "fixture-build",
    exitCode: 0,
  };
  let server, browser, page;
  const warnings = [];
  try {
    const alias = Object.fromEntries(
      ["views", "viewmodel", "client", "protocol-types"].map((n) => [
        "@hier/" + n,
        path.join(P, "web/packages", n, "dist/index.js"),
      ]),
    );
    let runtimeRequire = require;
    if (process.env.HIER_B_PACKAGE_VIEWS_ENTRY) {
      assert.ok(path.isAbsolute(process.env.HIER_B_PACKAGE_VIEWS_ENTRY));
      assert.ok(
        process.env.HIER_B_PACKAGE_CSS,
        "packaged public CSS entry required",
      );
      const consumer = path.resolve(
        path.dirname(process.env.HIER_B_PACKAGE_VIEWS_ENTRY),
        "../../../..",
      );
      runtimeRequire = createRequire(path.join(consumer, "package.json"));
      result.packageResolution = [];
      for (const name of ["views", "viewmodel", "client", "protocol-types"]) {
        // @hier/client deliberately has an import-only public export. Resolve
        // through real ESM from the installed consumer, not CJS require or a
        // workspace/private-path fallback.
        const command = [
          process.execPath,
          "--input-type=module",
          "-e",
          "console.log(import.meta.resolve(process.argv[1]))",
          "@hier/" + name,
        ];
        const url = execFileSync(command[0], command.slice(1), {
          cwd: consumer,
          encoding: "utf8",
        }).trim();
        const entry = fileURLToPath(url);
        assert.ok(
          entry.startsWith(consumer + path.sep),
          "ESM resolution stays in actual consumer",
        );
        alias["@hier/" + name] = entry;
        result.packageResolution.push({ command, cwd: consumer, url, entry });
      }
      assert.equal(
        await fs.realpath(alias["@hier/views"]),
        await fs.realpath(process.env.HIER_B_PACKAGE_VIEWS_ENTRY),
      );
    }
    for (const n of ["react", "react-dom"])
      alias[n] = path.dirname(runtimeRequire.resolve(n + "/package.json"));
    result.truePack = Boolean(process.env.HIER_B_PACKAGE_VIEWS_ENTRY);
    result.viewsEntry = alias["@hier/views"];
    const built = await build({
      entryPoints: [
        path.join(
          import.meta.dirname,
          controls ? "native-controls.mjs" : "fixture.jsx",
        ),
      ],
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
    warnings.push(...built.warnings);
    assert.deepEqual(built.warnings, []);
    result.buildInputs = Object.keys(built.metafile.inputs);
    result.bundleSha256 = createHash("sha256")
      .update(built.outputFiles[0].contents)
      .digest("hex");
    const pkg = JSON.parse(
      await fs.readFile(P + "/web/packages/views/package.json"),
    );
    result.cssEntry =
      process.env.HIER_B_PACKAGE_CSS ??
      path.join(P, "web/packages/views", pkg.exports["./source-view.css"]);
    const css = await fs.readFile(result.cssEntry);
    const html =
      '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{margin:0;height:1800px}#reserved{width:850px;height:500px;padding:15px}#A,#B{width:520px;height:260px;transform-origin:top left;position:relative}</style><input id="outside" aria-label="B external focus"><span id="external">B external selection</span><div id="reserved"><div id="A"></div><div id="B"></div></div><script type="module" src="/app.js"></script>';
    server = http.createServer((req, res) => {
      if (req.url === "/app.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(built.outputFiles[0].contents);
      } else if (req.url === "/style.css") {
        res.setHeader("Content-Type", "text/css");
        res.end(css);
      } else if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        res.end(html);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    browser = await chromium.launch({ headless: true });
    result.browser = browser.version();
    result.url = "http://127.0.0.1:" + server.address().port;
    result.stage = controls ? "native-facility" : "production-DOM-events";
    if (controls) {
      page = await browser.newPage();
      await page.goto(result.url);
      await page.waitForFunction(() => window.BSPINative !== undefined);
      result.results = await bounded(
        page.evaluate(() => window.BSPINative()),
        "native controls",
      );
      result.executed = result.results.length;
      result.passed = result.results.filter((r) => r.pass).length;
      result.failed = result.executed - result.passed;
      result.productMounted = false;
      await page.close();
      page = undefined;
    } else
      for (const c of selected) {
        const errors = [];
        let actual,
          entered = false,
          cleanup;
        try {
          page = await browser.newPage({
            viewport: { width: 1200, height: 850 },
          });
          page.setDefaultTimeout(15000);
          await page.goto(result.url);
          await page.waitForFunction(() => window.BSPI !== undefined);
          assert.equal(await page.evaluate(() => window.BSPI.capable), true);
          entered = true;
          if (c.group.startsWith("trusted-")) {
            const p = await bounded(
              page.evaluate((id) => window.BSPI.trustedPrepare(id), c.id),
              c.id + " trusted prepare",
            );
            if (p.kind === "mouse") await page.mouse.dblclick(p.x, p.y);
            else await page.keyboard.press("Alt+Enter");
            actual = await bounded(
              page.evaluate(() => window.BSPI.trustedFinish()),
              c.id + " trusted assertions",
            );
          } else
            actual = await bounded(
              page.evaluate((id) => window.BSPI.run(id), c.id),
              c.id,
            );
          assert.equal(actual.pass, true);
        } catch (e) {
          errors.push(String(e.stack ?? e));
        } finally {
          if (page)
            try {
              cleanup = await bounded(
                page.evaluate(() => window.BSPI?.cleanup()),
                c.id + " cleanup",
              );
              assert.ok(cleanup);
              assert.equal(cleanup.remainingRoots, 0);
              assert.deepEqual(cleanup.errors, []);
            } catch (e) {
              errors.push("fixture cleanup: " + String(e));
            }
          try {
            await page?.close();
          } catch (e) {
            errors.push("page close: " + String(e));
          }
          page = undefined;
        }
        if (entered) {
          result.executed++;
          if (errors.length) result.failed++;
          else result.passed++;
        } else result.blocked++;
        result.results.push({
          id: c.id,
          group: c.group,
          input: c.input,
          expected: c.expected,
          basis: c.basis,
          enteredProduct: entered,
          pass: entered && errors.length === 0,
          actual,
          errors,
          cleanup,
        });
      }
    if (result.failed || result.blocked) result.exitCode = 1;
  } catch (e) {
    result.exitCode = 1;
    result.error = String(e.stack ?? e);
    result.blocked = result.planned - result.executed;
  } finally {
    result.buildWarnings = warnings;
    const errors = [];
    for (const [name, close] of [
      ["page", () => page?.close()],
      ["browser", () => browser?.close()],
      [
        "server",
        () =>
          server
            ? new Promise((r, j) => server.close((e) => (e ? j(e) : r())))
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
