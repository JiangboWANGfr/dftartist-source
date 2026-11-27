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
  test(`A source UTF-8 retains real SDK text, bytes and error boundaries (${per ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const dir = await mkdtemp(join(tmpdir(), "hier-a-source-utf8-sdk-"));
      const file = join(dir, "top.sv");
      const original = Buffer.from(`module top(input a,output y);assign y=a;endmodule\r\n/*${"x".repeat(4093)}é汉😀*/\r\n`);
      await writeFile(file, original);
      const transport = createProcessTransport({ command: resolve(command), args: ["serve", file,
        "--top", "top", ...(per ? ["--per-instance-bodies"] : [])] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => {
        try { client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); }
        finally { await rm(dir, { recursive: true, force: true }); }
      });
      const snapshot = await client.ready;
      const root = (await client.roots()).result[0];
      const span = (await client.source(root.def, "definition")).result;
      const retained = (await client.readSource(span.file)).result;
      assert.deepEqual(retained, { text: original.toString("utf8"), contentHash: hash(original), matchesSnapshot: true });
      const invalid = [[0xc0, 0x80], [0xe0, 0x80, 0x80], [0xf0, 0x80, 0x80, 0x80],
        [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xf5, 0x80, 0x80, 0x80],
        [0x80], [0xff], [0xc2], [0xe2, 0x82], [0xf0, 0x90, 0x80]];
      for (const prefix of [7, 8, 4095, 4096, 65535, 65536]) {
        const base = Buffer.concat([original, Buffer.alloc(prefix, 97)]);
        const valid = Buffer.concat([base, Buffer.from("\0é汉😀\r\n")]);
        await writeFile(file, valid);
        assert.deepEqual((await client.readSource(span.file)).result,
          { text: valid.toString("utf8"), contentHash: hash(valid), matchesSnapshot: false });
        for (const tail of invalid) {
          const bytes = Buffer.concat([base, Buffer.from(tail)]);
          assert.throws(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes));
          await writeFile(file, bytes);
          await assert.rejects(client.readSource(span.file),
            (error) => error.code === "unsupported" && error.origin === "core");
          assert.deepEqual((await client.checkInputs()).result, { changed: [span.file], complete: true });
        }
      }
      await writeFile(file, original);
      const stopped = new AbortController(); stopped.abort();
      await assert.rejects(client.readSource(span.file, stopped.signal), (error) => error.code === "cancelled");
      assert.deepEqual((await client.readSource(span.file)).result, retained);
      assert.deepEqual((await client.source(root.def, "definition")).result, span);
      assert.equal(client.snapshot, snapshot);
      client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.equal(retained.text, original.toString("utf8"));
    });
}
