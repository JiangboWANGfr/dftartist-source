import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.HIER_A_CLIENT_MODULE_ROOT;
const url = name => root ? pathToFileURL(join(root, name + ".js"))
  : new URL(`../../packages/client/dist/${name}.js`, import.meta.url);
const { ReplyCache } = await import(url("reply-cache"));
const { connectElectronTransport } = await import(url("electron/renderer"));
const encoder = new TextEncoder();
const size = (key, value) => encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length;
const complete = { status: "complete", reasons: [] };
const turn = () => new Promise(setImmediate);

test("A M7 UTF8: complete cache charge includes Unicode key, nested Reply and exact one-byte boundary", () => {
  for (const key of ["", "a", "位🙂", "a".repeat(4095) + "🙂", "\ud800", "é".repeat(8193)]) {
    const reply = { result: [{ value: "位🙂".repeat(4097), raw: "\udfff", unknown: { nested: "é" } }], completeness: complete };
    const bytes = size(key, reply), exact = new ReplyCache(2, bytes), below = new ReplyCache(2, bytes - 1);
    exact.put(key, reply); below.put(key, reply);
    assert.equal(exact.get(key), reply); assert.equal(below.get(key), undefined);
  }
});

test("A M7 UTF8: byte and entry LRU eviction, replacement, clear and oversize retention remain atomic", () => {
  const a = { value: "位🙂" }, b = { value: "éééé" }, c = { value: "abc" };
  const cache = new ReplyCache(2, size("a", a) + size("b", b));
  cache.put("a", a); cache.put("b", b); assert.equal(cache.get("a"), a);
  cache.put("c", c); assert.equal(cache.get("b"), undefined); assert.equal(cache.get("a"), a);
  cache.put("a", { value: "x".repeat(65536) }); assert.equal(cache.get("a"), a);
  cache.put("a", c); assert.equal(cache.get("a"), c);
  cache.clear(); cache.put("b", b); assert.equal(cache.get("a"), undefined); assert.equal(cache.get("b"), b);
});

test("A M7 UTF8: key coercion precedes serialization, and failed serialization preserves the prior cache", () => {
  const calls = [], key = { [Symbol.toPrimitive](hint) { calls.push("key:" + hint); return "位"; } };
  const value = { toJSON() { calls.push("value"); throw new Error("serialization"); } };
  const cache = new ReplyCache(2, 1000), old = { ok: true };
  cache.put(key, old);
  calls.length = 0; assert.throws(() => cache.put(key, value), /serialization/);
  assert.deepEqual(calls, ["key:string", "value"]); assert.equal(cache.get(key), old);
  assert.throws(() => cache.put(Symbol("key"), old), TypeError);
});

test("A M7 UTF8: disabled caches avoid accessors and serializing reentry retains exact charges", () => {
  for (const [entries, bytes] of [[0, 1000], [2, 0]]) {
    const cache = new ReplyCache(entries, bytes);
    cache.put({ toString() { assert.fail("disabled key"); } }, { toJSON() { assert.fail("disabled value"); } });
  }
  const inner = { text: "🙂" }, outer = { text: "位" };
  const cache = new ReplyCache(3, size("inner", inner) + size("outer", outer));
  cache.put("outer", { toJSON() { cache.put("inner", inner); return outer; } });
  assert.equal(cache.get("inner"), inner);
  cache.put("next", { text: "a" }); assert.equal(cache.get("outer"), undefined);
});

function controlled(start) {
  let receive; const calls = [];
  return {
    calls,
    emit(json) { receive({ version: 1, sessionId: "utf8-session", kind: "frame", json }); },
    bridge: {
      version: 1,
      connect(handler) { receive = handler; return Promise.resolve({ ok: true, version: 1, sessionId: "utf8-session" }); },
      start() { calls.push("start"); start?.(); }, send() {},
      close() { calls.push("close"); }, release() { calls.push("release"); },
    },
  };
}
function frameAt(bytes) {
  const base = JSON.stringify({ extension: ("a".repeat(4081) + "🙂位").repeat(40) });
  return base + " ".repeat(bytes - encoder.encode(base).length);
}

test("A M7 UTF8: renderer accepts exact raw 4MiB, releases the bound after delivery and preserves JSON values", { timeout: 15000 }, async () => {
  const json = frameAt(4 * 1024 * 1024), input = controlled(() => input.emit(json));
  const transport = await connectElectronTransport(input.bridge), received = [], closed = [];
  transport.onClose(cause => closed.push(cause)); transport.onMessage(frame => received.push(frame));
  await turn(); assert.equal(received.length, 1); assert.equal(received[0].extension, JSON.parse(json).extension);
  input.emit(json + " "); await turn(); assert.equal(received.length, 2); assert.deepEqual(closed, []);
  transport.close(); await turn(); assert.equal(closed.length, 1);
  assert.deepEqual(input.calls, ["start", "close", "release"]);
});

test("A M7 UTF8: renderer raw 4MiB plus one before first delivery closes once without emitting", { timeout: 15000 }, async () => {
  const input = controlled(() => input.emit(frameAt(4 * 1024 * 1024 + 1)));
  const transport = await connectElectronTransport(input.bridge), received = [], closed = [];
  transport.onClose(cause => closed.push(cause)); transport.onMessage(frame => received.push(frame));
  await turn(); assert.deepEqual(received, []); assert.equal(closed.length, 1);
  assert.equal(closed[0].code, "transport_closed"); assert.equal(closed[0].data.reason, "prebind_buffer_overflow");
  transport.close(); await turn(); assert.equal(closed.length, 1);
  assert.deepEqual(input.calls, ["start", "close", "release"]);
});

test("A M7 UTF8: invalid scalar frames still reject before accounting and retain the first close cause", async () => {
  const input = controlled(() => { input.emit('{"unknown":"\\ud800"}'); input.emit('{}'); });
  const transport = await connectElectronTransport(input.bridge), closed = [];
  transport.onClose(cause => closed.push(cause)); transport.onMessage(() => assert.fail("invalid frame delivered"));
  await turn(); assert.equal(closed.length, 1); assert.equal(closed[0].data.reason, "invalid_frame");
  assert.deepEqual(input.calls, ["start", "close", "release"]);
});
