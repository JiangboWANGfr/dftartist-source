import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
const web = fileURLToPath(new URL("../", import.meta.url));
const app = process.env.HIER_A_DEMO_DELIVERY
  ? path.join(process.env.HIER_A_DEMO_DELIVERY, "app") : path.join(web, "apps/demo");
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-loss-unit-"));
let DesignLifecycle;
try {
  const result = await build({ entryPoints: [path.join(app, "src/design-lifecycle.ts")],
    bundle: true, platform: "node", format: "esm", write: false });
  const file = path.join(temp, "lifecycle.mjs"); await writeFile(file, result.outputFiles[0].text);
  ({ DesignLifecycle } = await import(pathToFileURL(file).href));
} finally { await rm(temp, { recursive: true }); }
const root = { ref: "i:0", name: "top", path: ["top"], pathText: "top", kind: "module",
  def: "d:0", defName: "top", childCount: 0, hasParamOverrides: false };
const snapshot = { protocol: 2, schemaVersion: 7, frontend: { name: "slang", version: "A-fixture" },
  snapshotId: "a", inputHash: "0".repeat(64), inputHashComplete: true, bodySharing: "fast",
  tops: [root], definitionCount: 1, bodyCount: 1, indexState: "ready",
  openedAt: "2026-01-01T00:00:00.000Z", topCandidates: [] };
const ok = (value) => ({ ok: true, value });
const choice = () => ok({ token: "choice", label: "design.sv" });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function until(check) {
  for (let n = 0; n < 100; n++) { if (check()) return; await new Promise(queueMicrotask); }
  assert.fail("disconnect checkpoint was not reached");
}
// Physical transport/control promises only. SDK, panels, graph and inputs are production code.
class Transport {
  listeners = new Set();
  sent = [];
  closed = false;
  onMessage(handler) {
    this.message = handler;
    queueMicrotask(() => this.message?.({ event: "hello", protocol: 2, snapshot, capabilities: ["cancel", "progress"] }));
    return () => { this.message = undefined; };
  }
  onClose(handler) { this.listeners.add(handler); return () => { this.listeners.delete(handler); }; }
  send(request) {
    this.sent.push(request);
    const result = request.method === "design.diagnostics"
      ? { errorCount: 0, warningCount: 0, items: [], truncated: false }
      : request.method === "inst.roots" ? [root] : undefined;
    if (result) queueMicrotask(() => this.message?.({ id: request.id, ok: true, result,
      completeness: { status: "complete", reasons: [] } }));
  }
  close() { this.closed = true; }
  fail() { for (const handler of [...this.listeners]) handler(new Error("A lost Core connection")); }
}
async function setup(t) {
  const old = new Transport(), next = new Transport(), transports = [old, next];
  const closes = [], opens = [], order = [];
  const bridge = {
    version: 1, pickDesign: async () => choice(),
    openDesign: async () => { const id = String(opens.length + 1); opens.push(id); return ok({ sessionId: id, label: "design.sv" }); },
    closeDesign: async (id) => { closes.push(id); return ok(null); },
  };
  const lifecycle = new DesignLifecycle(bridge, {}, (change) => { order.push("unmount"); change(); }, async () => transports.shift());
  t.after(() => lifecycle.releaseDocument());
  await lifecycle.open({ kind: "source" });
  const owner = lifecycle.getSnapshot().active;
  assert(owner?.panels && owner.inputs);
  return { old, next, bridge, lifecycle, owner, closes, opens, order };
}

