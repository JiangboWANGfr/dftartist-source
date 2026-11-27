// Agent B: only public SDK and public model exports. No substitute Source model.
import assert from "node:assert/strict";
import path from "node:path";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";

export let sdk, vm, product;
export const complete = { status: "complete", reasons: [] };
export const hashA = "0123456789abcdef".repeat(4);
export const hashB = "fedcba9876543210".repeat(4);
export const point = (offset, line = 1, column = offset + 1) => ({
  offset,
  line,
  column,
});
export const span = (start = point(0), end = point(3)) => ({
  file: "B-source-file/尾",
  path: "/not-a-reading-capability/B.sv",
  start,
  end,
  contentHash: hashA,
  B_span_extension: { kept: ["原文", 7] },
});
export const read = (
  text = "abc",
  contentHash = hashA,
  matchesSnapshot = true,
) => ({
  text,
  contentHash,
  matchesSnapshot,
  B_read_extension: { kept: [false, "尾"] },
});
export const tick = () => new Promise((resolve) => setImmediate(resolve));
export async function boot(requireModel = true) {
  assert.equal(process.versions.node.split(".")[0], "24");
  assert.ok(
    process.env.HIER_B_PRODUCT_ROOT,
    "explicit B fixed product required",
  );
  product = path.resolve(process.env.HIER_B_PRODUCT_ROOT);
  sdk = await import(publicEntry(product, "@hier/client"));
  vm = await import(publicEntry(product, "@hier/viewmodel"));
  if (requireModel) {
    assert.equal(
      typeof vm.SourceDocumentModel,
      "function",
      "missing public SourceDocumentModel",
    );
    assert.equal(
      typeof vm.SourceDocumentError,
      "function",
      "missing public SourceDocumentError",
    );
  }
}
export function deep(value) {
  const seen = new Set(),
    stack = [value];
  while (stack.length) {
    const item = stack.pop();
    if (
      item === null ||
      !["object", "function"].includes(typeof item) ||
      seen.has(item)
    )
      continue;
    seen.add(item);
    assert.equal(Object.isFrozen(item), true);
    for (const key of Object.keys(item)) stack.push(item[key]);
  }
}
export function observe(promise) {
  const item = { promise, count: 0, done: false };
  item.settled = promise.then(
    (value) => {
      item.count++;
      item.done = true;
      return { ok: true, value };
    },
    (error) => {
      item.count++;
      item.done = true;
      return { ok: false, error };
    },
  );
  return item;
}
export function invoke(c, method, ...args) {
  let p;
  assert.doesNotThrow(() => {
    p = c.m[method](...args);
  });
  assert.ok(
    p && typeof p.then === "function" && typeof p.catch === "function",
    "Promise command",
  );
  const o = observe(p);
  c.commands.push(o);
  return o;
}
export async function success(o) {
  const r = await o.settled;
  assert.equal(r.ok, true);
  assert.equal(r.value, undefined);
  assert.equal(o.count, 1);
}
export async function failure(o, code) {
  const r = await o.settled;
  assert.equal(r.ok, false);
  if (code) assert.equal(r.error.code, code);
  assert.equal(o.count, 1);
  return r.error;
}
export function local(error, code) {
  assert.ok(error instanceof vm.SourceDocumentError);
  assert.equal(error.code, code);
}
export function rawSnapshot(id = "B-source-snapshot") {
  return {
    protocol: 2,
    schemaVersion: 7,
    snapshotId: id,
    inputHash: hashA,
    inputHashComplete: true,
    frontend: { name: "slang", version: "B-fixture" },
    bodySharing: "fast",
    tops: [],
    definitionCount: 0,
    bodyCount: 0,
    indexState: "ready",
    openedAt: "2000-01-01T00:00:00.000Z",
    topCandidates: [],
  };
}
export class Wire {
  sent = [];
  messages = new Set();
  closes = new Set();
  closed = false;
  claimed = new Set();
  waits = [];
  onMessage(fn) {
    this.messages.add(fn);
    return () => this.messages.delete(fn);
  }
  onClose(fn) {
    this.closes.add(fn);
    return () => this.closes.delete(fn);
  }
  send(value) {
    assert.equal(this.closed, false);
    this.sent.push(structuredClone(value));
    this.flush();
  }
  emit(value) {
    if (!this.closed)
      for (const f of [...this.messages])
        if (this.messages.has(f)) f(structuredClone(value));
  }
  close(cause = new Error("B controlled EOF")) {
    if (this.closed) return;
    this.closed = true;
    for (const f of [...this.closes]) if (this.closes.has(f)) f(cause);
  }
  get queries() {
    return this.sent.filter((q) => q.method !== "cancel");
  }
  get cancels() {
    return this.sent.filter((q) => q.method === "cancel");
  }
  flush() {
    for (const w of [...this.waits]) {
      const q = this.sent.find(
        (q) => !this.claimed.has(q) && q.method === w.method && w.test(q),
      );
      if (q) {
        this.claimed.add(q);
        this.waits.splice(this.waits.indexOf(w), 1);
        w.resolve(q);
      }
    }
  }
  next(method, test = () => true) {
    return new Promise((resolve) => {
      this.waits.push({ method, test, resolve });
      this.flush();
    });
  }
  ok(q, result, completeness = complete) {
    this.emit({ id: q.id, ok: true, result, completeness });
  }
  fail(q, code = "not_found", data = { B: "原错", nested: { n: 3 } }) {
    this.emit({
      id: q.id,
      ok: false,
      error: { code, message: "B Core original", data },
    });
  }
}
const active = new Set();
export async function context({ withModel = true, ready = true, id } = {}) {
  const wire = new Wire(),
    client = new sdk.HierClient(wire, { cacheEntries: 0 }),
    c = {
      wire,
      client,
      models: [],
      calls: [],
      commands: [],
      events: [],
      registrations: 0,
    };
  client.ready.catch(() => {});
  const callWaiters = new Set();
  c.called = (method, count) =>
    new Promise((resolve, reject) => {
      const check = () => {
        const calls = c.calls.filter((x) => x.method === method);
        if (calls.length >= count) {
          callWaiters.delete(check);
          resolve(calls[count - 1]);
        }
      };
      check.cancel = () =>
        reject(Error("B context closed before awaited public SDK call"));
      callWaiters.add(check);
      check();
    });
  const restore = [];
  for (const method of ["source", "readSource", "onIndexReady"]) {
    const own = Object.getOwnPropertyDescriptor(client, method),
      original = client[method];
    Object.defineProperty(client, method, {
      configurable: true,
      writable: true,
      value: function (...args) {
        if (method === "onIndexReady") {
          c.registrations++;
          return Reflect.apply(original, this, args);
        }
        const call = { method, args };
        c.calls.push(call);
        const p = Reflect.apply(original, this, args);
        call.promise = p;
        p.then(
          (reply) => {
            call.reply = reply;
          },
          (error) => {
            call.error = error;
          },
        );
        for (const check of [...callWaiters]) check();
        return p;
      },
    });
    restore.push(() =>
      own
        ? Object.defineProperty(client, method, own)
        : Reflect.deleteProperty(client, method),
    );
  }
  if (ready) {
    wire.emit({
      event: "hello",
      protocol: 2,
      snapshot: rawSnapshot(id),
      capabilities: ["cancel", "progress"],
    });
    await client.ready;
  }
  c.newModel = () => {
    const m = new vm.SourceDocumentModel(client);
    c.models.push(m);
    return m;
  };
  let closing;
  c.close = () =>
    (closing ??= (async () => {
      const errors = [];
      for (const m of c.models)
        try {
          m.dispose();
        } catch (e) {
          errors.push(e);
        }
      for (const f of restore) f();
      for (const check of callWaiters) check.cancel();
      callWaiters.clear();
      client.dispose();
      for (const w of wire.waits) w.resolve(undefined);
      wire.waits = [];
      let timer;
      try {
        await Promise.race([
          Promise.all(c.commands.map((o) => o.settled)),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("B command cleanup watchdog")),
              3000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
        active.delete(c);
      }
      assert.equal(wire.messages.size, 0);
      assert.equal(wire.closes.size, 0);
      assert.equal(wire.closed, true);
      if (errors.length) throw new AggregateError(errors, "B cleanup");
    })());
  active.add(c);
  if (withModel)
    try {
      c.m = c.newModel();
      c.m.subscribe(() => c.events.push(c.m.state));
    } catch (e) {
      await c.close();
      throw e;
    }
  return c;
}
export async function using(fn, options) {
  const c = await context(options);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}
export async function releaseAll() {
  for (const c of [...active]) await c.close();
}
export async function begin(c, ref = "B-object", kind = "definition") {
  const o = invoke(c, "load", ref, kind);
  assert.deepEqual(c.m.state, { status: "pending", target: { ref, kind } });
  deep(c.m.state);
  const q = await c.wire.next(
    "obj.source",
    (q) => q.params.ref === ref && q.params.kind === kind,
  );
  return { o, q, ref, kind };
}
export async function second(c, t, value = span()) {
  const before = c.m.state;
  c.wire.ok(t.q, value);
  const r = await c.wire.next(
    "source.read",
    (q) => q.params.file === value.file,
  );
  assert.equal(c.m.state, before, "no partial publish");
  return { ...t, r, span: value };
}
export async function finish(c, t, value = read()) {
  if (!t.r) t = await second(c, t);
  c.wire.ok(t.r, value);
  await success(t.o);
  assert.equal(c.m.state.status, "success");
  deep(c.m.state);
  return t;
}
export const opaque = (counts = { probes: 0 }) =>
  new Proxy(Object.create(null), {
    get() {
      counts.probes++;
      throw Error("B forbidden parameter probe");
    },
    ownKeys() {
      counts.probes++;
      throw Error("B forbidden enumerate");
    },
    getPrototypeOf() {
      counts.probes++;
      throw Error("B forbidden prototype probe");
    },
  });
