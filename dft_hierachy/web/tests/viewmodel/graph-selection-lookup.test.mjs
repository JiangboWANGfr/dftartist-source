import assert from "node:assert/strict";
import test from "node:test";
import { setup } from "../graph-selection/fixture.mjs";
import { expected } from "../independent-schematic-view/input.mjs";
const M = await import(process.env.HIER_A_VIEWMODEL_ENTRY ?? "../../packages/viewmodel/dist/index.js");
const code = wanted => e => e instanceof M.GraphProjectionError && e.code === wanted;

test("A graph selection: original nodes, ordered endpoints, overrides, self loops and omission survive repeated selection", async () => {
  const c = await setup(M); const { graph, selection } = c;
  try {
    const projection = M.createGraphProjection(graph), before = JSON.stringify(projection); let changes = 0;
    graph.subscribe(() => changes++);
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const node of projection.nodes) {
        const key = node.member.node.kind === "design" ? node.member.node.value.id : node.member.node.key;
        const items = expected[key] ?? (key === "ext" ? [{ ref: "B87:external", bits: { lsb: 1, width: 3 }, side: "outside" }] : []);
        if (!items.length) { const old = selection.current; assert.throws(() => M.selectGraphElement(graph, selection, node.target), code("not_selectable")); assert.equal(selection.current, old); }
        else { M.selectGraphElement(graph, selection, node.target); assert.deepEqual(selection.current, { snapshotId: graph.snapshotId, origin: "graph", items }); }
      }
      const edges = [
        [{ ref: "B87:x<&>", bits: { lsb: 2, width: 2 }, side: "inside" }, { ref: "B87:y", bits: { lsb: 0, width: 2 }, side: "outside" }],
        [{ ref: "B87:x<&>", bits: { lsb: 4, width: 2 }, side: "inside" }, { ref: "B87:y", bits: { lsb: 2, width: 2 }, side: "outside" }],
        [{ ref: "B87:x<&>", bits: { lsb: 2, width: 2 }, side: "inside" }],
        [{ ref: "B87:ref-only" }],
        [{ ref: "B87:external", bits: { lsb: 1, width: 3 }, side: "outside" }, ...expected["B-x"]],
      ];
      const ids = ["B-low", "B-high", "B-self", "B-no-bits", "external-edge"];
      projection.edges.forEach(edge => { const member = edge.member.edge; const i = ids.indexOf(member.kind === "design" ? member.value.id : member.key); assert.ok(i >= 0); M.selectGraphElement(graph, selection, edge.target); assert.deepEqual(selection.current.items, edges[i]); });
    }
    assert.equal(changes, 0); assert.equal(JSON.stringify(projection), before);
    const last = selection.current; selection.back(); selection.forward(); assert.equal(selection.current, last);
  } finally { c.close(); }
});

test("A graph selection: invalid receivers, lifecycle and snapshot take priority without touching targets", async () => {
  const c = await setup(M, 2), { graph, selection } = c;
  const target = new Proxy({}, { get() { throw Error("target touched"); }, ownKeys() { throw Error("target touched"); }, getPrototypeOf() { throw Error("target touched"); } });
  try {
    for (const g of [{}, Object.create(M.GraphSession.prototype), new Proxy(graph, {})]) assert.throws(() => M.selectGraphElement(g, selection, target), code("invalid_argument"));
    const other = new M.SelectionModel({ snapshotId: "different" });
    try { assert.throws(() => M.selectGraphElement(graph, other, target), code("snapshot_mismatch")); } finally { other.dispose(); }
    selection.dispose(); assert.throws(() => M.selectGraphElement(graph, selection, target), code("disposed"));
  } finally { c.close(); }
});

test("A graph selection: failed target reads keep cause and mutation fences ahead of invalid input", async () => {
  for (const dispose of [false, true]) {
    const c = await setup(M, 3), { graph, selection, source } = c, marker = {};
    try {
      M.selectGraphElement(graph, selection, c.target("edge", graph.state.edges[0].id));
      const old = selection.current, target = c.target("node", graph.state.nodes[0].id); let pending;
      Object.defineProperty(target, "id", { get() { if (dispose) graph.dispose(); else { pending = source.replace({ ...c.fragment, nodes: [], edges: [] }); pending.catch(() => {}); } throw marker; } });
      assert.throws(() => M.selectGraphElement(graph, selection, target), e => { assert.equal(e.code, dispose ? "disposed" : "stale_graph"); assert.equal(e.cause, marker); return true; });
      if (pending) await pending;
      assert.equal(selection.current, old);
    } finally { c.close(); }
  }
});

test("A graph selection: same external keys publish fresh mappings before graph notifications and old targets expire", async () => {
  const c = await setup(M, 4), { graph, selection, source } = c;
  try {
    const oldState = graph.state, oldTarget = c.target("edge", oldState.edges[0].id);
    M.selectGraphElement(graph, selection, oldTarget);
    const next = { ...c.fragment, nodes: c.fragment.nodes.map(n => ({ ...n, target: { ref: `new/${n.key}` } })) };
    let notifications = 0;
    const off = graph.subscribe(() => { notifications++; M.selectGraphElement(graph, selection, c.target("edge", graph.state.edges[0].id)); assert.deepEqual(selection.current.items, [{ ref: "new/n/2" }, { ref: "new/n/3" }]); });
    await source.replace(next); off(); assert.equal(notifications, 1);
    assert.equal(oldState.nodes.at(-1).node.target.ref, "A/ref/3");
    assert.throws(() => M.selectGraphElement(graph, selection, oldTarget), code("stale_graph"));
    const oldSelection = selection.current; await source.clear(); assert.equal(selection.current, oldSelection);
    await source.replace(c.fragment); M.selectGraphElement(graph, selection, c.target("edge", graph.state.edges[0].id));
    assert.deepEqual(selection.current.items.map(x => x.ref), ["A/ref/2", "A/ref/3"]);
  } finally { c.close(); }
});

test("A graph selection: unknown and malformed current targets preserve shared history", async () => {
  const c = await setup(M, 2), { graph, selection } = c;
  try {
    M.selectGraphElement(graph, selection, c.target("node", graph.state.nodes[0].id)); const before = selection.current;
    const valid = c.target("edge", graph.state.edges[0].id);
    for (const target of [{ ...valid, id: "unknown" }, { ...valid, kind: "nodes" }, { ...valid, extra: true }, { ...valid, id: undefined }, Object.create(valid)]) assert.throws(() => M.selectGraphElement(graph, selection, target), code("invalid_argument"));
    assert.equal(selection.current, before); assert.equal(selection.canGoForward, false);
  } finally { c.close(); }
});

test("A graph selection: selection listener failures propagate after commit and do not restore obsolete graph state", async () => {
  const c = await setup(M, 3), { graph, selection, source } = c; let pending;
  try {
    const target = c.target("edge", graph.state.edges[0].id), marker = {};
    selection.subscribe(() => { pending = source.clear(); pending.catch(() => {}); throw marker; });
    assert.throws(() => M.selectGraphElement(graph, selection, target), e => { assert.ok(e instanceof AggregateError); assert.deepEqual(e.errors, [marker]); return true; });
    await pending; assert.equal(graph.state.nodes.length, 0); assert.deepEqual(selection.current.items.map(x => x.ref), ["A/ref/1", "A/ref/2"]);
    assert.throws(() => M.selectGraphElement(graph, selection, target), code("stale_graph"));
  } finally { c.close(); }
});