test("ready disconnect unmounts models immediately and waits for host cleanup before enabling retry", async (t) => {
  const { old, bridge, lifecycle, owner, closes, order } = await setup(t);
  const close = deferred(); bridge.closeDesign = async (id) => { closes.push(id); return close.promise; };
  const inputs = owner.inputs.check();
  await until(() => old.sent.some((r) => r.method === "design.checkInputs"));
  order.length = 0;
  old.fail(); await inputs;
  assert.equal(lifecycle.getSnapshot().active, undefined);
  assert.equal(lifecycle.getSnapshot().phase, "closing");
  assert.equal(owner.inputs.getSnapshot().phase, "cancelled");
  assert.equal(owner.panels.designGraph.layout.disposed, true);
  assert.equal(owner.panels.designGraph.graph.disposed, true);
  assert.deepEqual(order, ["unmount"]);
  assert.deepEqual(closes, ["1"]);
  let attempted = false; bridge.pickDesign = async () => { attempted = true; return choice(); };
  await lifecycle.open({ kind: "source" }); assert.equal(attempted, false);
  close.resolve(ok(null)); await until(() => lifecycle.getSnapshot().phase === "failed");
  assert.match(lifecycle.getSnapshot().message, /A lost Core connection/);
  await lifecycle.open({ kind: "source" });
  assert.equal(lifecycle.getSnapshot().phase, "ready");
  const current = lifecycle.getSnapshot(); old.fail(); await new Promise(queueMicrotask);
  assert.equal(lifecycle.getSnapshot(), current);
});

test("loss during picker cancellation releases locally, then closes only after main picker settles", async (t) => {
  const { old, bridge, lifecycle, owner, closes, opens } = await setup(t);
  const pick = deferred(), close = deferred(); let selecting = true;
  bridge.pickDesign = async () => { try { return await pick.promise; } finally { selecting = false; } };
  bridge.closeDesign = async (id) => { assert.equal(selecting, false); closes.push(id); return close.promise; };
  const opening = lifecycle.open({ kind: "source" }); old.fail();
  assert.equal(owner.panels.designGraph.layout.disposed, true);
  assert.equal(lifecycle.getSnapshot().active, undefined);
  assert.equal(lifecycle.getSnapshot().phase, "picking");
  assert.deepEqual(closes, []);
  pick.resolve(ok(null)); await until(() => closes.length === 1);
  assert.equal(lifecycle.getSnapshot().phase, "closing");
  close.resolve(ok(null)); await opening;
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  assert.match(lifecycle.getSnapshot().message, /A lost Core connection/);
  assert.deepEqual(opens, ["1"]);
});

test("an explicit replacement after picker-time loss waits for old cleanup and retains its diagnostic", async (t) => {
  const { old, bridge, lifecycle, closes, opens } = await setup(t);
  const pick = deferred(), close = deferred(); let reaped = false;
  bridge.pickDesign = () => pick.promise;
  bridge.closeDesign = async (id) => { closes.push(id); await close.promise; reaped = true; return ok(null); };
  const originalOpen = bridge.openDesign;
  bridge.openDesign = async (...args) => { assert(reaped); return originalOpen(...args); };
  const opening = lifecycle.open({ kind: "source" }); old.fail(); pick.resolve(choice());
  await until(() => closes.length === 1); assert.deepEqual(opens, ["1"]);
  close.resolve(); await opening;
  assert.equal(lifecycle.getSnapshot().phase, "ready");
  assert.equal(lifecycle.getSnapshot().active.id, "2");
  assert.match(lifecycle.getSnapshot().operationMessage, /A lost Core connection/);
  assert.deepEqual(closes, ["1"]);
});

test("picker rejection and remote cleanup rejection preserve every cause and permit a later open", async (t) => {
  const { old, bridge, lifecycle, closes } = await setup(t);
  const pick = deferred(); bridge.pickDesign = () => pick.promise;
  bridge.closeDesign = async (id) => { closes.push(id); throw new Error("A close rejection"); };
  const opening = lifecycle.open({ kind: "source" }); old.fail(); pick.reject(new Error("A picker rejection"));
  await opening;
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  for (const message of ["A picker rejection", "A lost Core connection", "A close rejection"])
    assert(lifecycle.getSnapshot().message.includes(message));
  assert.deepEqual(closes, ["1"]);
  bridge.pickDesign = async () => choice(); bridge.closeDesign = async () => ok(null);
  await lifecycle.open({ kind: "source" }); assert.equal(lifecycle.getSnapshot().phase, "ready");
});

