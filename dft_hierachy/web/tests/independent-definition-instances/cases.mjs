import assert from "node:assert/strict";
import {
  using,
  context,
  invoke,
  track,
  begin,
  finish,
  success,
  failure,
  local,
  state,
  calls,
  Q,
  item,
  page,
  complete,
  partial,
  instKinds,
  vm,
  sdk,
  sdkAlive,
  tick,
  opaque,
} from "./harness.mjs";
export const cases = [];
const add = (id, group, input, expected, run, section = 1) =>
  cases.push({
    id: "DI-" + id,
    group,
    input,
    expected,
    basis:
      "DESIGN §6.24." +
      section +
      "; inherited §§6.22.3/6.11/6.9.4/6.10.4/6.6.6",
    run,
  });
async function invalid(c, q, code = "invalid_argument") {
  const before = c.m.state,
    n = c.wire.queries.length,
    events = c.events.length;
  local(await failure(invoke(c, "load", q), code), code);
  assert.equal(c.m.state, before);
  assert.equal(c.wire.queries.length, n);
  assert.equal(c.events.length, events);
}
add(
  "idle",
  "ownership",
  {},
  "frozen idle, no automatic query/event/selection; idle commands no publication; SDK survives dispose",
  () =>
    using(async (c) => {
      const before = state(c, "idle", null, []);
      assert.equal(c.m.snapshotId, Q.snapshotId);
      assert.equal(c.m.disposed, false);
      assert.equal(c.registrations, 0);
      assert.equal(c.wire.queries.length, 0);
      for (const name of ["loadMore", "reload", "cancel", "clear"])
        await success(invoke(c, name));
      assert.equal(c.m.state, before);
      assert.equal(c.events.length, 0);
      c.m.dispose();
      c.m.dispose();
      assert.equal(c.m.disposed, true);
      state(c, "idle", null, []);
      await sdkAlive(c);
    }),
);
add(
  "not-ready",
  "ownership",
  { ready: false },
  "raw SDK snapshot error precedes any options probe",
  () =>
    using(
      async (c) => {
        let original,
          descriptor,
          p = c.client;
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
              original = e;
              throw e;
            }
          },
        });
        let probes = 0;
        assert.throws(
          () =>
            c.newModel(
              new Proxy(
                {},
                {
                  getOwnPropertyDescriptor() {
                    probes++;
                    throw undefined;
                  },
                },
              ),
            ),
          (e) => e === original && e !== undefined,
        );
        assert.equal(probes, 0);
      },
      { withModel: false, ready: false },
    ),
);
const badOptions = [
  ["null", null],
  ["array", []],
  ["function", () => {}],
  ["number", 4],
  ["zero", { pageSize: 0 }],
  ["negative", { pageSize: -1 }],
  ["fraction", { pageSize: 1.5 }],
  ["nan", { pageSize: NaN }],
  ["infinite", { pageSize: Infinity }],
  ["string", { pageSize: "2" }],
  ["undefined", { pageSize: undefined }],
  ["above-limit", { pageSize: 2147483648 }],
];
for (const [id, value] of badOptions)
  add(
    "options-" + id,
    "options",
    id,
    "sync invalid_options, no SDK query",
    () =>
      using(
        async (c) => {
          assert.throws(
            () => c.newModel(value),
            (e) => {
              local(e, "invalid_options");
              return true;
            },
          );
          assert.equal(c.wire.queries.length, 0);
        },
        { withModel: false },
      ),
  );
for (const [size, options] of [
  [200, undefined],
  [200, {}],
  [1, { pageSize: 1 }],
  [2147483647, { pageSize: 2147483647 }],
])
  add(
    "page-size-" +
      (options === undefined ? "omitted" : size === 200 ? "object" : size),
    "options",
    { pageSize: size },
    "fixed lawful PageLimit forwarded, first cursor omitted and no prefetch",
    () =>
      using(
        async (c) => {
          const t = await begin(c);
          firstShape(c, t, size);
          await finish(c, t, page([]));
        },
        { options },
      ),
  );
