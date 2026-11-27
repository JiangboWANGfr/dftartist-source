import assert from "node:assert/strict";
import { add } from "./cases.mjs";
import {
  using,
  invoke,
  begin,
  second,
  finish,
  success,
  failure,
  local,
  deep,
  span,
  read,
  tick,
  opaque,
  vm,
} from "./harness.mjs";

for (const stage of ["source", "readSource"]) {
  add(
    `SD-T-join-${stage}`,
    "tasks",
    `two load calls same pair during ${stage}`,
    "one model task, one SDK call per stage, all waiters once; success repeated pair no-op",
    () =>
      using(async (c) => {
        let t = await begin(c);
        if (stage === "readSource") t = await second(c, t);
        const before = c.m.state,
          n = c.calls.length,
          join = invoke(c, "load", t.ref, t.kind);
        assert.equal(c.m.state, before);
        assert.equal(c.calls.length, n);
        assert.equal(join.done, false);
        await finish(c, t);
        await success(join);
        const state = c.m.state,
          q = c.calls.length,
          events = c.events.length;
        await success(invoke(c, "load", t.ref, t.kind));
        assert.equal(c.m.state, state);
        assert.equal(c.calls.length, q);
        assert.equal(c.events.length, events);
      }),
  );
  for (const action of ["cancel", "clear", "dispose", "replace", "reload"])
    add(
      `SD-T-${action}-${stage}`,
      "tasks",
      `${stage} pending then ${action}, late old reply`,
      "all old waiters once cancelled/disposed; own cancellation only; no old publish/second call; reload/replace new pending without old cancelled",
      () =>
        using(async (c) => {
          let t = await begin(c);
          if (stage === "readSource") t = await second(c, t);
          const joined = invoke(c, "load", t.ref, t.kind),
            at = c.events.length;
          let next;
          if (action === "dispose") c.m.dispose();
          else if (action === "replace")
            next = invoke(c, "load", "B-other", "statement");
          else if (action === "reload") next = invoke(c, "reload");
          else await success(invoke(c, action));
          await failure(t.o, action === "dispose" ? "disposed" : "cancelled");
          await failure(
            joined,
            action === "dispose" ? "disposed" : "cancelled",
          );
          const state = c.m.state,
            reads = c.calls.filter((q) => q.method === "readSource").length;
          c.wire.ok(t.r ?? t.q, stage === "source" ? span() : read());
          await tick();
          assert.equal(c.m.state, state);
          assert.equal(
            c.calls.filter((q) => q.method === "readSource").length,
            reads,
          );
          assert.equal(c.calls[0].args[2].aborted, true);
          if (action === "replace" || action === "reload") {
            assert.deepEqual(
              c.events.slice(at).map((s) => s.status),
              ["pending"],
            );
            const q = await c.wire.next("obj.source");
            await finish(c, {
              o: next,
              q,
              ref: action === "replace" ? "B-other" : t.ref,
              kind: action === "replace" ? "statement" : t.kind,
            });
          } else if (action === "clear" || action === "dispose")
            assert.deepEqual(c.m.state, { status: "idle", target: null });
          else {
            assert.equal(c.m.state.status, "cancelled");
            assert.equal(c.m.state.error.origin, "source");
            assert.equal(Object.hasOwn(c.m.state, "data"), false);
          }
        }),
    );
  for (const action of ["clear", "cancel", "dispose", "replace"])
    add(
      `SD-T-queued-${stage}-${action}`,
      "tasks",
      `${stage} SDK reply already delivered synchronously then ${action} before Promise continuation`,
      "task identity guard stops queued old continuation, no second call/success revival",
      () =>
        using(async (c) => {
          let t = await begin(c);
          if (stage === "readSource") t = await second(c, t);
          c.wire.ok(t.r ?? t.q, stage === "source" ? span() : read());
          let replacement;
          if (action === "dispose") c.m.dispose();
          else if (action === "replace")
            replacement = invoke(c, "load", "B-next", "instantiation");
          else await success(invoke(c, action));
          await failure(t.o, action === "dispose" ? "disposed" : "cancelled");
          const before = c.m.state,
            n = c.calls.length;
          await tick();
          assert.equal(c.m.state, before);
          assert.equal(c.calls.length, n);
          if (replacement) {
            const q = await c.wire.next(
              "obj.source",
              (q) => q.params.ref === "B-next",
            );
            await finish(c, { o: replacement, q });
          }
        }),
    );
}
add(
  "SD-T-kind-replaces",
  "tasks",
  "same ref, different kind pending",
  "new pair replaces old task; no fallback or ref-only join",
  () =>
    using(async (c) => {
      const t = await begin(c),
        p = invoke(c, "load", t.ref, "instantiation");
      await failure(t.o, "cancelled");
      const q = await c.wire.next(
        "obj.source",
        (q) => q.params.kind === "instantiation",
      );
      await finish(c, { o: p, q });
      assert.deepEqual(c.m.state.target, { ref: t.ref, kind: "instantiation" });
    }),
);
for (const terminal of ["failed", "cancelled"])
  add(
    `SD-T-retry-${terminal}`,
    "tasks",
    `same target after ${terminal}`,
    "fresh task and both SDK methods; no sticky failed/cancelled no-op",
    () =>
      using(async (c) => {
        const t = await begin(c);
        if (terminal === "failed") {
          c.wire.fail(t.q);
          await failure(t.o, "not_found");
        } else {
          await success(invoke(c, "cancel"));
          await failure(t.o, "cancelled");
        }
        await finish(c, await begin(c));
        assert.equal(c.calls.filter((x) => x.method === "source").length, 2);
      }),
  );
