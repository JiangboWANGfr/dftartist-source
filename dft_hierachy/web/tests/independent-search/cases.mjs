import assert from "node:assert/strict";
import {
  using,
  context,
  invoke,
  begin,
  finish,
  success,
  failure,
  local,
  state,
  calls,
  Q,
  hits,
  kinds,
  page,
  complete,
  partial,
  vm,
  sdk,
  sdkAlive,
  tick,
} from "./harness.mjs";
export const cases = [];
const add = (id, group, input, expected, run, section = 1) =>
  cases.push({
    id: "SR-" + id,
    group,
    input,
    expected,
    basis: "DESIGN §6.22." + section + "; inherited §§6.11/6.9.4/6.10.4/6.6.6",
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
  "frozen idle/no query or SDK events/no-op identity; disposed borrowed SDK remains usable",
  () =>
    using(async (c) => {
      const original = state(c, "idle", null, []);
      assert.equal(c.m.snapshotId, Q.snapshotId);
      assert.equal(c.registrations, 0);
      assert.equal(c.wire.queries.length, 0);
      for (const m of ["loadMore", "reload", "cancel", "clear"])
        await success(invoke(c, m));
      assert.equal(c.m.state, original);
      assert.equal(c.events.length, 0);
      c.m.dispose();
      c.m.dispose();
      state(c, "idle", null, []);
      assert.equal(c.m.disposed, true);
      await sdkAlive(c);
    }),
);
add(
  "not-ready",
  "ownership",
  { ready: false },
  "original SDK snapshot error before options inspection",
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
        const opts = new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              probes++;
              throw undefined;
            },
          },
        );
        assert.throws(
          () => c.newModel(opts),
          (e) => e === original && e !== undefined,
        );
        assert.equal(probes, 0);
        assert.equal(c.wire.queries.length, 0);
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
  ["own-undefined", { pageSize: undefined }],
  ["above-PageLimit", { pageSize: 2147483648 }],
];
for (const [id, value] of badOptions)
  add(
    "options-" + id,
    "options",
    { kind: id },
    "SearchError invalid_options, no query",
    () =>
      using(
        async (c) => {
          assert.throws(
            () => c.newModel(value),
            (e) => e instanceof vm.SearchError && e.code === "invalid_options",
          );
          assert.equal(c.wire.queries.length, 0);
        },
        { withModel: false },
      ),
  );
for (const which of ["default", "inherited", "maximum"])
  add(
    "options-" + which,
    "options",
    which,
    "own projection only, fixed valid limit including PageLimit maximum",
    () =>
      using(
        async (c) => {
          let read = 0;
          const options =
            which === "inherited"
              ? Object.create({
                  get pageSize() {
                    read++;
                    throw undefined;
                  },
                })
              : which === "maximum"
                ? { pageSize: 2147483647 }
                : undefined;
          c.m = c.newModel(options);
          const t = await begin(c);
          assert.equal(
            t.q.params.limit,
            which === "maximum" ? 2147483647 : 200,
          );
          assert.equal(read, 0);
          await finish(c, t);
        },
        { withModel: false },
      ),
  );
for (const site of ["descriptor", "get"])
  add(
    "options-throw-" + site,
    "projection",
    site,
    "constructor invalid_options keeps original cause; no coercion/enumeration",
    () =>
      using(
        async (c) => {
          const raw = Object.freeze({ B60: site }),
            o =
              site === "descriptor"
                ? new Proxy(
                    {},
                    {
                      getOwnPropertyDescriptor() {
                        throw raw;
                      },
                    },
                  )
                : Object.defineProperty({}, "pageSize", {
                    get() {
                      throw raw;
                    },
                  });
          assert.throws(
            () => c.newModel(o),
            (e) => {
              local(e, "invalid_options");
              assert.equal(e.cause, raw);
              return true;
            },
          );
          assert.equal(c.wire.queries.length, 0);
        },
        { withModel: false },
      ),
  );