for (const trap of ["getOwnPropertyDescriptor", "get"])
  add(
    "options-throw-" + trap,
    "options",
    trap,
    "invalid_options keeps original undefined cause; no coercion/enumeration",
    () =>
      using(
        async (c) => {
          let reads = 0;
          const opts = new Proxy(
            { pageSize: 1 },
            {
              [trap]() {
                reads++;
                throw undefined;
              },
              ownKeys() {
                assert.fail("no enumeration");
              },
            },
          );
          assert.throws(
            () => c.newModel(opts),
            (e) => {
              local(e, "invalid_options");
              assert(Object.hasOwn(e, "cause"));
              assert.equal(e.cause, undefined);
              return true;
            },
          );
          assert.equal(reads, 1);
        },
        { withModel: false },
      ),
  );
add(
  "options-inherited",
  "options",
  "inherited pageSize getter and hostile extension",
  "inheritance ignored; only own pageSize inspected once, no extension enumeration",
  () =>
    using(
      async (c) => {
        const log = [];
        const opts = new Proxy(
          Object.create({
            get pageSize() {
              assert.fail("inherited");
            },
          }),
          {
            getOwnPropertyDescriptor(t, k) {
              log.push("has:" + k);
              return Reflect.getOwnPropertyDescriptor(t, k);
            },
            get() {
              assert.fail("absent own value");
            },
            ownKeys() {
              assert.fail("no ownKeys");
            },
          },
        );
        c.m = c.newModel(opts);
        const t = await begin(c);
        firstShape(c, t, 200);
        await finish(c, t, page([]));
        assert.deepEqual(log, ["has:pageSize"]);
      },
      { withModel: false },
    ),
);
const badQueries = [
  ["null", null],
  ["array", []],
  ["function", () => {}],
  ["number", 7],
  ["missing-snapshot", { def: Q.def }],
  ["missing-def", { snapshotId: Q.snapshotId }],
  ["undefined-def", { ...Q, def: undefined }],
  ["empty-def", { ...Q, def: "" }],
  ["empty-snapshot", { ...Q, snapshotId: "" }],
  ["numeric-snapshot", { ...Q, snapshotId: 3 }],
  ["boxed-def", { ...Q, def: new String(Q.def) }],
  ["numeric-def", { ...Q, def: 5 }],
];
for (const [id, value] of badQueries)
  add(
    "input-" + id,
    "input",
    id,
    "Promise invalid_argument, unchanged state/events/tasks",
    () => using((c) => invalid(c, value)),
  );
add(
  "snapshot-mismatch",
  "input",
  "lawful foreign snapshot",
  "snapshot_mismatch after projection/field validation, no query",
  () =>
    using((c) =>
      invalid(c, { ...Q, snapshotId: "B64-other" }, "snapshot_mismatch"),
    ),
);
add(
  "inherited-required",
  "input",
  "query fields only on prototype",
  "required own descriptors, no inherited getters",
  () =>
    using(async (c) => {
      const q = Object.create({
        get snapshotId() {
          assert.fail("no inherited read");
        },
        get def() {
          assert.fail("no inherited read");
        },
      });
      await invalid(c, q);
    }),
);
add(
  "projection-once",
  "input",
  "two own accessors in ordinary Proxy and hostile extension",
  "ordered descriptor/Get snapshotId then def, each once; freeze own copy, do not enumerate extensions",
  () =>
    using(async (c) => {
      const log = [],
        q = new Proxy(
          { ...Q, extra: opaque() },
          {
            getOwnPropertyDescriptor(t, k) {
              log.push("has:" + k);
              return Reflect.getOwnPropertyDescriptor(t, k);
            },
            get(t, k) {
              log.push("get:" + k);
              return Reflect.get(t, k);
            },
            ownKeys() {
              assert.fail("no enumerate");
            },
          },
        );
      const t = await begin(c, q);
      assert.deepEqual(log, [
        "has:snapshotId",
        "get:snapshotId",
        "has:def",
        "get:def",
      ]);
      assert.notEqual(t.query, q);
      assert.deepEqual(t.query, Q);
      await finish(c, t, page([]));
    }),
);
add(
  "late-projection-error",
  "input",
  "early snapshot missing, later def getter throws raw object",
  "finish projection before value validation, raw late cause; do not cancel in-flight query",
  () =>
    using(async (c) => {
      const t = await begin(c),
        raw = { B: "late" };
      const q = {
        get def() {
          throw raw;
        },
      };
      const e = await failure(invoke(c, "load", q), "invalid_argument");
      assert.equal(e.cause, raw);
      state(c, "pending", Q, []);
      assert.equal(calls(c).length, 1);
      await finish(c, t, page([]));
    }),
);
for (const trap of ["getOwnPropertyDescriptor", "get"])
  add(
    "input-throw-" + trap,
    "input",
    trap,
    "invalid_argument preserves own undefined cause, stops later projection",
    () =>
      using(async (c) => {
        let n = 0;
        const q = new Proxy(
          { ...Q },
          {
            [trap]() {
              n++;
              throw undefined;
            },
          },
        );
        const e = await failure(invoke(c, "load", q), "invalid_argument");
        assert.equal(n, 1);
        assert(Object.hasOwn(e, "cause"));
        assert.equal(e.cause, undefined);
        state(c, "idle", null, []);
      }),
  );
