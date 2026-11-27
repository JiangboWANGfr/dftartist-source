// B-only: real public SDK/Transport and real public Navigation export; no fallback.
import assert from "node:assert/strict";
import * as H from "../independent-source-document/harness.mjs";
import * as C from "../independent-source-candidates/harness.mjs";
export { H, C };
export const methods = [
  "load",
  "reloadDocument",
  "cancelDocument",
  "clear",
  "locate",
  "loadMore",
  "reloadCandidates",
  "cancelCandidates",
];
export const complete = C.complete,
  partial = C.partial;
export const hit = (n = 0) => ({
  ...C.hit(n),
  span: { ...C.span(n), file: "B-source-file/尾" },
});
export async function boot(required = true) {
  await H.boot();
  await C.boot(false);
  if (required) {
    assert.equal(
      typeof H.vm.SourceNavigationModel,
      "function",
      "missing public SourceNavigationModel",
    );
    assert.equal(
      typeof H.vm.SourceNavigationError,
      "function",
      "missing public SourceNavigationError",
    );
  }
}
export const turn = H.tick,
  ok = H.success,
  bad = H.failure;
export function call(c, method, ...args) {
  let p;
  assert.doesNotThrow(() => {
    p = c.m[method](...args);
  });
  assert.ok(
    p && typeof p.then === "function" && typeof p.catch === "function",
    "Promise command, not synchronous throw",
  );
  const o = H.observe(p);
  c.commands.push(o);
  return o;
}
export function track(c, p) {
  let o = c.observed.get(p);
  if (!o) {
    o = H.observe(p);
    c.observed.set(p, o);
    c.commands.push(o);
  }
  return o;
}
export function invariant(c) {
  const s = c.m.state;
  assert.ok(Object.isFrozen(s));
  H.deep(s.document);
  for (const key of ["document", "candidates", "refresh"]) assert.ok(key in s);
  if (s.candidates !== null) {
    const b = s.candidates;
    assert.ok(Object.isFrozen(b));
    assert.equal(s.document.status, "success");
    assert.equal(b.document, s.document.data);
    assert.equal(b.document.location.status, "exact");
    assert.notEqual(b.state.status, "idle");
    H.deep(b.state);
    assert.equal(b.state.query.snapshotId, c.m.snapshotId);
    assert.equal(b.state.query.file, b.document.source.result.file);
    assert.equal(typeof b.state.query.col, "number");
    assert.ok(Number.isSafeInteger(b.utf16Offset));
  }
  if (s.refresh !== null) {
    const r = s.refresh;
    assert.ok(Object.isFrozen(r));
    assert.equal(r.document, s.document.data);
    assert.equal(r.document, s.candidates.document);
    assert.ok(r.utf16Offset === s.candidates.utf16Offset);
    assert.ok(r.completion instanceof Promise); // The handle, NOT its Promise, must be frozen.
  }
  return s;
}
export async function context({
  withModel = true,
  ready = true,
  options,
  observeRefresh = true,
} = {}) {
  const c = await H.context({ withModel: false, ready: false });
  c.observed = new Map();
  c.readyTokens = new Set();
  c.readyCallbacks = [];
  const restores = [];
  for (const method of ["resolveSource", "onIndexReady"]) {
    const own = Object.getOwnPropertyDescriptor(c.client, method),
      original = c.client[method];
    c.client[method] = function (...args) {
      if (method === "onIndexReady") {
        c.readyCallbacks.push(args[0]);
        const off = Reflect.apply(original, this, args),
          token = {};
        c.readyTokens.add(token);
        let live = true;
        return () => {
          if (live) {
            live = false;
            c.readyTokens.delete(token);
            off();
          }
        };
      }
      const x = { method, args };
      c.calls.push(x);
      try {
        const p = Reflect.apply(original, this, args);
        x.promise = p;
        p.then(
          (reply) => {
            x.reply = reply;
          },
          (error) => {
            x.error = error;
          },
        );
        return p;
      } catch (e) {
        x.thrown = e;
        throw e;
      }
    };
    restores.push(() =>
      own
        ? Object.defineProperty(c.client, method, own)
        : Reflect.deleteProperty(c.client, method),
    );
  }
  c.make = (opts = options) => {
    const m = new H.vm.SourceNavigationModel(c.client, opts);
    c.models.push(m);
    return m;
  };
  const close = c.close;
  let closing;
  c.close = () =>
    (closing ??= (async () => {
      for (const f of restores) f();
      await close();
      assert.equal(c.readyTokens.size, 0);
      for (const o of c.commands) assert.equal(o.count, 1);
    })());
  if (ready) {
    c.wire.emit({
      event: "hello",
      protocol: 2,
      snapshot: { ...H.rawSnapshot(), indexState: "building" },
      capabilities: ["cancel", "progress"],
    });
    await c.client.ready;
  }
  if (withModel)
    try {
      c.m = c.make();
      c.m.subscribe(() => {
        const s = invariant(c);
        c.events.push(s);
        if (observeRefresh && s.refresh) track(c, s.refresh.completion);
      });
      invariant(c);
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
export function snapshot(c) {
  return {
    state: c.m.state,
    sent: c.wire.sent.length,
    calls: c.calls.length,
    events: c.events.length,
    tokens: c.readyTokens.size,
  };
}
export function unchanged(c, s) {
  assert.deepEqual(snapshot(c), s);
  assert.equal(c.m.state, s.state);
}
export function navError(e, code) {
  assert.ok(e instanceof H.vm.SourceNavigationError);
  assert.equal(e.name, "SourceNavigationError");
  assert.equal(e.code, code);
  assert.equal(typeof e.message, "string");
}
export function positionError(e, code) {
  assert.ok(e instanceof H.vm.SourcePositionError);
  assert.equal(e.code, code);
}
export async function documentStart(
  c,
  method = "load",
  ref = "B-nav-target",
  kind = "definition",
) {
  const o = method === "load" ? call(c, method, ref, kind) : call(c, method);
  assert.equal(c.m.state.document.status, "pending");
  assert.equal(c.m.state.candidates, null);
  assert.equal(c.m.state.refresh, null);
  const q = await c.wire.next("obj.source");
  assert.ok(q);
  return { o, q, ref, kind };
}
export async function documentReply(
  c,
  t,
  text = "ab中😀\r\nZ",
  changed = false,
) {
  const span = H.span(H.point(0), H.point(0));
  c.wire.ok(t.q, span);
  const q = await c.wire.next("source.read");
  assert.ok(q);
  c.wire.ok(q, H.read(text, changed ? H.hashB : H.hashA, !changed));
}
export async function documentFinish(
  c,
  t,
  text = "ab中😀\r\nZ",
  changed = false,
) {
  await documentReply(c, t, text, changed);
  await ok(t.o);
  const s = invariant(c);
  assert.equal(s.document.status, "success");
  const d = s.document.data;
  assert.equal(d.source, c.calls.findLast((x) => x.method === "source").reply);
  assert.equal(
    d.content,
    c.calls.findLast((x) => x.method === "readSource").reply,
  );
  return d;
}
export async function document(c, text, changed = false) {
  return documentFinish(c, await documentStart(c), text, changed);
}
export async function candidateStart(
  c,
  doc = c.m.state.document.data,
  offset = 0,
  method = "locate",
) {
  const o =
    method === "locate" ? call(c, method, doc, offset) : call(c, method);
  assert.equal(c.m.state.candidates.state.status, "pending");
  const q = await c.wire.next("source.resolve");
  assert.ok(q);
  return { o, q, doc, offset };
}
export async function candidateFinish(
  c,
  t,
  { items = [hit()], next, completeness = complete } = {},
) {
  c.wire.ok(t.q, C.page(items, next), completeness);
  await ok(t.o);
  const b = c.m.state.candidates;
  assert.equal(b.document, t.doc);
  assert.equal(b.state.status, "success");
  assert.equal(
    b.state.pages.at(-1),
    c.calls.findLast((x) => x.method === "resolveSource").reply,
  );
  invariant(c);
  return b;
}
export function ready(c) {
  const before = snapshot(c);
  assert.doesNotThrow(() => c.wire.emit({ event: "index", state: "ready" }));
  // The SDK callback records only: no synchronous reload or external notification.
  unchanged(c, before);
}
export async function noAuto(c, before = c.wire.queries.length) {
  await turn();
  await turn();
  assert.equal(c.wire.queries.length, before);
}
export async function autoStart(c) {
  const q = await c.wire.next("source.resolve");
  assert.ok(q);
  const r = c.m.state.refresh;
  assert.ok(r);
  const o = track(c, r.completion);
  assert.equal(c.m.state.candidates.state.status, "pending");
  assert.equal(q.params.cursor, "");
  assert.equal(r.document, c.m.state.document.data);
  invariant(c);
  return { q, o, r, doc: r.document, offset: r.utf16Offset };
}
export async function autoFinish(c, t, completeness = complete, next) {
  c.wire.ok(t.q, C.page([hit(1)], next), completeness);
  await ok(t.o);
  invariant(c);
  return t.r;
}
export async function partialBound(c) {
  const d = await document(c);
  await candidateFinish(c, await candidateStart(c, d), {
    completeness: partial,
  });
  return d;
}
export async function refreshed(c) {
  const d = await partialBound(c);
  ready(c);
  const a = await autoStart(c);
  await autoFinish(c, a);
  return { d, a };
}
export async function sdkAlive(c) {
  const p = c.client.resolveSource(
    { file: "B-source-file/尾", line: 99 },
    { limit: 1 },
  );
  p.catch(() => {});
  const q = await c.wire.next("source.resolve", (q) => q.params.line === 99);
  c.wire.ok(q, C.page([]));
  assert.deepEqual((await p).result.items, []);
}
export async function publicMethodFault(Class, method, replacement, fn) {
  // Explicit PUBLIC-method fault injection, not a fake model or ordinary wire.
  const own = Object.getOwnPropertyDescriptor(Class.prototype, method);
  let reached = false;
  Object.defineProperty(Class.prototype, method, {
    configurable: true,
    writable: true,
    enumerable: own?.enumerable ?? false,
    value: function (...args) {
      reached = true;
      return replacement.apply(this, args);
    },
  });
  try {
    return await fn(() =>
      assert.ok(
        reached,
        "B fault facility unsupported: owned public method did not pass through decorated prototype; NOT a product defect",
      ),
    );
  } finally {
    if (own) Object.defineProperty(Class.prototype, method, own);
    else delete Class.prototype[method];
  }
}
