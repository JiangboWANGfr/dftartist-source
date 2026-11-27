// Original B RTL and actual public SDK/Core, not A's witness/test or fake GraphSession.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
export async function realInput() {
  const p = process.env.HIER_B_PRODUCT_ROOT;
  assert(p && process.env.HIER_BIN);
  const { HierClient } = await import(publicEntry(p, "@hier/client")),
    { createProcessTransport } = await import(publicEntry(p, "@hier/client/node"));
  const transport = createProcessTransport({
    command: process.env.HIER_BIN,
    args: ["serve", "--top", "B_graph_top", fileURLToPath(new URL("./design.sv", import.meta.url))],
  });
  transport.exited.catch(() => {});
  const client = new HierClient(transport);
  client.ready.catch(() => {});
  const close = async () => {
    client.dispose();
    assert.deepEqual(await transport.exited, { code: 0, signal: null });
  };
  try {
    const snapshot = await client.ready;
    assert.deepEqual(
      snapshot.tops.map((x) => x.name),
      ["B_graph_top"],
    );
    const roots = await client.roots();
    assert.equal(roots.completeness.status, "complete");
    assert.equal(roots.result.length, 1);
    const ports = (await client.ports(roots.result[0].ref)).result;
    assert.deepEqual(
      ports.map((x) => [x.name, x.width]),
      [
        ["a", 4],
        ["y", 4],
        ["z", 4],
      ],
    );
    const query = (name, budget) =>
      client.cone({
        start: {
          slice: { ref: ports.find((p) => p.name === name).ref, bits: { lsb: 1, width: 2 } },
          side: "inside",
        },
        direction: "back",
        policy: "combinational",
        ...(budget ? { budget } : {}),
      });
    const full = await query("y"),
      again = await query("y"),
      partial = await query("y", { maxNodes: 1 }),
      other = await query("z");
    assert.equal(full.completeness.status, "complete");
    assert.deepEqual(again, full);
    assert(
      full.result.nodes.some(
        (n) =>
          n.point?.slice.ref === ports[0].ref &&
          n.point.slice.bits.lsb === 1 &&
          n.point.slice.bits.width === 2,
      ),
      "literal RTL upstream a[2:1]",
    );
    const repeated = full.result.edges.some((e, i, a) =>
      a.slice(i + 1).some((f) => f.from === e.from && f.to === e.to && f.fact !== e.fact),
    );
    assert(repeated, "two RTL continuous drivers retain distinct facts/edges");
    for (const reply of [full, partial, other]) {
      const ids = new Set(reply.result.nodes.map((x) => x.id));
      for (const e of reply.result.edges) {
        assert(ids.has(e.from) && ids.has(e.to));
      }
    }
    assert.equal(partial.completeness.status, "partial");
    assert(partial.completeness.reasons.some((r) => r.code === "budget_nodes"));
    assert(partial.result.frontier.length > 0);
    assert(
      full.result.nodes.some((n) => other.result.nodes.some((m) => m.id === n.id)),
      "two actual outputs share upstream node",
    );
    const asFragment = (reply) => ({
      snapshotId: snapshot.snapshotId,
      nodes: reply.result.nodes.map((value) => ({ kind: "design", value })),
      edges: reply.result.edges.map((value) => ({ kind: "design", value })),
      completeness: reply.completeness,
      frontier: reply.result.frontier,
      hasConservative: reply.result.hasConservative,
    });
    return {
      client,
      transport,
      snapshot,
      full,
      partial,
      other,
      fragment: asFragment(full),
      partialFragment: asFragment(partial),
      close,
    };
  } catch (e) {
    await close();
    throw e;
  }
}