for (const trap of ["getOwnPropertyDescriptor", "get"])
  for (const throws of [false, true])
    add(
      "input-dispose-" + trap + "-" + throws,
      "input",
      { trap, throws },
      "dispose immediately wins and stops later field; same-operation cause only when thrown",
      () =>
        using(async (c) => {
          const raw = { B: "dispose-throw" },
            log = [];
          const q = new Proxy(
            { ...Q },
            {
              [trap](t, k) {
                log.push(k);
                c.m.dispose();
                if (throws) throw raw;
                return trap === "get"
                  ? Reflect.get(t, k)
                  : Reflect.getOwnPropertyDescriptor(t, k);
              },
            },
          );
          const e = await failure(invoke(c, "load", q), "disposed");
          assert.deepEqual(log, ["snapshotId"]);
          assert.equal(Object.hasOwn(e, "cause"), throws);
          if (throws) assert.equal(e.cause, raw);
          state(c, "idle", null, []);
        }),
    );
add(
  "input-reentrant",
  "input",
  "commands reenter from def getter",
  "all async commands reject reentrant_change before nested input probe; outer input succeeds",
  () =>
    using(async (c) => {
      const nested = [],
        counts = { probes: 0 };
      const t = await begin(c, {
        snapshotId: Q.snapshotId,
        get def() {
          for (const name of ["load", "loadMore", "reload", "cancel", "clear"])
            nested.push(invoke(c, name, opaque(counts)));
          return Q.def;
        },
      });
      for (const o of nested)
        local(await failure(o, "reentrant_change"), "reentrant_change");
      assert.equal(counts.probes, 0);
      await finish(c, t, page([]));
    }),
);
add(
  "invalid-keeps-pending",
  "input",
  "invalid/mismatched input while pending",
  "no cancellation, publication or duplicate SDK call before validation",
  () =>
    using(async (c) => {
      const t = await begin(c),
        s = c.m.state;
      await invalid(c, { ...Q, def: 0 });
      await invalid(c, { ...Q, snapshotId: "other" }, "snapshot_mismatch");
      assert.equal(c.m.state, s);
      await finish(c, t, page([]));
    }),
);
add(
  "same-value-target",
  "targets",
  "distinct input object, same snapshotId/def",
  "pending joins current first/later task; success no-op by values, captured query own frozen",
  () =>
    using(async (c) => {
      const q = { ...Q },
        t = await begin(c, q),
        join = invoke(c, "load", { ...Q });
      q.def = "changed";
      await finish(c, t, page([], "B64-next"));
      await success(join);
      assert.equal(calls(c).length, 1);
      assert.deepEqual(c.m.state.query, Q);
      const before = c.m.state;
      await success(invoke(c, "load", { ...Q }));
      assert.equal(c.m.state, before);
    }),
);
add(
  "different-def",
  "targets",
  "same snapshot, changed opaque def",
  "new target cancels prior waiter, clears prefix; no parsing of ref prefixes",
  () =>
    using(async (c) => {
      const a = await begin(c),
        b = await begin(c, { ...Q, def: "I:actually-definition" });
      await failure(a.o, "cancelled");
      assert.deepEqual(c.m.state.pages, []);
      assert.equal(b.q.params.def, "I:actually-definition");
      await finish(c, b, page([]));
    }),
);
add(
  "original-page",
  "pages",
  "duplicate same-name/same-def refs, raw Reply/extensions",
  "preserve original SDK Reply/result/items/InstInfo/extensions/order/duplicates; no flat DTO",
  () =>
    using(async (c) => {
      const a = item(),
        value = page([a, a, item(1)]),
        t = await begin(c);
      const s = await finish(c, t, value);
      const raw = calls(c).at(-1).reply;
      assert.equal(s.pages[0], raw);
      assert.equal(s.pages[0].result.items, raw.result.items);
      assert.equal(s.pages[0].result.items[0], raw.result.items[0]);
      assert.deepEqual(
        s.pages[0].result.items.map((x) => x.ref),
        [a.ref, a.ref, item(1).ref],
      );
      assert.deepEqual(s.pages[0].result.B_page, value.B_page);
      assert.deepEqual(s.pages[0].result.items[0].B_inst, a.B_inst);
      const before = c.m.state;
      await tick();
      assert.equal(c.m.state, before);
      assert.equal(calls(c).length, 1);
    }),
  2,
);
for (const kind of instKinds)
  add(
    "inst-kind-" + kind,
    "pages",
    { kind },
    "all lawful InstKind rows preserved, including blackbox/primitive, no expandable-only filtering",
    () =>
      using(async (c) => {
        const t = await begin(c);
        await finish(c, t, page([item(0, kind)]));
        assert.equal(c.m.state.pages[0].result.items[0].kind, kind);
      }),
    2,
  );
