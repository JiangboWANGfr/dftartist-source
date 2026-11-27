import assert from "node:assert/strict";
import { add } from "./cases.mjs";
import {
  using,
  invoke,
  begin,
  second,
  success,
  failure,
  local,
  deep,
  opaque,
  sdk,
} from "./harness.mjs";
const issue = (operation, path) => ({
  code: "data_read_failed",
  operation,
  path,
});
const get = (object, key, fn) =>
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    get: fn,
  });
async function atStage(c, stage) {
  const t = await begin(c);
  return stage === "source" ? t : await second(c, t);
}
function attach(site, hook, data, error) {
  if (site === "data") {
    Object.defineProperty(error, "data", { get: hook });
    return issue("read", []);
  }
  if (site === "field") {
    get(data, "bad", hook);
    return issue("read", ["bad"]);
  }
  if (site.startsWith("nested:")) {
    const key = site.slice(7);
    data.branch = {};
    get(data.branch, key, hook);
    return issue("read", ["branch", key]);
  }
  if (site === "enumerate") {
    data.branch = new Proxy({ v: 1 }, { ownKeys: hook });
    return issue("enumerate", ["branch"]);
  }
  if (site === "descriptor") {
    data.branch = new Proxy(
      { v: 1 },
      {
        getOwnPropertyDescriptor(t, k) {
          return k === "v" ? hook() : Reflect.getOwnPropertyDescriptor(t, k);
        },
      },
    );
    return issue("inspect", ["branch", "v"]);
  }
  if (site === "length") {
    data.items = new Proxy([], {
      get(t, k, r) {
        return k === "length" ? hook() : Reflect.get(t, k, r);
      },
    });
    return issue("read", ["items", "length"]);
  }
  if (site === "index") {
    data.items = [];
    get(data.items, "2", hook);
    return issue("read", ["items", "2"]);
  }
  if (site === "revoked") {
    const r = Proxy.revocable({}, {});
    r.revoke();
    data.branch = r.proxy;
    return issue("inspect", ["branch"]);
  }
  throw Error("B unknown diagnostic site");
}
const sites = [
  "data",
  "field",
  "nested:a.b",
  "nested:/x",
  "nested:",
  "nested:尾",
  "enumerate",
  "descriptor",
  "length",
  "index",
  "revoked",
];
for (const stage of ["source", "readSource"])
  for (const site of sites)
    for (const thrown of site === "revoked"
      ? ["undefined"]
      : ["undefined", "opaque"])
      add(
        `SD-R-read-${stage}-${encodeURIComponent(site)}-${thrown}`,
        "diagnostics",
        { stage, site, thrown },
        "exact first dataIssue; empty frozen data; original HierError identity; stop later reads; no thrown-value probing",
        () =>
          using(async (c) => {
            const t = await atStage(c, stage),
              before = c.m.state,
              data = { prefix: "B original" },
              e = new sdk.HierError(
                "transport_closed",
                "transport",
                "B diagnostic",
                data,
              );
            let hits = 0,
              later = 0;
            const counts = { probes: 0 },
              value = thrown === "opaque" ? opaque(counts) : undefined;
            const expected = attach(
              site,
              () => {
                hits++;
                assert.equal(c.m.state, before);
                throw value;
              },
              data,
              e,
            );
            get(data, "later", () => {
              later++;
              return 1;
            });
            c.wire.close(e);
            assert.equal(await failure(t.o), e);
            assert.equal(c.m.state.status, "failed");
            assert.equal(c.m.state.error.code, e.code);
            assert.equal(c.m.state.error.origin, e.origin);
            assert.equal(c.m.state.error.message, e.message);
            assert.deepEqual(c.m.state.error.data, {});
            assert.deepEqual(c.m.state.error.dataIssue, expected);
            deep(c.m.state);
            assert.equal(later, 0);
            assert.equal(counts.probes, 0);
            if (site !== "revoked") assert.equal(hits, 1);
            assert.equal(Object.isFrozen(e), false);
            assert.equal(Object.isFrozen(data), false);
          }),
        "§6.10.4 → §6.6.6 inspect/enumerate/Get boundaries",
      );
