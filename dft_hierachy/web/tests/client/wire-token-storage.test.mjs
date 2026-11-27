import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const root = process.env.HIER_A_CLIENT_MODULE_ROOT;
const url = (name) => root ? pathToFileURL(join(root, name + ".js"))
  : new URL(`../../packages/client/dist/${name}.js`, import.meta.url);
const { decodeWireText, decodeWireFrame } = await import(url("wire-frame"));
const { validateWireDefinition, copyWireNumbers } = await import(url("wire-numbers"));
const { frozenJsonSnapshot } = await import(url("json-snapshot"));
const { NdjsonReader } = await import(url("node/ndjson"));
const duplicate = { name: "SyntaxError", message: "Duplicate JSON object key" };
const scalar = { name: "TypeError", message: "Expected a Unicode scalar string" };
const fields = (n) => Array.from({ length: n }, (_, i) => `"k${i}":${i}`).join(",");
const diagnostics = (token, extra = "") => `{"id":1,"ok":true,"result":{${extra}"errorCount":${token},"warningCount":0,"truncated":false,"items":[]},"completeness":{"status":"complete","reasons":[]}}`;

test("A M7 token storage: quote candidates preserve odd and even backslash runs", () => {
  for (let n = 0; n <= 80; n++) {
    const value = "\\".repeat(n) + '"colon:brace{}[],' + "\\".repeat(80 - n);
    const text = JSON.stringify({ [value]: [value, "", '"', "\\", { after: value }] });
    assert.deepEqual(decodeWireText(text), JSON.parse(text));
  }
});

test("A M7 token storage: long scalar source text and escape-heavy controls remain exact", () => {
  for (const unit of ['module m; wire a; endmodule\n', '中文🙂éé{}[]:\n', '"\\\t\n\0']) {
    const text = JSON.stringify({ unknown: unit.repeat(30000), tail: [true, false, null, 1] });
    assert.deepEqual(decodeWireFrame(text), JSON.parse(text));
  }
});

test("A M7 token storage: all legal JSON whitespace and nested key contexts survive", () => {
  for (const ws of [" ", "\t", "\r", "\n", " \t\r\n"]) {
    const text = `{${ws}"x"${ws}:${ws}["value", {"y"${ws}:"end"}],"z":{}}${ws}`;
    assert.deepEqual(decodeWireText(text), { x: ["value", { y: "end" }], z: {} });
  }
  assert.throws(() => decodeWireText('{"x"\u00a0:1}'), { name: "SyntaxError" });
});

test("A M7 token storage: decoded duplicates reject before and after small-key promotion", () => {
  for (const n of [1, 11, 12, 13, 14, 64, 256]) {
    for (const i of [0, Math.floor(n / 2), n - 1]) {
      const key = `k${i}`.replace("k", "\\u006b");
      for (const wrap of [(v) => v, (v) => `{"array":[${v}]}`])
        assert.throws(() => decodeWireText(wrap(`{${fields(n)},"${key}":null}`)), duplicate);
    }
    assert.equal(Object.keys(decodeWireText(`{${fields(n)}}`)).length, n);
  }
});

test("A M7 token storage: special keys and normalization remain ordinary distinct JSON data", () => {
  const text = `{${fields(14)},"__proto__":{"x":1},"constructor":2,"\\u0000":3,"é":4,"e\\u0301":5,"0":6}`;
  const frame = decodeWireText(text);
  assert.deepEqual(frame, JSON.parse(text)); assert.equal(Object.getPrototypeOf(frame), Object.prototype);
  assert.equal(Object.hasOwn(frame, "__proto__"), true); assert.equal(frame["\0"], 3);
  for (const key of ["__proto__", "constructor", "\\u0000", "0"])
    assert.throws(() => decodeWireText(text.slice(0, -1) + `,"${key}":9}`), duplicate);
});

test("A M7 token storage: grammar, unknown scalars and duplicate errors keep source order", () => {
  assert.throws(() => decodeWireText('{"x":"\\ud800","x":"ok"}'), scalar);
  assert.throws(() => decodeWireText('{"x":0,"x":"\\ud800"}'), duplicate);
  assert.throws(() => decodeWireText('{"x":"\\ud800","x":"ok",}'), { name: "SyntaxError" });
  assert.throws(() => decodeWireText(`{${fields(13)},"\\udc00":0}`), scalar);
  assert.throws(() => decodeWireText(`{${fields(13)},"ignored":["\ud800"]}`), scalar);
});

test("A M7 token storage: promotion preserves sparse number evidence and owning frozen snapshots", () => {
  for (const n of [0, 12, 13, 64]) {
    const extra = n ? fields(n) + "," : "";
    for (const [token, valid] of [["1.0", true], ["1.0000000000000001", false], ["1e-400", false]]) {
      const frame = decodeWireText(diagnostics(token, extra));
      assert.equal(validateWireDefinition("DesignDiagnosticsResponse", frame), valid);
      const copy = frozenJsonSnapshot(frame); copyWireNumbers(frame, copy);
      assert.equal(validateWireDefinition("DesignDiagnosticsResponse", copy), valid);
      assert.deepEqual(copy, frame); assert.equal(Object.isFrozen(copy.result), true);
    }
    const ignored = decodeWireText(diagnostics("0", `${extra}"unknown":[{},[1.0000000000000001]],`));
    assert.equal(validateWireDefinition("DesignDiagnosticsResponse", ignored), true);
  }
  assert.throws(() => decodeWireFrame(diagnostics("0").replace('"id":1', '"id":1.0000000000000001')),
    { name: "SyntaxError", message: "Non-integer JSON token in a wire integer field" });
});

test("A M7 token storage: every UTF-8 split and CRLF retains token facts through the reader", () => {
  const value = { source: '中文🙂"\\\n{}[]:', nested: JSON.parse(`{${fields(14)}}`) };
  const text = JSON.stringify(value), bytes = Buffer.from(text + "\r\n{}");
  for (let split = 0; split < bytes.length - 2; split++) {
    const reader = new NdjsonReader(), seen = [];
    const emit = (v, count, raw) => { seen.push(v); assert.equal(count, Buffer.byteLength(raw)); return false; };
    reader.feed(bytes.subarray(0, split), emit, () => true);
    reader.feed(bytes.subarray(split), emit, () => true);
    assert.deepEqual(seen, [value]); assert.equal(reader.pendingBytes, 0); reader.finish();
  }
  const reader = new NdjsonReader();
  assert.throws(() => reader.feed(Buffer.from(`{${fields(13)},"k0":1}\n`), () => true, () => true), duplicate);
  assert.equal(reader.pendingBytes, 0);
});