const badQueries = [
  ["null", null],
  ["array", []],
  ["function", () => {}],
  ["missing-snapshot", { text: "" }],
  ["missing-text", { snapshotId: Q.snapshotId }],
  ["snapshot-empty", { ...Q, snapshotId: "" }],
  ["snapshot-boxed", { ...Q, snapshotId: new String(Q.snapshotId) }],
  ["text-number", { ...Q, text: 7 }],
  ["text-own-undefined", { ...Q, text: undefined }],
  ["kinds-own-undefined", { ...Q, kinds: undefined }],
  ["kinds-string", { ...Q, kinds: "port" }],
  ["scope-own-undefined", { ...Q, scope: undefined }],
  ["scope-empty", { ...Q, scope: "" }],
  ["scope-number", { ...Q, scope: 3 }],
];
for (const [id, q] of badQueries)
  add(
    "argument-" + id,
    "input",
    { kind: id },
    "invalid_argument and unchanged target/pages/task",
    () => using((c) => invalid(c, q)),
  );
add(
  "snapshot-mismatch",
  "input",
  "valid other snapshot",
  "snapshot_mismatch only after valid field projection, old pending not cancelled",
  () =>
    using(async (c) => {
      const t = await begin(c);
      await invalid(c, { ...Q, snapshotId: "B60 other" }, "snapshot_mismatch");
      await finish(c, t);
    }),
);
add(
  "validation-before-binding",
  "input",
  "other snapshot plus invalid kinds",
  "value validation precedes snapshot equality",
  () => using((c) => invalid(c, { ...Q, snapshotId: "B60 other", kinds: [0] })),
);
add(
  "inherited-required",
  "projection",
  "prototype text getter",
  "required fields must be own, no prototype getter read",
  () =>
    using(async (c) => {
      let n = 0;
      const q = Object.assign(
        Object.create({
          get text() {
            n++;
            throw undefined;
          },
        }),
        { snapshotId: Q.snapshotId },
      );
      await invalid(c, q);
      assert.equal(n, 0);
    }),
);
add(
  "projection-order",
  "projection",
  "own top getters, Proxy array and hostile extensions",
  "top descriptors/Get once in order, then length/index own projection; no keys/iterator/coercion; owned frozen capture",
  () =>
    using(async (c) => {
      const seen = [],
        values = ["signal", "port", "signal"],
        array = new Proxy(values, {
          get(t, k, r) {
            seen.push("k:g:" + String(k));
            if (k === Symbol.iterator || k === "extra")
              throw Error("forbidden");
            return Reflect.get(t, k, r);
          },
          getOwnPropertyDescriptor(t, k) {
            seen.push("k:d:" + String(k));
            return Reflect.getOwnPropertyDescriptor(t, k);
          },
          ownKeys() {
            throw Error("no enumeration");
          },
        });
      const data = {
          snapshotId: Q.snapshotId,
          text: Q.text,
          kinds: array,
          scope: "B60:opaque",
        },
        q = new Proxy(data, {
          getOwnPropertyDescriptor(t, k) {
            seen.push("d:" + k);
            return Reflect.getOwnPropertyDescriptor(t, k);
          },
          get(t, k, r) {
            seen.push("g:" + k);
            return Reflect.get(t, k, r);
          },
          ownKeys() {
            throw Error("no enumeration");
          },
        });
      const t = await begin(c, q);
      assert.deepEqual(seen, [
        "d:snapshotId",
        "g:snapshotId",
        "d:text",
        "g:text",
        "d:kinds",
        "g:kinds",
        "d:scope",
        "g:scope",
        "k:g:length",
        "k:d:0",
        "k:g:0",
        "k:d:1",
        "k:g:1",
        "k:d:2",
        "k:g:2",
      ]);
      assert.deepEqual(t.query, {
        ...Q,
        kinds: ["signal", "port", "signal"],
        scope: "B60:opaque",
      });
      assert.notEqual(t.query, q);
      assert.notEqual(t.query.kinds, array);
      const args = calls(c)[0].args;
      assert.equal(Object.getPrototypeOf(args[0].kinds), Array.prototype);
      assert.notEqual(args[0].kinds, t.query.kinds);
      assert.deepEqual(args[0].kinds, ["signal", "port", "signal"]);
      values[0] = "instance";
      data.text = "changed";
      assert.equal(t.query.text, Q.text);
      assert.deepEqual(t.query.kinds, ["signal", "port", "signal"]);
      await finish(c, t);
    }),
);
add(
  "nonenumerable-own",
  "projection",
  "nonenumerable declared fields/indices",
  "own descriptor presence, not enumerability, decides input",
  () =>
    using(async (c) => {
      const a = [];
      Object.defineProperty(a, "0", { value: "port", enumerable: false });
      const q = {};
      for (const [k, v] of Object.entries({ ...Q, kinds: a }))
        Object.defineProperty(q, k, { value: v, enumerable: false });
      const t = await begin(c, q);
      assert.deepEqual(t.query.kinds, ["port"]);
      await finish(c, t);
    }),
);
for (const early of ["missing", "invalid", "mismatch"])
  add(
    "later-throw-" + early,
    "projection",
    early,
    "finish top projection before early validation; preserve raw late cause without disturbing pending",
    () =>
      using(async (c) => {
        const t = await begin(c),
          raw = Object.freeze({ B60: early }),
          q = { ...Q };
        if (early === "missing") delete q.snapshotId;
        else q.snapshotId = early === "invalid" ? 0 : "B60 other";
        Object.defineProperty(q, "scope", {
          get() {
            throw raw;
          },
        });
        const before = c.m.state;
        const e = await failure(invoke(c, "load", q), "invalid_argument");
        assert.equal(e.cause, raw);
        assert.equal(c.m.state, before);
        await finish(c, t);
      }),
  );
