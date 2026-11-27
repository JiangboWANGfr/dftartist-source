import assert from "node:assert/strict";
import {
  using,
  invoke,
  track,
  begin,
  finish,
  first,
  success,
  failure,
  local,
  state,
  calls,
  Q,
  refs,
  complete,
  partial,
  vm,
  sdk,
  sdkAlive,
  tick,
  opaque,
} from "./harness.mjs";
export const cases = [];
const add = (id, input, expected, run, section = 2) =>
  cases.push({
    id: "PRM-" + id,
    input,
    expected,
    basis: "DESIGN §6.26." + section + "; inherited §§6.24/6.9",
    run,
  });
async function invalid(c, value, code = "invalid_argument") {
  const before = c.m.state,
    n = c.wire.queries.length,
    e = c.events.length;
  local(await failure(invoke(c, "load", value), code), code);
  assert.equal(c.m.state, before);
  assert.equal(c.wire.queries.length, n);
  assert.equal(c.events.length, e);
}
add(
  "idle",
  {},
  "frozen idle; no implicit calls/index subscriptions, no-op idle commands; idempotent dispose borrows SDK",
  () =>
    using(async (c) => {
      const s = state(c, "idle", null);
      assert.equal(c.m.snapshotId, Q.snapshotId);
      assert.equal(c.registrations, 0);
      assert.equal(c.wire.queries.length, 0);
      for (const n of ["reload", "cancel", "clear"])
        await success(invoke(c, n));
      assert.equal(c.m.state, s);
      assert.equal(c.events.length, 0);
      assert.equal(typeof c.m.loadMore, "undefined");
      c.m.dispose();
      c.m.dispose();
      assert(c.m.disposed);
      await sdkAlive(c);
    }),
);
for (const mode of ["not-ready", "client-disposed"])
  add(
    "constructor-" + mode,
    { mode },
    mode === "not-ready"
      ? "original synchronous SDK snapshot error identity; zero model query"
      : "retained SDK snapshot binds after dispose without query/subscription; load rejects original SDK disposed identity and publishes failed without wire request",
    () =>
      using(
        async (c) => {
          let retained;
          if (mode === "client-disposed") {
            retained = c.client.snapshot;
            c.client.dispose();
          }
          let descriptor,
            p = c.client,
            raw;
          while (!descriptor && p) {
            descriptor = Object.getOwnPropertyDescriptor(p, "snapshot");
            p = Object.getPrototypeOf(p);
          }
          assert(descriptor?.get);
          Object.defineProperty(c.client, "snapshot", {
            get() {
              try {
                return Reflect.apply(descriptor.get, this, []);
              } catch (e) {
                raw = e;
                throw e;
              }
            },
          });
          if (mode === "not-ready") {
            assert.throws(
              () => c.newModel(),
              (e) => e === raw && e !== undefined,
            );
            assert.equal(calls(c).length, 0);
          } else {
            assert.doesNotThrow(() => {
              c.m = c.newModel();
            });
            assert.equal(c.client.snapshot, retained);
            assert.equal(c.m.snapshotId, Q.snapshotId);
            state(c, "idle", null);
            assert.equal(calls(c).length, 0);
            assert.equal(c.registrations, 0);
            assert.equal(c.wire.queries.length, 0);
            const e = await failure(invoke(c, "load", Q), "disposed");
            assert.equal(calls(c).length, 1);
            assert.equal(e, calls(c)[0].error);
            assert.equal(e.origin, "client");
            state(c, "failed");
            assert.equal(c.m.state.error.origin, e.origin);
            assert.equal(c.m.state.error.code, e.code);
            assert.equal(c.wire.queries.length, 0);
          }
        },
        { withModel: false, ready: mode !== "not-ready" },
      ),
    1,
  );
for (const [n, value] of [
  ["null", null],
  ["array", []],
  ["function", () => {}],
  ["number", 1],
  ["undefined", undefined],
  ["inherited", Object.create(Q)],
  ["missing-text", { snapshotId: Q.snapshotId }],
  ["undefined-text", { ...Q, text: undefined }],
  ["boxed-text", { ...Q, text: new String("x") }],
  ["empty-snapshot", { ...Q, snapshotId: "" }],
  ["wrong-snapshot", { ...Q, snapshotId: "B68-other" }],
])
  add(
    "input-" + n,
    { shape: n },
    "invalid input never cancels pending or publishes; mismatch only after projection",
    () =>
      using(async (c) => {
        const t = await begin(c);
        await invalid(
          c,
          value,
          n === "wrong-snapshot" ? "snapshot_mismatch" : "invalid_argument",
        );
        await finish(c, t);
      }),
    1,
  );
