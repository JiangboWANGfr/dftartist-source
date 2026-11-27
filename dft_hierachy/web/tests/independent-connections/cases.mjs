import assert from "node:assert/strict";
import {
  using,
  context,
  vm,
  target,
  object,
  endpoints,
  partial,
  complete,
  deep,
  tick,
  invoke,
  success,
  failure,
  begin,
  second,
  finish,
  modelError,
  HierError,
  snapshotProbe,
  closeWith,
  opaque,
} from "./harness.mjs";
export const cases = [];
const add = (
  id,
  input,
  expected,
  run,
  basis = "DESIGN 6.20.1–4; 6.9.3–4; 6.10.4",
) => cases.push({ id, input, expected, basis, run });
add(
  "OC-init",
  "ready SDK; repeated getters, no-op commands",
  "idle frozen stable state, snapshot fixed, zero queries/index subscriptions",
  () =>
    using(async (c) => {
      const s = c.m.state;
      assert.deepEqual(s, { status: "idle", target: null });
      deep(s);
      assert.equal(c.m.snapshotId, c.snap.snapshotId);
      assert.equal(c.m.disposed, false);
      for (const m of ["reload", "cancel", "clear"])
        await success(invoke(c, m));
      assert.equal(c.m.state, s);
      assert.equal(c.calls.length, 0);
      assert.equal(c.events.length, 0);
      assert.equal(c.indexRegistrations, 0);
    }),
);
add(
  "OC-not-ready",
  "constructor before hello",
  "synchronously rethrows error from its own SDK snapshot read",
  () =>
    using(
      async (c) => {
        const p = snapshotProbe(c.client);
        try {
          let got;
          assert.throws(() => {
            try {
              c.newModel();
            } catch (e) {
              got = e;
              throw e;
            }
          });
          assert.equal(p.errors.length, 1);
          assert.equal(got, p.errors[0]);
          assert.equal(c.calls.length, 0);
        } finally {
          p.restore();
        }
      },
      { withModel: false, ready: false },
    ),
);
for (const order of ["drivers", "loads"])
  for (const states of [
    "complete/complete",
    "partial/complete",
    "complete/partial",
    "partial/partial",
  ]) {
    add(
      "OC-atomic-" + order + "-" + states,
      "three SDK replies; " + order + " first; " + states,
      "single success, original replies, independent completeness/reasons/endpoint coordinates",
      () =>
        using(async (c) => {
          const x = await begin(
            c,
            target("B-conn-signal", {
              slice: { ref: "B-conn-signal", bits: { lsb: 1, width: 7 } },
            }),
          );
          const [d, l] = states.split("/");
          await finish(c, x, {
            order,
            dc: d === "partial" ? partial() : complete,
            lc: l === "partial" ? partial("interface_port") : complete,
          });
          assert.deepEqual(
            c.events.map((s) => s.status),
            ["pending", "success"],
          );
        }),
    );
  }
for (const status of ["complete", "partial"])
  add(
    "OC-empty-" + status,
    "empty driver/load arrays with " + status,
    "success preserves empty array and exact completeness, no automatic refresh",
    () =>
      using(async (c) => {
        const x = await begin(c);
        await finish(c, x, {
          drivers: [],
          loads: [],
          dc: status === "partial" ? partial() : complete,
        });
        const s = c.m.state,
          n = c.calls.length,
          e = c.events.length;
        await success(invoke(c, "load", target()));
        c.wire.emit({ event: "index.ready", snapshotId: c.snap.snapshotId });
        await tick();
        assert.equal(c.m.state, s);
        assert.equal(c.calls.length, n);
        assert.equal(c.events.length, e);
        assert.equal(c.indexRegistrations, 0);
      }),
  );
