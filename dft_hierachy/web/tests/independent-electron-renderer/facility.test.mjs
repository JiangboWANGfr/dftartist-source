import assert from "node:assert/strict";
import test from "node:test";
import {
  BridgeInput,
  SESSION,
  checkpoint,
  frame,
  reply,
  byteFrame,
  context,
} from "./fixture.mjs";
import { cases } from "./cases.mjs";
import { negatives } from "./types.mjs";
test("B facility: inventory has unique concrete input/expected/basis and functions", () => {
  assert.ok(cases.length > 70);
  assert.equal(new Set(cases.map((x) => x.id)).size, cases.length);
  for (const c of cases) {
    assert.ok(c.input && c.expected && c.basis);
    assert.equal(typeof c.run, "function");
  }
  assert.equal(negatives.length, 16);
  assert.equal(new Set(negatives.map((x) => x[0])).size, 16);
});
test("B facility: Bridge controller records only supplied capabilities and per-claim callbacks", async () => {
  const b = new BridgeInput(),
    got = [];
  const result = await b.bridge.connect((x) => got.push(x));
  assert.equal(result.sessionId, SESSION);
  b.emit(frame(reply(1, {})));
  assert.equal(got.length, 1);
  b.bridge.start(SESSION);
  b.bridge.send(SESSION, "{}");
  b.bridge.close(SESSION);
  b.bridge.release(SESSION);
  assert.deepEqual(
    b.calls.map((x) => x.method),
    ["connect", "start", "send", "close", "release"],
  );
  assert.equal(b.records[0].active, false);
});
test("B facility: failed second controlled claim leaves first registration intact", async () => {
  const b = new BridgeInput();
  await b.bridge.connect(() => {});
  b.outcomes.push({
    ok: false,
    error: { code: "bad_request", origin: "client", message: "B", data: {} },
  });
  await b.bridge.connect(() => {});
  assert.equal(b.records[0].active, true);
  assert.equal(b.records[1].active, false);
  b.bridge.release(SESSION);
  assert.equal(b.records[0].active, false);
});
test("B facility: exact raw UTF8 byte boundaries are hand-computable, not character lengths", () => {
  for (const unit of ["a", "界"])
    for (const delta of [-1, 0, 1]) {
      const text = byteFrame(4 * 1024 * 1024 + delta, unit);
      assert.equal(Buffer.byteLength(text), 4 * 1024 * 1024 + delta);
      assert.equal(typeof JSON.parse(text).result.text, "string");
    }
});
test("B facility: raw numeric counterexample rounds in JS but literal input remains distinct", () => {
  assert.equal(JSON.parse("1.0000000000000001"), 1);
  assert.equal(JSON.parse("-1e-400"), -0);
  assert.ok(
    cases.some(
      (x) =>
        x.input.rawToken === "1.0000000000000001" &&
        x.expected.includes("noninteger"),
    ),
  );
});
test("B facility: event-loop task boundary drains queued microtasks without sleeps", async () => {
  const seen = [];
  queueMicrotask(() => {
    seen.push(1);
    queueMicrotask(() => seen.push(2));
  });
  assert.deepEqual(seen, []);
  await checkpoint();
  assert.deepEqual(seen, [1, 2]);
});
test("B facility only: one cleanup failure does not prevent other owned resource cleanup", async () => {
  const seen = [];
  // Close-only sentinels exercise B cleanup, not any renderer product semantics.
  const c = context(
    async () => ({
      close() {
        const n = seen.length;
        seen.push(n);
        if (n === 0) throw new Error("B deliberate cleanup fault");
      },
    }),
    {},
  );
  await c.open();
  await c.open();
  await assert.rejects(c.cleanup(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 1);
    assert.match(error.errors[0].message, /deliberate cleanup fault/u);
    return true;
  });
  assert.deepEqual(seen, [0, 1]);
});
