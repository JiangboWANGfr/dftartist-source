// Runs the actual B transition body in a real React marker HOST, never a view substitute.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { transitionSource } from "./transition-source.mjs";
import { describeFailure, releaseStages } from "../../resource-cleanup.mjs";
const dependencyRoot = path.resolve(
  import.meta.dirname,
  "../../../c76/browser",
);
const require = createRequire(path.join(dependencyRoot, "package.json"));
const { build } = require("esbuild"),
  { chromium } = require("playwright");
const result = {
  kind: "C81-real-React-host-controls-NOT-HierarchyTree",
  executedProductionCases: 0,
  skippedCases: 0,
  results: [],
};
let browser, server, page, port;
try {
  assert.equal(process.versions.node.split(".")[0], "24");
  const alias = {
    "@B/witness": path.join(import.meta.dirname, "mount-witness.mjs"),
  };
  for (const name of ["react", "react-dom"])
    alias[name] = path.dirname(require.resolve(name + "/package.json"));
  const bundle = await build({
    stdin: {
      loader: "jsx",
      resolveDir: dependencyRoot,
      contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { flushSync } from "react-dom";
      import { createMountWitness } from "@B/witness";
      const uiViews = new Map(), l02Witness = createMountWitness(React);
      let active;
      function uiMount(options = {}, number = 1) {
        const old = uiViews.get(number);
        const v = old ?? {root: createRoot(document.getElementById("host")), c: active};
        v.c = active; uiViews.set(number, v);
        flushSync(() => v.root.render(<l02Witness.Frame><span>{v.c.label}</span></l02Witness.Frame>));
      }
      function uiUnmount(number = 1) {
        const v = uiViews.get(number);
        if (v) {flushSync(() => v.root.unmount()); uiViews.delete(number);}
      }
      ${transitionSource()}
      window.C81 = {
        async run({command, kind}) {
          const s = {c: {label:"old-host"}, replacement: {label:"new-host"}};
          active = s.c; uiMount();
          const initial = l02Witness.read(uiViews.get(1), s.c);
          if(command === "select") await new Promise(resolve => queueMicrotask(() => {l02Transition(s, kind); resolve();}));
          else {
            let release;
            const held = new Promise(resolve => {release=resolve;});
            l02Transition(s, kind); release(); await held;
          }
          return {initial, witness:s.transitionWitness, text:document.getElementById("host").textContent};
        },
        cleanup() {uiUnmount(); return l02Witness.read(undefined, null);}
      };
    `,
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
  result.buildWarnings = bundle.warnings;
  server = http.createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type":
        req.url === "/app.js" ? "application/javascript" : "text/html",
    });
    res.end(
      req.url === "/app.js"
        ? bundle.outputFiles[0].contents
        : '<!doctype html><div id="host"></div><script type="module" src="/app.js"></script>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  browser = await chromium.launch({ headless: true });
  result.browser = browser.version();
  for (const command of ["select", "loadRoots"])
    for (const kind of ["unmount", "replace", "remount"]) {
      const id = `C81-host-${command}-${kind}`;
      page = await browser.newPage();
      let observation;
      try {
        await page.goto(`http://127.0.0.1:${port}`);
        await page.waitForFunction(() => window.C81 !== undefined);
        observation = await page.evaluate((input) => window.C81.run(input), {
          command,
          kind,
        });
        const { initial, witness: w, text } = observation;
        assert.notEqual(initial.rootId, null);
        assert.notEqual(initial.mountToken, null);
        assert.deepEqual(w.before, initial);
        assert.equal(w.before.oldModel, true);
        assert.equal(
          w.sameRoot,
          kind === "replace",
          "replace must preserve actual React root",
        );
        assert.equal(
          w.sameMount,
          kind === "replace",
          "replace must preserve actual React Frame mount",
        );
        assert.equal(w.after.mounts, kind === "remount" ? 2 : 1);
        assert.equal(w.after.cleanups, kind === "replace" ? 0 : 1);
        assert.equal(
          w.after.oldModel,
          kind === "unmount" ? null : kind === "remount",
        );
        assert.equal(
          text,
          kind === "unmount"
            ? ""
            : kind === "replace"
              ? "new-host"
              : "old-host",
        );
        result.results.push({ id, pass: true, observation });
      } catch (error) {
        result.results.push({
          id,
          pass: false,
          observation,
          error: describeFailure(error),
        });
      } finally {
        const cleanup = await releaseStages([
          [
            id + ".react-cleanup",
            async () => {
              const state = await page.evaluate(() => window.C81.cleanup());
              assert.equal(state.liveToken ?? state.mountToken, null);
              assert.equal(state.mounts, state.cleanups);
            },
          ],
          [id + ".page.close", () => page.close()],
        ]);
        for (const { stage, error } of cleanup.errors)
          result.results.push({
            id: id + "-cleanup",
            stage,
            pass: false,
            error: describeFailure(error),
          });
        page = undefined;
      }
    }
  result.executedControls = result.results.filter(
    (x) => !x.id.endsWith("-cleanup"),
  ).length;
  assert.equal(result.executedControls, 6);
  assert.equal(
    result.results.filter((x) => !x.pass).length,
    0,
    "C81 host control failures",
  );
  result.exitCode = 0;
} catch (error) {
  result.exitCode = 1;
  result.error = describeFailure(error);
} finally {
  const closeServer = async () => {
    if (server?.listening)
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
  };
  const cleanup = await releaseStages([
    ["page.close", () => page?.close()],
    ["browser.close", () => browser?.close()],
    ["server.close", closeServer],
  ]);
  result.cleanupErrors = cleanup.errors.map(({ stage, error }) => ({
    stage,
    error: describeFailure(error),
  }));
  result.browserDisconnected = !browser?.isConnected();
  result.serverStopped = !server?.listening;
  if (port && result.serverStopped) {
    const probe = http.createServer();
    try {
      await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(port, "127.0.0.1", resolve);
      });
      result.portRebound = true;
    } catch (error) {
      result.cleanupErrors.push({
        stage: "port-rebind",
        error: describeFailure(error),
      });
    } finally {
      if (probe.listening) await new Promise((resolve) => probe.close(resolve));
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