add(
  "OC-object-mismatch",
  "obj.get ref differs",
  "inconsistent_reply, no connections, frozen connections diagnostic",
  () =>
    using(async (c) => {
      const x = await begin(c);
      c.wire.ok(x.q, object("B-other"));
      const e = await failure(x.o, "inconsistent_reply");
      modelError(e, "inconsistent_reply");
      assert.equal(c.calls.length, 1);
      assert.equal(c.m.state.status, "failed");
      assert.equal(c.m.state.error.origin, "connections");
      assert.deepEqual(c.m.state.error.data, {});
      deep(c.m.state);
    }),
);
const invalid = [
  ["null", () => null],
  ["array", () => []],
  ["primitive", () => false],
  ["missing-slice", () => ({ reach: "local" })],
  [
    "inherited-slice",
    () =>
      Object.assign(Object.create({ slice: { ref: "B" } }), { reach: "local" }),
  ],
  ["slice-null", () => target("B", { slice: null })],
  ["slice-array", () => target("B", { slice: [] })],
  ["missing-ref", () => target("B", { slice: {} })],
  ["inherited-ref", () => target("B", { slice: Object.create({ ref: "B" }) })],
  ["empty-ref", () => target("")],
  ["boxed-ref", () => target(new String("B"))],
  ["missing-reach", () => ({ slice: { ref: "B" } })],
  ["reach-undefined", () => target("B", { reach: undefined })],
  ["reach-null", () => target("B", { reach: null })],
  ["reach-invalid", () => target("B", { reach: "global" })],
  ["side-undefined", () => target("B", { side: undefined })],
  ["side-null", () => target("B", { side: null })],
  ["side-invalid", () => target("B", { side: "both" })],
  [
    "bits-undefined",
    () => target("B", { slice: { ref: "B", bits: undefined } }),
  ],
  ["bits-null", () => target("B", { slice: { ref: "B", bits: null } })],
  ["bits-array", () => target("B", { slice: { ref: "B", bits: [] } })],
  ...[
    ["lsb", -1],
    ["lsb", 0.5],
    ["lsb", NaN],
    ["lsb", Infinity],
    ["lsb", Number.MAX_SAFE_INTEGER + 1],
    ["width", 0],
    ["width", -1],
    ["width", 0.5],
    ["width", NaN],
    ["width", Infinity],
    ["width", Number.MAX_SAFE_INTEGER + 1],
    ["width", undefined],
  ].map(([k, v], i) => [
    "bits-number-" + i,
    () =>
      target("B", { slice: { ref: "B", bits: { lsb: 0, width: 1, [k]: v } } }),
  ]),
];
for (const [id, make] of invalid)
  add(
    "OC-invalid-" + id,
    id + " during valid obj.get pending",
    "Promise invalid_argument, no state/request/abort changes; old task completes",
    () =>
      using(async (c) => {
        const x = await begin(c),
          s = c.m.state,
          n = c.calls.length;
        modelError(
          await failure(invoke(c, "load", make()), "invalid_argument"),
          "invalid_argument",
        );
        assert.equal(c.m.state, s);
        assert.equal(c.calls.length, n);
        assert.equal(c.calls[0].args[1].aborted, false);
        await finish(c, x);
      }),
  );
