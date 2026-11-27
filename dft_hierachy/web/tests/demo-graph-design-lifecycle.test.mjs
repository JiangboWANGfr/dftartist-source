import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";

const web = fileURLToPath(new URL("../", import.meta.url));
const app = process.env.HIER_A_DEMO_DELIVERY
  ? path.join(process.env.HIER_A_DEMO_DELIVERY, "app") : path.join(web, "apps/demo");
async function load(name) {
  const built = await build({
    entryPoints: [path.join(app, "src", name + ".ts")],
    bundle: true, platform: "node", format: "esm", write: false,
  });
  const temp = await mkdtemp(path.join(tmpdir(), "hier-a-lifecycle-unit-"));
  try {
    const file = path.join(temp, name + ".mjs");
    await writeFile(file, built.outputFiles[0].text);
    return await import(pathToFileURL(file).href);
  } finally { await rm(temp, { recursive: true }); }
}
const { DesignLifecycle } = await load("design-lifecycle");
const { rendererProgress } = await load("design-progress");
const root = {
  ref: "i:0", name: "top", path: ["top"], pathText: "top", kind: "module",
  def: "d:0", defName: "top", childCount: 0, hasParamOverrides: false,
};
const snapshot = {
  protocol: 2, schemaVersion: 7, frontend: { name: "slang", version: "A-fixture" },
  snapshotId: "a", inputHash: "0".repeat(64), inputHashComplete: true,
  bodySharing: "fast", tops: [root], definitionCount: 1, bodyCount: 1,
  indexState: "ready", openedAt: "2026-01-01T00:00:00.000Z", topCandidates: [],
};
const complete = { status: "complete", reasons: [] };
const ok = (value) => ({ ok: true, value });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(queueMicrotask); }
  assert.fail("expected lifecycle checkpoint was not reached");
}
// Only the physical bridge is controlled. HierClient, models and lifecycle are production code.
class Transport {
  sent = [];
  listeners = new Set();
  message;
  closed = false;
  constructor(diags = { errorCount: 0, warningCount: 0, items: [], truncated: false }) {
    this.diags = diags;
  }
  send(request) {
    this.sent.push(request);
    if (request.method === "design.diagnostics" && this.diags)
      this.reply(request, this.diags);
    if (request.method === "inst.roots") this.reply(request, [root]);
  }
  reply(request, result) {
    queueMicrotask(() => this.message?.({ id: request.id, ok: true, result, completeness: complete }));
  }
  onMessage(handler) {
    this.message = handler;
    queueMicrotask(() => this.message?.({
      event: "hello", protocol: 2, snapshot: this.snapshot ?? snapshot,
      capabilities: ["cancel", "progress"],
    }));
    return () => { this.message = undefined; };
  }
  onClose(handler) {
    this.listeners.add(handler);
    return () => { this.listeners.delete(handler); };
  }
  close() { this.closed = true; }
  fail() {
    for (const handler of [...this.listeners]) handler(new Error("A transport failure"));
  }
}
function setup(t, transports = [new Transport()], overrides = {}) {
  let serial = 0;
  const closed = [], events = [];
  const bridge = {
    version: 1,
    pickDesign: async () => ok({ token: "choice", label: "design.sv" }),
    openDesign: async () => ok({ sessionId: String(++serial), label: "design.sv" }),
    closeDesign: async (id) => { closed.push(id); return ok(null); },
    ...overrides,
  };
  const lifecycle = new DesignLifecycle(bridge, {}, (change) => {
    events.push("unmount"); change();
  }, async () => transports.shift());
  t.after(() => lifecycle.releaseDocument());
  return { lifecycle, bridge, closed, events };
}
const source = { kind: "source" };

