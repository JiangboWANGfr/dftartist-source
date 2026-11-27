import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout's actual Core");
const file = fileURLToPath(new URL("../../../core/tests/fixtures/a_m7/partial-reasons.sv", import.meta.url));
for (const perInstance of [false, true]) {
  test(`A partial reasons retain discovery order and qualified identity (${perInstance ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const transport = createProcessTransport({ command: resolve(command),
        args: ["serve", file, "--top", "partial_reasons_top", ...(perInstance ? ["--per-instance-bodies"] : [])] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => { client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); });
      await client.ready;
      const root = (await client.roots()).result[0];
      const children = (await client.children(root.ref)).result.items;
      assert.equal(children.length, 2);
      const retained = [];
      for (const child of children) {
        const a = (await client.signals(child.ref)).result.items.find((item) => item.name === "a");
        assert.ok(a);
        const expected = Array.from({ length: 40 }, (_, i) => ({ code: "blackbox", at: `p:${child.ref.slice(2)}.${i}:0` }));
        const drivers = await client.drivers({ slice: { ref: a.ref }, reach: "local" });
        const loads = await client.loads({ slice: { ref: a.ref }, reach: "local" });
        for (const reply of [drivers, loads]) {
          assert.equal(reply.completeness.status, "partial");
          assert.deepEqual(reply.completeness.reasons, expected);
          assert.equal(reply.result.length, reply === drivers ? 41 : 40);
        }
        const full = await client.step({ from: { ref: a.ref }, direction: "forward", maxHops: 1000 });
        assert.deepEqual(full.completeness.reasons, expected);
        const hops = []; const reasons = new Map(); let cursor; let pages = 0;
        do {
          const reply = await client.step({ from: { ref: a.ref }, direction: "forward", maxHops: 7, ...(cursor ? { cursor } : {}) });
          hops.push(...reply.result.hops);
          for (const reason of reply.completeness.reasons)
            if (reason.code === "blackbox") reasons.set(reason.at, reason);
          cursor = reply.result.next;
          assert.ok(++pages < 30);
        } while (cursor);
        assert.deepEqual(hops, full.result.hops);
        assert.deepEqual([...reasons.values()], expected);
        const cone = await client.cone({ start: { slice: { ref: a.ref, bits: { lsb: 0, width: 1 } } }, direction: "forward", policy: "full",
          budget: { maxNodes: 5000, maxEdges: 20000, maxDepth: 16 } });
        assert.deepEqual(cone.completeness.reasons.filter((reason) => reason.code === "blackbox"), expected);
        const stop = new AbortController(); stop.abort();
        await assert.rejects(client.loads({ slice: { ref: a.ref }, reach: "local" }, stop.signal), (error) => error.code === "cancelled");
        assert.deepEqual((await client.loads({ slice: { ref: a.ref }, reach: "local" })).completeness, loads.completeness);
        retained.push(full, cone);
      }
      client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.equal(retained[0].completeness.reasons.length, 40);
      assert.ok(retained[1].result.nodes.length > 0);
    });
}
