import assert from "node:assert/strict";
import { add } from "./cases.mjs";
import {
  H,
  C,
  methods,
  using,
  call,
  ok,
  bad,
  navError,
  document,
  documentStart,
  documentReply,
  candidateStart,
  candidateFinish,
  ready,
  autoStart,
  autoFinish,
  partialBound,
  refreshed,
  turn,
  track,
  hit,
  snapshot,
  unchanged,
  noAuto,
} from "./harness.mjs";
import { hostile } from "./fixtures.mjs";
function aggregate(e, values, cause) {
  assert.ok(e instanceof AggregateError);
  assert.deepEqual(e.errors, values);
  if (arguments.length > 2) assert.equal(e.cause, cause);
  else assert.equal(Object.hasOwn(e, "cause"), false);
}
add(
  "subscribe-boundaries",
  "observers",
  "bad listeners, duplicate same callback and independent unsubscribe",
  "sync disposed before TypeError; registration no immediate call; each registration independent",
  () =>
    using(async (c) => {
      for (const v of [null, {}, 1, "B"])
        assert.throws(() => c.m.subscribe(v), TypeError);
      let n = 0;
      const fn = () => n++,
        a = c.m.subscribe(fn),
        b = c.m.subscribe(fn);
      assert.equal(n, 0);
      a();
      a();
      await document(c);
      assert.ok(n > 0);
      const old = n;
      b();
      await ok(call(c, "clear"));
      assert.equal(n, old);
      c.m.dispose();
      assert.throws(
        () => c.m.subscribe(null),
        (e) => e instanceof H.vm.SourceNavigationError && e.code === "disposed",
      );
    }),
);
add(
  "notification-snapshot",
  "observers",
  "A unsubscribes B and adds C during pending",
  "already removed listener not called, new registration starts next publication",
  () =>
    using(async (c) => {
      const log = [];
      let done = false,
        offB;
      c.m.subscribe(() => {
        log.push("A");
        if (!done) {
          done = true;
          offB();
          c.m.subscribe(() => log.push("C"));
        }
      });
      offB = c.m.subscribe(() => log.push("B"));
      const t = await documentStart(c);
      assert.deepEqual(log, ["A"]);
      await documentReply(c, t);
      await ok(t.o);
      assert.deepEqual(log, ["A", "A", "C"]);
    }),
);
add(
  "listener-return-not-awaited",
  "observers",
  "listener returns poisonous thenable",
  "do not Get then or await listener return",
  () =>
    using(async (c) => {
      let reads = 0;
      c.m.subscribe(() => ({
        get then() {
          reads++;
          throw Error("forbidden then");
        },
      }));
      await document(c);
      assert.equal(reads, 0);
    }),
);
for (const site of [
  "document-pending",
  "document-success",
  "candidate-pending",
  "candidate-success",
])
  for (const method of methods)
    add(
      "notify-reentrant-" + site + "-" + method,
      "reentrancy",
      { site, method },
      "outer Navigation reentrant_change Promise rejection before nested input probes or no-op",
      () =>
        using(async (c) => {
          let nested,
            reads = 0;
          const h = hostile();
          c.m.subscribe(() => {
            if (nested) return;
            const s = c.m.state;
            const at =
              site === "document-pending"
                ? s.document.status === "pending"
                : site === "document-success"
                  ? s.document.status === "success" && s.candidates === null
                  : site === "candidate-pending"
                    ? s.candidates?.state.status === "pending"
                    : s.candidates?.state.status === "success";
            if (at) {
              nested = call(
                c,
                method,
                ...(method === "load"
                  ? [h.value, h.value]
                  : method === "locate"
                    ? [h.value, h.value]
                    : []),
              );
              reads++;
            }
          });
          const d = await document(c);
          if (site.startsWith("candidate"))
            await candidateFinish(c, await candidateStart(c, d));
          assert.equal(reads, 1);
          navError(await bad(nested, "reentrant_change"), "reentrant_change");
          assert.equal(h.counts.probes, 0);
        }),
    );
for (const shape of ["primitive", "aggregate"])
  for (const source of ["document", "candidates"])
    add(
      "listener-aggregate-" + source + "-" + shape,
      "observer-errors",
      { source, shape },
      "one AggregateError in actual notification order, keep caller AggregateError as one value, success state not rolled back",
      () =>
        using(async (c) => {
          const d = source === "candidates" ? await document(c) : undefined,
            original =
              shape === "aggregate"
                ? new AggregateError(["inside"], "B nested")
                : undefined,
            values = [];
          c.m.subscribe(() => {
            values.push(original);
            throw original;
          });
          c.m.subscribe(() => {
            const v = "B-" + values.length;
            values.push(v);
            throw v;
          });
          const t =
            source === "document"
              ? await documentStart(c)
              : await candidateStart(c, d);
          if (source === "document") await documentReply(c, t);
          else c.wire.ok(t.q, C.page([hit()]));
          aggregate(await bad(t.o), values);
          assert.equal(
            source === "document"
              ? c.m.state.document.status
              : c.m.state.candidates.state.status,
            "success",
          );
        }),
    );
