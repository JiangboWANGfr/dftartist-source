import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test, { before, after } from "node:test";

const legacy = process.env.HIER_B_C79_LOCATOR_MODE === "legacy";
const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT ?? ".");
const dependencyRoot = path.join(import.meta.dirname, "../c76/browser");
const require = createRequire(path.join(dependencyRoot, "package.json"));
const { build } = require("esbuild"),
  { chromium } = require("playwright");
let browser, server, page, adapter, oldClick;
before(async () => {
  if (legacy) {
    const source = execFileSync(
      "git",
      [
        "show",
        "c9256dd1abad9ef4cba59e532b5069e3c041480a:web/tests/independent-tree-view/ui/cases.mjs",
      ],
      { encoding: "utf8" },
    );
    const start = source.indexOf(
      "    const controls = await r.locator.evaluate(",
    );
    const end = source.indexOf("    await settle(page);", start);
    assert.ok(start >= 0 && end > start);
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    oldClick = new AsyncFunction("r", "assert", source.slice(start, end));
  } else adapter = await import("./expansion-target.mjs");
  const contents =
    (await fs.readFile(path.join(dependencyRoot, "fixture.jsx"), "utf8")) +
    "\n" +
    (await fs.readFile(
      new URL("./fixture-overlay.jsx", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await fs.readFile(
      new URL("./c79-locator-control.jsx", import.meta.url),
      "utf8",
    ));
  const alias = Object.fromEntries(
    ["client", "viewmodel", "protocol-types", "views"].map((name) => [
      "@hier/" + name,
      path.join(product, "web/packages", name, "dist/index.js"),
    ]),
  );
  for (const name of ["react", "react-dom"])
    alias[name] = path.dirname(require.resolve(name + "/package.json"));
  const bundle = await build({
    stdin: {
      contents,
      resolveDir: dependencyRoot,
      sourcefile: "B-C79-real-model-control.jsx",
      loader: "jsx",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    alias,
    nodePaths: [path.join(dependencyRoot, "node_modules")],
    define: { "process.env.NODE_ENV": '"development"' },
  });
  assert.deepEqual(bundle.warnings, []);
  server = http.createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type":
        req.url === "/app.js" ? "application/javascript" : "text/html",
    });
    res.end(
      req.url === "/app.js"
        ? bundle.outputFiles[0].contents
        : '<!doctype html><title>B C79 locator contrast</title><div id="probe-root"></div><div id="view-root"></div><div id="ui-view-1"></div><div id="ui-view-2"></div><div id="c79-root"></div><script type="module" src="/app.js"></script>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.C79 !== undefined);
  console.log(
    JSON.stringify({
      mode: legacy ? "original-locator-fragment" : "explicit-B-locator",
      browser: browser.version(),
      productionHierarchyTreeMounted: false,
    }),
  );
});
after(async () => {
  let error,
    cleanupFailed = false;
  try {
    if (page && !page.isClosed()) {
      const released = await page.evaluate(async () => {
        window.C79.unmount();
        return window.UI.shutdown();
      });
      assert.equal(released.allDisposed, true);
      assert.ok(
        released.all.every(
          (c) => c.messageListeners === 0 && c.closeListeners === 0,
        ),
      );
    }
  } catch (value) {
    error = value;
    cleanupFailed = true;
  } finally {
    adapter?.clearExpansionTarget();
    try {
      if (browser) await browser.close();
    } finally {
      if (server?.listening)
        await new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        });
    }
  }
  console.log(
    JSON.stringify({
      ownBrowserDisconnected: !browser?.isConnected(),
      ownServerStopped: !server?.listening,
      productionSemantics: 0,
    }),
  );
  if (cleanupFailed) throw error;
});
async function setup(shape) {
  const initial = await page.evaluate(
    (shape) => window.C79.setup(shape),
    shape,
  );
  const row = page.getByRole("treeitem");
  assert.equal(await row.count(), 1);
  console.log(
    JSON.stringify({
      shape,
      observedDOM: await page.locator("#c79-root").innerHTML(),
    }),
  );
  return { ...initial, row, page };
}
async function unchanged(initial) {
  const state = await page.evaluate(() => window.C79.settle());
  assert.deepEqual(state.selection, initial.state.selection);
  assert.equal(state.back, initial.state.back);
  assert.equal(state.forward, initial.state.forward);
  assert.equal(state.calls.length, initial.state.calls.length);
}
for (const shape of ["button", "span", "two-buttons", "row-region"])
  test("C79 explicit expansion locator shape " + shape, async () => {
    const initial = await setup(shape);
    if (legacy) await oldClick({ locator: initial.row }, assert);
    else {
      adapter.configureExpansionTarget(({ row }) =>
        shape === "row-region"
          ? { target: row, clickOptions: { position: { x: 6, y: 14 } } }
          : { target: row.getByText("Toggle children", { exact: true }) },
      );
      await adapter.clickExpansionTarget(initial);
    }
    const state = await page.evaluate(() => window.C79.settle());
    assert.deepEqual(state.selection, initial.state.selection);
    assert.equal(state.back, initial.state.back);
    assert.equal(state.forward, initial.state.forward);
    assert.deepEqual(
      state.calls.slice(initial.state.calls.length).map((c) => c.name),
      ["setExpanded"],
    );
    assert.equal(state.rows.find((r) => r.id === initial.rowId).expanded, true);
    assert.equal(await initial.row.getAttribute("aria-expanded"), "true");
  });
if (!legacy) {
  for (const fault of [
    "unconfigured",
    "missing",
    "ambiguous",
    "outside",
    "invalid-result",
  ])
    test(
      "C79 locator precondition " + fault + " never clicks or calls model",
      async () => {
        const initial = await setup("two-buttons");
        adapter.clearExpansionTarget();
        if (fault !== "unconfigured")
          adapter.configureExpansionTarget(({ page, row }) =>
            fault === "missing"
              ? { target: row.getByText("Missing", { exact: true }) }
              : fault === "ambiguous"
                ? { target: row.locator("button") }
                : fault === "outside"
                  ? {
                      target: page.getByText("Outside control", {
                        exact: true,
                      }),
                    }
                  : null,
          );
        await assert.rejects(adapter.clickExpansionTarget(initial), {
          code: "B_TEST_EXPANSION_LOCATOR_PRECONDITION",
        });
        await unchanged(initial);
      },
    );
  test("C79 invalid locator configuration rejected before use", () => {
    adapter.clearExpansionTarget();
    assert.throws(() => adapter.configureExpansionTarget(null), TypeError);
  });
}
