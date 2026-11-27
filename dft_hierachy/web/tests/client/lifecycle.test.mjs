import { validateDefinition } from "@hier/protocol-types";
import { NdjsonReader } from "../../packages/client/dist/node/ndjson.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { HierClient, HierError } from "@hier/client";
import { ReplyCache } from "../../packages/client/dist/reply-cache.js";

const snapshot = {
  protocol: 2,
  schemaVersion: 7,
  frontend: { name: "slang", version: "A-fixture" },
  snapshotId: "a",
  inputHash: "0".repeat(64),
  inputHashComplete: true,
  bodySharing: "fast",
  tops: [],
  definitionCount: 0,
  bodyCount: 0,
  indexState: "ready",
  openedAt: "2026-01-01T00:00:00.000Z",
  topCandidates: [],
};
const complete = { status: "complete", reasons: [] };
const tick = () => new Promise(queueMicrotask);

// Explicit test delivery only; never used as a Core E2E substitute.
class TestTransport {
  sent = [];
  message;
  closed = false;
  cause;
  send(value) {
    if (this.cause) throw this.cause;
    this.sent.push(value);
  }
  onMessage(handler) {
    this.message = handler;
    return () => {
      this.message = undefined;
    };
  }
  onClose() {
    return () => {};
  }
  close() {
    this.closed = true;
  }
  deliver(value) {
    queueMicrotask(() => this.message?.(value));
  }
  reply(id, result) {
    this.deliver({ id, ok: true, result, completeness: complete });
  }
}
async function setup(t) {
  const transport = new TestTransport(),
    client = new HierClient(transport);
  t.after(() => client.dispose());
  transport.deliver({
    event: "hello",
    protocol: 2,
    snapshot,
    capabilities: ["cancel", "progress"],
  });
  await client.ready;
  return { client, transport };
}

test("A: pending method validates result even if another method could accept it", async (t) => {
  const { client, transport } = await setup(t),
    pending = client.children("i");
  const rejected = assert.rejects(pending, { code: "protocol_error" });
  transport.reply(transport.sent[0].id, []);
  await rejected;
  assert.equal(transport.closed, true);
});

test("A: unknown valid response id and extension payload do not poison next query", async (t) => {
  const { client, transport } = await setup(t);
  transport.reply(999, []);
  transport.deliver({ event: "future_event", id: -100, error: null, result: { arbitrary: true } });
  const pending = client.roots();
  transport.reply(transport.sent[0].id, []);
  assert.deepEqual(await pending, { result: [], completeness: complete });
});

test("A: invalid progress cross-field relation fails pending work", async (t) => {
  const { client, transport } = await setup(t),
    pending = client.roots();
  const rejected = assert.rejects(pending, { code: "protocol_error" });
  transport.deliver({ event: "progress", target: 1, done: 2, total: 1 });
  await rejected;
});

test("A: send failure rejects all subscribers with stable transport diagnostics", async (t) => {
  const { client, transport } = await setup(t);
  const first = client.roots(),
    rejected = assert.rejects(first, { code: "transport_closed", origin: "transport" });
  transport.cause = new Error("write failed");
  await assert.rejects(client.children("i"), { code: "transport_closed", message: "write failed" });
  await rejected;
  assert.equal(transport.closed, true);
});

test("A: caller mutation cannot alter sent params or the pending key", async (t) => {
  const { client, transport } = await setup(t),
    query = { text: "a", kinds: ["signal"] };
  const first = client.search(query);
  query.kinds.push("instance");
  query.text = "b";
  const second = client.search({ kinds: ["signal"], text: "a" });
  assert.equal(transport.sent.length, 1);
  assert.deepEqual(transport.sent[0].params.kinds, ["signal"]);
  transport.reply(transport.sent[0].id, { items: [] });
  await Promise.all([first, second]);
});

test("A: null/NaN/cycles fail locally, and snapshot-time abort cannot leave pending work", async (t) => {
  const { client, transport } = await setup(t);
  for (const limit of [null, NaN, Infinity, -1, 0, 1.1])
    await assert.rejects(client.children("i", { limit }), { code: "bad_request" });
  const request = { slice: { ref: "s" } };
  request.extension = request;
  await assert.rejects(client.drivers(request), { code: "bad_request" });
  const controller = new AbortController();
  const filter = {
    get text() {
      controller.abort();
      return "a";
    },
  };
  await assert.rejects(client.signals("i", { filter }, controller.signal), { code: "cancelled" });
  assert.equal(transport.sent.length, 0);
});