for (const [id, make] of [
  ["hole", () => [, "port"]],
  [
    "inherited-index",
    () => {
      const a = new Array(2);
      a[1] = "port";
      Object.setPrototypeOf(a, { 0: "signal" });
      return a;
    },
  ],
  ["boxed-kind", () => [new String("port")]],
  ["unknown-kind", () => ["unknown"]],
  [
    "invalid-length",
    () =>
      new Proxy([], {
        get(t, k, r) {
          return k === "length" ? 4294967296 : Reflect.get(t, k, r);
        },
      }),
  ],
])
  add(
    "kinds-" + id,
    "kinds",
    id,
    "invalid_argument, no implicit iterator/prototype/coercion or enormous index scan",
    () => using((c) => invalid(c, { ...Q, kinds: make() })),
  );
add(
  "hole-finishes-projection",
  "kinds",
  "missing index0 plus index1 getter throw undefined",
  "later index projection error wins before missing-element validation",
  () =>
    using(async (c) => {
      const a = new Array(2);
      let n = 0;
      Object.defineProperty(a, "1", {
        get() {
          n++;
          throw undefined;
        },
      });
      const e = await failure(
        invoke(c, "load", { ...Q, kinds: a }),
        "invalid_argument",
      );
      assert(Object.hasOwn(e, "cause"));
      assert.equal(e.cause, undefined);
      assert.equal(n, 1);
    }),
);
for (const site of ["top-descriptor", "top-get", "length", "index"])
  for (const throws of [false, true])
    add(
      "input-dispose-" + site + "-" + throws,
      "projection",
      { site, throws },
      "dispose immediately stops subsequent field/index reads; same-operation thrown cause retained only if present",
      () =>
        using(async (c) => {
          const raw = Object.freeze({ B60: "input throw" });
          let later = 0;
          const stop = () => {
            c.m.dispose();
            if (throws) throw raw;
            return site === "length" ? 1 : "port";
          };
          let q = { ...Q };
          Object.defineProperty(q, "scope", {
            get() {
              later++;
              return "B60:scope";
            },
          });
          if (site === "top-descriptor")
            q = new Proxy(q, {
              getOwnPropertyDescriptor(t, k) {
                if (k === "text") {
                  stop();
                  return { value: Q.text, configurable: true };
                }
                return Reflect.getOwnPropertyDescriptor(t, k);
              },
            });
          if (site === "top-get")
            Object.defineProperty(q, "text", { get: stop });
          if (site === "length")
            q.kinds = new Proxy(["port"], {
              get(t, k, r) {
                return k === "length" ? stop() : Reflect.get(t, k, r);
              },
            });
          if (site === "index") {
            q.kinds = ["port"];
            Object.defineProperty(q.kinds, "0", { get: stop });
          }
          const e = await failure(invoke(c, "load", q), "disposed");
          local(e, "disposed");
          assert.equal(Object.hasOwn(e, "cause"), throws);
          if (throws) assert.equal(e.cause, raw);
          assert.equal(later, site === "length" || site === "index" ? 1 : 0);
          state(c, "idle", null, []);
        }),
    );