for (const withNext of [false, true])
  add(
    "complete-empty-" + withNext,
    "pages",
    { withNext },
    "empty complete page preserved; next alone determines eligible explicit continuation, never implicit request",
    () =>
      using(async (c) => {
        await finish(
          c,
          await begin(c),
          page([], withNext ? "B64-empty" : undefined),
        );
        const s = c.m.state;
        if (withNext) {
          const t = await begin(c, Q, "loadMore");
          assert.equal(t.q.params.cursor, "B64-empty");
          await finish(c, t, page([]));
        } else {
          await success(invoke(c, "loadMore"));
          assert.equal(c.m.state, s);
        }
        assert.equal(calls(c).length, withNext ? 2 : 1);
      }),
    2,
  );
for (const n of [0, 1])
  for (const withNext of [false, true])
    add(
      "partial-" + n + "-" + withNext,
      "pages",
      { items: n, next: withNext },
      "legal partial is success with original reasons/next; load/loadMore no-op until explicit reload clears chain",
      () =>
        using(async (c) => {
          const t = await begin(c);
          await finish(
            c,
            t,
            page(n ? [item()] : [], withNext ? "B64-partial" : undefined),
            partial,
          );
          const s = c.m.state;
          assert.equal(
            s.pages[0].completeness,
            calls(c).at(-1).reply.completeness,
          );
          assert.deepEqual(s.pages[0].completeness.reasons, partial.reasons);
          await success(invoke(c, "loadMore"));
          await success(invoke(c, "load", { ...Q }));
          assert.equal(c.m.state, s);
          assert.equal(calls(c).length, 1);
          const reload = await begin(c, Q, "reload");
          firstShape(c, reload);
          assert.deepEqual(c.m.state.pages, []);
          await finish(c, reload, page([]));
        }),
      2,
    );
