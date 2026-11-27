// Agent B: DESIGN 6.6.2/6.6.6 callable data structure, not callable behavior.
import assert from "node:assert/strict";
import { model, load, row, invoke, HierError, vm } from "./harness.mjs";
const cfg = JSON.parse(process.argv[2]),
  cleanups = [],
  t = { after: (f) => cleanups.push(f) };
const c = await model(t, { childCount: 1 });
if (cfg.method === "children") await load(c);
let notifications = 0,
  bodyCalls = 0,
  fieldReads = 0,
  hiddenReads = 0,
  symbolReads = 0,
  laterReads = 0;
c.tree.subscribe(() => notifications++);
const state = () =>
  cfg.method === "roots"
    ? c.tree.rootState
    : cfg.method === "children"
      ? row(c.tree, "B-root").children
      : c.tree.revealState;
let p;
if (cfg.method === "roots") {
  p = invoke(c.tree, "loadRoots");
  await c.wire.next("inst.roots");
} else if (cfg.method === "children") {
  p = invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, true);
  await c.wire.next("inst.children");
} else {
  p = invoke(c.tree, "reveal", "B-target");
  await c.wire.next("obj.get");
}
const before = notifications;
const fn = function () {
  bodyCalls++;
  throw Error("B diagnostic body must not execute");
};
const child = { value: 1 },
  data = { prefix: "B callable original" };
let source = data,
  issue,
  published;
const callable = cfg.scenario !== "ordinary" ? fn : {};
if (cfg.scenario !== "plain")
  Object.assign(callable, { detail: child, scalar: "B preserved" });
Object.defineProperty(callable, "hidden", {
  enumerable: false,
  get() {
    hiddenReads++;
    throw Error("B hidden value");
  },
});
Object.defineProperty(callable, Symbol("B private"), {
  enumerable: true,
  get() {
    symbolReads++;
    throw Error("B symbol value");
  },
});
if (cfg.scenario === "root") {
  source = callable;
  callable.self = callable;
} else if (cfg.scenario === "array") {
  data.handlers = [callable, callable];
} else {
  data.handler = callable;
}
if (cfg.scenario === "shared" || cfg.scenario === "ordinary") {
  data.alias = callable;
  data.list = [callable];
  callable.self = callable;
  callable.owner = data;
  Object.defineProperty(callable, "readOnce", {
    enumerable: true,
    get() {
      fieldReads++;
      return child;
    },
  });
}
if (
  cfg.scenario === "throw" ||
  cfg.scenario === "dispose-return" ||
  cfg.scenario === "dispose-throw"
) {
  Object.defineProperty(callable, "detail", {
    enumerable: true,
    configurable: true,
    get() {
      fieldReads++;
      assert.equal(state().status, "pending");
      if (cfg.scenario.startsWith("dispose")) {
        c.tree.dispose();
        if (cfg.scenario === "dispose-throw") throw undefined;
        return child;
      }
      throw undefined;
    },
  });
  Object.defineProperty(callable, "later", {
    enumerable: true,
    get() {
      laterReads++;
      return 2;
    },
  });
  issue = {
    code: "data_read_failed",
    operation: "read",
    path: ["handler", "detail"],
  };
}
if (cfg.scenario === "enumerate") {
  const proxy = new Proxy(callable, {
    ownKeys() {
      fieldReads++;
      throw undefined;
    },
  });
  data.handler = proxy;
  issue = {
    code: "data_read_failed",
    operation: "enumerate",
    path: ["handler"],
  };
}
if (issue)
  Object.defineProperty(data, "later", {
    enumerable: true,
    get() {
      laterReads++;
      return 3;
    },
  });
const original = new HierError(
  "transport_closed",
  "transport",
  "B callable SDK error",
  source,
);
const result = p.then(
  () => ({ success: true }),
  (error) => ({ error }),
);
c.wire.closed = true;
for (const token of [...c.wire.closes])
  if (c.wire.closes.has(token)) token.handler(original);
