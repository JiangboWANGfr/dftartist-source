import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout's actual Core");
const file = fileURLToPath(
  new URL("../../../core/tests/fixtures/a_m7/signal-pages.sv", import.meta.url),
);

for (const perInstance of [false, true]) {
  test(`A filtered signal pages retain SDK/Core values (${perInstance ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const transport = createProcessTransport({
        command: resolve(command),
        args: ["serve", file, "--top", "signal_top", ...(perInstance ? ["--per-instance-bodies"] : [])],
      });
      // Repeated requests must reach Core rather than a prior SDK reply cache.
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => {
        client.dispose();
        assert.deepEqual(await transport.exited, { code: 0, signal: null });
      });
      const snapshot = await client.ready;
      assert.equal(snapshot.schemaVersion, 7);
      const retained = [];
      for (const inst of ["i:0.0", "i:0.1", "i:000.01"]) {
        const all = await client.signals(inst, { limit: 1000 });
        assert.equal(all.completeness.status, "complete");
        assert.equal(all.result.items.length, 9);
        for (const text of ["", "match", "Match", ".", "g[", "absent", "\0"]) {
          const expected = all.result.items.filter((item) => item.name.includes(text));
          if (text === "match") {
            assert.equal(expected.length, 6);
            assert.equal(expected.filter((item) => item.name === "match_scoped").length, 3);
            assert.equal(expected.find((item) => item.name === "match_first").width, 4);
          }
          const items = [];
          let cursor;
          let pages = 0;
          do {
            const reply = await client.signals(inst, {
              limit: [1, 3, 2][pages++ % 3],
              ...(cursor === undefined ? {} : { cursor }),
              filter: { text },
            });
            assert.equal(reply.completeness.status, "complete");
            items.push(...reply.result.items);
            cursor = reply.result.next;
            assert.ok(pages < 20);
          } while (cursor !== undefined);
          assert.deepEqual(items, expected);
          retained.push(structuredClone(items));
          const binding = `signals|${inst}${text === "" ? "" : `|filter:${Buffer.byteLength(text)}:${text}`}`;
          const eof = await client.signals(inst, {
            filter: { text }, limit: 1, cursor: `${binding}@${expected.length}`,
          });
          assert.deepEqual(eof.result, { items: [] });
        }
        const first = await client.signals(inst, { filter: { text: "match" }, limit: 1 });
        assert.ok(first.result.next);
        for (const [other, text] of [[inst, "Match"], ["i:000.0", "match"]]) {
          await assert.rejects(
            client.signals(other, { filter: { text }, cursor: first.result.next, limit: 1 }),
            (error) => error.code === "bad_request" && error.origin === "core",
          );
        }
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
          client.signals(inst, { filter: { text: "match" }, limit: 1 }, controller.signal),
          (error) => error.code === "cancelled",
        );
        assert.equal((await client.signals(inst, {
          filter: { text: "match" }, limit: 1, cursor: first.result.next,
        })).result.items.length, 1);
      }
      assert.deepEqual((await client.signals("i:0.2", { filter: { text: "match" } })).result, { items: [] });
      client.dispose();
      assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.equal(retained[1].length, 6);
      assert.equal(retained[1][0].name, "match_first");
    });
}