add(
  "input-reentry",
  "projection",
  "getter invokes all five commands",
  "nested commands reject reentrant_change before input access, outer query still succeeds",
  () =>
    using(async (c) => {
      const nested = [];
      let probes = 0;
      const poison = new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              probes++;
              throw undefined;
            },
            get() {
              probes++;
              throw undefined;
            },
          },
        ),
        q = { ...Q };
      Object.defineProperty(q, "text", {
        get() {
          for (const m of ["load", "loadMore", "reload", "cancel", "clear"])
            nested.push(invoke(c, m, poison));
          return Q.text;
        },
      });
      const t = await begin(c, q);
      for (const o of nested)
        local(await failure(o, "reentrant_change"), "reentrant_change");
      assert.equal(probes, 0);
      await finish(c, t);
      assert.equal(calls(c).length, 1);
    }),
);
for (const text of ["", " ", "*", "Flag", "flag"])
  add(
    "literal-" + encodeURIComponent(text),
    "input",
    { text },
    "raw literal text including empty/space/case/star reaches SDK unchanged",
    () =>
      using(async (c) => {
        const t = await begin(c, { ...Q, text });
        assert.equal(calls(c)[0].args[0].text, text);
        assert.equal(t.q.params.text, text);
        firstShape(c, t);
        await finish(c, t);
      }),
  );
function firstShape(c, t) {
  const a = calls(c).at(-1).args;
  assert.equal(Object.hasOwn(a[0], "snapshotId"), false);
  assert.equal(Object.hasOwn(a[1], "cursor"), false);
  assert.equal(t.q.params.cursor, "");
}
add(
  "filter-representation",
  "identity",
  "omitted, empty, reordered and repeated kinds; omitted/explicit scope",
  "same values no-op, submitted representation changes new query even if SDK normalizes",
  () =>
    using(async (c) => {
      const reps = [
        { ...Q },
        { ...Q, kinds: [] },
        { ...Q, kinds: ["port", "signal"] },
        { ...Q, kinds: ["signal", "port"] },
        { ...Q, kinds: ["signal", "port", "port"] },
        { ...Q, kinds: ["signal", "port", "port"], scope: "B60:scope" },
      ];
      for (const q of reps) {
        const t = await begin(c, q);
        assert.deepEqual(t.query, q);
        const args = calls(c).at(-1).args[0];
        assert.equal(Object.hasOwn(args, "kinds"), Object.hasOwn(q, "kinds"));
        if (q.kinds) assert.deepEqual(args.kinds, q.kinds);
        await finish(c, t);
        const previous = c.m.state,
          n = calls(c).length;
        await success(
          invoke(c, "load", {
            ...q,
            ...(q.kinds ? { kinds: [...q.kinds] } : {}),
          }),
        );
        assert.equal(c.m.state, previous);
        assert.equal(calls(c).length, n);
      }
    }),
);
add(
  "empty-kinds-calls-Core",
  "identity",
  "kinds[] with semantic scope error",
  "do not forge empty result or bypass Core error, original HierError",
  () =>
    using(async (c) => {
      const t = await begin(c, { ...Q, kinds: [], scope: "B60:not-instance" });
      assert.deepEqual(calls(c)[0].args[0].kinds, []);
      c.wire.fail(t.q, "bad_request");
      const e = await failure(t.o, "bad_request");
      assert.equal(e, calls(c)[0].error);
      assert(e instanceof sdk.HierError);
      state(c, "failed", t.query, []);
    }, undefined),
  2,
);
add(
  "original-pages",
  "pages",
  "all six kinds, duplicate row and same-name port/signal split over pages",
  "original SDK Reply/items/extensions identities and order, one page per explicit command; no flat DTO",
  () =>
    using(
      async (c) => {
        const values = [...hits(), hits()[2]],
          t = await begin(c);
        firstShape(c, t);
        assert.equal(t.q.params.limit, 4);
        await finish(c, t, page(values.slice(0, 4), "B60-next"));
        const prefix = c.m.state,
          reply = prefix.pages[0];
        assert.equal(calls(c).length, 1);
        const more = await begin(c, Q, "loadMore");
        assert.equal(more.q.params.cursor, "B60-next");
        assert.equal(c.m.state.pages[0], reply);
        await finish(c, more, page(values.slice(4)));
        const s = state(c, "success");
        assert.deepEqual(
          s.pages.flatMap((p) => p.result.items),
          values,
        );
        assert.equal(s.pages[0], reply);
        assert.equal(prefix.pages.length, 1);
        assert.equal(c.events.length, 4);
        assert.equal(calls(c).length, 2);
        await success(invoke(c, "loadMore"));
        assert.equal(c.m.state, s);
      },
      { options: { pageSize: 4 } },
    ),
  2,
);
for (const nonempty of [false, true])
  for (const next of [false, true])
    add(
      "partial-" + nonempty + "-" + next,
      "partial",
      { nonempty, next, prefix: nonempty },
      "partial is success retaining original reasons/next/items and earlier complete prefix; loadMore and same-query load no-op, explicit reload recovers first",
      () =>
        using(async (c) => {
          if (nonempty) await finish(c, await begin(c), page([], "B60-prefix"));
          const t = await begin(c, Q, nonempty ? "loadMore" : "load");
          await finish(
            c,
            t,
            page(
              nonempty ? [hits()[0]] : [],
              next ? "B60-partial-next" : undefined,
            ),
            partial,
          );
          const s = c.m.state,
            n = calls(c).length;
          assert.equal(
            s.pages.at(-1).completeness,
            calls(c).at(-1).reply.completeness,
          );
          if (nonempty)
            assert.equal(s.pages[0].completeness.status, "complete");
          await success(invoke(c, "loadMore"));
          await success(invoke(c, "load", { ...Q }));
          assert.equal(c.m.state, s);
          assert.equal(calls(c).length, n);
          const again = await begin(c, Q, "reload");
          firstShape(c, again);
          assert.deepEqual(c.m.state.pages, []);
          await finish(c, again);
        }),
      2,
    );