for (const source of ["document", "candidates"])
  add(
    "error-plus-observer-" + source,
    "observer-errors",
    source,
    "single aggregate cause original HierError, no implementation bridge nesting",
    () =>
      using(async (c) => {
        const d = source === "candidates" ? await document(c) : undefined,
          values = [];
        c.m.subscribe(() => {
          values.push("B-observer");
          throw "B-observer";
        });
        const t =
          source === "document"
            ? await documentStart(c)
            : await candidateStart(c, d);
        c.wire.fail(t.q, "not_found");
        const original = c.calls.findLast(
          (x) =>
            x.method === (source === "document" ? "source" : "resolveSource"),
        );
        const e = await bad(t.o);
        aggregate(e, values, original.error);
        assert.equal(
          source === "document"
            ? c.m.state.document.status
            : c.m.state.candidates.state.status,
          "failed",
        );
      }),
  );
for (const source of ["document", "candidates"])
  add(
    "joiners-notification-errors-" + source,
    "observer-errors",
    source,
    "each joined caller inherits whole task notification batch, not same error wrapper identity",
    () =>
      using(async (c) => {
        const d = source === "candidates" ? await document(c) : undefined,
          values = [];
        c.m.subscribe(() => {
          const v = "B-throw-" + values.length;
          values.push(v);
          throw v;
        });
        const t =
            source === "document"
              ? await documentStart(c)
              : await candidateStart(c, d),
          joined =
            source === "document"
              ? call(c, "load", "B-nav-target", "definition")
              : call(c, "locate", d, 0);
        if (source === "document") await documentReply(c, t);
        else c.wire.ok(t.q, C.page([hit()]));
        aggregate(await bad(t.o), values);
        aggregate(await bad(joined), values);
      }),
  );
add(
  "pure-coordination-error",
  "observer-errors",
  "completed refresh then cancelCandidates on success",
  "clearing visible handle notifies even child cancel no-op; error belongs to cancel command, state stays success",
  () =>
    using(async (c) => {
      const { d, a } = await refreshed(c),
        s = c.m.state.candidates.state,
        values = [];
      c.m.subscribe(() => {
        if (c.m.state.refresh === null) {
          values.push("B-pure");
          throw "B-pure";
        }
      });
      aggregate(await bad(call(c, "cancelCandidates")), values);
      assert.deepEqual(values, ["B-pure"]);
      assert.equal(c.m.state.candidates.state, s);
      assert.equal(c.m.state.document.data, d);
      assert.equal(c.m.state.refresh, null);
      await ok(a.o);
      ready(c);
      await noAuto(c);
    }),
);
add(
  "automatic-success-listener-failure",
  "completion-errors",
  "partial→ready→automatic success, listener throws",
  "completion rejects AggregateError despite candidates success; SDK ready callback/other subscribers unaffected",
  () =>
    using(async (c) => {
      await partialBound(c);
      let other = 0;
      const off = c.client.onIndexReady(() => other++),
        values = [];
      try {
        c.m.subscribe(() => {
          if (
            c.m.state.refresh &&
            c.m.state.candidates.state.status === "success"
          ) {
            values.push("B-auto-success");
            throw "B-auto-success";
          }
        });
        ready(c);
        const t = await autoStart(c);
        c.wire.ok(t.q, C.page([hit()]));
        aggregate(await bad(t.o), values);
        assert.equal(c.m.state.candidates.state.status, "success");
        assert.equal(c.m.state.refresh, t.r);
        assert.equal(other, 1);
      } finally {
        off();
      }
    }),
);
add(
  "automatic-query-plus-listener-failure",
  "completion-errors",
  "automatic query HierError and listener throw",
  "completion single aggregate cause original error; retained failed diagnostic, not synthetic Core failure",
  () =>
    using(async (c) => {
      await partialBound(c);
      const values = [];
      c.m.subscribe(() => {
        if (
          c.m.state.refresh &&
          c.m.state.candidates.state.status === "failed"
        ) {
          values.push("B-auto-fail");
          throw "B-auto-fail";
        }
      });
      ready(c);
      const t = await autoStart(c);
      c.wire.fail(t.q, "not_found");
      const e = await bad(t.o);
      aggregate(
        e,
        values,
        c.calls.findLast((x) => x.method === "resolveSource").error,
      );
      assert.equal(c.m.state.candidates.state.status, "failed");
    }),
);
for (const value of ["throw", "reject"])
  add(
    "automatic-public-call-" + value,
    "completion-errors",
    { fault: value },
    "public candidate reload unknown synchronous/rejected value settles visible bridge; no forged candidate failed",
    () =>
      using(async (c) => {
        await partialBound(c);
        const original = { B: "unknown" };
        await import("./harness.mjs").then(async ({ publicMethodFault }) =>
          publicMethodFault(
            H.vm.SourceCandidatesModel,
            "reload",
            function () {
              if (value === "throw") throw original;
              return Promise.reject(original);
            },
            async (assertInjected) => {
              ready(c);
              await turn();
              assertInjected();
              const r = c.m.state.refresh;
              assert.ok(r);
              assert.equal(await bad(track(c, r.completion)), original);
              assert.equal(c.m.state.candidates.state.status, "success");
            },
          ),
        );
      }),
  );
