// B oracle: DESIGN5.6.1/.2/.5/.6; C-approved fresh-only nextId control.
// Public Transport observation forwards to the real Node factory unchanged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HierClient, HierError } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const MAX = Number.MAX_SAFE_INTEGER;
const complete = { status: "complete", reasons: [] };
const guard = { timeout: 10000 }; // Harness guard, not product cancellation SLA.
const fixture = fileURLToPath(
  new URL("../../../core/tests/fixtures/m4/id_boundary.sv", import.meta.url),
);
const controlled = new WeakSet();
const watch = (promise) => {
  promise.catch(() => {});
  return promise;
};
const isError = (code) => (value) => {
  assert.ok(value instanceof HierError);
  assert.equal(value.origin, "client");
  if (code !== undefined) assert.equal(value.code, code);
  assert.ok(value.message.length > 0);
  assert.ok(value.data && typeof value.data === "object");
  return true;
};

async function session(t, initial) {
  assert.ok(
    process.env.HIER_BIN,
    "this verifier's real Core is required, no skip",
  );
  const raw = createProcessTransport({
    command: process.env.HIER_BIN,
    args: ["serve", "--top", "B_id_boundary", fixture],
  });
  raw.exited.catch(() => {});
  const sent = [];
  let delivered = 0,
    closeCalls = 0;
  const transport = {
    send(value) {
      raw.send(value);
      sent.push(structuredClone(value));
    },
    onMessage(handler) {
      return raw.onMessage((value) => {
        delivered++;
        handler(value);
      });
    },
    onClose: (handler) => raw.onClose(handler),
    close() {
      closeCalls++;
      raw.close();
    },
  };
  let client;
  t.after(async () => {
    if (client) client.dispose();
    else raw.close();
    const exit = await raw.exited;
    assert.deepEqual(exit, { code: 0, signal: null });
  });
  client = new HierClient(transport);
  watch(client.ready);
  // No await/query/send/hello can intervene between construction and control.
  if (initial !== undefined) {
    assert.ok(initial === MAX || initial === MAX - 1);
    assert.equal(delivered, 0);
    assert.deepEqual(sent, []);
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
  const snapshot = await client.ready;
  assert.deepEqual(
    snapshot.tops.map((top) => top.name),
    ["B_id_boundary"],
  );
  assert.deepEqual(snapshot.topCandidates, []);
  return {
    client,
    raw,
    sent,
    snapshot,
    get closeCalls() {
      return closeCalls;
    },
  };
}

test(
  "B ID real: MAX-1/MAX round trip, exhaustion rejects locally and cache survives",
  guard,
  async (t) => {
    const s = await session(t, MAX - 1);
    const root = s.snapshot.tops[0].ref;
    const roots = watch(s.client.roots());
    const ports = watch(s.client.ports(root));
    await assert.rejects(s.client.children(root), isError());
    assert.deepEqual(
      s.sent.map((frame) => frame.id),
      [MAX - 1, MAX],
    );
    assert.equal(s.closeCalls, 0);
    const r = await roots,
      p = await ports;
    assert.deepEqual(r.completeness, complete);
    assert.deepEqual(
      r.result.map((top) => top.name),
      ["B_id_boundary"],
    );
    assert.deepEqual(p.completeness, complete);
    assert.deepEqual(
      p.result.map((port) => [port.name, port.direction, port.width]),
      [
        ["a", "in", 1],
        ["y", "out", 1],
      ],
    );
    assert.deepEqual(await s.client.ports(root), p);
    await assert.rejects(s.client.roots(), isError());
    assert.equal(s.sent.length, 2);
    assert.equal(s.closeCalls, 0);
    for (const frame of s.sent)
      assert.equal(frame.snapshot, s.snapshot.snapshotId);
  },
);

test(
  "B ID real: last merged subscriber emits target MAX cancel with no request ID",
  guard,
  async (t) => {
    const s = await session(t, MAX);
    const root = s.snapshot.tops[0].ref;
    const a = new AbortController(),
      b = new AbortController();
    const one = watch(s.client.ports(root, a.signal));
    const two = watch(s.client.ports(root, b.signal));
    const badOne = assert.rejects(one, isError("cancelled"));
    const badTwo = assert.rejects(two, isError("cancelled"));
    // Same JS turn: no response callback can win before these local aborts.
    a.abort();
    assert.equal(s.sent.length, 1);
    b.abort();
    await Promise.all([badOne, badTwo]);
    assert.equal(s.sent[0].id, MAX);
    assert.deepEqual(s.sent[1], { method: "cancel", params: { target: MAX } });
    await assert.rejects(s.client.ports(root), isError());
    assert.equal(s.sent.length, 2);
    assert.equal(s.closeCalls, 0);
    // after() checks real process exit/cleanup. No assertion that Core observed
    // execution-time cancellation; success-before-cancel is permitted by DESIGN.
  },
);

test(
  "B ID real: exhausted connection is disposed and new process starts at ID1",
  guard,
  async (t) => {
    const old = await session(t, MAX);
    await old.client.roots();
    await assert.rejects(old.client.roots(), isError());
    old.client.dispose();
    assert.deepEqual(await old.raw.exited, { code: 0, signal: null });
    const current = await session(t);
    const roots = await current.client.roots();
    assert.deepEqual(
      roots.result.map((top) => top.name),
      ["B_id_boundary"],
    );
    assert.equal(old.sent[0].id, MAX);
    assert.equal(current.sent[0].id, 1);
    assert.notEqual(old.snapshot.snapshotId, current.snapshot.snapshotId);
    assert.equal(old.snapshot.inputHash, current.snapshot.inputHash);
  },
);
