import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout's actual Core");
const hash = (text) => createHash("sha256").update(text).digest("hex");
for (const per of [false, true]) {
  test(`A source grouping retains complete macro and include occurrences (${per ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const dir = await mkdtemp(join(tmpdir(), "hier-a-source-groups-sdk-"));
      const file = join(dir, "top.sv");
      const include = join(dir, "00-decls.svh");
      const original = '`include "00-decls.svh"\nmodule top;\n  `A_GROUP_DECLS\n  wire ordinary0, ordinary1;\n  leaf u[0:2]();\nendmodule\n';
      const declarations = Array.from({ length: 24 }, (_, i) => `wire w${i};`).join(" ");
      await writeFile(include, `\`define A_GROUP_DECLS ${declarations}\nmodule leaf; wire q; endmodule\n`);
      await writeFile(file, original);
      const transport = createProcessTransport({ command: resolve(command), args: ["serve", file,
        "--top", "top", "-I", dir, ...(per ? ["--per-instance-bodies"] : [])] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => {
        try { client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); }
        finally { await rm(dir, { recursive: true, force: true }); }
      });
      const snapshot = await client.ready;
      const root = (await client.roots()).result[0];
      const signals = (await client.signals(root.ref)).result.items.filter((item) => /^w\d+$/.test(item.name));
      assert.deepEqual(signals.map((item) => item.name), Array.from({ length: 24 }, (_, i) => `w${i}`));
      const macro = (await client.source(signals[0].ref, "definition")).result;
      assert.equal(macro.start.offset, original.indexOf("`A_GROUP_DECLS"));
      assert.equal(macro.end.offset, macro.start.offset + "`A_GROUP_DECLS".length);
      assert.equal(macro.contentHash, hash(original));
      for (const signal of signals) assert.deepEqual((await client.source(signal.ref, "definition")).result, macro);
      async function collect(span) {
        const hits = []; let cursor; let pages = 0;
        do {
          const limit = [1, 7, 3][pages++ % 3];
          const reply = await client.resolveSource({ file: span.file, line: span.start.line, col: span.start.column },
            { limit, ...(cursor ? { cursor } : {}) });
          assert.equal(reply.completeness.status, "complete"); assert.ok(reply.result.items.length <= limit);
          hits.push(...reply.result.items); const next = reply.result.next;
          if (next) assert.notEqual(next, cursor); cursor = next; assert.ok(pages < 50);
        } while (cursor);
        assert.equal(new Set(hits.map((hit) => JSON.stringify([hit.ref, hit.kind, hit.span]))).size, hits.length);
        return hits;
      }
      const hits = await collect(macro);
      assert.deepEqual(hits.map((hit) => hit.ref), [root.def, root.ref, ...signals.map((signal) => signal.ref)]);
      assert.ok(hits.every((hit) => hit.kind === "definition"));
      assert.equal(hits[0].refKind, "definition");
      assert.ok(hits.slice(1).every((hit) => hit.refKind === "object" && hit.inst === root.ref));
      assert.ok(hits.slice(2).every((hit) => JSON.stringify(hit.span) === JSON.stringify(macro)));
      const children = (await client.children(root.ref)).result.items;
      assert.equal(children.length, 3);
      const leaf = (await client.source(children[0].ref, "definition")).result;
      assert.equal(leaf.path, await realpath(include));
      assert.deepEqual((await collect(leaf)).map((hit) => hit.ref), [children[0].def, ...children.map((item) => item.ref)]);
      const instantiation = (await client.source(children[0].ref, "instantiation")).result;
      const instanceHits = await collect(instantiation);
      assert.deepEqual(instanceHits.filter((hit) => hit.kind === "instantiation").map((hit) => hit.ref), children.map((item) => item.ref));
      const first = await client.resolveSource({ file: macro.file, line: macro.start.line, col: macro.start.column }, { limit: 1 });
      assert.ok(first.result.next);
      await assert.rejects(client.resolveSource({ file: leaf.file, line: macro.start.line, col: macro.start.column },
        { cursor: first.result.next, limit: 3 }), (error) => error.code === "bad_request" && error.origin === "core");
      const stopped = new AbortController(); stopped.abort();
      await assert.rejects(client.resolveSource({ file: macro.file, line: macro.start.line, col: macro.start.column },
        { cursor: first.result.next, limit: 3 }, stopped.signal), (error) => error.code === "cancelled");
      await writeFile(file, "// changed\n" + original);
      assert.deepEqual(await collect(macro), hits);
      assert.deepEqual((await client.source(signals[0].ref, "definition")).result, macro);
      assert.deepEqual((await client.checkInputs()).result, { changed: [macro.file], complete: true });
      await writeFile(file, original);
      assert.equal(client.snapshot, snapshot);
      client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.equal(hits[2].span.contentHash, hash(original));
    });
}
