import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const web = fileURLToPath(new URL("../", import.meta.url)),
  consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const result = await build({
  entryPoints: [path.join(app, "src/instance-grouping.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { InstanceGrouping } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const tick = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function setup(t) {
  const calls = [],
    listeners = new Set();
  let state = { revision: 0 };
  const graph = {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const owned = {
    graph,
    instanceGroups(graph, signal) {
      const d = deferred();
      calls.push({ graph, signal, ...d });
      return d.promise;
    },
  };
  const model = new InstanceGrouping(owned);
  const off = model.subscribe(() => {});
  t.after(off);
  return {
    model,
    owned,
    graph,
    calls,
    listeners,
    off,
    change() {
      state = { revision: state.revision + 1 };
      for (const f of [...listeners]) f();
    },
  };
}
const groups = [{ kind: "hierarchy", key: "K", label: "Core instance label", nodes: ["N"] }];
test("grouping publishes pending before querying and success retains the original groups without changing the graph", async (t) => {
  const { model, calls, graph } = setup(t),
    state = graph.state;
  const completion = model.load();
  assert.equal(model.getSnapshot().status, "pending");
  assert.equal(calls.length, 0);
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].graph, state);
  calls[0].resolve(groups);
  await completion;
  assert.equal(model.getSnapshot().groups, groups);
  assert.equal(model.getSnapshot().status, "success");
  assert.equal(graph.state, state);
});
test("immediate cancellation prevents the old query from entering its borrowed SDK boundary", async (t) => {
  const { model, calls } = setup(t);
  const completion = model.load();
  model.cancel();
  await completion;
  assert.equal(calls.length, 0);
  assert.equal(model.getSnapshot().status, "cancelled");
});
test("replacement revokes before abort listeners can issue an even newer grouping intent", async (t) => {
  const { model, calls } = setup(t),
    old = model.load();
  await tick();
  let newest;
  calls[0].signal.addEventListener(
    "abort",
    () => {
      newest = model.load();
    },
    { once: true },
  );
  const replaced = model.load();
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve([{ ...groups[0], label: "obsolete" }]);
  calls[1].resolve(groups);
  await Promise.all([old, replaced, newest]);
  assert.equal(model.getSnapshot().groups, groups);
  assert.equal(model.getSnapshot().status, "success");
});
test("failure and cancellation retain the last completed groups and the exact original nested error", async (t) => {
  const { model, calls } = setup(t);
  let q = model.load();
  await tick();
  calls[0].resolve(groups);
  await q;
  const leaf = new Error("A grouping unit leaf"),
    failure = new AggregateError([leaf], "A grouping unit wrapper", {
      cause: new Error("A grouping unit cause"),
    });
  q = model.load();
  await tick();
  calls[1].reject(failure);
  await q;
  assert.equal(model.getSnapshot().error, failure);
  assert.match(model.getSnapshot().message, /A grouping unit leaf/);
  assert.match(model.getSnapshot().message, /A grouping unit cause/);
  assert.equal(model.getSnapshot().groups, groups);
  q = model.load();
  await tick();
  model.cancel();
  assert.equal(model.getSnapshot().groups, groups);
  calls[2].resolve([]);
  await q;
  assert.equal(model.getSnapshot().status, "cancelled");
  model.clear();
  assert.equal(model.getSnapshot().groups, undefined);
  assert.equal(model.getSnapshot().status, undefined);
});
test("unreadable errors settle with a readable cause and preserve inspection identities", async (t) => {
  const { model, calls } = setup(t),
    logs = [],
    original = console.error;
  t.after(() => {
    console.error = original;
  });
  console.error = (...args) => logs.push(args);
  const failure = new Error("A old message"),
    marker = new Error("A broken grouping getter");
  failure.cause = new Error("A grouping unit available leaf");
  Object.defineProperty(failure, "message", {
    get() {
      throw marker;
    },
  });
  const q = model.load();
  await tick();
  calls[0].reject(failure);
  await q;
  assert.equal(model.getSnapshot().error, failure);
  assert.match(model.getSnapshot().message, /无法读取原始显示错误/);
  assert.match(model.getSnapshot().message, /A grouping unit available leaf/);
  assert(
    logs.some(
      (x) =>
        x[1] instanceof AggregateError && x[1].errors[0] === failure && x[1].errors[1] === marker,
    ),
  );
});
test("diagnostic reentrancy cannot overwrite an explicit clear or a newer query", async (t) => {
  const { model, calls } = setup(t);
  for (const replace of [false, true]) {
    const failure = new Error();
    let next;
    Object.defineProperty(failure, "message", {
      get() {
        if (replace) next = model.load();
        else model.clear();
        return "A obsolete grouping failure";
      },
    });
    const q = model.load();
    await tick();
    calls.at(-1).reject(failure);
    await q;
    assert.equal(model.getSnapshot().status, replace ? "pending" : undefined);
    assert.equal(model.getSnapshot().error, undefined);
    if (replace) {
      await tick();
      calls.at(-1).resolve(groups);
      await next;
      assert.equal(model.getSnapshot().status, "success");
    }
  }
});
test("graph revision synchronously clears groups, aborts pending lookup and discards late completion", async (t) => {
  const { model, calls, change, graph } = setup(t);
  const q = model.load();
  await tick();
  change();
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(model.getSnapshot().graph, graph.state);
  assert.equal(model.getSnapshot().status, undefined);
  calls[0].resolve(groups);
  await q;
  assert.equal(model.getSnapshot().groups, undefined);
});
test("construction and final unsubscribe own no persistent graph listener; a fresh subscription does not query", async (t) => {
  const { model, calls, listeners, off, owned } = setup(t);
  const unattached = new InstanceGrouping(owned);
  assert.equal(listeners.size, 1);
  await unattached.load();
  assert.equal(calls.length, 0);
  assert.equal(listeners.size, 1);
  const q = model.load();
  await tick();
  off();
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(listeners.size, 0);
  assert.equal(model.getSnapshot().status, undefined);
  const reattach = model.subscribe(() => {});
  t.after(reattach);
  off();
  assert.equal(listeners.size, 1);
  calls[0].resolve(groups);
  await q;
  assert.equal(calls.length, 1);
  assert.equal(model.getSnapshot().groups, undefined);
  reattach();
  await model.load();
  assert.equal(calls.length, 1);
});
test("subscriber exceptions keep their identity and do not turn a successful lookup into a query failure", async (t) => {
  const { model, calls } = setup(t),
    marker = new Error("A grouping observer"),
    logs = [],
    original = console.error;
  console.error = (...args) => logs.push(args);
  t.after(() => {
    console.error = original;
  });
  const off = model.subscribe(() => {
    throw marker;
  });
  t.after(off);
  let reached = 0;
  const next = model.subscribe(() => {
    reached++;
  });
  t.after(next);
  const q = model.load();
  await tick();
  calls[0].resolve(groups);
  await q;
  assert.equal(reached, 2);
  assert.equal(model.getSnapshot().status, "success");
  assert(logs.every((x) => x[1] === marker));
});
test("a new intent from a pending notification stops remaining obsolete notifications and the old query", async (t) => {
  const { model, calls } = setup(t);
  let entered = false,
    next;
  const off = model.subscribe(() => {
    if (!entered && model.getSnapshot().status === "pending") {
      entered = true;
      model.clear();
      next = model.load();
    }
  });
  t.after(off);
  const observed = [];
  const later = model.subscribe(() => observed.push(model.getSnapshot().status));
  t.after(later);
  const q = model.load();
  await tick();
  assert.equal(calls.length, 1);
  calls[0].resolve(groups);
  await Promise.all([q, next]);
  assert.deepEqual(observed, [undefined, "pending", "success"]);
});