add(
  "SD-T-success-reload",
  "tasks",
  "reload successful target, then same-target load",
  "forced two-method task; preserved old data; joined waiter settles; no implicit reload on index.ready",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      const old = c.m.state.data,
        n = c.calls.length;
      const o = invoke(c, "reload"),
        q = await c.wire.next("obj.source"),
        joined = invoke(c, "load", "B-object", "definition");
      const t = await second(c, { o, q });
      await finish(c, t, read("changed", "f".repeat(64), false));
      await success(joined);
      assert.equal(c.calls.length, n + 2);
      assert.equal(old.content.result.text, "abc");
      const state = c.m.state;
      c.wire.emit({ event: "index", state: "ready" });
      await tick();
      assert.equal(c.m.state, state);
      assert.equal(c.calls.length, n + 2);
      assert.equal(c.registrations, 0);
    }),
);
for (const mode of ["model", "direct"])
  for (const stage of ["source", "readSource"])
    add(
      `SD-T-shared-${mode}-${stage}`,
      "ownership",
      `second ${mode} shares SDK ${stage}; dispose first model`,
      "other consumer keeps original request alive, settles normally; borrowed SDK remains usable",
      () =>
        using(async (c) => {
          let t = await begin(c);
          if (stage === "readSource") t = await second(c, t);
          let other, m;
          if (mode === "model") {
            m = c.newModel();
            other = m.load(t.ref, t.kind);
            other.catch(() => {});
            if (stage === "readSource") {
              // source has no complete cache: second model needs a fresh stage1 but joins pending file read.
              const q = await c.wire.next("obj.source");
              c.wire.ok(q, span());
            }
            // Wait for the observed public call, not a same-stack/microtask assumption.
            await c.called(stage, 2);
          } else
            other =
              stage === "source"
                ? c.client.source(t.ref, t.kind)
                : c.client.readSource(t.span.file);
          const observed = other.then(
            (v) => ({ ok: true, v }),
            (e) => ({ ok: false, e }),
          );
          const cancels = c.wire.cancels.length;
          c.m.dispose();
          await failure(t.o, "disposed");
          assert.equal(c.wire.closed, false);
          assert.equal(c.wire.cancels.length, cancels);
          c.wire.ok(t.r ?? t.q, stage === "source" ? span() : read());
          if (mode === "model" && stage === "source") {
            const q = await c.wire.next("source.read");
            c.wire.ok(q, read());
          }
          const result = await observed;
          assert.equal(result.ok, true);
          if (m) assert.equal(m.state.status, "success");
          const live = c.client.readSource("B-independent-file"),
            q = await c.wire.next(
              "source.read",
              (q) => q.params.file === "B-independent-file",
            );
          c.wire.ok(q, read());
          await live;
        }),
    );
for (const method of ["load", "reload", "cancel", "clear"])
  add(
    `SD-D-command-${method}`,
    "dispose",
    `disposed model ${method} with opaque invalid args`,
    "Promise disposed before no-op/argument inspection, no SDK query or notify; repeated dispose silent",
    () =>
      using(async (c) => {
        const counts = { probes: 0 };
        c.m.dispose();
        const before = c.m.state,
          n = c.events.length;
        local(
          await failure(
            invoke(c, method, opaque(counts), opaque(counts)),
            "disposed",
          ),
          "disposed",
        );
        c.m.dispose();
        assert.equal(c.m.state, before);
        assert.equal(c.events.length, n);
        assert.equal(c.calls.length, 0);
        assert.equal(counts.probes, 0);
        assert.equal(c.m.disposed, true);
        deep(c.m.state);
      }),
  );
