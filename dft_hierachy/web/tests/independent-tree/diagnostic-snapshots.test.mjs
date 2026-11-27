// Agent B independent diagnostic ownership oracle: DESIGN 6.6.2/6.6.3.
// Inputs use the public Transport/HierError boundary, never a substituted SDK.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HierClient, HierError } from "@hier/client";
import {
  ControlledTransport,
  capability,
  vm,
  guard,
  watch,
  snapshot,
  root,
  child,
  object,
  invoke,
  load,
  row,
  frozen,
  remote,
} from "./harness.mjs";

class DiagnosticTransport extends ControlledTransport {
  failConnection(error) {
    this.closed = true;
    for (const token of [...this.closes])
      if (this.closes.has(token)) token.handler(error);
  }
}
async function context(t) {
  capability();
  const wire = new DiagnosticTransport();
  const client = new HierClient(wire, { cacheEntries: 0 });
  watch(client.ready);
  let tree;
  t.after(() => {
    tree?.dispose();
    client.dispose();
  });
  const roots = [root(1)];
  wire.emit({
    event: "hello",
    protocol: 2,
    snapshot: snapshot(roots),
    capabilities: ["cancel", "progress"],
  });
  await client.ready;
  tree = new vm.TreeModel(client);
  return { wire, client, tree, roots };
}
const state = (c, method) =>
  method === "roots"
    ? c.tree.rootState
    : method === "children"
      ? row(c.tree, "B-root").children
      : c.tree.revealState;
