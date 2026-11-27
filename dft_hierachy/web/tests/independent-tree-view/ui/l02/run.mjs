import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { cases } from "./cases.mjs";
import { rawKinds } from "./public-command-fault.mjs";
import { describeFailure, releaseStages } from "../resource-cleanup.mjs";
const self = process.argv.includes("--self-check");
if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify(
      {
        count: cases.length,
        direct: 42,
        late: 6,
        boundary:
          "approved L7 public-boundary injection; NOT original L6 Promise/Core failure",
        cases: cases.map(({ run, ...metadata }) => metadata),
      },
      null,
      2,
    ),
  );
} else {
  const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT ?? ".");
  const dependencyRoot = path.resolve(import.meta.dirname, "../../c76/browser");
  const require = createRequire(path.join(dependencyRoot, "package.json"));
  const result = {
    kind: self ? "L02-browser-adapter-controls-only" : "L02-production-UI-gate",
    node: process.version,
    product,
    plannedProductionCases: cases.length,
    executedProductionCases: 0,
    executedControls: 0,
    skippedCases: 0,
    results: [],
  };
  let browser, server, page, port;
  try {
    assert.equal(
      process.versions.node.split(".")[0],
      "24",
      "use configured Node 24",
    );
    assert.ok(
      process.env.HIER_B_PRODUCT_ROOT,
      "explicit B fixed source required",
    );
    const { build } = require("esbuild"),
      { chromium } = require("playwright");
    const inputs = await Promise.all([
      fs.readFile(path.join(dependencyRoot, "fixture.jsx"), "utf8"),
      fs.readFile(new URL("../fixture-overlay.jsx", import.meta.url), "utf8"),
      fs.readFile(new URL("./fixture.jsx", import.meta.url), "utf8"),
    ]);
    const alias = Object.fromEntries(
      ["client", "viewmodel", "protocol-types", "views"].map((name) => [
        "@hier/" + name,
        path.join(product, "web/packages", name, "dist/index.js"),
      ]),
    );
    alias["@B/l02-fault"] = path.join(
      import.meta.dirname,
      "public-command-fault.mjs",
    );
    alias["@B/l02-mount-witness"] = path.join(
      import.meta.dirname,
      "c81/mount-witness.mjs",
    );
    for (const name of ["react", "react-dom"])
      alias[name] = path.dirname(require.resolve(name + "/package.json"));
    const bundle = await build({
      stdin: {
        contents: inputs.join("\n"),
        resolveDir: dependencyRoot,
        sourcefile: "B-L02-actual-model-public-boundary.jsx",
        loader: "jsx",
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      target: "es2022",
      alias,
      nodePaths: [path.join(dependencyRoot, "node_modules")],
      define: { "process.env.NODE_ENV": '"development"' },
    });
    assert.deepEqual(bundle.warnings, []);
    result.buildWarnings = bundle.warnings;
    server = http.createServer((req, res) => {
      if (req.url === "/app.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(bundle.outputFiles[0].contents);
      } else if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          '<!doctype html><meta charset="utf-8"><title>B L02 independent boundary</title><div id="probe-root"></div><div id="view-root"></div><div id="ui-view-1"></div><div id="ui-view-2"></div><script type="module" src="/app.js"></script>',
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    browser = await chromium.launch({ headless: true });
    result.browser = browser.version();
    const open = async () => {
      const p = await browser.newPage({
        viewport: { width: 900, height: 900 },
      });
      p.setDefaultTimeout(10000); // test watchdog, not product performance budget
      await p.goto("http://127.0.0.1:" + port);
      await p.waitForFunction(() => window.L02 !== undefined);
      return p;
    };
    page = await open();
    result.productionCapable = await page.evaluate(() => window.L02.capable);
    result.stage = "production-export-capability";
    if (!self)
      assert.equal(
        result.productionCapable,
        true,
        "real @hier/views lacks HierarchyTree; 48 semantics unexecuted, not skipped or failed individually",
      );
    await page.close();
    page = undefined;
    const selected = self
      ? ["select", "loadRoots"].flatMap((command) =>
          rawKinds.map((kind) => ({
            id: `L02-browser-adapter-${command}-${kind}`,
            run: async (p) => {
              await p.evaluate((input) => window.L02.setup(input), {
                command,
                kind,
                mode: "absent",
              });
              const probe = await p.evaluate(() => window.L02.probe());
              assert.equal(probe.rejected, true);
              assert.equal(probe.sameRaw, true);
              const s = probe.state;
              assert.equal(s.probes, 0);
              assert.equal(s.callCount, 1);
              assert.equal(s.calls[0].injected, true);
              assert.equal(s.calls[0].delegateSucceeded, true);
              assert.equal(s.calls[0].checkpoint, true);
              assert.equal(s.calls[0].inCall, false);
              assert.equal(s.after.root, "success");
              assert.equal(s.unhandled, 0);
              assert.equal(s.unexpectedWindowErrors, 0);
              assert.equal(s.callbacks.length, 0);
              if (command === "select") {
                assert.equal(s.after.selection.origin, "tree");
                assert.deepEqual(s.after.selection.items, [
                  { ref: "B-mixed-root" },
                ]);
                assert.equal(s.after.back, true);
                assert.equal(s.after.forward, false);
                assert.deepEqual(s.after.queries, ["inst.roots"]);
              } else {
                assert.equal(s.calls[0].newPromise, true);
                assert.deepEqual(s.after.selection, s.before.selection);
                assert.equal(s.after.forward, s.before.forward);
                assert.deepEqual(s.after.queries, ["inst.roots"]);
              }
              return {
                rawIdentity: true,
                rawProbes: 0,
                realCommit: true,
                productionUI: false,
              };
            },
          })),
        )
      : cases;
    result.stage = self
      ? "browser-adapter-controls"
      : "production-browser-semantics";
    for (const c of selected) {
      page = await open();
      try {
        const observation = await c.run(page);
        result.results.push({ id: c.id, pass: true, observation });
      } catch (error) {
        result.results.push({
          id: c.id,
          pass: false,
          error: describeFailure(error),
        });
      } finally {
        const ownPage = page;
        const cleanup = await releaseStages([
          [
            c.id + ".shutdown",
            async () => {
              const r = await ownPage.evaluate(() => window.L02.shutdown());
              assert.equal(r.allDisposed, true);
              assert.equal(r.descriptorsRestored, true);
              assert.equal(r.rawProbes, 0);
              assert.ok(
                r.all.every(
                  (c) => c.messageListeners === 0 && c.closeListeners === 0,
                ),
              );
            },
          ],
          [c.id + ".page.close", () => ownPage.close()],
        ]);
        for (const { stage, error } of cleanup.errors)
          result.results.push({
            id: c.id + "-cleanup",
            stage,
            pass: false,
            error: describeFailure(error),
          });
        page = undefined;
      }
    }
    const executed = result.results.filter(
      (r) => !r.id.endsWith("-cleanup"),
    ).length;
    if (self) result.executedControls = executed;
    else result.executedProductionCases = executed;
    assert.equal(
      result.results.filter((r) => !r.pass).length,
      0,
      "independent L02 failures",
    );
    result.exitCode = 0;
  } catch (error) {
    result.exitCode = 1;
    result.error = describeFailure(error);
  } finally {
    const closeServer = async () => {
      if (!server?.listening) return;
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    };
    const cleanup = await releaseStages([
      ["page.shutdown", () => page?.evaluate(() => window.L02.shutdown())],
      ["page.close", () => page?.close()],
      ["browser.close", () => browser?.close()],
      [
        "browser.close-retry",
        () => (browser?.isConnected() ? browser.close() : undefined),
      ],
      ["server.close", closeServer],
      ["server.close-retry", closeServer],
    ]);
    result.cleanupErrors = cleanup.errors.map(({ stage, error }) => ({
      stage,
      error: describeFailure(error),
    }));
    result.browserDisconnected = !browser?.isConnected();
    result.serverStopped = !server?.listening;
    result.portRebound = false;
    if (port && result.serverStopped) {
      const rebound = http.createServer();
      try {
        await new Promise((resolve, reject) => {
          rebound.once("error", reject);
          rebound.listen(port, "127.0.0.1", resolve);
        });
        result.portRebound = true;
      } catch (error) {
        result.cleanupErrors.push({
          stage: "port-rebind",
          error: describeFailure(error),
        });
      } finally {
        if (rebound.listening)
          await new Promise((resolve) => rebound.close(resolve));
      }
    }
    if (
      result.cleanupErrors.length ||
      !result.browserDisconnected ||
      !result.serverStopped
    )
      result.exitCode = 1;
    process.exitCode = result.exitCode;
    console.log(JSON.stringify(result, null, 2));
  }
}
