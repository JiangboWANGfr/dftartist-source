import assert from "node:assert/strict";
import test from "node:test";
import { setup, geometry } from "../layout-encoding/fixture.mjs";
const M = await import(process.env.HIER_A_VIEWMODEL_ENTRY ?? "../../packages/viewmodel/dist/index.js");
const code = wanted => e => e instanceof M.LayoutError && e.code === wanted;
const deep = value => { if (value && typeof value === "object") { assert.ok(Object.isFrozen(value)); for (const v of Object.values(value)) deep(v); } };

test("A layout encoding: original message identities, custom ports and four directions agree in flat and folded modes", async () => {
  for (const folded of [false, true]) {
    const c = await setup(M, 4, folded);
    try {
      for (const direction of ["RIGHT", "DOWN", "LEFT", "UP"]) {
        const input = c.input(direction), before = JSON.stringify(input), task = await c.start(input, direction), sent = task.w.request.graph;
        const ids = folded ? input.nodes.map(n => n.target.id) : c.graph.state.nodes.map(n => n.id);
        assert.deepEqual(sent.children.map(n => n.id), ids.map(id => JSON.stringify(["node", id])));
        assert.equal(sent.layoutOptions["elk.direction"], direction);
        for (let i = 0; i < ids.length; i++) {
          const original = folded ? null : input.nodes.find(n => n.id === ids[i]);
          for (let j = 0; j < sent.children[i].ports.length; j++) {
            const key = original?.ports[j].key ?? JSON.parse(sent.children[i].ports[j].id)[2];
            assert.equal(sent.children[i].ports[j].id, JSON.stringify(["port", ids[i], key]));
          }
        }
        task.w.succeed(); await task.p; const result = c.layout.state.result;
        assert.equal(result.direction, direction); assert.deepEqual(result.nodes.map(n => n.id), ids); deep(result);
        assert.equal(JSON.stringify(input), before);
        if (folded) assert.equal(result.projectionId, input.id);
        else for (const n of result.nodes) assert.deepEqual(n.ports.map(p => p.key), input.nodes.find(x => x.id === n.id).ports.map(p => p.key));
      }
    } finally { c.close(); }
  }
});

test("A layout encoding: reordered Worker members preserve captured graph and port order", async () => {
  const c = await setup(M, 5);
  try {
    const input = c.input(), task = await c.start(input), raw = geometry(task.w.request.graph);
    raw.children.reverse(); raw.edges.reverse(); for (const n of raw.children) n.ports.reverse();
    task.w.succeed(raw); await task.p;
    assert.deepEqual(c.layout.state.result.nodes.map(n => n.id), c.graph.state.nodes.map(n => n.id));
    for (const n of c.layout.state.result.nodes) assert.deepEqual(n.ports.map(p => p.key), input.nodes.find(x => x.id === n.id).ports.map(p => p.key));
  } finally { c.close(); }
});

test("A layout encoding: bad identities, endpoints and geometry reject atomically while retaining prior success", async () => {
  const mutations = [r => r.children.pop(), r => r.children.push(r.children[0]), r => r.children[0].id = "unknown", r => r.children[0].ports[0].id = "unknown", r => r.edges[0].id = "unknown", r => r.edges[0].sources = [r.edges[0].targets[0]], r => r.edges[0].sections = [], r => r.children[0].width = 0, r => r.children[0].children = [r.children[1]]];
  const c = await setup(M, 3);
  try {
    const first = await c.success();
    for (const mutate of mutations) {
      const task = await c.start(), raw = geometry(task.w.request.graph); mutate(raw); task.w.succeed(raw);
      await assert.rejects(task.p, code("invalid_result")); assert.equal(c.layout.state.result, first.result); assert.equal(c.layout.state.status, "failed");
    }
  } finally { c.close(); }
});

test("A layout encoding: mutation of the mutable outgoing message cannot redefine expected input identities", async () => {
  const c = await setup(M, 3);
  try {
    const input = c.input(), before = JSON.stringify(input);
    c.mutateRequest = graph => { graph.children[0].id = "changed-after-encoding"; };
    const bad = await c.start(input); bad.w.succeed(); await assert.rejects(bad.p, code("invalid_result"));
    assert.equal(JSON.stringify(input), before);
    c.mutateRequest = null; const retry = await c.start(undefined, undefined, "retry"); retry.w.succeed(); await retry.p;
    assert.equal(c.layout.state.status, "success"); assert.notEqual(retry.w.request.graph.children[0].id, "changed-after-encoding");
  } finally { c.close(); }
});

test("A layout encoding: cancel, retry, supersede, source replacement and dispose revoke old attempts", async () => {
  const c = await setup(M, 3);
  try {
    const first = await c.start(); await c.layout.cancel(); await assert.rejects(first.p, code("cancelled"));
    const second = await c.start(undefined, undefined, "retry"); const secondId = c.layout.state.request.taskId;
    first.w.succeed(undefined, true); assert.equal(c.layout.state.request.taskId, secondId);
    const third = await c.start(); await assert.rejects(second.p, code("superseded")); second.w.succeed(undefined, true);
    third.w.succeed(); await third.p; const success = c.layout.state.result;
    const pending = await c.start(); await c.source.replace(c.fragment); await assert.rejects(pending.p, code("stale_graph"));
    pending.w.succeed(undefined, true); assert.equal(c.layout.state.status, "stale"); assert.equal(c.layout.state.result, success);
    const last = await c.start(); c.layout.dispose(); await assert.rejects(last.p, code("disposed")); last.w.succeed(undefined, true);
    assert.equal(c.layout.state.status, "disposed"); assert.equal(c.layout.state.result, null);
  } finally { c.close(); }
});

test("A layout encoding: result getters retain original lifecycle precedence and thrown cause", async () => {
  for (const dispose of [false, true]) {
    const c = await setup(M, 3), marker = {}; let changed;
    try {
      const task = await c.start(), raw = geometry(task.w.request.graph);
      Object.defineProperty(raw, "width", { enumerable: true, get() { if (dispose) c.layout.dispose(); else { changed = c.source.replace(c.fragment); changed.catch(() => {}); } throw marker; } });
      task.w.succeed(raw); await assert.rejects(task.p, e => { assert.equal(e.code, dispose ? "disposed" : "stale_graph"); assert.equal(e.cause, marker); return true; });
      if (changed) await changed;
    } finally { c.close(); }
  }
});

test("A layout encoding: empty flat and folded graphs complete without creating a Worker", async () => {
  for (const folded of [false, true]) {
    const c = await setup(M, 0, folded);
    try { const result = await c.success(); assert.equal(result.w, null); assert.equal(c.workers.length, 0); assert.equal(result.result.width, 0); assert.equal(result.result.height, 0); deep(result.result); }
    finally { c.close(); }
  }
});
