import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = process.env.HIER_A_CLIENT_MODULE_ROOT;
const { HierClient } = await import(root ? pathToFileURL(join(root, "index.js")) : "@hier/client");
const { createProcessTransport } = await import(root ? pathToFileURL(join(root, "node/index.js")) : "@hier/client/node");
const hash = (text) => createHash('sha256').update(text).digest('hex');

test("A M7 scalar check: actual Core source text crosses Unicode paths, ownership and local rejection", { timeout: 20000 }, async (t) => {
  assert.ok(process.env.HIER_BIN, 'explicit own Core binary required');
  const dir = await mkdtemp(join(tmpdir(), 'hier-a-scalar-core-')), file = join(dir, '源码🙂.sv');
  const text = 'module scalar_top(input a, output y); assign y=a; endmodule\r\n/*'
    + 'native scalar text 中文🙂 e\u0301\r\n'.repeat(9000) + '*/\r\n';
  await writeFile(file, text);
  const transport = createProcessTransport({ command: resolve(process.env.HIER_BIN), args: ['serve', file, '--top', 'scalar_top'] });
  const sent = [], boundary = { send: (value) => { sent.push(value); transport.send(value); }, close: () => transport.close(),
    onMessage: (handler) => transport.onMessage(handler), onClose: (handler) => transport.onClose(handler) };
  const client = new HierClient(boundary, { cacheEntries: 0 });
  t.after(async () => { try { client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); }
    finally { await rm(dir, { recursive: true, force: true }); } });
  const snapshot = await client.ready, top = (await client.roots()).result[0];
  const span = (await client.source(top.def, 'definition')).result;
  const retained = await client.readSource(span.file);
  assert.deepEqual(retained.result, { text, contentHash: hash(text), matchesSnapshot: true });
  assert.equal(Object.isFrozen(retained.result), true);
  const before = sent.length;
  await assert.rejects(client.readSource('bad\ud800.sv'), (error) => error.code === 'bad_request' && error.origin === 'client');
  assert.equal(sent.length, before, 'invalid scalar parameter cannot send a request');
  const changed = text + '\0\ufeff中文🙂\r\n'; await writeFile(file, changed);
  const reply = await client.readSource(span.file);
  assert.deepEqual(reply.result, { text: changed, contentHash: hash(changed), matchesSnapshot: false });
  assert.equal(retained.result.text, text); assert.equal(client.snapshot, snapshot);
  await writeFile(file, text);
  assert.deepEqual((await client.readSource(span.file)).result, retained.result);
  client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null });
  console.log(JSON.stringify({ scalarCore: true, bytes: Buffer.byteLength(text), hash: hash(text), closed: true }));
});