test("a model disposal failure still releases the other resources and awaits remote cleanup", async (t) => {
  const { old, bridge, lifecycle, owner, closes } = await setup(t);
  const dispose = owner.panels.dispose.bind(owner.panels), close = deferred();
  owner.panels.dispose = () => { dispose(); throw new Error("A local cleanup failure"); };
  bridge.closeDesign = async (id) => { closes.push(id); return close.promise; };
  old.fail(); assert.equal(lifecycle.getSnapshot().phase, "closing");
  assert.equal(lifecycle.getSnapshot().active, undefined);
  assert.equal(owner.panels.designGraph.layout.disposed, true);
  assert.equal(old.closed, true); assert.deepEqual(closes, ["1"]);
  close.resolve(ok(null)); await until(() => lifecycle.getSnapshot().phase === "failed");
  assert.match(lifecycle.getSnapshot().message, /A local cleanup failure/);
  assert.match(lifecycle.getSnapshot().message, /A lost Core connection/);
});

test("picker-time local release failure cannot start the newly selected process", async (t) => {
  const { old, bridge, lifecycle, owner, opens, closes } = await setup(t);
  const dispose = owner.panels.dispose.bind(owner.panels), pick = deferred();
  owner.panels.dispose = () => { dispose(); throw new Error("A local cleanup failure"); };
  bridge.pickDesign = () => pick.promise;
  const opening = lifecycle.open({ kind: "source" }); old.fail(); pick.resolve(choice()); await opening;
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  assert.match(lifecycle.getSnapshot().message, /A local cleanup failure/);
  assert.deepEqual(closes, ["1"]); assert.deepEqual(opens, ["1"]);
});

test("normal close is not turned into a spontaneous disconnect failure", async (t) => {
  const { old, bridge, lifecycle, closes } = await setup(t);
  const close = deferred(); bridge.closeDesign = async (id) => { closes.push(id); return close.promise; };
  const closing = lifecycle.close(false); old.fail();
  assert.equal(lifecycle.getSnapshot().phase, "closing"); close.resolve(ok(null)); await closing;
  assert.equal(lifecycle.getSnapshot().phase, "idle");
  assert.equal(lifecycle.getSnapshot().message, "设计已关闭");
  assert.deepEqual(closes, ["1"]);
});

test("document release during lost-session cleanup cannot publish and still records a late rejection", async (t) => {
  const { old, bridge, lifecycle, closes } = await setup(t);
  const close = deferred(), messages = [], original = console.error;
  console.error = (...values) => messages.push(values);
  t.after(() => { console.error = original; });
  bridge.closeDesign = async (id) => { closes.push(id); return close.promise; };
  old.fail(); lifecycle.releaseDocument();
  const state = lifecycle.getSnapshot();
  const rejected = assert.rejects(close.promise, /A late cleanup rejection/);
  close.reject(new Error("A late cleanup rejection")); await rejected;
  await until(() => messages.some((row) => row.some((value) => value?.message === "A late cleanup rejection")));
  await lifecycle.open({ kind: "source" });
  assert.equal(lifecycle.getSnapshot(), state); assert.deepEqual(closes, ["1"]);
});

test("loss during ready publication is consumed by the opening turn with one remote close", async (t) => {
  const old = new Transport(), closes = [];
  const bridge = { version: 1, pickDesign: async () => choice(),
    openDesign: async () => ok({ sessionId: "1", label: "design.sv" }),
    closeDesign: async (id) => { closes.push(id); return ok(null); } };
  const lifecycle = new DesignLifecycle(bridge, {}, (change) => change(), async () => old);
  t.after(() => lifecycle.releaseDocument());
  lifecycle.subscribe(() => { if (lifecycle.getSnapshot().phase === "ready") old.fail(); });
  await lifecycle.open({ kind: "source" });
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  assert.equal(lifecycle.getSnapshot().active, undefined); assert.deepEqual(closes, ["1"]);
});


test("failed notification exposes retry admission before notifying subscribers", async (t) => {
  const { old, bridge, lifecycle } = await setup(t);
  const close = deferred(); bridge.closeDesign = () => close.promise;
  let retry;
  const off = lifecycle.subscribe(() => {
    if (lifecycle.getSnapshot().phase === "failed") retry = lifecycle.open({ kind: "source" });
  });
  old.fail(); close.resolve(ok(null));
  await until(() => retry !== undefined); await retry; off();
  assert.equal(lifecycle.getSnapshot().phase, "ready");
  assert.equal(lifecycle.getSnapshot().active.id, "2");
});
