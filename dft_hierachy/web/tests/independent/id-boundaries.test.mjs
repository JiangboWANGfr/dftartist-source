// Agent B oracle: DESIGN5.6.1/.2/.5/.6; C approved fresh-only control, 2026-10-13.
// No production implementation imports, pending/cache access, or simulated allocator.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HierClient, HierError } from "@hier/client";

const MAX = Number.MAX_SAFE_INTEGER;
const complete = { status: "complete", reasons: [] };
const options = { timeout: 3000 }; // Harness guard, not cancellation or timeout SLA.
const tick = () => new Promise((resolve) => queueMicrotask(resolve));
const watch = (promise) => {
  promise.catch(() => {});
  return promise;
};
const snapshot = (id = "B-ID-boundary") => ({
  protocol: 2,
  schemaVersion: 7,
  snapshotId: id,
  inputHash: "0123456789abcdef".repeat(4),
  inputHashComplete: true,
  frontend: { name: "slang", version: "12.0.0" },
  bodySharing: "fast",
  tops: [],
  topCandidates: [],
  definitionCount: 0,
  bodyCount: 0,
  indexState: "ready",
  openedAt: "2000-02-29T23:59:59.123Z",
});

class Transport {
  sent = [];
  messages = new Set();
  closes = new Set();
  closed = false;
  received = 0;
  ownerTaken = false;
  callbacks = [];
  closeCalls = 0;
  onMessage(handler) {
    assert.equal(this.ownerTaken, false);
    this.ownerTaken = true;
    this.messages.add(handler);
    this.callbacks.push(handler); // Publicly registered callbacks only.
    return () => this.messages.delete(handler);
  }
  onClose(handler) {
    this.closes.add(handler);
    return () => this.closes.delete(handler);
  }
  send(message) {
    assert.equal(this.closed, false);
    assert.equal(this.ownerTaken, true);
    this.sent.push(structuredClone(message));
  }
  receive(message) {
    this.received++;
    const value = structuredClone(message);
    for (const handler of this.messages)
      queueMicrotask(() => {
        if (!this.closed && this.messages.has(handler)) handler(value);
      });
  }
  reply(id, result = [], completeness = complete) {
    this.receive({ id, ok: true, result, completeness });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.closeCalls++;
    for (const handler of this.closes)
      queueMicrotask(() => {
        if (this.closes.has(handler)) handler();
      });
  }
}

const controlled = new WeakSet();
function construct(t, initial, clientOptions) {
  const transport = new Transport();
  const client = new HierClient(transport, clientOptions);
  watch(client.ready);
  t.after(() => client.dispose());
  // This function constructs and controls immediately; no caller can query/hello
  // between construction and control. It never re-reads ID after the single write.
  if (initial !== undefined) {
    assert.ok(initial === MAX || initial === MAX - 1);
    assert.equal(transport.received, 0);
    assert.deepEqual(transport.sent, []);
    assert.equal(controlled.has(client), false);
    const property = Object.getOwnPropertyDescriptor(client, "nextId");
    assert.ok(
      property,
      "C-approved fresh data property is required, never skip",
    );
    assert.ok(Object.hasOwn(property, "value"));
    assert.equal(property.writable, true);
    assert.equal(property.get, undefined);
    assert.equal(property.set, undefined);
    assert.equal(property.value, 1);
    controlled.add(client);
    assert.equal(Reflect.set(client, "nextId", initial), true);
  }
  return { client, transport };
}
async function setup(t, initial, clientOptions, id) {
  const value = construct(t, initial, clientOptions);
  value.transport.receive({
    event: "hello",
    protocol: 2,
    snapshot: snapshot(id),
    capabilities: ["cancel", "progress"],
  });
  assert.deepEqual(await value.client.ready, snapshot(id));
  return value;
}
function error(code, origin) {
  return (value) => {
    assert.ok(value instanceof HierError);
    assert.equal(value.origin, origin);
    if (code !== undefined) assert.equal(value.code, code);
    assert.equal(typeof value.message, "string");
    assert.ok(value.message.length > 0);
    assert.ok(value.data && typeof value.data === "object");
    assert.equal(Array.isArray(value.data), false);
    return true;
  };
}
async function exhausted(client, transport, ref = "i:99") {
  const before = structuredClone(transport.sent);
  // DESIGN fixes client rejection/no send, not a particular code/data.reason.
  await assert.rejects(client.ports(ref), error(undefined, "client"));
  await tick();
  assert.deepEqual(transport.sent, before);
  assert.equal(transport.closed, false);
}
function requests(transport, ids) {
  assert.deepEqual(
    transport.sent
      .filter((frame) => frame.method !== "cancel")
      .map((frame) => frame.id),
    ids,
  );
  for (const frame of transport.sent) {
    if (frame.method === "cancel") {
      assert.equal(Object.hasOwn(frame, "id"), false);
      assert.equal(Object.hasOwn(frame, "snapshot"), false);
    } else {
      assert.ok(Number.isSafeInteger(frame.id));
      assert.ok(frame.id >= 1 && frame.id <= MAX);
      assert.equal(frame.snapshot.startsWith("B-ID-"), true);
    }
  }
}

