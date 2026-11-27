// Inherited, approved DESIGN 6.6.6 applied to this new consumer, public onClose only.
import assert from "node:assert/strict";
import {
  using,
  begin,
  second,
  ports,
  params,
  tick,
  failure,
  invoke,
  success,
  local,
  deep,
  HierError,
  closeWith,
  opaque,
} from "./harness.mjs";
import { add } from "./cases.mjs";
async function diagnostic(c, stage) {
  let t = await begin(c);
  if (stage !== "instance") {
    t = await second(c, t);
    if (stage === "ports") c.wire.ok(t.n, params());
    else c.wire.ok(t.p, ports());
    await tick();
  }
  return t;
}
const issue = (operation, path) => ({
  code: "data_read_failed",
  operation,
  path,
});
function describe(site, hook, data, original) {
  const get = (o, k, fn) =>
    Object.defineProperty(o, k, {
      enumerable: true,
      configurable: true,
      get: fn,
    });
  if (site === "data") {
    Object.defineProperty(original, "data", { get: hook });
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
    data.branch = new Proxy({ bad: 1 }, { ownKeys: hook });
    return issue("enumerate", ["branch"]);
  }
  if (site === "descriptor") {
    data.branch = new Proxy(
      { bad: 1 },
      {
        getOwnPropertyDescriptor(t, k) {
          if (k === "bad") return hook();
          return Reflect.getOwnPropertyDescriptor(t, k);
        },
      },
    );
    return issue("inspect", ["branch", "bad"]);
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
  throw Error("unknown B diagnostic site");
}
for (const stage of ["instance", "ports", "params"])
  for (const site of [
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
  ])
    for (const thrownKind of site === "revoked"
      ? ["undefined"]
      : ["undefined", "proxy"])
      add(
        `IP-R-fail-${stage}-${encodeURIComponent(site)}-${thrownKind}`,
        "diagnostic",
        `${stage}: ${site} read throws ${thrownKind}`,
        "first issue operation/exact path, frozen empty data, later reads=0, unknown thrown probes=0, original HierError retained",
        () =>
          using(async (c) => {
            const t = await diagnostic(c, stage),
              before = c.m.state,
              data = { prefix: "B original" },
              original = new HierError(
                "transport_closed",
                "transport",
                "B diagnostic",
                data,
              );
            const counts = { probes: 0 };
            let hits = 0,
              later = 0;
            const thrown = opaque(thrownKind, counts),
              hook = () => {
                hits++;
                assert.equal(c.m.state, before);
                throw thrown;
              };
            const expected = describe(site, hook, data, original);
            Object.defineProperty(data, "later", {
              enumerable: true,
              get() {
                later++;
                return 1;
              },
            });
            closeWith(c, original);
            assert.equal(await failure(t.o), original);
            assert.equal(c.m.state.status, "failed");
            assert.deepEqual(c.m.state.error.data, {});
            assert.deepEqual(c.m.state.error.dataIssue, expected);
            deep(c.m.state);
            assert.equal(later, 0);
            assert.equal(counts.probes, 0);
            if (site !== "revoked") assert.equal(hits, 1);
            assert.equal(Object.isFrozen(original), false);
          }),
      );
for (const thrownKind of ["null", "zero", "false", "empty", "object"])
  add(
    "IP-R-falsy-" + thrownKind,
    "diagnostic",
    `data field throws ${thrownKind}`,
    "falsy/object throw is still read failure, not success or error text input",
    () =>
      using(async (c) => {
        const t = await diagnostic(c, "instance"),
          data = {},
          original = new HierError(
            "transport_closed",
            "transport",
            "B falsy",
            data,
          );
        let later = 0;
        Object.defineProperty(data, "bad", {
          enumerable: true,
          get() {
            throw opaque(thrownKind);
          },
        });
        Object.defineProperty(data, "later", {
          enumerable: true,
          get() {
            later++;
            return 1;
          },
        });
        closeWith(c, original);
        assert.equal(await failure(t.o), original);
        assert.deepEqual(c.m.state.error.dataIssue, issue("read", ["bad"]));
        assert.equal(later, 0);
      }),
  );
for (const stage of ["instance", "ports", "params"])
  for (const shape of [
    "accessor",
    "shared-cycle",
    "sparse",
    "function",
    "deep",
    "shadow-issue",
    "empty",
  ])
    add(
      `IP-R-normal-${stage}-${shape}`,
      "diagnostic",
      `${stage} error data ${shape}`,
      "owned frozen structure/alias/cycle/holes/text; one Get; source not frozen, hooks never called, no dataIssue",
      () =>
        using(async (c) => {
          const t = await diagnostic(c, stage),
            before = c.m.state;
          let reads = 0,
            hooks = 0;
          const child = { value: 3 },
            data = {};
          if (shape === "accessor")
            Object.defineProperty(data, "detail", {
              enumerable: true,
              get() {
                reads++;
                assert.equal(c.m.state, before);
                return child;
              },
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
            data.items.extra = "B extra";
          }
          let fn;
          if (shape === "function") {
            fn = function () {
              hooks++;
              throw Error("B never execute");
            };
            fn.child = child;
            fn.self = fn;
            data.fn = fn;
            data.alias = fn;
          }
          if (shape === "deep") {
            let v = data;
            for (let i = 0; i < 256; i++) {
              v.next = {};
              v = v.next;
            }
            v.end = "B finite-depth";
          }
          if (shape === "shadow-issue")
            data.dataIssue = {
              code: "B user field",
              path: ["not-model-metadata"],
            };
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
            valueOf() {
              hooks++;
              throw undefined;
            },
            toString() {
              hooks++;
              throw undefined;
            },
          });
          const original = new HierError(
            "transport_closed",
            "transport",
            "B normal",
            data,
          );
          closeWith(c, original);
          assert.equal(await failure(t.o), original);
          const copy = c.m.state.error.data;
          assert.equal(Object.hasOwn(c.m.state.error, "dataIssue"), false);
          assert.notEqual(copy, data);
          deep(c.m.state);
          assert.equal(Object.isFrozen(data), false);
          assert.equal(Object.isFrozen(original), false);
          assert.equal(hooks, 0);
          if (shape === "accessor") {
            assert.equal(reads, 1);
            assert.notEqual(copy.detail, child);
            child.value = 99;
            assert.equal(copy.detail.value, 3);
          }
          if (shape === "shared-cycle") {
            assert.equal(copy.a, copy.b);
            assert.equal(copy.self, copy);
            assert.equal(copy.a.owner, copy);
            assert.notEqual(copy.a, child);
          }
          if (shape === "sparse") {
            assert.equal(copy.items.length, 6);
            assert.equal(0 in copy.items, false);
            assert.equal(3 in copy.items, true);
            assert.equal(5 in copy.items, false);
            assert.equal(copy.items.extra, "B extra");
          }
          if (shape === "function") {
            assert.notEqual(copy.fn, fn);
            assert.equal(copy.fn, copy.alias);
            assert.equal(copy.fn.self, copy.fn);
            assert.notEqual(copy.fn.child, child);
            assert.equal(Object.isFrozen(fn), false);
          }
          if (shape === "deep") {
            let v = copy;
            for (let i = 0; i < 256; i++) v = v.next;
            assert.equal(v.end, "B finite-depth");
          }
          if (shape === "shadow-issue")
            assert.deepEqual(copy.dataIssue, data.dataIssue);
        }),
    );
