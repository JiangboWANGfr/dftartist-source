import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { cases as generalCases } from "./cases.mjs";
import { cases as contextMenuCases } from "./context-menu-cases.mjs";
import { cases as c76Cases } from "../c76/browser/cases.mjs";
import { coreCases } from "./core-cases.mjs";
import { coreBridge } from "./core-bridge.mjs";
import { describeFailure, releaseStages } from "./resource-cleanup.mjs";
import {
  clearExpansionTarget,
  configureExpansionTarget,
  isExpansionLocatorPrecondition,
  requireExpansionTarget,
} from "./expansion-target.mjs";
const c76Map = {
  "C76-01": ["I01", "I02", "I03"],
  "C76-02": ["I01", "I02", "L13"],
  "C76-03": ["I04", "I05"],
  "C76-04": ["L01", "L04"],
  "C76-05": ["L01", "I12"],
  "C76-06": ["I09", "I10"],
  "C76-07": ["I11", "K08", "L08"],
  "C76-08": ["I07", "L07"],
  "C76-09": ["L04", "L07"],
  "C76-10": ["L03", "L07"],
  "C76-11": ["L05"],
  "C76-12": ["L09", "L10", "L11"],
  "C76-13": ["L09", "L10", "L11"],
};
const originalCases = [
  ...c76Cases.map((c) => ({
    ...c,
    covers: c76Map[c.id.slice(0, 6)] ?? [],
    limitations: c.id.startsWith("C76-13")
      ? [
          "C-77: late-feedback suppression only; view-owned rejection-handler registration/consumption remains unverified",
        ]
      : [],
  })),
  ...generalCases,
  ...coreCases,
];
const contextMenu = process.argv.includes("--c102");
const cases = contextMenu ? contextMenuCases : originalCases;
assert.equal(
  new Set(cases.map((c) => c.id)).size,
  cases.length,
  "unique executable case ids",
);
const self = process.argv.includes("--self-check"),
  coreSelf = process.argv.includes("--core-self-check");
