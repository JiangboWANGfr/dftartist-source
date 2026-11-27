import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { cases } from "./cases.mjs";
const entry =
  process.env.HIER_B_OBSERVER_ENTRY ??
  fileURLToPath(new URL("../public-calls.mjs", import.meta.url));
assert.ok(path.isAbsolute(entry), "explicit observer entry must be absolute");
const { observePublicCalls } = await import(pathToFileURL(entry));
assert.equal(typeof observePublicCalls, "function");
const diagnostic = (fn, count) => {
  let value;
  assert.throws(fn, (e) => {
    value = e;
    return e instanceof AggregateError;
  });
  assert.equal(value.errors.length, count);
  return value;
};
function inherited(writable) {
  const go = function () {
      return this;
    },
    later = function () {
      return "later";
    },
    target = Object.create({ go, later });
  const tap = observePublicCalls(target, ["later", "go"]),
    wrapper = target.go;
  Object.defineProperty(target, "go", { configurable: false, writable });
  const e = diagnostic(() => tap.dispose(), 1);
  assert.ok(e.errors[0] instanceof Error);
  assert.ok(e.errors[0].message.length > 0);
  assert.equal(target.go, wrapper);
  assert.equal(Object.hasOwn(target, "go"), true);
  assert.equal(Object.hasOwn(target, "later"), false);
  assert.equal(target.later, later);
}
const bodies = {
  "B34-R01": () => {
    const go = function () {
        return this;
      },
      target = Object.create({ go }),
      tap = observePublicCalls(target, ["go"]);
    assert.equal(target.go(), target);
    tap.dispose();
    assert.equal(Object.hasOwn(target, "go"), false);
    assert.equal(target.go, go);
  },
  "B34-R02": () => {
    const go = () => Symbol.for("B own"),
      target = {};
    Object.defineProperty(target, "go", {
      value: go,
      configurable: true,
      writable: false,
      enumerable: true,
    });
    const old = Object.getOwnPropertyDescriptor(target, "go"),
      tap = observePublicCalls(target, ["go"]);
    tap.dispose();
    assert.deepEqual(Object.getOwnPropertyDescriptor(target, "go"), old);
  },
  "B34-R03": () => inherited(false),
  "B34-R04": () => inherited(true),
  "B34-R05": () => {
    const a = () => 1,
      b = () => 2,
      target = Object.create({ a, b }),
      tap = observePublicCalls(target, ["a", "b"]);
    Object.defineProperty(target, "a", { configurable: false });
    Object.defineProperty(target, "b", { configurable: false });
    const e = diagnostic(() => tap.dispose(), 2);
    assert.ok(e.errors.every((e) => e instanceof Error));
    assert.equal(Object.hasOwn(target, "a"), true);
    assert.equal(Object.hasOwn(target, "b"), true);
  },
  "B34-R06": () => {
    const target = {
        later() {
          return 1;
        },
        go() {
          return 2;
        },
      },
      old = Object.getOwnPropertyDescriptor(target, "later"),
      tap = observePublicCalls(target, ["later", "go"]);
    Object.defineProperty(target, "go", {
      configurable: false,
      writable: false,
    });
    diagnostic(() => tap.dispose(), 1);
    assert.deepEqual(Object.getOwnPropertyDescriptor(target, "later"), old);
  },
  "B34-R07": () => {
    const raw = Symbol("B original release"),
      go = () => 1,
      later = () => 2,
      base = Object.create({ go, later }),
      target = new Proxy(base, {
        deleteProperty(object, key) {
          if (key === "go") throw raw;
          return Reflect.deleteProperty(object, key);
        },
      }),
      tap = observePublicCalls(target, ["later", "go"]);
    const e = diagnostic(() => tap.dispose(), 1);
    assert.equal(e.errors[0], raw);
    assert.equal(Object.hasOwn(base, "later"), false);
    assert.equal(target.later, later);
  },
  "B34-R08": () => {
    const go = () => true,
      target = Object.create({ go }),
      tap = observePublicCalls(target, ["go"]);
    Object.preventExtensions(target);
    tap.dispose();
    assert.equal(Object.hasOwn(target, "go"), false);
    assert.equal(target.go, go);
  },
  "B34-R09": () => {
    const raw = Symbol("B setup primary"),
      later = () => 1,
      go = () => 2,
      target = Object.create({ later, go });
    Object.defineProperty(target, "broken", {
      get() {
        throw raw;
      },
    });
    assert.throws(
      () => observePublicCalls(target, ["later", "go", "broken"]),
      (e) => e === raw,
    );
    for (const [name, original] of Object.entries({ later, go })) {
      assert.equal(Object.hasOwn(target, name), false);
      assert.equal(target[name], original);
    }
  },
  "B34-R10": () => {
    const raw = Symbol("B setup plus restoration"),
      later = () => 1,
      go = () => 2,
      target = Object.create({ later, go });
    Object.defineProperty(target, "broken", {
      get() {
        Object.defineProperty(target, "go", { configurable: false });
        throw raw;
      },
    });
    const e = diagnostic(
      () => observePublicCalls(target, ["later", "go", "broken"]),
      2,
    );
    assert.equal(e.errors[0], raw);
    assert.ok(e.errors[1] instanceof Error);
    assert.equal(Object.hasOwn(target, "go"), true);
    assert.equal(Object.hasOwn(target, "later"), false);
    assert.equal(target.later, later);
  },
  "B34-R11": () => {
    const target = Object.create({ a: () => 1, b: () => 2 });
    Object.defineProperty(target, "broken", {
      get() {
        Object.defineProperty(target, "a", { configurable: false });
        Object.defineProperty(target, "b", { configurable: false });
        throw null;
      },
    });
    const e = diagnostic(
      () => observePublicCalls(target, ["a", "b", "broken"]),
      3,
    );
    assert.equal(e.errors[0], null);
    assert.ok(e.errors.slice(1).every((e) => e instanceof Error));
    assert.equal(Object.hasOwn(target, "a"), true);
    assert.equal(Object.hasOwn(target, "b"), true);
  },
};
assert.equal(new Set(cases.map((c) => c.id)).size, 11);
assert.deepEqual(
  Object.keys(bodies),
  cases.map((c) => c.id),
);
for (const c of cases) test(c.id + " — " + c.expected, bodies[c.id]);
