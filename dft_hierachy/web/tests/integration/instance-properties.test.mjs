import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout's actual Core");
const file = fileURLToPath(new URL("../../../core/tests/fixtures/a_m7/instance-properties/wide.sv", import.meta.url));
for (const perInstance of [false, true]) {
  test(`A instance properties preserve SDK override and object declarations (${perInstance ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const transport = createProcessTransport({ command: resolve(command),
        args: ["serve", file, "--top", "property_wide_top", ...(perInstance ? ["--per-instance-bodies"] : [])] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => { client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); });
      await client.ready;
      const roots = (await client.roots()).result;
      const children = (await client.children(roots[0].ref)).result.items;
      assert.equal(children.length, 3);
      const explicit = children.find((item) => item.name === "explicit_same");
      const implicit = children.find((item) => item.name === "implicit_default");
      const ghost = children.find((item) => item.name === "ghost");
      const overridden = (await client.params(explicit.ref)).result;
      const defaults = (await client.params(implicit.ref)).result;
      assert.equal(overridden.length, 16);
      assert.deepEqual(overridden.map((item) => item.name), Array.from({ length: 16 }, (_, i) => `P${i}`));
      assert.ok(overridden.every((item) => item.isOverridden));
      assert.ok(defaults.every((item) => !item.isOverridden));
      assert.deepEqual(overridden.map((item) => item.value), defaults.map((item) => item.value));
      for (const child of [explicit, implicit, ghost]) {
        const ports = (await client.ports(child.ref)).result;
        assert.equal(ports.length, child === ghost ? 2 : 12);
        for (const port of ports) {
          const object = (await client.object(port.ref)).result;
          assert.equal(object.ref, port.ref);
          assert.equal(object.kind, "port");
          assert.equal(object.name, port.name);
          assert.equal(object.inst, child.ref);
          assert.ok(object.pathText.startsWith(child.pathText));
        }
        await assert.rejects(client.object(`p:${child.ref.slice(2)}:9999`),
          (error) => error.code === "not_found" && error.origin === "core");
      }
      assert.deepEqual((await client.params(ghost.ref)).result, []);
      const alias = "p:00.00:0001";
      const object = (await client.object(alias)).result;
      assert.equal(object.ref, alias);
      assert.equal(object.inst, explicit.ref);
      assert.equal(object.name, "p1");
      const stopped = new AbortController(); stopped.abort();
      await assert.rejects(client.object(alias, stopped.signal), (error) => error.code === "cancelled");
      await assert.rejects(client.params(explicit.ref, stopped.signal), (error) => error.code === "cancelled");
      assert.equal((await client.object(alias)).result.name, "p1");
      const retained = (await client.params(explicit.ref)).result;
      client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.equal(retained.length, 16); assert.ok(retained.every((item) => item.isOverridden));
      assert.equal(object.name, "p1");
    });
}
