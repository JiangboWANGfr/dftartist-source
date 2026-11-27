import { validateDefinition } from "@hier/protocol-types";
import assert from "node:assert/strict";
import { test } from "node:test";
import { FrameInbox } from "../../packages/client/dist/node/frame-inbox.js";
import { NdjsonReader, StderrTail } from "../../packages/client/dist/node/ndjson.js";
import { createProcessTransport } from "@hier/client/node";

const tick = () => new Promise(queueMicrotask);

test("A: production reader accepts every two-way byte split including UTF8 and CRLF", () => {
  const bytes = Buffer.from('{"text":"位𝒟é","nested":{"key":1}}\r\n{"end":true}\n');
  for (let split = 0; split <= bytes.length; split++) {
    const reader = new NdjsonReader(),
      actual = [];
    for (const part of [bytes.subarray(0, split), bytes.subarray(split)])
      reader.feed(
        part,
        (frame, size) => {
          actual.push([frame, size]);
          return true;
        },
        () => true,
      );
    reader.finish();
    assert.deepEqual(
      actual.map(([frame]) => frame),
      [{ text: "位𝒟é", nested: { key: 1 } }, { end: true }],
    );
    assert.deepEqual(
      actual.map(([, size]) => size),
      [Buffer.byteLength('{"text":"位𝒟é","nested":{"key":1}}'), 12],
    );
  }
});

test("A: production decoder rejects duplicate escaped keys, invalid bytes, BOM, empty and truncated frames", () => {
  for (const bytes of [
    Buffer.from('{"key":1,"k\\u0065y":2}\n'),
    Buffer.from('{"a":{"x":1,"x":2}}\n'),
    Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125, 10]),
    Buffer.from("\ufeff{}\n"),
    Buffer.from("\n"),
    Buffer.from("[]\n"),
    Buffer.from("{}"),
  ]) {
    const reader = new NdjsonReader();
    assert.throws(() => {
      reader.feed(
        bytes,
        () => true,
        () => true,
      );
      reader.finish();
    });
  }
  const reader = new NdjsonReader();
  assert.doesNotThrow(() =>
    reader.feed(
      Buffer.from('{"a":{"x":1},"b":{"x":2},"str":"{\\\"x\\\":0}"}\n'),
      () => true,
      () => true,
    ),
  );
});

test("A: 256 queued frames allowed; frame 257 closes once and clears delivery", async () => {
  let overflow = 0;
  const inbox = new FrameInbox(() => overflow++),
    received = [];
  for (let i = 0; i < 256; i++) assert.equal(inbox.push({ i }, 2), true);
  assert.equal(overflow, 0);
  assert.equal(inbox.push({}, 2), false);
  assert.equal(inbox.push({}, 2), false);
  inbox.bind((frame) => received.push(frame));
  await tick();
  assert.equal(overflow, 1);
  assert.deepEqual(received, []);
});

test("A: exact 4 MiB includes incomplete UTF8 JSON bytes; CRLF delimiters excluded", async () => {
  const limit = 4 * 1024 * 1024;
  const prefix = Buffer.from('{"text":"'),
    suffix = Buffer.from('"}');
  const text = Buffer.concat([
    prefix,
    Buffer.alloc(limit - prefix.length - suffix.length, 120),
    suffix,
  ]);
  let overflow = 0;
  const inbox = new FrameInbox(() => overflow++),
    reader = new NdjsonReader();
  const feed = (bytes) =>
    reader.feed(
      bytes,
      (frame, size) => inbox.push(frame, size),
      () => inbox.checkPartial(reader.pendingBytes),
    );
  feed(text);
  assert.equal(overflow, 0);
  feed(Buffer.from("\r"));
  assert.equal(overflow, 0);
  feed(Buffer.from("\n"));
  assert.equal(overflow, 0);
  feed(Buffer.from(" "));
  assert.equal(overflow, 1);
  let delivered = 0;
  inbox.bind(() => delivered++);
  await tick();
  assert.equal(delivered, 0);
});

test("A: binding stays asynchronous, preserves order, and removes local bound after delivery starts", async () => {
  const inbox = new FrameInbox(() => assert.fail("Unexpected prebind overflow")),
    values = [];
  inbox.push({ id: 1 }, 10);
  const off = inbox.bind((v) => values.push(v));
  inbox.push({ id: 2 }, 10);
  assert.deepEqual(values, []);
  await tick();
  assert.deepEqual(values, [{ id: 1 }, { id: 2 }]);
  assert.equal(inbox.push({ large: true }, 8 * 1024 * 1024), true);
  await tick();
  assert.equal(values.length, 3);
  off();
  off();
  assert.throws(() => inbox.bind(() => {}), { code: "bad_request" });
});

test("A: queued initial delivery loses to close and unsubscribe", async () => {
  for (const close of [true, false]) {
    const inbox = new FrameInbox(() => assert.fail()),
      values = [];
    inbox.push({}, 2);
    const off = inbox.bind((v) => values.push(v));
    if (close) inbox.close();
    else off();
    await tick();
    assert.deepEqual(values, []);
  }
});

