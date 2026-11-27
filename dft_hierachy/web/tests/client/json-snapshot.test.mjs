import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

// A regressions for the existing private owning-copy boundary. Same assertions
// run on the saved original module; these are not new B oracle categories.
const { jsonSnapshot } = await import(process.env.HIER_A_JSON_SNAPSHOT_MODULE
  ? pathToFileURL(process.env.HIER_A_JSON_SNAPSHOT_MODULE)
  : new URL("../../packages/client/dist/json-snapshot.js", import.meta.url));

test("A M7 JSON snapshot: owning values, omission and ordinary data descriptors", () => {
  const source = Object.assign(Object.create(null), { a: -0, skip: undefined,
    b: [null, false, 1.5, "中文\u0000🙂"], nested: { keep: true, omit: undefined } });
  const copy = jsonSnapshot(source);
  assert.equal(Object.getPrototypeOf(copy), Object.prototype);
  assert.ok(Object.is(copy.a, -0)); assert.deepEqual(Object.keys(copy), ["a", "b", "nested"]);
  assert.deepEqual(copy.b, source.b); assert.notEqual(copy.b, source.b);
  assert.deepEqual(copy.nested, { keep: true }); assert.notEqual(copy.nested, source.nested);
  assert.deepEqual(Object.getOwnPropertyDescriptor(copy, "nested"), {
    value: copy.nested, writable: true, enumerable: true, configurable: true });
  copy.nested.keep = false; assert.equal(source.nested.keep, true);
  assert.ok(!Object.isFrozen(source) && !Object.isFrozen(source.nested));
});

test("A M7 JSON snapshot: all parent getters are captured before descendant getters", () => {
  const events = [], child = { get value() { events.push("child"); return 1; } };
  const source = { get first() { events.push("first"); return child; },
    get omit() { events.push("omit"); return undefined; },
    get last() { events.push("last"); return 2; } };
  assert.deepEqual(jsonSnapshot(source), { first: { value: 1 }, last: 2 });
  assert.deepEqual(events, ["first", "omit", "last", "child"]);
});

test("A M7 JSON snapshot: invalid omitted parent key is rejected before reading descendants", () => {
  const events = [], source = { get child() { events.push("parent-child");
    return { get nested() { events.push("nested"); return 1; } }; } };
  Object.defineProperty(source, "\ud800", { enumerable: true,
    get() { events.push("invalid-key-value"); return undefined; } });
  Object.defineProperty(source, "last", { enumerable: true,
    get() { events.push("last"); return 3; } });
  assert.throws(() => jsonSnapshot(source), { name: "TypeError", message: "Expected a Unicode scalar string" });
  assert.deepEqual(events, ["parent-child", "invalid-key-value", "last"]);
});

test("A M7 JSON snapshot: parent values stay captured when a child changes the original", () => {
  let later = 1;
  const source = { child: { get value() { later = 2; return "changed"; } }, get later() { return later; } };
  assert.deepEqual(jsonSnapshot(source), { child: { value: "changed" }, later: 1 });
  assert.equal(later, 2);
});

test("A M7 JSON snapshot: compaction keeps recursive order and repeated references independent", () => {
  const events = [], shared = { get value() { events.push("shared"); return events.length; } };
  const copy = jsonSnapshot({ omitA: undefined, first: shared, omitB: undefined,
    second: shared, third: [shared], omitC: undefined });
  assert.deepEqual(events, ["shared", "shared", "shared"]);
  assert.deepEqual(copy, { first: { value: 1 }, second: { value: 2 }, third: [{ value: 3 }] });
  assert.notEqual(copy.first, copy.second); assert.notEqual(copy.second, copy.third[0]);
});

