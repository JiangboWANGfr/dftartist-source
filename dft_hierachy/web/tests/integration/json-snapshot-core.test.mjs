import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// A actual SDK/Node/Core ownership regression. The original modules use these
// same assertions; no handcrafted Core replies or altered wire rules are used.
const clientRoot = process.env.HIER_A_CLIENT_ROOT;
const { HierClient } = await import(clientRoot
  ? pathToFileURL(join(clientRoot, "index.js")) : "@hier/client");
const { createProcessTransport } = await import(clientRoot
  ? pathToFileURL(join(clientRoot, "node/index.js")) : "@hier/client/node");
function frozen(value) {
  if (value && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) frozen(child);
  }
}
for (const pageSize of [1, 17]) {
  test(`A M7 JSON snapshot: actual Core pages and transport-owned values stay independent (pageSize=${pageSize})`,
    { timeout: 20000 }, async (t) => {
      assert.ok(process.env.HIER_BIN, "HIER_BIN must name this checkout's actual Core");
      const directory = await mkdtemp(join(tmpdir(), "hier-a-json-core-")), file = join(directory, "snapshot.sv");
      await writeFile(file, `module copy_leaf(input wire [3:0] a, output wire [3:0] y); assign y=a; endmodule
module snapshot_top(input wire [3:0] a, output wire [3:0] y); copy_leaf u[0:63](a,y); endmodule\n`);
      const transport = createProcessTransport({ command: resolve(process.env.HIER_BIN), args: ["serve", file, "--top", "snapshot_top"] });
      let mutatedFrames = 0; const originals = [];
      const boundary = {
        send: (frame) => transport.send(frame), close: () => transport.close(),
        onClose: (handler) => transport.onClose(handler),
        onMessage: (handler) => transport.onMessage((frame) => {
          originals.push(frame); handler(frame);
          // Mutation belongs only to this A observer's delivered frame, after
          // SDK processing. It must not change the SDK's owned frozen Reply.
          if (frame?.ok === true && frame.result?.items?.length) {
            assert.equal(Object.isFrozen(frame.result.items[0]), false);
            frame.result.items[0].name = "A transport-owned mutation"; mutatedFrames++;
          }
        }),
      };
      const client = new HierClient(boundary, { cacheEntries: 0 });
      t.after(async () => { client.dispose();
        assert.deepEqual(await transport.exited, { code: 0, signal: null });
        await rm(directory, { recursive: true }); });
      const snapshot = await client.ready; frozen(snapshot);
      const roots = await client.roots(); frozen(roots);
      assert.equal(roots.result.length, 1); const top = roots.result[0];
      assert.equal(top.name, "snapshot_top"); assert.equal(top.childCount, 64);
      const pages = [], children = []; let cursor;
      do {
        const options = { limit: pageSize, ...(cursor === undefined ? {} : { cursor }) };
        const pending = client.children(top.ref, options);
        options.limit = 0; // Input was captured synchronously at the SDK boundary.
        const reply = await pending; frozen(reply); pages.push(reply);
        assert.equal(reply.completeness.status, "complete"); children.push(...reply.result.items);
        cursor = reply.result.next;
      } while (cursor !== undefined);
      assert.equal(pages.length, Math.ceil(64 / pageSize)); assert.equal(mutatedFrames, pages.length);
      assert.deepEqual(children.map((child) => child.name), Array.from({ length: 64 }, (_, i) => `u[${i}]`));
      assert.ok(children.every((child, i) => child.defName === "copy_leaf" && child.childCount === 0 &&
        child.path.length === 2 && child.path[0] === "snapshot_top" && child.path[1] === `u[${i}]`));
      const retained = JSON.stringify(pages), ports = await client.ports(top.ref); frozen(ports);
      assert.deepEqual(ports.result.map((port) => port.name), ["a", "y"]);
      assert.equal(JSON.stringify(pages), retained);
      assert.ok(originals.every((frame) => !Object.isFrozen(frame)));
      assert.equal(snapshot, client.snapshot);
      assert.equal((await client.roots()).result[0].ref, top.ref);
    });
}