add(
  "automatic-internally-consumed",
  "completion-errors",
  "no host observer consumes rejected auto completion until later turn",
  "no unhandled rejection, but later public completion still rejects original error",
  () =>
    using(
      async (c) => {
        await partialBound(c);
        ready(c);
        const q = await c.wire.next("source.resolve"),
          r = c.m.state.refresh;
        c.wire.fail(q, "not_found");
        await turn();
        await turn();
        const e = await bad(track(c, r.completion), "not_found");
        assert.equal(
          e,
          c.calls.findLast((x) => x.method === "resolveSource").error,
        );
      },
      { observeRefresh: false },
    ),
);
for (const mode of ["explicit", "automatic"])
  add(
    "dispose-in-pending-notify-" + mode,
    "dispose",
    mode,
    "mark disposed/reset/no release notification; stop later callbacks, consume raw child Promise even synchronous invalidation",
    () =>
      using(async (c) => {
        let captured,
          later = 0;
        if (mode === "automatic") await partialBound(c);
        c.m.subscribe(() => {
          if (
            (mode === "explicit" && c.m.state.document.status === "pending") ||
            (mode === "automatic" &&
              c.m.state.refresh &&
              c.m.state.candidates.state.status === "pending")
          ) {
            captured = c.m.state.refresh;
            c.m.dispose();
          }
        });
        c.m.subscribe(() => later++);
        let o;
        if (mode === "explicit")
          o = call(c, "load", "B-nav-target", "definition");
        else {
          ready(c);
          await turn();
          assert.ok(captured);
          o = track(c, captured.completion);
        }
        const e = await bad(o, "disposed");
        navError(e, "disposed");
        assert.equal(Object.hasOwn(e, "cause"), false);
        assert.equal(later, 0);
        assert.equal(c.m.state.document.status, "idle");
        assert.equal(c.m.state.candidates, null);
        assert.equal(c.m.state.refresh, null);
        await turn();
      }),
  );
for (const mode of ["explicit", "automatic"])
  add(
    "dispose-after-registered-listener-" + mode,
    "dispose",
    mode,
    "disposed cause preserves one observer AggregateError registered before dispose",
    () =>
      using(async (c) => {
        if (mode === "automatic") await partialBound(c);
        let captured;
        const condition = () =>
          mode === "explicit"
            ? c.m.state.document.status === "pending"
            : !!c.m.state.refresh &&
              c.m.state.candidates.state.status === "pending";
        c.m.subscribe(() => {
          if (condition()) throw "B-registered-before-dispose";
        });
        c.m.subscribe(() => {
          if (condition()) {
            captured = c.m.state.refresh;
            c.m.dispose();
          }
        });
        let o;
        if (mode === "explicit")
          o = call(c, "load", "B-nav-target", "definition");
        else {
          ready(c);
          await turn();
          o = track(c, captured.completion);
        }
        const e = await bad(o, "disposed");
        navError(e, "disposed");
        aggregate(e.cause, ["B-registered-before-dispose"]);
      }),
  );
add(
  "already-settled-not-rewritten",
  "dispose",
  "explicit success resolved then dispose",
  "held resolved Promise stays resolved, old readonly document remains readable",
  () =>
    using(async (c) => {
      const t = await documentStart(c);
      const held = t.o.promise;
      await documentReply(c, t);
      await ok(t.o);
      const d = c.m.state.document.data;
      c.m.dispose();
      assert.equal(await held, undefined);
      assert.equal(d.content.result.text, "ab中😀\r\nZ");
    }),
);