test("A M7 JSON snapshot: special keys remain own data and never invoke inherited setters", () => {
  const name = "__hier_snapshot_guard__", previous = Object.getOwnPropertyDescriptor(Object.prototype, name);
  let calls = 0;
  Object.defineProperty(Object.prototype, name, { configurable: true, set() { calls++; } });
  try {
    const source = JSON.parse('{"__proto__":{"polluted":true},"constructor":1,"prototype":2,"__hier_snapshot_guard__":3}');
    const copy = jsonSnapshot(source);
    assert.equal(Object.getPrototypeOf(copy), Object.prototype);
    assert.deepEqual(copy.__proto__, { polluted: true }); assert.equal(copy.constructor, 1);
    assert.equal(copy.prototype, 2); assert.equal(copy[name], 3); assert.equal(calls, 0);
    assert.equal(Object.hasOwn(copy, "__proto__"), true); assert.equal({}.polluted, undefined);
  } finally {
    if (previous) Object.defineProperty(Object.prototype, name, previous);
    else delete Object.prototype[name];
  }
});

test("A M7 JSON snapshot: cycles fail and supplied ancestor state is unwound", () => {
  const guard = {}, ancestors = new Set([guard]), cyclic = { child: {} };
  cyclic.child.back = cyclic;
  assert.throws(() => jsonSnapshot(cyclic, ancestors), { name: "TypeError", message: "Expected an acyclic JSON value" });
  assert.deepEqual([...ancestors], [guard]);
  assert.deepEqual(jsonSnapshot({ after: true }, ancestors), { after: true });
  assert.deepEqual([...ancestors], [guard]);
});

test("A M7 JSON snapshot: accessor throws keep identity and do not poison later copies", () => {
  const marker = Object.freeze({ original: "accessor throw" }), ancestors = new Set();
  const source = { before: undefined, child: { get value() { throw marker; } } };
  assert.throws(() => jsonSnapshot(source, ancestors), (error) => error === marker);
  assert.equal(ancestors.size, 0);
  assert.deepEqual(jsonSnapshot({ child: { value: 1 } }, ancestors), { child: { value: 1 } });
});

test("A M7 JSON snapshot: lossy values and nonplain prototypes remain rejected", () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, 1n, Symbol("bad"), () => 1,
    new Date(0), new Map(), Object.create({ inherited: true }), [undefined], Array(1), "\ud800", "\udfff"])
    assert.throws(() => jsonSnapshot(value), TypeError);
  let read = false;
  const custom = Object.create({}); Object.defineProperty(custom, "value", {
    enumerable: true, get() { read = true; return 1; } });
  assert.throws(() => jsonSnapshot(custom), { name: "TypeError", message: "Expected a plain JSON object" });
  assert.equal(read, false);
});

test("A M7 JSON snapshot: array iteration and source containers are preserved", () => {
  const source = [1, 2, 3]; let calls = 0;
  source[Symbol.iterator] = function* () { calls++; yield { value: 4 }; yield 5; };
  const copy = jsonSnapshot(source);
  assert.deepEqual(copy, [{ value: 4 }, 5]); assert.equal(calls, 1);
  assert.deepEqual(source.slice(), [1, 2, 3]); assert.notEqual(copy[0], source[0]);
});

test("A M7 JSON snapshot: integer, scalar and literal keys retain property order", () => {
  const source = Object.create(null);
  for (const [key, value] of [["tail", 3], ["10", "ten"], ["omit", undefined],
    ["2", "two"], ["\u0000🙂", { value: "e\u0301" }], ["__proto__", null]])
    Object.defineProperty(source, key, { enumerable: true, value });
  const copy = jsonSnapshot(source);
  assert.deepEqual(Object.keys(copy), ["2", "10", "tail", "\u0000🙂", "__proto__"]);
  assert.equal(JSON.stringify(copy), JSON.stringify(source));
});

test("A M7 JSON snapshot: proxy descriptors and values are captured once before child recursion", () => {
  const gets = [], descriptors = [], target = { a: { get inner() { gets.push("inner"); return 1; } }, b: undefined, c: 2 };
  const source = new Proxy(target, {
    get(object, key, receiver) { gets.push(key); return Reflect.get(object, key, receiver); },
    getOwnPropertyDescriptor(object, key) { descriptors.push(key); return Reflect.getOwnPropertyDescriptor(object, key); },
  });
  assert.deepEqual(jsonSnapshot(source), { a: { inner: 1 }, c: 2 });
  assert.deepEqual(gets, ["a", "b", "c", "inner"]); assert.deepEqual(descriptors, ["a", "b", "c"]);
});
