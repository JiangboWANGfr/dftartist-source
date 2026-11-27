// Native browser primitives over the existing SourceView. NOT interaction code.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const require = createRequire(path.join(repo, "web/package.json"));
const { build } = require("esbuild");
const { chromium } = require("playwright");
const output = process.env.HIER_A_EVIDENCE;
assert.ok(output, "explicit evidence directory is required");
const alias = Object.fromEntries(
  ["views", "viewmodel", "client", "protocol-types"].map((n) => [
    "@hier/" + n,
    path.join(repo, "web/packages", n, "dist/index.js"),
  ]),
);
for (const n of ["react", "react-dom"])
  alias[n] = path.dirname(require.resolve(n + "/package.json"));
const built = await build({
  entryPoints: [fileURLToPath(new URL("native-fixture.jsx", import.meta.url))],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  alias,
  nodePaths: [path.join(repo, "web/node_modules")],
  define: { "process.env.NODE_ENV": '"development"' },
});
assert.deepEqual(built.warnings, []);
const bundle = built.outputFiles[0].contents;
await fs.writeFile(path.join(output, "native-position-bundle.js"), bundle);
const css = await fs.readFile(
  path.join(repo, "web/packages/views/source-view.css"),
);
const html =
  '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{margin:40px}#mount{width:600px;transform-origin:top left}</style><div id="mount"></div><script type="module" src="/app.js"></script>';
await fs.writeFile(path.join(output, "native-position-host.html"), html);
const server = http.createServer((req, res) => {
  const type =
    req.url === "/app.js"
      ? "text/javascript"
      : req.url === "/style.css"
        ? "text/css"
        : "text/html";
  res.setHeader("Content-Type", type);
  res.end(
    req.url === "/app.js" ? bundle : req.url === "/style.css" ? css : html,
  );
});
let browser;
const pageErrors = [];
const cases = [];
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page
    .getByRole("region", { name: "A native source position capability" })
    .waitFor();
  for (const scale of [0.5, 1, 1.5]) {
    const actual = await page.evaluate((scale) => {
      const mount = document.getElementById("mount");
      mount.style.transform = `scale(${scale})`;
      const code = mount.querySelector("code");
      const mark = code.querySelector("mark");
      const node = mark.firstChild;
      const range = document.createRange();
      range.setStart(node, 1);
      range.setEnd(node, 2);
      const rect = range.getBoundingClientRect();
      const x = rect.left + rect.width / 4,
        y = rect.top + rect.height / 2;
      const caret = document.caretPositionFromPoint(x, y);
      const prefix = document.createRange();
      prefix.setStart(code, 0);
      prefix.setEnd(caret.offsetNode, caret.offset);
      const rawPrefix = prefix.cloneContents().textContent;
      const selection = document.getSelection();
      selection.setBaseAndExtent(node, 3, node, 1);
      const focus = {
        sameNode: selection.focusNode === node,
        offset: selection.focusOffset,
        anchorOffset: selection.anchorOffset,
        rangeCount: selection.rangeCount,
      };
      selection.removeAllRanges();
      const elementRange = document.createRange();
      elementRange.setStart(code, 0);
      elementRange.setEnd(code, [...code.childNodes].indexOf(mark));
      return {
        scale,
        text: code.textContent,
        expectedText: window.nativeWitness.text,
        expectedStart: window.nativeWitness.start,
        hitInside: caret.offsetNode === node,
        hitOffset: caret.offset,
        utf16Offset: rawPrefix.length,
        prefixText: rawPrefix,
        elementBoundary: elementRange.cloneContents().textContent.length,
        focus,
        nativeCaretAvailable:
          typeof document.caretPositionFromPoint === "function",
      };
    }, scale);
    assert.equal(actual.text, actual.expectedText);
    assert.equal(actual.hitInside, true);
    assert.equal(actual.hitOffset, 1);
    assert.equal(actual.utf16Offset, actual.expectedStart + 1);
    assert.equal(actual.prefixText, actual.text.slice(0, actual.utf16Offset));
    assert.equal(actual.elementBoundary, actual.expectedStart);
    assert.deepEqual(actual.focus, {
      sameNode: true,
      offset: 1,
      anchorOffset: 3,
      rangeCount: 1,
    });
    cases.push(actual);
  }
  await page.screenshot({ path: path.join(output, "native-position.png") });
  await page.evaluate(() => window.nativeWitness.unmount());
  assert.equal(await page.locator("code").count(), 0);
  assert.deepEqual(pageErrors, []);
  console.log(
    JSON.stringify(
      {
        kind: "A native DOM capability on existing SourceView",
        browser: browser.version(),
        cases,
        passed: cases.length,
        pageErrors,
        productionInteractionExecuted: false,
        nativeSelectionWasSetByHarness: true,
        realInputEventsExecuted: false,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
}
