// Thin use of original accepted B scope; actual public model only.
import assert from "node:assert/strict";
import {
  boot as originalBoot,
  context as originalContext,
  sdk as SDK,
  vm as VM,
  protocol as Protocol,
  product as Product,
  releaseAll,
  observe,
  tick,
  opaque,
  Wire,
  rawSnapshot,
} from "../independent-source-candidates/harness.mjs";
import { Q, refs, complete, partial } from "./input.mjs";
export {
  releaseAll,
  observe,
  tick,
  opaque,
  Wire,
  rawSnapshot,
  Q,
  refs,
  complete,
  partial,
};
export let sdk, vm, protocol, product;
export async function boot(required = true) {
  await originalBoot(false);
  sdk = SDK;
  vm = VM;
  protocol = Protocol;
  product = Product;
  if (required) {
    assert.equal(
      typeof vm.PathResolutionModel,
      "function",
      "missing public PathResolutionModel",
    );
    assert.equal(
      typeof vm.PathResolutionError,
      "function",
      "missing public PathResolutionError",
    );
  }
}
export async function context({ withModel = true, ...opts } = {}) {
  const c = await originalContext({
    ...opts,
    id: opts.id ?? Q.snapshotId,
    withModel: false,
  });
  const d = Object.getOwnPropertyDescriptor(c.client, "resolvePath"),
    original = c.client.resolvePath;
  Object.defineProperty(c.client, "resolvePath", {
    configurable: true,
    writable: true,
    value: function (...args) {
      const call = { method: "resolvePath", args };
      c.calls.push(call);
      try {
        const p = Reflect.apply(original, this, args);
        call.promise = p;
        p.then(
          (r) => {
            call.reply = r;
          },
          (e) => {
            call.error = e;
          },
        );
        return p;
      } catch (e) {
        call.error = e;
        throw e;
      }
    },
  });
  const close = c.close;
  c.close = () => {
    d
      ? Object.defineProperty(c.client, "resolvePath", d)
      : Reflect.deleteProperty(c.client, "resolvePath");
    return close();
  };
  try {
    c.newModel = () => {
      const m = new vm.PathResolutionModel(c.client);
      c.models.push(m);
      return m;
    };
    if (withModel) {
      c.m = c.newModel();
      c.m.subscribe(() => c.events.push(c.m.state));
    }
    return c;
  } catch (e) {
    await c.close();
    throw e;
  }
}
export async function using(fn, opts) {
  const c = await context(opts);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}
export function track(c, p) {
  const o = observe(p);
  c.commands.push(o);
  return o;
}
export function invoke(c, name, ...args) {
  let p;
  assert.doesNotThrow(() => {
    p = c.m[name](...args);
  });
  assert(
    p && typeof p.then === "function" && typeof p.catch === "function",
    "Promise command",
  );
  return track(c, p);
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
  assert(e instanceof vm.PathResolutionError);
  assert.equal(e.code, code);
}
export const calls = (c) => c.calls.filter((x) => x.method === "resolvePath");
export function state(c, status, q = Q) {
  const s = c.m.state;
  assert.equal(s.status, status);
  assert.deepEqual(s.query, q);
  assert(Object.isFrozen(s));
  if (s.query) assert(Object.isFrozen(s.query));
  assert.equal(Object.hasOwn(s, "reply"), status === "success");
  assert.equal(
    Object.hasOwn(s, "error"),
    ["failed", "cancelled"].includes(status),
  );
  for (const key of ["pages", "items", "next", "count"])
    assert.equal(Object.hasOwn(s, key), false);
  return s;
}
export async function begin(c, q = Q, name = "load") {
  const before = new Set(c.wire.queries),
    o = name === "load" ? invoke(c, name, q) : invoke(c, name);
  state(c, "pending", c.m.state.query);
  const request = await c.wire.next("path.resolve", (r) => !before.has(r));
  assert(request);
  return { o, q: request, query: c.m.state.query };
}
export async function finish(c, t, result = refs(), comp = complete) {
  c.wire.ok(t.q, result, comp);
  await success(t.o);
  state(c, "success", t.query);
  assert.equal(
    c.m.state.reply,
    calls(c).at(-1).reply,
    "original SDK Reply identity",
  );
  return c.m.state;
}
export function first(c, t) {
  const a = calls(c).at(-1).args;
  assert.equal(a.length, 2);
  assert.equal(a[0], t.query.text);
  assert(a[1] instanceof AbortSignal);
  assert.deepEqual(t.q.params, { text: t.query.text });
}
export async function sdkAlive(c) {
  const p = c.client.resolvePath("B68-still-alive");
  p.catch(() => {});
  const q = await c.wire.next(
    "path.resolve",
    (r) => r.params.text === "B68-still-alive",
  );
  c.wire.ok(q, []);
  assert.deepEqual((await p).result, []);
}
