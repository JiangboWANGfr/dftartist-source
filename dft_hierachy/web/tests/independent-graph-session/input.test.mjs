import { test } from "node:test";
import assert from "node:assert/strict";
import { realInput } from "./core-input.mjs";
import { context } from "../independent-properties/harness.mjs";
import { X, Y, edge } from "./input.mjs";
test(
  "B79 actual RTL/SDK/Core input control (not GraphSession runtime)",
  { timeout: 20000 },
  async () => {
    const controlled = await context({ withModel: false });
    try {
      const result = {
        nodes: [X().value, Y().value],
        edges: [edge().value],
        frontier: [],
        hasConservative: false,
      };
      const query = controlled.client.cone({
        start: X().value.point,
        direction: "back",
        policy: "structural",
      });
      const request = await controlled.wire.next("trace.cone");
      controlled.wire.ok(request, result);
      assert.deepEqual(
        (await query).result,
        result,
        "controlled DTOs pass actual SDK Schema decoding",
      );
    } finally {
      await controlled.close();
    }
    const c = await realInput();
    try {
      assert.equal(c.fragment.snapshotId, c.snapshot.snapshotId);
      assert.equal(c.partialFragment.completeness.status, "partial");
      console.log(
        JSON.stringify({
          kind: "B79-real-input",
          graphSessionExecuted: false,
          fullNodes: c.full.result.nodes.length,
          fullEdges: c.full.result.edges.length,
          partial: c.partial.completeness,
          frontier: c.partial.result.frontier,
        }),
      );
    } finally {
      await c.close();
    }
  },
);
