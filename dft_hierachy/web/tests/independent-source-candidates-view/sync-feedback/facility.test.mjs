import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cases } from "./cases.mjs";
import { failure, aggregate, suppressed } from "./assertions.mjs";
import { modelControl } from "./public-model.mjs";
test("B42 two unique input/expected/basis records", () => {
  assert.equal(cases.length, 2);
  assert.equal(new Set(cases.map((c) => c.id)).size, 2);
  for (const c of cases) {
    assert(c.input && c.expected);
    assert.match(c.basis, /^DESIGN/);
  }
});
const a = {},
  e = {},
  x = Symbol("raw callback"),
  valid = () => ({ command: "confirm", action: a, error: e });
test("B42 original shallow-frozen failure accepts", () =>
  failure(Object.freeze(valid()), a, e));
for (const [name, change] of [
  ["command", (f) => ({ ...f, command: "loadMore" })],
  ["action", (f) => ({ ...f, action: {} })],
  ["error", (f) => ({ ...f, error: {} })],
  ["mutable", (f) => f],
])
  test("B42 failure rejects " + name, () => {
    const f = change(valid());
    assert.throws(() =>
      failure(name === "mutable" ? f : Object.freeze(f), a, e),
    );
  });
test("B42 original ordered AggregateError accepts", () =>
  aggregate(new AggregateError([e, x]), e, x));
for (const [name, value] of [
  ["order", new AggregateError([x, e])],
  ["cloned-command-error", new AggregateError([{}, x])],
  ["different-callback-value", new AggregateError([e, Symbol("raw callback")])],
  ["missing-second", new AggregateError([e])],
  ["ordinary-Error", Error("not AggregateError")],
])
  test("B42 aggregate rejects " + name, () =>
    assert.throws(() => aggregate(value, e, x)),
  );
test("B42 suppressed accepts neither callback", () => suppressed([], []));
test("B42 suppressed rejects old callback", () =>
  assert.throws(() => suppressed([{}], [])));
test("B42 suppressed rejects new callback", () =>
  assert.throws(() => suppressed([], [{}])));
for (const listeners of [1, 2])
  test("B42 actual Selection notification control " + listeners, async () => {
    const P = process.env.HIER_B_PRODUCT_ROOT;
    assert(P && path.isAbsolute(P), "explicit fixed product");
    const client = await import(
        pathToFileURL(P + "/web/packages/client/dist/index.js")
      ),
      model = await import(
        pathToFileURL(P + "/web/packages/viewmodel/dist/index.js")
      );
    assert.equal(
      (await modelControl({ ...client, ...model }, listeners)).pass,
      true,
    );
  });
