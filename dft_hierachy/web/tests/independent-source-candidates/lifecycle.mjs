import assert from "node:assert/strict";
import { add } from "./cases.mjs";
import {
  using,
  invoke,
  begin,
  finish,
  success,
  failure,
  local,
  state,
  Q,
  page,
  hit,
  vm,
  sdk,
  sdkAlive,
  tick,
  opaque,
} from "./harness.mjs";
add(
  "subscriptions",
  "notifications",
  { duplicate: true },
  "independent ordered registrations, no replay, skip removed, new registration next batch, old offs harmless after dispose",
  () =>
    using(async (c) => {
      const seen = [],
        fn = () => seen.push("duplicate"),
        a = c.m.subscribe(fn),
        b = c.m.subscribe(fn);
      let z,
        added = false;
      const first = c.m.subscribe(() => {
        seen.push("first");
        z();
        if (!added) {
          c.m.subscribe(() => seen.push("new"));
          added = true;
        }
      });
      z = c.m.subscribe(() => seen.push("removed"));
      assert.deepEqual(seen, []);
      const t = await begin(c);
      assert.deepEqual(seen, ["duplicate", "duplicate", "first"]);
      a();
      a();
      seen.length = 0;
      await finish(c, t);
      assert.deepEqual(seen, ["duplicate", "first", "new"]);
      first();
      b();
      z();
      assert.throws(
        () => c.m.subscribe(null),
        (e) =>
          e instanceof vm.SourceCandidatesError &&
          e.code === "invalid_argument",
      );
      c.m.dispose();
      a();
      b();
      z();
      assert.throws(
        () => c.m.subscribe(() => {}),
        (e) => e.code === "disposed",
      );
    }),
);
for (const phase of ["pending", "success", "failed", "cancelled"])
  add(
    "notify-throw-" + phase,
    "notifications",
    { phase },
    "continue listeners; error collection belongs all joined task callers; terminal state retained; failure/cancel cause original",
    () =>
      using(async (c) => {
        const thrown = [undefined, { B: "second" }],
          seen = [];
        c.m.subscribe(() => {
          if (c.m.state.status === phase) {
            seen.push(1);
            throw thrown[0];
          }
        });
        c.m.subscribe(() => {
          if (c.m.state.status === phase) {
            seen.push(2);
            throw thrown[1];
          }
        });
        c.m.subscribe(() => {
          if (c.m.state.status === phase) seen.push(3);
        });
        const t = await begin(c),
          a = invoke(c, "load", { ...Q }),
          b = invoke(c, "loadMore");
        if (phase === "failed" || phase === "cancelled")
          c.wire.fail(t.q, phase === "failed" ? "not_found" : "cancelled");
        else c.wire.ok(t.q, page());
        for (const o of [t.o, a, b]) {
          const e = await failure(o);
          assert.ok(e instanceof AggregateError);
          assert.deepEqual(e.errors, thrown);
          if (phase === "failed" || phase === "cancelled")
            assert.equal(e.cause, c.calls.at(-1).error);
          else assert.equal(Object.hasOwn(e, "cause"), false);
        }
        assert.deepEqual(seen, [1, 2, 3]);
        assert.equal(c.m.state.status, phase === "pending" ? "success" : phase);
      }),
  );
for (const phase of ["pending", "success", "failed"])
  for (const method of ["load", "loadMore", "reload", "cancel", "clear"])
    add(
      "notify-reentrant-" + phase + "-" + method,
      "notifications",
      { phase, method },
      "all command/no-op reentry rejects without reading input/query/state change; remaining listeners continue",
      () =>
        using(async (c) => {
          let nested,
            count = 0;
          const bad = opaque({ probes: 0 });
          c.m.subscribe(() => {
            if (c.m.state.status === phase) {
              count++;
              nested = invoke(c, method, bad);
            }
          });
          const t = await begin(c);
          if (phase === "failed") c.wire.fail(t.q);
          else c.wire.ok(t.q, page());
          if (phase === "failed") await failure(t.o, "not_found");
          else await success(t.o);
          assert.equal(count, 1);
          await failure(nested, "reentrant_change");
          assert.equal(c.calls.length, 1);
        }),
    );
for (const phase of ["pending", "success", "failed", "cancelled"])
  add(
    "notify-dispose-" + phase,
    "notifications",
    { phase },
    "dispose stops later listeners, idle, all unfulfilled task/joiner commands disposed with terminal cause; SDK borrowed survives",
    () =>
      using(async (c) => {
        let after = 0;
        c.m.subscribe(() => {
          if (c.m.state.status === phase) c.m.dispose();
        });
        c.m.subscribe(() => {
          after++;
        });
        const o = invoke(c, "load", Q);
        let a, q;
        if (phase !== "pending") {
          q = await c.wire.next("source.resolve");
          a = invoke(c, "loadMore");
          if (phase === "failed" || phase === "cancelled")
            c.wire.fail(q, phase === "failed" ? "not_found" : "cancelled");
          else c.wire.ok(q, page());
        }
        const e = await failure(o, "disposed");
        local(e, "disposed");
        if (a) await failure(a, "disposed");
        if (phase === "failed" || phase === "cancelled")
          assert.equal(e.cause, c.calls[0].error);
        else assert.equal(Object.hasOwn(e, "cause"), false);
        assert.equal(after, phase === "pending" ? 0 : 1);
        state(c, "idle", null);
        assert.equal(c.m.disposed, true);
        if (phase === "pending") assert.equal(c.wire.queries.length, 0);
        await sdkAlive(c);
      }),
  );