for (const tops of [[], [root]]) {
  test(`compile errors with ${tops.length} tops block models and wait for actual host close before retry`, async (t) => {
    const transport = new Transport({ errorCount: 1, warningCount: 0, truncated: false,
      items: [{ severity: "error", message: "A semantic diagnostic" }] });
    transport.snapshot = { ...snapshot, tops };
    const close = deferred();
    const { lifecycle, bridge, closed } = setup(t, [transport, new Transport()]);
    bridge.closeDesign = async (id) => { closed.push(id); return close.promise; };
    const opening = lifecycle.open(source);
    await until(() => closed.length === 1);
    assert.equal(lifecycle.getSnapshot().active, undefined);
    assert.equal(transport.closed, true);
    assert.equal(transport.sent.filter((r) => r.method === "inst.roots").length, 0);
    assert.equal(lifecycle.getSnapshot().phase, "closing", "cleanup is still pending");
    assert.match(lifecycle.getSnapshot().message, /正在清理/);
    assert.doesNotMatch(lifecycle.getSnapshot().message, /编译失败/,
      "terminal error is published with retry availability after cleanup");
    close.resolve(ok(null));
    await opening;
    assert.equal(lifecycle.getSnapshot().phase, "failed");
    assert.match(lifecycle.getSnapshot().message, /A semantic diagnostic/);
    bridge.closeDesign = async (id) => { closed.push(id); return ok(null); };
    await lifecycle.open(source);
    assert.equal(lifecycle.getSnapshot().phase, "ready");
    assert(lifecycle.getSnapshot().active.panels);
    assert.deepEqual(closed, ["1"]);
    await lifecycle.close(false);
    assert.equal(lifecycle.getSnapshot().phase, "idle");
  });
}

test("warning-only diagnostics allow a single real model set; picker cancellation retains it", async (t) => {
  const transport = new Transport({ errorCount: 0, warningCount: 1, truncated: false,
    items: [{ severity: "warning", message: "A warning" }] });
  const { lifecycle, bridge } = setup(t, [transport]);
  await lifecycle.open(source);
  const owned = lifecycle.getSnapshot().active;
  assert(owned?.panels);
  assert.equal(transport.sent.filter((r) => r.method === "design.diagnostics").length, 1);
  bridge.pickDesign = async () => ok(null);
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot().phase, "ready");
  assert.equal(lifecycle.getSnapshot().active, owned);
  assert.equal(transport.closed, false);
});

test("cancel during diagnostics waits for cleanup; old rejection cannot overwrite next session", async (t) => {
  const old = new Transport(null), close = deferred();
  const { lifecycle, bridge, closed } = setup(t, [old, new Transport()]);
  bridge.closeDesign = async (id) => { closed.push(id); return close.promise; };
  const opening = lifecycle.open(source);
  await until(() => old.sent.some((r) => r.method === "design.diagnostics"));
  const cancelling = lifecycle.close(true);
  assert.equal(lifecycle.getSnapshot().phase, "closing");
  await opening;
  assert.equal(lifecycle.getSnapshot().phase, "closing");
  assert.equal(old.closed, true);
  close.resolve(ok(null)); await cancelling;
  assert.equal(lifecycle.getSnapshot().phase, "cancelled");
  await lifecycle.open(source);
  const current = lifecycle.getSnapshot();
  old.reply(old.sent[0], { errorCount: 9, warningCount: 0, items: [], truncated: true });
  await new Promise(queueMicrotask);
  assert.equal(lifecycle.getSnapshot(), current);
});

test("cancel during connect closes a late transport and never mounts old models", async (t) => {
  const late = deferred(), old = new Transport();
  const { lifecycle, closed } = setup(t, [late.promise, new Transport()]);
  const opening = lifecycle.open(source);
  await until(() => lifecycle.getSnapshot().phase === "connecting");
  await lifecycle.close(true);
  assert.deepEqual(closed, ["1"]);
  await lifecycle.open(source);
  const current = lifecycle.getSnapshot();
  late.resolve(old); await opening;
  assert.equal(old.closed, true);
  assert.equal(lifecycle.getSnapshot(), current);
});