add(
  "two-pages",
  "pages",
  "complete page chain, duplicate rows across pages",
  "one page per explicit command, original prefix identity and raw cursor; no dedup/prefetch",
  () =>
    using(async (c) => {
      const t = await begin(c);
      firstShape(c, t);
      await finish(c, t, page([item()], "B64-c1"));
      const p = c.m.state.pages[0];
      const next = await begin(c, Q, "loadMore");
      assert.equal(calls(c).length, 2);
      assert.equal(calls(c).at(-1).args[1].cursor, "B64-c1");
      assert.equal(c.m.state.pages[0], p);
      await finish(c, next, page([item()]));
      assert.equal(c.m.state.pages[0], p);
      assert.equal(c.m.state.pages.length, 2);
    }),
  2,
);
for (const later of [false, true])
  add(
    "overfull-" + later,
    "pages",
    { pageSize: 1, later },
    "inconsistent_reply, bad page not committed; retain prefix and uncommitted cursor for retry",
    () =>
      using(
        async (c) => {
          if (later)
            await finish(c, await begin(c), page([item()], "B64-retry"));
          const prefix = [...c.m.state.pages],
            t = await begin(c, Q, later ? "loadMore" : "load");
          c.wire.ok(t.q, page([item(), item(1)], "B64-bad"));
          local(await failure(t.o, "inconsistent_reply"), "inconsistent_reply");
          state(c, "failed", Q, prefix);
          const retry = await begin(c, Q, "loadMore");
          assert.equal(retry.q.params.cursor, later ? "B64-retry" : "");
          await finish(c, retry, page([]));
        },
        { options: { pageSize: 1 } },
      ),
    2,
  );
for (const loop of ["current", "older"])
  add(
    "cursor-loop-" + loop,
    "pages",
    loop,
    "repeated requested/current-chain cursor rejected, original prefix and retry cursor kept; reload resets chain",
    () =>
      using(async (c) => {
        await finish(c, await begin(c), page([], "B64-a"));
        if (loop === "older")
          await finish(c, await begin(c, Q, "loadMore"), page([], "B64-b"));
        const prefix = [...c.m.state.pages],
          t = await begin(c, Q, "loadMore");
        c.wire.ok(t.q, page([], "B64-a"));
        local(await failure(t.o, "inconsistent_reply"), "inconsistent_reply");
        state(c, "failed", Q, prefix);
        const r = await begin(c, Q, "reload");
        firstShape(c, r);
        await finish(c, r, page([], "B64-a"));
      }),
    2,
  );
add(
  "pending-joiners",
  "tasks",
  "same-query load/loadMore while next page pending",
  "same-target load and loadMore join the one in-flight task without new publication",
  () =>
    using(async (c) => {
      await finish(c, await begin(c), page([], "B64-next"));
      const t = await begin(c, Q, "loadMore"),
        s = c.m.state,
        n = c.events.length;
      const a = invoke(c, "load", { ...Q }),
        b = invoke(c, "loadMore");
      assert.equal(c.m.state, s);
      assert.equal(c.events.length, n);
      assert.equal(calls(c).length, 2);
      await finish(c, t, page([]));
      await success(a);
      await success(b);
    }),
  3,
);
for (const action of ["cancel", "clear", "replace"])
  add(
    "revoke-" + action,
    "tasks",
    action,
    "old waiters cancelled; late success/error consumed without page publication or targeting new query",
    () =>
      using(async (c) => {
        const t = await begin(c),
          join = invoke(c, "loadMore");
        let fresh;
        if (action === "replace")
          fresh = await begin(c, { ...Q, def: "B64-other" });
        else await success(invoke(c, action));
        await failure(t.o, "cancelled");
        await failure(join, "cancelled");
        const s = c.m.state,
          n = calls(c).length;
        c.wire.ok(t.q, page([item()], "B64-late"));
        await tick();
        assert.equal(c.m.state, s);
        assert.equal(calls(c).length, n);
        if (fresh) await finish(c, fresh, page([]));
        else
          state(
            c,
            action === "clear" ? "idle" : "cancelled",
            action === "clear" ? null : Q,
            [],
          );
      }),
    3,
  );
