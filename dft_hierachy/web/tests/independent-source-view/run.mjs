// B gate for the actual production export. Controls never stand in for SourceView.
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { cases, ambiguities } from "./cases.mjs";
const list = process.argv.includes("--list"),
  self = process.argv.includes("--self-check");
if (list) {
  console.log(
    JSON.stringify(
      {
        kind: "B SourceView DOM inventory",
        count: cases.length,
        cases,
        ambiguities,
      },
      null,
      2,
    ),
  );
} else {
  const product = process.env.HIER_B_PRODUCT_ROOT,
    tools = process.env.HIER_B_BROWSER_TOOLS;
  assert.ok(
    product && tools,
    "explicit fixed product and readonly browser tools",
  );
  const require = createRequire(path.join(tools, "package.json")),
    { build } = require("esbuild"),
    { chromium } = require("playwright");
  for (const [name, version] of [
    ["react", "18.3.1"],
    ["react-dom", "18.3.1"],
    ["playwright", "1.64.1"],
    ["esbuild", "0.25.11"],
  ])
    assert.equal(
      require(name + "/package.json").version,
      version,
      "fixed test tools " + name,
    );
  let server, browser, page;
  const result = {
    kind: self
      ? "B fixture-controls-NOT-SourceView"
      : "B production SourceView DOM gate",
    product,
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
  try {
    const alias = Object.fromEntries(
      ["views", "viewmodel", "client", "protocol-types"].map((n) => [
        "@hier/" + n,
        path.join(product, "web/packages", n, "dist/index.js"),
      ]),
    );
    for (const n of ["react", "react-dom"])
      alias[n] = path.dirname(require.resolve(n + "/package.json"));
    const bundle = await build({
      entryPoints: [path.join(import.meta.dirname, "fixture.jsx")],
      bundle: true,
      outdir: path.join(import.meta.dirname, "B-virtual-bundle"),
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      alias,
      nodePaths: [path.join(tools, "node_modules")],
      define: { "process.env.NODE_ENV": '"development"' },
    });
    result.buildWarnings = bundle.warnings;
    assert.equal(bundle.warnings.length, 0, "unexpected fixture build warning");
    const pkg = JSON.parse(
      await fs.readFile(path.join(product, "web/packages/views/package.json")),
    );
    const exp = pkg.exports?.["./source-view.css"],
      target =
        typeof exp === "string"
          ? exp
          : (exp?.import ?? exp?.default ?? exp?.style);
    let css;
    if (target) {
      assert.ok(target.startsWith("./"));
      css = await fs.readFile(path.join(product, "web/packages/views", target));
    }
    server = http.createServer((req, res) => {
      if (req.url === "/app.js") {
        res.writeHead(200, { "Content-Type": "text/javascript" });
        res.end(
          bundle.outputFiles.find((f) => f.path.endsWith(".js")).contents,
        );
      } else if (req.url === "/component.css" && css) {
        res.writeHead(200, { "Content-Type": "text/css" });
        res.end(css);
      } else if (req.url === "/" || req.url === "/?without-css=1") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          '<!doctype html><meta charset="utf-8"><title>B SourceView test host</title>' +
            (css && req.url === "/"
              ? '<link rel="stylesheet" href="/component.css">'
              : "") +
            '<style>body{margin:0;min-height:1800px}#outer{position:relative;margin-top:240px;margin-left:30px;width:500px;height:360px;overflow:auto}.spacer{height:100px}#A,#B{width:450px}#tail{height:700px}</style><input id="outside-focus" aria-label="B outside focus"><span id="selection-probe">B selection probe</span><div id="probe"></div><div id="outer"><div class="spacer"></div><div id="A"></div><div id="B"></div><div id="tail"></div></div><button id="outside-after">B outside after</button><script type="module" src="/app.js"></script>',
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
    async function open(noCss = false) {
      const p = await browser.newPage({
        viewport: { width: 900, height: 700 },
      });
      p.setDefaultTimeout(10000);
      await p.goto(result.url + (noCss ? "/?without-css=1" : "/"));
      await p.waitForFunction(() => window.B !== undefined);
      return p;
    }
    page = await open();
    result.productionCapable = await page.evaluate(() => window.B.capable);
    if (self) {
      result.controls = await page.evaluate(() => window.B.selfCheck());
      assert.equal(result.controls.productMounted, false);
      assert.equal(result.controls.fixtureOnly, true);
      result.fixtureChecks = result.controls.checks;
    } else {
      result.stage = "production-export-capability";
      assert.equal(
        result.productionCapable,
        true,
        "production @hier/views.SourceView missing; no semantic case executed",
      );
      result.stage = "public-style-capability";
      assert.ok(css, "public @hier/views/source-view.css missing");
      await page.close();
      page = undefined;
      result.stage = "production-browser-semantics";
      function deadline(p, label) {
        let timer;
        return Promise.race([
          p,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("B facility watchdog: " + label)),
              15000,
            );
          }),
        ]).finally(() => clearTimeout(timer));
      }
      for (const item of cases) {
        page = await open(item.kind === "base-layout");
        const errors = [];
        try {
          const state = await deadline(
            page.evaluate((id) => window.B.runCase(id), item.id),
            item.id,
          );
          if (state.keyboard) {
            await page.keyboard.press("Tab");
            await page.waitForFunction(
              () => window.document.activeElement === window.B.body(),
            );
            let before = state.before;
            if (state.keyboard === "keyboard") {
              before = await page.evaluate(() => window.B.prepareKeyboard());
              await page.keyboard.press("PageDown");
              await page.waitForFunction(
                (old) => window.B.body().scrollTop > old[0],
                before,
              );
              await page.keyboard.press("ArrowRight");
              await page.waitForFunction(
                (old) => window.B.body().scrollLeft > old[1],
                before,
              );
              await page.keyboard.press("x");
              assert.equal(
                await page.locator("#A pre > code").textContent(),
                state.text,
                "readonly native keyboard",
              );
            }
            await page.evaluate(
              ({ kind, before }) => window.B.keyboardCheck(kind, before),
              { kind: state.keyboard, before },
            );
          }
          if (item.kind !== "invalid") {
            const expected =
              item.input.name === "two-instances" ||
              item.input.name === "unique-description"
                ? 2
                : item.kind === "lifecycle"
                  ? 0
                  : 1;
            assert.equal(
              await page.getByRole("region").count(),
              expected,
              "regions exposed to accessibility queries",
            );
          }
        } catch (e) {
          errors.push(String(e.stack ?? e));
        } finally {
          try {
            const cleaned = await deadline(
              page.evaluate(() => window.B.cleanup()),
              "cleanup " + item.id,
            );
            assert.equal(cleaned.remainingRoots, 0);
            assert.equal(cleaned.unhandled, 0);
            assert.deepEqual(cleaned.errors, []);
          } catch (e) {
            errors.push("fixture cleanup: " + String(e.stack ?? e));
          }
          result.executed++;
          try {
            await page.close();
          } catch (e) {
            errors.push("page close: " + String(e.stack ?? e));
          }
          page = undefined;
        }
        result.results.push({ id: item.id, pass: errors.length === 0, errors });
        if (errors.length) result.failed++;
        else result.passed++;
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
    const cleanup = [];
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
        cleanup.push({ name, error: String(e) });
      }
    result.cleanupErrors = cleanup;
    if (cleanup.length) result.exitCode = 1;
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}
