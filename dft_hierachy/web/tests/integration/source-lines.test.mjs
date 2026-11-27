import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout's actual Core");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const per of [false, true]) {
  test(`A source line maps retain SDK byte coordinates and reverse pages (${per ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const dir = await mkdtemp(join(tmpdir(), "hier-a-source-lines-sdk-"));
      const file = join(dir, "top.sv");
      const original = Buffer.concat([Buffer.from("/*"), Buffer.alloc(65533, 120),
        Buffer.from("\r\né汉😀\rbare\n*/\r\nmodule top(input logic clk,input logic d,output logic q);\r\n/*é汉😀*/ logic alpha;\rlogic beta;\nassign alpha=d;\r\nassign beta=alpha;\ralways_ff @(posedge clk) q<=beta;\nendmodule\r\n")]);
      await writeFile(file, original);
      // Latin-1 maps each byte to one JS unit, so regex indices are byte offsets.
      const starts = [0, ...Array.from(original.toString("latin1").matchAll(/\r\n|\r|\n/g),
        (match) => match.index + match[0].length)];
      const position = (offset) => {
        let line = 0;
        while (line + 1 < starts.length && starts[line + 1] <= offset) ++line;
        return { offset, line: line + 1, column: offset - starts[line] + 1 };
      };
      const transport = createProcessTransport({ command: resolve(command), args: ["serve", file,
        "--top", "top", ...(per ? ["--per-instance-bodies"] : [])] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => {
        try { client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); }
        finally { await rm(dir, { recursive: true, force: true }); }
      });
      const snapshot = await client.ready;
      const root = (await client.roots()).result[0];
      const signals = (await client.signals(root.ref)).result.items;
      assert.ok(signals.some((item) => item.name === "alpha"));
      const refs = [root.ref, root.def, ...signals.map((item) => item.ref)];
      const retained = [];
      for (const ref of refs) {
        const span = (await client.source(ref, "definition")).result;
        retained.push({ ref, span });
        assert.deepEqual(span.start, position(span.start.offset));
        assert.deepEqual(span.end, position(span.end.offset));
        assert.equal(span.contentHash, hash(original));
        const hits = []; let cursor; let pages = 0;
        do {
          const page = await client.resolveSource({ file: span.file, line: span.start.line, col: span.start.column },
            { limit: ++pages % 2 ? 1 : 3, ...(cursor ? { cursor } : {}) });
          assert.equal(page.completeness.status, "complete");
          hits.push(...page.result.items); cursor = page.result.next;
          assert.ok(pages < 50);
        } while (cursor);
        assert.ok(hits.some((hit) => hit.ref === ref && hit.kind === "definition"));
      }
      const span = retained[0].span;
      assert.deepEqual((await client.readSource(span.file)).result,
        { text: original.toString("utf8"), contentHash: hash(original), matchesSnapshot: true });
      assert.deepEqual((await client.resolveSource({ file: span.file, line: starts.length, col: 1 })).result.items, []);
      await assert.rejects(client.resolveSource({ file: span.file, line: starts.length + 1 }),
        (error) => error.code === "bad_request" && error.origin === "core");
      const changed = Buffer.concat([Buffer.from("// changed\n"), original]);
      await writeFile(file, changed);
      for (const item of retained) assert.deepEqual((await client.source(item.ref, "definition")).result, item.span);
      assert.deepEqual((await client.checkInputs()).result, { changed: [span.file], complete: true });
      assert.equal((await client.readSource(span.file)).result.matchesSnapshot, false);
      await writeFile(file, original);
      const stopped = new AbortController(); stopped.abort();
      await assert.rejects(client.source(root.def, "definition", stopped.signal), (error) => error.code === "cancelled");
      assert.deepEqual((await client.source(root.def, "definition")).result, span);
      assert.equal(client.snapshot, snapshot);
      client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.equal(retained[0].span.contentHash, hash(original));
    });
}
