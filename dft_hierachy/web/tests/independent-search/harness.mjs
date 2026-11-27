// Thin B adaptation: accepted original scope owns real SDK/models and rollback.
import assert from "node:assert/strict";
import {
  boot as oldBoot,
  context as oldContext,
  releaseAll,
  sdk as oldSDK,
  vm as oldVM,
  protocol as oldProtocol,
  product as oldProduct,
  observe,
  tick,
  rawSnapshot,
  Wire,
  opaque,
} from "../independent-source-candidates/harness.mjs";
import { Q, hits, page, complete, partial, kinds } from "./input.mjs";
export {
  releaseAll,
  observe,
  tick,
  rawSnapshot,
  Wire,
  opaque,
  Q,
  hits,
  page,
  complete,
  partial,
  kinds,
};
export let sdk, vm, protocol, product;
export async function boot(required = true) {
  await oldBoot(false);
  sdk = oldSDK;
  vm = oldVM;
  protocol = oldProtocol;
  product = oldProduct;
  if (required) {
    assert.equal(
      typeof vm.SearchModel,
      "function",
      "missing public SearchModel",
    );
    assert.equal(
      typeof vm.SearchError,
      "function",
      "missing public SearchError",
    );
  }
}
export function invoke(c, method, ...args) {
  let p;
  assert.doesNotThrow(() => {
    p = c.m[method](...args);
  });
  assert(
    p && typeof p.then === "function" && typeof p.catch === "function",
    "original Promise command",
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
  assert(e instanceof vm.SearchError);
  assert.equal(e.code, code);
}
export function state(c, status, query = Q, pages) {
  const s = c.m.state;
  assert.equal(s.status, status);
  assert.deepEqual(s.query, query);
  if (pages !== undefined) assert.deepEqual(s.pages, pages);
  assert(Object.isFrozen(s));
  assert(Object.isFrozen(s.pages));
  if (s.query) {
    assert(Object.isFrozen(s.query));
    if (s.query.kinds) assert(Object.isFrozen(s.query.kinds));
  }
  for (const k of ["items", "count", "next"])
    assert.equal(Object.hasOwn(s, k), false, "no second page authority");
  if (["idle", "pending", "success"].includes(status))
    assert.equal(Object.hasOwn(s, "error"), false);
  return s;
}
export async function context({ withModel = true, options, ...opts } = {}) {
  const c = await oldContext({
      ...opts,
      id: opts.id ?? Q.snapshotId,
      withModel: false,
    }),
    restores = [],
    close = c.close;
  let closing;
  c.close = () =>
    (closing ??= (async () => {
      try {
        return await close();
      } finally {
        for (const r of restores.reverse()) r();
      }
    })());
  try {
    for (const method of ["search", "resolvePath"]) {
      const descriptor = Object.getOwnPropertyDescriptor(c.client, method),
        original = c.client[method];
      Object.defineProperty(c.client, method, {
        configurable: true,
        writable: true,
        value: function (...args) {
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
          } catch (error) {
            call.thrown = error;
            throw error;
          }
        },
      });
      restores.push(() =>
        descriptor
          ? Object.defineProperty(c.client, method, descriptor)
          : Reflect.deleteProperty(c.client, method),
      );
    }
    c.newModel = (opts = options) => {
      const m = new vm.SearchModel(c.client, opts);
      c.models.push(m);
      return m;
    };
    if (withModel) {
      c.m = c.newModel();
      c.m.subscribe(() => c.events.push(c.m.state));
    }
    return c;
  } catch (error) {
    await c.close();
    throw error;
  }
}
export async function using(fn, options) {
  const c = await context(options);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}
export const calls = (c) => c.calls.filter((x) => x.method === "search");
export async function begin(c, query = Q, method = "load") {
  const previous = new Set(c.wire.queries),
    o = method === "load" ? invoke(c, "load", query) : invoke(c, method);
  state(c, "pending", c.m.state.query);
  const q = await c.wire.next("search", (q) => !previous.has(q));
  assert(q);
  return { o, q, query: c.m.state.query };
}
export async function finish(c, t, value = page([]), completeness = complete) {
  c.wire.ok(t.q, value, completeness);
  await success(t.o);
  state(c, "success", t.query);
  assert.equal(
    c.m.state.pages.at(-1),
    calls(c).at(-1).reply,
    "original SDK Reply",
  );
  return c.m.state;
}
export function first(c, t) {
  const a = calls(c).at(-1).args;
  assert.equal(Object.hasOwn(a[0], "snapshotId"), false);
  assert.equal(Object.hasOwn(a[1], "cursor"), false);
  assert(a[2] instanceof AbortSignal);
  assert.equal(t.q.params.cursor, "", "Schema RequestCursor default");
}
export async function sdkAlive(c) {
  const p = c.client.search({ text: "B60 alive" }, { limit: 1 });
  p.catch(() => {});
  const q = await c.wire.next("search", (q) => q.params.text === "B60 alive");
  c.wire.ok(q, page([]));
  assert.deepEqual((await p).result.items, []);
}