for (const stage of ["instance", "ports", "params"])
  for (const site of ["data", "field", "enumerate", "descriptor", "length"])
    for (const throwAfter of [false, true])
      add(
        `IP-R-dispose-${stage}-${site}-${throwAfter}`,
        "diagnostic",
        `${stage} dispose during ${site}, then throw=${throwAfter}`,
        "disposed wins with original cause, no later field/dataIssue/failed notification or revival",
        () =>
          using(async (c) => {
            const t = await diagnostic(c, stage),
              before = c.m.state,
              n = c.events.length,
              data = {};
            let hits = 0,
              later = 0;
            const original = new HierError(
              "transport_closed",
              "transport",
              "B dispose capture",
              data,
            );
            const hook = () => {
              hits++;
              assert.equal(c.m.state, before);
              c.m.dispose();
              if (throwAfter) throw undefined;
              return site === "enumerate"
                ? ["bad"]
                : site === "descriptor"
                  ? { value: 1, enumerable: true, configurable: true }
                  : site === "length"
                    ? 0
                    : "B ignored";
            };
            describe(site, hook, data, original);
            Object.defineProperty(data, "later", {
              enumerable: true,
              get() {
                later++;
                return 1;
              },
            });
            closeWith(c, original);
            const e = await failure(t.o);
            local(e, "disposed");
            assert.equal(e.cause, original);
            assert.equal(hits, 1);
            assert.equal(later, 0);
            assert.equal(c.events.length, n);
            assert.deepEqual(c.m.state, { status: "idle", target: null });
          }),
      );
