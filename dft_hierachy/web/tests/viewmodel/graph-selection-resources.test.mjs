import assert from "node:assert/strict";
import test from "node:test";
import * as M from "@hier/viewmodel";
import { setup, countLookups } from "../graph-selection/fixture.mjs";

test("A graph selection: repeated current targets avoid whole member traversal and new revisions rebuild only on demand", async () => {
  const c = await setup(M, 1024), { graph, selection, source } = c;
  const select = () => M.selectGraphElement(graph, selection, c.target("edge", graph.state.edges[0].id));
  try {
    select(); const current = selection.current;
    const hot = countLookups(graph, () => { for (let i = 0; i < 64; i++) select(); });
    assert.deepEqual(hot, { nodeFind: 0, edgeFind: 0, nodeMap: 0, edgeMap: 0 }); assert.equal(selection.current, current);
    await source.replace(c.fragment);
    const first = countLookups(graph, select);
    assert.equal(first.nodeMap, graph.state.nodes.length); assert.equal(first.edgeMap, graph.state.edges.length);
    const next = countLookups(graph, select); assert.deepEqual(next, hot);
    const stale = c.target("edge", graph.state.edges[0].id);
    graph.dispose(); assert.throws(() => M.selectGraphElement(graph, selection, stale), e => e.code === "disposed");
  } finally { c.close(); }
});
