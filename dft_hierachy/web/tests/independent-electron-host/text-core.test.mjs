// Original B HDL fixture, actual private text -> cloned string -> actual decoder/SDK/Core.
import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
test(
  "B71 private text actual Core roots/children and normal owned process exit",
  { timeout: 15000 },
  async () => {
    const p = process.env.HIER_B_PRODUCT_ROOT;
    assert(p);
    assert(process.env.HIER_BIN);
    const { createProcessTextTransport } = await import(
      pathToFileURL(p + "/web/packages/client/dist/node/process-transport.js")
    );
    const { decodeWireFrame } = await import(
      pathToFileURL(p + "/web/packages/client/dist/wire-frame.js")
    );
    const { HierClient } = await import(publicEntry(p, "@hier/client"));
    const raw = createProcessTextTransport({
        command: process.env.HIER_BIN,
        args: [
          "serve",
          "--top",
          "B_id_boundary",
          path.join(p, "core/tests/fixtures/m4/id_boundary.sv"),
        ],
      }),
      texts = [];
    raw.exited.catch(() => {});
    const client = new HierClient({
      send: (v) => raw.send(JSON.stringify(v)),
      onMessage: (fn) =>
        raw.onMessage((json) => {
          texts.push(json);
          fn(decodeWireFrame(structuredClone(json)));
        }),
      onClose: (fn) => raw.onClose(fn),
      close: () => raw.close(),
    });
    client.ready.catch(() => {});
    try {
      const s = await client.ready;
      assert.deepEqual(
        s.tops.map((t) => t.name),
        ["B_id_boundary"],
      );
      const roots = await client.roots();
      assert.equal(roots.completeness.status, "complete");
      assert.equal(roots.result[0].ref, s.tops[0].ref);
      const children = await client.children(s.tops[0].ref);
      assert.equal(children.completeness.status, "complete");
      assert(Array.isArray(children.result.items));
      assert(texts.every((t) => typeof t === "string"));
    } finally {
      client.dispose();
      assert.deepEqual(await raw.exited, { code: 0, signal: null });
    }
  },
);
