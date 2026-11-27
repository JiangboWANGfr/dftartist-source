import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cases, shape } from "./cases.mjs";
import {
  heapGraph,
  reactions,
  delta,
} from "../promise-heap-diagnostic/heap.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
async function bounded(p, label) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error("B48 facility watchdog NOT product timeout: " + label),
            ),
          20000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify({ kind: "B48-known-consumers-only", cases }, null, 2),
  );
else {
  const P = process.env.HIER_B_PRODUCT_ROOT,
    T = process.env.HIER_B_BROWSER_TOOLS,
    parent = process.env.HIER_B_Q1_EVIDENCE_ROOT;
  assert(
    [P, T, parent].every((p) => p && path.isAbsolute(p)),
    "explicit fixed product/tools/owned evidence roots",
  );
  const E = fs.mkdtempSync(path.join(fs.realpathSync(parent), "event-bridge-")),
    tool = createRequire(T + "/package.json"),
    { build } = tool("esbuild"),
    { chromium } = tool("playwright");
  const result = {
    kind: "B48-real-SDK-Nav-known-React-consumer-pending-exploration",
    product: P,
    fixed: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: P,
      encoding: "utf8",
    }).trim(),
    evidence: E,
    cases: [],
    cdp: [],
    snapshots: [],
    pageErrors: [],
    cleanupErrors: [],
    planned: 7,
    executed: 0,
    passed: 0,
    failed: 0,
    candidateUIExecuted: 0,
    CoreExecuted: 0,
    ElectronExecuted: 0,
    Q1Closed: false,
    approvedObserver: false,
    formalUIOracle: false,
  };
  let browser,
    server,
    exit = 0;
  try {
    for (const [name, version] of [
      ["react", "18.3.1"],
      ["react-dom", "18.3.1"],
      ["esbuild", "0.25.11"],
      ["playwright", "1.64.1"],
    ])
      assert.equal(tool(name + "/package.json").version, version);
    result.tools = Object.fromEntries(
      ["react", "react-dom", "esbuild", "playwright"].map((n) => [
        n,
        tool(n + "/package.json").version,
      ]),
    );
    result.node = process.versions;
    result.platform = process.platform;
    result.arch = process.arch;
    const alias = Object.fromEntries(
      ["viewmodel", "client", "protocol-types"].map((n) => [
        "@hier/" + n,
        P + "/web/packages/" + n + "/dist/index.js",
      ]),
    );
    for (const n of ["react", "react-dom"])
      alias[n] = path.dirname(tool.resolve(n + "/package.json"));
    const out = await build({
      entryPoints: [path.join(import.meta.dirname, "fixture.jsx")],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      metafile: true,
      alias,
      nodePaths: [T + "/node_modules"],
      define: { "process.env.NODE_ENV": '"development"' },
    });
    assert.deepEqual(out.warnings, []);
    result.build = {
      warnings: out.warnings,
      inputs: Object.keys(out.metafile.inputs),
      bytes: out.outputFiles[0].contents.length,
      sha256: sha(out.outputFiles[0].contents),
    };
    fs.writeFileSync(E + "/fixture.js", out.outputFiles[0].contents);
    fs.writeFileSync(
      E + "/metafile.json",
      JSON.stringify(out.metafile, null, 2) + "\n",
    );
    server = http.createServer((req, res) => {
      if (req.url === "/app.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(out.outputFiles[0].contents);
      } else {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><meta charset="utf-8"><div id="ancestor"><div id="root"></div></div><script type="module" src="/app.js"></script>',
        );
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    browser = await chromium.launch({ headless: true });
    result.chromium = browser.version();
    assert.equal(result.chromium, "156.0.8078.4");
    for (const config of cases) {
      const row = { id: config.id, config, pass: false, cleanupErrors: [] };
      result.cases.push(row);
      result.executed++;
      let page,
        cdp,
        paused = false,
        execution,
        pauseListener;
      async function send(method, params = {}) {
        const started = performance.now(),
          record = { id: config.id, method, params };
        result.cdp.push(record);
        try {
          const value = await bounded(cdp.send(method, params), method);
          record.seconds = (performance.now() - started) / 1000;
          record.result = value;
          return value;
        } catch (e) {
          record.seconds = (performance.now() - started) / 1000;
          record.error = String(e.stack ?? e);
          throw e;
        }
      }
      async function snapshot(label) {
        let raw = "";
        const chunk = (e) => {
          raw += e.chunk;
        };
        cdp.on("HeapProfiler.addHeapSnapshotChunk", chunk);
        try {
          await send("HeapProfiler.takeHeapSnapshot", {
            reportProgress: false,
          });
          const file = E + "/" + config.id + "-" + label + ".heapsnapshot",
            bytes = Buffer.from(raw);
          fs.writeFileSync(file, bytes);
          result.snapshots.push({
            id: config.id,
            label,
            file,
            bytes: bytes.length,
            sha256: sha(bytes),
          });
          return heapGraph(JSON.parse(raw));
        } finally {
          cdp.off("HeapProfiler.addHeapSnapshotChunk", chunk);
        }
      }
      const evalRuntime = async (expression, awaitPromise = false) => {
        const r = await send("Runtime.evaluate", {
          expression,
          awaitPromise,
          returnByValue: true,
        });
        assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails));
        return r.result.value;
      };
      const waitPause = () =>
        new Promise((resolve) => {
          pauseListener = (event) => {
            paused = true;
            resolve(event);
          };
          cdp.once("Debugger.paused", pauseListener);
        });
      const marker = async (stop) => {
        const r = await send("Debugger.evaluateOnCallFrame", {
          callFrameId: stop.callFrames[0].callFrameId,
          expression: "__B48.marker()",
          returnByValue: true,
        });
        assert(!r.exceptionDetails);
        return r.result.value;
      };
      const stateOf = async (objectId) => {
        const r = await send("Runtime.getProperties", {
          objectId,
          ownProperties: true,
        });
        const state = r.internalProperties?.find(
          (p) => p.name === "[[PromiseState]]",
        )?.value?.value;
        assert.equal(
          state,
          "pending",
          "real original command Promise stays pending; settled is unsupported, not negative green",
        );
        return state;
      };
      try {
        page = await browser.newPage();
        page.on("pageerror", (e) =>
          result.pageErrors.push({
            id: config.id,
            error: String(e.stack ?? e),
          }),
        );
        await page.goto("http://127.0.0.1:" + server.address().port);
        await page.waitForFunction(
          () => typeof globalThis.__B48?.setup === "function",
        );
        cdp = await page.context().newCDPSession(page);
        await send("HeapProfiler.enable");
        await send("Debugger.enable");
        const version = await send("Browser.getVersion");
        result.browserInfo = version;
        assert.equal(version.jsVersion, "15.6.75");
        assert.equal(
          version.revision,
          "@f842f52ef39fd97b449eb27cff414bf05a98ddce",
        );
        assert.deepEqual(
          await evalRuntime(
            "__B48.setup(" + JSON.stringify(config) + ")",
            true,
          ),
          { candidateUI: false, ready: true },
        );
        let stopped = waitPause();
        // Do not await the event operation: its response is delivered after resume.
        execution = send("Runtime.evaluate", {
          expression: "__B48.fire()",
          awaitPromise: false,
          returnByValue: true,
        });
        execution.catch(() => {});
        const baselineStop = await bounded(
          stopped,
          "baseline before wrapper return",
        );
        row.baselinePause = baselineStop;
        row.baselineMarker = await marker(baselineStop);
        const bm = row.baselineMarker;
        assert.equal(bm.phase, "baseline");
        assert.equal(bm.received, false);
        assert.equal(bm.commands, 1);
        assert.equal(bm.receiver, true);
        assert.equal(bm.args, 0);
        assert.equal(bm.lateInstalled, false);
        assert.equal(bm.pending, true);
        assert.equal(bm.notified, true);
        assert.equal(bm.document, true);
        assert.equal(bm.selection, true);
        assert.equal(bm.integrity, true);
        assert(!bm.events.includes("consumer-received"));
        if (config.mode.startsWith("unmount-")) {
          assert.equal(bm.mounted, false);
          assert.equal(bm.domChildren, 0);
          assert(
            bm.events.indexOf("layout-cleanup") <
              bm.events.indexOf("baseline-before-return"),
          );
        } else assert.equal(bm.mounted, true);
        const before = await snapshot("baseline");
        const remote = await send("Runtime.evaluate", {
          expression: "__B48.original",
          awaitPromise: false,
          objectGroup: "B48-original",
        });
        assert(remote.result.objectId && !remote.exceptionDetails);
        const objectId = remote.result.objectId,
          id = (await send("HeapProfiler.getHeapObjectId", { objectId }))
            .heapSnapshotObjectId;
        assert.notEqual(id, "0");
        row.original = { id, state: await stateOf(objectId) };
        row.before = reactions(before, id, "pending");
        stopped = waitPause();
        await send("Debugger.resume");
        paused = false;
        const cutoffStop = await bounded(
          stopped,
          "same native event ancestor cutoff",
        );
        paused = true;
        row.cutoffPause = cutoffStop;
        row.cutoffMarkers = [await marker(cutoffStop)];
        const cm = row.cutoffMarkers[0];
        for (const field of [
          "received",
          "sameEvent",
          "pending",
          "notified",
          "document",
          "selection",
          "integrity",
        ])
          assert.equal(cm[field], true, "cutoff " + field);
        assert.equal(cm.phase, "cutoff");
        assert.equal(cm.lateInstalled, false);
        assert.equal(cm.commands, 1);
        assert(!cm.events.includes("consumer-success"));
        assert(
          cm.events.indexOf("consumer-received") <
            cm.events.indexOf("ancestor-event-tail"),
        );
        await stateOf(objectId);
        const immediate = await snapshot("cutoff-A");
        row.cutoffMarkers.push(await marker(cutoffStop));
        const repeat = await snapshot("cutoff-B-repeat");
        row.cutoffMarkers.push(await marker(cutoffStop));
        assert.deepEqual(
          row.cutoffMarkers[1],
          cm,
          "snapshot did not advance event/microtasks",
        );
        assert.deepEqual(row.cutoffMarkers[2], cm);
        row.immediate = reactions(immediate, id, "pending");
        row.repeated = reactions(repeat, id, "pending");
        assert.deepEqual(
          row.repeated,
          row.immediate,
          "same paused native reaction identities",
        );
        row.delta = delta(row.before, row.immediate);
        assert.deepEqual(
          shape(row.delta),
          config.shape,
          "known consumer original reaction delta only",
        );
        await send("Debugger.resume");
        paused = false;
        const done = await execution;
        assert(!done.exceptionDetails);
        // Runtime response plus explicit next task; only now allow late microtask.
        await evalRuntime(
          "new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=()=>{c.port1.close();c.port2.close();resolve();};c.port2.postMessage(0);})",
          true,
        );
        row.laterMarker = await evalRuntime("__B48.marker()");
        await stateOf(objectId);
        const later = await snapshot("later");
        row.later = reactions(later, id, "pending");
        row.laterDelta = delta(row.before, row.later);
        if (config.mode === "microtask-late") {
          assert.equal(row.laterMarker.lateInstalled, true);
          assert.deepEqual(shape(row.laterDelta), [1, 1, 0, 0]);
        } else assert.deepEqual(row.later, row.immediate);
        row.completion = await evalRuntime("__B48.finish()", true);
        assert.equal(row.completion.candidateUI, false);
        assert.equal(
          row.completion.successfulConsumer,
          config.mode !== "unmount-skip",
        );
        row.pass = true;
        result.passed++;
      } catch (error) {
        row.error = String(error.stack ?? error);
        result.failed++;
        exit = 1;
      } finally {
        if (cdp && pauseListener) cdp.off("Debugger.paused", pauseListener);
        if (paused)
          try {
            await send("Debugger.resume");
            paused = false;
          } catch (e) {
            row.cleanupErrors.push({
              label: "resume",
              error: String(e.stack ?? e),
            });
          }
        if (execution)
          try {
            await bounded(execution, "original event operation after resume");
          } catch (e) {
            row.cleanupErrors.push({
              label: "event-operation",
              error: String(e.stack ?? e),
            });
          }
        if (page)
          try {
            row.cleanup = await bounded(
              page.evaluate(async () =>
                globalThis.__B48?.close
                  ? await __B48.close()
                  : { setupIncomplete: true },
              ),
              "fixture cleanup",
            );
            assert(!row.cleanup.setupIncomplete);
            for (const name of ["errors", "unhandled", "cleanupErrors"])
              assert.deepEqual(row.cleanup[name], []);
            assert.equal(row.cleanup.wireMessages, 0);
            assert.equal(row.cleanup.wireCloses, 0);
            assert.equal(row.cleanup.rootEmpty, true);
            assert.equal(row.cleanup.methodRestored, true);
          } catch (e) {
            row.cleanupErrors.push({
              label: "fixture-cleanup",
              error: String(e.stack ?? e),
            });
          }
        if (cdp)
          for (const [label, fn] of [
            [
              "remote-group",
              () =>
                send("Runtime.releaseObjectGroup", {
                  objectGroup: "B48-original",
                }),
            ],
            ["CDP", () => cdp.detach()],
          ])
            try {
              await fn();
            } catch (e) {
              row.cleanupErrors.push({ label, error: String(e.stack ?? e) });
            }
        if (page)
          try {
            await page.close();
          } catch (e) {
            row.cleanupErrors.push({
              label: "page",
              error: String(e.stack ?? e),
            });
          }
        if (row.cleanupErrors.length) {
          exit = 1;
          if (row.pass) {
            row.pass = false;
            result.passed--;
            result.failed++;
          }
        }
      }
    }
    assert.equal(result.executed, 7);
    assert.equal(result.passed, 7);
    assert.deepEqual(result.pageErrors, []);
  } catch (error) {
    exit = 1;
    result.error = String(error.stack ?? error);
  } finally {
    for (const [label, fn] of [
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
        await fn();
      } catch (e) {
        result.cleanupErrors.push({ label, error: String(e.stack ?? e) });
        exit = 1;
      }
    result.exitCode = exit;
    fs.writeFileSync(
      E + "/result.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = exit;
  }
}
