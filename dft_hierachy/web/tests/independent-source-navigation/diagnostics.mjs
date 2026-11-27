import assert from "node:assert/strict";
import { add } from "./cases.mjs";
import {
  H,
  methods,
  using,
  call,
  ok,
  bad,
  navError,
  document,
  track,
  ready,
  autoStart,
  partialBound,
  turn,
} from "./harness.mjs";
import { hostile } from "./fixtures.mjs";
for (const source of ["source", "readSource", "resolveSource"])
  for (const method of methods)
    add(
      "diagnostic-cross-guard-" + source + "-" + method,
      "diagnostics",
      { source, method },
      "cross-child diagnostic getter blocks every navigation command incl no-op with outer reentrant_change, zero nested probes",
      () =>
        using(async (c) => {
          const d = source === "resolveSource" ? await document(c) : undefined,
            h = hostile(),
            e = new H.sdk.HierError("not_found", "core", "B original", {});
          let nested,
            reads = 0;
          Object.defineProperty(e, "data", {
            configurable: true,
            get() {
              reads++;
              nested = call(
                c,
                method,
                ...(method === "load"
                  ? [h.value, h.value]
                  : method === "locate"
                    ? [h.value, h.value]
                    : []),
              );
              return { B: 3 };
            },
          });
          c.client[source] = () => Promise.reject(e);
          const o =
            source === "resolveSource"
              ? call(c, "locate", d, 0)
              : call(c, "load", "B-nav-target", "definition");
          if (source === "readSource") {
            const q = await c.wire.next("obj.source");
            c.wire.ok(q, H.span(H.point(0), H.point(0)));
          }
          assert.equal(await bad(o), e);
          assert.equal(reads, 1);
          navError(await bad(nested, "reentrant_change"), "reentrant_change");
          assert.equal(h.counts.probes, 0);
        }),
    );
for (const source of ["source", "readSource", "resolveSource"])
  for (const throwing of [false, true])
    add(
      "diagnostic-dispose-original-" + source + "-" + throwing,
      "diagnostics",
      { source, throwing },
      "original failure registered before diagnostic getter; disposed cause is original SDK error, never private disposed wrapper",
      () =>
        using(async (c) => {
          const d = source === "resolveSource" ? await document(c) : undefined,
            e = new H.sdk.HierError("not_found", "core", "B original", {}),
            poison = hostile();
          let reads = 0;
          Object.defineProperty(e, "data", {
            configurable: true,
            get() {
              reads++;
              c.m.dispose();
              if (throwing) throw poison.value;
              return {};
            },
          });
          c.client[source] = () => Promise.reject(e);
          const o =
            source === "resolveSource"
              ? call(c, "locate", d, 0)
              : call(c, "load", "B-nav-target", "definition");
          if (source === "readSource") {
            const q = await c.wire.next("obj.source");
            c.wire.ok(q, H.span(H.point(0), H.point(0)));
          }
          const failure = await bad(o, "disposed");
          navError(failure, "disposed");
          assert.equal(failure.cause, e);
          assert.equal(reads, 1);
          assert.equal(poison.counts.probes, 0);
          assert.equal(c.m.state.document.status, "idle");
        }),
    );
add(
  "automatic-diagnostic-dispose",
  "diagnostics",
  "automatic SDK failure getter disposes coordinator",
  "held auto completion settles disposed with original failure cause even after handle revoked",
  () =>
    using(async (c) => {
      await partialBound(c);
      const e = new H.sdk.HierError("not_found", "core", "B auto original", {});
      Object.defineProperty(e, "data", {
        get() {
          c.m.dispose();
          return { B: 1 };
        },
      });
      let r;
      c.m.subscribe(() => {
        if (c.m.state.refresh) r = c.m.state.refresh;
      });
      c.client.resolveSource = () => Promise.reject(e);
      ready(c);
      await turn();
      assert.ok(r);
      const failure = await bad(track(c, r.completion), "disposed");
      navError(failure, "disposed");
      assert.equal(failure.cause, e);
      assert.equal(c.m.state.refresh, null);
    }),
);
add(
  "diagnostic-dispose-with-prior-observer",
  "diagnostics",
  "pending listener throws, then original SDK failure diagnostic disposes",
  "disposed cause is one AggregateError(errors original observer,cause original query failure)",
  () =>
    using(async (c) => {
      const original = new H.sdk.HierError(
        "not_found",
        "core",
        "B failure",
        {},
      );
      Object.defineProperty(original, "data", {
        get() {
          c.m.dispose();
          return {};
        },
      });
      c.client.source = () => Promise.reject(original);
      c.m.subscribe(() => {
        if (c.m.state.document.status === "pending") throw "B-prior-observer";
      });
      const e = await bad(
        call(c, "load", "B-nav-target", "definition"),
        "disposed",
      );
      navError(e, "disposed");
      assert.ok(e.cause instanceof AggregateError);
      assert.deepEqual(e.cause.errors, ["B-prior-observer"]);
      assert.equal(e.cause.cause, original);
    }),
);
