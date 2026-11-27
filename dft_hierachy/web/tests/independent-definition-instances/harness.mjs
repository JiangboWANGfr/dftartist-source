// Thin adaptation of accepted B candidate scope; real SDK/models only.
import assert from "node:assert/strict";
import {
  boot as oldBoot,
  context as oldContext,
  sdk as oldSDK,
  vm as oldVM,
  protocol as oldProtocol,
  product as oldProduct,
  releaseAll,
  observe,
  tick,
  opaque,
  Wire,
  rawSnapshot,
} from "../independent-source-candidates/harness.mjs";
import { Q, item, page, complete, partial, instKinds } from "./input.mjs";
export {
  releaseAll,
  observe,
  tick,
  opaque,
  Wire,
  rawSnapshot,
  Q,
  item,
  page,
  complete,
  partial,
  instKinds,
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
      typeof vm.DefinitionInstancesModel,
      "function",
      "missing public DefinitionInstancesModel",
    );
    assert.equal(
      typeof vm.DefinitionInstancesError,
      "function",
      "missing public DefinitionInstancesError",
    );
  }
}
export async function context({ withModel = true, options, ...opts } = {}) {
  const c = await oldContext({
    ...opts,
    id: opts.id ?? Q.snapshotId,
    withModel: false,
  });
  try {
    c.newModel = (value = options) => {
      const m = new vm.DefinitionInstancesModel(c.client, value);
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
export async function using(fn, options) {
  const c = await context(options);
  try {
    return await fn(c);
  } finally {
    await c.close();
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
  return track(c, p);
}
export function track(c, p) {
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
  assert(e instanceof vm.DefinitionInstancesError);
  assert.equal(e.code, code);
}
export const calls = (c) => c.calls.filter((x) => x.method === "instancesOf");
export function state(c, status, query = Q, pages) {
  const s = c.m.state;
  assert.equal(s.status, status);
  assert.deepEqual(s.query, query);
  if (pages !== undefined) assert.deepEqual(s.pages, pages);
  assert(Object.isFrozen(s));
  assert(Object.isFrozen(s.pages));
  if (s.query) assert(Object.isFrozen(s.query));
  for (const k of ["items", "count", "next"])
    assert.equal(Object.hasOwn(s, k), false);
  if (["idle", "pending", "success"].includes(status))
    assert.equal(Object.hasOwn(s, "error"), false);
  return s;
}
export async function begin(c, query = Q, method = "load") {
  const previous = new Set(c.wire.queries),
    o = method === "load" ? invoke(c, "load", query) : invoke(c, method);
  state(c, "pending", c.m.state.query);
  const q = await c.wire.next("def.instances", (q) => !previous.has(q));
  assert(q);
  return { o, q, query: c.m.state.query };
}
export async function finish(c, t, value = page(), completeness = complete) {
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
export function first(c, t, limit = 200) {
  const a = calls(c).at(-1).args;
  assert.equal(a[0], t.query.def);
  assert.deepEqual(a[1], { limit });
  assert(a[2] instanceof AbortSignal);
  assert.equal(t.q.params.cursor, "");
  assert.equal(Object.hasOwn(t.q.params, "snapshotId"), false);
}
export async function sdkAlive(c) {
  const p = c.client.instancesOf(Q.def, { limit: 1 });
  p.catch(() => {});
  const q = await c.wire.next("def.instances");
  c.wire.ok(q, page([]));
  assert.deepEqual((await p).result.items, []);
}
