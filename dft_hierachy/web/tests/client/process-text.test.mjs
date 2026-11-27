import assert from "node:assert/strict";
import { test } from "node:test";
import * as publicNode from "@hier/client/node";
import { createProcessTextTransport } from "../../packages/client/dist/node/process-transport.js";
import { NdjsonReader } from "../../packages/client/dist/node/ndjson.js";

const bound = { timeout: 5000 };
function child(t, source) {
  const transport = createProcessTextTransport({
    command: process.execPath,
    args: ["-e", source],
  });
  t.after(async () => {
    transport.close();
    await transport.exited;
  });
  return transport;
}

test("A private text reader preserves original tokens through every UTF8/CRLF split", () => {
  const json = ' \t{"text":"位😀","escaped":"\\u0061","future":1.0000000000000001,"n":1e0} ';
  const bytes = Buffer.from(json + "\r\n");
  for (let split = 0; split <= bytes.length; split++) {
    const reader = new NdjsonReader();
    const seen = [];
    for (const chunk of [bytes.subarray(0, split), bytes.subarray(split)])
      reader.feed(
        chunk,
        (frame, size, text) => {
          seen.push({ frame, size, text });
          return true;
        },
        () => true,
      );
    reader.finish();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].text, json);
    assert.equal(seen[0].size, Buffer.byteLength(json));
    assert.deepEqual(seen[0].frame, JSON.parse(json));
    assert.notEqual(seen[0].text, JSON.stringify(seen[0].frame));
  }
});

test(
  "A private text process sends and receives original JSON without reserialization",
  bound,
  async (t) => {
    const initial = ' {"text":"位😀","n":1e0} ';
    const transport = child(
      t,
      `process.stdout.write(${JSON.stringify(initial + "\r\n")}); process.stdin.pipe(process.stdout);`,
    );
    assert.throws(() => transport.send("{}"), { code: "not_ready" });
    const received = [];
    const done = Promise.withResolvers();
    const sent = ' \t{"future":1.0000000000000001,"escaped":"\\u0061"} ';
    const off = transport.onMessage((json) => {
      received.push(json);
      if (received.length === 1) transport.send(sent);
      else done.resolve();
    });
    t.after(off);
    await done.promise;
    assert.deepEqual(received, [initial, sent]);
    off();
    assert.throws(() => transport.onMessage(() => {}), { code: "bad_request" });
    const closed = Promise.withResolvers();
    transport.onClose(closed.resolve);
    transport.close();
    assert.equal(await closed.promise, undefined);
    assert.deepEqual(await transport.exited, { code: 0, signal: null });
  },
);

for (const [name, bytes] of [
  ["duplicate keys", Buffer.from('{"x":1,"\\u0078":2}\n')],
  ["invalid UTF8", Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125, 10])],
  [
    "rounded fractional request ID",
    Buffer.from(
      '{"id":1.0000000000000001,"ok":false,"error":{"code":"bad_request","message":"bad","data":{}}}\n',
    ),
  ],
]) {
  test(`A private text process validates ${name} before any delivery`, bound, async (t) => {
    const transport = child(
      t,
      `process.stdout.write(Buffer.from(${JSON.stringify([...bytes])})); process.stdin.resume();`,
    );
    const seen = [];
    transport.onMessage((json) => seen.push(json));
    const closed = Promise.withResolvers();
    transport.onClose(closed.resolve);
    const error = await closed.promise;
    assert.equal(error.code, "transport_closed");
    assert.equal(error.data.reason, "invalid_frame");
    await transport.exited;
    assert.deepEqual(seen, []);
  });
}

test(
  "A private text process applies the existing unfinished prebind byte limit",
  bound,
  async (t) => {
    const transport = child(
      t,
      "process.stdout.write(Buffer.alloc(4 * 1024 * 1024 + 1, 32)); process.stdin.resume();",
    );
    const closed = Promise.withResolvers();
    transport.onClose(closed.resolve);
    const error = await closed.promise;
    assert.equal(error.data.reason, "prebind_buffer_overflow");
    const seen = [];
    transport.onMessage((json) => seen.push(json));
    await transport.exited;
    assert.deepEqual(seen, []);
  },
);

test(
  "A private text process rejects embedded delimiters before writing and preserves the first failure",
  bound,
  async (t) => {
    const transport = child(
      t,
      'process.stdout.write("{}\\n"); process.stdin.pipe(process.stdout);',
    );
    const ready = Promise.withResolvers();
    const seen = [];
    transport.onMessage((json) => {
      seen.push(json);
      ready.resolve();
    });
    await ready.promise;
    const closed = Promise.withResolvers();
    transport.onClose(closed.resolve);
    let original;
    assert.throws(
      () => transport.send('{\n"x":1}'),
      (error) => {
        original = error;
        return error.code === "transport_closed" && error.data.reason === "stdin_error";
      },
    );
    transport.close();
    assert.equal(await closed.promise, original);
    assert.throws(
      () => transport.send("{}"),
      (error) => error === original,
    );
    await transport.exited;
    assert.deepEqual(seen, ["{}"]);
  },
);

test("A private text factory is absent from the public Node entry", () => {
  assert.deepEqual(Object.keys(publicNode), ["createProcessTransport"]);
});
