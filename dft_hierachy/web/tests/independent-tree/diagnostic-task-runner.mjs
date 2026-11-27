// Agent B public task/lifecycle inputs, DESIGN 6.6.3/5/6; no global rejection listener.
import assert from "node:assert/strict";
import {
  model,
  load,
  row,
  invoke,
  frozen,
  root,
  object,
  HierError,
  vm,
} from "./harness.mjs";
const cfg = JSON.parse(process.argv[2]),
  cleanups = [],
  t = { after: (f) => cleanups.push(f) };
const c = await model(t, { childCount: 1 }),
  marker = { B: "pending-observer" };
let notifications = 0,
  pendingFailures = 0,
  reads = 0,
  nestedLater = 0,
  ancestorLater = 0;
if (cfg.method === "children" || cfg.scenario === "shared-page") await load(c);
const state = () =>
  cfg.method === "roots" ? c.tree.rootState : row(c.tree, "B-root").children;
const publicBatch = () => [c.tree.rootState, c.tree.revealState, c.tree.rows];
let publishedBatch = publicBatch();
c.tree.subscribe(() => {
  notifications++;
  publishedBatch = publicBatch();
  if (
    cfg.pendingObserver &&
    state().status === "pending" &&
    pendingFailures === 0
  ) {
    pendingFailures++;
    throw marker;
  }
});
const settle = (p) =>
  p.then(
    () => ({ success: true }),
    (error) => ({ error }),
  );
let first, second;
if (cfg.scenario === "shared-page") {
  first = invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, true);
  await c.wire.next("inst.children");
  second = invoke(c.tree, "reveal", "B-target");
  const obj = await c.wire.next("obj.get");
  c.wire.ok(obj, object("B-target", "B-target"));
  const chain = await c.wire.next("inst.ancestors");
  c.wire.ok(chain, [root(1)]);
  // One event-loop turn drains already queued SDK continuations; no wall-clock sleep.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(c.tree.revealState.status, "pending");
  assert.equal(state().status, "pending");
  assert.equal(
    c.wire.sent.filter((x) => x.method === "inst.children").length,
    1,
  );
} else if (cfg.method === "roots") {
  first = invoke(c.tree, "loadRoots");
  await c.wire.next("inst.roots");
  if (cfg.scenario === "waiter-dispose") second = invoke(c.tree, "loadRoots");
} else if (cfg.method === "children") {
  first = invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, true);
  await c.wire.next("inst.children");
  if (cfg.scenario === "waiter-dispose")
    second = invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, true);
} else {
  first = invoke(c.tree, "reveal", "B-target");
  await c.wire.next("obj.get");
}
const beforeNotifications = notifications,
  queries = c.wire.queries.length;
const source = { prefix: "B original data" };
const original = new HierError(
  "transport_closed",
  "transport",
  "B exact task failure",
  source,
);
const read = () => {
  reads++;
  assert.deepEqual(
    publicBatch(),
    publishedBatch,
    "diagnostic preparation observes the previous complete batch",
  );
  if (cfg.dispose) {
    c.tree.dispose();
    throw undefined;
  }
  throw undefined;
};
if (cfg.scenario === "ancestor-stop") {
  source.branch = {};
  Object.defineProperty(source.branch, "detail", {
    enumerable: true,
    get: read,
  });
  Object.defineProperty(source.branch, "later", {
    enumerable: true,
    get() {
      nestedLater++;
      return 1;
    },
  });
  Object.defineProperty(source, "later", {
    enumerable: true,
    get() {
      ancestorLater++;
      return 2;
    },
  });
} else {
  Object.defineProperty(source, "detail", { enumerable: true, get: read });
  Object.defineProperty(source, "later", {
    enumerable: true,
    get() {
      ancestorLater++;
      return 2;
    },
  });
}
const results = [settle(first)];
if (second) results.push(settle(second));
c.wire.closed = true;
for (const token of [...c.wire.closes])
  if (c.wire.closes.has(token)) token.handler(original);
try {
  const answers = await Promise.all(results);
  assert.equal(reads >= 1, true);
  assert.equal(nestedLater, 0);
  assert.equal(ancestorLater, 0);
  assert.equal(Object.isFrozen(original), false);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(c.wire.queries.length, queries);
  for (let index = 0; index < answers.length; index++) {
    const answer = answers[index];
    assert.equal(answer.success, undefined);
    if (cfg.dispose) {
      assert.ok(answer.error instanceof vm.TreeError);
      assert.equal(answer.error.code, "disposed");
      if (cfg.pendingObserver && index === 0) {
        assert.ok(answer.error.cause instanceof AggregateError);
        assert.deepEqual(answer.error.cause.errors, [marker]);
        assert.strictEqual(answer.error.cause.cause, original);
      } else
        assert.strictEqual(
          answer.error.cause,
          original,
          "register original query error for every waiting command before external data read",
        );
    } else assert.strictEqual(answer.error, original);
  }
  if (cfg.dispose) {
    assert.equal(c.tree.disposed, true);
    assert.deepEqual(c.tree.rows, []);
    assert.deepEqual(c.tree.rootState, { status: "idle", loadedCount: 0 });
    assert.deepEqual(c.tree.revealState, { status: "idle" });
    assert.equal(notifications, beforeNotifications);
  } else {
    const failed = cfg.method === "reveal" ? c.tree.revealState : state();
    assert.equal(failed.status, "failed");
    assert.deepEqual(failed.error.data, {});
    assert.deepEqual(failed.error.dataIssue, {
      code: "data_read_failed",
      operation: "read",
      path:
        cfg.scenario === "ancestor-stop" ? ["branch", "detail"] : ["detail"],
    });
    assert.equal(failed.error.code, original.code);
    assert.equal(failed.error.origin, original.origin);
    assert.equal(failed.error.message, original.message);
    frozen(failed);
    if (cfg.scenario === "shared-page") {
      const reveal = c.tree.revealState;
      assert.equal(reveal.status, "failed");
      assert.deepEqual(reveal.error.data, {});
      assert.deepEqual(reveal.error.dataIssue, {
        code: "data_read_failed",
        operation: "read",
        path: ["detail"],
      });
      frozen(reveal);
      assert.equal(reveal.error.code, original.code);
      assert.equal(reveal.error.origin, original.origin);
      assert.equal(reveal.error.message, original.message);
    }
  }
  console.log(
    JSON.stringify({
      scenario: cfg.scenario,
      method: cfg.method,
      answers: answers.length,
      dispose: !!cfg.dispose,
      reads,
      nestedLater,
      ancestorLater,
      notifications,
      pendingFailures,
    }),
  );
} finally {
  for (const f of cleanups) f();
}