test("B ID: untouched client starts at 1 and increases", options, async (t) => {
  const { client, transport } = await setup(t);
  const a = watch(client.ports("i:0"));
  const b = watch(client.ports("i:1"));
  await tick();
  requests(transport, [1, 2]);
  transport.reply(2);
  transport.reply(1);
  assert.deepEqual(await Promise.all([a, b]), [
    { result: [], completeness: complete },
    { result: [], completeness: complete },
  ]);
});

for (const initial of [MAX - 1, MAX])
  test(
    "B ID: final legal prefix " + initial + " then rejects without wrap",
    options,
    async (t) => {
      const { client, transport } = await setup(t, initial, {
        cacheEntries: 0,
      });
      const ids = initial === MAX ? [MAX] : [MAX - 1, MAX];
      const pending = ids.map((_, index) => watch(client.ports("i:" + index)));
      await tick();
      requests(transport, ids);
      await exhausted(client, transport);
      await exhausted(client, transport, "i:100");
      for (const id of [...ids].reverse()) transport.reply(id);
      for (const reply of await Promise.all(pending))
        assert.deepEqual(reply, { result: [], completeness: complete });
      requests(transport, ids);
      assert.equal(client.snapshot.snapshotId, "B-ID-boundary");
    },
  );

test(
  "B ID: exhaustion keeps two pending and allows equivalent defaults to merge",
  options,
  async (t) => {
    const { client, transport } = await setup(t, MAX - 1);
    const first = watch(client.children("i:0"));
    const second = watch(client.children("i:1", { limit: 1 }));
    await tick();
    requests(transport, [MAX - 1, MAX]);
    await exhausted(client, transport);
    const merged = watch(client.children("i:0", { cursor: "", limit: 200 }));
    await tick();
    requests(transport, [MAX - 1, MAX]);
    transport.reply(MAX, { items: [] });
    transport.reply(MAX - 1, { items: [], next: "B-next" });
    assert.deepEqual(await second, {
      result: { items: [] },
      completeness: complete,
    });
    assert.deepEqual(await merged, await first);
    await assert.rejects(client.children("i:0"), error(undefined, "client"));
    requests(transport, [MAX - 1, MAX]); // Completed page is not cached.
  },
);

test(
  "B ID: old Core failure still preserves code/message/data after local exhaustion",
  options,
  async (t) => {
    const { client, transport } = await setup(t, MAX);
    const pending = watch(client.ports("i:404"));
    const rejected = assert.rejects(pending, (value) => {
      error("not_found", "core")(value);
      assert.equal(value.message, "B original lookup error");
      assert.deepEqual(value.data, { ref: "i:404" });
      return true;
    });
    await tick();
    await exhausted(client, transport);
    transport.receive({
      id: MAX,
      ok: false,
      error: {
        code: "not_found",
        message: "B original lookup error",
        data: { ref: "i:404" },
      },
    });
    await rejected;
    await exhausted(client, transport, "i:405");
    requests(transport, [MAX]);
  },
);

test(
  "B ID: complete cache works after MAX and pre-abort still wins over cache",
  options,
  async (t) => {
    const { client, transport } = await setup(t, MAX);
    const pending = watch(client.ports("i:0"));
    await tick();
    transport.reply(MAX);
    const reply = await pending;
    await exhausted(client, transport);
    assert.deepEqual(await client.ports("i:0"), reply);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
      client.ports("i:0", abort.signal),
      error("cancelled", "client"),
    );
    requests(transport, [MAX]);
  },
);

test(
  "B ID: earlier cached entry survives exhaustion with final request still pending",
  options,
  async (t) => {
    const { client, transport } = await setup(t, MAX - 1);
    const ports = watch(client.ports("i:0"));
    await tick();
    transport.reply(MAX - 1);
    await ports;
    const page = watch(client.children("i:1"));
    await tick();
    await exhausted(client, transport);
    assert.deepEqual(await client.ports("i:0"), {
      result: [],
      completeness: complete,
    });
    transport.reply(MAX, { items: [] });
    await page;
    requests(transport, [MAX - 1, MAX]);
  },
);

