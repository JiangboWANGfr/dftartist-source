import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { cases } from "./cases.mjs";

if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify(
      { count: cases.length, cases: cases.map(({ run, ...info }) => info) },
      null,
      2,
    ),
  );
} else {
  const product = path.resolve(
    process.env.HIER_B_PRODUCT_ROOT ??
      path.join(import.meta.dirname, "../../../../.."),
  );
  const require = createRequire(import.meta.url);
  const { build } = require("esbuild");
  const { chromium } = require("playwright");
  const self = process.argv.includes("--self-check");
  const aliases = Object.fromEntries(
    ["client", "viewmodel", "protocol-types", "views"].map((name) => [
      "@hier/" + name,
      path.join(product, "web/packages", name, "dist/index.js"),
    ]),
  );
  for (const name of ["react", "react-dom"])
    aliases[name] = path.dirname(require.resolve(name + "/package.json"));
  let server, browser, page;
  const results = [];
  let result = {
    kind: self ? "fixture-self-check-only" : "production-C76-browser-gate",
    node: process.version,
    product,
    plannedCases: cases.length,
    executedCases: 0,
    skippedCases: 0,
  };
  try {
    const bundled = await build({
      entryPoints: [path.join(import.meta.dirname, "fixture.jsx")],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      alias: aliases,
      nodePaths: [path.join(import.meta.dirname, "node_modules")],
      define: { "process.env.NODE_ENV": '"development"' },
    });
    result.buildWarnings = bundled.warnings;
    const js = bundled.outputFiles[0].contents;
    server = http.createServer((req, res) => {
      if (req.url === "/app.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(js);
      } else if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          '<!doctype html><meta charset="utf-8"><title>B C76 test host</title><div id="probe-root"></div><div id="view-root"></div><script type="module" src="/app.js"></script>',
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ headless: true });
    result.browser = browser.version();
    async function open() {
      const p = await browser.newPage({
        viewport: { width: 760, height: 520 },
      });
      p.setDefaultTimeout(10000); // watchdog, not performance budget
      await p.goto(url);
      await p.waitForFunction(() => window.B !== undefined);
      return p;
    }
    page = await open();
    const capable = await page.evaluate(() => window.B.capable);
    result.productionCapable = capable;
    if (self) {
      const initial = await page.evaluate(() => window.B.setup());
      assert.equal(initial.root, "idle");
      assert.equal(initial.rows.length, 1);
      assert.equal(initial.rows[0].kind, "status");
      assert.equal(initial.queries.length, 0);
      await page.evaluate(() => window.B.control());
      await page.evaluate(() => window.B.settle());
      const probe = page.locator("#B-fixture-probe");
      assert.equal(await probe.count(), 1);
      await probe.click();
      await page.evaluate(() => window.B.settle());
      const control = await page.evaluate(() => window.B.controlState());
      assert.equal(
        control.mounts,
        2,
        "real React development StrictMode effect replay",
      );
      assert.equal(control.cleanups, 1);
      assert.equal(control.clicks, 1);
      await page.evaluate(() => window.B.seed(true));
      const state = await page.evaluate(() => window.B.state());
      assert.equal(state.queries.length, 2);
      assert.ok(
        state.rows.some((x) => x.kind === "scope" && x.label === "g.with.dot"),
      );
      assert.equal(state.unhandled, 0);
      const observers = await page.evaluate(() =>
        window.B.probeObserverFailures(),
      );
      assert.deepEqual(observers, {
        sourceDiffersFromOwner: true,
        sourceDisappeared: true,
        retainedSourceId: true,
        pageAggregate: true,
        pageOriginalObserved: true,
        selectAggregate: true,
        selectOriginalObserved: true,
        selectMarkerIdentity: true,
        selectCheckpoint: true,
        selectedRef: "B-ui-root",
        callbacks: 0,
      });
      const released = await page.evaluate(() => window.B.shutdown());
      assert.equal(released.mounts, released.cleanups);
      assert.equal(released.allDisposed, true);
      result.fixtureChecks = {
        passed: true,
        initialIdleRows: 1,
        strictMounts: 2,
        strictCleanups: 2,
        clicks: 1,
        sdkNavigationQueries: (await page.evaluate(() => window.B.state()))
          .queries.length,
        modelsReleased: true,
        publicObserverControls: observers,
      };
      result.note =
        "Host/React/SDK/Transport controls only; production HierarchyTree is not mounted";
    } else {
      result.stage = "production-export-capability";
      assert.equal(
        capable,
        true,
        "production HierarchyTree is missing; semantic cases remain unexecuted, not skipped or passed",
      );
      await page.close();
      page = undefined;
      result.stage = "production-browser-semantics";
      for (const item of cases) {
        page = await open();
        try {
          await item.run(page);
          const state = await page.evaluate(() => window.B.state());
          assert.equal(
            state.unhandled,
            0,
            "no global suppression of unhandled rejections",
          );
          assert.equal(state.unexpectedWindowErrors, 0);
          results.push({ id: item.id, pass: true });
        } catch (error) {
          results.push({
            id: item.id,
            pass: false,
            message: error.message,
            stack: error.stack,
          });
          throw error;
        } finally {
          if (page) {
            await page.evaluate(() => window.B.shutdown());
            await page.close();
            page = undefined;
          }
        }
      }
      result.executedCases = results.length;
    }
    result.exitCode = 0;
  } catch (error) {
    result.exitCode = 1;
    result.error = { message: error.message, stack: error.stack };
    result.executedCases = results.length;
    process.exitCode = 1;
  } finally {
    if (page) {
      try {
        await page.evaluate(() => window.B.shutdown());
      } finally {
        await page.close();
      }
    }
    if (browser) await browser.close();
    if (server)
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    result.results = results;
    result.closedOwnBrowserAndServer = true;
    console.log(JSON.stringify(result, null, 2));
  }
}
