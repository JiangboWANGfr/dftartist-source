import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.HIER_A_CLIENT_MODULE_ROOT;
const url = name => root ? pathToFileURL(join(root, name + ".js"))
  : new URL(`../../packages/client/dist/${name}.js`, import.meta.url);
const copyModule = await import(url("json-snapshot"));
// The baseline is the actual old copy+freeze composition, not a mock implementation.
const frozenCopy = copyModule.frozenJsonSnapshot ?? (value => copyModule.deepFreeze(copyModule.jsonSnapshot(value)));
const { HierClient, isHierError } = await import(url("index"));
const { connectElectronTransport } = await import(url("electron/renderer"));
function frozen(value) {
  if (value && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) frozen(child);
  }
}

test("A M7 frozen copy: owned values and descriptors are deeply frozen without freezing originals", () => {
  const source = JSON.parse('{"__proto__":{"value":"位🙂"},"nested":{"items":[{"value":1}]}}');
  source.zero = -0; source.omit = undefined;
  const result = frozenCopy(source); frozen(result);
  assert.ok(Object.is(result.zero, -0)); assert.equal(Object.hasOwn(result, "omit"), false);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(result.__proto__, { value: "位🙂" }); assert.equal(Object.hasOwn(result, "__proto__"), true);
  assert.equal(Object.isFrozen(source), false); assert.equal(Object.isFrozen(source.nested.items[0]), false);
  source.nested.items[0].value = 2; assert.equal(result.nested.items[0].value, 1);
  assert.throws(() => { result.nested.items[0].value = 3; }, TypeError);
  assert.deepEqual(Object.getOwnPropertyDescriptor(result, "nested"), { value: result.nested, enumerable: true, configurable: false, writable: false });
});

test("A M7 frozen copy: parent capture, omitted key validation and descendant order stay intact", () => {
  const events = [], child = { get value() { events.push("child"); return 1; } };
  const source = { get first() { events.push("first"); return child; }, get omit() { events.push("omit"); return undefined; }, get last() { events.push("last"); return 2; } };
  assert.deepEqual(frozenCopy(source), { first: { value: 1 }, last: 2 });
  assert.deepEqual(events, ["first", "omit", "last", "child"]);
  events.length = 0;
  Object.defineProperty(source, "\ud800", { enumerable: true, get() { events.push("bad"); return undefined; } });
  assert.throws(() => frozenCopy(source), { name: "TypeError", message: "Expected a Unicode scalar string" });
  assert.deepEqual(events, ["first", "omit", "last", "bad"]);
  assert.equal(Object.isFrozen(child), false);
});

test("A M7 frozen copy: captured siblings, shared originals and array iterators keep old semantics", () => {
  let later = 1, visits = 0; const shared = { get value() { visits++; return visits; } };
  const array = [0]; array[Symbol.iterator] = function* () { yield shared; yield { value: "🙂" }; };
  const source = { child: { get value() { later = 2; return 1; } }, get later() { return later; }, a: shared, b: shared, array };
  const result = frozenCopy(source); frozen(result);
  assert.equal(result.later, 1); assert.equal(later, 2);
  assert.deepEqual([result.a.value, result.b.value, result.array[0].value], [1, 2, 3]);
  assert.notEqual(result.a, result.b); assert.notEqual(result.b, result.array[0]);
  assert.deepEqual(array.slice(), [0]); assert.equal(Object.isFrozen(array), false);
});

test("A M7 frozen copy: rejects cycles, lossy values and bad prototypes while keeping exception identity", () => {
  const cycle = { nested: {} }; cycle.nested.parent = cycle;
  for (const value of [cycle, undefined, NaN, Infinity, 1n, Symbol(), () => 1, new Date(0), Object.create({}), [undefined], Array(1), "\ud800"])
    assert.throws(() => frozenCopy(value), TypeError);
  const marker = Object.freeze({ thrown: true });
  assert.throws(() => frozenCopy({ a: {}, b: { get value() { throw marker; } } }), error => error === marker);
  assert.deepEqual(frozenCopy({ after: { value: true } }), { after: { value: true } });
});

test("A M7 frozen copy: proxy values are captured once and ignored symbols never run", () => {
  const gets = [], descriptors = [], target = { a: { get child() { gets.push("child"); return "位"; } }, b: undefined, c: 2 };
  Object.defineProperty(target, Symbol("ignored"), { enumerable: true, get() { assert.fail("symbol getter"); } });
  const source = new Proxy(target, {
    get(object, key, receiver) { gets.push(key); return Reflect.get(object, key, receiver); },
    getOwnPropertyDescriptor(object, key) { descriptors.push(key); return Reflect.getOwnPropertyDescriptor(object, key); },
  });
  const result = frozenCopy(source); frozen(result);
  assert.deepEqual(gets, ["a", "b", "c", "child"]); assert.deepEqual(descriptors, ["a", "b", "c"]);
  assert.deepEqual(result, { a: { child: "位" }, c: 2 });
});