add(
  "complete-empty",
  "pages",
  "complete empty page/no next",
  "success exhausted no-op, not partial guarantee",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      const before = c.m.state;
      await success(invoke(c, "loadMore"));
      assert.equal(c.m.state, before);
      assert.equal(calls(c).length, 1);
    }),
  2,
);
for (const mode of ["too-many", "self-cursor", "prior-cursor"])
  add(
    "bad-page-" + mode,
    "pages",
    mode,
    "inconsistent_reply never appends bad page/next; prefix retained and retry same cursor",
    () =>
      using(
        async (c) => {
          const a = await begin(c);
          await finish(c, a, page([hits()[0]], "B60-a"));
          if (mode === "prior-cursor")
            await finish(
              c,
              await begin(c, Q, "loadMore"),
              page([hits()[1]], "B60-b"),
            );
          const prefix = [...c.m.state.pages],
            t = await begin(c, Q, "loadMore"),
            cursor = t.q.params.cursor;
          c.wire.ok(
            t.q,
            mode === "too-many"
              ? page([hits()[0], hits()[1]])
              : page([], mode === "self-cursor" ? cursor : "B60-a"),
          );
          local(await failure(t.o, "inconsistent_reply"), "inconsistent_reply");
          state(c, "failed", t.query, prefix);
          const retry = await begin(c, Q, "loadMore");
          assert.equal(retry.q.params.cursor, cursor);
          await finish(c, retry);
        },
        { options: { pageSize: 1 } },
      ),
    2,
  );