add(
  "OC-capture-order",
  "Proxy descriptors/Get on declared fields, unknown/inherited traps",
  "root then slice then bits once; no enumeration/unknown/coercion; frozen own copy",
  () =>
    using(async (c) => {
      const seen = [];
      const wrap = (name, v) =>
        new Proxy(v, {
          getOwnPropertyDescriptor(o, k) {
            seen.push(name + ".d:" + String(k));
            return Reflect.getOwnPropertyDescriptor(o, k);
          },
          get(o, k, r) {
            seen.push(name + ".g:" + String(k));
            return Reflect.get(o, k, r);
          },
          ownKeys() {
            throw Error("must not enumerate");
          },
        });
      const bits = wrap("bits", { lsb: 0, width: 2 }),
        slice = wrap("slice", { ref: "B-conn-signal", bits }),
        t = wrap("root", { slice, reach: "hier", side: "inside" });
      const o = invoke(c, "load", t),
        q = await c.wire.next("obj.get"),
        x = { o, q, target: c.m.state.target };
      assert.deepEqual(seen, [
        "root.d:slice",
        "root.g:slice",
        "root.d:reach",
        "root.g:reach",
        "root.d:side",
        "root.g:side",
        "slice.d:ref",
        "slice.g:ref",
        "slice.d:bits",
        "slice.g:bits",
        "bits.d:lsb",
        "bits.g:lsb",
        "bits.d:width",
        "bits.g:width",
      ]);
      assert.notEqual(x.target, t);
      assert.notEqual(x.target.slice, slice);
      assert.notEqual(x.target.slice.bits, bits);
      await finish(c, x);
    }),
);
add(
  "OC-capture-before-validation",
  "bad ref plus valid later getters",
  "all shape-readable fields captured before primitive validation; no coercion",
  () =>
    using(async (c) => {
      const seen = [],
        bad = {
          toString() {
            throw Error("coercion");
          },
          valueOf() {
            throw Error("coercion");
          },
        };
      const t = {
        get slice() {
          seen.push("slice");
          return {
            get ref() {
              seen.push("ref");
              return bad;
            },
            get bits() {
              seen.push("bits");
              return {
                get lsb() {
                  seen.push("lsb");
                  return 0;
                },
                get width() {
                  seen.push("width");
                  return 1;
                },
              };
            },
          };
        },
        get reach() {
          seen.push("reach");
          return "local";
        },
        get side() {
          seen.push("side");
          return "inside";
        },
      };
      await failure(invoke(c, "load", t), "invalid_argument");
      assert.deepEqual(seen, [
        "slice",
        "reach",
        "side",
        "ref",
        "bits",
        "lsb",
        "width",
      ]);
      assert.equal(c.calls.length, 0);
    }),
);
add(
  "OC-capture-detach",
  "mutate input after load; inherited optional fields",
  "own fields only; captured target frozen, caller untouched; original target in all states",
  () =>
    using(async (c) => {
      const bits = { lsb: -0, width: 2 },
        slice = { ref: "B-conn-signal", bits },
        t = { slice, reach: "local" };
      Object.setPrototypeOf(t, { side: "outside" });
      const o = invoke(c, "load", t),
        published = c.m.state.target;
      assert.equal("side" in published, false);
      assert.equal(Object.isFrozen(t), false);
      deep(published);
      t.reach = "hier";
      slice.ref = "B-mutated";
      bits.width = 9;
      const q = await c.wire.next("obj.get");
      assert.equal(q.params.ref, "B-conn-signal");
      await finish(c, { o, q, target: published });
      assert.equal(c.m.state.target, published);
    }),
);
for (const value of ["undefined", "null", "false", "proxy"])
  add(
    "OC-input-throw-" + value,
    "declared getter throws " + value,
    "invalid_argument cause exact uninspected thrown value",
    () =>
      using(async (c) => {
        const counts = { probes: 0 },
          thrown = opaque(value, counts);
        const t = {
          get slice() {
            throw thrown;
          },
        };
        const e = await failure(invoke(c, "load", t), "invalid_argument");
        assert.ok(Object.hasOwn(e, "cause"));
        assert.equal(Object.is(e.cause, thrown), true);
        assert.equal(counts.probes, 0);
        assert.equal(c.calls.length, 0);
      }),
  );
for (const throwing of [false, true])
  add(
    "OC-input-dispose-" + throwing,
    "slice getter disposes" + (throwing ? " and throws marker" : ""),
    "disposed stops next reads; cause only if actual throw",
    () =>
      using(async (c) => {
        const marker = Object.freeze({ input: "throw" });
        let later = 0;
        const t = {
          get slice() {
            c.m.dispose();
            if (throwing) throw marker;
            return { ref: "B" };
          },
          get reach() {
            later++;
            return "local";
          },
        };
        const e = await failure(invoke(c, "load", t), "disposed");
        assert.equal(later, 0);
        assert.equal(Object.hasOwn(e, "cause"), throwing);
        if (throwing) assert.equal(e.cause, marker);
        assert.equal(c.calls.length, 0);
        assert.deepEqual(c.m.state, { status: "idle", target: null });
      }),
  );
