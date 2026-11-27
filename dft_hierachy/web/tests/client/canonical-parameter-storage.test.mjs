import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const root = process.env.HIER_A_PROTOCOL_MODULE_ROOT;
const { canonicalParams, validateDefinition } = await import(root
  ? pathToFileURL(join(root, "validation.js"))
  : new URL("../../packages/protocol-types/dist/validation.js", import.meta.url));
const { METHODS } = await import("@hier/protocol-types");
const { HierClient } = await import("@hier/client");
const slice = () => ({ ref: "s:0", bits: { width: 4, lsb: 0 } });
const sliceJSON = '{"bits":{"lsb":0,"width":4},"ref":"s:0"}';
const budgetJSON = '{"maxDepth":64,"maxEdges":4000,"maxNodes":1000}';
const cases = [
  ["design.info", {}, '{}'], ["design.diagnostics", {}, '{"maxItems":200}'],
  ["design.checkInputs", {}, '{}'], ["inst.roots", {}, '{}'],
  ["inst.children", { inst: "i:0" }, '{"cursor":"","inst":"i:0","limit":200}'],
  ...["inst.ancestors", "inst.get", "inst.ports", "inst.params"].map(method => [method, { inst: "i:0" }, '{"inst":"i:0"}']),
  ["inst.signals", { inst: "i:0" }, '{"cursor":"","filter":{"text":""},"inst":"i:0","limit":200}'],
  ["def.list", {}, '{"cursor":"","limit":200}'],
  ["def.instances", { def: "d:0" }, '{"cursor":"","def":"d:0","limit":200}'],
  ["search", { text: "中文🙂", scope: "i:0", kinds: ["signal", "port"] }, '{"cursor":"","kinds":["signal","port"],"limit":200,"scope":"i:0","text":"中文🙂"}'],
  ["path.resolve", { text: "top.u" }, '{"text":"top.u"}'],
  ["conn.bindings", { inst: "i:0" }, '{"inst":"i:0"}'],
  ...["conn.drivers", "conn.loads"].map(method => [method, { slice: slice(), reach: "local" }, `{"reach":"local","slice":${sliceJSON}}`]),
  ["conn.step", { from: slice(), direction: "back" }, `{"cursor":"","direction":"back","from":${sliceJSON},"maxHops":1000}`],
  ["trace.cone", { start: { slice: slice() }, direction: "back", policy: "structural" }, `{"budget":${budgetJSON},"direction":"back","policy":"structural","start":{"slice":${sliceJSON}}}`],
  ["trace.paths", { from: { slice: slice() }, to: { slice: slice(), side: "outside" } }, `{"budget":${budgetJSON},"from":{"slice":${sliceJSON}},"to":{"side":"outside","slice":${sliceJSON}}}`],
  ["seq.registers", { inst: "i:0" }, '{"cursor":"","inst":"i:0","limit":200,"recursive":false}'],
  ["proc.list", { inst: "i:0" }, '{"cursor":"","inst":"i:0","limit":200}'],
  ...["proc.get", "obj.get"].map(method => [method, { ref: "s:0" }, '{"ref":"s:0"}']),
  ["obj.source", { ref: "s:0", kind: "statement" }, '{"kind":"statement","ref":"s:0"}'],
  ["source.resolve", { line: 1, file: "f:0", col: 2 }, '{"col":2,"cursor":"","file":"f:0","limit":200,"line":1}'],
  ["source.read", { file: "f:0" }, '{"file":"f:0"}'],
];

test("A M7 canonical storage: all27 methods retain hand-written defaults and exact key order", () => {
  assert.deepEqual(cases.map(([m]) => m).sort(), Object.keys(METHODS).sort());
  for (const [method, input, expected] of cases) {
    assert.equal(validateDefinition(METHODS[method].params, input), true, method);
    const actual = canonicalParams(method, input);
    assert.equal(JSON.stringify(actual), expected, method);
    assert.equal(validateDefinition(METHODS[method].params, actual), true, method);
  }
});

test("A M7 canonical storage: default objects and explicit nested arrays are fresh on every call", () => {
  const input = { start: { slice: slice() }, direction: "back", policy: "full" };
  const a = canonicalParams("trace.cone", input), b = canonicalParams("trace.cone", input);
  assert.notEqual(a.budget, b.budget); a.budget.maxNodes = 1;
  assert.deepEqual(b.budget, { maxDepth: 64, maxEdges: 4000, maxNodes: 1000 });
  assert.notEqual(a.start, input.start); assert.notEqual(a.start.slice.bits, input.start.slice.bits);
  const kinds = ["signal", "port"], c = canonicalParams("search", { text: "x", kinds });
  assert.notEqual(c.kinds, kinds); c.kinds.reverse(); assert.deepEqual(kinds, ["signal", "port"]);
  assert.equal(Object.isFrozen(a), false); assert.equal(Object.isFrozen(a.budget), false);
});