add(
  "chain-reset",
  "pages",
  "reuse previous next after reload/clear/new load",
  "cursor history only current chain, no false loop across reset",
  () =>
    using(async (c) => {
      await finish(c, await begin(c), page([], "B60-same"));
      await finish(c, await begin(c, Q, "reload"), page([], "B60-same"));
      await success(invoke(c, "clear"));
      await finish(c, await begin(c), page([], "B60-same"));
    }),
  2,
);
add(
  "joiners",
  "tasks",
  "load/loadMore join first and later pending page",
  "each caller settles once, one SDK call per task, joined same-query does not restart",
  () =>
    using(async (c) => {
      for (const method of ["load", "loadMore"]) {
        const t = await begin(c, Q, method),
          a = invoke(c, "load", { ...Q }),
          b = invoke(c, "loadMore"),
          n = calls(c).length;
        c.wire.ok(t.q, page([], method === "load" ? "B60-more" : undefined));
        for (const o of [t.o, a, b]) await success(o);
        assert.equal(calls(c).length, n);
      }
    }),
  3,
);
for (const action of ["cancel", "clear", "replace"])
  add(
    "late-" + action,
    "tasks",
    action,
    "old waiters cancelled, late response cannot append/change current query or make next page",
    () =>
      using(async (c) => {
        const t = await begin(c),
          join = invoke(c, "loadMore");
        let fresh;
        if (action === "replace")
          fresh = await begin(c, { ...Q, text: "other" });
        else await success(invoke(c, action));
        await failure(t.o, "cancelled");
        await failure(join, "cancelled");
        const before = c.m.state,
          n = calls(c).length;
        c.wire.ok(t.q, page(hits(), "B60-old"));
        await tick();
        assert.equal(c.m.state, before);
        assert.equal(calls(c).length, n);
        if (fresh) await finish(c, fresh);
      }),
    3,
  );
for (const kind of ["error", "cancel"])
  add(
    "retry-page-" + kind,
    "tasks",
    kind,
    "failure/cancel keeps successful prefix; loadMore retries uncommitted cursor; same-query load after failure starts first",
    () =>
      using(async (c) => {
        await finish(c, await begin(c), page([], "B60-retry"));
        const prefix = [...c.m.state.pages],
          t = await begin(c, Q, "loadMore");
        if (kind === "cancel") await success(invoke(c, "cancel"));
        else c.wire.fail(t.q, "not_found");
        await failure(t.o, kind === "cancel" ? "cancelled" : "not_found");
        assert.deepEqual(c.m.state.pages, prefix);
        const retry = await begin(c, Q, "loadMore");
        assert.equal(retry.q.params.cursor, "B60-retry");
        await finish(c, retry, page([], "B60-next2"));
        const again = await begin(c, Q, "loadMore");
        if (kind === "cancel") await success(invoke(c, "cancel"));
        else c.wire.fail(again.q, "not_found");
        await failure(again.o, kind === "cancel" ? "cancelled" : "not_found");
        const fresh = await begin(c);
        firstShape(c, fresh);
        assert.deepEqual(c.m.state.pages, []);
        await finish(c, fresh);
      }),
    3,
  );
