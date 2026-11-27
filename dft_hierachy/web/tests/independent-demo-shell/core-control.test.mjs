// Fixture/real SDK/Core prerequisites only, NOT the demo UI or private IPC.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
import { fixtures, top } from "./fixtures.mjs";
for (const kind of ["source", "filelist"])
  test(
    "B73 input control: actual Core " + kind + " roots, two occurrences, normal owned exit",
    { timeout: 15000 },
    async () => {
      const p = process.env.HIER_B_PRODUCT_ROOT;
      assert(p);
      assert(process.env.HIER_BIN);
      const { createProcessTransport } = await import(publicEntry(p, "@hier/client/node")),
        { HierClient } = await import(publicEntry(p, "@hier/client"));
      const f = fixtures(),
        transport = createProcessTransport({
          command: process.env.HIER_BIN,
          args: ["serve", "--top", top, ...(kind === "filelist" ? ["-F"] : []), f[kind]],
          cwd: path.dirname(f[kind]),
        });
      transport.exited.catch(() => {});
      const client = new HierClient(transport);
      client.ready.catch(() => {});
      try {
        const s = await client.ready;
        assert.deepEqual(
          s.tops.map((t) => t.name),
          [top],
        );
        const roots = await client.roots();
        assert.equal(roots.completeness.status, "complete");
        assert.equal(roots.result.length, 1);
        const children = await client.children(roots.result[0].ref);
        assert.equal(children.completeness.status, "complete");
        assert.deepEqual(
          children.result.items.map((i) => i.name),
          ["u0", "u1"],
        );
        assert.equal(children.result.items[0].def, children.result.items[1].def);
      } finally {
        client.dispose();
        assert.deepEqual(await transport.exited, { code: 0, signal: null });
      }
    },
  );
