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
  test(`A source hashing retains real SDK snapshot and disk-change behavior (${per ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const dir = await mkdtemp(join(tmpdir(), "hier-a-source-hashing-sdk-"));
      const file = join(dir, "top.sv");
      const original = Buffer.from(`module top(input a, output y); assign y=a; endmodule\n/*${"x".repeat(131073)}*/\n`);
      await writeFile(file, original);
      const transport = createProcessTransport({ command: resolve(command), args: ["serve", file,
        "--top", "top", ...(per ? ["--per-instance-bodies"] : [])] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => {
        try { client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); }
        finally { await rm(dir, { recursive: true, force: true }); }
      });
      const snapshot = await client.ready;
      assert.match(snapshot.inputHash, /^[a-f0-9]{64}$/);
      const root = (await client.roots()).result[0];
      const span = (await client.source(root.def, "definition")).result;
      const clean = (await client.readSource(span.file)).result;
      assert.equal(clean.text, original.toString()); assert.equal(clean.contentHash, hash(original));
      assert.equal(clean.matchesSnapshot, true);
      assert.deepEqual((await client.checkInputs()).result, { changed: [], complete: true });
      const changed = Buffer.concat([original, Buffer.from("// changed é\r\n")]);
      await writeFile(file, changed);
      assert.deepEqual((await client.checkInputs()).result, { changed: [span.file], complete: true });
      const read = (await client.readSource(span.file)).result;
      assert.equal(read.contentHash, hash(changed)); assert.equal(read.text, changed.toString());
      assert.equal(read.matchesSnapshot, false);
      const binary = Buffer.concat([original, Buffer.from([0, 255])]);
      await writeFile(file, binary);
      assert.deepEqual((await client.checkInputs()).result, { changed: [span.file], complete: true });
      await assert.rejects(client.readSource(span.file), (error) => error.code === "unsupported" && error.origin === "core");
      await rm(file);
      assert.deepEqual((await client.checkInputs()).result, { changed: [span.file], complete: false });
      await assert.rejects(client.readSource(span.file), (error) => error.code === "not_found" && error.origin === "core");
      await writeFile(file, original);
      assert.deepEqual((await client.checkInputs()).result, { changed: [], complete: true });
      const stopped = new AbortController(); stopped.abort();
      await assert.rejects(client.checkInputs(stopped.signal), (error) => error.code === "cancelled");
      assert.deepEqual((await client.checkInputs()).result, { changed: [], complete: true });
      assert.equal(client.snapshot, snapshot); assert.equal(clean.contentHash, hash(original));
      assert.deepEqual((await client.source(root.def, "definition")).result, span);
      client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.equal(clean.text, original.toString()); assert.equal(snapshot.inputHash.length, 64);
    });
}
