// Real B runner reporting control. No fake product component or C witness import.
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire, syncBuiltinESMExports } from "node:module";
import path from "node:path";

const mode = process.argv[2];
assert.ok(
  [
    "stable",
    "message-bigint",
    "stack-cycle",
    "proxy-bigint",
    "message-toJSON",
  ].includes(mode),
);
const require = createRequire(
  path.join(import.meta.dirname, "../c76/browser/package.json"),
);
const { chromium } = require("playwright");
const originals = {
  createServer: http.createServer,
  launch: chromium.launch,
  log: console.log,
};
const reports = [];
const reads = { message: 0, stack: 0 };
let server,
  browser,
  closeBrowser,
  port,
  injected = false,
  poisonHooks = 0,
  importError;
const field = mode === "stack-cycle" ? "stack" : "message";
const cycle = {};
cycle.self = cycle;
const poison = {
  toJSON() {
    poisonHooks++;
    throw new Error("B forbidden toJSON");
  },
  toString() {
    poisonHooks++;
    throw new Error("B forbidden toString");
  },
};
const bad =
  mode === "stack-cycle" ? cycle : mode === "message-toJSON" ? poison : 1n;
const read = (key) => {
  if (key !== "message" && key !== "stack") return undefined;
  reads[key]++;
  if (key !== field) return undefined;
  return reads[key] === 1 ? "B original " + field : bad;
};
const error =
  mode === "stable"
    ? new Error("B stable failure")
    : mode === "proxy-bigint"
      ? new Proxy({}, { get: (_, key) => read(key) })
      : Object.defineProperties(
          {},
          {
            message: { get: () => read("message") },
            stack: { get: () => read("stack") },
          },
        );
http.createServer = function (...args) {
  server = Reflect.apply(originals.createServer, this, args);
  server.once("listening", () => (port = server.address().port));
  return server;
};
syncBuiltinESMExports();
chromium.launch = async function (...args) {
  browser = await Reflect.apply(originals.launch, this, args);
  closeBrowser = browser.close.bind(browser);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...pageArgs) => {
    const page = await newPage(...pageArgs);
    const evaluate = page.evaluate.bind(page);
    page.evaluate = async (fn, ...evaluateArgs) => {
      if (!injected && String(fn).includes("window.UI.shutdown()")) {
        injected = true;
        throw error;
      }
      return evaluate(fn, ...evaluateArgs);
    };
    return page;
  };
  return browser;
};
console.log = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith("{")) {
    try {
      const report = JSON.parse(args[0]);
      if (report.plannedCases === 140) reports.push(report);
    } catch {}
  }
  originals.log(...args);
};
async function rebind() {
  if (!port) return false;
  const probe = originals.createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", resolve);
    });
    return true;
  } catch (value) {
    if (value.code === "EADDRINUSE") return false;
    throw value;
  } finally {
    if (probe.listening) await new Promise((resolve) => probe.close(resolve));
  }
}
let observed;
try {
  process.argv.push("--self-check");
  await import("./run.mjs");
} catch (value) {
  importError = { type: typeof value };
  try {
    const message = value?.message;
    if (typeof message === "string") importError.message = message;
  } catch {}
} finally {
  observed = {
    injected,
    field,
    reads,
    poisonHooks,
    importError,
    runnerReports: reports.length,
    reports,
    exitCode: process.exitCode ?? 0,
    browserConnected: browser?.isConnected() ?? false,
    serverListening: server?.listening ?? false,
    portRebind: await rebind(),
  };
  // Rescue does not rewrite the observations or count a lost report as success.
  if (closeBrowser) await closeBrowser().catch(() => {});
  if (server?.listening)
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  http.createServer = originals.createServer;
  chromium.launch = originals.launch;
  console.log = originals.log;
  syncBuiltinESMExports();
  originals.log(
    "C80_REPORT_CONTROL " +
      JSON.stringify({
        mode,
        observedBeforeRescue: observed,
        rescue: {
          browserConnected: browser?.isConnected() ?? false,
          serverListening: server?.listening ?? false,
        },
      }),
  );
}