for (const stage of ["source", "readSource"])
  for (const site of ["data", "field", "enumerate", "descriptor", "length"])
    for (const throwAfter of [false, true])
      add(
        `SD-R-dispose-${stage}-${site}-${throwAfter}`,
        "diagnostics",
        { stage, site, throwAfter },
        "dispose after external operation wins, original terminal cause; stop reads, no failed/dataIssue/revival or extra notification",
        () =>
          using(async (c) => {
            const t = await atStage(c, stage),
              data = {},
              e = new sdk.HierError(
                "transport_closed",
                "transport",
                "B before-dispose",
                data,
              ),
              n = c.events.length;
            let later = 0,
              hits = 0;
            const counts = { probes: 0 };
            attach(
              site,
              () => {
                hits++;
                c.m.dispose();
                assert.equal(c.m.disposed, true);
                assert.deepEqual(c.m.state, { status: "idle", target: null });
                if (throwAfter) throw opaque(counts);
                return site === "enumerate"
                  ? []
                  : site === "descriptor"
                    ? {
                        value: 3,
                        enumerable: true,
                        configurable: true,
                        writable: true,
                      }
                    : 0;
              },
              data,
              e,
            );
            get(data, "later", () => {
              later++;
              return 1;
            });
            c.wire.close(e);
            const own = await failure(t.o, "disposed");
            local(own, "disposed");
            assert.equal(own.cause, e);
            assert.equal(hits, 1);
            assert.equal(later, 0);
            assert.equal(counts.probes, 0);
            assert.equal(c.events.length, n);
            assert.deepEqual(c.m.state, { status: "idle", target: null });
          }),
        "§6.10.4/§6.6.6 dispose check after every external operation including throw",
      );
for (const stage of ["source", "readSource"])
  for (const shape of [
    "accessor",
    "shared-cycle",
    "sparse",
    "function",
    "deep",
    "empty",
    "shadow-issue",
  ])
    add(
      `SD-R-owned-${stage}-${shape}`,
      "diagnostics",
      { stage, shape },
      "owned deep-frozen copy keeps keys/holes/cycles/shared/functions; source not frozen/aliased; no hidden/symbol/prototype hooks or dataIssue",
      () =>
        using(async (c) => {
          const t = await atStage(c, stage),
            before = c.m.state,
            data = {},
            child = { v: 7 };
          let reads = 0,
            hooks = 0,
            fn;
          if (shape === "accessor")
            get(data, "detail", () => {
              reads++;
              assert.equal(c.m.state, before);
              return child;
            });
          if (shape === "shared-cycle") {
            data.a = child;
            data.b = child;
            data.self = data;
            child.owner = data;
          }
          if (shape === "sparse") {
            data.items = [];
            data.items.length = 6;
            data.items[3] = child;
            data.items.extra = "B";
          }
          if (shape === "function") {
            fn = function () {
              hooks++;
            };
            fn.child = child;
            fn.self = fn;
            data.fn = fn;
            data.alias = fn;
          }
          if (shape === "deep") {
            let x = data;
            for (let i = 0; i < 256; i++) {
              x.next = {};
              x = x.next;
            }
            x.end = "B deep";
          }
          if (shape === "shadow-issue")
            data.dataIssue = { code: "user-defined", path: ["not metadata"] };
          Object.defineProperty(data, "hidden", {
            get() {
              hooks++;
              throw undefined;
            },
          });
          Object.defineProperty(data, Symbol("hidden"), {
            enumerable: true,
            get() {
              hooks++;
              throw undefined;
            },
          });
          Object.setPrototypeOf(data, {
            toJSON() {
              hooks++;
              throw undefined;
            },
            toString() {
              hooks++;
              throw undefined;
            },
            valueOf() {
              hooks++;
              throw undefined;
            },
          });
          const e = new sdk.HierError(
            "transport_closed",
            "transport",
            "B owned",
            data,
          );
          c.wire.close(e);
          assert.equal(await failure(t.o), e);
          const copy = c.m.state.error.data;
          deep(c.m.state);
          assert.notEqual(copy, data);
          assert.equal(Object.isFrozen(data), false);
          assert.equal(hooks, 0);
          assert.equal(Object.hasOwn(c.m.state.error, "dataIssue"), false);
          if (shape === "accessor") {
            assert.equal(reads, 1);
            assert.notEqual(copy.detail, child);
            child.v = 90;
            assert.equal(copy.detail.v, 7);
          }
          if (shape === "shared-cycle") {
            assert.equal(copy.a, copy.b);
            assert.equal(copy.self, copy);
            assert.equal(copy.a.owner, copy);
          }
          if (shape === "sparse") {
            assert.equal(copy.items.length, 6);
            assert.equal(0 in copy.items, false);
            assert.equal(3 in copy.items, true);
            assert.equal(5 in copy.items, false);
            assert.equal(copy.items.extra, "B");
          }
          if (shape === "function") {
            assert.notEqual(copy.fn, fn);
            assert.equal(copy.fn, copy.alias);
            assert.equal(copy.fn.self, copy.fn);
            assert.notEqual(copy.fn.child, child);
            assert.equal(Object.isFrozen(fn), false);
          }
          if (shape === "deep") {
            let x = copy;
            for (let i = 0; i < 256; i++) x = x.next;
            assert.equal(x.end, "B deep");
          }
          if (shape === "shadow-issue")
            assert.deepEqual(copy.dataIssue, data.dataIssue);
        }),
      "§6.10.4/§6.6.6/§6.6.3 diagnostic ownership",
    );
