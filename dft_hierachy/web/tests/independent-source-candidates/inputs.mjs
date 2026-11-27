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
  Q,
  page,
  vm,
  opaque,
} from "./harness.mjs";
const fields = ["snapshotId", "file", "line", "col"];
const invalidQueries = [
  ["undefined", undefined],
  ["null", null],
  ["array", []],
  ["string", "B"],
  ["number", 7],
  ["function", () => {}],
  ["boxed", new String("B")],
];
for (const [name, value] of invalidQueries)
  add(
    "query-" + name,
    "input",
    { shape: name },
    "invalid_argument; old task unchanged and completes",
    () =>
      using(async (c) => {
        const t = await begin(c),
          s = c.m.state,
          n = c.calls.length;
        local(
          await failure(invoke(c, "load", value), "invalid_argument"),
          "invalid_argument",
        );
        assert.equal(c.m.state, s);
        assert.equal(c.calls.length, n);
        await finish(c, t);
      }),
  );
const invalidString = [
  ["empty", ""],
  ["number", 1],
  ["undefined", undefined],
  ["null", null],
  ["boxed", new String("x")],
  ["object", {}],
];
const invalidNumber = [
  ["zero", 0],
  ["negative", -1],
  ["fraction", 1.5],
  ["string", "1"],
  ["undefined", undefined],
  ["null", null],
  ["nan", NaN],
  ["infinity", Infinity],
  ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ["boxed", new Number(1)],
];
for (const key of fields)
  for (const [name, value] of key === "snapshotId" || key === "file"
    ? invalidString
    : invalidNumber)
    add(
      "field-" + key + "-" + name,
      "input",
      { field: key, shape: name },
      "invalid_argument, no coercion/cancel/state/query; pending original finishes",
      () =>
        using(async (c) => {
          const t = await begin(c),
            s = c.m.state,
            n = c.calls.length;
          await failure(
            invoke(c, "load", { ...Q, [key]: value }),
            "invalid_argument",
          );
          assert.equal(c.m.state, s);
          assert.equal(c.calls.length, n);
          await finish(c, t);
        }),
    );
for (const key of fields.slice(0, 3))
  for (const inherited of [false, true])
    add(
      "required-" + key + "-" + inherited,
      "input",
      { key, inherited },
      "missing/only inherited field rejects without inherited Get",
      () =>
        using(async (c) => {
          let reads = 0;
          const input = { ...Q };
          delete input[key];
          if (inherited)
            Object.setPrototypeOf(
              input,
              Object.defineProperty({}, key, {
                get() {
                  reads++;
                  throw Error("forbidden inherited");
                },
              }),
            );
          await failure(invoke(c, "load", input), "invalid_argument");
          assert.equal(reads, 0);
          assert.equal(c.calls.length, 0);
          assert.equal(c.events.length, 0);
        }),
    );
for (const col of ["absent", 1, Number.MAX_SAFE_INTEGER])
  add(
    "projection-valid-" + col,
    "input",
    { col },
    "only four own fields probed/Get once in order; extensions/prototype unobserved; strip snapshot from wire; preserve coordinate",
    () =>
      using(async (c) => {
        const log = [],
          target = {
            ...Q,
            line: 4294967295,
            ...(col === "absent" ? {} : { col }),
          };
        Object.defineProperty(target, "extension", {
          enumerable: true,
          get() {
            throw Error("forbidden extension");
          },
        });
        const input = new Proxy(target, {
          ownKeys() {
            throw Error("forbidden enumeration");
          },
          getPrototypeOf() {
            throw Error("forbidden prototype");
          },
          getOwnPropertyDescriptor(t, k) {
            log.push("has:" + k);
            return Reflect.getOwnPropertyDescriptor(t, k);
          },
          get(t, k, r) {
            log.push("get:" + k);
            return Reflect.get(t, k, r);
          },
        });
        const t = await begin(c, input);
        assert.deepEqual(
          log,
          fields.flatMap((k) => [
            "has:" + k,
            ...(Object.hasOwn(target, k) ? ["get:" + k] : []),
          ]),
        );
        assert.deepEqual(t.q.params, {
          file: Q.file,
          line: 4294967295,
          limit: 200,
          cursor: "",
          ...(col === "absent" ? {} : { col }),
        });
        assert.deepEqual(c.m.state.query, {
          ...Q,
          line: 4294967295,
          ...(col === "absent" ? {} : { col }),
        });
        assert.notEqual(c.m.state.query, input);
        await finish(c, t, page([]));
      }),
  );
