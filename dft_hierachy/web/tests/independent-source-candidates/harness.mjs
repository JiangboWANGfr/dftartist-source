// B-owned public-interface harness. No substitute candidate model or private hook.
import assert from "node:assert/strict";
import path from "node:path";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
export {
  deep,
  observe,
  opaque,
  tick,
  rawSnapshot,
  Wire,
} from "../independent-source-document/harness.mjs";
import {
  deep,
  observe,
  rawSnapshot,
  Wire,
} from "../independent-source-document/harness.mjs";
export let sdk, vm, protocol, product;
export const Q = Object.freeze({
  snapshotId: "B-candidates-snapshot",
  file: "B-file/尾",
  line: 7,
});
export const complete = Object.freeze({ status: "complete", reasons: [] });
export const partial = Object.freeze({
  status: "partial",
  reasons: [{ code: "indexing", detail: "B not exhaustive", B_reason: "尾" }],
  B_meta: { v: 7 },
});
export const span = (n = 0) => ({
  file: Q.file,
  path: "/B/not-a-file-capability/尾.sv",
  start: { offset: n, line: 1, column: n + 1 },
  end: { offset: n + 1, line: 1, column: n + 2 },
  contentHash: "0123456789abcdef".repeat(4),
  B_span: { v: n },
});
export const hit = (n = 0) => ({
  ref: "B-ref/" + n,
  kind: ["definition", "instantiation", "statement"][n % 3],
  span: span(n),
  ...(n % 2 ? { inst: "B-inst/" + n } : {}),
  B_hit: { n },
});
export const page = (items = [hit()], next) => ({
  items,
  ...(next === undefined ? {} : { next }),
  B_page: { kept: ["尾", 3] },
});
export async function boot(requireModel = true) {
  assert.equal(process.versions.node.split(".")[0], "24");
  assert.ok(process.env.HIER_B_PRODUCT_ROOT, "explicit fixed product root");
  product = path.resolve(process.env.HIER_B_PRODUCT_ROOT);
  sdk = await import(publicEntry(product, "@hier/client"));
  protocol = await import(publicEntry(product, "@hier/protocol-types"));
  vm = await import(publicEntry(product, "@hier/viewmodel"));
  if (requireModel) {
    assert.equal(
      typeof vm.SourceCandidatesModel,
      "function",
      "missing public SourceCandidatesModel",
    );
    assert.equal(
      typeof vm.SourceCandidatesError,
      "function",
      "missing public SourceCandidatesError",
    );
  }
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
export function local(e, code) {
  assert.ok(e instanceof vm.SourceCandidatesError);
  assert.equal(e.code, code);
}
export const idle = { status: "idle", query: null, pages: [] };
const active = new Set();
export async function context({
  withModel = true,
  ready = true,
  options,
  id = Q.snapshotId,
} = {}) {
  const wire = new Wire(),
    client = new sdk.HierClient(wire, { cacheEntries: 0 }),
    c = {
      wire,
      client,
      models: [],
      commands: [],
      calls: [],
      events: [],
      registrations: 0,
    };
  client.ready.catch(() => {});
  const restore = [];
  for (const method of ["resolveSource", "onIndexReady", "instancesOf"]) {
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
        try {
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
          return p;
        } catch (e) {
          call.thrown = e;
          throw e;
        }
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
  c.newModel = (opts = options) => {
    const m = new vm.SourceCandidatesModel(client, opts);
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
      for (const f of restore)
        try {
          f();
        } catch (e) {
          errors.push(e);
        }
      try {
        client.dispose();
      } catch (e) {
        errors.push(e);
      }
      try {
        wire.close();
      } catch (e) {
        errors.push(e);
      }
      for (const w of wire.waits) w.resolve(undefined);
      wire.waits = [];
      let timer;
      try {
        await Promise.race([
          Promise.all(c.commands.map((o) => o.settled)),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error("B cleanup watchdog")), 3000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        active.delete(c);
      }
      assert.equal(wire.messages.size, 0);
      assert.equal(wire.closes.size, 0);
      assert.equal(wire.closed, true);
      for (const o of c.commands) assert.equal(o.count, 1);
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
  const errors = [];
  for (const c of [...active])
    try {
      await c.close();
    } catch (e) {
      errors.push(e);
    }
  if (errors.length) throw new AggregateError(errors, "B cleanup");
}
export async function begin(c, query = Q, method = "load") {
  const o = method === "load" ? invoke(c, "load", query) : invoke(c, method);
  assert.equal(c.m.state.status, "pending");
  deep(c.m.state);
  const q = await c.wire.next("source.resolve");
  assert.ok(q);
  return { o, q, query };
}
export async function finish(c, t, value = page(), completeness = complete) {
  c.wire.ok(t.q, value, completeness);
  await success(t.o);
  const s = c.m.state;
  assert.equal(s.status, "success");
  deep(s);
  const call = c.calls.findLast((x) => x.method === "resolveSource");
  assert.equal(s.pages.at(-1), call.reply, "original SDK Reply identity");
  return t;
}
// §6.11 SDK boundary omits cursor; §5.6.6 + RequestCursor canonicalize
// the generated wire default to "". These are distinct layer assertions.
export function firstRequest(c, t) {
  assert.equal(t.q.params.cursor, "");
  assert.equal(Object.hasOwn(c.calls.at(-1).args[1], "cursor"), false);
}
export function state(c, status, query = Q, pages) {
  const s = c.m.state;
  assert.equal(s.status, status);
  assert.deepEqual(s.query, query);
  if (pages !== undefined) assert.deepEqual(s.pages, pages);
  else if (status === "idle") assert.deepEqual(s.pages, []);
  deep(s);
  assert.equal("items" in s, false);
  assert.equal("next" in s, false);
  assert.equal("count" in s, false);
  if (status === "pending" || status === "success" || status === "idle")
    assert.equal(Object.hasOwn(s, "error"), false);
  return s;
}
export async function sdkAlive(c) {
  const p = c.client.resolveSource({ file: Q.file, line: 99 }, { limit: 1 });
  p.catch(() => {});
  const q = await c.wire.next("source.resolve", (q) => q.params.line === 99);
  c.wire.ok(q, page([]));
  assert.deepEqual((await p).result.items, []);
}
