// B private functional controls, C approved 2026-10-13 REVIEW_LOG.
// Existing immutable d.ts only; actual production classes, no private-state access.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FrameInbox } from "../../packages/client/dist/node/frame-inbox.js";
import {
  NdjsonReader,
  StderrTail,
} from "../../packages/client/dist/node/ndjson.js";
const cap = 4 * 1024 * 1024,
  tailCap = 64 * 1024;
const tick = () => new Promise((resolve) => queueMicrotask(resolve));
function packet(bytes, multibyte = false) {
  const marker = multibyte ? "位😀é" : "";
  const base = { future: marker };
  const overhead = Buffer.byteLength(JSON.stringify(base));
  assert.ok(bytes >= overhead);
  base.future += "a".repeat(bytes - overhead);
  const raw = Buffer.from(JSON.stringify(base));
  assert.equal(raw.length, bytes);
  return { value: base, raw };
}
function owner() {
  const seen = [];
  let overflows = 0,
    closed = false,
    fault;
  const reader = new NdjsonReader();
  const box = new FrameInbox(() => {
    overflows++;
    close();
  });
  function close() {
    closed = true;
    box.close();
    reader.clear();
  }
  return {
    box,
    reader,
    seen,
    get overflows() {
      return overflows;
    },
    get closed() {
      return closed;
    },
    get fault() {
      return fault;
    },
    push(p) {
      return box.push(p.value, p.raw.length);
    },
    bind() {
      return box.bind((value) => seen.push(value));
    },
    feed(raw) {
      try {
        reader.feed(
          raw,
          (value, n) => box.push(value, n),
          () => box.checkPartial(reader.pendingBytes),
        );
      } catch (error) {
        fault = error;
        close();
      }
    },
    close,
  };
}
for (const multibyte of [false, true])
  for (const extra of [0, 1])
    test(
      "B inbox unbound exact 4MiB " +
        (multibyte ? "UTF8" : "ASCII") +
        " +" +
        extra,
      async () => {
        const o = owner(),
          p = packet(cap + extra, multibyte);
        assert.equal(o.push(p), extra === 0);
        const off = o.bind();
        await tick();
        assert.equal(o.overflows, extra);
        assert.equal(o.seen.length, extra === 0 ? 1 : 0);
        if (extra === 0) assert.deepEqual(o.seen[0], p.value);
        else {
          assert.equal(o.closed, true);
          assert.equal(o.push(packet(32)), false);
          assert.equal(o.overflows, 1);
        }
        off();
        o.close();
      },
    );
for (const extra of [0, 1])
  test(
    "B inbox 256 complete frames +" + extra + " no drop/reorder",
    async () => {
      const o = owner();
      for (let i = 0; i < 256 + extra; i++) {
        const value = { sequence: i },
          raw = Buffer.from(JSON.stringify(value));
        assert.equal(o.push({ value, raw }), i < 256);
      }
      const off = o.bind();
      await tick();
      assert.equal(o.overflows, extra);
      assert.deepEqual(
        o.seen,
        extra === 0
          ? Array.from({ length: 256 }, (_, sequence) => ({ sequence }))
          : [],
      );
      off();
      o.close();
    },
  );
test("B inbox complete frames plus unfinished content share actual byte cap", () => {
  const o = owner(),
    partial = Buffer.from('{"x":"aaaaa'),
    p = packet(cap - partial.length, true);
  assert.equal(o.push(p), true);
  assert.equal(o.box.checkPartial(partial.length), true);
  assert.equal(
    o.box.checkPartial(Buffer.concat([partial, Buffer.from("a")]).length),
    false,
  );
  assert.equal(o.overflows, 1);
  assert.equal(o.closed, true);
  o.close();
});
test("B inbox 4MiB incomplete content at cap and +1 before binding", () => {
  const o = owner(),
    partial = packet(cap, true).raw;
  assert.equal(o.box.checkPartial(partial.length), true);
  assert.equal(o.overflows, 0);
  assert.equal(
    o.box.checkPartial(Buffer.concat([partial, Buffer.from(" ")]).length),
    false,
  );
  assert.equal(o.overflows, 1);
  assert.equal(o.box.checkPartial(Buffer.from("{").length), false);
  assert.equal(o.overflows, 1);
  o.close();
});
test("B inbox immediate bind plus empty microtask is NOT first actual delivery", async () => {
  const o = owner(),
    off = o.bind();
  await tick();
  await tick();
  assert.equal(o.box.bound, true);
  assert.deepEqual(o.seen, []);
  assert.equal(o.push(packet(cap + 1, true)), false);
  await tick();
  assert.equal(o.overflows, 1);
  assert.deepEqual(o.seen, []);
  off();
  o.close();
});
test("B inbox limit releases only after a real first delivery, large frames remain valid", async () => {
  const o = owner(),
    off = o.bind(),
    first = packet(32);
  assert.equal(o.push(first), true);
  await tick();
  assert.deepEqual(o.seen, [first.value]);
  const large = packet(cap + 1, true);
  assert.equal(o.push(large), true);
  await tick();
  assert.equal(o.overflows, 0);
  assert.deepEqual(o.seen, [first.value, large.value]);
  off();
  o.close();
});
test("B inbox close before queued first delivery wins, no replay", async () => {
  const o = owner();
  assert.equal(o.push(packet(32)), true);
  const off = o.bind();
  o.close();
  await tick();
  assert.deepEqual(o.seen, []);
  assert.equal(o.overflows, 0);
  off();
  off();
  o.close();
});
for (const bound of [false, true])
  for (const crlf of [false, true])
    test(
      "B real reader+inbox exact byte cap split " +
        (crlf ? "CRLF" : "LF") +
        " " +
        (bound ? "bound-empty" : "unbound"),
      async () => {
        const o = owner(),
          p = packet(cap, true);
        let off;
        if (bound) {
          off = o.bind();
          await tick();
        }
        o.feed(p.raw);
        assert.equal(o.overflows, 0);
        assert.equal(o.closed, false);
        if (crlf) {
          o.feed(Buffer.from("\r"));
          assert.equal(o.overflows, 0);
          assert.equal(o.closed, false);
        }
        o.feed(Buffer.from("\n"));
        if (!bound) off = o.bind();
        await tick();
        assert.equal(o.overflows, 0);
        assert.equal(o.closed, false);
        assert.equal(o.fault, undefined);
        assert.deepEqual(o.seen, [p.value]);
        off();
        o.close();
      },
    );