const manifest = {
  count: cases.length,
  c76: contextMenu ? 0 : c76Cases.length,
  general: contextMenu ? cases.length : generalCases.length,
  core: contextMenu ? 0 : coreCases.length,
  cases: cases.map(({ run, ...metadata }) => metadata),
};
if (process.argv.includes("--list")) {
  console.log(JSON.stringify(manifest, null, 2));
} else {
  const product = path.resolve(
    process.env.HIER_B_PRODUCT_ROOT ??
      path.join(import.meta.dirname, "../../../.."),
  );
  // New tests reuse only the frozen B isolated test toolchain, never A's experiment dependencies.
  const dependencyRoot = path.join(import.meta.dirname, "../c76/browser");
  const require = createRequire(path.join(dependencyRoot, "package.json"));
  const { build } = require("esbuild"),
    { chromium } = require("playwright");
  const aliases = Object.fromEntries(
    ["client", "viewmodel", "protocol-types", "views"].map((name) => [
      "@hier/" + name,
      path.join(product, "web/packages", name, "dist/index.js"),
    ]),
  );
  for (const name of ["react", "react-dom"])
    aliases[name] = path.dirname(require.resolve(name + "/package.json"));
  const result = {
    kind: coreSelf
      ? "real-Core-bridge-self-check-only"
      : self
        ? "new-fixture-self-check-only"
        : "full-production-UI-gate",
    node: process.version,
    product,
    plannedCases: cases.length,
    plannedC76: contextMenu ? 0 : c76Cases.length,
    plannedGeneral: contextMenu ? cases.length : generalCases.length,
    plannedCore: contextMenu ? 0 : coreCases.length,
    executedCases: 0,
    skippedCases: 0,
    unexecutedTestPreconditions: 0,
    results: [],
  };
  const bridge = await coreBridge(product);
  let server, browser, page;
  try {
    const original = await fs.readFile(
      path.join(dependencyRoot, "fixture.jsx"),
      "utf8",
    );
    const overlay = await fs.readFile(
      path.join(import.meta.dirname, "fixture-overlay.jsx"),
      "utf8",
    );
    const bundle = await build({
      stdin: {
        contents: original + "\n" + overlay,
        resolveDir: dependencyRoot,
        sourcefile: "B-readonly-fixture-plus-overlay.jsx",
        loader: "jsx",
      },
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      alias: aliases,
      nodePaths: [path.join(dependencyRoot, "node_modules")],
      define: { "process.env.NODE_ENV": '"development"' },
    });
    result.buildWarnings = bundle.warnings;
    server = http.createServer(async (req, res) => {
      if (await bridge.route(req, res)) return;
      if (req.url === "/app.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(bundle.outputFiles[0].contents);
      } else if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          '<!doctype html><meta charset="utf-8"><title>B full UI host</title><style>body{margin:8px}#ui-view-1,#ui-view-2{width:620px}</style><div id="probe-root"></div><div id="view-root"></div><div id="ui-host"><button id="ui-before">Before hierarchy</button><div id="ui-view-1"></div><button id="ui-after">After hierarchy</button><div id="ui-view-2"></div></div><script type="module" src="/app.js"></script>',
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
        viewport: { width: 900, height: 900 },
      });
      p.setDefaultTimeout(10000); // deadlock watchdog, not product performance budget
      await p.goto(url);
      await p.waitForFunction(() => window.UI !== undefined);
      return p;
    }
    page = await open();
    result.productionCapable = await page.evaluate(() => window.UI.capable);
    if (self) {
      const checks = [];
      for (const dataset of ["mixed", "wide", "deep", "empty"]) {
        await page.evaluate((dataset) => window.UI.setup({ dataset }), dataset);
        const initial = await page.evaluate(() => window.UI.state());
        assert.equal(initial.root, "idle");
        assert.equal(initial.rows.length, 1);
        assert.equal(initial.queries.length, 0);
        const loaded = await page.evaluate(() => window.UI.seed(true));
        assert.equal(loaded.root, "success");
        if (dataset === "mixed") {
          assert.equal(
            loaded.rows.filter((r) => r.kind === "instance").length,
            7,
          );
          assert.ok(
            loaded.rows.some(
              (r) => r.kind === "scope" && r.label === "g.with.dot",
            ),
          );
          assert.equal(
            loaded.queries.filter((q) => q.method === "inst.children").length,
            3,
          );
          await page.evaluate(() =>
            window.UI.external([
              {
                ref: "B-port-target",
                bits: { lsb: 1, width: 2 },
                side: "inside",
              },
            ]),
          );
          const before = await page.evaluate(() => window.UI.state());
          await page.evaluate(() =>
            window.UI.command("reveal", "B-port-target"),
          );
          const after = await page.evaluate(() => window.UI.state());
          assert.equal(after.reveal.status, "success");
          assert.equal(
            after.rows.find((r) => r.id === after.reveal.rowId).ref,
            "B-child-e",
          );
          assert.deepEqual(after.selection, before.selection);
          await page.evaluate(() => window.UI.hold("inst.children"));
          const root = after.rows.find((r) => r.ref === "B-mixed-root");
          await page.evaluate((id) => window.UI.start("reload", id), root.id);
          assert.equal(
            (await page.evaluate(() => window.UI.state())).rows.find(
              (r) => r.ref === "B-mixed-root",
            ).children.status,
            "pending",
          );
          await page.evaluate(() => window.UI.release("inst.children", true));
          assert.deepEqual(await page.evaluate(() => window.UI.pending()), {
            ok: false,
            code: "not_found",
          });
          await page.evaluate(() =>
            window.UI.start(
              "loadMore",
              window.UI.state().rows.find((r) => r.ref === "B-mixed-root").id,
            ),
          );
          await page.evaluate(() => window.UI.release("inst.children"));
          assert.deepEqual(await page.evaluate(() => window.UI.pending()), {
            ok: true,
          });
          await page.evaluate(() => window.UI.faultPoison());
          const fault = await page.evaluate(() => {
            try {
              window.UI.external([{ ref: "B-child-a" }]);
              return { threw: false };
            } catch (error) {
              return {
                threw: error instanceof AggregateError,
                inner: error.errors.length === 1,
              };
            }
          });
          assert.deepEqual(fault, { threw: true, inner: true });
          assert.equal(
            (await page.evaluate(() => window.UI.state())).poisonReads,
            0,
          );
        }
        if (dataset === "wide") {
          assert.equal(loaded.rows.length, 5001);
          assert.equal(loaded.queries.length, 1);
        }
        if (dataset === "deep") {
          assert.equal(loaded.rows.length, 122);
          assert.equal(
            loaded.rows.filter((r) => r.kind === "instance").length,
            121,
          );
          assert.equal(loaded.rows.at(-1).kind, "status");
          assert.equal(loaded.rows.at(-1).depth, 121);
          assert.equal(loaded.rows.at(-1).page, "pending");
          assert.equal(loaded.queries.length, 122);
        }
        if (dataset === "empty") assert.deepEqual(loaded.rows, []);
        if (dataset === "empty") {
          const subscriptions = await page.evaluate(() =>
            window.UI.probeSubscriptions(),
          );
          assert.deepEqual(subscriptions, {
            delivered: 2,
            activeTree: 0,
            activeSelection: 0,
            reentrant: 0,
          });
        }
        assert.equal(loaded.unhandled, 0);
        checks.push({
          dataset,
          rows: loaded.rows.length,
          queries: loaded.queries.length,
        });
      }
      await page.evaluate(() =>
        window.UI.setup({ dataset: "paged", pageSize: 40 }),
      );
      await page.evaluate(() => window.UI.seed());
      await page.evaluate(() =>
        window.UI.command("setExpanded", window.UI.state().rows[0].id, true),
      );
      const paged = await page.evaluate(() => window.UI.state());
      assert.equal(paged.rows.length, 42);
      assert.equal(paged.rows.at(-1).page, "success");
      assert.equal(paged.rows.at(-1).statusState.next, "B-page/opaque.40");
      checks.push({
        dataset: "paged",
        rows: paged.rows.length,
        queries: paged.queries.length,
      });
      await page.evaluate(() => window.UI.setup({ hold: ["inst.children"] }));
      await page.evaluate(() => window.UI.seed());
      await page.evaluate(() => {
        window.UI.independentChildren("B-mixed-root");
        window.UI.start("setExpanded", window.UI.state().rows[0].id, true);
      });
      await page.evaluate(() =>
        window.UI.command("cancel", window.UI.state().rows[0].id),
      );
      assert.deepEqual(await page.evaluate(() => window.UI.pending()), {
        ok: false,
        code: "cancelled",
      });
      assert.equal(
        (await page.evaluate(() => window.UI.state())).wireCancels,
        0,
      );
      await page.evaluate(() => window.UI.release("inst.children"));
      const independent = await page.evaluate(() =>
        window.UI.independentResult(),
      );
      assert.equal(independent.items[0].ref, "B-child-a");
      // Public reload may remove all rows; this is not a fake UI focus test.
      await page.evaluate(() => window.UI.emptyReload());
      assert.equal(
        (await page.evaluate(() => window.UI.state())).rows.length,
        0,
      );
      // Real React/browser event control from unchanged C76, never a fake HierarchyTree.
      await page.evaluate(() => window.B.control());
      await page.evaluate(() => window.B.settle());
      const button = page.locator("#B-fixture-probe");
      assert.equal(await button.count(), 1);
      await button.click();
      await page.evaluate(() => window.B.settle());
      const control = await page.evaluate(() => window.B.controlState());
      assert.deepEqual(control, { mounts: 2, cleanups: 1, clicks: 1 });
      const release = await page.evaluate(() => window.UI.shutdown());
      assert.equal(release.allDisposed, true);
      assert.equal(release.cleanups, 2);
      assert.ok(
        release.all.every(
          (c) => c.messageListeners === 0 && c.closeListeners === 0,
        ),
      );
      result.fixtureChecks = {
        checks,
        control,
        controlAfterRelease: {
          mounts: release.mounts,
          cleanups: release.cleanups,
          clicks: release.clicks,
        },
        allReleased: true,
        independentWaiterAndEmptyReload: true,
        productComponentMounted: false,
      };
    } else if (coreSelf) {
      await page.evaluate(() => window.UI.coreSetup());
      await page.evaluate(() => window.UI.seed());
      const roots = await page.evaluate(() => window.UI.state());
      assert.deepEqual(
        roots.rows.map((r) => r.name),
        ["b_tree_other", "b_tree_top"],
      );
      const target = await page.evaluate(() => window.UI.coreTarget());
      await page.evaluate(
        (x) =>
          window.UI.external([
            { ref: x.port, bits: { lsb: 0, width: 1 }, side: "outside" },
          ]),
        target,
      );
      const before = await page.evaluate(() => window.UI.state());
      await page.evaluate(
        (ref) => window.UI.command("reveal", ref),
        target.port,
      );
      const after = await page.evaluate(() => window.UI.state());
      assert.equal(after.reveal.status, "success");
      assert.deepEqual(
        after.rows.find((r) => r.id === after.reveal.rowId).path,
        ["b_tree_top", "g[2]", "left", "child"],
      );
      assert.deepEqual(after.selection, before.selection);
      await page.evaluate(() => window.UI.shutdown());
      await page.evaluate(() => window.UI.coreSetup());
      const reopened = await page.evaluate(() => window.UI.state());
      assert.notEqual(reopened.snapshotId, before.snapshotId);
      assert.equal(reopened.root, "idle");
      assert.equal(reopened.all[0].messageListeners, 0);
      assert.equal(reopened.all[0].closeListeners, 0);
      await page.evaluate(() => window.UI.shutdown());
      result.fixtureChecks = {
        actualCore: true,
        rows: after.rows.length,
        queries: after.queries.length,
        realReopenAndSnapshotIsolation: true,
        productComponentMounted: false,
      };
    } else {
      result.stage = "production-export-capability";
      assert.equal(
        result.productionCapable,
        true,
        "real @hier/views lacks HierarchyTree; semantics remain unexecuted, not skipped or passed",
      );
      result.stage = "test-expansion-locator-precondition";
      if (process.env.HIER_B_EXPANSION_ADAPTER) {
        const adapter = await import(
          pathToFileURL(path.resolve(process.env.HIER_B_EXPANSION_ADAPTER))
        );
        configureExpansionTarget(adapter.locateExpansionTarget);
      }
      requireExpansionTarget();
      await page.close();
      page = undefined;
      result.stage = "production-browser-semantics";
      for (const c of cases) {
        page = await open();
        try {
          await c.run(page, page.context());
          const namespace = c.id.startsWith("C76-") ? "B" : "UI";
          const s = await page.evaluate((ns) => window[ns].state(), namespace);
          assert.equal(s.unhandled, 0);
          assert.equal(s.unexpectedWindowErrors, 0);
          result.results.push({ id: c.id, pass: true });
        } catch (error) {
          result.results.push({
            id: c.id,
            pass: false,
            testPrecondition: isExpansionLocatorPrecondition(error),
            error: describeFailure(error),
          });
        } finally {
          const ownPage = page;
          const released = await releaseStages([
            [
              c.id + ".shutdown",
              async () => {
                const state = await ownPage.evaluate(() =>
                  window.UI.shutdown(),
                );
                assert.equal(state.allDisposed, true);
              },
            ],
            [c.id + ".page.close", () => ownPage.close()],
          ]);
          for (const { stage, error } of released.errors) {
            result.results.push({
              id: c.id + "-cleanup",
              stage,
              pass: false,
              error: describeFailure(error),
            });
          }
          page = undefined;
        }
      }
      result.executedCases = result.results.filter(
        (x) => !x.id.endsWith("-cleanup") && !x.testPrecondition,
      ).length;
      result.unexecutedTestPreconditions = result.results.filter(
        (x) => !x.id.endsWith("-cleanup") && x.testPrecondition,
      ).length;
      assert.equal(
        result.results.filter((x) => !x.pass).length,
        0,
        "production semantic failures",
      );
    }
    result.exitCode = 0;
  } catch (error) {
    result.exitCode = 1;
    process.exitCode = 1;
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
      ["page.shutdown", () => page?.evaluate(() => window.UI.shutdown())],
      ["page.close", () => page?.close()],
      ["browser.close", () => browser?.close()],
      [
        "browser.close-retry",
        () => (browser?.isConnected() ? browser.close() : undefined),
      ],
      ["bridge.close", () => bridge.close()],
      ["server.close", closeServer],
      ["server.close-retry", closeServer],
      [
        "core.report",
        () => {
          result.coreSessions = bridge.summary();
        },
      ],
      [
        "resource-state",
        () => {
          result.closedOwnBrowserServerAndCore =
            (!page || page.isClosed()) &&
            (!browser || !browser.isConnected()) &&
            (!server || !server.listening) &&
            Array.isArray(result.coreSessions) &&
            result.coreSessions.every(
              (s) =>
                s.closed &&
                s.exit &&
                !s.pollWaiting &&
                s.buffered === 0 &&
                s.pollListenerReleased &&
                s.messageListenerReleased &&
                s.closeListenerReleased,
            );
          assert.equal(result.closedOwnBrowserServerAndCore, true);
        },
      ],
      [
        "core.exit",
        () => {
          for (const s of result.coreSessions ?? [])
            assert.deepEqual(
              s.exit,
              { code: 0, signal: null },
              "own Core exit",
            );
        },
      ],
      ["test.expansion-locator.clear", clearExpansionTarget],
    ]);
    result.cleanupAttempted = cleanup.attempted;
    result.cleanupErrors = cleanup.errors.map(({ stage, error }) => ({
      stage,
      ...describeFailure(error),
    }));
    if (cleanup.errors.length) {
      result.cleanupError = result.cleanupErrors[0];
      result.exitCode = 1;
      process.exitCode = 1;
    }
    console.log(JSON.stringify(result, null, 2));
  }
}