test("A: complete source.read and checkInputs remain fresh after settlement", async (t) => {
  const { client, transport } = await setup(t);
  for (let i = 0; i < 2; i++) {
    const read = client.readSource("f");
    transport.reply(transport.sent.at(-1).id, {
      file: "f",
      path: "/f.sv",
      text: "",
      contentHash: "0".repeat(64),
      matchesSnapshot: true,
    });
    await read;
    const check = client.checkInputs();
    transport.reply(transport.sent.at(-1).id, { changed: [], complete: true });
    await check;
  }
  assert.equal(transport.sent.length, 4);
});

test("A: private ID boundary regression never wraps or reuses a completed ID", async (t) => {
  const { client, transport } = await setup(t);
  // White-box A regression only. No public option or production fault-injection API.
  client.nextId = Number.MAX_SAFE_INTEGER;
  const last = client.roots();
  assert.equal(transport.sent[0].id, Number.MAX_SAFE_INTEGER);
  transport.reply(transport.sent[0].id, []);
  await last;
  await assert.rejects(
    client.roots(),
    (error) => error instanceof HierError && error.data.reason === "id_exhausted",
  );
  assert.equal(transport.sent.length, 1);
});

test("A: immutable snapshot survives dispose and index subscriptions release", async (t) => {
  const { client, transport } = await setup(t);
  let notified = 0;
  const off = client.onIndexReady(() => notified++);
  off();
  off();
  transport.deliver({ event: "index", state: "ready" });
  await tick();
  assert.equal(notified, 0);
  assert.throws(() => {
    client.snapshot.tops.push({});
  }, TypeError);
  client.dispose();
  assert.equal(client.snapshot.snapshotId, "a");
});

test("A: cache byte boundary includes UTF8 key plus the entire Reply", () => {
  const key = "位",
    reply = { result: [], completeness: complete };
  const size = Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(reply));
  const exact = new ReplyCache(1, size),
    below = new ReplyCache(1, size - 1);
  exact.put(key, reply);
  below.put(key, reply);
  assert.equal(exact.get(key), reply);
  assert.equal(below.get(key), undefined);
});

test("A C65: snapshot-time dispose rejects before sending or registering new work", async (t) => {
  const { client, transport } = await setup(t);
  const pending = client.diagnostics({
    get maxItems() {
      client.dispose();
      return 1;
    },
  });
  // Attach immediately, so a failed assertion cannot leave an unobserved rejection.
  const outcome = pending.then(
    () => "resolved",
    (error) => error.code,
  );
  assert.equal(transport.closed, true);
  assert.equal(transport.sent.length, 0);
  assert.equal(await outcome, "disposed");
  assert.equal(client.pending.size, 0); // A internal leak check, not a public test adapter.
  client.dispose();
  await assert.rejects(client.roots(), { code: "disposed" });
});

test("A C64: method-specific integer validation survives the owning snapshot", async (t) => {
  for (const [token, valid] of [
    ["0.0e0", true],
    ["1e-999", false],
  ]) {
    const { client, transport } = await setup(t);
    const pending = client.children("i:0");
    const outcome = valid ? pending : assert.rejects(pending, { code: "protocol_error" });
    // A superset also matches Diagnostics, whose item has no childCount field.
    // Only the pending method can apply that particular integer constraint.
    const raw = `{"id":1,"ok":true,"result":{"errorCount":0,"warningCount":0,"truncated":false,"items":[{"ref":"i:0:0","name":"u","path":["top","u"],"pathText":"top.u","kind":"module","def":"d:0","defName":"leaf","childCount":${token},"hasParamOverrides":false,"severity":"warning","message":"extension"}]},"completeness":{"status":"complete","reasons":[]}}\n`;
    assert.equal(validateDefinition("DesignDiagnosticsResult", JSON.parse(raw).result), true);
    new NdjsonReader().feed(
      Buffer.from(raw),
      (frame) => {
        transport.deliver(frame);
        return true;
      },
      () => true,
    );
    const reply = await outcome;
    if (valid) assert.equal(reply.result.items[0].childCount, 0);
  }
});
test("A C64: unconstrained error data retains numbers and escaped/numeric object keys", async (t) => {
  const { client, transport } = await setup(t);
  const pending = client.roots();
  const rejected = assert.rejects(pending, (error) => {
    assert.equal(error.code, "not_found");
    assert.deepEqual(error.data, { 2: 1, 1: [null, true, { "a/b~c": 2 }], fraction: 0.125 });
    return true;
  });
  const raw =
    '{"id":1.0e0,"ok":false,"error":{"code":"not_found","message":"missing","data":{"2":1.0000000000000001,"1":[null,true,{"a\\/b~c":1.99999999999999999}],"fraction":0.125}}}\n';
  new NdjsonReader().feed(
    Buffer.from(raw),
    (frame) => {
      transport.deliver(frame);
      return true;
    },
    () => true,
  );
  await rejected;
  assert.equal(transport.closed, false);
});