for (const action of ["error", "cancel"])
  add(
    "retry-" + action,
    "tasks",
    action,
    "keep successful prefix and retry uncommitted page; same-target load after failure restarts first page",
    () =>
      using(async (c) => {
        await finish(c, await begin(c), page([], "B64-retry"));
        const p = c.m.state.pages[0],
          t = await begin(c, Q, "loadMore");
        if (action === "cancel") await success(invoke(c, "cancel"));
        else c.wire.fail(t.q, "not_found");
        await failure(t.o, action === "cancel" ? "cancelled" : "not_found");
        assert.equal(c.m.state.pages[0], p);
        const r = await begin(c, Q, "loadMore");
        assert.equal(r.q.params.cursor, "B64-retry");
        await finish(c, r, page([], "B64-next"));
        const e = await begin(c, Q, "loadMore");
        c.wire.fail(e.q, "not_found");
        await failure(e.o, "not_found");
        const reset = await begin(c);
        firstShape(c, reset);
        assert.deepEqual(c.m.state.pages, []);
        await finish(c, reset, page([]));
      }),
    3,
  );
add(
  "stale-cursor",
  "tasks",
  "SDK stale_cursor after committed prefix",
  "loadMore rejects same original error without retry; explicit reload rebuilds first page",
  () =>
    using(async (c) => {
      await finish(c, await begin(c), page([], "B64-stale"));
      const prefix = [...c.m.state.pages],
        t = await begin(c, Q, "loadMore");
      c.wire.fail(t.q, "stale_cursor");
      const error = await failure(t.o, "stale_cursor");
      assert.equal(error, calls(c).at(-1).error);
      const n = calls(c).length;
      assert.equal(await failure(invoke(c, "loadMore")), error);
      assert.equal(calls(c).length, n);
      state(c, "failed", Q, prefix);
      await finish(c, await begin(c, Q, "reload"), page([]));
    }),
  3,
);
add(
  "reload-pending",
  "tasks",
  "reload while first pending, reuse old next on fresh chain",
  "always cancel and start first without cursor, late old reply does not publish",
  () =>
    using(async (c) => {
      const a = await begin(c),
        b = await begin(c, Q, "reload");
      await failure(a.o, "cancelled");
      firstShape(c, b);
      await finish(c, b, page([], "B64-c"));
      const s = c.m.state;
      c.wire.ok(a.q, page([item()]));
      await tick();
      assert.equal(c.m.state, s);
    }),
  3,
);
add(
  "shared-sdk",
  "ownership",
  "two models and direct SDK same target, cancel one",
  "local cancel/dispose affects only own SDK consumer; other model/direct SDK and later calls survive",
  () =>
    using(async (c) => {
      const t = await begin(c),
        other = c.newModel(),
        o = track(c, other.load(Q)),
        p = c.client.instancesOf(Q.def, { limit: 200 });
      p.catch(() => {});
      await success(invoke(c, "cancel"));
      await failure(t.o, "cancelled");
      c.wire.ok(t.q, page([]));
      await success(o);
      await p;
      assert.equal(other.state.status, "success");
      c.m.dispose();
      await sdkAlive(c);
    }),
  3,
);
add(
  "subscriptions",
  "notifications",
  "same listener registered twice, remove/add during publication",
  "independent registrations, no replay, snapshot ordering; new registration next batch, idempotent unsubscribe",
  () =>
    using(async (c) => {
      const seen = [],
        fn = () => seen.push("x");
      const a = c.m.subscribe(fn),
        b = c.m.subscribe(fn);
      assert.deepEqual(seen, []);
      await finish(c, await begin(c), page([]));
      assert.deepEqual(seen, ["x", "x", "x", "x"]);
      a();
      a();
      seen.length = 0;
      await success(invoke(c, "clear"));
      assert.deepEqual(seen, ["x"]);
      b();
      let late, offSecond;
      const order = [];
      c.m.subscribe(() => {
        order.push("first");
        offSecond();
        late ??= c.m.subscribe(() => order.push("late"));
      });
      offSecond = c.m.subscribe(() => order.push("removed"));
      await finish(c, await begin(c), page([]));
      assert.deepEqual(order, ["first", "first", "late"]);
      late();
    }),
  3,
);
for (const phase of ["pending", "success", "failed", "cancelled"])
  add(
    "notify-error-" + phase,
    "notifications",
    phase,
    "throwing listeners continue in order, committed state not rolled back; all joiners receive AggregateError with original errors/cause",
    () =>
      using(async (c) => {
        const a = { B: "first" },
          b = { B: "last" },
          seen = [];
        c.m.subscribe(() => {
          if (c.m.state.status === phase) {
            seen.push("a");
            throw a;
          }
        });
        c.m.subscribe(() => {
          if (c.m.state.status === phase) seen.push("middle");
        });
        c.m.subscribe(() => {
          if (c.m.state.status === phase) {
            seen.push("b");
            throw b;
          }
        });
        const t = await begin(c),
          join = invoke(c, "loadMore");
        if (phase === "pending" || phase === "success")
          c.wire.ok(t.q, page([]));
        else c.wire.fail(t.q, phase === "failed" ? "not_found" : "cancelled");
        for (const o of [t.o, join]) {
          const e = await failure(o);
          assert(e instanceof AggregateError);
          assert.deepEqual(e.errors, [a, b]);
          if (["failed", "cancelled"].includes(phase))
            assert.equal(e.cause, calls(c).at(-1).error);
        }
        assert.deepEqual(seen, ["a", "middle", "b"]);
        state(c, phase === "pending" ? "success" : phase, Q);
      }),
    3,
  );
