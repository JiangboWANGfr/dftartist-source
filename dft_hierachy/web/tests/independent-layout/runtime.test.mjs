import test, { after } from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import {
  using,
  vm,
  deep,
  tick,
  invoke,
  local,
  projection,
  start,
  success,
  resultMapping,
} from "./harness.mjs";
import { geometry } from "./worker.mjs";
import { fragment, X, Y, edge, deferred } from "../independent-graph-session/input.mjs";
import { realInput } from "../independent-graph-session/core-input.mjs";
import { releaseAll } from "../independent-graph-session/harness.mjs";
after(releaseAll);
const implementations = {
  async L01(t, c) {
    const before = c.graph.state,
      sent = c.wire.sent.length,
      s = c.service();
    assert.equal(s.state.status, "idle");
    assert.equal(s.state.request, null);
    assert.equal(s.state.result, null);
    assert.equal(s.state.graphRevision, before.revision);
    assert.equal(c.workers.length, 0);
    deep(s.state);
    for (const options of [
      null,
      {},
      { workerFactory: c.factory },
      { timeoutMs: 1 },
      ...[0, -1, 1.5, Infinity, 2147483648, undefined].map((timeoutMs) => ({
        workerFactory: c.factory,
        timeoutMs,
      })),
    ])
      assert.throws(() => new vm.LayoutService(c.graph, options), local("invalid_argument"));
    assert.equal(c.graph.state, before);
    assert.equal(c.wire.sent.length, sent);
    assert.throws(() => s.subscribe(null), local("invalid_argument"));
    await assert.rejects(invoke(s, "retry"), local("invalid_argument"));
    s.dispose();
    assert.equal(c.graph.disposed, false);
    assert.equal(c.client.snapshot.snapshotId, before.snapshotId);
  },
  async L02(t, c) {
    await c.source.clear();
    const s = c.service(),
      seen = [];
    s.subscribe(() => seen.push(s.state.status));
    await invoke(s, "layout", projection(c.graph));
    assert.deepEqual(seen, ["pending", "success"]);
    assert.equal(c.workers.length, 0);
    assert.deepEqual(
      [s.state.result.width, s.state.result.height, s.state.result.nodes, s.state.result.edges],
      [0, 0, [], []],
    );
    deep(s.state);
  },
  async L03(t, c) {
    const s = c.service(),
      task = await start(c, s),
      before = s.state,
      mutations = [
        (p) => (p.unknown = 1),
        (p) => (p.direction = "AUTO"),
        (p) => (p.direction = undefined),
        (p) => p.nodes.pop(),
        (p) => p.nodes.push(p.nodes[0]),
        (p) => p.edges.pop(),
        (p) => p.edges.push(p.edges[0]),
        (p) => (p.nodes[0].width = 0),
        (p) => (p.nodes[0].height = NaN),
        (p) => (p.nodes[0].ports[0].width = -1),
        (p) => (p.nodes[0].ports[0].side = "AUTO"),
        (p) => p.nodes[0].ports.push(p.nodes[0].ports[0]),
        (p) => (p.nodes[0].ports[0].key = ""),
        (p) => (p.edges[0].fromPort = "absent"),
        (p) => (p.edges[0].toPort = undefined),
        (p) => delete p.nodes[0],
        (p) => (p.nodes[0].extra = {}),
        (p) => (p.edges[0].from = "invented"),
        (p) => (p.nodes[0].width = Infinity),
        (p) => Object.setPrototypeOf(p, new Date()),
      ];
    for (const change of mutations) {
      const p = projection(c.graph);
      change(p);
      await assert.rejects(invoke(s, "layout", p), local("invalid_argument"));
      assert.equal(s.state, before);
      assert.equal(c.workers.length, 1);
    }
    for (const change of [(p) => p.graphRevision--, (p) => (p.sessionId = "other")]) {
      const p = projection(c.graph);
      change(p);
      await assert.rejects(invoke(s, "layout", p), local("stale_graph"));
      assert.equal(s.state, before);
    }
    task.w.succeed();
    await task.p;
  },
  async L04(t, c) {
    const s = c.service(),
      p = projection(c.graph),
      original = structuredClone(p),
      read = {};
    const input = Object.create(null);
    for (const [k, v] of Object.entries(p))
      Object.defineProperty(input, k, {
        enumerable: true,
        get() {
          read[k] = (read[k] ?? 0) + 1;
          return v;
        },
      });
    const graphBefore = c.graph.state,
      task = await start(c, s, input);
    p.nodes[0].width = 999;
    p.nodes[0].ports[0].key = "changed";
    task.w.succeed();
    await task.p;
    assert.deepEqual(read, Object.fromEntries(Object.keys(original).map((k) => [k, 1])));
    assert.equal(s.state.result.nodes[0].width, original.nodes[0].width);
    assert.equal(c.graph.state, graphBefore);
    resultMapping(c, s, original);
  },
  async L05(t, c) {
    const s = c.service(),
      cause = { B: "read" },
      before = s.state;
    const bad = projection(c.graph);
    Object.defineProperty(bad, "direction", {
      get() {
        throw cause;
      },
    });
    await assert.rejects(
      invoke(s, "layout", bad),
      (e) => local("invalid_argument")(e) && e.cause === cause,
    );
    assert.equal(s.state, before);
    let inner;
    const p = projection(c.graph);
    Object.defineProperty(p, "direction", {
      get() {
        inner = invoke(s, "cancel");
        return "RIGHT";
      },
    });
    const task = await start(c, s, p);
    await assert.rejects(inner, local("reentrant_change"));
    task.w.succeed();
    await task.p;
    const p2 = projection(c.graph);
    Object.defineProperty(p2, "direction", {
      get() {
        c.graph.dispose();
        throw cause;
      },
    });
    await assert.rejects(invoke(s, "layout", p2), (e) => local("disposed")(e) && e.cause === cause);
    assert.equal(s.state.status, "disposed");
  },
  async L06(t, c) {
    await c.source.replace(
      fragment(
        c,
        [X(), Y()],
        [
          edge(),
          edge("B-edge-2", "B-fact-2"),
          {
            ...edge("B-loop", "B-loop-fact"),
            value: { ...edge("B-loop", "B-loop-fact").value, to: "B-x" },
          },
        ],
      ),
    );
    const s = c.service(),
      graphBefore = c.graph.state,
      ids = [];
    for (const dir of ["RIGHT", "DOWN", "LEFT", "UP"]) {
      const p = projection(c.graph, dir);
      const task = await start(c, s, p);
      const options = { ...task.w.request.graph.layoutOptions, ...task.w.request.layoutOptions };
      const option = (dictionary, name) =>
        Object.entries(dictionary ?? {}).find(
          ([key]) => key === name || key.endsWith("." + name),
        )?.[1];
      assert(String(option(options, "algorithm")).endsWith("layered"));
      assert.equal(option(options, "direction"), dir);
      assert.equal(option(options, "edgeRouting"), "ORTHOGONAL");
      for (const n of task.w.request.graph.children)
        assert.equal(
          option(n.layoutOptions, "portConstraints") ?? option(options, "portConstraints"),
          "FIXED_ORDER",
        );
      task.w.succeed();
      await task.p;
      resultMapping(c, s, p);
      ids.push(s.state.result.taskId);
    }
    assert.equal(new Set(ids).size, 4);
    assert.equal(c.graph.state, graphBefore);
    assert.equal(s.state.result.edges.length, 3);
    assert.equal(s.state.result.nodes[0].ports[0].x, -2);
  },
  async L07(t, c) {
    const s = c.service(),
      old = await success(c, s),
      mutations = [
        (r) => r.children.pop(),
        (r) => r.children.push(r.children[0]),
        (r) => (r.children[0].id = "unknown"),
        (r) => (r.children[0].x = Infinity),
        (r) => (r.children[0].width = 0),
        (r) => (r.children[0].children = [{}]),
        (r) => r.children[0].ports.pop(),
        (r) => r.children[0].ports.push(r.children[0].ports[0]),
        (r) => r.edges.pop(),
        (r) => r.edges.push(r.edges[0]),
        (r) => (r.edges[0].sources = ["unknown"]),
        (r) => (r.edges[0].targets = ["unknown"]),
        (r) => (r.edges[0].sections = []),
        (r) => (r.edges[0].sections[0].startPoint.x = NaN),
        (r) => delete r.edges[0].sections[0].endPoint,
        (r) => (r.width = -1),
      ];
    for (const mutate of mutations) {
      const task = await start(c, s),
        r = geometry(task.w.request.graph);
      mutate(r);
      task.w.succeed(r);
      await assert.rejects(task.p, local("invalid_result"));
      assert.equal(s.state.result, old);
      assert.equal(s.state.status, "failed");
    }
  },
  async L08(t, c) {
    const s = c.service(),
      one = await start(c, s),
      two = await start(c, s);
    await assert.rejects(one.p, local("superseded"));
    assert.equal(one.w.terminated, 1);
    const pending = s.state;
    one.w.succeed(undefined, true);
    await tick();
    assert.equal(s.state, pending);
    two.w.succeed();
    await two.p;
    const done = s.state;
    one.w.succeed(undefined, true);
    await tick();
    assert.equal(s.state, done);
  },
  async L09(t, c) {
    const s = c.service(),
      one = await start(c, s),
      two = await start(c, s);
    await assert.rejects(one.p, local("superseded"));
    one.w.fail({ message: "late B" }, true);
    two.w.succeed();
    await two.p;
    const state = s.state;
    await tick();
    assert.equal(s.state, state);
  },
  async L10(t, c) {
    const s = c.service(),
      old = await success(c, s),
      task = await start(c, s);
    await invoke(s, "cancel");
    await assert.rejects(task.p, local("cancelled"));
    assert.equal(s.state.status, "cancelled");
    assert.equal(s.state.result, old);
    const before = s.state;
    await invoke(s, "cancel");
    assert.equal(s.state, before);
    const retry = await start(c, s, undefined, "retry");
    assert.notEqual(retry.w, task.w);
    retry.w.succeed();
    await retry.p;
  },
  async L11(t, c) {
    for (const mode of ["factory", "post", "error", "messageerror"]) {
      const cause = { B: mode };
      let fail = true;
      const s = c.service({
        workerFactory() {
          if (fail && mode === "factory") throw cause;
          const w = c.factory();
          if (fail && mode === "post") w.postError = cause;
          return w;
        },
      });
      const p = invoke(s, "layout", projection(c.graph));
      await tick();
      if (mode === "error" || mode === "messageerror") c.workers.at(-1).emit(mode, cause);
      await assert.rejects(p, local("worker_failure"));
      assert.equal(s.state.error.origin, "layout_service");
      fail = false;
      const retry = await start(c, s, undefined, "retry");
      retry.w.succeed();
      await retry.p;
      assert.equal(s.state.status, "success");
      s.dispose();
    }
  },
  async L12(t, c) {
    const s = c.service(),
      task = await start(c, s),
      cause = { name: "BAlgorithmError", message: "B failed" };
    task.w.fail(cause);
    await assert.rejects(task.p, (e) => local("layout_failure")(e) && e.cause !== undefined);
    assert.equal(s.state.status, "failed");
    assert.equal(s.state.error.code, "layout_failure");
    const retry = await start(c, s, undefined, "retry");
    retry.w.succeed();
    await retry.p;
  },
  async L13(t, c) {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const s = c.service({ timeoutMs: 25 }),
      starting = start(c, s);
    await tick();
    t.mock.timers.tick(0); // native ELK API queues registration delivery at zero delay
    const task = await starting;
    t.mock.timers.tick(26);
    await assert.rejects(task.p, local("timeout"));
    assert.equal(task.w.terminated, 1);
    const before = s.state;
    task.w.succeed(undefined, true);
    t.mock.timers.tick(0);
    await tick();
    assert.equal(s.state, before);
    const retrying = start(c, s, undefined, "retry");
    await tick();
    t.mock.timers.tick(0);
    const retry = await retrying;
    retry.w.succeed();
    t.mock.timers.tick(0);
    await retry.p;
  },
  async L14(t, c) {
    const s = c.service(),
      empty = c.service();
    await success(c, s);
    const old = s.state.result;
    const d = deferred(),
      refresh = c.source.refresh(() => d.promise);
    refresh.catch(() => {});
    assert.equal(s.state.status, "stale");
    assert.equal(empty.state.status, "idle");
    assert.equal(s.state.result, old);
    await assert.rejects(invoke(s, "retry"), local("stale_graph"));
    d.reject(new Error("B source fails"));
    await assert.rejects(refresh);
    assert.equal(s.state.graphRevision, c.graph.state.revision);
    const task = await start(c, s);
    await c.source.clear();
    await assert.rejects(task.p, local("stale_graph"));
    assert.equal(s.state.request, null);
    await invoke(s, "layout", projection(c.graph));
    assert.equal(s.state.status, "success");
    assert.equal(s.state.result.nodes.length, 0);
  },
  async L15(t, c) {
    const a = c.service(),
      b = c.service();
    await success(c, a);
    await success(c, b);
    const seen = [];
    a.subscribe(() => {
      assert.equal(b.state.status, "stale");
      seen.push("a");
    });
    const task = await start(c, b);
    task.w.onTerminate = () => assert.equal(a.state.status, "stale");
    let command;
    c.graph.subscribe(() => {
      assert.equal(a.state.status, "stale");
      assert.equal(b.state.status, "stale");
      command = invoke(b, "layout", projection(c.graph));
    });
    await c.source.replace(fragment(c, [X(), Y()], [edge()]));
    await assert.rejects(task.p, local("stale_graph"));
    await tick();
    c.workers.at(-1).succeed();
    await command;
    assert(seen.includes("a"));
  },
  async L16(t, c) {
    const a = c.service(),
      b = c.service(),
      one = await start(c, a),
      two = await start(c, b);
    assert.notEqual(a.state.request.taskId, b.state.request.taskId);
    let notices = 0;
    a.subscribe(() => notices++);
    b.subscribe(() => notices++);
    c.graph.subscribe(() => notices++);
    a.dispose();
    await assert.rejects(one.p, local("disposed"));
    assert.equal(c.graph.disposed, false);
    const old = notices;
    c.graph.dispose();
    assert.equal(b.disposed, true);
    assert.equal(b.state.result, null);
    await assert.rejects(two.p, local("disposed"));
    assert.equal(notices, old);
    a.dispose();
    b.dispose();
    for (const name of ["layout", "retry", "cancel"])
      await assert.rejects(invoke(b, name, projection(c.graph)), local("disposed"));
    assert.throws(() => b.subscribe(() => {}), local("disposed"));
  },
  async L17(t, c) {
    const s = c.service(),
      calls = [],
      boom = { B: "listener" };
    let remove = () => {},
      added = false;
    s.subscribe(() => {
      calls.push("a");
      remove();
      if (!added) {
        added = true;
        s.subscribe(() => calls.push("new"));
      }
      throw boom;
    });
    remove = s.subscribe(() => calls.push("removed"));
    const f = () => calls.push("dup");
    const off = s.subscribe(f);
    s.subscribe(f);
    off();
    off();
    const task = await start(c, s);
    assert.deepEqual(calls, ["a", "dup"]);
    task.w.succeed();
    await assert.rejects(task.p, (e) => e instanceof AggregateError && e.errors.includes(boom));
    assert.equal(s.state.status, "success");
    assert.deepEqual(calls.slice(2), ["a", "dup", "new"]);
  },
  async L18(t, c) {
    const s = c.service(),
      boom = { B: "stale notification" },
      task = await start(c, s);
    const off = s.subscribe(() => {
      if (s.state.status === "stale") throw boom;
    });
    await assert.rejects(
      c.source.clear(),
      (e) => e instanceof AggregateError && e.errors.includes(boom),
    );
    await assert.rejects(task.p, local("stale_graph"));
    assert.equal(s.state.status, "stale");
    off();
    await c.source.replace(fragment(c, [X(), Y()], [edge()]));
    const cancelService = c.service(),
      cancelled = await start(c, cancelService);
    cancelService.subscribe(() => {
      if (cancelService.state.status === "cancelled") throw boom;
    });
    await assert.rejects(
      invoke(cancelService, "cancel"),
      (e) =>
        e instanceof AggregateError && e.errors.includes(boom) && e.cause?.code === "cancelled",
    );
    await assert.rejects(cancelled.p, (e) => (e.code ?? e.cause?.code) === "cancelled");
    const b = c.service();
    b.subscribe(() => {
      if (b.state.status === "pending") b.dispose();
    });
    await assert.rejects(invoke(b, "layout", projection(c.graph)), local("disposed"));
    assert.equal(b.state.status, "disposed");
  },
  async L19(t, c) {
    const s = c.service(),
      task = await start(c, s),
      r = geometry(task.w.request.graph);
    task.w.succeed(r);
    await task.p;
    const history = s.state;
    r.children[0].x = 999;
    r.edges[0].sections[0].startPoint.x = 999;
    assert.notEqual(history.result.nodes[0].x, 999);
    deep(history);
    const next = await start(c, s),
      raw = geometry(next.w.request.graph);
    Object.defineProperty(raw, "width", {
      enumerable: true,
      get() {
        c.graph.dispose();
        return 10;
      },
    });
    next.w.succeed(raw);
    await assert.rejects(next.p, local("disposed"));
    deep(history);
    assert.equal(s.state.status, "disposed");
  },
  async L20(t, c) {
    const s = c.service(),
      task = await start(c, s),
      cause = { B: "terminate" };
    task.w.terminateError = cause;
    task.w.succeed();
    await assert.rejects(task.p, (e) => local("worker_failure")(e) && e.cause !== undefined);
    assert.equal(s.state.status, "failed");
    const failed = await start(c, s);
    failed.w.terminateError = cause;
    failed.w.fail({ message: "B algorithm failure with cleanup failure" });
    await assert.rejects(failed.p, (e) => local("layout_failure")(e) && e.cause !== undefined);
    assert.equal(s.state.error.code, "layout_failure");
    const a = c.service(),
      b = c.service(),
      one = await start(c, a),
      two = await start(c, b);
    one.w.terminateError = cause;
    two.w.terminateError = { B: "second" };
    assert.throws(() => c.graph.dispose(), AggregateError);
    assert.equal(a.disposed, true);
    assert.equal(b.disposed, true);
    await assert.rejects(one.p, local("disposed"));
    await assert.rejects(two.p, local("disposed"));
    assert.equal(c.graph.disposed, true);
  },
  async L21(t, c) {
    let s, inner;
    s = c.service({
      workerFactory() {
        inner = invoke(s, "cancel");
        return c.factory();
      },
    });
    const task = await start(c, s);
    await assert.rejects(inner, local("reentrant_change"));
    task.w.succeed();
    await task.p;
    const reading = await start(c, s),
      output = geometry(reading.w.request.graph);
    Object.defineProperty(output, "width", {
      enumerable: true,
      get() {
        inner = invoke(s, "retry");
        return 400;
      },
    });
    reading.w.succeed(output);
    await reading.p;
    await assert.rejects(inner, local("reentrant_change"));
    const a = c.service({
      workerFactory() {
        c.graph.dispose();
        return c.factory();
      },
    });
    await assert.rejects(invoke(a, "layout", projection(c.graph)), local("disposed"));
    assert.equal(a.disposed, true);
  },
  async L22(t, c) {
    const live = await realInput();
    t.after(live.close);
    const graph = new vm.GraphSession(live.client),
      source = graph.registerSource({ label: "B real RTL", origin: "design" });
    let service;
    try {
      await source.replace(live.fragment);
      service = new vm.LayoutService(graph, { workerFactory: c.factory, timeoutMs: 5000 });
      c.services.push(service);
      const p = projection(graph),
        before = graph.state;
      const task = await start(c, service, p);
      task.w.succeed();
      await task.p;
      resultMapping({ graph }, service, p);
      assert.equal(graph.state, before);
      await source.replace(live.partialFragment);
      assert.equal(service.state.status, "stale");
      assert.equal(graph.state.sources[0].content.completeness.status, "partial");
    } finally {
      service?.dispose();
      graph.dispose();
      await live.close();
    }
  },
};
for (const c of cases)
  test(
    c.id + ": " + c.input + " => " + c.expected + " [" + c.basis + "]",
    { timeout: 20000 },
    (t) => using(t, (ctx) => implementations[c.id](t, ctx)),
  );