for (const text of [
  "",
  " \t\n",
  "root.part",
  "root/part",
  "root/\\escaped.name ",
  "d:looks-like-ref",
])
  add(
    "text-" + cases.length,
    { text },
    "original unparsed/untrimmed string sent exactly once with AbortSignal and no wire snapshot/options",
    () =>
      using(async (c) => {
        const t = await begin(c, { ...Q, text });
        first(c, t);
        await finish(c, t, []);
        assert.equal(c.m.state.query.text, text);
      }),
    1,
  );
add(
  "projection-order",
  {},
  "own descriptor/Get once snapshotId then text, all projection precedes validation; extension never touched",
  () =>
    using(async (c) => {
      const seen = [],
        v = new Proxy(
          {
            snapshotId: 7,
            text: "raw",
            get extra() {
              throw Error("extension");
            },
          },
          {
            getOwnPropertyDescriptor(o, k) {
              seen.push("own:" + String(k));
              return Reflect.getOwnPropertyDescriptor(o, k);
            },
            get(o, k, r) {
              seen.push("get:" + String(k));
              return Reflect.get(o, k, r);
            },
            ownKeys() {
              throw Error("enumerated");
            },
          },
        );
      await invalid(c, v);
      assert.deepEqual(seen, [
        "own:snapshotId",
        "get:snapshotId",
        "own:text",
        "get:text",
      ]);
    }),
  1,
);
for (const place of ["descriptor", "get"])
  add(
    "projection-throw-" + place,
    { place },
    "invalid_argument preserves own undefined cause, no query; field reads do not coerce",
    () =>
      using(async (c) => {
        const v = new Proxy(
            { ...Q },
            {
              getOwnPropertyDescriptor(o, k) {
                if (place === "descriptor") throw undefined;
                return Reflect.getOwnPropertyDescriptor(o, k);
              },
              get() {
                throw undefined;
              },
            },
          ),
          e = await failure(invoke(c, "load", v), "invalid_argument");
        assert(Object.hasOwn(e, "cause"));
        assert.equal(e.cause, undefined);
        assert.equal(calls(c).length, 0);
      }),
    1,
  );
add(
  "projection-dispose",
  {},
  "dispose during field read wins invalid value/throw and preserves same cause, no SDK call",
  () =>
    using(async (c) => {
      const raw = { B: "cause" },
        v = {
          get snapshotId() {
            c.m.dispose();
            throw raw;
          },
          text: Q.text,
        };
      const e = await failure(invoke(c, "load", v), "disposed");
      assert.equal(e.cause, raw);
      assert.equal(calls(c).length, 0);
    }),
  1,
);
add(
  "projection-reentrant",
  {},
  "nested commands rejected reentrant_change before hostile input; outer capture succeeds",
  () =>
    using(async (c) => {
      const nested = [],
        n = { probes: 0 },
        v = {
          get snapshotId() {
            nested.push(invoke(c, "load", opaque(n)));
            return Q.snapshotId;
          },
          text: Q.text,
        };
      const t = await begin(c, v);
      local(await failure(nested[0], "reentrant_change"), "reentrant_change");
      assert.equal(n.probes, 0);
      await finish(c, t);
    }),
  1,
);
add(
  "captured-query",
  {},
  "query own two frozen fields unaffected by caller mutation; original captured state identities",
  () =>
    using(async (c) => {
      const input = { ...Q },
        t = await begin(c, input);
      input.text = "changed";
      assert.notEqual(c.m.state.query, input);
      assert.deepEqual(Reflect.ownKeys(c.m.state.query).sort(), [
        "snapshotId",
        "text",
      ]);
      assert.equal(c.m.state.query.text, Q.text);
      await finish(c, t);
    }),
);
for (const comp of ["complete", "partial"])
  for (const size of [0, 1, 4])
    add(
      "reply-" + comp + "-" + size,
      { comp, size },
      "single original Reply/result/completeness/reasons/extensions; duplicates/order retained; same-target success no-op including partial",
      () =>
        using(async (c) => {
          const value = refs().slice(0, size),
            t = await begin(c);
          await finish(c, t, value, comp === "partial" ? partial : complete);
          const s = c.m.state,
            r = calls(c)[0].reply;
          assert.equal(s.reply, r);
          assert.equal(s.reply.result, r.result);
          assert.deepEqual(s.reply.result, value);
          assert.equal(s.reply.completeness, r.completeness);
          await success(invoke(c, "load", { ...Q }));
          assert.equal(c.m.state, s);
          assert.equal(calls(c).length, 1);
        }),
    );