add(
  "notify-reentrant",
  "notifications",
  "all command no-ops reenter pending listener",
  "reentrant_change before hostile input, no second command; outer page still commits",
  () =>
    using(async (c) => {
      const nested = [],
        counts = { probes: 0 };
      c.m.subscribe(() => {
        if (c.m.state.status === "pending")
          for (const name of ["load", "loadMore", "reload", "cancel", "clear"])
            nested.push(invoke(c, name, opaque(counts)));
      });
      const t = await begin(c);
      for (const o of nested)
        local(await failure(o, "reentrant_change"), "reentrant_change");
      assert.equal(counts.probes, 0);
      await finish(c, t, page([]));
    }),
  3,
);
for (const phase of ["pending", "success", "failed"])
  add(
    "notify-dispose-" + phase,
    "notifications",
    phase,
    "synchronous dispose/no final notification stops later listeners; unsettled commands disposed, prior SDK failure cause preserved",
    () =>
      using(async (c) => {
        let after = 0;
        c.m.subscribe(() => {
          if (c.m.state.status === phase) c.m.dispose();
        });
        c.m.subscribe(() => after++);
        const o = invoke(c, "load", Q);
        if (phase !== "pending") {
          const q = await c.wire.next("def.instances");
          if (phase === "success") c.wire.ok(q, page([]));
          else c.wire.fail(q, "not_found");
        }
        const e = await failure(o, "disposed");
        if (phase === "failed") assert.equal(e.cause, calls(c).at(-1).error);
        state(c, "idle", null, []);
        assert.equal(after, phase === "pending" ? 0 : 1);
        if (phase === "pending") assert.equal(calls(c).length, 0);
      }),
    3,
  );
for (const action of ["cancel", "clear"])
  add(
    "action-dispose-" + action,
    "notifications",
    action,
    "notification dispose takes over original task/joiner/action, preserving cancellation cause",
    () =>
      using(async (c) => {
        const t = await begin(c),
          join = invoke(c, "loadMore");
        c.m.subscribe(() => {
          if (c.m.state.status === (action === "cancel" ? "cancelled" : "idle"))
            c.m.dispose();
        });
        const act = invoke(c, action);
        for (const o of [t.o, join]) {
          const e = await failure(o, "disposed");
          assert.equal(e.cause.code, "cancelled");
        }
        await failure(act, "disposed");
        state(c, "idle", null, []);
      }),
    3,
  );
add(
  "listener-promise",
  "notifications",
  "listener returns unresolved Promise",
  "no awaiting listener return; original command still settles",
  () =>
    using(async (c) => {
      c.m.subscribe(() => new Promise(() => {}));
      await finish(c, await begin(c), page([]));
    }),
  3,
);
for (const raw of [undefined, Object.freeze({ B: "unexpected" })])
  add(
    "sdk-unexpected-" + (raw === undefined ? "undefined" : "object"),
    "errors",
    "SDK method throws unknown",
    "local inconsistent_reply retains raw own cause and definition_instances diagnostic origin",
    () =>
      using(async (c) => {
        c.client.instancesOf = () => {
          throw raw;
        };
        const e = await failure(invoke(c, "load", Q), "inconsistent_reply");
        local(e, "inconsistent_reply");
        assert(Object.hasOwn(e, "cause"));
        assert.equal(e.cause, raw);
        state(c, "failed");
        assert.equal(c.m.state.error.origin, "definition_instances");
        assert.deepEqual(c.m.state.error.data, {});
        assert(Object.isFrozen(c.m.state.error.data));
      }),
    3,
  );
