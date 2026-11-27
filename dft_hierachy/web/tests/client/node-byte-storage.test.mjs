import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.HIER_A_CLIENT_MODULE_ROOT;
const url = (name) => root ? pathToFileURL(join(root, name + ".js"))
  : new URL(`../../packages/client/dist/${name}.js`, import.meta.url);
const { NdjsonReader, StderrTail } = await import(url("node/ndjson"));
const { createProcessTransport } = await import(url("node/index"));
const capacity = 64 * 1024;

test("A M7 bytes: offset single-piece frames preserve exact JSON, CRLF bytes and synchronous delivery", () => {
  const reader = new NdjsonReader(), frames = [], pending = [];
  const lines = [' {"text":"位🙂","n":-0} ', '{"id":2}'];
  const storage = Buffer.from('unused' + lines.join('\r\n') + '\nignored');
  reader.feed(storage.subarray(6, -7), (frame, bytes, json) => {
    assert.equal(reader.pendingBytes, 0);
    frames.push({ frame, bytes, json }); return true;
  }, () => { pending.push(reader.pendingBytes); return true; });
  assert.deepEqual(frames.map(x => x.json), lines);
  assert.deepEqual(frames.map(x => x.bytes), lines.map(x => Buffer.byteLength(x)));
  assert.equal(Object.is(frames[0].frame.n, -0), true);
  assert.deepEqual(pending, lines.map(x => Buffer.byteLength(x)));
  reader.finish(); storage.fill(120);
  assert.equal(frames[0].frame.text, "位🙂");
  assert.deepEqual(frames.map(x => x.json), lines);
});

test("A M7 bytes: emit stop leaves following malformed frames unread and clear permits reuse", () => {
  const reader = new NdjsonReader(), frames = [];
  reader.feed(Buffer.from('{"a":1}\ninvalid\n'), frame => {
    frames.push(frame); return false;
  }, () => true);
  reader.finish(); reader.clear();
  reader.feed(Buffer.from('{"b":2}\n'), frame => { frames.push(frame); return true; }, () => true);
  assert.deepEqual(frames, [{ a: 1 }, { b: 2 }]);
});

test("A M7 bytes: partial rejection can clear before invalid decoding and skip emission", () => {
  const reader = new NdjsonReader(); let emitted = 0;
  reader.feed(Buffer.from([255, 10]), () => { emitted++; return true; }, () => {
    assert.equal(reader.pendingBytes, 1); reader.clear(); return false;
  });
  assert.equal(emitted, 0); assert.equal(reader.pendingBytes, 0); reader.finish();
});

test("A M7 bytes: fragmented prefix joins offset suffix and never borrows emitted values", () => {
  const reader = new NdjsonReader(), frames = [];
  const prefix = Buffer.from('{"text":"位'), suffix = Buffer.from('padding🙂"}\r\n{"end":true}\n');
  const emit = (frame, bytes, json) => { frames.push({ frame, bytes, json }); return true; };
  reader.feed(prefix, emit, () => true);
  reader.feed(suffix.subarray(7), emit, () => true);
  prefix.fill(0); suffix.fill(0); reader.finish();
  assert.deepEqual(frames, [
    { frame: { text: "位🙂" }, bytes: Buffer.byteLength('{"text":"位🙂"}'), json: '{"text":"位🙂"}' },
    { frame: { end: true }, bytes: 12, json: '{"end":true}' },
  ]);
});

test("A M7 bytes: stderr tail matches a raw-byte oracle through repeated wrap, replacement and empty appends", () => {
  const tail = new StderrTail(); let expected = Buffer.alloc(0), seed = 13;
  assert.equal(tail.text(), ""); assert.equal(tail.byteLength, 0);
  for (const size of [0, 1, capacity - 2, 1, 1, 0, 7, capacity, 19, capacity + 9,
    ...Array.from({ length: 220 }, (_, i) => (i * 7919) % 12345)]) {
    const chunk = Buffer.alloc(size);
    for (let i = 0; i < size; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; chunk[i] = seed >>> 24; }
    expected = Buffer.concat([expected, chunk]).subarray(-capacity);
    tail.append(chunk); chunk.fill(0);
    assert.equal(tail.byteLength, expected.length);
    assert.equal(tail.text(), expected.toString("utf8"));
    assert.equal(tail.text(), expected.toString("utf8"), "reading must not consume or reorder the tail");
  }
});

test("A M7 bytes: stderr decodes UTF8 once across every physical wrap split", () => {
  const word = Buffer.from("位🙂é");
  for (let split = 1; split < word.length; split++) {
    const tail = new StderrTail(), prefix = Buffer.alloc(capacity - split, 120);
    tail.append(prefix); tail.append(word); tail.append(Buffer.from("END"));
    const expected = Buffer.concat([prefix, word, Buffer.from("END")]).subarray(-capacity);
    assert.equal(tail.text(), expected.toString("utf8"));
    assert.ok(tail.text().endsWith("位🙂éEND"));
  }
});

test("A M7 bytes: stderr truncates by bytes even inside a code point and owns large input views", () => {
  const tail = new StderrTail();
  const backing = Buffer.concat([Buffer.from("padding位🙂"), Buffer.alloc(capacity - 1, 97)]);
  const view = backing.subarray(7), expected = Buffer.from(view.subarray(-capacity));
  tail.append(view); const snapshot = tail.text(); backing.fill(0);
  assert.equal(tail.byteLength, capacity); assert.equal(snapshot, expected.toString("utf8"));
  assert.equal(snapshot.charAt(0), "�"); assert.equal(tail.text(), snapshot);
});

test("A M7 bytes: real Node producer preserves wrapped stderr on invalid-frame shutdown and reaps", { timeout: 8000 }, async () => {
  // Transport producer, not a simulated Core. Order stderr callbacks before invalid stdout.
  const pieces = Array.from({ length: 120 }, (_, i) => Buffer.from(`${i}:位🙂:`.repeat(100)));
  const source = `const pieces=${JSON.stringify(pieces.map(x => x.toString()))};let i=0;function next(){if(i<pieces.length)process.stderr.write(pieces[i++],next);else{process.stdin.resume();process.stdout.write('invalid\\n');}}next();`;
  const transport = createProcessTransport({ command: process.execPath, args: ["-e", source], shutdownGraceMillis: 0 });
  const cause = await new Promise(done => transport.onClose(done));
  assert.equal(cause.code, "transport_closed"); assert.equal(cause.data.reason, "invalid_frame");
  assert.equal(cause.data.stderr, Buffer.concat(pieces).subarray(-capacity).toString("utf8"));
  await transport.exited;
});
