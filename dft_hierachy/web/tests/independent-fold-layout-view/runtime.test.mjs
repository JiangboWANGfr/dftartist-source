import test, { after } from "node:test";
import assert from "node:assert/strict";
import { layoutCases } from "./cases.mjs";
import { using, vm, deep, tick, fold, invoke, local, start, success, result } from "./harness.mjs";
import { geometry } from "../independent-layout/worker.mjs";
import { releaseAll } from "../independent-graph-session/harness.mjs";
after(releaseAll);
const impl = {
  async FL01(t, c) {
    const before = c.graph.state,
      selection = c.selection.current,
      s = c.make();
    assert.equal(s.mode, "folded");
    assert.equal(s.state.status, "idle");
    assert.equal(s.state.request, null);
    assert.equal(s.state.result, null);
    const old = c.make({}, "graph");
    assert.equal(old.mode, "graph");
    for (const third of [undefined, "graph", "auto", null, {}])
      assert.throws(
        () => new vm.LayoutService(c.graph, { workerFactory: c.factory, timeoutMs: 100 }, third),
        local("invalid_argument"),
      );
    assert.throws(
      () =>
        new vm.LayoutService(
          c.graph,
          { workerFactory: c.factory, timeoutMs: 100, mode: "folded" },
          "folded",
        ),
      local("invalid_argument"),
    );
    assert.equal(c.workers.length, 0);
    assert.equal(c.graph.state, before);
    assert.equal(c.selection.current, selection);
  },
  async FL02(t, c) {
    const s = c.make();
    await c.source.clear();
    const p = fold(c, { groups: [], collapsed: [] }),
      seen = [];
    s.subscribe(() => seen.push(s.state.status));
    await invoke(s, "layout", p);
    assert.deepEqual(seen, ["pending", "success"]);
    assert.equal(c.workers.length, 0);
    const r = result(s, p);
    assert.deepEqual([r.width, r.height, r.nodes, r.edges], [0, 0, [], []]);
  },
  async FL03(t, c) {
    const s = c.make(),
      p = fold(c);
    for (const dir of ["RIGHT", "LEFT", "DOWN", "UP"]) {
      const task = await start(c, s, p, dir),
        input = task.w.request.graph;
      assert.equal(input.children.length, p.nodes.length);
      assert.equal(input.edges.length, p.edges.length);
      const opt = (o, name) =>
        Object.entries(o ?? {}).find(([key]) => key === name || key.endsWith("." + name))?.[1];
      const options = { ...input.layoutOptions, ...task.w.request.layoutOptions };
      assert(String(opt(options, "algorithm")).endsWith("layered"));
      assert.equal(opt(options, "direction"), dir);
      assert.equal(opt(options, "edgeRouting"), "ORTHOGONAL");
      for (const n of input.children)
        assert.equal(
          opt(n.layoutOptions, "portConstraints") ?? opt(options, "portConstraints"),
          "FIXED_ORDER",
        );
      const output = geometry(input);
      output.children.reverse();
      output.edges.reverse();
      output.projectionId = "forged";
      task.w.succeed(output);
      await task.p;
      result(s, p, dir);
    }
  },
  async FL04(t, c) {
    const s = c.make(),
      p = fold(c),
      task = await start(c, s, p),
      before = s.state;
    let reads = 0;
    const fake = new Proxy(
      {},
      {
        get() {
          reads++;
          throw Error("must not inspect forged shape");
        },
      },
    );
    for (const bad of [fake, new Proxy(p, {}), { ...p }, null])
      await assert.rejects(invoke(s, "layout", bad, "AUTO"), local("invalid_argument"));
    assert.equal(reads, 0);
    for (const dir of ["AUTO", null, 0, {}])
      await assert.rejects(invoke(s, "layout", p, dir), local("invalid_argument"));
    assert.equal(s.state, before);
    assert.equal(c.workers.length, 1);
    assert.equal(task.w.terminated, 0);
    await using(async (other) => {
      const foreign = fold(other);
      await assert.rejects(invoke(s, "layout", foreign, "AUTO"), local("stale_graph"));
    });
    task.w.succeed();
    await task.p;
    await c.source.clear();
    await assert.rejects(invoke(s, "layout", p, "AUTO"), local("stale_graph"));
  },
  async FL05(t, c) {
    const s = c.make(),
      p = fold(c),
      q = fold(c),
      one = await start(c, s, p),
      first = s.state.request.taskId,
      two = await start(c, s, q);
    await assert.rejects(one.p, local("superseded"));
    assert.notEqual(s.state.request.taskId, first);
    const pending = s.state;
    one.w.succeed(undefined, true);
    await tick();
    assert.equal(s.state, pending);
    two.w.succeed();
    await two.p;
    result(s, q);
    const id = s.state.result.taskId;
    await success(c, s, q);
    assert.notEqual(s.state.result.taskId, id);
    result(s, q);
  },
  async FL06(t, c) {
    const s = c.make(),
      p = fold(c),
      old = await success(c, s, p, "LEFT"),
      task = await start(c, s, p, "LEFT"),
      id = s.state.request.taskId;
    await invoke(s, "cancel");
    await assert.rejects(task.p, local("cancelled"));
    assert.equal(s.state.result, old);
    const cancelled = s.state;
    await invoke(s, "cancel");
    assert.equal(s.state, cancelled);
    const retry = await start(c, s, undefined, undefined, "retry");
    assert.equal(s.state.request.projectionId, p.id);
    assert.notEqual(s.state.request.taskId, id);
    assert.notEqual(retry.w, task.w);
    retry.w.succeed();
    await retry.p;
    result(s, p, "LEFT");
  },
  async FL07(t, c) {
    const a = c.make(),
      b = c.make(),
      p = fold(c),
      one = await start(c, a, p),
      two = await start(c, b, p);
    let seen = 0;
    const off = a.subscribe(() => {
      if (a.state.status === "stale") {
        seen++;
        assert.equal(b.state.status, "stale");
        assert.equal(b.state.graphRevision, c.graph.state.revision);
      }
    });
    await c.source.clear();
    off();
    assert.equal(seen, 1);
    await assert.rejects(one.p, local("stale_graph"));
    await assert.rejects(two.p, local("stale_graph"));
    await assert.rejects(invoke(a, "retry"), local("stale_graph"));
    assert.equal(a.state.request, null);
    assert.equal(b.state.request, null);
  },
  async FL08(t, c) {
    const cause = { opaque: "B97 factory" },
      s = c.make({
        workerFactory() {
          throw cause;
        },
      });
    await assert.rejects(
      invoke(s, "layout", fold(c)),
      (e) => local("worker_failure")(e) && e.cause === cause,
    );
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const timed = c.make({ timeoutMs: 25 }),
      p = fold(c),
      starting = start(c, timed, p);
    await tick();
    t.mock.timers.tick(0);
    const task = await starting;
    t.mock.timers.tick(26);
    await assert.rejects(task.p, local("timeout"));
    assert.equal(task.w.terminated, 1);
    const retrying = start(c, timed, undefined, undefined, "retry");
    await tick();
    t.mock.timers.tick(0);
    const retry = await retrying;
    retry.w.succeed();
    t.mock.timers.tick(0);
    await retry.p;
    result(timed, p);
  },
  async FL09(t, c) {
    const s = c.make(),
      p = fold(c),
      old = await success(c, s, p);
    const mutations = [
      (r) => r.children.pop(),
      (r) => r.children.push(r.children[0]),
      (r) => r.edges.pop(),
      (r) => r.edges.push(r.edges[0]),
      (r) => {
        r.children[0].id = c.graph.state.nodes[0].id;
      },
      (r) => {
        const child = r.children.find((node) => node.ports.length > 0);
        assert(child, "fixture must contain a port to remove");
        const before = child.ports.length;
        child.ports.pop();
        assert.equal(child.ports.length, before - 1, "actually remove one required port");
      },
      (r) => {
        r.children[0].x = Infinity;
      },
      (r) => {
        r.width = -1;
      },
      (r) => {
        r.edges[0].sources = ["invented"];
      },
      (r) => {
        r.edges[0].targets = ["invented"];
      },
      (r) => {
        r.edges[0].sections = [];
      },
      (r) => {
        r.edges[0].sections[0].startPoint.x = NaN;
      },
    ];
    for (const mutate of mutations) {
      const task = await start(c, s, p),
        output = geometry(task.w.request.graph);
      mutate(output);
      task.w.succeed(output);
      await assert.rejects(task.p, local("invalid_result"));
      assert.equal(s.state.status, "failed");
      assert.equal(s.state.result, old);
    }
  },
  async FL10(t, c) {
    const s = c.make();
    s.dispose();
    let reads = 0;
    const fake = new Proxy(
      {},
      {
        get() {
          reads++;
          return null;
        },
      },
    );
    await assert.rejects(invoke(s, "layout", fake, "AUTO"), local("disposed"));
    assert.equal(reads, 0);
    assert.equal(c.graph.disposed, false);
    let active, inner;
    active = c.make({
      workerFactory() {
        inner = invoke(active, "cancel");
        return c.factory();
      },
    });
    const task = await start(c, active, fold(c));
    await assert.rejects(inner, local("reentrant_change"));
    task.w.succeed();
    await task.p;
  },
  async FL11(t, c) {
    const s = c.make(),
      p = fold(c),
      state = c.graph.state,
      selection = c.selection.current,
      raw = JSON.stringify(state);
    await success(c, s, p);
    result(s, p);
    const q = fold(c, { groups: p.options.groups, collapsed: [] });
    await success(c, s, q);
    const r = result(s, q);
    assert.equal(r.nodes.length, state.nodes.length);
    assert.equal(r.edges.length, state.edges.length);
    assert(q.nodes.every((n) => n.members.length === 1));
    assert(q.edges.every((e) => e.members.length === 1));
    assert.equal(c.graph.state, state);
    assert.equal(JSON.stringify(c.graph.state), raw);
    assert.equal(c.selection.current, selection);
  },
  async FL12(t, c) {
    const s = c.make({}, "graph"),
      p = vm.createGraphProjection(c.graph),
      task = await start(c, s, p.layout);
    task.w.succeed();
    await task.p;
    assert.equal(s.state.status, "success");
    assert.deepEqual(
      s.state.result.nodes.map((n) => n.id),
      c.graph.state.nodes.map((n) => n.id),
    );
    assert.equal("projectionId" in s.state.result, false);
    deep(s.state);
  },
};
for (const c of layoutCases)
  test(
    c.id + ": " + c.input + " => " + c.expected + " [" + c.basis + "]",
    { timeout: 20000 },
    (t) => using((ctx) => impl[c.id](t, ctx)),
  );