add(
  "diagnostic-cycle",
  "diagnostics",
  "SDK HierError with cyclic/shared mutable data",
  "original error rejection, deep frozen diagnostic copy preserves aliases/cycles; original data not frozen",
  () =>
    using(async (c) => {
      const t = await begin(c),
        shared = { v: 1 },
        data = { a: shared, b: shared };
      data.self = data;
      const e = new sdk.HierError(
        "transport_closed",
        "transport",
        "B original",
        data,
      );
      c.wire.close(e);
      assert.equal(await failure(t.o), e);
      const f = c.m.state.error;
      assert.equal(f.code, e.code);
      assert.equal(f.origin, e.origin);
      assert.notEqual(f.data, data);
      assert.equal(f.data.self, f.data);
      assert.equal(f.data.a, f.data.b);
      assert(Object.isFrozen(f.data.a));
      assert.equal(Object.isFrozen(data), false);
    }),
  3,
);
add(
  "diagnostic-read",
  "diagnostics",
  "HierError.data getter throws undefined",
  "one read, original error identity, dataIssue read/empty path and frozen empty data",
  () =>
    using(async (c) => {
      const t = await begin(c),
        e = new sdk.HierError("transport_closed", "transport", "B", {});
      let reads = 0;
      Object.defineProperty(e, "data", {
        get() {
          reads++;
          throw undefined;
        },
      });
      c.wire.close(e);
      assert.equal(await failure(t.o), e);
      assert.equal(reads, 1);
      assert.deepEqual(c.m.state.error.data, {});
      assert.deepEqual(c.m.state.error.dataIssue, {
        code: "data_read_failed",
        operation: "read",
        path: [],
      });
    }),
  3,
);
add(
  "diagnostic-dispose",
  "diagnostics",
  "data getter disposes then throws",
  "disposed wins with prior HierError cause; no diagnostic terminal publication",
  () =>
    using(async (c) => {
      const t = await begin(c),
        e = new sdk.HierError("transport_closed", "transport", "B", {});
      Object.defineProperty(e, "data", {
        get() {
          c.m.dispose();
          throw undefined;
        },
      });
      c.wire.close(e);
      const actual = await failure(t.o, "disposed");
      assert.equal(actual.cause, e);
      state(c, "idle", null, []);
    }),
  3,
);
add(
  "disposed-commands",
  "ownership",
  "all commands and hostile load after dispose",
  "disposed Promise rejection before reads, old frozen page readable, synchronous subscribe rejects, SDK survives",
  () =>
    using(async (c) => {
      await finish(c, await begin(c), page());
      const old = c.m.state;
      c.m.dispose();
      const counts = { probes: 0 };
      for (const name of ["load", "loadMore", "reload", "cancel", "clear"])
        local(
          await failure(invoke(c, name, opaque(counts)), "disposed"),
          "disposed",
        );
      assert.equal(counts.probes, 0);
      assert.throws(
        () => c.m.subscribe(() => {}),
        (e) => e.code === "disposed",
      );
      assert.equal(old.pages[0].result.items[0].ref, item().ref);
      assert(Object.isFrozen(old));
      await sdkAlive(c);
    }),
  3,
);
function firstShape(c, t, size = 200) {
  const a = calls(c).at(-1).args;
  assert.equal(a[0], t.query.def);
  assert.deepEqual(a[1], { limit: size });
  assert(a[2] instanceof AbortSignal);
  assert.equal(t.q.params.def, t.query.def);
  assert.equal(t.q.params.limit, size);
  assert.equal(t.q.params.cursor, "");
  assert.equal(Object.hasOwn(t.q.params, "snapshotId"), false);
}