add(
  "OC-input-reentry",
  "slice getter reenters every command including invalid load",
  "reentrant_change without reading nested input; outer load succeeds",
  () =>
    using(async (c) => {
      const nested = [];
      let reads = 0;
      const t = target();
      Object.defineProperty(t, "slice", {
        enumerable: true,
        get() {
          for (const name of ["load", "reload", "cancel", "clear"])
            nested.push(
              invoke(c, name, {
                get slice() {
                  reads++;
                  throw Error("no nested read");
                },
              }),
            );
          return { ref: "B-conn-signal" };
        },
      });
      const o = invoke(c, "load", t),
        q = await c.wire.next("obj.get");
      for (const p of nested) await failure(p, "reentrant_change");
      assert.equal(reads, 0);
      await finish(c, { o, q, target: c.m.state.target });
    }),
);
add(
  "OC-safe-integer-domain",
  "MAX_SAFE bits, both sides, opaque non-signal ref",
  "L6 forwards structure without width/object/side domain inference; Core error stays original",
  () =>
    using(async (c) => {
      const t = target("opaque instance-looking", {
        slice: {
          ref: "opaque instance-looking",
          bits: {
            lsb: Number.MAX_SAFE_INTEGER,
            width: Number.MAX_SAFE_INTEGER,
          },
        },
        reach: "hier",
        side: "outside",
      });
      const x = await begin(c, t),
        y = await second(c, x, object(t.slice.ref, "instance"));
      c.wire.fail(y.d, "bad_request", "B domain reject", {
        reason: "B-domain",
      });
      const e = await failure(y.o, "bad_request", "core");
      assert.equal(e, c.calls[1].error);
      assert.equal(c.calls.length, 3);
      assert.equal(c.calls[0].args[1].aborted, true);
      assert.equal(c.m.state.status, "failed");
    }),
);
add(
  "OC-join",
  "two equal cloned targets while pending",
  "single task/queries; both commands settle once",
  () =>
    using(async (c) => {
      const x = await begin(c),
        other = invoke(c, "load", structuredClone(target()));
      assert.equal(c.calls.length, 1);
      await finish(c, x);
      await success(other);
    }),
);
for (const change of ["ref", "reach", "side", "bits"])
  add(
    "OC-new-target-" + change,
    "different " + change + " after obj.get start",
    "old joined commands cancelled, no old cancelled state; late old reply ignored",
    () =>
      using(async (c) => {
        const x = await begin(c),
          join = invoke(c, "load", target());
        const t =
          change === "ref"
            ? target("B-other")
            : change === "reach"
              ? target("B-conn-signal", { reach: "hier" })
              : change === "side"
                ? target("B-conn-signal", { side: "inside" })
                : target("B-conn-signal", {
                    slice: { ref: "B-conn-signal", bits: { lsb: 0, width: 1 } },
                  });
        const o = invoke(c, "load", t),
          q = await c.wire.next("obj.get");
        await failure(x.o, "cancelled");
        await failure(join, "cancelled");
        assert.equal(
          c.events.filter((s) => s.status === "cancelled").length,
          0,
        );
        c.wire.ok(x.q, object());
        await tick();
        assert.equal(c.m.state.status, "pending");
        await finish(c, { o, q, target: c.m.state.target });
      }),
  );
add(
  "OC-reload-success",
  "reload after success",
  "explicit new SDK method calls; same target, not implied three wire/cache clearing",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      const old = c.m.state,
        n = c.calls.length,
        o = invoke(c, "reload"),
        q = await c.wire.next("obj.get");
      assert.equal(c.calls.length, n + 1);
      await finish(c, { o, q, target: c.m.state.target });
      deep(old);
      assert.notEqual(c.m.state, old);
    }),
);
add(
  "OC-reload-pending",
  "reload while object pending",
  "replaces rather than joins old task",
  () =>
    using(async (c) => {
      const x = await begin(c),
        o = invoke(c, "reload"),
        q = await c.wire.next("obj.get");
      await failure(x.o, "cancelled");
      await finish(c, { o, q, target: c.m.state.target });
    }),
);
for (const action of ["cancel", "clear"])
  add(
    "OC-" + action,
    "action during connection stage; late replies; retry",
    "settled cancelled old task, one action state, action succeeds; retry legal",
    () =>
      using(async (c) => {
        const x = await second(c, await begin(c));
        await success(invoke(c, action));
        await failure(x.o, "cancelled");
        const s = c.m.state;
        assert.equal(s.status, action === "cancel" ? "cancelled" : "idle");
        assert.equal(c.calls[0].args[1].aborted, true);
        c.wire.ok(x.d, endpoints());
        c.wire.ok(x.l, []);
        await tick();
        assert.equal(c.m.state, s);
        c.calls = [];
        await finish(c, await begin(c));
      }),
  );
for (const method of ["object", "drivers", "loads"])
  add(
    "OC-error-" + method,
    "Core error in " + method,
    "original error identity, terminal diagnostic, sibling abort, no partial data, explicit retry",
    () =>
      using(async (c) => {
        let x = await begin(c);
        if (method !== "object") x = await second(c, x);
        const q = method === "object" ? x.q : method === "drivers" ? x.d : x.l;
        c.wire.fail(q, "bad_request", "B failure", {
          nested: { value: [1, "保留"] },
        });
        const e = await failure(x.o, "bad_request", "core");
        assert.equal(e, c.calls.find((call) => call.method === method).error);
        assert.equal(c.m.state.status, "failed");
        assert.equal("data" in c.m.state, false);
        assert.deepEqual(c.m.state.error.data, e.data);
        deep(c.m.state);
        assert.equal(c.calls[0].args[1].aborted, true);
        c.calls = [];
        await finish(c, await begin(c));
      }),
  );
