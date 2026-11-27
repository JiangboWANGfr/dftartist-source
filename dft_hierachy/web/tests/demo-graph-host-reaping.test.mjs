import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
const web = fileURLToPath(new URL("../", import.meta.url)),
  root = process.env.HIER_A_DEMO_DELIVERY ?? web;
const app = process.env.HIER_A_DEMO_DELIVERY ? path.join(root, "app") : path.join(web, "apps/demo");
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-host-unit-"));
let DesignHost, fixture, HierError;
try {
  const result = await build({
    stdin: {
      contents:
        'export {DesignHost} from "./design-host.js"; export {fixture} from "electron"; export {HierError} from "@hier/client";',
      resolveDir: path.join(app, "src"),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    plugins: [
      {
        name: "physical-host-boundary",
        setup(build) {
          build.onResolve({ filter: /^electron$/ }, () => ({
            path: "electron",
            namespace: "host-fixture",
          }));
          build.onResolve({ filter: /^@hier\/client\/electron\/main$/ }, () => ({
            path: "session",
            namespace: "host-fixture",
          }));
          build.onLoad({ filter: /.*/, namespace: "host-fixture" }, (args) => ({
            loader: "js",
            contents:
              args.path === "electron"
                ? `
   export const fixture={handlers:new Map(),sessions:[],spawns:[],pick:async()=>({canceled:false,filePaths:['/tmp/host-fixture.sv']})};
   export const dialog={showOpenDialog:(...args)=>fixture.pick(...args)};
   export const ipcMain={handle:(channel,callback)=>fixture.handlers.set(channel,callback),removeHandler:channel=>fixture.handlers.delete(channel)};
  `
                : `import {fixture} from "electron";export function createElectronSession(options){fixture.spawns.push(options);const session=fixture.sessions.shift();if(!session)throw new Error('A no physical session fixture');return session;}`,
          }));
        },
      },
    ],
  });
  const file = path.join(temp, "host.mjs");
  await writeFile(file, result.outputFiles[0].text);
  ({ DesignHost, fixture, HierError } = await import(pathToFileURL(file)));
} finally {
  await rm(temp, { recursive: true });
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const checkpoint = () => new Promise(setImmediate);
async function setup(t, { closeFailure, exitFailure } = {}) {
  fixture.handlers.clear();
  fixture.sessions = [];
  fixture.spawns = [];
  fixture.pick = async () => ({ canceled: false, filePaths: ["/tmp/host-fixture.sv"] });
  const web = new EventEmitter(),
    frame = {};
  Object.assign(web, {
    mainFrame: frame,
    setWindowOpenHandler() {},
    isDestroyed: () => false,
    getURL: () => "file:///host/index.html",
  });
  const host = new DesignHost({ webContents: web }, "file:///host/index.html", "/actual/hier"),
    exit = deferred();
  const closes = [];
  const session = {
    id: "S1",
    exited: exit.promise,
    close() {
      closes.push("S1");
      if (closeFailure) throw closeFailure;
    },
  };
  fixture.sessions.push(session);
  web.emit("did-finish-load");
  const event = { sender: web, senderFrame: frame },
    handlers = new Map(fixture.handlers);
  const call = (op, body) => handlers.get("hier:demo:" + op)(event, { version: 1, ...body });
  const pick = await call("pick", { options: { kind: "source" } });
  assert(pick.ok);
  assert((await call("open", { token: pick.value.token })).ok);
  t.after(async () => {
    exit.resolve({ code: 0, signal: null });
    try {
      await host.shutdown();
    } catch {}
  });
  return { host, web, session, exit, closes, event, call };
}
test("a synchronous close failure cannot settle its control reply before the original exit settles", async (t) => {
  const failure = new Error("A close failed"),
    { exit, closes, call } = await setup(t, { closeFailure: failure });
  let settled = false;
  const reply = call("close", { sessionId: "S1" }).finally(() => {
    settled = true;
  });
  await checkpoint();
  assert.deepEqual(closes, ["S1"]);
  assert.equal(settled, false);
  exit.resolve({ code: 0, signal: null });
  const result = await reply;
  assert.equal(result.ok, false);
  assert.match(result.error.message, /A close failed/);
});
test("close and exit failures retain both causes and only release the terminal record after settlement", async (t) => {
  const closeFailure = new Error("A close leaf"),
    exitFailure = new Error("A exited leaf"),
    { exit, call, closes } = await setup(t, { closeFailure });
  const pending = call("close", { sessionId: "S1" });
  await checkpoint();
  exit.reject(exitFailure);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.error.message, /A close leaf/);
  assert.match(result.error.message, /A exited leaf/);
  assert.deepEqual(closes, ["S1"]);
  assert.deepEqual(await call("close", { sessionId: "S1" }), { ok: true, value: null });
});
test("a normal pending exit remains exclusive, then terminal close is idempotent and old ids cannot close a new session", async (t) => {
  const { exit, call, closes } = await setup(t);
  const pending = call("close", { sessionId: "S1" });
  await checkpoint();
  assert.equal((await call("pick", { options: { kind: "source" } })).error.code, "busy");
  exit.resolve({ code: 0, signal: null });
  assert((await pending).ok);
  assert((await call("close", { sessionId: "S1" })).ok);
  assert.deepEqual(closes, ["S1"]);
  const nextExit = Promise.resolve({ code: 0, signal: null });
  fixture.sessions.push({
    id: "S2",
    exited: nextExit,
    close() {
      closes.push("S2");
    },
  });
  const pick = await call("pick", { options: { kind: "source" } });
  assert((await call("open", { token: pick.value.token })).ok);
  assert.equal((await call("close", { sessionId: "S1" })).error.code, "bad_request");
  assert.deepEqual(closes, ["S1"]);
});
test("resource close reentrancy into document invalidation joins the already registered cleanup", async (t) => {
  const { web, session, exit, call, closes } = await setup(t);
  session.close = () => {
    closes.push("S1");
    if (closes.length === 1) web.emit("render-process-gone");
  };
  const pending = call("close", { sessionId: "S1" });
  await checkpoint();
  assert.deepEqual(closes, ["S1"]);
  exit.resolve({ code: 0, signal: null });
  await pending;
});
test("shutdown revokes authorization synchronously and repeated callers share one cleanup promise and error", async (t) => {
  const marker = new Error("A shutdown close failure"),
    { host, exit, call, closes } = await setup(t, { closeFailure: marker });
  const first = host.shutdown(),
    second = host.shutdown(),
    settled = Promise.allSettled([first, second]);
  assert.equal(first, second);
  assert.equal((await call("pick", { options: { kind: "source" } })).error.code, "bad_request");
  await checkpoint();
  assert.deepEqual(closes, ["S1"]);
  let done = false;
  settled.then(() => {
    done = true;
  });
  await checkpoint();
  assert.equal(done, false);
  exit.resolve({ code: 0, signal: null });
  const results = await settled;
  assert(results.every((x) => x.status === "rejected" && x.reason === marker));
});
test("a replacement with failed old close waits for exit, does not spawn, and a fresh choice can recover afterward", async (t) => {
  const marker = new Error("A old replacement cleanup"),
    { exit, call } = await setup(t, { closeFailure: marker });
  const pick = await call("pick", { options: { kind: "source" } });
  let done = false;
  const pending = call("open", { token: pick.value.token }).finally(() => {
    done = true;
  });
  await checkpoint();
  assert.equal(done, false);
  assert.equal(fixture.spawns.length, 1);
  exit.resolve({ code: 0, signal: null });
  assert.equal((await pending).ok, false);
  assert.equal(fixture.spawns.length, 1);
  fixture.sessions.push({
    id: "S2",
    exited: Promise.resolve({ code: 0, signal: null }),
    close() {},
  });
  const choice = await call("pick", { options: { kind: "source" } });
  assert((await call("open", { token: choice.value.token })).ok);
  assert.equal(fixture.spawns.length, 2);
});
test("document invalidation during a normal replacement cannot spawn for the revoked document", async (t) => {
  const { web, exit, call } = await setup(t);
  const pick = await call("pick", { options: { kind: "source" } }),
    pending = call("open", { token: pick.value.token });
  await checkpoint();
  web.emit("did-start-navigation", { isMainFrame: true });
  exit.resolve({ code: 0, signal: null });
  assert.equal((await pending).error.code, "bad_request");
  assert.equal(fixture.spawns.length, 1);
});
test("a single HierError exit failure keeps the original clone-safe cause DTO", async (t) => {
  const { exit, call } = await setup(t);
  const error = new HierError("transport_closed", "transport", "A original exit", {
      reason: "resource_monitor_failed",
    }),
    pending = call("close", { sessionId: "S1" });
  await checkpoint();
  exit.reject(error);
  const reply = await pending;
  assert.equal(reply.ok, false);
  assert.deepEqual(reply.error, {
    code: "host_failure",
    origin: "demo",
    message: "A original exit",
    cause: {
      code: "transport_closed",
      origin: "transport",
      message: "A original exit",
      data: { reason: "resource_monitor_failed" },
    },
  });
});
test("unknown close diagnostics remain readable after real settlement rather than losing their available cause", async (t) => {
  const marker = new Error("A unreadable main diagnostic"),
    raw = { cause: new Error("A available main leaf") };
  Object.defineProperty(raw, "message", {
    get() {
      throw marker;
    },
  });
  const { exit, call } = await setup(t, { closeFailure: raw });
  const pending = call("close", { sessionId: "S1" });
  await checkpoint();
  exit.resolve({ code: 0, signal: null });
  const reply = await pending;
  assert.equal(reply.ok, false);
  assert.match(reply.error.message, /无法读取原始显示错误/);
  assert.match(reply.error.message, /A available main leaf/);
});
