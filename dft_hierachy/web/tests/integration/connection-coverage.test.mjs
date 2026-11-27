import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout's actual Core");
const file = fileURLToPath(new URL("../../../core/tests/fixtures/a_m7/connection-coverage/coverage.sv", import.meta.url));
for (const perInstance of [false, true]) {
  test(`A connection coverage preserves SDK step pages and traces (${perInstance ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const transport = createProcessTransport({ command: resolve(command),
        args: ["serve", file, "--top", "coverage_top", ...(perInstance ? ["--per-instance-bodies"] : [])] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => { client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); });
      await client.ready;
      const root = (await client.roots()).result[0];
      const children = (await client.children(root.ref)).result.items;
      assert.equal(children.length, 2);
      const retained = [];
      for (const child of children) {
        const signals = (await client.signals(child.ref)).result.items;
        const a = signals.find((item) => item.name === "a");
        const y = signals.find((item) => item.name === "y");
        assert.ok(a && y);
        const empty = await client.loads({ slice: { ref: a.ref, bits: { lsb: 8, width: 16 } }, reach: "local" });
        assert.deepEqual(empty.result, []); assert.equal(empty.completeness.status, "complete");
        const constant = await client.drivers({ slice: { ref: y.ref, bits: { lsb: 24, width: 8 } }, reach: "local" });
        assert.equal(constant.result.length, 1); assert.equal(constant.result[0].kind, "process");
        const process = (await client.proc(constant.result[0].ref)).result;
        assert.equal(process.expr.op, "const");
        assert.equal(process.expr.value, "8'b10100101");
        const full = await client.step({ from: { ref: a.ref }, direction: "forward", maxHops: 1000 });
        assert.equal(full.result.hops.length, 3);
        const pages = []; let cursor; let page = 0;
        do {
          const reply = await client.step({ from: { ref: a.ref }, direction: "forward", maxHops: [1, 3, 2][page++ % 3], ...(cursor ? { cursor } : {}) });
          pages.push(...reply.result.hops); cursor = reply.result.next;
          assert.ok(page < 10);
        } while (cursor);
        assert.deepEqual(pages, full.result.hops);
        const cone = await client.cone({ start: { slice: { ref: a.ref, bits: { lsb: 0, width: 8 } } }, direction: "forward", policy: "full" });
        assert.ok(cone.result.edges.length > 0);
        await assert.rejects(client.step({ from: { ref: a.ref, bits: { lsb: 32, width: 1 } }, direction: "forward" }),
          (error) => error.code === "bad_request" && error.origin === "core");
        await assert.rejects(client.step({ from: { ref: a.ref }, direction: "forward", cursor: "broken" }),
          (error) => error.code === "bad_request" && error.origin === "core");
        const stop = new AbortController(); stop.abort();
        await assert.rejects(client.step({ from: { ref: a.ref }, direction: "forward" }, stop.signal), (error) => error.code === "cancelled");
        assert.deepEqual((await client.step({ from: { ref: a.ref }, direction: "forward", maxHops: 1000 })).result.hops, full.result.hops);
        retained.push(full.result.hops, cone.result);
      }
      client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.equal(retained[0].length, 3); assert.ok(retained[1].edges.length > 0);
    });
}
