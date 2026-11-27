import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const root = process.env.HIER_A_CLIENT_MODULE_ROOT;
const moduleUrl = (name) => root ? pathToFileURL(join(root, name + ".js"))
  : new URL(`../../packages/client/dist/${name}.js`, import.meta.url);
const { decodeWireText, decodeWireFrame } = await import(moduleUrl("wire-frame"));
const { validateWireDefinition, copyWireNumbers } = await import(moduleUrl("wire-numbers"));
const { jsonSnapshot } = await import(moduleUrl("json-snapshot"));
const diagnostics = (count, extra = "") => `{"id":1,"ok":true,"result":{"errorCount":${count},"warningCount":0,"truncated":false,"items":[]${extra}},"completeness":{"status":"complete","reasons":[]}}`;
const info = (ref, count) => `{"ref":"${ref}","name":"${ref}","path":["top","${ref}"],"pathText":"top.${ref}","kind":"module","def":"d","defName":"leaf","childCount":${count},"hasParamOverrides":false}`;
const children = (first, second) => `{"id":1,"ok":true,"result":{"items":[${info("a", first)},${info("b", second)}]},"completeness":{"status":"complete","reasons":[]}}`;

test("A M7 wire scan: unescaped values and escaped strings retain exact scalar values and ownership", () => {
  const text = '{"literal":"中文🙂 / : { } [ ]","escaped":"\\u4e2d\\u6587\\ud83d\\ude42\\u0000\\n\\t\\\\\\\"","empty":"","nested":["a:b",true,false,null,{"key":"value"}]}';
  const frame = decodeWireText(text); assert.deepEqual(frame, JSON.parse(text));
  assert.equal(frame.literal, "中文🙂 / : { } [ ]"); assert.equal(frame.escaped, '中文🙂\0\n\t\\"');
  const next = decodeWireText('{"literal":"other"}'); next.literal = "mutated";
  assert.equal(frame.literal, "中文🙂 / : { } [ ]");
});

test("A M7 wire scan: duplicate decoded keys reject at root, nested objects and arrays", () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"x":[{"key":"value","k\\u0065y":0}]}',
    '{"x":{"__proto__":1,"__proto__":2}}', '{"x":[{"中文":1,"\\u4e2d\\u6587":2}]}'])
    assert.throws(() => decodeWireText(text), { name: "SyntaxError", message: "Duplicate JSON object key" });
  const distinct = decodeWireText('{"é":1,"e\\u0301":2}'); assert.deepEqual(Object.values(distinct), [1, 2]);
});

test("A M7 wire scan: invalid scalars in every unknown key or value reject before schema omission", () => {
  for (const bad of ['\ud800', '\udc00', '\udc00\ud800', '\ud800x']) {
    for (const text of [`{"ignored":"${bad}"}`, `{"${bad}":null}`, `{"array":[{"unknown":"${bad}"}]}`])
      assert.throws(() => decodeWireText(text), { name: "TypeError", message: "Expected a Unicode scalar string" });
  }
  for (const text of ['{"ignored":"\\ud800"}', '{"\\udc00":0}', '{"x":["\\ud800x"]}'])
    assert.throws(() => decodeWireFrame(text), { name: "TypeError", message: "Expected a Unicode scalar string" });
  assert.equal(decodeWireText('{"x":"\\ud83d\\ude42"}').x, "🙂");
});

test("A M7 wire scan: full JSON grammar and object-root checks precede token inspection", () => {
  for (const text of ['{}x', '{"x":"\\q"}', '{"x":"unterminated}', '{"x":1,}', '{"x":"a\nb"}', '[1]', '1', 'null', ''])
    assert.throws(() => decodeWireText(text), { name: "SyntaxError" });
  assert.deepEqual(decodeWireText('{}'), {});
});

test("A M7 wire scan: exact integer spellings remain valid and rounded fractions retain method evidence", () => {
  for (const token of ['0', '-0', '0e999', '1', '1.0', '1e0', '10e-1', '0.1e1']) {
    const frame = decodeWireFrame(diagnostics(token)); assert.equal(validateWireDefinition("DesignDiagnosticsResponse", frame), true);
  }
  for (const token of ['1.0000000000000001', '0.99999999999999999', '1e-400', '-1e-400']) {
    const frame = decodeWireText(diagnostics(token)); assert.equal(validateWireDefinition("DesignDiagnosticsResponse", frame), false);
    assert.equal(typeof frame.result.errorCount, "number");
  }
});

test("A M7 wire scan: sparse numeric evidence keeps array indices and siblings independent", () => {
  for (const [a, b, valid] of [['0', '1.0', true], ['1.0000000000000001', '0', false], ['0', '1.0000000000000001', false]]) {
    const frame = decodeWireFrame(children(a, b)); assert.equal(validateWireDefinition("InstChildrenResponse", frame), valid);
    assert.equal(frame.result.items[0].ref, "a"); assert.equal(frame.result.items[1].ref, "b");
  }
  const frame = decodeWireText(diagnostics('1', ',"unknown":{"array":[null,true,"中文",{"rounded":1.0000000000000001}]},"sibling":{}'));
  assert.equal(validateWireDefinition("DesignDiagnosticsResponse", frame), true);
  assert.equal(frame.result.unknown.array[3].rounded, 1);
});

test("A M7 wire scan: lexical evidence survives the owning snapshot without changing delivered values", () => {
  const original = decodeWireText(children('0', '1.0000000000000001'));
  const snapshot = jsonSnapshot(original); copyWireNumbers(original, snapshot);
  assert.deepEqual(snapshot, original); assert.notEqual(snapshot.result.items, original.result.items);
  assert.equal(validateWireDefinition("InstChildrenResponse", snapshot), false);
  const ordinary = decodeWireText(children('0', '1')); assert.equal(validateWireDefinition("InstChildrenResponse", ordinary), true);
  assert.equal(validateWireDefinition("InstChildrenResponse", original), false);
});

test("A M7 wire scan: generic envelope numbers and escaped keys retain the established boundary", () => {
  for (const token of ['1.0000000000000001', '0.99999999999999999'])
    assert.throws(() => decodeWireFrame(diagnostics('0').replace('"id":1', `"id":${token}`)),
      { name: "SyntaxError", message: "Non-integer JSON token in a wire integer field" });
  const escaped = decodeWireText(diagnostics('1.0000000000000001').replace('"errorCount"', '"error\\u0043ount"'));
  assert.equal(validateWireDefinition("DesignDiagnosticsResponse", escaped), false);
});

test("A M7 wire scan: special keys are ordinary data and empty/sparse containers remain valid", () => {
  const frame = decodeWireText('{"__proto__":{"rounded":1.0000000000000001},"constructor":{"empty":[]},"array":[[],{},null,false,"plain",[1.0000000000000001]]}');
  assert.equal(Object.getPrototypeOf(frame), Object.prototype); assert.equal(Object.hasOwn(frame, "__proto__"), true);
  assert.deepEqual(frame.constructor, { empty: [] }); assert.deepEqual(frame.array.slice(0, 5), [[], {}, null, false, "plain"]);
  assert.equal(frame.array[5][0], 1);
});