add(
  "stale-cursor",
  "tasks",
  "SDK stale_cursor after committed page",
  "original error/prefix retained; loadMore same error without request, reload first rebuild",
  () =>
    using(async (c) => {
      await finish(c, await begin(c), page([], "B60-stale"));
      const prefix = [...c.m.state.pages],
        t = await begin(c, Q, "loadMore");
      c.wire.fail(t.q, "stale_cursor");
      const e = await failure(t.o, "stale_cursor");
      assert.equal(e, calls(c).at(-1).error);
      const n = calls(c).length;
      assert.equal(await failure(invoke(c, "loadMore")), e);
      assert.equal(calls(c).length, n);
      state(c, "failed", Q, prefix);
      await finish(c, await begin(c, Q, "reload"));
    }),
  3,
);
add(
  "borrowed-shared",
  "tasks",
  "two models and direct SDK on same search, cancel one",
  "local abort does not harm other consumers; disposed model leaves ready SDK",
  () =>
    using(async (c) => {
      const t = await begin(c),
        other = c.newModel(),
        p = observeModel(c, other.load(Q)),
        direct = c.client.search({ text: Q.text }, { limit: 200 });
      direct.catch(() => {});
      await success(invoke(c, "cancel"));
      await failure(t.o, "cancelled");
      c.wire.ok(t.q, page([]));
      await success(p);
      await direct;
      assert.equal(other.state.status, "success");
      assert.equal(c.m.state.status, "cancelled");
      c.m.dispose();
      await sdkAlive(c);
    }),
  3,
);
function observeModel(c, p) {
  const o = { count: 0 };
  o.settled = p.then(
    (value) => {
      o.count++;
      return { ok: true, value };
    },
    (error) => {
      o.count++;
      return { ok: false, error };
    },
  );
  c.commands.push(o);
  return o;
}
add(
  "subscriptions",
  "notifications",
  "independent duplicates/remove/add during publish",
  "no replay, snapshot order, new listener next batch, idempotent old off and disposed priority",
  () =>
    using(async (c) => {
      const seen = [],
        fn = () => seen.push("dup"),
        a = c.m.subscribe(fn),
        b = c.m.subscribe(fn);
      let off,
        added = false;
      const first = c.m.subscribe(() => {
        seen.push("first");
        off();
        if (!added) {
          c.m.subscribe(() => seen.push("new"));
          added = true;
        }
      });
      off = c.m.subscribe(() => seen.push("removed"));
      assert.deepEqual(seen, []);
      const t = await begin(c);
      assert.deepEqual(seen, ["dup", "dup", "first"]);
      a();
      a();
      seen.length = 0;
      await finish(c, t);
      assert.deepEqual(seen, ["dup", "first", "new"]);
      first();
      b();
      off();
      assert.throws(
        () => c.m.subscribe(null),
        (e) => e.code === "invalid_argument",
      );
      c.m.dispose();
      assert.throws(
        () => c.m.subscribe(null),
        (e) => e.code === "disposed",
      );
      a();
      b();
      off();
    }),
  3,
);
for (const phase of ["pending", "success", "failed", "cancelled"])
  add(
    "notify-throw-" + phase,
    "notifications",
    phase,
    "continue listeners, original AggregateError order/cause, committed page/state never rolled back; all joiners same aggregate",
    () =>
      using(async (c) => {
        const raw = [undefined, Object.freeze({ B60: "listener" })],
          seen = [];
        c.m.subscribe(() => {
          if (c.m.state.status === phase) {
            seen.push(1);
            throw raw[0];
          }
        });
        c.m.subscribe(() => {
          if (c.m.state.status === phase) {
            seen.push(2);
            throw raw[1];
          }
        });
        c.m.subscribe(() => {
          if (c.m.state.status === phase) seen.push(3);
        });
        const t = await begin(c),
          a = invoke(c, "load", Q),
          b = invoke(c, "loadMore");
        if (phase === "failed" || phase === "cancelled")
          c.wire.fail(t.q, phase === "failed" ? "not_found" : "cancelled");
        else c.wire.ok(t.q, page([]));
        for (const o of [t.o, a, b]) {
          const e = await failure(o);
          assert(e instanceof AggregateError);
          assert.deepEqual(e.errors, raw);
          if (phase === "failed" || phase === "cancelled")
            assert.equal(e.cause, calls(c).at(-1).error);
        }
        assert.deepEqual(seen, [1, 2, 3]);
        assert.equal(c.m.state.status, phase === "pending" ? "success" : phase);
      }),
    3,
  );
add(
  "notify-reentry",
  "notifications",
  "pending listener invokes five commands with hostile query",
  "all command/no-op reentry rejected before input/query mutation",
  () =>
    using(async (c) => {
      const nested = [];
      let reads = 0;
      c.m.subscribe(() => {
        if (c.m.state.status === "pending") {
          const bad = new Proxy(
            {},
            {
              getOwnPropertyDescriptor() {
                reads++;
                throw undefined;
              },
            },
          );
          for (const m of ["load", "loadMore", "reload", "cancel", "clear"])
            nested.push(invoke(c, m, bad));
        }
      });
      const t = await begin(c);
      for (const o of nested) await failure(o, "reentrant_change");
      assert.equal(reads, 0);
      await finish(c, t);
      assert.equal(calls(c).length, 1);
    }),
  3,
);
for (const phase of ["pending", "success", "failed", "cancelled"])
  add(
    "notify-dispose-" + phase,
    "ownership",
    phase,
    "dispose synchronous/no notification, stops later listeners and takes over unsettled commands with prior cause",
    () =>
      using(async (c) => {
        let after = 0;
        c.m.subscribe(() => {
          if (c.m.state.status === phase) c.m.dispose();
        });
        c.m.subscribe(() => after++);
        const o = invoke(c, "load", Q);
        if (phase !== "pending") {
          const q = await c.wire.next("search");
          if (phase === "success") c.wire.ok(q, page([]));
          else c.wire.fail(q, phase === "failed" ? "not_found" : "cancelled");
        }
        const e = await failure(o, "disposed");
        assert.equal(after, phase === "pending" ? 0 : 1);
        state(c, "idle", null, []);
        assert.equal(c.m.disposed, true);
        if (phase === "failed" || phase === "cancelled")
          assert.equal(e.cause, calls(c).at(-1).error);
        await sdkAlive(c);
      }),
    3,
  );