for (const method of ["load", "reload", "cancel", "clear"])
  for (const throwAfter of [false, true])
    add(
      `SD-R-reentrant-${method}-${throwAfter}`,
      "diagnostics",
      { method, throwAfter },
      "command reentrancy protected before arguments; normal subscribe/off allowed; no old-task mutation; new subscriber participates next real notification",
      () =>
        using(async (c) => {
          const t = await begin(c),
            before = c.m.state,
            data = {},
            nested = [],
            counts = { probes: 0 };
          let newCalls = 0;
          get(data, "hook", () => {
            assert.equal(c.m.state, before);
            nested.push(invoke(c, method, opaque(counts), opaque(counts)));
            const off = c.m.subscribe(() => {
              newCalls += 10;
            });
            off();
            c.m.subscribe(() => {
              newCalls++;
            });
            if (throwAfter) throw undefined;
            return "kept";
          });
          const e = new sdk.HierError(
            "transport_closed",
            "transport",
            "B reentry",
            data,
          );
          c.wire.close(e);
          assert.equal(await failure(t.o), e);
          assert.equal(nested.length, 1);
          await failure(nested[0], "reentrant_change");
          assert.equal(counts.probes, 0);
          assert.equal(c.calls.length, 1);
          assert.equal(newCalls, 1);
          if (throwAfter)
            assert.deepEqual(
              c.m.state.error.dataIssue,
              issue("read", ["hook"]),
            );
          else assert.equal(c.m.state.error.data.hook, "kept");
        }),
      "§6.10.4/§6.6.6 diagnostic reentrancy and registration",
    );
for (const stage of ["source", "readSource"])
  for (const thrown of [undefined, null, 0, false, ""])
    add(
      `SD-R-falsy-${stage}-${String(thrown)}`,
      "diagnostics",
      { stage, thrown: String(thrown) },
      "falsy thrown data read is not success; original error identity retained",
      () =>
        using(async (c) => {
          const t = await atStage(c, stage),
            data = {};
          get(data, "bad", () => {
            throw thrown;
          });
          const e = new sdk.HierError(
            "transport_closed",
            "transport",
            "B falsy",
            data,
          );
          c.wire.close(e);
          assert.equal(await failure(t.o), e);
          assert.deepEqual(c.m.state.error.dataIssue, issue("read", ["bad"]));
        }),
    );
for (const stage of ["source", "readSource"])
  for (const kind of ["undefined", "opaque"])
    add(
      `SD-Q-unexpected-${stage}-${kind}`,
      "query-fault-injection",
      {
        stage,
        kind,
        adapter: "public method promise decorator, real SDK remains underneath",
      },
      "non-HierError query rejection → inconsistent_reply with original cause; unknown cause never probed, not observer error",
      () =>
        using(async (c) => {
          const counts = { probes: 0 },
            thrown = kind === "undefined" ? undefined : opaque(counts),
            original = c.client[stage];
          c.client[stage] = function (...args) {
            return Reflect.apply(original, this, args).then(() => {
              throw thrown;
            });
          };
          const t = await atStage(c, stage);
          c.wire.ok(
            t.r ?? t.q,
            stage === "source"
              ? {
                  file: "B-source-file/尾",
                  path: "/B",
                  start: { offset: 0, line: 1, column: 1 },
                  end: { offset: 3, line: 1, column: 4 },
                  contentHash: "0123456789abcdef".repeat(4),
                }
              : {
                  text: "abc",
                  contentHash: "0123456789abcdef".repeat(4),
                  matchesSnapshot: true,
                },
          );
          const e = await failure(t.o, "inconsistent_reply");
          local(e, "inconsistent_reply");
          assert.equal(Object.hasOwn(e, "cause"), true);
          assert.equal(e.cause, thrown);
          assert.equal(counts.probes, 0);
          assert.equal(c.m.state.error.origin, "source");
        }),
      "§6.10.4 unexpected non-HierError; explicit public boundary fault, not ordinary SDK/Core execution",
    );
