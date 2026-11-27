import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { HierClient } from "@hier/client";
const web = fileURLToPath(new URL("../", import.meta.url));
const app = process.env.HIER_A_DEMO_DELIVERY
  ? path.join(process.env.HIER_A_DEMO_DELIVERY, "app") : path.join(web, "apps/demo");
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-input-unit-"));
let DesignInputs, compilationSummary;
try {
  for (const name of ["design-inputs", "design-diagnostic"]) {
    const result = await build({ entryPoints: [path.join(app, "src", name + ".ts")],
      bundle: true, platform: "node", format: "esm", write: false });
    const file = path.join(temp, name + ".mjs"); await writeFile(file, result.outputFiles[0].text);
    const module = await import(pathToFileURL(file).href);
    if (name === "design-inputs") DesignInputs = module.DesignInputs;
    else compilationSummary = module.compilationSummary;
  }
} finally { await rm(temp, { recursive: true }); }
const snapshot = {
  protocol: 2, schemaVersion: 7, frontend: { name: "slang", version: "A-fixture" },
  snapshotId: "a", inputHash: "0".repeat(64), inputHashComplete: true,
  bodySharing: "fast", tops: [], definitionCount: 0, bodyCount: 0,
  indexState: "ready", openedAt: "2026-01-01T00:00:00.000Z", topCandidates: [],
};
const complete = { status: "complete", reasons: [] };
class Transport {
  sent = [];
  onMessage(handler) { this.message = handler; return () => { this.message = undefined; }; }
  onClose() { return () => {}; }
  send(frame) { this.sent.push(frame); }
  close() { this.closed = true; }
  deliver(frame) { queueMicrotask(() => this.message?.(frame)); }
  reply(id, result) { this.deliver({ id, ok: true, result, completeness: complete }); }
  requests() { return this.sent.filter((r) => r.method === "design.checkInputs"); }
}
async function until(check) {
  for (let n = 0; n < 100; n++) { if (check()) return; await new Promise(queueMicrotask); }
  assert.fail("input request checkpoint not reached");
}
async function setup(t) {
  const transport = new Transport(), client = new HierClient(transport), inputs = new DesignInputs(client);
  t.after(() => { inputs.dispose(); client.dispose(); });
  transport.deliver({ event: "hello", protocol: 2, snapshot, capabilities: ["cancel", "progress"] });
  await client.ready;
  return { transport, client, inputs };
}

test("input checks join a burst, publish only Core results, and do not cache a completed observation", async (t) => {
  const { transport, inputs } = await setup(t);
  assert.equal(inputs.getSnapshot().phase, "idle");
  const first = inputs.check();
  for (let i = 0; i < 20; i++) assert.equal(inputs.check(), first);
  await until(() => transport.requests().length === 1);
  assert.equal(inputs.getSnapshot().phase, "pending");
  transport.reply(transport.requests()[0].id, { changed: ["opaque file/α", "other:ref"], complete: false });
  await first;
  const state = inputs.getSnapshot();
  assert.equal(state.phase, "success");
  assert.deepEqual(state.result, { changed: ["opaque file/α", "other:ref"], complete: false });
  assert(Object.isFrozen(state) && Object.isFrozen(state.result.changed));
  const second = inputs.check();
  assert.equal(inputs.getSnapshot().result, state.result, "retain last result while pending");
  await until(() => transport.requests().length === 2);
  transport.reply(transport.requests()[1].id, { changed: [], complete: true });
  await second;
  assert.deepEqual(inputs.getSnapshot().result, { changed: [], complete: true });
  assert(!transport.closed, "model only borrows the shared SDK");
});