test("A: stderr retains exactly the last 64 KiB raw bytes across chunks", () => {
  const chunks = [Buffer.alloc(30000, 97), Buffer.alloc(80000, 98), Buffer.from("位TAIL")];
  const tail = new StderrTail();
  for (const chunk of chunks) tail.append(chunk);
  const expected = Buffer.concat(chunks).subarray(-65536);
  assert.equal(tail.byteLength, 65536);
  assert.equal(tail.text(), expected.toString("utf8"));
});

test(
  "A: real child stderr context is bounded and owned process is reaped",
  { timeout: 5000 },
  async () => {
    // Explicit write callback orders stderr before stdout EOF. This is a transport
    // producer, never a simulated Core response.
    const source =
      'process.stderr.write("x".repeat(131072)+"TAIL",()=>{process.exitCode=7;process.stdout.end();process.stdin.resume();});';
    const transport = createProcessTransport({
      command: process.execPath,
      args: ["-e", source],
      shutdownGraceMillis: 0,
    });
    const cause = await new Promise((done) => transport.onClose(done));
    assert.equal(cause.code, "transport_closed");
    assert.equal(Buffer.byteLength(cause.data.stderr), 65536);
    assert.ok(cause.data.stderr.endsWith("TAIL"));
    assert.deepEqual(await transport.exited, { code: 7, signal: null });
  },
);

test("A C63: empty first flush keeps both limits until a receiver is actually called", async () => {
  for (const mode of ["frames", "bytes", "unsubscribed"]) {
    let overflow = 0;
    const inbox = new FrameInbox(() => overflow++),
      received = [];
    const off = inbox.bind((value) => received.push(value));
    await tick();
    if (mode === "frames") {
      for (let i = 0; i < 256; i++) assert.equal(inbox.push({ i }, 2), true);
      assert.equal(inbox.push({}, 2), false);
    } else {
      if (mode === "unsubscribed") off();
      assert.equal(inbox.checkPartial(4 * 1024 * 1024), true);
      assert.equal(inbox.checkPartial(4 * 1024 * 1024 + 1), false);
    }
    await tick();
    assert.equal(overflow, 1);
    assert.deepEqual(received, []);
  }
});
test(
  "A C63: real first delivery is bounded while a later large frame remains legal",
  { timeout: 10000 },
  async () => {
    for (const deliveredFirst of [false, true]) {
      const producer = `
      const {createInterface}=require('node:readline');
      if (${deliveredFirst}) process.stdout.write('{"ready":true}\\n');
      createInterface({input:process.stdin}).once('line',()=>
        process.stdout.write(JSON.stringify({text:'x'.repeat(4*1024*1024+1)})+'\\n'));
    `;
      const transport = createProcessTransport({
        command: process.execPath,
        args: ["-e", producer],
      });
      try {
        let complete;
        const result = new Promise((resolve) => {
          complete = resolve;
        });
        transport.onClose((cause) => complete({ cause }));
        transport.onMessage((frame) => {
          if (frame.ready) transport.send({ go: true });
          else complete({ frame });
        });
        await tick(); // Empty flush in the first case, before any child output is triggered.
        if (!deliveredFirst) transport.send({ go: true });
        const observed = await result;
        if (deliveredFirst) assert.equal(observed.frame.text.length, 4 * 1024 * 1024 + 1);
        else assert.equal(observed.cause.data.reason, "prebind_buffer_overflow");
      } finally {
        transport.close();
        assert.deepEqual(await transport.exited, { code: 0, signal: null });
      }
    }
  },
);

test("A C64: raw numeric IDs retain mathematical integrality before Number rounding", () => {
  const cases = [
    ["1", true],
    ["1.0", true],
    ["1e0", true],
    ["10e-1", true],
    ["0.1e1", true],
    ["9007199254740991.0000", true],
    ["90071992547409910e-1", true],
    ["0", false],
    ["-0", false],
    ["-1", false],
    ["1e-400", false],
    ["9007199254740992", false],
    ["1e309", false],
    ["1.0000000000000001", false],
    ["0.99999999999999999", false],
    ["1.99999999999999999", false],
    ["9007199254740991.1", false],
    ["9007199254740990.5", false],
    ["90071992547409910.000000000000001e-1", false],
  ];
  for (const [token, expected] of cases) {
    let accepted = false;
    try {
      new NdjsonReader().feed(
        Buffer.from(
          `{"id":${token},"ok":true,"result":[],"completeness":{"status":"complete","reasons":[]}}\n`,
        ),
        (frame) => {
          accepted = validateDefinition("Success", frame);
          return true;
        },
        () => true,
      );
    } catch (error) {
      assert.ok(error instanceof SyntaxError);
    }
    assert.equal(accepted, expected, token);
  }
});