const snapshot = { protocol: 2, schemaVersion: 7, frontend: { name: "slang", version: "A-frozen" }, snapshotId: "frozen", inputHash: "0".repeat(64), inputHashComplete: true, bodySharing: "fast", tops: [], definitionCount: 0, bodyCount: 0, indexState: "ready", openedAt: "2026-01-01T00:00:00.000Z", topCandidates: [] };
const complete = { status: "complete", reasons: [] };
class InputTransport {
  sent = []; closed = false; handler;
  send(value) { this.sent.push(value); }
  onMessage(handler) { this.handler = handler; return () => { this.handler = undefined; }; }
  onClose() { return () => {}; }
  close() { this.closed = true; }
  deliver(value) { queueMicrotask(() => this.handler?.(value)); }
}
async function setup(t) {
  const transport = new InputTransport(), client = new HierClient(transport);
  t.after(() => client.dispose());
  transport.deliver({ event: "hello", protocol: 2, snapshot, capabilities: ["cancel", "progress"] });
  await client.ready; return { client, transport };
}

test("A M7 frozen SDK: snapshots, extension results, deduplicated cached replies and errors own frozen data", async t => {
  const { client, transport } = await setup(t); frozen(client.snapshot);
  assert.equal(Object.isFrozen(snapshot), false);
  const pending = client.diagnostics({ maxItems: 1 });
  const result = { errorCount: 0, warningCount: 0, truncated: false, items: [], extension: { items: [{ value: "original" }] } };
  const source = { id: transport.sent.at(-1).id, ok: true, result, completeness: complete };
  transport.deliver(source); const reply = await pending; frozen(reply);
  result.extension.items[0].value = "changed"; assert.equal(reply.result.extension.items[0].value, "original");
  assert.equal(Object.isFrozen(source), false); assert.equal(Object.isFrozen(complete), false);
  const first = client.ports("i:0"), second = client.ports("i:0"), count = transport.sent.length;
  transport.deliver({ id: transport.sent.at(-1).id, ok: true, result: [], completeness: complete });
  const [a, b] = await Promise.all([first, second]); frozen(a); assert.equal(a, b); assert.equal(await client.ports("i:0"), a); assert.equal(transport.sent.length, count);
  const failed = client.roots(), data = { nested: { values: ["cause"] } };
  transport.deliver({ id: transport.sent.at(-1).id, ok: false, error: { code: "internal", message: "original", data } });
  await assert.rejects(failed, error => { assert.equal(isHierError(error), true); assert.equal(error.origin, "core"); frozen(error.data); data.nested.values[0] = "changed"; assert.equal(error.data.nested.values[0], "cause"); return true; });
  client.dispose(); frozen(reply); assert.equal(reply.result.extension.items[0].value, "original");
});

test("A M7 frozen SDK: invalid extension values still fail before schema omission and close pending work", async t => {
  const { client, transport } = await setup(t), pending = client.roots();
  const rejected = assert.rejects(pending, { code: "protocol_error" });
  transport.deliver({ id: transport.sent.at(-1).id, ok: true, result: [], completeness: complete, extension: { invalid: "\ud800" } });
  await rejected; assert.equal(transport.closed, true);
});

test("A M7 frozen renderer: rejected connect and first closed DTO preserve owned frozen data and error identity", async () => {
  for (const rejection of [true, false]) {
    let receive, caught; const calls = [], data = { nested: { values: ["original"] } };
    const error = { code: "internal", origin: "core", message: "original", data, get stack() { assert.fail("undeclared stack"); } };
    const bridge = { version: 1, connect(handler) { receive = handler; return Promise.resolve(rejection ? { ok: false, error } : { ok: true, version: 1, sessionId: "frozen" }); }, start() {}, send() {}, close() { calls.push("close"); }, release() { calls.push("release"); } };
    if (rejection) await assert.rejects(connectElectronTransport(bridge), value => { caught = value; return true; });
    else {
      const transport = await connectElectronTransport(bridge);
      const closed = new Promise(done => transport.onClose(done));
      receive({ version: 1, sessionId: "frozen", kind: "closed", error }); caught = await closed; transport.close();
    }
    assert.equal(isHierError(caught), true); assert.equal(caught.code, "internal"); frozen(caught.data);
    assert.equal(Object.isFrozen(data), false); data.nested.values[0] = "changed"; assert.equal(caught.data.nested.values[0], "original");
    assert.deepEqual(calls, rejection ? [] : ["release"]);
  }
});