test("cancellation and a late old reply cannot erase a newer successful result", async (t) => {
  const { transport, inputs } = await setup(t);
  const old = inputs.check(); await until(() => transport.requests().length === 1);
  inputs.cancel(); await old;
  assert.equal(inputs.getSnapshot().phase, "cancelled");
  assert.equal(inputs.getSnapshot().result, undefined);
  const current = inputs.check(); await until(() => transport.requests().length === 2);
  transport.reply(transport.requests()[1].id, { changed: ["fresh"], complete: true });
  await current;
  const state = inputs.getSnapshot();
  transport.reply(transport.requests()[0].id, { changed: ["stale"], complete: false });
  await new Promise(queueMicrotask);
  assert.equal(inputs.getSnapshot(), state);
});

test("failure and cancellation retain the last successful observation; retry remains available", async (t) => {
  const { transport, inputs } = await setup(t);
  let pending = inputs.check(); await until(() => transport.requests().length === 1);
  transport.reply(transport.requests()[0].id, { changed: ["known-change"], complete: false }); await pending;
  const last = inputs.getSnapshot().result;
  pending = inputs.check(); await until(() => transport.requests().length === 2);
  transport.deliver({ id: transport.requests()[1].id, ok: false,
    error: { code: "bad_request", message: "A original Core diagnostic", data: { path: "kept" } } });
  await pending;
  assert.equal(inputs.getSnapshot().phase, "failed");
  assert.equal(inputs.getSnapshot().error.code, "bad_request");
  assert.equal(inputs.getSnapshot().error.origin, "core");
  assert.equal(inputs.getSnapshot().error.data.path, "kept");
  assert.equal(inputs.getSnapshot().result, last);
  pending = inputs.check(); await until(() => transport.requests().length === 3);
  inputs.cancel(); await pending;
  assert.equal(inputs.getSnapshot().phase, "cancelled");
  assert.equal(inputs.getSnapshot().result, last);
  assert(!transport.closed);
});

test("disposal aborts the local check without closing its borrowed SDK or publishing late state", async (t) => {
  const { transport, client, inputs } = await setup(t);
  let notifications = 0; inputs.subscribe(() => notifications++);
  const pending = inputs.check(); await until(() => transport.requests().length === 1);
  inputs.dispose(); inputs.dispose(); await pending;
  const state = inputs.getSnapshot(), before = notifications;
  assert.equal(state.phase, "cancelled");
  await inputs.check(); transport.reply(transport.requests()[0].id, { changed: ["late"], complete: true });
  await new Promise(queueMicrotask);
  assert.equal(inputs.getSnapshot(), state); assert.equal(notifications, before);
  assert.equal(transport.requests().length, 1); assert(!transport.closed);
  const query = client.checkInputs(); await until(() => transport.requests().length === 2);
  transport.reply(transport.requests()[1].id, { changed: [], complete: true });
  assert.deepEqual((await query).result.changed, []);
});

test("pending subscriber reentrancy joins or cancels ownership before the query is issued", async (t) => {
  const { transport, inputs } = await setup(t);
  let joined;
  const off = inputs.subscribe(() => {
    if (inputs.getSnapshot().phase === "pending") { joined = inputs.check(); inputs.cancel(); }
  });
  const pending = inputs.check(); assert.equal(pending, joined); await pending; off();
  assert.equal(inputs.getSnapshot().phase, "cancelled");
  assert.equal(transport.requests().length, 0);
});

test("compile summary uses Core counts and original first error; full immutable diagnostics stay available", () => {
  const value = Object.freeze({ result: Object.freeze({ errorCount: 150, warningCount: 2,
    truncated: true, items: Object.freeze([
      Object.freeze({ severity: "warning", message: "warning first" }),
      Object.freeze({ severity: "error", message: "<original>\n完整错误", file: "raw.sv", line: 7 }),
    ]) }), completeness: complete });
  assert.equal(compilationSummary(value), "编译失败：150 个错误，2 个警告\n<original>\n完整错误");
  assert.equal(value.result.items[1].file, "raw.sv");
  assert.match(compilationSummary({ result: { errorCount: 2, warningCount: 0, items: [], truncated: true } }), /2 个错误/);
});
