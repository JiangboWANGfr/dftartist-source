import assert from "node:assert/strict";
import test from "node:test";
import * as M from "@hier/viewmodel";
import { setup, countEncoding } from "../layout-encoding/fixture.mjs";

test("A layout encoding: each attempt encodes identities once, validation reuses them, retry creates its own encoding", async () => {
  for (const folded of [false, true]) {
    const c = await setup(M, 64, folded);
    try {
      const first = await countEncoding(() => c.start()), graph = first.value.w.request.graph;
      const expected = { node: graph.children.length, port: graph.children.reduce((n, x) => n + x.ports.length, 0), edge: graph.edges.length };
      assert.deepEqual(first.counts, expected);
      await c.layout.cancel(); await assert.rejects(first.value.p, e => e.code === "cancelled");
      const retry = await countEncoding(() => c.start(undefined, undefined, "retry")); assert.deepEqual(retry.counts, expected);
      const validation = await countEncoding(async () => { retry.value.w.succeed(); await retry.value.p; });
      assert.deepEqual(validation.counts, { node: 0, port: 0, edge: 0 });
    } finally { c.close(); }
  }
});
