import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { sdk } from "../independent-tree/harness.mjs";
const root = process.env.HIER_A_MODEL_MODULE_ROOT;
const url = name => root ? pathToFileURL(join(root, name + ".js"))
  : new URL(`../../packages/viewmodel/dist/${name}.js`, import.meta.url);
const { captureJSON } = await import(url("json-input"));
const { QueryInput } = await import(url("query-input"));
const { LayoutInput, readLayoutProjection } = await import(url("layout-input"));
const { LayoutError } = await import(url("layout-types"));
const { AnnotationLayer, GraphSession, createFoldedGraphProjection } = await import(url("index"));
const reader = { read: operation => operation(), invalid(message) { throw new TypeError(message); } };
const capture = value => captureJSON(value, reader, "Graph");
function frozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) frozen(child);
}

test("A M7 JSON input: descriptor values, special keys, aliases and owning frozen data stay exact", () => {
  const shared = { value: 1 }, input = JSON.parse('{"__proto__":{"n":0},"constructor":2}');
  input.first = shared; input.second = shared; input.array = [1, { value: 2 }, shared]; input.zero = -0; input.length = 7; input.array[1].length = 2;
  const owned = capture(input); frozen(owned);
  assert.equal(Object.getPrototypeOf(owned), Object.prototype); assert.equal(Object.hasOwn(owned, "__proto__"), true);
  assert.equal(owned.first, owned.second); assert.equal(owned.first, owned.array[2]); assert.notEqual(owned.first, shared);
  assert.deepEqual(Object.getOwnPropertyDescriptor(owned, "first"), { value: owned.first, enumerable: true, writable: false, configurable: false });
  assert.equal(owned.array[0], 1); assert.equal(owned.array[1].value, 2); assert.equal(owned.constructor, 2); assert.equal(owned.length, 7); assert.equal(owned.array[1].length, 2); assert.ok(Object.is(owned.zero, -0));
  shared.value = 9; input.array[1].value = 8; assert.equal(owned.first.value, 1); assert.equal(owned.array[1].value, 2);
  assert.equal(Object.isFrozen(input), false); assert.equal(Object.isFrozen(input.array), false);
});

test("A M7 JSON input: array Proxy key order, slot reads and Reader-observed key vectors remain unchanged", () => {
  const gets = [], observed = [];
  const input = new Proxy([{ n: 1 }, { n: 2 }], { ownKeys() { return ["length", "0", "1"]; }, get(target, key, receiver) { gets.push(String(key)); return Reflect.get(target, key, receiver); } });
  const r = { ...reader, read(operation) { const value = operation(); if (Array.isArray(value) && value.includes("length")) observed.push(value); return value; } };
  const owned = captureJSON(input, r, "Graph");
  assert.deepEqual(owned, [{ n: 1 }, { n: 2 }]); assert.deepEqual(gets, ["length", "0", "1"]);
  assert.deepEqual(observed, [["length", "0", "1"]]); frozen(owned);
});

test("A M7 JSON input: invalid array shapes reject without invoking source iterators or toJSON", () => {
  const extra = [1]; extra.extra = 2; const symbol = [1]; symbol[Symbol("extra")] = 2;
  const reordered = new Proxy([1, 2], { ownKeys() { return ["1", "0", "length"]; } });
  for (const value of [Array(1), extra, symbol, reordered])
    assert.throws(() => capture(value), { name: "TypeError", message: "Graph arrays must have only contiguous own slots" });
  class Custom extends Array { [Symbol.iterator]() { assert.fail("iterator called"); } toJSON() { assert.fail("toJSON called"); } }
  assert.deepEqual(capture(new Custom(1, 2)), [1, 2]);
  let called = 0; assert.throws(() => capture({ toJSON() { called++; return {}; } }), TypeError); assert.equal(called, 0);
});

test("A M7 JSON input: depth-first reads, mutation between siblings and recursive capture keep their order", () => {
  const events = []; let later = 1;
  const input = { get first() { events.push("first"); return { get child() { events.push("child"); later = 2; return 3; } }; }, get second() { events.push("second"); return later; }, get nested() { events.push("nested"); return capture({ a: 4, b: { value: 5 } }); } };
  const owned = capture(input); assert.deepEqual(events, ["first", "child", "second", "nested"]);
  assert.deepEqual(owned, { first: { child: 3 }, second: 2, nested: { a: 4, b: { value: 5 } } }); frozen(owned);
});