add(
  "OC-sdk-cancelled",
  "Core code cancelled",
  "cancelled not failed, original SDK error remains command rejection",
  () =>
    using(async (c) => {
      const x = await begin(c);
      c.wire.fail(x.q, "cancelled");
      const e = await failure(x.o, "cancelled", "core");
      assert.equal(e, c.calls[0].error);
      assert.equal(c.m.state.status, "cancelled");
    }),
);
add(
  "OC-object-partial",
  "partial reply for complete-only obj.get",
  "real SDK protocol_error; no connections or model success",
  () =>
    using(async (c) => {
      const x = await begin(c);
      c.wire.ok(x.q, object(), partial());
      await failure(x.o, "protocol_error", "client");
      assert.equal(c.m.state.status, "failed");
      assert.equal(c.calls.length, 1);
    }),
);
add(
  "OC-shared-sdk",
  "direct SDK object subscriber and another model share query",
  "dispose only own subscriptions; other/direct consumers complete; SDK remains live",
  () =>
    using(async (c) => {
      const direct = c.client.object("B-conn-signal"),
        x = await begin(c),
        other = c.newModel(),
        p = other.load(target());
      p.catch(() => {});
      c.m.dispose();
      await failure(x.o, "disposed");
      c.wire.ok(x.q, object());
      await direct;
      const d = await c.wire.next("conn.drivers"),
        l = await c.wire.next("conn.loads");
      c.wire.ok(d, []);
      c.wire.ok(l, []);
      await p;
      assert.equal(other.state.status, "success");
      assert.equal(c.wire.closed, false);
      assert.deepEqual(c.m.state, { status: "idle", target: null });
    }),
);
add(
  "OC-notification-order",
  "listeners unsubscribe later, register new, duplicate registration",
  "ordered snapshot, independent registrations, no replay, new listener next batch",
  () =>
    using(async (c) => {
      const seen = [];
      let off;
      const twice = () => seen.push("twice");
      c.m.subscribe(() => {
        seen.push("first");
        off();
        c.m.subscribe(() => seen.push("late"));
      });
      off = c.m.subscribe(() => seen.push("removed"));
      c.m.subscribe(twice);
      c.m.subscribe(twice);
      assert.deepEqual(seen, []);
      const x = await begin(c);
      assert.deepEqual(seen, ["first", "twice", "twice"]);
      await finish(c, x);
      assert.deepEqual(seen, [
        "first",
        "twice",
        "twice",
        "first",
        "twice",
        "twice",
        "late",
      ]);
    }),
);
add(
  "OC-notification-errors",
  "pending and success listeners throw original opaque markers",
  "state success, both joined commands AggregateError ordered original values",
  () =>
    using(async (c) => {
      const a = Object.freeze({ a: 1 }),
        b = Object.freeze({ b: 2 });
      c.m.subscribe(() => {
        throw c.m.state.status === "pending" ? a : b;
      });
      const x = await begin(c),
        join = invoke(c, "load", target());
      const y = await second(c, x);
      c.wire.ok(y.d, []);
      c.wire.ok(y.l, []);
      for (const o of [x.o, join]) {
        const e = await failure(o);
        assert.ok(e instanceof AggregateError);
        assert.deepEqual(e.errors, [a, b]);
        assert.equal("cause" in e, false);
      }
      assert.equal(c.m.state.status, "success");
    }),
);
add(
  "OC-notification-reentry",
  "every command invoked from pending listener",
  "reentrant_change before argument reads, outer task succeeds",
  () =>
    using(async (c) => {
      const nested = [];
      let reads = 0;
      c.m.subscribe(() => {
        if (c.m.state.status === "pending")
          for (const name of ["load", "reload", "cancel", "clear"])
            nested.push(
              invoke(c, name, {
                get slice() {
                  reads++;
                  throw Error("unread");
                },
              }),
            );
      });
      const x = await begin(c);
      for (const p of nested) await failure(p, "reentrant_change");
      assert.equal(reads, 0);
      await finish(c, x);
    }),
);
for (const stage of ["pending", "success"])
  add(
    "OC-dispose-" + stage,
    "dispose in " + stage + " notification",
    "unsettled command disposed, no later listener/query/state revival",
    () =>
      using(async (c) => {
        let after = 0;
        c.m.subscribe(() => {
          if (c.m.state.status === stage) c.m.dispose();
        });
        c.m.subscribe(() => after++);
        const o = invoke(c, "load", target());
        if (stage === "success") {
          const q = await c.wire.next("obj.get"),
            x = await second(c, { o, q, target: c.m.state.target });
          c.wire.ok(x.d, []);
          c.wire.ok(x.l, []);
        }
        await failure(o, "disposed");
        assert.equal(after, stage === "pending" ? 0 : 1);
        assert.equal(c.calls.length, stage === "pending" ? 0 : 3);
        assert.deepEqual(c.m.state, { status: "idle", target: null });
      }),
  );