add(
  "SD-D-old-snapshot-new-client",
  "ownership",
  "two ready clients with same bare ref and different snapshot ids",
  "distinct fixed model snapshots; cannot reject coincident bare ref by supposed provenance",
  () =>
    using(async (c) =>
      using(
        async (d) => {
          assert.notEqual(c.m.snapshotId, d.m.snapshotId);
          await finish(c, await begin(c, "same", "definition"));
          await finish(d, await begin(d, "same", "definition"));
          c.m.dispose();
          assert.equal(d.m.disposed, false);
          assert.equal(c.client.snapshot.snapshotId, c.m.snapshotId);
        },
        { id: "B-new-snapshot" },
      ),
    ),
);

for (const invalid of [null, undefined, {}, false, "listener"])
  add(
    `SD-N-invalid-${String(invalid)}`,
    "notifications",
    `subscribe(${String(invalid)}) alive then disposed`,
    "synchronous invalid_argument alive, disposed wins after release; no registration",
    () =>
      using(async (c) => {
        assert.throws(
          () => c.m.subscribe(invalid),
          (e) => {
            local(e, "invalid_argument");
            return true;
          },
        );
        c.m.dispose();
        assert.throws(
          () => c.m.subscribe(invalid),
          (e) => {
            local(e, "disposed");
            return true;
          },
        );
      }),
  );
add(
  "SD-N-registration",
  "notifications",
  "duplicate listener; remove/readd/new registration during notification",
  "no replay, independent tokens, snapshot order, removed future skipped, new starts next batch, off idempotent",
  () =>
    using(async (c) => {
      const seen = [];
      let added = false,
        offFuture;
      const same = () => seen.push("same");
      const a = c.m.subscribe(same),
        b = c.m.subscribe(same);
      a();
      a();
      c.m.subscribe(() => {
        seen.push("first");
        offFuture();
        if (!added) {
          added = true;
          c.m.subscribe(() => seen.push("new"));
        }
      });
      offFuture = c.m.subscribe(() => seen.push("removed"));
      assert.deepEqual(seen, []);
      await finish(c, await begin(c));
      assert.deepEqual(seen, ["same", "first", "same", "first", "new"]);
      b();
      b();
      c.m.dispose();
      offFuture();
      a();
      b();
    }),
);
for (const phase of ["pending", "success", "failed", "cancelled"])
  add(
    `SD-N-throws-${phase}`,
    "notifications",
    `${phase} listeners throw undefined and marker; later listener runs; joiners`,
    "AggregateError preserves throw identity/order; terminal cause only on query/cancel; committed state retained",
    () =>
      using(async (c) => {
        const marker = Object.freeze({ B: "observer" });
        let calls = 0;
        c.m.subscribe(() => {
          if (c.m.state.status === phase) throw undefined;
        });
        c.m.subscribe(() => {
          if (c.m.state.status === phase) throw marker;
        });
        c.m.subscribe(() => {
          if (c.m.state.status === phase) calls++;
        });
        const t = await begin(c),
          joined = invoke(c, "load", t.ref, t.kind);
        if (phase === "failed") c.wire.fail(t.q);
        else if (phase === "cancelled") c.wire.fail(t.q, "cancelled");
        else {
          const u = await second(c, t);
          c.wire.ok(u.r, read());
        }
        for (const o of [t.o, joined]) {
          const e = await failure(o);
          assert.ok(e instanceof AggregateError);
          assert.equal(e.errors.length, 2);
          assert.equal(e.errors[0], undefined);
          assert.equal(e.errors[1], marker);
          if (phase === "failed" || phase === "cancelled")
            assert.equal(e.cause, c.calls[0].error);
          else assert.equal(Object.hasOwn(e, "cause"), false);
        }
        assert.equal(calls, 1);
        assert.equal(c.m.state.status, phase === "pending" ? "success" : phase);
      }),
  );