add(
  "pending-join",
  {},
  "same original values join original Promise, one task/publication; successful no-op doesn't republish",
  () =>
    using(async (c) => {
      const t = await begin(c),
        s = c.m.state,
        n = c.events.length,
        a = invoke(c, "load", { ...Q });
      assert.equal(a.promise, t.o.promise);
      assert.equal(calls(c).length, 1);
      assert.equal(c.events.length, n);
      assert.equal(c.m.state, s);
      await finish(c, t);
      await success(a);
    }),
);
for (const action of ["cancel", "clear", "replace", "reload", "dispose"])
  add(
    "revoke-" + action,
    { action },
    "old task/joiner reject cancelled or disposed; late result consumed; new target has no old reply",
    () =>
      using(async (c) => {
        const t = await begin(c),
          a = invoke(c, "load", { ...Q });
        let fresh;
        if (action === "replace")
          fresh = await begin(c, { ...Q, text: "B68-other" });
        else if (action === "reload") fresh = await begin(c, Q, "reload");
        else if (action === "dispose") c.m.dispose();
        else await success(invoke(c, action));
        for (const o of [t.o, a])
          await failure(o, action === "dispose" ? "disposed" : "cancelled");
        const s = c.m.state;
        c.wire.ok(t.q, refs());
        await tick();
        assert.equal(c.m.state, s);
        assert.equal(Object.hasOwn(s, "reply"), false);
        if (fresh) await finish(c, fresh, []);
      }),
  );
for (const phase of ["failed", "cancelled"])
  add(
    "retry-" + phase,
    { phase },
    "raw SDK error/rejection and frozen own diagnostic, no fake result; same target retries once",
    () =>
      using(async (c) => {
        const t = await begin(c);
        c.wire.fail(t.q, phase === "failed" ? "bad_request" : "cancelled");
        const e = await failure(
          t.o,
          phase === "failed" ? "bad_request" : "cancelled",
        );
        assert.equal(e, calls(c).at(-1).error);
        state(c, phase);
        assert.equal(c.m.state.error.code, e.code);
        assert.equal(c.m.state.error.origin, e.origin);
        await finish(c, await begin(c), []);
      }),
  );
add(
  "reload-replaces-success",
  {},
  "reload always new task/query clears prior reply; old frozen Reply remains readable",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      const old = c.m.state.reply,
        t = await begin(c, Q, "reload");
      assert.equal(Object.hasOwn(c.m.state, "reply"), false);
      assert.deepEqual(old.result, refs());
      await finish(c, t, []);
      assert.notEqual(c.m.state.reply, old);
    }),
);
add(
  "shared-sdk",
  {},
  "cancel own task preserves other model/direct same-target SDK, dispose doesn't close client",
  () =>
    using(async (c) => {
      const t = await begin(c),
        m = c.newModel(),
        a = track(c, m.load(Q)),
        p = c.client.resolvePath(Q.text);
      p.catch(() => {});
      await success(invoke(c, "cancel"));
      await failure(t.o, "cancelled");
      c.wire.ok(t.q, refs());
      await success(a);
      assert.deepEqual((await p).result, refs());
      assert.equal(m.state.status, "success");
      c.m.dispose();
      await sdkAlive(c);
    }),
);
add(
  "subscriptions",
  {},
  "independent duplicate registration/idempotent unsubscribe; no replay and notification snapshot order",
  () =>
    using(async (c) => {
      const seen = [],
        f = () => seen.push("x"),
        a = c.m.subscribe(f),
        b = c.m.subscribe(f);
      assert.deepEqual(seen, []);
      await finish(c, await begin(c), []);
      assert.deepEqual(seen, ["x", "x", "x", "x"]);
      a();
      a();
      seen.length = 0;
      await success(invoke(c, "clear"));
      assert.deepEqual(seen, ["x"]);
      b();
      let late, off;
      const order = [];
      c.m.subscribe(() => {
        order.push("first");
        off();
        late ??= c.m.subscribe(() => order.push("late"));
      });
      off = c.m.subscribe(() => order.push("removed"));
      await finish(c, await begin(c), []);
      assert.deepEqual(order, ["first", "first", "late"]);
      late();
    }),
);
for (const phase of ["pending", "success", "failed", "cancelled"])
  add(
    "notify-error-" + phase,
    { phase },
    "continue original listener order; committed state not rolled back; command AggregateError retains raw listener errors",
    () =>
      using(async (c) => {
        const a = { B: "a" },
          b = { B: "b" },
          seen = [];
        for (const [n, e] of [
          ["a", a],
          ["middle", null],
          ["b", b],
        ])
          c.m.subscribe(() => {
            if (c.m.state.status === phase) {
              seen.push(n);
              if (e) throw e;
            }
          });
        const t = await begin(c);
        if (["pending", "success"].includes(phase)) c.wire.ok(t.q, []);
        else c.wire.fail(t.q, phase === "failed" ? "bad_request" : "cancelled");
        const e = await failure(t.o);
        assert(e instanceof AggregateError);
        assert.deepEqual(e.errors, [a, b]);
        assert.deepEqual(seen, ["a", "middle", "b"]);
        state(c, phase === "pending" ? "success" : phase);
      }),
  );