for (const action of ["cancel", "clear"])
  for (const prefix of [false, true])
    add(
      "action-dispose-" + action + "-" + prefix,
      "notifications",
      { action, prefix },
      "cancel/clear notification dispose takes old task+joiner+action; old cancelled cause preserved, no late revival",
      () =>
        using(async (c) => {
          if (prefix) await finish(c, await begin(c), page([hit()], "B-next"));
          const t = await begin(c, Q, prefix ? "loadMore" : "load"),
            join = invoke(c, "loadMore");
          c.m.subscribe(() => {
            if (
              c.m.state.status === (action === "cancel" ? "cancelled" : "idle")
            )
              c.m.dispose();
          });
          const act = invoke(c, action);
          for (const o of [t.o, join]) {
            const e = await failure(o, "disposed");
            local(e, "disposed");
            assert.equal(e.cause.code, "cancelled");
          }
          await failure(act, "disposed");
          state(c, "idle", null);
          const n = c.events.length;
          c.wire.ok(t.q, page([hit(10)]));
          await tick();
          assert.equal(c.events.length, n);
        }),
    );
for (const action of ["cancel", "clear"])
  add(
    "action-errors-" + action,
    "notifications",
    { action },
    "action notification errors not copied to old task; old pending error remains own aggregate with cancelled cause",
    () =>
      using(async (c) => {
        const pendingThrown = { B: "pending" },
          actionThrown = { B: "action" };
        c.m.subscribe(() => {
          if (c.m.state.status === "pending") throw pendingThrown;
          if (c.m.state.status === (action === "cancel" ? "cancelled" : "idle"))
            throw actionThrown;
        });
        const t = await begin(c),
          join = invoke(c, "loadMore"),
          a = invoke(c, action);
        for (const o of [t.o, join]) {
          const e = await failure(o);
          assert.ok(e instanceof AggregateError);
          assert.deepEqual(e.errors, [pendingThrown]);
          assert.equal(e.cause.code, "cancelled");
        }
        const e = await failure(a);
        assert.ok(e instanceof AggregateError);
        assert.deepEqual(e.errors, [actionThrown]);
      }),
  );
add(
  "listener-promise-not-awaited",
  "notifications",
  {},
  "pending Promise returned by observer does not delay query/final command",
  () =>
    using(async (c) => {
      c.m.subscribe(() => new Promise(() => {}));
      await finish(c, await begin(c));
    }),
);
for (const owners of ["direct", "model"])
  for (const action of ["cancel", "dispose"])
    add(
      "sharing-" + owners + "-" + action,
      "ownership",
      { owners, action },
      "shared wire call coalesces; only owner subscription cancelled; other SDK/model consumer survives; late owned reply no state",
      () =>
        using(async (c) => {
          const t = await begin(c);
          let other, model;
          if (owners === "direct") {
            other = c.client.resolveSource(
              { file: Q.file, line: Q.line },
              { limit: 200 },
            );
            other.catch(() => {});
          } else {
            model = c.newModel();
            other = model.load(Q);
            other.catch(() => {});
          }
          assert.equal(c.wire.queries.length, 1);
          if (action === "cancel") await success(invoke(c, "cancel"));
          else c.m.dispose();
          await failure(t.o, action === "cancel" ? "cancelled" : "disposed");
          assert.equal(c.wire.cancels.length, 0);
          const s = c.m.state;
          c.wire.ok(t.q, page());
          await other;
          assert.equal(c.m.state, s);
          if (model) {
            assert.equal(model.state.status, "success");
            assert.equal(model.disposed, false);
          }
          await sdkAlive(c);
        }),
    );
add(
  "reopen",
  "ownership",
  { snapshots: 2 },
  "new session/model explicit binding; disposed old model never rebinds; old frozen state remains readable",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      const old = c.m.state;
      c.m.dispose();
      await using(
        async (d) => {
          assert.equal(d.m.snapshotId, "B-new-snapshot");
          await failure(invoke(d, "load", Q), "snapshot_mismatch");
          await finish(
            d,
            await begin(d, { ...Q, snapshotId: "B-new-snapshot" }),
          );
        },
        { id: "B-new-snapshot" },
      );
      assert.deepEqual(old.query, Q);
      assert.equal(old.pages.length, 1);
      state(c, "idle", null);
      assert.equal(c.m.snapshotId, Q.snapshotId);
    }),
);
