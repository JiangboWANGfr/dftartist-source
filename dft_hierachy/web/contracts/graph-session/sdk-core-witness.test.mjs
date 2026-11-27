import assert from "node:assert/strict";
import test from "node:test";
import { HierError } from "@hier/client";
import { SelectionModel } from "@hier/viewmodel";
import { createSession } from "../search/core-session.mjs";

// Real existing Core/SDK only. The proposed GraphSession is not implemented or run.
async function query(client, text, budget) {
  const matches = (await client.resolvePath(text)).result;
  assert.equal(matches.length, 1);
  return {
    start: { slice: { ref: matches[0], bits: { lsb: 0, width: 1 } } },
    direction: "back",
    policy: "combinational",
    ...(budget ? { budget } : {}),
  };
}

test("A graph capability: Core IDs retain shared nodes and distinct facts across real queries", async (t) => {
  const client = await createSession(t);
  const firstQuery = await query(client, "search_top.left.needle");
  const secondQuery = await query(client, "search_top.left.Needle");
  const first = await client.cone(firstQuery);
  const second = await client.cone(secondQuery);
  assert.equal(first.completeness.status, "complete");
  assert.equal(second.completeness.status, "complete");
  const firstNodes = new Map(first.result.nodes.map((node) => [node.id, node]));
  const shared = second.result.nodes.filter((node) => firstNodes.has(node.id));
  assert.ok(shared.length > 0, "two real cones share canonical design members");
  for (const node of shared) assert.deepEqual(node, firstNodes.get(node.id));
  for (const reply of [first, second]) {
    const ids = new Set(reply.result.nodes.map((node) => node.id));
    assert.equal(ids.size, reply.result.nodes.length);
    assert.equal(
      new Set(reply.result.edges.map((edge) => edge.id)).size,
      reply.result.edges.length,
    );
    assert.ok(reply.result.edges.length > 0);
    for (const edge of reply.result.edges) {
      assert.ok(ids.has(edge.from) && ids.has(edge.to), "original graph is self-contained");
      assert.ok(edge.fact.length > 0);
      if (edge.kind !== "boundary") {
        assert.ok(edge.fromBits && edge.toBits);
        assert.ok(Array.isArray(edge.map));
      }
    }
    assert.ok(Object.isFrozen(reply) && Object.isFrozen(reply.result.nodes[0]));
  }
  const firstEdges = new Set(first.result.edges.map((edge) => edge.id));
  assert.ok(second.result.edges.some((edge) => !firstEdges.has(edge.id)));
  const before = JSON.stringify([first, second]);
  assert.deepEqual(await client.cone(firstQuery), first);
  assert.equal(JSON.stringify([first, second]), before);
  const selection = new SelectionModel({ snapshotId: client.snapshot.snapshotId });
  try {
    selection.select({
      snapshotId: client.snapshot.snapshotId,
      origin: "graph",
      items: [{ ref: firstQuery.start.slice.ref, bits: firstQuery.start.slice.bits }],
    });
    const selected = selection.current;
    await client.cone(secondQuery);
    assert.equal(selection.current, selected, "SDK query does not replace shared selection");
  } finally {
    selection.dispose();
  }
  console.log(
    JSON.stringify({
      graphSessionExecuted: false,
      nodes: [first.result.nodes.length, second.result.nodes.length],
      edges: [first.result.edges.length, second.result.edges.length],
      sharedIds: shared.map((node) => node.id),
      complete: true,
    }),
  );
});

test("A graph capability: actual budget partial and pre-cancel remain explicit", async (t) => {
  const client = await createSession(t);
  const request = await query(client, "search_top.left.needle", { maxNodes: 1 });
  const partial = await client.cone(request);
  assert.equal(partial.completeness.status, "partial");
  assert.ok(partial.result.frontier.length > 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.cone(request, controller.signal),
    (error) => error instanceof HierError && error.code === "cancelled",
  );
  const complete = await client.cone(await query(client, "search_top.left.needle"));
  assert.equal(complete.completeness.status, "complete");
  console.log(
    JSON.stringify({
      graphSessionExecuted: false,
      completeness: partial.completeness,
      frontier: partial.result.frontier,
      preCancelledOnly: true,
      recoveryComplete: true,
    }),
  );
});
