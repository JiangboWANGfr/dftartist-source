// Agent B public SDK harness, DESIGN 5.6 and 6.6.5.
// This is a controlled Transport, never a substitute TreeModel/HierClient.
import assert from "node:assert/strict";
import { HierClient, HierError } from "@hier/client";
import * as vm from "@hier/viewmodel";
export { HierError, vm };
export const guard = { timeout: 20000 }; // Test bound, not a product SLA.
export const complete = { status: "complete", reasons: [] };
export const watch = (p) => {
  p.catch(() => {});
  return p;
};
export const info = (ref, name, path, childCount = 0) => ({
  ref,
  name,
  path,
  pathText: path.map((x) => "\\" + x + " ").join("."),
  kind: "module",
  def: "B-definition",
  defName: "B_tree_fixture",
  childCount,
  hasParamOverrides: false,
});
export const root = (count) => info("B-root", "top", ["top"], count);
export const child = (ref, tail = [ref], count = 0) =>
  info(ref, tail.at(-1), ["top", ...tail], count);
export const snapshot = (roots = [root(1)], id = "B-tree-snapshot") => ({
  protocol: 2,
  schemaVersion: 7,
  snapshotId: id,
  inputHash: "0123456789abcdef".repeat(4),
  inputHashComplete: true,
  frontend: { name: "slang", version: "B-public-fixture" },
  bodySharing: "fast",
  tops: roots,
  definitionCount: 1,
  bodyCount: 1,
  indexState: "building",
  openedAt: "2000-02-29T23:59:59.123Z",
  topCandidates: roots.map((x) => x.ref),
});
export const object = (ref, inst = ref, kind = "instance") => ({
  ref,
  inst,
  kind,
  name: "B-object",
  pathText: "\\B-object ",
});
export const local = (code) => (error) => {
  assert.ok(error instanceof vm.TreeError);
  assert.equal(error.code, code);
  assert.ok(error.message.length > 0);
  return true;
};
export const remote =
  (code, origin = "core") =>
  (error) => {
    assert.ok(error instanceof HierError);
    assert.equal(error.code, code);
    assert.equal(error.origin, origin);
    assert.ok(error.message.length > 0);
    return true;
  };
