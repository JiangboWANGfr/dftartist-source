// Executes only generic B native/React controls, never SourceView/product code.
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const tools = process.env.HIER_B_BROWSER_TOOLS;
assert.ok(tools, "explicit fixed readonly browser tools");
const require = createRequire(path.join(tools, "package.json"));
const { build } = require("esbuild"),
  { chromium } = require("playwright");
for (const [name, expected] of [
  ["react", "18.3.1"],
  ["react-dom", "18.3.1"],
  ["playwright", "1.64.1"],
  ["esbuild", "0.25.11"],
])
  assert.equal(require(name + "/package.json").version, expected);
const report = {
  kind: "B browser-observation facility NOT SourceView",
  sourceViewMounted: false,
  tools,
  node: process.version,
  productExecuted: 0,
  plannedTrusted: 24,
  executedTrusted: 0,
  passedTrusted: 0,
  failedTrusted: 0,
  syntheticObservations: 0,
  commitControls: [],
  cleanupErrors: [],
  exitCode: 1,
};
let server, browser, page;
try {
  const alias = Object.fromEntries(
    ["react", "react-dom"].map((name) => [
      name,
      path.dirname(require.resolve(name + "/package.json")),
    ]),
  );
  const built = await build({
    entryPoints: [path.join(import.meta.dirname, "observation-controls.jsx")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    metafile: true,
    alias,
    nodePaths: [path.join(tools, "node_modules")],
    define: { "process.env.NODE_ENV": '"development"' },
  });
  assert.deepEqual(built.warnings, []);
  report.buildInputs = Object.keys(built.metafile.inputs);
  assert.equal(
    report.buildInputs.some((f) =>
      /(?:packages\/(?:views|client|viewmodel|protocol-types)\/|node_modules\/@hier\/)/.test(
        f,
      ),
    ),
    false,
  );
  report.bundleSha256 = createHash("sha256")
    .update(built.outputFiles[0].contents)
    .digest("hex");
  const html =
    '<!doctype html><meta charset="utf-8"><div id="arena"><button id="native">Native host</button><button id="idl">IDL host</button><div id="react-root"></div></div><output id="progress">0</output><script type="module" src="/app.js"></script>';
  server = http.createServer((req, res) => {
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(html);
    } else if (req.url === "/app.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(built.outputFiles[0].contents);
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
  report.browser = browser.version();
  page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.waitForFunction(() => window.BObservation !== undefined);
  report.initialDOM = await page.locator("#arena").innerText();
  for (const source of ["trusted", "synthetic"])
    for (const host of ["native", "idl", "react"])
      for (const event of ["dblclick", "keydown"]) {
        const locator = page.locator("#" + host);
        assert.equal(await locator.count(), 1);
        const action = await page.evaluate(
          ({ host, event, source }) =>
            window.BObservation.prepare(host, event, source),
          { host, event, source },
        );
        if (source === "synthetic")
          await page.evaluate(
            ({ host, event }) => window.BObservation.synthetic(host, event),
            { host, event },
          );
        else if (event === "dblclick") await locator.dblclick();
        else await locator.press("Alt+Enter");
        await page.waitForFunction(
          (before) => window.BObservation.snapshot().rows.length === before + 4,
          action.before,
        );
      }
  for (const expected of [true, false]) {
    await page.evaluate(
      (expected) => window.BObservation.commit(expected),
      expected,
    );
    await page.waitForFunction(
      () => window.BObservation.snapshot().commits.at(-1)?.done,
    );
  }
  const evidence = await page.evaluate(() => window.BObservation.finish());
  report.evidence = evidence;
  assert.equal(evidence.sourceViewMounted, false);
  assert.deepEqual(pageErrors, []);
  const trusted = evidence.rows.filter((row) => row.source === "trusted");
  report.executedTrusted = trusted.length;
  assert.equal(trusted.length, 24);
  for (const row of evidence.rows) {
    const expected = row.delay === "sync";
    row.passed =
      row.observed === expected && row.trusted === (row.source === "trusted");
    if (row.source === "trusted")
      report[row.passed ? "passedTrusted" : "failedTrusted"]++;
  }
  assert.ok(evidence.rows.every((row) => row.passed));
  const synthetic = evidence.rows.filter((row) => row.source === "synthetic");
  assert.equal(synthetic.length, 24);
  report.syntheticObservations = synthetic.length;
  report.legacy = {
    trustedSync: trusted
      .filter((r) => r.delay === "sync")
      .map((r) => ({
        host: r.host,
        event: r.event,
        inEvent: r.legacy,
        phase: r.phase,
      })),
    syntheticSync: synthetic
      .filter((r) => r.delay === "sync")
      .map((r) => ({
        host: r.host,
        event: r.event,
        inEvent: r.legacy,
        phase: r.phase,
      })),
  };
  report.commitControls = evidence.commits;
  assert.equal(evidence.commits.length, 2);
  assert.ok(
    evidence.commits.every((r) => r.done && !r.error && r.after === r.expected),
  );
  assert.ok(evidence.transparency.length >= 7);
  assert.deepEqual(evidence.cleanup, {
    channels: 0,
    probeActive: false,
    probeListeners: 0,
  });
  report.exitCode = 0;
} catch (error) {
  report.error = String(error.stack ?? error);
} finally {
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
  ]) {
    try {
      await close();
    } catch (error) {
      report.cleanupErrors.push({ name, error: String(error) });
    }
  }
  if (report.cleanupErrors.length) report.exitCode = 1;
}
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.exitCode;