for (const stage of ["instance", "ports", "params"])
  for (const command of ["load", "reload", "cancel", "clear"])
    add(
      `IP-R-reentrant-${stage}-${command}`,
      "diagnostic",
      `${command} in diagnostic getter`,
      "reentrant before parameters/no-op; pending object seen during capture; guard exits after failure",
      () =>
        using(async (c) => {
          const t = await diagnostic(c, stage),
            before = c.m.state,
            data = {},
            counts = { probes: 0 },
            nested = [];
          Object.defineProperty(data, "value", {
            enumerable: true,
            get() {
              assert.equal(c.m.state, before);
              nested.push(
                invoke(
                  c,
                  command,
                  ...(command === "load" ? [opaque("proxy", counts)] : []),
                ),
              );
              return 1;
            },
          });
          const original = new HierError(
            "transport_closed",
            "transport",
            "B reentry",
            data,
          );
          closeWith(c, original);
          assert.equal(await failure(t.o), original);
          assert.equal(nested.length, 1);
          local(await failure(nested[0]), "reentrant_change");
          assert.equal(counts.probes, 0);
          await success(invoke(c, "clear"));
        }),
    );
add(
  "IP-R-subscribe-ownership",
  "diagnostic",
  "subscribe/unsubscribe in data getter; another model no-op",
  "new listener receives failure, removed does not; guard per model, not global",
  () =>
    using(async (c) => {
      const other = c.newModel(),
        t = await diagnostic(c, "instance"),
        data = {};
      let removed = 0,
        added = 0;
      const off = c.m.subscribe(() => removed++),
        n = removed;
      let otherAction;
      Object.defineProperty(data, "value", {
        enumerable: true,
        get() {
          off();
          c.m.subscribe(() => added++);
          otherAction = other.clear();
          return 1;
        },
      });
      const original = new HierError(
        "transport_closed",
        "transport",
        "B subscriptions",
        data,
      );
      closeWith(c, original);
      assert.equal(await failure(t.o), original);
      await otherAction;
      assert.equal(removed, n);
      assert.equal(added, 1);
      assert.equal(other.state.status, "idle");
    }),
);

add(
  "IP-R-dispose-prior-observer",
  "diagnostic",
  "pending observer error plus diagnostic getter dispose after SDK failure",
  "disposed cause is aggregate of original observer with original HierError cause; no diagnostic terminal state",
  () =>
    using(async (c) => {
      const marker = { B: "prior pending" };
      c.m.subscribe(() => {
        if (c.m.state.status === "pending") throw marker;
      });
      const t = await diagnostic(c, "instance"),
        data = {};
      Object.defineProperty(data, "value", {
        enumerable: true,
        get() {
          c.m.dispose();
          return 1;
        },
      });
      const original = new HierError(
        "transport_closed",
        "transport",
        "B original before disposal",
        data,
      );
      closeWith(c, original);
      const e = await failure(t.o);
      local(e, "disposed");
      assert.ok(e.cause instanceof AggregateError);
      assert.deepEqual(e.cause.errors, [marker]);
      assert.equal(e.cause.cause, original);
      assert.deepEqual(c.m.state, { status: "idle", target: null });
    }),
);
