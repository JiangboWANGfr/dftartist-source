import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout's actual Core");
const file = fileURLToPath(new URL("../../../core/tests/fixtures/a_m7/register-traversal.sv", import.meta.url));
for (const per of [false, true]) {
  test(`A recursive register traversal retains SDK DFS pages and clock identity (${per ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const transport = createProcessTransport({ command: resolve(command), args: ["serve", file,
        "--top", "traversal_top", ...(per ? ["--per-instance-bodies"] : [])] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => { client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); });
      await client.ready;
      const root = (await client.roots()).result[0];
      const children = (await client.children(root.ref)).result.items;
      assert.deepEqual(children.map((item) => item.name), ["first", "middle", "last"]);
      const first = (await client.children(children[0].ref)).result.items;
      const last = (await client.children(children[2].ref)).result.items;
      assert.deepEqual(first.map((item) => item.name), ["left", "right", "opaque"]);
      const expected = [first[0].ref, first[1].ref, children[1].ref, last[0].ref, last[1].ref];
      const full = await client.registers(root.ref, { recursive: true, limit: 200 });
      assert.deepEqual(full.result.items.map((item) => item.inst), expected);
      const retained = full.result.items;
      for (const reg of retained) {
        const signals = (await client.signals(reg.inst)).result.items;
        const ref = (name) => signals.find((item) => item.name === name)?.ref;
        assert.equal(reg.signal, ref("q")); assert.deepEqual(reg.bits, { lsb: 0, width: 1 });
        assert.equal(reg.clock.signal, ref("clk")); assert.equal(reg.clock.edge, "posedge");
        assert.equal(reg.async.length, 1); assert.equal(reg.async[0].signal, ref("reset_n"));
        assert.equal(reg.async[0].edge, "negedge"); assert.equal(reg.async[0].type, "reset");
      }
      assert.deepEqual((await client.registers(root.ref)).result.items, []);
      assert.deepEqual((await client.registers(first[2].ref, { recursive: true })).result.items, []);
      const joined = []; let cursor; let count = 0; let firstCursor;
      do {
        const page = await client.registers(root.ref, { recursive: true, limit: [1, 2, 1][count++ % 3],
          ...(cursor ? { cursor } : {}) });
        assert.deepEqual(page.completeness, full.completeness);
        joined.push(...page.result.items); cursor = page.result.next;
        firstCursor ??= cursor;
        assert.ok(count < 10);
      } while (cursor);
      assert.deepEqual(joined, retained);
      await assert.rejects(client.registers(root.ref, { recursive: false, cursor: firstCursor }),
        (error) => error.code === "bad_request" && error.origin === "core");
      const stop = new AbortController(); stop.abort();
      await assert.rejects(client.registers(root.ref, { recursive: true }, stop.signal),
        (error) => error.code === "cancelled");
      assert.deepEqual((await client.registers(root.ref, { recursive: true })).result.items, retained);
      client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.equal(retained.length, 5); assert.ok(retained[4].clock.signal.length > 0);
    });
}
