import assert from "node:assert/strict";
import { test } from "node:test";
import { HierError } from "@hier/client";
import {
  model,
  watch,
  load,
  row,
  object,
} from "../independent-tree/harness.mjs";

// A supplemental ownership cases; B's independent oracle stays unchanged.
async function failRoots(c, data) {
  const pending = watch(c.tree.loadRoots());
  await c.wire.next("inst.roots");
  const original = new HierError(
    "transport_closed",
    "transport",
    "A diagnostic ownership case",
    data,
  );
  for (const token of [...c.wire.closes]) token.handler(original);
  await assert.rejects(pending, (error) => error === original);
  assert.equal(c.tree.rootState.status, "failed");
  assert.equal(Object.isFrozen(original), false);
  return c.tree.rootState.error.data;
}

test("A Tree: shallow-frozen diagnostic still owns its mutable descendants", async (t) => {
  const c = await model(t);
  const nested = { values: [1, { label: "before" }] };
  const input = Object.freeze({ nested });
  const published = await failRoots(c, input);
  assert.notStrictEqual(published, input);
  assert.notStrictEqual(published.nested, nested);
  assert.equal(Object.isFrozen(published.nested.values[1]), true);
  nested.values[1].label = "after";
  nested.values.push(2);
  c.tree.dispose();
  assert.deepEqual(published, {
    nested: { values: [1, { label: "before" }] },
  });
  assert.equal(Object.isFrozen(nested.values), false);
});

test("A Tree: diagnostic special keys and shared fields remain owned data", async (t) => {
  const c = await model(t);
  const input = JSON.parse('{"__proto__":{"value":1},"constructor":[2]}');
  input.alias = input.__proto__;
  const published = await failRoots(c, input);
  assert.equal(Object.hasOwn(published, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(published), Object.prototype);
  assert.deepEqual(published, input);
  assert.notStrictEqual(published.alias, input.alias);
  assert.equal(Object.isFrozen(published.alias), true);
  assert.equal(Object.isFrozen(published.constructor), true);
  input.alias.value = 99;
  input.constructor.push(3);
  assert.equal(published.__proto__.value, 1);
  assert.equal(published.alias.value, 1);
  assert.deepEqual(published.constructor, [2]);
});

for (const unreadable of [false, true])
  test(`A Tree: deep diagnostic capture avoids stack limits, unreadable=${unreadable}`, async (t) => {
    const c = await model(t);
    const depth = 12000;
    const input = {};
    let source = input;
    for (let index = 0; index < depth; index++) source = source.next = {};
    if (unreadable)
      Object.defineProperty(source, "value", {
        enumerable: true,
        get() {
          throw undefined;
        },
      });
    else source.value = "original";
    const published = await failRoots(c, input);
    if (unreadable) {
      assert.deepEqual(published, {});
      const issue = c.tree.rootState.error.dataIssue;
      assert.equal(issue.operation, "read");
      assert.deepEqual(issue.path, [...Array(depth).fill("next"), "value"]);
      assert.equal(Object.isFrozen(issue.path), true);
    } else {
      let owned = published;
      for (let index = 0; index < depth; index++) {
        assert.equal(Object.isFrozen(owned), true);
        owned = owned.next;
      }
      source.value = "changed";
      assert.equal(owned.value, "original");
      assert.equal(Object.isFrozen(owned), true);
      assert.equal(Object.hasOwn(c.tree.rootState.error, "dataIssue"), false);
    }
  });

for (const children of [false, true])
  test(`A Tree: dispose in diagnostics retains all waiter causes and pending observer errors, children=${children}`, async (t) => {
    const c = await model(t);
    if (children) await load(c);
    const marker = { observer: "pending" };
    let notifications = 0;
    c.tree.subscribe(() => {
      notifications++;
      throw marker;
    });
    const request = () =>
      children
        ? c.tree.setExpanded(row(c.tree, "B-root").id, true)
        : c.tree.loadRoots();
    const first = watch(request());
    const second = watch(request());
    await c.wire.next(children ? "inst.children" : "inst.roots");
    let tailReads = 0;
    const original = new HierError(
      "transport_closed",
      "transport",
      "A shared failure",
      {
        get detail() {
          c.tree.dispose();
          throw undefined;
        },
        get tail() {
          tailReads++;
          return 1;
        },
      },
    );
    for (const token of [...c.wire.closes]) token.handler(original);
    await assert.rejects(first, (error) => {
      assert.equal(error.code, "disposed");
      assert.ok(error.cause instanceof AggregateError);
      assert.deepEqual(error.cause.errors, [marker]);
      assert.strictEqual(error.cause.cause, original);
      return true;
    });
    await assert.rejects(
      second,
      (error) => error.code === "disposed" && error.cause === original,
    );
    assert.equal(notifications, 1);
    assert.equal(tailReads, 0);
    assert.deepEqual(c.tree.rows, []);
    assert.deepEqual(c.tree.rootState, { status: "idle", loadedCount: 0 });
  });

test(
  "A Tree: dispose during a shared manual page failure preserves reveal's original cause",
  { timeout: 20000 },
  async (t) => {
    const c = await model(t);
    await load(c);
    const page = watch(c.tree.reload(row(c.tree, "B-root").id));
    await c.wire.next("inst.children");
    let expanded;
    const expansion = new Promise((resolve) => {
      expanded = resolve;
    });
    c.tree.subscribe(() => {
      if (
        row(c.tree, "B-root").expanded &&
        c.tree.revealState.status === "pending"
      )
        expanded();
    });
    const reveal = watch(c.tree.reveal("target"));
    c.wire.ok(await c.wire.next("obj.get"), object("target"));
    c.wire.ok(await c.wire.next("inst.ancestors"), c.roots);
    // The reveal opens its ancestor, then joins the existing page in the same turn.
    await expansion;
    const original = new HierError(
      "transport_closed",
      "transport",
      "A shared page/reveal",
      {
        get detail() {
          c.tree.dispose();
          return 1;
        },
      },
    );
    for (const token of [...c.wire.closes]) token.handler(original);
    for (const pending of [page, reveal])
      await assert.rejects(
        pending,
        (error) => error.code === "disposed" && error.cause === original,
      );
    assert.equal(
      c.wire.queries.filter((q) => q.method === "inst.children").length,
      1,
    );
    assert.deepEqual(c.tree.rows, []);
    assert.deepEqual(c.tree.revealState, { status: "idle" });
  },
);

for (const revoked of [false, true])
  test(`A Tree: callable Proxy inspection uses the diagnostic boundary, revoked=${revoked}`, async (t) => {
    const c = await model(t);
    let bodyCalls = 0,
      laterReads = 0;
    const source = Object.assign(
      () => {
        bodyCalls++;
      },
      { detail: { value: 1 } },
    );
    const { proxy, revoke } = Proxy.revocable(source, {
      getOwnPropertyDescriptor(target, key) {
        if (key === "detail") throw undefined;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    if (revoked) revoke();
    const published = await failRoots(c, {
      handler: proxy,
      get later() {
        laterReads++;
        return 1;
      },
    });
    assert.deepEqual(published, {});
    const issue = c.tree.rootState.error.dataIssue;
    assert.deepEqual(issue, {
      code: "data_read_failed",
      operation: "inspect",
      path: revoked ? ["handler"] : ["handler", "detail"],
    });
    assert.equal(Object.isFrozen(issue), true);
    assert.equal(Object.isFrozen(issue.path), true);
    assert.equal(Object.isFrozen(source), false);
    assert.equal(Object.isFrozen(source.detail), false);
    assert.equal(bodyCalls, 0);
    assert.equal(laterReads, 0);
  });
