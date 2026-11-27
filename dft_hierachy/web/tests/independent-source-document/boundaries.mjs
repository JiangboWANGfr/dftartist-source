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
  span,
  read,
  point,
  tick,
  vm,
  sdk,
} from "./harness.mjs";
import { bomText } from "./positions.mjs";
for (const offset of [1, 2])
  for (const endpoint of ["start", "end"])
    add(
      `SD-P-bom-interior-${endpoint}-${offset}`,
      "coordinates",
      { text: bomText, endpoint, offset },
      "inconsistent_reply, not a Unicode scalar boundary",
      () =>
        using(async (c) => {
          const t = await second(
            c,
            await begin(c),
            span(
              endpoint === "start" ? point(offset) : point(0),
              endpoint === "end" ? point(offset) : point(12, 2, 1),
            ),
          );
          c.wire.ok(t.r, read(bomText));
          await failure(t.o, "inconsistent_reply");
        }),
    );
for (const bad of [
  point(1),
  point(0, 2, 1),
  point(0, 1, 2),
  point(Number.MAX_SAFE_INTEGER, 1, 1),
])
  add(
    `SD-P-empty-invalid-${bad.offset}-${bad.line}-${bad.column}`,
    "coordinates",
    { text: "", start: point(0), end: bad },
    "empty exact only (0,1,1); huge schema-valid offset rejected, no repair",
    () =>
      using(async (c) => {
        const t = await second(c, await begin(c), span(point(0), bad));
        c.wire.ok(t.r, read(""));
        await failure(t.o, "inconsistent_reply");
      }),
  );
add(
  "SD-I-success-invalid-keeps-data",
  "input",
  "bad load after complete success",
  "invalid_argument preserves exact old state/data identity; no query/notification",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      const before = c.m.state,
        n = c.events.length,
        calls = c.calls.length;
      await failure(invoke(c, "load", "", "definition"), "invalid_argument");
      assert.equal(c.m.state, before);
      assert.equal(c.events.length, n);
      assert.equal(c.calls.length, calls);
    }),
);
for (const ref of [" ", "\u0000", "😀"])
  add(
    `SD-I-schema-legal-${JSON.stringify(ref)}`,
    "input",
    { ref, kind: "definition" },
    "public ObjectRef/DefRef Schema is nonempty text, not trim/regex guessed encoding; Core decides existence",
    () =>
      using(async (c) => {
        const t = await begin(c, ref, "definition");
        c.wire.fail(t.q);
        assert.equal(await failure(t.o, "not_found"), c.calls[0].error);
      }),
  );
for (const terminal of ["failed", "cancelled", "success"])
  add(
    `SD-T-cancel-noop-${terminal}`,
    "tasks",
    `${terminal} then cancel`,
    "nonpending cancel preserves exact state identity and emits no notification/query",
    () =>
      using(async (c) => {
        const t = await begin(c);
        if (terminal === "success") await finish(c, t);
        else {
          c.wire.fail(
            t.q,
            terminal === "cancelled" ? "cancelled" : "not_found",
          );
          await failure(
            t.o,
            terminal === "cancelled" ? "cancelled" : "not_found",
          );
        }
        const before = c.m.state,
          n = c.events.length,
          q = c.calls.length;
        await success(invoke(c, "cancel"));
        assert.equal(c.m.state, before);
        assert.equal(c.events.length, n);
        assert.equal(c.calls.length, q);
      }),
  );
for (const action of ["cancel", "clear"])
  for (const stage of ["source", "readSource"])
    add(
      `SD-T-shared-direct-${action}-${stage}`,
      "ownership",
      { action, stage, consumer: "direct SDK" },
      "model abort does not cancel other subscriber; direct source/read fulfills original request; no wire cancel",
      () =>
        using(async (c) => {
          let t = await begin(c);
          if (stage === "readSource") t = await second(c, t);
          const p =
            stage === "source"
              ? c.client.source(t.ref, t.kind)
              : c.client.readSource(t.span.file);
          p.catch(() => {});
          const n = c.wire.cancels.length;
          await success(invoke(c, action));
          await failure(t.o, "cancelled");
          assert.equal(c.wire.cancels.length, n);
          c.wire.ok(t.r ?? t.q, stage === "source" ? span() : read());
          const result = await p;
          assert.equal(result.result.contentHash, span().contentHash);
        }),
    );