add(
  "notify-reentrant",
  {},
  "all four commands reject reentrant_change before input read, outer task still succeeds",
  () =>
    using(async (c) => {
      const nested = [],
        n = { probes: 0 };
      c.m.subscribe(() => {
        if (c.m.state.status === "pending")
          for (const k of ["load", "reload", "cancel", "clear"])
            nested.push(invoke(c, k, opaque(n)));
      });
      const t = await begin(c);
      for (const o of nested) await failure(o, "reentrant_change");
      assert.equal(n.probes, 0);
      await finish(c, t, []);
    }),
);
for (const phase of ["pending", "success", "failed"])
  add(
    "notify-dispose-" + phase,
    { phase },
    "dispose in notification stops remaining listeners, unsettled command disposed and original failure cause retained",
    () =>
      using(async (c) => {
        let later = 0;
        c.m.subscribe(() => {
          if (c.m.state.status === phase) c.m.dispose();
        });
        c.m.subscribe(() => later++);
        const o = invoke(c, "load", Q);
        if (phase !== "pending") {
          const q = await c.wire.next("path.resolve");
          phase === "success"
            ? c.wire.ok(q, [])
            : c.wire.fail(q, "bad_request");
        }
        const e = await failure(o, "disposed");
        if (phase === "failed") assert.equal(e.cause, calls(c).at(-1).error);
        state(c, "idle", null);
        assert.equal(later, phase === "pending" ? 0 : 1);
        if (phase === "pending") assert.equal(calls(c).length, 0);
      }),
  );
add("listener-promise", {}, "listener return is not awaited", () =>
  using(async (c) => {
    c.m.subscribe(() => new Promise(() => {}));
    await finish(c, await begin(c), []);
  }),
);
for (const raw of [undefined, Object.freeze({ B: "raw" })])
  add(
    "unexpected-" + (raw === undefined ? "undefined" : "object"),
    { throwKind: typeof raw },
    "inconsistent_reply original cause, path_resolution origin, own empty frozen diagnostic",
    () =>
      using(async (c) => {
        c.client.resolvePath = () => {
          throw raw;
        };
        const e = await failure(invoke(c, "load", Q), "inconsistent_reply");
        local(e, "inconsistent_reply");
        assert(Object.hasOwn(e, "cause"));
        assert.equal(e.cause, raw);
        state(c, "failed");
        assert.equal(c.m.state.error.origin, "path_resolution");
        assert.deepEqual(c.m.state.error.data, {});
        assert(Object.isFrozen(c.m.state.error.data));
      }),
  );
add(
  "diagnostic-cycle",
  {},
  "original HierError rejection; frozen own diagnostic preserves aliases/cycles without freezing original",
  () =>
    using(async (c) => {
      const t = await begin(c),
        shared = { v: 1 },
        data = { a: shared, b: shared };
      data.self = data;
      const e = new sdk.HierError("transport_closed", "transport", "B68", data);
      c.wire.close(e);
      assert.equal(await failure(t.o), e);
      const f = c.m.state.error;
      assert.notEqual(f.data, data);
      assert.equal(f.data.a, f.data.b);
      assert.equal(f.data.self, f.data);
      assert(Object.isFrozen(f.data.a));
      assert.equal(Object.isFrozen(data), false);
    }),
);
for (const dispose of [false, true])
  add(
    "diagnostic-read-" + dispose,
    { dispose },
    "one data Get, dataIssue read-failed or disposed takeover retaining prior HierError",
    () =>
      using(async (c) => {
        const t = await begin(c),
          e = new sdk.HierError("transport_closed", "transport", "B68", {});
        let reads = 0;
        Object.defineProperty(e, "data", {
          get() {
            reads++;
            if (dispose) c.m.dispose();
            throw undefined;
          },
        });
        c.wire.close(e);
        const actual = await failure(t.o, dispose ? "disposed" : undefined);
        assert.equal(reads, 1);
        if (dispose) {
          assert.equal(actual.cause, e);
          state(c, "idle", null);
        } else {
          assert.equal(actual, e);
          assert.deepEqual(c.m.state.error.dataIssue, {
            code: "data_read_failed",
            operation: "read",
            path: [],
          });
          assert.deepEqual(c.m.state.error.data, {});
        }
      }),
  );
add(
  "disposed-commands",
  {},
  "disposed before hostile projection; async command errors, sync subscribe, held reply readable and SDK survives",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      const held = c.m.state.reply;
      c.m.dispose();
      const n = { probes: 0 };
      for (const k of ["load", "reload", "cancel", "clear"])
        local(await failure(invoke(c, k, opaque(n)), "disposed"), "disposed");
      assert.equal(n.probes, 0);
      assert.throws(
        () => c.m.subscribe(() => {}),
        (e) => e.code === "disposed",
      );
      assert.deepEqual(held.result, refs());
      await sdkAlive(c);
    }),
);