const objectLike = (v) =>
  v !== null && (typeof v === "object" || typeof v === "function");
const deep = (v, seen = new Set()) => {
  if (!objectLike(v) || seen.has(v)) return;
  seen.add(v);
  assert.equal(
    Object.isFrozen(v),
    true,
    "every captured object including callable-shaped values is frozen",
  );
  for (const key of Reflect.ownKeys(v)) {
    if (typeof key !== "string") continue;
    if (Object.getOwnPropertyDescriptor(v, key)?.enumerable) deep(v[key], seen);
  }
};
try {
  const got = await result;
  assert.equal(got.success, undefined);
  assert.equal(bodyCalls, 0);
  assert.equal(hiddenReads, 0);
  assert.equal(symbolReads, 0);
  assert.equal(Object.isFrozen(original), false);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(fn), false);
  assert.equal(Object.isFrozen(child), false);
  if (cfg.scenario.startsWith("dispose")) {
    assert.ok(got.error instanceof vm.TreeError);
    assert.equal(got.error.code, "disposed");
    assert.strictEqual(got.error.cause, original);
    assert.equal(c.tree.disposed, true);
    assert.deepEqual(c.tree.rows, []);
    assert.deepEqual(c.tree.rootState, { status: "idle", loadedCount: 0 });
    assert.deepEqual(c.tree.revealState, { status: "idle" });
    assert.equal(notifications, before);
    assert.equal(fieldReads, 1);
    assert.equal(laterReads, 0);
  } else {
    assert.strictEqual(got.error, original);
    const failed = state();
    assert.equal(failed.status, "failed");
    assert.equal(failed.error.code, original.code);
    assert.equal(failed.error.origin, original.origin);
    assert.equal(failed.error.message, original.message);
    assert.equal(notifications, before + 1);
    if (issue) {
      assert.deepEqual(failed.error.data, {});
      assert.deepEqual(failed.error.dataIssue, issue);
      deep(failed.error);
      assert.equal(fieldReads, 1);
      assert.equal(laterReads, 0);
    } else {
      assert.equal(Object.hasOwn(failed.error, "dataIssue"), false);
      published =
        cfg.scenario === "root"
          ? failed.error.data
          : cfg.scenario === "array"
            ? failed.error.data.handlers[0]
            : failed.error.data.handler;
      assert.equal(
        objectLike(published),
        true,
        "owned structural projection, not null or discarded source value",
      );
      assert.notStrictEqual(
        published,
        callable,
        "never retain an external function/object alias",
      );
      deep(failed);
      if (cfg.scenario === "plain")
        assert.deepEqual(Object.keys(published), []);
      else {
        assert.equal(published.detail.value, 1);
        assert.equal(published.scalar, "B preserved");
        assert.notStrictEqual(published.detail, child);
        if (cfg.scenario === "shared" || cfg.scenario === "ordinary") {
          assert.strictEqual(failed.error.data.alias, published);
          assert.strictEqual(failed.error.data.list[0], published);
          assert.strictEqual(published.self, published);
          assert.strictEqual(published.owner, failed.error.data);
          assert.strictEqual(published.readOnce, published.detail);
          assert.equal(fieldReads, 1);
        }
        if (cfg.scenario === "array")
          assert.strictEqual(failed.error.data.handlers[1], published);
        if (cfg.scenario === "root")
          assert.strictEqual(published.self, published);
        child.value = 99;
        callable.scalar = "caller changed";
        callable.added = { value: 9 };
        assert.equal(published.detail.value, 1);
        assert.equal(published.scalar, "B preserved");
        assert.equal(Object.hasOwn(published, "added"), false);
      }
      const settled = notifications;
      c.tree.dispose();
      assert.equal(notifications, settled);
      deep(failed);
    }
  }
  console.log(
    JSON.stringify({
      method: cfg.method,
      scenario: cfg.scenario,
      bodyCalls,
      fieldReads,
      hiddenReads,
      symbolReads,
      laterReads,
    }),
  );
} finally {
  for (const f of cleanups) f();
}