test("B reader+inbox unfinished +1 UTF8 byte is overflow, not a code-point cap", () => {
  const o = owner(),
    p = packet(cap + 1, true);
  o.feed(p.raw.subarray(0, cap));
  assert.equal(o.overflows, 0);
  o.feed(p.raw.subarray(cap));
  assert.equal(o.overflows, 1);
  assert.equal(o.closed, true);
  assert.equal(o.seen.length, 0);
  o.close();
});
test("B reader+inbox counts original JSON whitespace, not reserialized shorter object", async () => {
  const o = owner(),
    p = packet(cap - 1);
  o.feed(Buffer.concat([p.raw, Buffer.from(" \n")]));
  const off = o.bind();
  await tick();
  assert.equal(o.overflows, 0);
  assert.deepEqual(o.seen, [p.value]);
  off();
  o.close();
  const bad = owner();
  bad.feed(Buffer.concat([p.raw, Buffer.from("  \n")]));
  assert.equal(bad.overflows, 1);
  assert.equal(bad.closed, true);
  bad.close();
});
test("B real NdjsonReader every UTF8/CRLF byte split and byte counts", () => {
  const lines = [
    Buffer.from('{"value":"位😀é"}'),
    Buffer.from('{"sequence":2}'),
  ];
  const wire = Buffer.concat([
    lines[0],
    Buffer.from("\r\n"),
    lines[1],
    Buffer.from("\n"),
  ]);
  for (let split = 0; split <= wire.length; split++) {
    const r = new NdjsonReader(),
      seen = [];
    const emit = (value, n) => {
      seen.push({ value, n });
      return true;
    };
    r.feed(wire.subarray(0, split), emit, () => true);
    r.feed(wire.subarray(split), emit, () => true);
    assert.deepEqual(seen, [
      { value: { value: "位😀é" }, n: lines[0].length },
      { value: { sequence: 2 }, n: lines[1].length },
    ]);
    assert.equal(r.pendingBytes, 0);
    assert.doesNotThrow(() => r.finish());
    r.clear();
  }
});
test("B real NdjsonReader empty feed is not EOF, clear removes pending, clean finish", () => {
  const r = new NdjsonReader(),
    emit = () => true;
  r.feed(Buffer.from('{"x":'), emit, () => true);
  const n = r.pendingBytes;
  assert.equal(n, 5);
  r.feed(Buffer.alloc(0), emit, () => true);
  assert.equal(r.pendingBytes, n);
  r.clear();
  assert.equal(r.pendingBytes, 0);
  assert.doesNotThrow(() => r.finish());
});
test("B real NdjsonReader non-LF EOF fragment is a fault", () => {
  const r = new NdjsonReader();
  r.feed(
    Buffer.from('{"x":1}'),
    () => true,
    () => true,
  );
  assert.throws(() => r.finish());
  r.clear();
  assert.equal(r.pendingBytes, 0);
});
for (const bytes of [0, 1, tailCap - 1, tailCap, tailCap + 1])
  test("B real StderrTail ASCII exact " + bytes + " bytes", () => {
    const t = new StderrTail(),
      raw = Buffer.from("x".repeat(bytes));
    t.append(raw);
    assert.equal(t.byteLength, Math.min(bytes, tailCap));
    assert.equal(t.text(), "x".repeat(Math.min(bytes, tailCap)));
  });
test("B real StderrTail keeps latest 64KiB, not first bytes or whole history", () => {
  const t = new StderrTail();
  for (const raw of [
    Buffer.from("discard".repeat(10000)),
    Buffer.from("a".repeat(tailCap - 4)),
    Buffer.from("TAIL"),
  ])
    t.append(raw);
  assert.equal(t.byteLength, tailCap);
  assert.equal(t.text(), "a".repeat(tailCap - 4) + "TAIL");
});
test("B real StderrTail counts UTF8 bytes and joins split code points", () => {
  const t = new StderrTail(),
    raw = Buffer.from("é".repeat(tailCap / 2));
  t.append(raw.subarray(0, 1));
  t.append(raw.subarray(1));
  assert.equal(t.byteLength, tailCap);
  assert.equal(t.text(), "é".repeat(tailCap / 2));
  t.append(Buffer.from("TAIL"));
  assert.equal(t.byteLength, tailCap);
  assert.equal(t.text(), "é".repeat(tailCap / 2 - 2) + "TAIL");
});