test("A M7 canonical storage: explicit defaults, undefined optionals and extension omission agree", () => {
  const a = canonicalParams("inst.signals", { inst: "i:0", filter: undefined, cursor: undefined, limit: undefined });
  const b = canonicalParams("inst.signals", { limit: 200, inst: "i:0", cursor: "", filter: { text: "", ignored: true }, ignored: 1 });
  assert.equal(JSON.stringify(a), '{"cursor":"","filter":{"text":""},"inst":"i:0","limit":200}');
  assert.deepEqual(a, b);
  const c = canonicalParams("conn.drivers", { slice: slice(), reach: "hier", side: undefined });
  assert.equal(Object.hasOwn(c, "side"), false);
});

test("A M7 canonical storage: supported property reads remain sorted, recursive and once", () => {
  const reads = []; let direction = "back";
  const input = {
    get start() { reads.push("start"); return { get slice() { reads.push("slice"); return slice(); } }; },
    get policy() { reads.push("policy"); return "structural"; },
    get direction() { reads.push("direction"); return direction; },
    get budget() { reads.push("budget"); return { get maxNodes() { reads.push("maxNodes"); return 10; }, get maxDepth() { reads.push("maxDepth"); direction = "forward"; return 1; }, get maxEdges() { reads.push("maxEdges"); return 20; } }; },
    get ignored() { assert.fail("unknown field read"); },
  };
  const result = canonicalParams("trace.cone", input);
  assert.deepEqual(reads, ["budget", "maxDepth", "maxEdges", "maxNodes", "direction", "policy", "start", "slice"]);
  assert.equal(result.direction, "forward"); assert.deepEqual(result.budget, { maxDepth: 1, maxEdges: 20, maxNodes: 10 });
});

test("A M7 canonical storage: abrupt completion preserves exception identity and next-call defaults", () => {
  const cause = new Error("caller getter");
  assert.throws(() => canonicalParams("inst.signals", { inst: "i:0", get filter() { throw cause; } }), e => e === cause);
  assert.deepEqual(canonicalParams("inst.signals", { inst: "i:0" }).filter, { text: "" });
  const original = Object.create(null); original.inst = "i:0";
  assert.equal(Object.getPrototypeOf(canonicalParams("inst.ports", original)), Object.prototype);
});

test("A M7 canonical storage: arrays keep map order, sparse slots and repeated-query isolation", () => {
  const kinds = ["signal", , "port"];
  const result = canonicalParams("search", { text: "x", kinds });
  assert.equal(result.kinds.length, 3); assert.equal(1 in result.kinds, false);
  for (let i = 0; i < 100; i++) {
    const input = { text: "x", kinds: i % 2 ? ["port", "signal"] : ["signal", "port"] };
    assert.deepEqual(canonicalParams("search", input).kinds, input.kinds);
  }
});

test("A M7 canonical storage: frozen JSON input retains values without mutation or aliasing", () => {
  const bits = Object.freeze({ width: 4, lsb: 0, ignored: "x" });
  const input = Object.freeze({ slice: Object.freeze({ ref: "s:0", bits }), reach: "local", side: "inside" });
  const output = canonicalParams("conn.loads", input);
  assert.equal(JSON.stringify(output), `{"reach":"local","side":"inside","slice":${sliceJSON}}`);
  output.slice.bits.width = 8; assert.equal(bits.width, 4);
});

test("A M7 canonical SDK: equivalent defaults merge, ordered arrays differ and unknown Unicode still rejects", async t => {
  const transport = { sent: [], handler: undefined, send(v) { this.sent.push(v); }, onMessage(h) { this.handler = h; return () => { this.handler = undefined; }; }, onClose() { return () => {}; }, close() {}, deliver(v) { queueMicrotask(() => this.handler?.(v)); } };
  const client = new HierClient(transport); t.after(() => client.dispose());
  const snapshot = { protocol: 2, schemaVersion: 7, frontend: { name: "slang", version: "A-canonical" }, snapshotId: "canonical", inputHash: "0".repeat(64), inputHashComplete: true, bodySharing: "fast", tops: [], definitionCount: 0, bodyCount: 0, indexState: "ready", openedAt: "2026-01-01T00:00:00.000Z", topCandidates: [] };
  transport.deliver({ event: "hello", protocol: 2, snapshot, capabilities: ["cancel", "progress"] }); await client.ready;
  const controller = new AbortController(), a = client.signals("i:0", {}, controller.signal);
  const b = client.signals("i:0", { limit: 200, cursor: "", filter: { text: "" } });
  assert.equal(transport.sent.length, 1); const rejected = assert.rejects(a, { code: "cancelled" }); controller.abort(); await rejected;
  assert.equal(transport.sent.length, 1);
  transport.deliver({ id: transport.sent[0].id, ok: true, result: { items: [] }, completeness: { status: "complete", reasons: [] } }); await b;
  const kinds = ["signal", "port"], c = client.search({ text: "x", kinds }), d = client.search({ text: "x", kinds: ["port", "signal"] }); kinds.reverse();
  assert.equal(transport.sent.length, 3); assert.deepEqual(transport.sent[1].params.kinds, ["signal", "port"]);
  for (const frame of transport.sent.slice(1)) transport.deliver({ id: frame.id, ok: true, result: { items: [] }, completeness: { status: "complete", reasons: [] } });
  await Promise.all([c, d]); const count = transport.sent.length;
  await assert.rejects(client.signals("i:0", { ignored: "\ud800" }), { code: "bad_request" });
  assert.equal(transport.sent.length, count);
});
