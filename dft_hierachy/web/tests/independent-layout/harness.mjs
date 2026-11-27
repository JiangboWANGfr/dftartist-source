import assert from "node:assert/strict";
import * as graph from "../independent-graph-session/harness.mjs";
import { fragment, X, Y, edge } from "../independent-graph-session/input.mjs";
import { MessageGate } from "./worker.mjs";
export const { vm, deep, tick } = graph;
export function capability() {
  assert.equal(typeof vm.LayoutService, "function", "M6 LayoutService production export absent");
  assert.equal(typeof vm.LayoutError, "function", "M6 LayoutError production export absent");
}
export const local = (code) => (e) => {
  assert(e instanceof vm.LayoutError);
  assert.equal(e.code, code);
  return true;
};
export function invoke(service, method, ...args) {
  let p;
  assert.doesNotThrow(() => {
    p = service[method](...args);
  }, method + " returns a rejected Promise, not a sync throw");
  assert(p instanceof Promise);
  p.catch(() => {});
  return p;
}
export async function using(t, fn, { seed = true } = {}) {
  capability();
  return graph.using(async (c) => {
    c.services = [];
    c.workers = [];
    c.receivers = new Set();
    const cleanup = () => {
      for (const s of c.services) s.dispose();
      for (const w of c.workers) {
        assert.equal(w.terminated, 1, "each owned Worker reclaimed once");
        assert.equal(w.handlerCount, 0, "no Worker listeners retained");
      }
    };
    t.after(cleanup);
    c.source = graph.source(c);
    if (seed)
      await c.source.replace(fragment(c, [X(), Y()], [edge(), edge("B-edge-2", "B-fact-2")]));
    c.factory = () => {
      const w = new MessageGate();
      w.onLayout = () => {
        for (const notify of [...c.receivers]) notify(w);
      };
      c.workers.push(w);
      return w;
    };
    c.service = (options = {}) => {
      const s = new vm.LayoutService(c.graph, {
        workerFactory: c.factory,
        timeoutMs: 5000,
        ...options,
      });
      c.services.push(s);
      return s;
    };
    try {
      return await fn(c);
    } finally {
      cleanup();
    }
  });
}
export function projection(graph, direction = "RIGHT") {
  const state = graph.state;
  return {
    sessionId: state.sessionId,
    graphRevision: state.revision,
    direction,
    nodes: state.nodes.map((n) => ({
      id: n.id,
      width: 60,
      height: 32,
      ports: [
        { key: "same", width: 0, height: 0, side: "EAST" },
        { key: "尾", width: 2, height: 3, side: "WEST" },
      ],
    })),
    edges: state.edges.map((e) => ({ id: e.id, fromPort: "same", toPort: "尾" })),
  };
}
export async function start(c, s, input = projection(c.graph), method = "layout") {
  let notify;
  const next = new Promise((resolve) => {
    notify = (w) => {
      c.receivers.delete(notify);
      resolve(w);
    };
    c.receivers.add(notify);
  });
  const p = method === "layout" ? invoke(s, method, input) : invoke(s, method);
  const w = await Promise.race([
    next,
    p.then(() => {
      throw new Error("non-empty task completed without posting a native layout request");
    }),
  ]);
  assert(w);
  void w.request;
  return { p, w };
}
export async function success(c, s, input) {
  const task = await start(c, s, input);
  task.w.succeed();
  await task.p;
  assert.equal(s.state.status, "success");
  deep(s.state);
  return s.state.result;
}
export function resultMapping(c, s, input) {
  const r = s.state.result,
    state = c.graph.state;
  assert.equal(s.state.status, "success");
  assert.equal(r.sessionId, state.sessionId);
  assert.equal(r.graphRevision, state.revision);
  assert.equal(r.snapshotId, state.snapshotId);
  assert.equal(r.direction, input.direction);
  assert.deepEqual(
    r.nodes.map((n) => n.id),
    state.nodes.map((n) => n.id),
  );
  assert.deepEqual(
    r.edges.map((e) => [e.id, e.from, e.to]),
    state.edges.map((e) => [e.id, e.from, e.to]),
  );
  for (let i = 0; i < r.nodes.length; i++)
    assert.deepEqual(
      r.nodes[i].ports.map((p) => p.key),
      input.nodes[i].ports.map((p) => p.key),
    );
  for (const e of r.edges) {
    assert.equal(e.fromPort, "same");
    assert.equal(e.toPort, "尾");
    assert(e.sections.length);
    for (const section of e.sections) assert(section.length >= 2);
  }
  deep(r);
}
