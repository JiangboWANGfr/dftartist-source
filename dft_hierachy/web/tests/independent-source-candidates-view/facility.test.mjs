import test from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { negatives } from "./types.mjs";
test("B32 inventory is nonempty, unique and names input/expected/basis", () => {
  assert.ok(cases.length >= 50);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) {
    assert.ok(c.input);
    assert.ok(c.expected.length > 10);
    assert.ok(c.basis.startsWith("DESIGN"));
  }
  assert.equal(negatives.length, 30);
});
test("B32-Q1: native await observes original Promise while own then spy sees zero (facility limitation)", async () => {
  let seen = 0;
  const p = Promise.resolve("raw"),
    then = p.then;
  Object.defineProperty(p, "then", {
    configurable: true,
    value: function (...args) {
      seen++;
      return Reflect.apply(then, this, args);
    },
  });
  assert.equal(await p, "raw");
  assert.equal(seen, 0);
  // Thus seen===0 cannot be used as a product rejection; do not freeze that oracle.
});
test("B32-Q1 positive contrast: explicit dual branch then is visible and keeps raw rejection", async () => {
  const raw = Symbol("B raw");
  let seen = 0;
  const p = Promise.reject(raw),
    then = p.then;
  Object.defineProperty(p, "then", {
    configurable: true,
    value: function (a, b) {
      assert.equal(this, p);
      assert.equal(typeof a, "function");
      assert.equal(typeof b, "function");
      seen++;
      return Reflect.apply(then, this, [a, b]);
    },
  });
  const out = p.then(
    () => false,
    (e) => e,
  );
  assert.equal(seen, 1);
  assert.equal(await out, raw);
});
test("B32-Q1: final no-unhandled cannot distinguish late observation; no timeout used", async () => {
  const p = Promise.resolve("same value");
  let count = 0;
  const then = p.then;
  Object.defineProperty(p, "then", {
    value: function (...args) {
      count++;
      return Reflect.apply(then, this, args);
    },
  });
  assert.equal(count, 0);
  await Promise.resolve();
  p.then(
    () => {},
    () => {},
  );
  assert.equal(count, 1);
});