for (const action of ["cancel", "clear"])
  add(
    "action-dispose-" + action,
    "ownership",
    action,
    "action notification dispose takes over original task/joiner/action; cancelled prior cause kept",
    () =>
      using(async (c) => {
        const t = await begin(c),
          joined = invoke(c, "loadMore");
        c.m.subscribe(() => {
          if (c.m.state.status === (action === "clear" ? "idle" : "cancelled"))
            c.m.dispose();
        });
        const own = invoke(c, action);
        for (const o of [t.o, joined]) {
          const e = await failure(o, "disposed");
          assert.equal(e.cause.code, "cancelled");
        }
        await failure(own, "disposed");
        state(c, "idle", null, []);
      }),
    3,
  );
add(
  "listener-promise",
  "notifications",
  "listener returns unresolved Promise",
  "model does not await listener return; public command still settles normally",
  () =>
    using(async (c) => {
      c.m.subscribe(() => new Promise(() => {}));
      await finish(c, await begin(c));
    }),
  3,
);
for (const raw of [undefined, Object.freeze({ B60: "SDK throw" })])
  add(
    "unexpected-SDK-" + (raw === undefined ? "undefined" : "object"),
    "errors",
    "public SDK method throws unknown",
    "local inconsistent_reply keeps raw cause, failed diagnostic origin search",
    () =>
      using(async (c) => {
        c.client.search = () => {
          throw raw;
        };
        const o = invoke(c, "load", Q),
          e = await failure(o, "inconsistent_reply");
        local(e, "inconsistent_reply");
        assert.equal(e.cause, raw);
        assert(Object.hasOwn(e, "cause"));
        assert.equal(c.m.state.error.origin, "search");
        assert.deepEqual(c.m.state.error.data, {});
      }),
    3,
  );
add(
  "diagnostic-cycle",
  "diagnostics",
  "SDK HierError cyclic/shared mutable data",
  "original SDK error identity, own deep frozen diagnostic copy with aliases, original not frozen",
  () =>
    using(async (c) => {
      const t = await begin(c),
        shared = { v: 1 },
        data = { a: shared, b: shared };
      data.self = data;
      const e = new sdk.HierError(
        "transport_closed",
        "transport",
        "B60 original",
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
      assert(Object.isFrozen(f.data));
      assert.equal(Object.isFrozen(data), false);
      assert.equal(Object.hasOwn(f, "dataIssue"), false);
    }),
  3,
);
add(
  "diagnostic-read",
  "diagnostics",
  "data getter throws undefined",
  "accurate dataIssue/read/empty path, empty frozen data and original error, no later access",
  () =>
    using(async (c) => {
      const t = await begin(c),
        e = new sdk.HierError(
          "transport_closed",
          "transport",
          "B60 original",
          {},
        );
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
  "data getter disposes then throws undefined",
  "disposed wins, prior SDK error is cause, no dataIssue/error publication or late getter",
  () =>
    using(async (c) => {
      const t = await begin(c),
        e = new sdk.HierError(
          "transport_closed",
          "transport",
          "B60 original",
          {},
        );
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
  "all no-op commands and hostile load after release",
  "disposed rejects before parameter access, old frozen page readable, SDK still borrowed",
  () =>
    using(async (c) => {
      await finish(c, await begin(c), page([hits()[0]]));
      const old = c.m.state;
      c.m.dispose();
      let probes = 0;
      const q = new Proxy(
        {},
        {
          getOwnPropertyDescriptor() {
            probes++;
            throw undefined;
          },
        },
      );
      for (const method of ["load", "loadMore", "reload", "cancel", "clear"])
        local(await failure(invoke(c, method, q), "disposed"), "disposed");
      assert.equal(probes, 0);
      assert.equal(old.pages[0].result.items[0].kind, "definition");
      await sdkAlive(c);
    }),
  3,
);