test("A M7 JSON input: hidden fields and raw strings remain data; cycles, symbols and lossy values reject", () => {
  const input = { text: "\ud800" }; Object.defineProperty(input, "hidden", { value: { x: 1 } });
  const owned = capture(input); assert.equal(owned.text, "\ud800"); assert.equal(Object.hasOwn(owned, "hidden"), true); assert.equal(Object.getOwnPropertyDescriptor(owned, "hidden").enumerable, true);
  const cycle = {}; cycle.self = cycle;
  for (const value of [cycle, undefined, NaN, Infinity, 1n, Symbol(), () => 1, new Date(), Object.create({})]) assert.throws(() => capture(value), TypeError);
  assert.throws(() => capture({ [Symbol("x")]: 1 }), { message: "Graph input cannot contain symbol fields" });
  const nil = Object.create(null); nil.x = 1; assert.deepEqual(capture(nil), { x: 1 });
});

test("A M7 JSON input: deep iterative capture remains stack-safe and freezes every level", () => {
  let input = { end: 1 }; for (let i = 0; i < 15000; i++) input = { child: input };
  let owned = capture(input), levels = 0;
  while (Object.hasOwn(owned, "child")) { assert.equal(Object.isFrozen(owned), true); owned = owned.child; levels++; }
  assert.equal(levels, 15000); assert.deepEqual(owned, { end: 1 }); assert.equal(Object.isFrozen(owned), true);
});

test("A M7 JSON input: QueryInput keeps opaque causes and disposal precedence at caller reads", () => {
  class InputError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const opaque = new Proxy({}, { get() { assert.fail("cause inspected"); }, ownKeys() { assert.fail("cause enumerated"); }, getPrototypeOf() { assert.fail("cause prototype read"); } });
  for (const release of [false, true]) {
    let disposed = false; const r = new QueryInput(InputError, "invalid_argument", "Graph", () => disposed);
    const input = { get x() { disposed = release; throw opaque; } };
    assert.throws(() => captureJSON(input, r, "Graph"), e => e instanceof InputError && e.code === (release ? "disposed" : "invalid_argument") && e.cause === opaque);
  }
});

test("A M7 JSON input: LayoutInput checks normal and exceptional caller returns without changing causes", () => {
  for (const throwing of [false, true]) {
    let disposed = false; const cause = { marker: "opaque" }, disposedError = new LayoutError("disposed", "closed");
    const r = new LayoutInput(() => { if (disposed) throw disposedError; });
    const input = { get x() { disposed = true; if (throwing) throw cause; return 1; } };
    assert.throws(() => r.capture(input), e => e === disposedError && (!throwing || e.cause === cause));
  }
});

test("A M7 JSON input: AnnotationLayer owns marks, rejects bad later input atomically and honors getter disposal", () => {
  const layer = new AnnotationLayer({ snapshotId: "s", id: "A", label: "A" });
  const input = [{ ref: "sig", mark: { color: "#001122", badge: "x" } }]; layer.set(input); const before = layer.state;
  input[0].mark.badge = "changed"; assert.equal(before.marks[0].mark.badge, "x"); frozen(before);
  assert.throws(() => layer.set([{ ref: "sig", mark: { badge: "new" } }, { ref: "bad", mark: { severity: false } }]), e => e.code === "invalid_argument");
  assert.equal(layer.state, before);
  const cause = { marker: "caller" }, disposing = [{ get ref() { layer.dispose(); throw cause; }, mark: {} }];
  assert.throws(() => layer.set(disposing), e => e.code === "disposed" && e.cause === cause);
  assert.equal(layer.state.status, "disposed"); assert.deepEqual(layer.state.marks, []);
});

test("A M7 JSON input: real GraphSession source, layout projection and fold factory share the owning boundary", async t => {
  const c = await sdk(t), graph = new GraphSession(c.client); c.models.push(graph);
  const source = graph.registerSource({ origin: "analysis", label: "A" });
  const input = { snapshotId: graph.snapshotId, nodes: [{ kind: "external", key: "x", label: "original", ports: [] }], edges: [], completeness: { status: "complete", reasons: [] }, frontier: [], hasConservative: false };
  await source.replace(input); input.nodes[0].label = "changed"; const state = graph.state; frozen(state);
  assert.equal(state.nodes[0].node.label, "original");
  const projection = { sessionId: state.sessionId, graphRevision: state.revision, direction: "RIGHT", nodes: state.nodes.map(n => ({ id: n.id, width: 100, height: 30, ports: [] })), edges: [] };
  const owned = readLayoutProjection(projection, state, () => {}); frozen(owned); projection.nodes[0].width = 200; assert.equal(owned.nodes[0].width, 100);
  const options = { groups: [], collapsed: [] }, folded = createFoldedGraphProjection(graph, options); frozen(folded.options); options.collapsed.push("bad"); assert.deepEqual(folded.options.collapsed, []);
  assert.equal(graph.state, state);
});
