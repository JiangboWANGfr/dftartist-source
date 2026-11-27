import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout's actual Core");
const file = fileURLToPath(new URL("../../../core/tests/fixtures/m3/lookup.sv", import.meta.url));

for (const perInstance of [false, true]) {
  test(`A path resolution retains real SDK search and explicit identity (${perInstance ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const transport = createProcessTransport({
        command: resolve(command),
        args: ["serve", file, "--top", "alpha", "--top", "beta", ...(perInstance ? ["--per-instance-bodies"] : [])],
      });
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => {
        client.dispose();
        assert.deepEqual(await transport.exited, { code: 0, signal: null });
      });
      await client.ready;
      const roots = (await client.roots()).result;
      const expected = [];
      for (const root of roots) {
        const children = (await client.children(root.ref)).result.items;
        expected.push(...children.filter((child) => child.name === "u_extra").map((child) => child.ref));
      }
      assert.equal(expected.length, 2);
      assert.deepEqual((await client.resolvePath("u_extra")).result, expected);
      const array = await client.resolvePath("alpha.u[3]");
      const escaped = await client.resolvePath("alpha.\\u[3] ");
      assert.equal(array.result.length, 1);
      assert.equal(escaped.result.length, 1);
      assert.notDeepEqual(array.result, escaped.result);
      assert.deepEqual((await client.resolvePath(" / alpha / u[+003] ")).result, array.result);
      assert.equal((await client.resolvePath("alpha.\\a.b ")).result.length, 1);
      assert.deepEqual((await client.resolvePath("alpha.a.b")).result, []);
      assert.equal((await client.resolvePath("alpha.g[-1].child")).result.length, 1);
      assert.deepEqual((await client.resolvePath("/u_extra")).result, []);
      assert.deepEqual((await client.resolvePath("alpha.g[-1]")).result, []);
      let cursor;
      let hits = 0;
      do {
        const page = await client.search({ text: "", kinds: ["instance", "port", "signal"] },
          { limit: 17, ...(cursor === undefined ? {} : { cursor }) });
        for (const hit of page.result.items) {
          const reply = await client.resolvePath(hit.pathText);
          assert.equal(reply.completeness.status, "complete");
          assert.ok(reply.result.includes(hit.ref));
          ++hits;
        }
        cursor = page.result.next;
      } while (cursor !== undefined);
      assert.ok(hits > 50);
      for (const text of ["alpha..a", "alpha.a[2147483648]", "alpha.\\a.b", ""]) {
        await assert.rejects(client.resolvePath(text),
          (error) => error.code === "bad_request" && error.origin === "core");
      }
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(client.resolvePath("alpha.u[3]", controller.signal),
        (error) => error.code === "cancelled");
      const retained = (await client.resolvePath("alpha.u[3]")).result;
      assert.deepEqual(retained, array.result);
      client.dispose();
      assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.deepEqual(retained, array.result);
    });
}
