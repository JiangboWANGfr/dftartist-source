import assert from "node:assert/strict";
import { using as foldUsing, vm, deep, tick } from "../independent-fold-projection/harness.mjs";
import { fullOptions } from "../independent-fold-projection/input.mjs";
import { MessageGate } from "../independent-layout/worker.mjs";
import { invoke, local } from "../independent-layout/harness.mjs";
export { vm, deep, tick, invoke, local };
export const fold = (c, options = fullOptions(c.graph)) =>
  vm.createFoldedGraphProjection(c.graph, options);
export async function using(fn) {
  return foldUsing(async (c) => {
    c.workers = [];
    c.services = [];
    c.receivers = new Set();
    c.factory = () => {
      const w = new MessageGate();
      w.onLayout = () => {
        for (const f of [...c.receivers]) f(w);
      };
      c.workers.push(w);
      return w;
    };
    c.make = (options = {}, mode = "folded") => {
      const args = [c.graph, { workerFactory: c.factory, timeoutMs: 5000, ...options }];
      const service =
        mode === "graph" ? new vm.LayoutService(...args) : new vm.LayoutService(...args, mode);
      c.services.push(service);
      if (mode === "folded")
        assert.equal(
          service.mode,
          "folded",
          "missing production folded LayoutService.mode capability",
        );
      return service;
    };
    try {
      return await fn(c);
    } finally {
      for (const service of c.services) service.dispose();
      for (const worker of c.workers) {
        assert.equal(worker.terminated, 1, "owned Worker reclaimed once");
        assert.equal(worker.handlerCount, 0, "Worker handlers released");
      }
      assert.equal(c.receivers.size, 0, "no test request waiter retained");
    }
  });
}
export async function start(c, s, p = fold(c), direction, method = "layout") {
  let notify;
  const next = new Promise((resolve) => {
    notify = (w) => {
      c.receivers.delete(notify);
      resolve(w);
    };
    c.receivers.add(notify);
  });
  const promise = method === "retry" ? invoke(s, "retry") : invoke(s, "layout", p, direction);
  try {
    const worker = await Promise.race([
      next,
      promise.then(() => {
        throw Error("non-empty layout resolved without ELK request");
      }),
    ]);
    return { p: promise, w: worker };
  } finally {
    c.receivers.delete(notify);
  }
}
export async function success(c, s, p = fold(c), direction) {
  const task = await start(c, s, p, direction);
  task.w.succeed();
  await task.p;
  return s.state.result;
}
export function result(s, p, direction = "RIGHT") {
  const r = s.state.result;
  assert.equal(s.state.status, "success");
  assert.equal(r.projectionId, p.id);
  assert.equal(r.sessionId, p.state.sessionId);
  assert.equal(r.snapshotId, p.state.snapshotId);
  assert.equal(r.graphRevision, p.state.revision);
  assert.equal(r.direction, direction);
  assert.equal("projectionId" in s.state, false);
  assert.deepEqual(
    r.nodes.map((n) => n.id),
    p.nodes.map((n) => n.target.id),
  );
  assert.deepEqual(
    r.edges.map((e) => [e.id, e.from, e.to]),
    p.edges.map((e) => [e.target.id, e.from, e.to]),
  );
  for (const n of r.nodes) {
    const ports = [];
    for (const edge of p.edges)
      for (const [end, node] of [
        ["from", edge.from],
        ["to", edge.to],
      ])
        if (node === n.id) ports.push(JSON.stringify(["edge", edge.target.id, end]));
    assert.deepEqual(
      n.ports.map((port) => port.key),
      ports,
    );
    for (const port of n.ports) {
      assert.equal(port.width, 6);
      assert.equal(port.height, 6);
    }
    const counts = {};
    for (const port of n.ports) counts[port.side] = (counts[port.side] ?? 0) + 1;
    const extent = 16 * (Math.max(0, ...Object.values(counts)) + 1),
      horizontal = ["RIGHT", "LEFT"].includes(direction);
    assert.equal(n.width, horizontal ? 160 : Math.max(160, extent));
    assert.equal(n.height, horizontal ? Math.max(64, extent) : 64);
  }
  const sides = {
    RIGHT: ["EAST", "WEST"],
    LEFT: ["WEST", "EAST"],
    DOWN: ["SOUTH", "NORTH"],
    UP: ["NORTH", "SOUTH"],
  }[direction];
  for (const e of r.edges)
    for (const [end, index] of [
      ["from", 0],
      ["to", 1],
    ]) {
      const key = JSON.stringify(["edge", e.id, end]),
        n = r.nodes.find((n) => n.id === e[end]);
      assert.equal(e[end + "Port"], key);
      assert.equal(n.ports.find((port) => port.key === key).side, sides[index]);
    }
  deep(r);
  deep(s.state);
  return r;
}
