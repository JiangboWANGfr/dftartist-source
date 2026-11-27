// Agent B: DESIGN 6.9.4 narrow supplement, independently approved by C 2026-10-16.
// No implementation, A consumer or C temporary control is used as an oracle.
import assert from "node:assert/strict";
import { add } from "./cases.mjs";
import {
  using,
  invoke,
  begin,
  finish,
  failure,
  info,
  local,
  deep,
  opaque,
  HierError,
  closeWith,
} from "./harness.mjs";

const basis =
  "DESIGN 6.9.4 subscribe disposal supplement; C approval 2026-10-16";
const invalidKinds = [
  "undefined",
  "null",
  "zero",
  "false",
  "empty",
  "object",
  "array",
  "boxed",
  "bigint",
  "symbol",
  "proxy",
  "revoked",
];
function listener(kind, counts) {
  if (kind === "array") return [];
  if (kind === "boxed") return new String("B listener");
  if (kind === "bigint") return 1n;
  if (kind === "symbol") return Symbol("B listener");
  if (kind === "revoked") {
    const p = Proxy.revocable({}, {});
    p.revoke();
    return p.proxy;
  }
  if (kind === "function")
    return () => {
      counts.calls++;
    };
  if (kind === "callable-proxy") {
    const trap = () => {
      counts.probes++;
      throw Error("B disposed listener must not be inspected or called");
    };
    return new Proxy(() => {}, {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
      getOwnPropertyDescriptor: trap,
      apply: trap,
    });
  }
  return opaque(kind, counts);
}
function capture(fn) {
  try {
    return { threw: false, value: fn() };
  } catch (error) {
    return { threw: true, error };
  }
}
function synchronousError(fn, code) {
  const out = capture(fn);
  assert.equal(out.threw, true, "synchronous exception required");
  local(out.error, code);
}
function unchanged(c, before) {
  assert.equal(c.m.state, before.state);
  assert.equal(c.calls.length, before.calls);
  assert.equal(c.wire.queries.length, before.queries);
  assert.equal(c.events.length, before.events);
  assert.deepEqual(c.wire.registrations, before.registrations);
  assert.equal(c.wire.closed, false, "borrowed SDK/Transport stays open");
}
function snapshot(c) {
  return {
    state: c.m.state,
    calls: c.calls.length,
    queries: c.wire.queries.length,
    events: c.events.length,
    registrations: [...c.wire.registrations],
  };
}
for (const kind of invalidKinds)
  add(
    "IP-S-active-invalid-" + kind,
    "subscribe-disposal",
    `active model subscribe(${kind})`,
    "synchronous invalid_argument; no registration effect/query/notification/state change",
    () =>
      using(async (c) => {
        const before = snapshot(c),
          counts = { probes: 0, calls: 0 };
        synchronousError(
          () => c.m.subscribe(listener(kind, counts)),
          "invalid_argument",
        );
        unchanged(c, before);
        // No extra raw-read rule is invented for active invalid arguments.
        assert.equal(counts.calls, 0);
        let notifications = 0;
        const off = c.m.subscribe(() => notifications++);
        await finish(c, await begin(c));
        assert.equal(
          notifications,
          2,
          "only the valid registration participates",
        );
        off();
      }),
    basis,
  );
for (const kind of [...invalidKinds, "function", "callable-proxy"])
  add(
    "IP-S-disposed-" + kind,
    "subscribe-disposal",
    `disposed model subscribe(${kind})`,
    "synchronous disposed before listener validation, zero argument probes/calls, state/SDK unchanged",
    () =>
      using(async (c) => {
        const counts = { probes: 0, calls: 0 },
          value = listener(kind, counts),
          id = c.m.snapshotId;
        c.m.dispose();
        const before = snapshot(c);
        synchronousError(() => c.m.subscribe(value), "disposed");
        unchanged(c, before);
        assert.equal(c.m.disposed, true);
        assert.equal(c.m.snapshotId, id);
        deep(c.m.state);
        assert.deepEqual(counts, { probes: 0, calls: 0 });
      }),
    basis,
  );
add(
  "IP-S-disposed-notification",
  "subscribe-disposal",
  "pending listener disposes then calls subscribe(poison); later listener registered",
  "subscribe synchronously disposed despite notification guard; load disposed, later listener stopped, zero SDK query/raw probe",
  () =>
    using(async (c) => {
      const counts = { probes: 0, calls: 0 },
        poison = listener("proxy", counts);
      let out,
        later = 0,
        entered = 0;
      c.m.subscribe(() => {
        entered++;
        c.m.dispose();
        out = capture(() => c.m.subscribe(poison));
      });
      c.m.subscribe(() => later++);
      const task = invoke(c, "load", "B-ip-A");
      local(await failure(task), "disposed");
      assert.equal(entered, 1);
      assert.equal(out.threw, true);
      local(out.error, "disposed");
      assert.equal(later, 0);
      assert.equal(c.calls.length, 0);
      assert.deepEqual(counts, { probes: 0, calls: 0 });
      assert.deepEqual(c.m.state, { status: "idle", target: null });
      assert.equal(c.wire.closed, false);
    }),
  basis,
);
add(
  "IP-S-disposed-diagnostic",
  "subscribe-disposal",
  "original SDK error data getter disposes then calls subscribe(poison)",
  "subscribe synchronously disposed despite diagnostic guard; original load disposed with original cause, no later reads/publication",
  () =>
    using(async (c) => {
      const counts = { probes: 0, calls: 0 },
        poison = listener("proxy", counts),
        original = new HierError(
          "transport_closed",
          "transport",
          "B subscribe boundary",
          {},
        );
      let out,
        reads = 0,
        later = 0;
      Object.defineProperty(original, "data", {
        get() {
          reads++;
          c.m.dispose();
          out = capture(() => c.m.subscribe(poison));
          return {
            get later() {
              later++;
              return 1;
            },
          };
        },
      });
      const task = await begin(c);
      closeWith(c, original);
      const error = await failure(task.o);
      local(error, "disposed");
      assert.equal(error.cause, original);
      assert.equal(reads, 1);
      assert.equal(later, 0);
      assert.equal(out.threw, true);
      local(out.error, "disposed");
      assert.deepEqual(counts, { probes: 0, calls: 0 });
      assert.deepEqual(c.m.state, { status: "idle", target: null });
    }),
  basis,
);
add(
  "IP-S-old-unsubscribe-borrowed-client",
  "subscribe-disposal",
  "two independent old subscriptions; unsubscribe one, dispose, repeat both unsubscriptions, direct SDK query",
  "old unsubscribe remains synchronous/idempotent after dispose; no callback/new model work; borrowed SDK query still succeeds",
  () =>
    using(async (c) => {
      let calls = 0;
      const fn = () => calls++,
        first = c.m.subscribe(fn),
        second = c.m.subscribe(fn);
      first();
      first();
      c.m.dispose();
      const before = snapshot(c);
      assert.doesNotThrow(() => {
        first();
        second();
        second();
        c.m.dispose();
      });
      unchanged(c, before);
      assert.equal(calls, 0);
      const p = c.client.instance("B-ip-A"),
        q = await c.wire.next("inst.get");
      c.wire.ok(q, info());
      assert.deepEqual((await p).result, info());
      assert.equal(calls, 0);
      assert.equal(c.m.state, before.state);
      assert.equal(c.wire.closed, false);
    }),
  basis,
);