test(
  "B ID: pre-abort and invalid arguments consume no final legal ID",
  options,
  async (t) => {
    const { client, transport } = await setup(t, MAX);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
      client.ports("i:0", abort.signal),
      error("cancelled", "client"),
    );
    await assert.rejects(
      client.children("i:0", { limit: 0 }),
      error("bad_request", "client"),
    );
    assert.deepEqual(transport.sent, []);
    const pending = watch(client.ports("i:0"));
    await tick();
    requests(transport, [MAX]);
    transport.reply(MAX);
    await pending;
  },
);

test(
  "B ID: merged subscribers can still send one legal cancel at exhausted MAX",
  options,
  async (t) => {
    const { client, transport } = await setup(t, MAX);
    const a = new AbortController();
    const b = new AbortController();
    const one = watch(client.ports("i:0", a.signal));
    const two = watch(client.ports("i:0", b.signal));
    const oneBad = assert.rejects(one, error("cancelled", "client"));
    const twoBad = assert.rejects(two, error("cancelled", "client"));
    await tick();
    requests(transport, [MAX]);
    await exhausted(client, transport);
    a.abort();
    await oneBad;
    assert.equal(transport.sent.length, 1);
    b.abort();
    await twoBad;
    assert.deepEqual(transport.sent[1], {
      method: "cancel",
      params: { target: MAX },
    });
    a.abort();
    b.abort();
    transport.reply(MAX);
    transport.receive({ event: "progress", target: MAX, done: 1, total: 1 });
    await tick();
    await exhausted(client, transport, "i:0"); // Late complete reply must not enter cache.
    requests(transport, [MAX]);
    assert.equal(transport.sent.length, 2);
  },
);

test(
  "B ID: cancellation of MAX-1 leaves MAX pending, with no extra wire ID",
  options,
  async (t) => {
    const { client, transport } = await setup(t, MAX - 1);
    const abort = new AbortController();
    const one = watch(client.ports("i:0", abort.signal));
    const bad = assert.rejects(one, error("cancelled", "client"));
    const two = watch(client.ports("i:1"));
    await tick();
    await exhausted(client, transport);
    abort.abort();
    await bad;
    assert.deepEqual(transport.sent[2], {
      method: "cancel",
      params: { target: MAX - 1 },
    });
    transport.reply(MAX - 1);
    transport.reply(MAX);
    assert.deepEqual(await two, { result: [], completeness: complete });
    requests(transport, [MAX - 1, MAX]);
  },
);

test(
  "B ID: final successful subscriber is not changed by late abort",
  options,
  async (t) => {
    const { client, transport } = await setup(t, MAX);
    const abort = new AbortController();
    const pending = watch(client.ports("i:0", abort.signal));
    await tick();
    transport.reply(MAX);
    const result = await pending;
    abort.abort();
    await tick();
    assert.deepEqual(await pending, result);
    assert.deepEqual(await client.ports("i:0"), result);
    assert.equal(transport.sent.length, 1);
  },
);

test(
  "B ID: dispose rejects original pending, releases subscriptions and is idempotent",
  options,
  async (t) => {
    const { client, transport } = await setup(t, MAX);
    const pending = watch(client.ports("i:0"));
    const bad = assert.rejects(pending, error("disposed", "client"));
    await tick();
    await exhausted(client, transport);
    transport.reply(MAX); // Queued but not yet delivered; dispose wins.
    client.dispose();
    client.dispose();
    await bad;
    await tick();
    assert.equal(transport.messages.size, 0);
    assert.equal(transport.closes.size, 0);
    assert.equal(transport.closeCalls, 1);
    await assert.rejects(client.ports("i:0"), error("disposed", "client"));
    requests(transport, [MAX]);
  },
);

test(
  "B ID: new connection restores 1 and stale old callbacks cannot settle it",
  options,
  async (t) => {
    const old = await setup(t, MAX);
    const original = watch(old.client.ports("i:0"));
    const oldBad = assert.rejects(original, error("disposed", "client"));
    await tick();
    await exhausted(old.client, old.transport);
    const oldCallback = old.transport.callbacks[0];
    old.client.dispose();
    await oldBad;
    const current = await setup(t, undefined, undefined, "B-ID-new-connection");
    const pending = watch(current.client.ports("i:0"));
    let settled = false;
    pending.then(() => {
      settled = true;
    });
    await tick();
    requests(current.transport, [1]);
    // Emulate a callback already queued by a conforming old Transport, not a private SDK entry.
    oldCallback({ id: MAX, ok: true, result: [], completeness: complete });
    oldCallback({ id: 1, ok: true, result: [], completeness: complete });
    await tick();
    assert.equal(settled, false);
    current.transport.reply(1);
    assert.deepEqual(await pending, { result: [], completeness: complete });
    assert.equal(current.client.snapshot.snapshotId, "B-ID-new-connection");
    assert.equal(current.transport.closed, false);
  },
);
