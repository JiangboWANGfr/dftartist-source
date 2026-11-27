import assert from "node:assert/strict";
import { add } from "./cases.mjs";
import {
  using,
  invoke,
  begin,
  finish,
  failure,
  success,
  local,
  state,
  deep,
  Q,
  page,
  hit,
  sdk,
  opaque,
} from "./harness.mjs";
const issue = (operation, path) => ({
  code: "data_read_failed",
  operation,
  path,
});
const getter = (o, k, f) =>
  Object.defineProperty(o, k, { enumerable: true, configurable: true, get: f });
function attach(site, hook, data, error) {
  if (site === "data") {
    Object.defineProperty(error, "data", { get: hook });
    return issue("read", []);
  }
  if (site === "field") {
    getter(data, "bad", hook);
    return issue("read", ["bad"]);
  }
  if (site.startsWith("nested:")) {
    data.branch = {};
    const k = site.slice(7);
    getter(data.branch, k, hook);
    return issue("read", ["branch", k]);
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
    getter(data.items, "2", hook);
    return issue("read", ["items", "2"]);
  }
  if (site === "revoked") {
    const p = Proxy.revocable({}, {});
    p.revoke();
    data.branch = p.proxy;
    return issue("inspect", ["branch"]);
  }
  throw Error("unknown B diagnostic site");
}
async function at(c, prefix) {
  if (prefix) await finish(c, await begin(c), page([hit()], "B-next"));
  return begin(c, Q, prefix ? "loadMore" : "load");
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
for (const prefix of [false, true])
  for (const site of sites)
    for (const thrown of site === "revoked"
      ? ["undefined"]
      : ["undefined", "opaque"])
      add(
        "diagnostic-read-" +
          [prefix, encodeURIComponent(site), thrown].join("-"),
        "diagnostics",
        { prefix, site, thrown },
        "original error; empty frozen data/exact first dataIssue; stop reads; original mutable; prefix retained",
        () =>
          using(async (c) => {
            const t = await at(c, prefix),
              before = c.m.state,
              old = [...before.pages],
              data = { prefix: "B" },
              e = new sdk.HierError(
                "transport_closed",
                "transport",
                "B diagnostic",
                data,
              ),
              counts = { probes: 0 };
            let reads = 0,
              later = 0;
            const value = thrown === "opaque" ? opaque(counts) : undefined;
            const expected = attach(
              site,
              () => {
                reads++;
                assert.equal(c.m.state, before);
                throw value;
              },
              data,
              e,
            );
            getter(data, "later", () => {
              later++;
              return 1;
            });
            c.wire.close(e);
            assert.equal(await failure(t.o), e);
            state(c, "failed", Q, old);
            const f = c.m.state.error;
            assert.equal(f.code, e.code);
            assert.equal(f.origin, e.origin);
            assert.equal(f.message, e.message);
            assert.deepEqual(f.data, {});
            assert.deepEqual(f.dataIssue, expected);
            assert.equal(later, 0);
            assert.equal(counts.probes, 0);
            if (site !== "revoked") assert.equal(reads, 1);
            assert.equal(Object.isFrozen(e), false);
            assert.equal(Object.isFrozen(data), false);
          }),
        "§6.11.3 → §6.6.6 first inspect/enumerate/Get failure",
      );
for (const prefix of [false, true])
  for (const site of ["data", "field", "enumerate", "descriptor", "length"])
    for (const throwAfter of [false, true])
      add(
        "diagnostic-dispose-" + [prefix, site, throwAfter].join("-"),
        "diagnostics",
        { prefix, site, throwAfter },
        "dispose takes active task/joiner, original terminal error cause; no later read/state/error notification/revival",
        () =>
          using(async (c) => {
            const t = await at(c, prefix),
              join = invoke(c, "loadMore"),
              n = c.events.length,
              data = {},
              e = new sdk.HierError(
                "transport_closed",
                "transport",
                "B terminal",
                data,
              ),
              counts = { probes: 0 };
            let later = 0,
              reads = 0;
            attach(
              site,
              () => {
                reads++;
                c.m.dispose();
                if (throwAfter) throw opaque(counts);
                return site === "enumerate"
                  ? []
                  : site === "descriptor"
                    ? {
                        enumerable: true,
                        configurable: true,
                        value: 3,
                        writable: true,
                      }
                    : 0;
              },
              data,
              e,
            );
            getter(data, "later", () => {
              later++;
              return 1;
            });
            c.wire.close(e);
            for (const o of [t.o, join]) {
              const err = await failure(o, "disposed");
              local(err, "disposed");
              assert.equal(err.cause, e);
            }
            assert.equal(reads, 1);
            assert.equal(later, 0);
            assert.equal(counts.probes, 0);
            assert.equal(c.events.length, n);
            state(c, "idle", null);
          }),
        "§6.11.3 → §6.6.6 release after every external read",
      );
for (const prefix of [false, true])
  for (const shape of [
    "accessor",
    "shared-cycle",
    "sparse",
    "function",
    "deep",
    "empty",
  ])
    add(
      "diagnostic-copy-" + prefix + "-" + shape,
      "diagnostics",
      { prefix, shape },
      "owned deep-frozen data; retain fields/holes/cycles/sharing/function properties; no source freezing or hidden/symbol/coercion reads",
      () =>
        using(async (c) => {
          const t = await at(c, prefix),
            before = c.m.state,
            data = {},
            child = { v: 3 };
          let reads = 0,
            hooks = 0,
            fn;
          if (shape === "accessor")
            getter(data, "value", () => {
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
            data.items.length = 5;
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
            let cursor = data;
            for (let i = 0; i < 512; i++) {
              cursor.next = {};
              cursor = cursor.next;
            }
            cursor.end = 7;
          }
          Object.defineProperty(data, "hidden", {
            get() {
              hooks++;
              throw 1;
            },
          });
          Object.defineProperty(data, Symbol("B"), {
            enumerable: true,
            get() {
              hooks++;
              throw 1;
            },
          });
          Object.setPrototypeOf(data, {
            toJSON() {
              hooks++;
              throw 1;
            },
            valueOf() {
              hooks++;
              throw 1;
            },
            toString() {
              hooks++;
              throw 1;
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
          const f = c.m.state.error,
            copy = f.data;
          assert.notEqual(copy, data);
          deep(copy);
          assert.equal(Object.hasOwn(f, "dataIssue"), false);
          assert.equal(Object.isFrozen(data), false);
          assert.equal(Object.isFrozen(child), false);
          assert.equal(hooks, 0);
          if (shape === "accessor") {
            assert.equal(reads, 1);
            assert.notEqual(copy.value, child);
            child.v = 8;
            assert.equal(copy.value.v, 3);
          }
          if (shape === "shared-cycle") {
            assert.equal(copy.a, copy.b);
            assert.equal(copy.self, copy);
            assert.equal(copy.a.owner, copy);
          }
          if (shape === "sparse") {
            assert.equal(copy.items.length, 5);
            assert.equal(0 in copy.items, false);
            assert.equal(3 in copy.items, true);
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
            let cursor = copy;
            for (let i = 0; i < 512; i++) cursor = cursor.next;
            assert.equal(cursor.end, 7);
          }
        }),
      "§6.11.3 → §6.6.6/C-75 owned diagnostic semantics",
    );
for (const prefix of [false, true])
  for (const method of ["load", "loadMore", "reload", "cancel", "clear"])
    add(
      "diagnostic-reentrant-" + prefix + "-" + method,
      "diagnostics",
      { prefix, method },
      "capture guard rejects even no-op command without input probes; new subscription participates settled batch; previous state visible",
      () =>
        using(async (c) => {
          const t = await at(c, prefix),
            before = c.m.state,
            data = {};
          let nested,
            seen = 0;
          getter(data, "hook", () => {
            assert.equal(c.m.state, before);
            nested = invoke(c, method, opaque());
            const off = c.m.subscribe(() => {
              seen++;
            });
            const dropped = c.m.subscribe(() => {
              throw Error("must be removed");
            });
            dropped();
            off;
            return 3;
          });
          const e = new sdk.HierError(
            "transport_closed",
            "transport",
            "B guarded",
            data,
          );
          c.wire.close(e);
          assert.equal(await failure(t.o), e);
          await failure(nested, "reentrant_change");
          assert.equal(seen, 1);
          assert.equal(c.m.state.error.data.hook, 3);
        }),
    );
