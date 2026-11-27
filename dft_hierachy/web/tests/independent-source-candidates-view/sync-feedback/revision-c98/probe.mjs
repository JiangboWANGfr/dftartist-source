// Runs an explicitly aliased facilities-only view against the actual frozen
// S01/S02 runCase. No production view is aliased in the normal product runner.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mirror } from "./global-channels.mjs";
const product = process.env.HIER_B_PRODUCT_ROOT,
  tools = process.env.HIER_B_BROWSER_TOOLS;
assert(product && tools && path.isAbsolute(product) && path.isAbsolute(tools));
const legacy = process.argv.includes("--legacy"),
  leak = process.argv.includes("--leak"),
  boundaryLeak = process.argv.includes("--boundary-leak");
const id = process.argv.includes("--S01") ? "S01" : "S02";
assert(!(leak && id === "S01"));
assert(!boundaryLeak || (!legacy && id === "S01"));
const fixture = legacy
  ? product +
    "/web/tests/independent-source-candidates-view/sync-feedback/fixture.jsx"
  : path.resolve(import.meta.dirname, "../fixture.jsx");
const req = createRequire(tools + "/package.json"),
  { build } = req("esbuild"),
  { chromium } = req("playwright");
const alias = Object.fromEntries(
  ["viewmodel", "client", "protocol-types"].map((n) => [
    "@hier/" + n,
    product + "/web/packages/" + n + "/dist/index.js",
  ]),
);
alias["@hier/views"] = path.join(import.meta.dirname, "probe-view.jsx");
for (const n of ["react", "react-dom"])
  alias[n] = path.dirname(req.resolve(n + "/package.json"));
const result = {
  kind: "B-C98-facilities-only-counterexample",
  legacy,
  leak,
  boundaryLeak,
  id,
  productionCandidateUIExecuted: 0,
  aliasIsIntentionalControl: true,
  fixture,
  error: null,
};
let browser, server, page, failure;
try {
  const out = await build({
    entryPoints: [fixture],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    metafile: true,
    alias,
    nodePaths: [tools + "/node_modules"],
    define: {
      "process.env.NODE_ENV": '"development"',
      B98_LEAK: JSON.stringify(leak),
      B98_BOUNDARY_LEAK: JSON.stringify(boundaryLeak),
    },
  });
  assert.deepEqual(out.warnings, []);
  const bundle = Buffer.from(out.outputFiles[0].contents);
  result.bundle = {
    bytes: bundle.length,
    sha256: createHash("sha256").update(bundle).digest("hex"),
    gzipBase64: gzipSync(bundle).toString("base64"),
  };
  result.inputs = Object.keys(out.metafile.inputs);
  server = http.createServer((q, r) => {
    r.setHeader(
      "Content-Type",
      q.url === "/app.js" ? "text/javascript" : "text/html",
    );
    r.end(
      q.url === "/app.js"
        ? bundle
        : '<!doctype html><div id="root"></div><script type="module" src="/app.js"></script>',
    );
  });
  await new Promise((yes, no) => {
    server.once("error", no);
    server.listen(0, "127.0.0.1", yes);
  });
  browser = await chromium.launch({ headless: true });
  result.browser = browser.version();
  page = await browser.newPage();
  result.pageErrors = [];
  page.on("pageerror", (e) =>
    result.pageErrors.push({ name: e.name, message: e.message }),
  );
  await page.addInitScript(() => {
    window.B98Native = [];
    window.addEventListener("error", (event) =>
      window.B98Native.push({
        originalE: event.error === window.B98OriginalE,
        originalWrapper: event.error === window.B98Wrapper,
        lateLeakCount: window.B98LateLeaks ?? 0,
        aggregate: event.error instanceof AggregateError,
        name: event.error?.name,
        message: event.error?.message,
      }),
    );
  });
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.waitForFunction(() => window.B42 !== undefined);
  try {
    result.detail = await page.evaluate((id) => window.B42.runCase(id), id);
  } catch (e) {
    result.runRejected = String(e);
  } finally {
    result.cleanup = await page.evaluate(() => window.B42.cleanup());
    result.native = await page.evaluate(() => window.B98Native);
  }
  if (boundaryLeak) {
    const later = result.native.filter((e) => e.lateLeakCount > 0);
    assert(
      later.length > 0 && later.every((e) => e.originalWrapper && !e.originalE),
    );
    assert(
      result.runRejected,
      "S01 MUST reject later global escape of the SAME caught wrapper",
    );
    assert.equal(result.detail, undefined);
    assert(result.cleanup.globalErrors.length > 0);
  } else if (leak) {
    assert.equal(result.native.length, 1, "one real global error");
    assert.equal(
      result.native[0].originalE,
      true,
      "globally leaked original real model E",
    );
    assert.equal(result.native[0].aggregate, true);
    assert.equal(result.pageErrors.length, 1);
    // This regression expectation is frozen BEFORE changing the old fixture:
    // legacy must fail here, revised must reject the exact same leaked original E.
    assert(
      result.runRejected,
      "S02 MUST reject a revoked original error leaked globally",
    );
    assert.equal(result.detail, undefined);
    assert.equal(result.cleanup.globalErrors.length, 1);
  } else {
    assert.equal(result.runRejected, undefined);
    assert.equal(result.detail.pass, true);
    assert.equal(result.detail.confirmations, 1);
    assert.equal(result.detail.callbackCalls, id === "S01" ? 1 : 0);
    assert.equal(result.detail.boundaryCaptures, id === "S01" ? 1 : 0);
    if (id === "S02") {
      assert.deepEqual(result.native, []);
      assert.deepEqual(result.pageErrors, []);
    }
    if (legacy) assert.deepEqual(result.cleanup, { errors: [], unhandled: [] });
    else {
      assert.deepEqual(result.cleanup.errors, []);
      mirror(result.cleanup, result.pageErrors);
      if (id === "S01") {
        assert(
          result.cleanup.boundaryEvents.length > 0,
          "real React dev event classification exercised",
        );
        assert(
          result.native.every((e) => !e.originalE),
          "only actual [E,X] boundary wrapper, not original E",
        );
      }
    }
  }
  result.expectationMet = true;
} catch (e) {
  failure = e;
  result.error = String(e.stack ?? e);
  result.expectationMet = false;
} finally {
  result.releaseErrors = [];
  for (const [label, close] of [
    ["page", () => page?.close()],
    ["browser", () => browser?.close()],
    [
      "server",
      () =>
        server &&
        new Promise((yes, no) => server.close((e) => (e ? no(e) : yes()))),
    ],
  ])
    try {
      await close();
    } catch (e) {
      result.releaseErrors.push({ label, error: String(e) });
    }
  console.log(JSON.stringify(result, null, 2));
  if (failure || result.releaseErrors.length) process.exitCode = 1;
}
