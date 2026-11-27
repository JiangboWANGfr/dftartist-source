// Reuse B's accepted SDK/context and owned cleanup, not a replacement GraphSession.
import assert from "node:assert/strict";
import * as old from "../independent-properties/harness.mjs";
export const { vm, HierClient, HierError, deep, tick, snapshotProbe } = old;
export const releaseAll = old.releaseAll;
export function capability() {
  assert.equal(
    typeof vm.GraphSession,
    "function",
    "M6 source runtime not implemented: public GraphSession export absent",
  );
  assert.equal(typeof vm.GraphSessionError, "function", "M6 GraphSessionError export absent");
}
export const local = (code) => (error) => {
  assert(error instanceof vm.GraphSessionError);
  assert.equal(error.code, code);
  return true;
};
export function command(c, source, name, ...args) {
  let p;
  assert.doesNotThrow(() => {
    p = source[name](...args);
  }, name + " rejects through Promise");
  assert(p instanceof Promise);
  c.commands.push(old.observe(p));
  return p;
}
export async function using(fn, options = {}) {
  const c = await old.context({ withModel: false, id: "B-graph-snapshot", ...options });
  try {
    c.graph = new vm.GraphSession(c.client);
    c.models.push(c.graph);
    return await fn(c);
  } finally {
    await c.close();
  }
}
export const source = (c, origin = "analysis", label = "来源") =>
  c.graph.registerSource({ origin, label });
export function consistent(state) {
  deep(state);
  const ids = new Set(state.nodes.map((n) => n.id));
  for (const e of state.edges) {
    assert(ids.has(e.from));
    assert(ids.has(e.to));
  }
  for (const s of state.sources)
    if (s.content) {
      for (const n of s.content.nodes) assert(ids.has(n));
      for (const e of s.content.edges) assert(state.edges.some((x) => x.id === e));
    }
}
export const designNodes = (c) => c.graph.state.nodes.filter((n) => n.node.kind === "design");
export const find = (c, id) => designNodes(c).find((n) => n.node.value.id === id);
export async function unready(fn) {
  const c = await old.context({ withModel: false, ready: false });
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}