for (const action of ["cancel", "clear"])
  add(
    "OC-action-dispose-" + action,
    "action notification disposes old pending joined task",
    "dispose owns all unsettled commands; old cancelled cause retained",
    () =>
      using(async (c) => {
        const x = await begin(c),
          join = invoke(c, "load", target());
        c.m.subscribe(() => {
          if (c.m.state.status !== "pending") c.m.dispose();
        });
        const a = invoke(c, action);
        for (const o of [x.o, join]) {
          const e = await failure(o, "disposed");
          assert.equal(e.cause.code, "cancelled");
        }
        await failure(a, "disposed");
        assert.deepEqual(c.m.state, { status: "idle", target: null });
      }),
  );
add(
  "OC-diagnostic-copy",
  "HierError with cyclic/shared diagnostic data",
  "original error; own frozen graph, no caller freeze; old diagnostic stable",
  () =>
    using(async (c) => {
      const shared = { v: 1 },
        data = { a: shared, b: shared };
      data.self = data;
      const e = new HierError(
        "transport_closed",
        "transport",
        "B diagnostic",
        data,
      );
      const x = await begin(c);
      closeWith(c, e);
      assert.equal(await failure(x.o), e);
      const d = c.m.state.error.data;
      assert.notEqual(d, data);
      assert.equal(d.self, d);
      assert.equal(d.a, d.b);
      deep(d);
      assert.equal(Object.isFrozen(data), false);
      shared.v = 2;
      assert.equal(d.a.v, 1);
    }),
);
add(
  "OC-diagnostic-read-failure",
  "nested enumerable getter throws opaque marker",
  "original HierError; empty frozen data with exact dataIssue; stop reads",
  () =>
    using(async (c) => {
      let later = 0;
      const marker = opaque("proxy"),
        data = {
          nested: {
            get bad() {
              throw marker;
            },
            get later() {
              later++;
              return 1;
            },
          },
        },
        e = new HierError("transport_closed", "transport", "B read", data);
      const x = await begin(c);
      closeWith(c, e);
      assert.equal(await failure(x.o), e);
      assert.deepEqual(c.m.state.error.data, {});
      assert.deepEqual(c.m.state.error.dataIssue, {
        code: "data_read_failed",
        operation: "read",
        path: ["nested", "bad"],
      });
      assert.equal(later, 0);
      deep(c.m.state.error);
    }),
);
add(
  "OC-diagnostic-dispose",
  "data getter disposes then throws",
  "disposed cause original registered SDK error; no failure/diagnostic resurrection",
  () =>
    using(async (c) => {
      const e = new HierError("transport_closed", "transport", "B dispose", {});
      Object.defineProperty(e, "data", {
        get() {
          c.m.dispose();
          throw opaque("proxy");
        },
      });
      const x = await begin(c);
      closeWith(c, e);
      const out = await failure(x.o, "disposed");
      assert.equal(out.cause, e);
      assert.deepEqual(c.m.state, { status: "idle", target: null });
    }),
);
add(
  "OC-disposed-boundary",
  "repeat dispose, invalid commands and subscribe",
  "async disposed first; subscribe sync disposed, stale unsubscribe idempotent, SDK borrowed",
  () =>
    using(async (c) => {
      const off = c.m.subscribe(() => {});
      c.m.dispose();
      c.m.dispose();
      off();
      off();
      for (const name of ["load", "reload", "cancel", "clear"])
        await failure(invoke(c, name, null), "disposed");
      assert.throws(
        () => c.m.subscribe(null),
        (e) => {
          modelError(e, "disposed");
          return true;
        },
      );
      assert.equal(c.wire.closed, false);
      assert.equal(c.m.snapshotId, c.snap.snapshotId);
    }),
);
