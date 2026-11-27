import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const root = process.env.HIER_A_CLIENT_MODULE_ROOT;
const moduleUrl = (name) => root ? pathToFileURL(join(root, name + ".js"))
  : new URL(`../../packages/client/dist/${name}.js`, import.meta.url);
const { assertScalarString } = await import(moduleUrl("unicode"));
const { decodeWireText } = await import(moduleUrl("wire-frame"));
const { jsonSnapshot } = await import(moduleUrl("json-snapshot"));
const invalid = (fn) => assert.throws(fn, { name: "TypeError", message: "Expected a Unicode scalar string" });

test("A M7 scalar check: every non-surrogate BMP code unit stays valid without normalization", () => {
  for (let start = 0; start < 0x10000; start += 256) {
    if (start >= 0xd800 && start < 0xe000) continue;
    const text = String.fromCharCode(...Array.from({ length: 256 }, (_, i) => start + i));
    assert.equal(assertScalarString(text), undefined);
    assert.equal(jsonSnapshot(text), text);
  }
  for (const text of ['', '\0', '\ufeff', '中文🙂', 'é', 'e\u0301', '\r\n\t', '\ufffe\uffff']) {
    assert.equal(assertScalarString(text), undefined); assert.equal(jsonSnapshot(text), text);
  }
});

test("A M7 scalar check: every lone surrogate rejects at either boundary and within ordinary text", () => {
  for (let unit = 0xd800; unit <= 0xdfff; unit++) {
    const lone = String.fromCharCode(unit);
    for (const text of [lone, 'a' + lone, lone + 'z', '中文' + lone + 'tail']) invalid(() => assertScalarString(text));
  }
});

test("A M7 scalar check: all high and low surrogate ranges pair correctly at their endpoints", () => {
  for (let high = 0xd800; high <= 0xdbff; high++) {
    for (const low of [0xdc00, 0xdc01, 0xdffe, 0xdfff])
      assert.equal(assertScalarString('a' + String.fromCharCode(high, low) + '\0'), undefined);
  }
  for (let low = 0xdc00; low <= 0xdfff; low++) {
    for (const high of [0xd800, 0xd801, 0xdbfe, 0xdbff])
      assert.equal(assertScalarString('\ufeff' + String.fromCharCode(high, low) + 'z'), undefined);
  }
});

test("A M7 scalar check: malformed adjacency cannot borrow a later or preceding surrogate", () => {
  for (const text of ['\udc00\ud800', '\ud800\ud800\udc00', '\ud800\udc00\udc00',
    '\ud800a\udc00', '🙂\ud800', '\udc00🙂', '🙂a\ud800z🙂']) invalid(() => assertScalarString(text));
  assert.equal(assertScalarString('🙂🙂\ud800\udc00\udbff\udfff'), undefined);
});

test("A M7 scalar check: wire values and unknown keys enforce raw and escaped scalar strings", () => {
  const text = '{"plain":"中文🙂\\n","escaped":"\\u4e2d\\u6587\\ud83d\\ude42","unknown":["\\u0000",{"e\\u0301":"é"}]}';
  assert.deepEqual(decodeWireText(text), JSON.parse(text));
  for (const bad of ['\ud800', '\udc00', '\udc00\ud800']) {
    for (const value of [`{"unknown":"${bad}"}`, `{"${bad}":null}`, `{"array":[{"unknown":"${bad}"}]}`])
      invalid(() => decodeWireText(value));
  }
  for (const value of ['{"unknown":"\\ud800"}', '{"\\udc00":0}', '{"array":["\\ud800x"]}'])
    invalid(() => decodeWireText(value));
});

test("A M7 scalar check: snapshot keys precede descendant reads and values remain independently owned", () => {
  const events = [], value = { get child() { events.push('parent'); return { get text() { events.push('child'); return 'value'; } }; } };
  Object.defineProperty(value, '\ud800', { enumerable: true, get() { events.push('invalid-key'); return undefined; } });
  invalid(() => jsonSnapshot(value)); assert.deepEqual(events, ['parent', 'invalid-key']);
  const original = { text: 'e\u0301\0🙂', array: [{ text: '中文' }] }, copy = jsonSnapshot(original);
  assert.deepEqual(copy, original); assert.notEqual(copy.array, original.array); copy.array[0].text = 'changed';
  assert.equal(original.array[0].text, '中文'); assert.equal(copy.text, 'e\u0301\0🙂');
  invalid(() => jsonSnapshot({ unknown: ['\ud800'] }));
});

test("A M7 scalar check: complete JSON grammar still wins over scalar checks", () => {
  for (const text of ['{"x":"\ud800",}', '{"x":"\\q"}', '["\ud800"]', '{"x":"\ud800"} trailing'])
    assert.throws(() => decodeWireText(text), { name: 'SyntaxError' });
  assert.throws(() => decodeWireText('{"x":0,"x":"\ud800"}'), { name: 'SyntaxError', message: 'Duplicate JSON object key' });
});

test("A M7 scalar check: alternating failures do not affect later values or retained frame snapshots", () => {
  const frame = decodeWireText('{"text":"中文🙂","combining":"e\\u0301","nul":"\\u0000"}');
  const retained = JSON.stringify(frame);
  for (let i = 0; i < 40; i++) {
    invalid(() => assertScalarString(i % 2 ? '\ud800' : '\udc00'));
    assert.equal(assertScalarString('中文🙂\0' + i), undefined);
    assert.deepEqual(decodeWireText(retained), frame);
  }
  assert.equal(JSON.stringify(frame), retained);
});