for (const method of ["load", "reload", "cancel", "clear"])
  for (const phase of ["pending", "success", "failed", "cancelled"])
    add(
      `SD-N-reentrant-${phase}-${method}`,
      "notifications",
      `${method} with opaque args inside ${phase} notification`,
      "Promise reentrant_change before argument read/no-op, outer task and data intact",
      () =>
        using(async (c) => {
          const probes = { probes: 0 },
            nested = [];
          c.m.subscribe(() => {
            if (c.m.state.status === phase)
              nested.push(invoke(c, method, opaque(probes), opaque(probes)));
          });
          const task = await begin(c);
          if (phase === "failed" || phase === "cancelled") {
            c.wire.fail(task.q, phase === "failed" ? "not_found" : "cancelled");
            await failure(
              task.o,
              phase === "failed" ? "not_found" : "cancelled",
            );
          } else await finish(c, task);
          assert.equal(nested.length, 1);
          await failure(nested[0], "reentrant_change");
          assert.equal(probes.probes, 0);
          assert.equal(
            c.calls.length,
            phase === "failed" || phase === "cancelled" ? 1 : 2,
          );
        }),
    );
for (const action of ["cancel", "clear"])
  add(
    `SD-N-own-${action}`,
    "notifications",
    `pending observer throws old marker, ${action} observer throws own marker`,
    "old task aggregate includes only old marker/cancelled cause; own command includes only own marker",
    () =>
      using(async (c) => {
        const old = { old: true },
          own = { own: true };
        c.m.subscribe(() => {
          if (c.m.state.status === "pending") throw old;
          else throw own;
        });
        const t = await begin(c),
          cancel = invoke(c, action);
        const a = await failure(t.o),
          b = await failure(cancel);
        assert.ok(a instanceof AggregateError);
        assert.deepEqual(a.errors, [old]);
        local(a.cause, "cancelled");
        assert.ok(b instanceof AggregateError);
        assert.deepEqual(b.errors, [own]);
        assert.equal(Object.hasOwn(b, "cause"), false);
      }),
  );
for (const phase of ["pending", "success", "failed", "cancelled"])
  add(
    `SD-D-notify-${phase}`,
    "dispose",
    `dispose in ${phase} listener; prior marker throw; later listener`,
    "disposed wins all unsettled commands, existing aggregate/original terminal preserved as cause; idle/no later listener",
    () =>
      using(async (c) => {
        const marker = { B: "dispose-before-settlement" };
        let later = 0;
        c.m.subscribe(() => {
          if (c.m.state.status === phase) throw marker;
        });
        c.m.subscribe(() => {
          if (c.m.state.status === phase) c.m.dispose();
        });
        c.m.subscribe(() => {
          if (c.m.disposed) later++;
        });
        // pending disposal must not send source, so do not wait for a query in that case.
        const o = invoke(c, "load", "B", "definition");
        if (phase !== "pending") {
          const q = await c.wire.next("obj.source");
          if (phase === "failed" || phase === "cancelled")
            c.wire.fail(q, phase === "failed" ? "not_found" : "cancelled");
          else {
            c.wire.ok(q, span());
            const r = await c.wire.next("source.read");
            c.wire.ok(r, read());
          }
        }
        const error = await failure(o, "disposed");
        local(error, "disposed");
        assert.ok(error.cause instanceof AggregateError);
        assert.deepEqual(error.cause.errors, [marker]);
        if (phase === "failed" || phase === "cancelled")
          assert.equal(error.cause.cause, c.calls[0].error);
        else assert.equal(Object.hasOwn(error.cause, "cause"), false);
        assert.equal(later, 0);
        assert.deepEqual(c.m.state, { status: "idle", target: null });
        if (phase === "pending") assert.equal(c.calls.length, 0);
      }),
  );
add(
  "SD-N-returned-promise",
  "notifications",
  "listener returns never-settled Promise",
  "listener return not awaited; model load still settles success",
  () =>
    using(async (c) => {
      c.m.subscribe(() => new Promise(() => {}));
      await finish(c, await begin(c));
    }),
);
add(
  "SD-N-unobserved-command",
  "notifications",
  "caller drops invalid/disposed command Promises",
  "model internally observes rejections without turning public Promise into success; runner verifies no background unhandledRejection",
  () =>
    using(async (c) => {
      c.m.load("", "definition");
      c.m.dispose();
      c.m.reload();
      await tick();
      await failure(invoke(c, "clear"), "disposed");
    }),
);
add(
  "SD-D-no-cause",
  "dispose",
  "dispose first-stage pending without prior errors",
  "disposed error has no own cause (not cause:undefined); no notification; SDK still open",
  () =>
    using(async (c) => {
      const t = await begin(c),
        n = c.events.length;
      c.m.dispose();
      const e = await failure(t.o, "disposed");
      assert.equal(Object.hasOwn(e, "cause"), false);
      assert.equal(c.events.length, n);
      assert.equal(c.wire.closed, false);
    }),
);