async function begin(c, method) {
  if (method === "children") await load(c);
  let p, q, payload;
  if (method === "roots") {
    p = invoke(c.tree, "loadRoots");
    q = await c.wire.next("inst.roots");
    payload = c.roots;
  } else if (method === "children") {
    p = invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, true);
    q = await c.wire.next("inst.children");
    payload = { items: [child("B-target")] };
  } else {
    p = invoke(c.tree, "reveal", "B-target");
    q = await c.wire.next("obj.get");
    payload = object("B-target");
    if (method === "ancestors") {
      c.wire.ok(q, payload);
      q = await c.wire.next("inst.ancestors");
      payload = c.roots;
    }
  }
  return { p, q, payload };
}
const diagnosticData = () => ({
  messageTag: "B original",
  nested: { values: [1, { text: "B unchanged" }] },
  arrays: [[2]],
});
async function caught(p, predicate) {
  let original;
  await assert.rejects(p, (error) => {
    original = error;
    return predicate(error);
  });
  return original;
}
function fields(failure, original) {
  assert.equal(failure.code, original.code);
  assert.equal(failure.origin, original.origin);
  assert.equal(failure.message, original.message);
  assert.deepEqual(failure.data, original.data);
}
function mutableOriginal(original, data) {
  assert.equal(
    Object.isFrozen(original),
    false,
    "do not freeze the rejected Error",
  );
  assert.equal(Object.isFrozen(data), false, "do not freeze caller's data");
  assert.equal(Object.isFrozen(data.nested), false);
  assert.equal(Object.isFrozen(data.nested.values), false);
  assert.equal(Object.isFrozen(data.nested.values[1]), false);
}
for (const method of ["roots", "children", "object"]) {
  test(
    "D01: mutable transport diagnostic is owned and deeply frozen for " +
      method,
    guard,
    async (t) => {
      const c = await context(t),
        { p } = await begin(c, method);
      const input = diagnosticData();
      const original = new HierError(
        "transport_closed",
        "transport",
        "B connection failure",
        input,
      );
      c.wire.failConnection(original);
      const rejected = await caught(p, (error) => {
        assert.strictEqual(
          error,
          original,
          "Tree retains the original SDK HierError",
        );
        return remote("transport_closed", "transport")(error);
      });
      const published = state(c, method);
      assert.equal(published.status, "failed");
      fields(published.error, rejected);
      mutableOriginal(original, input);
      assert.notStrictEqual(
        published.error.data,
        input,
        "mutable data cannot be borrowed",
      );
      frozen(published);
      assert.equal(c.wire.queries.length, method === "children" ? 2 : 1);
    },
  );
  test(
    "D02: old transport diagnostic is stable through caller mutation and dispose for " +
      method,
    guard,
    async (t) => {
      const c = await context(t);
      let notifications = 0;
      c.tree.subscribe(() => {
        notifications++;
      });
      const { p } = await begin(c, method),
        input = diagnosticData();
      const expected = structuredClone(input);
      const original = new HierError(
        "transport_closed",
        "transport",
        "B connection failure",
        input,
      );
      c.wire.failConnection(original);
      await caught(p, (error) => {
        assert.strictEqual(error, original);
        return remote("transport_closed", "transport")(error);
      });
      const old = state(c, method),
        count = notifications;
      input.nested.values[0] = 99;
      input.nested.values[1].text = "B later mutation";
      input.arrays[0].push(3);
      input.newKey = "B added later";
      original.extraProperty = "caller can still annotate error";
      assert.equal(
        notifications,
        count,
        "caller mutation is not a model state publication",
      );
      c.tree.dispose();
      assert.equal(notifications, count, "dispose emits no notification");
      assert.deepEqual(c.tree.rootState, { status: "idle", loadedCount: 0 });
      assert.deepEqual(c.tree.revealState, { status: "idle" });
      assert.deepEqual(c.tree.rows, []);
      assert.deepEqual(
        old.error.data,
        expected,
        "already published diagnostic must not change",
      );
      assert.equal(old.error.code, "transport_closed");
      mutableOriginal(original, input);
      frozen(old);
    },
  );
}
for (const method of ["roots", "children", "object"]) {
  test(
    "D03: SDK disposed diagnostic remains original rejection but published data is owned for " +
      method,
    guard,
    async (t) => {
      const c = await context(t);
      if (method === "children") await load(c);
      const count = c.wire.queries.length;
      c.client.dispose();
      const p =
        method === "roots"
          ? invoke(c.tree, "loadRoots")
          : method === "children"
            ? invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, true)
            : invoke(c.tree, "reveal", "B-target");
      const original = await caught(p, remote("disposed", "client"));
      assert.equal(Object.isFrozen(original), false);
      assert.equal(
        Object.isFrozen(original.data),
        false,
        "Tree must not freeze SDK Error.data",
      );
      const old = state(c, method),
        expected = structuredClone(original.data);
      assert.equal(old.status, "failed");
      fields(old.error, original);
      original.data.B_later = true;
      assert.deepEqual(old.error.data, expected);
      frozen(old);
      assert.equal(
        c.wire.queries.length,
        count,
        "closed SDK produces no wire query",
      );
    },
  );
}
for (const method of ["roots", "children", "object", "ancestors"]) {
  test(
    "D04: method-invalid partial produces deeply immutable client diagnostic for " +
      method,
    guard,
    async (t) => {
      const c = await context(t),
        { p, q, payload } = await begin(c, method);
      c.wire.ok(q, payload, {
        status: "partial",
        reasons: [{ code: "unsupported" }],
      });
      const original = await caught(p, remote("protocol_error", "client"));
      assert.equal(c.wire.closed, true);
      assert.equal(Object.isFrozen(original), false);
      assert.equal(
        Object.isFrozen(original.data),
        false,
        "do not freeze SDK Error.data",
      );
      const old = state(c, method),
        expected = structuredClone(original.data);
      assert.equal(old.status, "failed");
      fields(old.error, original);
      original.data.B_later = { values: [99] };
      assert.deepEqual(old.error.data, expected);
      frozen(old);
      assert.equal(
        c.wire.queries.length,
        method === "children" || method === "ancestors" ? 2 : 1,
        "protocol failure must not start a follow-up query",
      );
    },
  );
  test(
    "D05: existing Core diagnostic positive control stays deeply frozen and preserves fields for " +
      method,
    guard,
    async (t) => {
      const c = await context(t),
        { p, q } = await begin(c, method);
      const input = diagnosticData(),
        expected = structuredClone(input);
      c.wire.fail(q, "not_found", "B source-controlled Core message", input);
      const original = await caught(p, remote("not_found", "core"));
      const old = state(c, method);
      assert.equal(old.status, "failed");
      fields(old.error, original);
      assert.deepEqual(old.error.data, expected);
      frozen(old);
      assert.equal(Object.isFrozen(original), false);
      assert.equal(Object.isFrozen(input), false);
      input.nested.values[0] = 99;
      input.arrays[0].push(3);
      assert.deepEqual(old.error.data, expected);
      c.tree.dispose();
      assert.deepEqual(old.error.data, expected);
      assert.equal(
        c.wire.closed,
        false,
        "Tree borrows the SDK and never closes it",
      );
    },
  );
}
