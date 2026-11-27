import assert from "node:assert/strict";
import { test } from "node:test";
import { GraphSession, createFoldedGraphProjection, FoldProjectionError } from "@hier/viewmodel";
import { sdk } from "../independent-tree/harness.mjs";
import { external } from "../independent-graph-session/input.mjs";

// A's C-106 regressions use real models and the original legal external DTO fixture.
async function graph(t, count) {
  const c = await sdk(t);
  const g = new GraphSession(c.client);
  c.models.push(g);
  const source = g.registerSource({ origin: "analysis", label: "C-106" });
  await source.replace({
    snapshotId: g.state.snapshotId,
    nodes: Array.from({ length: count }, (_, i) => external(`n${i}`, `n${i}`)),
    edges: [],
    completeness: { status: "complete", reasons: [] },
    frontier: [],
    hasConservative: false,
  });
  return g;
}

test("C-106: group validation agrees with set relations for every ordered triple on four nodes", async (t) => {
  const g = await graph(t, 4);
  const state = g.state;
  // Independent finite oracle from §6.32: disjoint or strict containment for each pair.
  const compatible = (a, b) => {
    const shared = a & b;
    return shared === 0 || (a !== b && (shared === a || shared === b));
  };
  for (let a = 1; a < 16; a++) {
    for (let b = 1; b < 16; b++) {
      for (let c = 1; c < 16; c++) {
        const masks = [a, b, c];
        const options = {
          groups: masks.map((mask, i) => ({
            kind: "hierarchy",
            key: `g${i}`,
            label: `g${i}`,
            nodes: state.nodes.filter((_, n) => mask & (1 << n)).map((n) => n.id),
          })),
          collapsed: [],
        };
        const valid = compatible(a, b) && compatible(a, c) && compatible(b, c);
        if (valid) {
          const p = createFoldedGraphProjection(g, options);
          assert.equal(p.state, state);
          assert.deepEqual(
            p.nodes.map((n) => n.members[0]),
            state.nodes,
          );
          assert.deepEqual(p.options, options, "validation must not sort captured input");
        } else {
          assert.throws(
            () => createFoldedGraphProjection(g, options),
            (error) => error instanceof FoldProjectionError && error.code === "invalid_argument",
            `expanded invalid groups: ${masks}`,
          );
        }
      }
    }
  }
  assert.equal(g.state, state);
});

test("C-106: 16000 disjoint singleton groups preserve all members expanded and collapsed", async (t) => {
  const g = await graph(t, 16000);
  const state = g.state;
  const groups = state.nodes.map((n, i) => ({
    kind: "hierarchy",
    key: `h${i}`,
    label: `h${i}`,
    nodes: [n.id],
  }));
  for (const collapsed of [[], groups.map((group) => group.key)]) {
    const start = performance.now();
    const p = createFoldedGraphProjection(g, { groups, collapsed });
    const duration = performance.now() - start;
    assert.equal(p.nodes.length, state.nodes.length);
    assert.deepEqual(p.edges, []);
    assert.equal(p.state, state);
    for (const [i, n] of p.nodes.entries()) {
      assert.equal(n.members.length, 1);
      assert.equal(n.members[0], state.nodes[i]);
      assert.equal(n.kind, collapsed.length ? "hierarchy" : "member");
    }
    // Diagnostic only: no machine-dependent absolute performance acceptance threshold.
    t.diagnostic(`${collapsed.length ? "collapsed" : "expanded"}: ${duration.toFixed(3)} ms`);
  }
  assert.equal(g.state, state);
});
