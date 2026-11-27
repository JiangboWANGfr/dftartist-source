import assert from "node:assert/strict";
import { setup as setupGraph } from "../graph-selection/fixture.mjs";
import { MessageGate, geometry } from "../independent-layout/worker.mjs";
export { geometry };

export async function setup(M, size = 4, folded = false) {
  const c = await setupGraph(M, size), workers = [], waiters = new Set();
  c.folded = folded; c.workers = workers; c.mutateRequest = null;
  c.factory = () => {
    const w = new MessageGate(), send = w.postMessage.bind(w);
    w.postMessage = message => { if (message.cmd === "layout") c.mutateRequest?.(message.graph); send(message); };
    w.onLayout = () => { for (const resolve of waiters) resolve(w); waiters.clear(); };
    workers.push(w); return w;
  };
  c.layout = folded ? new M.LayoutService(c.graph, { timeoutMs: 5000, workerFactory: c.factory }, "folded") : new M.LayoutService(c.graph, { timeoutMs: 5000, workerFactory: c.factory });
  c.input = (direction = "RIGHT") => {
    if (folded) return M.createFoldedGraphProjection(c.graph, { groups: size > 1 ? [{ kind: "hierarchy", key: "A/group", label: "group", nodes: c.graph.state.nodes.slice(0, 2).map(n => n.id) }] : [], collapsed: size > 1 ? ["A/group"] : [] });
    return {
      sessionId: c.graph.id, graphRevision: c.graph.state.revision, direction,
      nodes: c.graph.state.nodes.map((n, i) => ({ id: n.id, width: 71 + i, height: 49 + i, ports: [{ key: 'same\u0000"尾', width: 0, height: 0, side: "EAST" }, { key: "node/port[]", width: 7, height: 9, side: "WEST" }] })).reverse(),
      edges: c.graph.state.edges.map(e => ({ id: e.id, fromPort: 'same\u0000"尾', toPort: "node/port[]" })).reverse(),
    };
  };
  c.start = async (input = c.input(), direction = "RIGHT", method = "layout") => {
    let resolve; const sent = new Promise(yes => { resolve = yes; waiters.add(yes); });
    const p = method === "retry" ? c.layout.retry() : folded ? c.layout.layout(input, direction) : c.layout.layout(input);
    p.catch(() => {});
    try { const w = await Promise.race([sent, p.then(() => null)]); return { p, w }; }
    finally { waiters.delete(resolve); }
  };
  c.success = async (input = c.input(), direction = "RIGHT") => { const task = await c.start(input, direction); task.w?.succeed(); await task.p; return { ...task, result: c.layout.state.result }; };
  const closeGraph = c.close;
  c.close = () => {
    c.layout.dispose(); closeGraph();
    for (const w of workers) { assert.equal(w.terminated, 1); assert.equal(w.handlerCount, 0); }
  };
  return c;
}

export async function countEncoding(run) {
  const stringify = JSON.stringify, counts = { node: 0, port: 0, edge: 0 };
  JSON.stringify = function (value, ...args) {
    if (Array.isArray(value) && ((value.length === 2 && ["node", "edge"].includes(value[0])) || (value.length === 3 && value[0] === "port"))) counts[value[0]]++;
    return stringify.call(this, value, ...args);
  };
  try { return { value: await run(), counts }; } finally { JSON.stringify = stringify; }
}