export function capability() {
  assert.equal(typeof vm.TreeModel, "function", "M5 must export TreeModel");
  assert.equal(typeof vm.TreeError, "function", "M5 must export TreeError");
}
export function invoke(tree, name, ...args) {
  let p;
  assert.doesNotThrow(() => {
    p = tree[name](...args);
  });
  assert.ok(
    p && typeof p.then === "function" && typeof p.catch === "function",
    name + " must return a rejectable Promise, not synchronously throw",
  );
  return watch(p);
}
export class ControlledTransport {
  sent = [];
  messages = new Set();
  closes = new Set();
  waits = [];
  claimed = new Set();
  closed = false;
  registrations = [];
  onMessage(handler) {
    this.registrations.push("message");
    const token = { handler };
    this.messages.add(token);
    return () => this.messages.delete(token);
  }
  onClose(handler) {
    this.registrations.push("close");
    const token = { handler };
    this.closes.add(token);
    return () => this.closes.delete(token);
  }
  send(frame) {
    assert.equal(this.closed, false, "closed harness must not send");
    this.sent.push(structuredClone(frame));
    this.flush();
  }
  emit(frame) {
    if (!this.closed)
      for (const token of [...this.messages])
        if (this.messages.has(token)) token.handler(structuredClone(frame));
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const token of [...this.closes])
      if (this.closes.has(token)) token.handler(new Error("B controlled EOF"));
  }
  get queries() {
    return this.sent.filter((x) => x.method !== "cancel");
  }
  get cancels() {
    return this.sent.filter((x) => x.method === "cancel");
  }
  flush() {
    for (const waiter of [...this.waits]) {
      const r = this.sent.find(
        (x) =>
          !this.claimed.has(x) &&
          x.method === waiter.method &&
          waiter.predicate(x),
      );
      if (r) {
        this.claimed.add(r);
        this.waits.splice(this.waits.indexOf(waiter), 1);
        waiter.resolve(r);
      }
    }
  }
  next(method, predicate = () => true) {
    return new Promise((resolve) => {
      this.waits.push({ method, predicate, resolve });
      this.flush();
    });
  }
  ok(request, result, completeness = complete) {
    this.emit({ id: request.id, ok: true, result, completeness });
  }
  fail(
    request,
    code = "not_found",
    message = "B Core failure",
    data = { ref: "B-missing", nested: { values: [1, 2] } },
  ) {
    this.emit({ id: request.id, ok: false, error: { code, message, data } });
  }
}
export async function sdk(
  t,
  roots = [root(1)],
  id = "B-tree-snapshot",
  ready = true,
) {
  const wire = new ControlledTransport();
  const client = new HierClient(wire, { cacheEntries: 0 });
  watch(client.ready);
  const ctx = { wire, client, roots, models: [], snap: snapshot(roots, id) };
  t.after(() => {
    for (const model of ctx.models) model.dispose();
    client.dispose();
  });
  if (ready) {
    wire.emit({
      event: "hello",
      protocol: 2,
      snapshot: ctx.snap,
      capabilities: ["cancel", "progress"],
    });
    assert.deepEqual(await client.ready, ctx.snap);
  }
  return ctx;
}
export async function model(t, { childCount = 1, roots, options, id } = {}) {
  capability();
  const ctx = await sdk(
    t,
    roots ?? [root(childCount)],
    id ?? "B-tree-snapshot",
  );
  ctx.tree = new vm.TreeModel(ctx.client, options);
  ctx.models.push(ctx.tree);
  return ctx;
}
export const instances = (tree) =>
  tree.rows.filter((r) => r.kind === "instance");
export const scopes = (tree) => tree.rows.filter((r) => r.kind === "scope");
export function row(tree, ref) {
  const value = instances(tree).find((r) => r.instance.ref === ref);
  assert.ok(value, "visible instance " + ref);
  return value;
}
export function scope(tree, path) {
  const value = scopes(tree).find(
    (r) =>
      r.scopePath.length === path.length &&
      r.scopePath.every((x, n) => x === path[n]),
  );
  assert.ok(value, "visible scope " + JSON.stringify(path));
  return value;
}
export function status(tree, owner = null) {
  const all = tree.rows.filter((r) => r.kind === "status" && r.owner === owner);
  assert.equal(all.length, 1);
  assert.equal(all[0].parentId, owner);
  return all[0];
}
export async function load(ctx) {
  const p = invoke(ctx.tree, "loadRoots"),
    q = await ctx.wire.next("inst.roots");
  assert.deepEqual(q.params, {});
  ctx.wire.ok(q, ctx.roots);
  await p;
  return ctx;
}
export async function first(ctx, ref, items, next) {
  const r = row(ctx.tree, ref),
    p = invoke(ctx.tree, "setExpanded", r.id, true);
  assert.equal(row(ctx.tree, ref).expanded, true);
  const q = await ctx.wire.next("inst.children", (x) => x.params.inst === ref);
  // Transport sees SDK-normalized params, not Tree's original PageReq.
  // DESIGN 5.6.3/5.6.6 and Schema RequestCursor.default define this first page.
  assert.equal(q.params.cursor, "");
  ctx.wire.ok(q, next === undefined ? { items } : { items, next });
  await p;
  return q;
}
export async function more(ctx, ref, items, next, expectedCursor) {
  const p = invoke(ctx.tree, "loadMore", row(ctx.tree, ref).id);
  const q = await ctx.wire.next("inst.children", (x) => x.params.inst === ref);
  if (expectedCursor !== undefined)
    assert.equal(q.params.cursor, expectedCursor);
  ctx.wire.ok(q, next === undefined ? { items } : { items, next });
  await p;
  return q;
}
export function frozen(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const part of Object.values(value)) frozen(part, seen);
}