add(
  "SD-I-closed-sdk-snapshot",
  "ownership",
  "ready SDK closed before model constructor/load",
  "constructor uses still-readable snapshot only; later SDK query original disposed error, not model disposed or guessed private state",
  () =>
    using(
      async (c) => {
        c.client.dispose();
        const m = c.newModel();
        c.m = m;
        assert.equal(m.snapshotId, c.client.snapshot.snapshotId);
        assert.equal(m.disposed, false);
        const e = await failure(
          invoke(c, "load", "B", "definition"),
          "disposed",
        );
        assert.ok(e instanceof sdk.HierError);
        assert.equal(e, c.calls[0].error);
        assert.equal(m.state.status, "failed");
      },
      { withModel: false },
    ),
);
add(
  "SD-R-proxy-once",
  "diagnostics",
  "shared Proxy child returned twice, sparse array, ordinary getters",
  "each shared source enumerated/captured once, own string enumerable fields read once; source not frozen",
  () =>
    using(async (c) => {
      const t = await begin(c),
        counts = { enumerate: 0, descriptor: 0, read: 0 };
      const child = new Proxy(
        { value: 7 },
        {
          ownKeys(o) {
            counts.enumerate++;
            return Reflect.ownKeys(o);
          },
          getOwnPropertyDescriptor(o, k) {
            counts.descriptor++;
            return Reflect.getOwnPropertyDescriptor(o, k);
          },
          get(o, k, r) {
            if (k === "value") counts.read++;
            return Reflect.get(o, k, r);
          },
        },
      );
      const data = { a: child, b: child },
        e = new sdk.HierError("transport_closed", "transport", "B once", data);
      c.wire.close(e);
      assert.equal(await failure(t.o), e);
      assert.deepEqual(counts, { enumerate: 1, descriptor: 1, read: 1 });
      const copy = c.m.state.error.data;
      assert.equal(copy.a, copy.b);
      assert.notEqual(copy.a, child);
      assert.equal(copy.a.value, 7);
    }),
);
add(
  "SD-R-first-shared-path",
  "diagnostics",
  "shared child with bad getter at first a.b/[] key path",
  "first-discovery exact unsplit path; no alias-based second capture; no later reads",
  () =>
    using(async (c) => {
      const t = await begin(c);
      let hits = 0,
        later = 0;
      const child = {};
      Object.defineProperty(child, "", {
        enumerable: true,
        get() {
          hits++;
          throw undefined;
        },
      });
      const data = { "a.b/[]": child, alias: child };
      Object.defineProperty(data, "later", {
        enumerable: true,
        get() {
          later++;
          return 1;
        },
      });
      const e = new sdk.HierError(
        "transport_closed",
        "transport",
        "B path",
        data,
      );
      c.wire.close(e);
      assert.equal(await failure(t.o), e);
      assert.deepEqual(c.m.state.error.dataIssue, {
        code: "data_read_failed",
        operation: "read",
        path: ["a.b/[]", ""],
      });
      assert.equal(hits, 1);
      assert.equal(later, 0);
    }),
);
for (const action of ["cancel", "clear"])
  add(
    `SD-D-own-command-${action}`,
    "dispose",
    `${action} notification disposes; old load settlement relative to own notification is unspecified`,
    "own command disposed, old load once cancelled or disposed (cancelled cause if disposed), idle/no revival; BD-SOURCE-01 does not guess old settlement order",
    () =>
      using(async (c) => {
        const t = await begin(c);
        c.m.subscribe(() => {
          if (c.m.state.status != "pending") c.m.dispose();
        });
        const own = invoke(c, action);
        const a = await failure(t.o),
          b = await failure(own, "disposed");
        assert.ok(["cancelled", "disposed"].includes(a.code));
        local(a, a.code);
        local(b, "disposed");
        if (a.code === "disposed") local(a.cause, "cancelled");
        assert.deepEqual(c.m.state, { status: "idle", target: null });
        assert.equal(c.m.disposed, true);
      }),
  );