add(
  "col-identity",
  "input",
  { line: 7, col: 1 },
  "same values no-op, omission != explicit col, new target request not normalized",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      const old = c.m.state;
      await success(invoke(c, "load", { ...Q }));
      assert.equal(c.m.state, old);
      const t = await begin(c, { ...Q, col: 1 });
      assert.equal(t.q.params.col, 1);
      await finish(c, t);
      const r = await begin(c, { ...Q });
      assert.equal("col" in r.q.params, false);
      await finish(c, r);
    }),
);
add(
  "snapshot-mismatch-last",
  "input",
  { snapshot: "other" },
  "all four reads/primitive validation before snapshot check; previous task preserved",
  () =>
    using(async (c) => {
      const t = await begin(c),
        s = c.m.state,
        reads = [];
      const query = {};
      for (const k of fields)
        Object.defineProperty(query, k, {
          get() {
            reads.push(k);
            return k === "snapshotId" ? "B-other" : k === "col" ? 1 : Q[k];
          },
        });
      await failure(invoke(c, "load", query), "snapshot_mismatch");
      assert.deepEqual(reads, fields);
      assert.equal(c.m.state, s);
      await finish(c, t);
    }),
);
for (const early of ["missing", "invalid", "mismatch"])
  add(
    "projection-before-validation-" + early,
    "input",
    { early, later: "col throws" },
    "later projection exception wins missing/illegal/foreign snapshot; original cause untouched",
    () =>
      using(async (c) => {
        const query = { ...Q },
          thrown = { B: "col getter" };
        if (early === "missing") delete query.snapshotId;
        if (early === "invalid") query.snapshotId = 7;
        if (early === "mismatch") query.snapshotId = "B-other";
        Object.defineProperty(query, "col", {
          get() {
            throw thrown;
          },
        });
        const e = await failure(invoke(c, "load", query), "invalid_argument");
        assert.equal(e.cause, thrown);
        assert.equal(c.calls.length, 0);
      }),
  );
for (const key of fields)
  for (const operation of ["descriptor", "get"])
    for (const release of ["throw", "dispose", "dispose-throw"])
      add(
        "projection-" + key + "-" + operation + "-" + release,
        "input-boundaries",
        { key, operation, release },
        "stop immediately; disposed priority/cause precise; no thrown-value probes; no subsequent field reads",
        () =>
          using(async (c) => {
            const log = [],
              counts = { probes: 0 },
              thrown = opaque(counts),
              target = { ...Q, col: 1 };
            const hook = () => {
              if (release !== "throw") c.m.dispose();
              if (release !== "dispose") throw thrown;
              return operation === "get"
                ? target[key]
                : Reflect.getOwnPropertyDescriptor(target, key);
            };
            const query = new Proxy(target, {
              getOwnPropertyDescriptor(t, k) {
                log.push("has:" + k);
                return k === key && operation === "descriptor"
                  ? hook()
                  : Reflect.getOwnPropertyDescriptor(t, k);
              },
              get(t, k, r) {
                log.push("get:" + k);
                return k === key && operation === "get"
                  ? hook()
                  : Reflect.get(t, k, r);
              },
            });
            const e = await failure(
              invoke(c, "load", query),
              release === "throw" ? "invalid_argument" : "disposed",
            );
            const before = fields
              .slice(0, fields.indexOf(key))
              .flatMap((k) => ["has:" + k, "get:" + k]);
            assert.deepEqual(log, [
              ...before,
              "has:" + key,
              ...(operation === "get" ? ["get:" + key] : []),
            ]);
            if (release === "dispose")
              assert.equal(Object.hasOwn(e, "cause"), false);
            else assert.equal(e.cause, thrown);
            assert.equal(counts.probes, 0);
            assert.equal(c.calls.length, 0);
            assert.equal(c.events.length, 0);
          }),
      );