test("document release is final and idempotent even while connect is pending", async (t) => {
  const late = deferred(), old = new Transport();
  const { lifecycle } = setup(t, [late.promise]);
  const opening = lifecycle.open(source);
  await until(() => lifecycle.getSnapshot().phase === "connecting");
  lifecycle.releaseDocument(); lifecycle.releaseDocument();
  late.resolve(old); await opening;
  assert.equal(old.closed, true);
  assert.equal(lifecycle.getSnapshot().active, undefined);
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot().active, undefined);
});

test("cleanup unmounts borrowed views before disposal and consumes every cleanup failure", async (t) => {
  const transport = new Transport();
  const { lifecycle, bridge, events, closed } = setup(t, [transport, new Transport()]);
  await lifecycle.open(source);
  const owned = lifecycle.getSnapshot().active, dispose = owned.panels.dispose.bind(owned.panels);
  owned.panels.dispose = () => {
    assert.equal(lifecycle.getSnapshot().active, undefined);
    events.push("dispose"); dispose(); throw new Error("A model disposal failure");
  };
  bridge.closeDesign = async (id) => { closed.push(id); throw new Error("A host close failure"); };
  events.length = 0;
  await lifecycle.open(source);
  assert.deepEqual(events, ["unmount", "dispose"]);
  assert.equal(transport.closed, true);
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  assert.match(lifecycle.getSnapshot().message, /A model disposal failure/);
  assert.match(lifecycle.getSnapshot().message, /A host close failure/);
  assert.deepEqual(closed, ["1"]);
  bridge.closeDesign = async () => ok(null);
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot().phase, "ready");
});

test("diagnostic transport failure is visible, released, and retryable", async (t) => {
  const old = new Transport(null);
  const { lifecycle, closed } = setup(t, [old, new Transport()]);
  const opening = lifecycle.open(source);
  await until(() => old.sent.some((r) => r.method === "design.diagnostics"));
  old.fail(); await opening;
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  assert.match(lifecycle.getSnapshot().message, /A transport failure/);
  assert.equal(old.closed, true);
  assert.deepEqual(closed, ["1"]);
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot().phase, "ready");
});

test("host only forwards bounded canonical stage records with no arbitrary fields", () => {
  const good = '[hier-demo-design] {"scope":"renderer","generation":3,"stage":"diagnostics"}';
  assert.equal(rendererProgress(good), good);
  for (const value of [
    "arbitrary log", good + "x", good.replace('"renderer"', '"host"'),
    good.replace(':3,', ':-1,'), good.replace(':3,', ':0.1,'),
    good.replace('"diagnostics"', '"private-filename"'),
    good.replace('"stage":', '"path":"secret","stage":'), good + " ".repeat(256),
    '[hier-demo-design] null', '[hier-demo-design] []',
  ]) assert.equal(rendererProgress(value), undefined, value);
});

test("late main open after document release closes its known id without reconnecting", async (t) => {
  const late = deferred();
  const { lifecycle, closed } = setup(t, [], { openDesign: () => late.promise });
  const opening = lifecycle.open(source);
  await until(() => lifecycle.getSnapshot().phase === "opening");
  lifecycle.releaseDocument();
  late.resolve(ok({ sessionId: "late", label: "late.sv" }));
  await opening;
  assert.deepEqual(closed, ["late"]);
  assert.equal(lifecycle.getSnapshot().active, undefined);
});

test("picker failure retains readable old models and still allows explicit close", async (t) => {
  const old = new Transport();
  const { lifecycle, bridge, closed } = setup(t, [old]);
  await lifecycle.open(source);
  const owned = lifecycle.getSnapshot().active;
  bridge.pickDesign = async () => { throw new Error("A native picker failure"); };
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot().active, owned);
  assert.equal(old.closed, false);
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  assert.match(lifecycle.getSnapshot().message, /A native picker failure/);
  await lifecycle.close(false);
  assert.deepEqual(closed, ["1"]);
  assert.equal(old.closed, true);
  assert.equal(lifecycle.getSnapshot().phase, "idle");
});
