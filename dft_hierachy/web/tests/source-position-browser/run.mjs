import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(path.join(root, "web/package.json"));
const { build } = require("esbuild"),
  { chromium } = require("playwright");
const mode = process.argv[2];
assert.ok(["controls", "product"].includes(mode));
const aliases = Object.fromEntries(
  ["views", "viewmodel", "client", "protocol-types"].map((n) => [
    "@hier/" + n,
    path.join(root, "web/packages", n, "dist/index.js"),
  ]),
);
const built = await build({
  entryPoints: [path.join(import.meta.dirname, mode + ".jsx")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  alias: aliases,
  define: { "process.env.NODE_ENV": '"development"' },
});
assert.deepEqual(built.warnings, []);
const css = await fs.readFile(
  path.join(root, "web/packages/views/source-view.css"),
);
const server = http.createServer((req, res) => {
  if (req.url === "/app.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(built.outputFiles[0].contents);
  } else if (req.url === "/style.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css);
  } else
    res.end(
      '<!doctype html><link rel="stylesheet" href="/style.css"><div id="host" style="width:580px"></div><button id="native">Native input</button><script type="module" src="/app.js"></script>',
    );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [],
  rows = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction((key) => Boolean(window[key]), mode);
  if (mode === "controls") {
    for (const id of ["native", "react"]) {
      await page.locator("#" + id).dblclick();
      await page.locator("#" + id).press("Alt+Enter");
    }
    const receipts = await page.evaluate(() => controls.receipts);
    const commands = receipts.filter((r) => r.step.endsWith("-command"));
    assert.equal(commands.length, 4);
    for (const c of commands) {
      assert.equal(c.inCaptureStack, false);
      // Historical capture-flag reproducer; phase is not a timing oracle.
      // Discriminating sync/delay controls run in B's verify-observation.mjs.
      assert.equal(c.isTrusted, true);
    }
    rows.push({
      control:
        "native and React synchronous handlers run after capture microtask",
      receipts,
    });
    assert.equal(await page.evaluate(() => controls.toggle()), "");
    assert.equal(await page.evaluate(() => controls.committed()), "visible");
    assert.equal(await page.evaluate(() => controls.toggle()), "visible");
    assert.equal(await page.evaluate(() => controls.committed()), "");
    rows.push({
      control:
        "React DOM hint insertion/removal commit after dispatchEvent returns",
      passed: true,
    });
  } else {
    const original = await page.evaluate(() => product.text());
    for (const scale of [0.5, 1, 1.5]) {
      const p = await page.evaluate((s) => product.pointer(s), scale);
      assert.ok(p.geometry.top > 0 && p.geometry.left > 0);
      await page.mouse.dblclick(p.x, p.y);
      const call = await page.evaluate(() => product.calls.at(-1));
      assert.equal(call.offset, p.offset);
      assert.equal(call.sameDocument, true);
      assert.equal(call.type, "dblclick");
      assert.equal(call.inListenerStack, true);
      assert.equal(call.sameEvent, true);
      assert.equal(call.isTrusted, true);
      rows.push({ scale, call, geometry: p.geometry });
    }
    await page.evaluate(() => {
      product.resetScale();
      product.key();
    });
    await page.keyboard.press("Alt+Enter");
    const key = await page.evaluate(() => ({
      call: product.calls.at(-1),
      offset: product.reverseOffset,
    }));
    assert.equal(key.call.offset, key.offset);
    assert.equal(key.call.type, "keydown");
    assert.equal(key.call.sameDocument, true);
    assert.equal(key.call.inListenerStack, true);
    assert.equal(key.call.sameEvent, true);
    assert.equal(key.call.isTrusted, true);
    rows.push({ reverseSelection: key });
    const before = await page.evaluate(() => product.geometry());
    await page.evaluate(() => product.fail(true));
    await page.keyboard.press("Alt+Enter");
    await page.waitForFunction(() =>
      product.hints().includes("源码位置查询失败"),
    );
    assert.deepEqual(await page.evaluate(() => product.geometry()), before);
    await page.evaluate(() => product.missingMouse());
    await page.waitForFunction(() =>
      product.hints().includes("无法从鼠标位置查询"),
    );
    assert.ok(
      await page.evaluate(() => product.hints().includes("源码位置查询失败")),
    );
    assert.deepEqual(await page.evaluate(() => product.geometry()), before);
    if (process.env.HIER_A_EVIDENCE)
      await page.screenshot({
        path: path.join(process.env.HIER_A_EVIDENCE, "position-feedback.png"),
      });
    await page.evaluate(() => {
      product.fail(false);
      product.clearByKey();
    });
    await page.waitForFunction(
      () =>
        !product.hints().includes("源码位置查询失败") &&
        !product.hints().includes("无法从鼠标位置查询"),
    );
    assert.deepEqual(await page.evaluate(() => product.geometry()), before);
    assert.equal(await page.evaluate(() => product.text()), original);
    rows.push({
      feedback:
        "failure and native hint coexist; next action clears both after commit; geometry and text retained",
      before,
    });
    const count = await page.evaluate(() => product.calls.length);
    await page.evaluate(() => product.mutateAndQuery());
    assert.equal(await page.evaluate(() => product.calls.length), count);
    rows.push({ editedDomRejected: true });
    await page.evaluate(() => product.rejectAndShowMouse());
    await page.waitForFunction(
      () =>
        product.hints().includes("源码位置查询失败") &&
        product.hints().includes("无法从鼠标位置查询"),
    );
    assert.deepEqual(await page.evaluate(() => product.geometry()), before);
    rows.push({ pendingFailureKeepsMouseHint: true });
    await page.evaluate(() => product.callbackErrorWithMouse());
    await page.waitForFunction(() => product.boundaryErrors().length === 1);
    assert.deepEqual(await page.evaluate(() => product.boundaryErrors()), [
      ["A command error", "A callback error"],
    ]);
    rows.push({ nativeHintCannotSuppressCallbackRenderError: true });
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        mode,
        productMounted: mode === "product",
        browser: browser.version(),
        rows,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  try {
    const cleanup = await page.evaluate((key) => window[key]?.dispose(), mode);
    if (mode === "product" && cleanup !== undefined)
      assert.deepEqual(cleanup, {
        active: false,
        depth: 0,
        listeners: 0,
        restored: true,
      });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ cleanup: cleanup ?? "unmounted" }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