for (const method of ["load", "loadMore", "reload", "cancel", "clear"])
  add(
    "input-reentrant-" + method,
    "input-boundaries",
    { method },
    "even no-op command rejects reentrant_change, nested argument not probed; outer projection succeeds",
    () =>
      using(async (c) => {
        let nested,
          probes = 0;
        const bad = new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              probes++;
              throw Error("nested input");
            },
          },
        );
        const query = { ...Q };
        Object.defineProperty(query, "file", {
          get() {
            nested = invoke(c, method, bad);
            return Q.file;
          },
        });
        const t = await begin(c, query);
        await failure(nested, "reentrant_change");
        assert.equal(probes, 0);
        await finish(c, t);
      }),
  );
const badOptions = [
  ["null", null],
  ["array", []],
  ["function", () => {}],
  ["number", 1],
  ["string", "x"],
  ...[
    ["undefined", undefined],
    ["zero", 0],
    ["negative", -1],
    ["fraction", 1.2],
    ["string-limit", "2"],
    ["nan", NaN],
    ["infinity", Infinity],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
    ["page-limit-overflow", 2147483648],
    ["boxed", new Number(2)],
  ].map(([n, v]) => [n, { pageSize: v }]),
];
for (const [name, value] of badOptions)
  add(
    "options-" + name,
    "options",
    { shape: name },
    "synchronous invalid_options; no model task/query",
    () =>
      using(
        async (c) => {
          assert.throws(
            () => new vm.SourceCandidatesModel(c.client, value),
            (e) =>
              e instanceof vm.SourceCandidatesError &&
              e.code === "invalid_options",
          );
          assert.equal(c.calls.length, 0);
          assert.equal(c.registrations, 0);
        },
        { withModel: false },
      ),
  );
for (const name of [
  "absent",
  "undefined",
  "inherited",
  "one",
  "max",
  "getter",
  "extension",
])
  add(
    "options-valid-" + name,
    "options",
    { shape: name },
    "default/valid own pageSize copied; probe/Get once, no inherited/extension reads",
    () =>
      using(
        async (c) => {
          let has = 0,
            get = 0;
          let raw;
          if (name === "undefined") raw = undefined;
          else if (name === "inherited")
            raw = Object.create(
              Object.defineProperty({}, "pageSize", {
                get() {
                  throw Error("inherited");
                },
              }),
            );
          else
            raw =
              name === "one"
                ? { pageSize: 1 }
                : name === "max"
                  ? { pageSize: 2147483647 }
                  : name === "getter"
                    ? Object.defineProperty({}, "pageSize", {
                        get() {
                          get++;
                          return 3;
                        },
                      })
                    : {};
          if (raw) {
            Object.defineProperty(raw, "extra", {
              enumerable: true,
              get() {
                throw Error("extension");
              },
            });
            raw = new Proxy(raw, {
              ownKeys() {
                throw Error("enumerate");
              },
              getOwnPropertyDescriptor(t, k) {
                assert.equal(k, "pageSize");
                has++;
                return Reflect.getOwnPropertyDescriptor(t, k);
              },
            });
          }
          c.m = c.newModel(raw);
          const t = await begin(c);
          assert.equal(
            t.q.params.limit,
            name === "one"
              ? 1
              : name === "max"
                ? 2147483647
                : name === "getter"
                  ? 3
                  : 200,
          );
          assert.equal(has, name === "undefined" ? 0 : 1);
          assert.equal(get, name === "getter" ? 1 : 0);
          await finish(c, t, page([]));
        },
        { withModel: false },
      ),
  );
for (const operation of ["descriptor", "get"])
  add(
    "options-throw-" + operation,
    "options",
    { operation },
    "invalid_options keeps exact cause without probing thrown value",
    () =>
      using(
        async (c) => {
          const counts = { probes: 0 },
            thrown = opaque(counts);
          const opts =
            operation === "descriptor"
              ? new Proxy(
                  {},
                  {
                    getOwnPropertyDescriptor() {
                      throw thrown;
                    },
                  },
                )
              : Object.defineProperty({}, "pageSize", {
                  get() {
                    throw thrown;
                  },
                });
          assert.throws(
            () => new vm.SourceCandidatesModel(c.client, opts),
            (e) => e.code === "invalid_options" && e.cause === thrown,
          );
          assert.equal(counts.probes, 0);
        },
        { withModel: false },
      ),
  );
